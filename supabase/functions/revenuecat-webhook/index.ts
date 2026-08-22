import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmac } from "https://deno.land/x/crypto@v0.3.0/mod.ts";

serve(async (req) => {
  try {
    const signature = req.headers.get('x-revenuecat-signature')
    const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
    
    if (!signature || !secret) {
      return new Response('Missing signature or secret', { status: 401 })
    }

    const payloadText = await req.text()
    
    // RevenueCat SHA512 signature validation
    const expectedSignature = await hmac(
      "sha512",
      new TextEncoder().encode(secret),
      new TextEncoder().encode(payloadText),
      "hex"
    );

    if (expectedSignature !== signature) {
      return new Response('Invalid signature', { status: 403 })
    }

    const payload = JSON.parse(payloadText)
    const event = payload.event

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Durably insert the event to prevent duplicate processing via UNIQUE event_id
    const { error: insertError } = await supabaseAdmin
      .from('subscription_webhook_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        app_user_id: event.app_user_id,
        event_timestamp: event.event_timestamp_ms,
        payload: payload,
      })

    if (insertError) {
      if (insertError.code === '23505') { // Unique violation
        // Already processed / duplicate event, acknowledge safely
        return new Response('Duplicate event acknowledged', { status: 200 })
      }
      throw new Error(`DB Insert Error: ${insertError.message}`)
    }

    // 2. Fetch the user's current premium state
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('premium_updated_at')
      .eq('id', event.app_user_id)
      .single()

    // 3. Ordering check: If this event is older than our latest known state, drop it safely
    if (profile && profile.premium_updated_at >= event.event_timestamp_ms) {
       await supabaseAdmin.from('subscription_webhook_events').update({
           processing_status: 'skipped_stale',
           processed_at: new Date().toISOString()
       }).eq('event_id', event.id)
       return new Response('Stale event skipped', { status: 200 })
    }

    // 4. Determine new entitlement
    let newEntitlement = 'free';
    if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
      newEntitlement = event.product_id.includes('pro') ? 'pro' : 'plus';
    }

    // 5. Transactional Update (Update Profile & mark event processed)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        premium_entitlement: newEntitlement,
        premium_updated_at: event.event_timestamp_ms
      })
      .eq('id', event.app_user_id)

    if (!updateError) {
       await supabaseAdmin.from('subscription_webhook_events').update({
           processing_status: 'processed',
           processed_at: new Date().toISOString()
       }).eq('event_id', event.id)
    } else {
        throw new Error('Failed to update profile entitlement')
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error(error)
    // Return 500 so RevenueCat retries later
    return new Response('Internal Server Error', { status: 500 })
  }
})
