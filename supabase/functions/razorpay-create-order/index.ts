import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    const { amount, currency = 'INR', receipt } = await req.json()

    if (!amount || amount < 100) {
      throw new Error('Minimum amount is 1 INR (100 paise)')
    }

    // Call Razorpay API
    const key_id = Deno.env.get('RAZORPAY_KEY_ID')
    const key_secret = Deno.env.get('RAZORPAY_KEY_SECRET')
    
    if (!key_id || !key_secret) {
      throw new Error('Razorpay credentials missing on server')
    }

    const auth = btoa(`${key_id}:${key_secret}`)
    
    const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount, // amount in the smallest currency unit (e.g., paise)
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
      })
    })
    
    const rpData = await rpRes.json()
    
    if (!rpRes.ok) {
      throw new Error(rpData.error?.description || 'Failed to create order')
    }

    return new Response(JSON.stringify(rpData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
