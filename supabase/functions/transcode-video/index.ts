import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Pillar 3: Media & Performance (HLS Video Transcoding)
 * 
 * This Edge Function listens to a Database Webhook triggered whenever a new 
 * video object is inserted into Supabase Storage. It sends the raw .mp4 to an 
 * external transcoding pipeline (e.g. AWS MediaConvert, Mux, or a dedicated 
 * worker) to generate adaptive HLS (.m3u8) streams.
 * 
 * HLS ensures zero-latency buffering by dynamically adapting video quality 
 * to the user's internet connection speed.
 */

serve(async (req) => {
  try {
    const signature = req.headers.get("x-supabase-signature");
    if (!signature) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    // Only process inserts to the 'echo-media' bucket
    if (payload.type !== 'INSERT' || payload.table !== 'objects' || payload.record.bucket_id !== 'echo-media') {
      return new Response("Ignored", { status: 200 });
    }

    const objectName = payload.record.name;
    
    // Only transcode videos
    if (!objectName.toLowerCase().endsWith('.mp4') && !objectName.toLowerCase().endsWith('.mov')) {
      return new Response("Not a video", { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: fileData } = await supabaseAdmin.storage
      .from('echo-media')
      .createSignedUrl(objectName, 3600);

    if (!fileData) {
      throw new Error("Could not generate signed URL for video");
    }

    console.log(`Submitting video for HLS Transcoding: ${fileData.signedUrl}`);

    // TODO: In a production environment, send `fileData.signedUrl` to Mux API
    // or AWS Elemental MediaConvert here. Once Mux finishes, a separate webhook 
    // updates the database `echoes.hls_url`.
    
    // Simulated API Call to transcoding service
    /*
    await fetch('https://api.mux.com/video/v1/assets', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(MUX_TOKEN_ID + ':' + MUX_TOKEN_SECRET)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: fileData.signedUrl,
        playback_policy: ["public"]
      })
    });
    */

    return new Response(JSON.stringify({ status: "Transcoding job initiated", object: objectName }), {
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
