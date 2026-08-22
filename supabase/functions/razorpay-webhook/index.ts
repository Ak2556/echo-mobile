import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmac } from "https://deno.land/x/crypto@v0.3.0/mod.ts";

serve(async (req) => {
  try {
    const signature = req.headers.get('X-Razorpay-Signature')
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
    
    if (!signature || !secret) {
      return new Response('Missing signature or secret', { status: 400 })
    }

    const payload = await req.text()
    
    // Verify signature
    const expectedSignature = await hmac(
      "sha256",
      new TextEncoder().encode(secret),
      new TextEncoder().encode(payload),
      "hex"
    );

    if (expectedSignature !== signature) {
      return new Response('Invalid signature', { status: 400 })
    }

    const event = JSON.parse(payload)

    // We need service role to bypass RLS and update the ad status
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      // payment entity
      const payment = event.payload.payment.entity
      const order_id = payment.order_id

      // Activate the ad!
      const { error } = await supabaseAdmin
        .from('ads')
        .update({ payment_status: 'paid', is_active: true })
        .eq('razorpay_order_id', order_id)

      if (error) {
        console.error('Failed to update ad:', error)
        return new Response('Database error', { status: 500 })
      }
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error(error)
    return new Response('Error handling webhook', { status: 400 })
  }
})
