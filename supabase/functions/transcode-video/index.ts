import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Pillar 3: Media & Performance (HLS Video Transcoding)
 * 
 * This Edge Function listens to a Database Webhook triggered whenever a new 
 * Echo is inserted containing a .mp4 media URL. It sends the raw .mp4 to an 
 * external transcoding pipeline to generate adaptive HLS (.m3u8) streams.
 * 
 * Simulated here: it updates the echo's `hls_url` with a mocked .m3u8 path.
 */

serve(async (req) => {
  try {
    const signature = req.headers.get("x-supabase-signature");
    if (!signature) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (payload.type !== 'INSERT' || payload.table !== 'public_echoes') {
      return new Response("Ignored", { status: 200 });
    }

    const echoId = payload.record.id;
    const mediaUrls = payload.record.media_urls || [];
    const firstMedia = mediaUrls[0];
    
    if (!firstMedia || (!firstMedia.toLowerCase().endsWith('.mp4') && !firstMedia.toLowerCase().endsWith('.mov'))) {
      return new Response("Not a video", { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log(`Submitting video for HLS Transcoding: ${firstMedia}`);

    // Simulate API Call to transcoding service (e.g. Mux)
    // and instantly resolve it by writing back an hls_url
    const simulatedHlsPath = firstMedia.replace('.mp4', '.m3u8').replace('.mov', '.m3u8');
    
    await supabaseAdmin
      .from('public_echoes')
      .update({ hls_url: simulatedHlsPath })
      .eq('id', echoId);

    return new Response(JSON.stringify({ status: "Transcoding job initiated", echo: echoId, hls_url: simulatedHlsPath }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
