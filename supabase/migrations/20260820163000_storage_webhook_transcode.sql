-- Create a webhook trigger on public.public_echoes for HLS video transcoding
CREATE OR REPLACE FUNCTION public.handle_echo_insert_transcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if any of the media_urls end in .mp4 or .mov
  IF array_length(NEW.media_urls, 1) > 0 AND (NEW.media_urls[1] ILIKE '%.mp4' OR NEW.media_urls[1] ILIKE '%.mov') THEN
    perform net.http_post(
        url := coalesce(current_setting('app.settings.edge_function_url', true), 'http://kong:8000/functions/v1/') || 'transcode-video',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-supabase-signature', 'webhook_signature'
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'public_echoes',
            'record', row_to_json(NEW)
        )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_echo_insert_transcode ON public.public_echoes;
CREATE TRIGGER on_echo_insert_transcode
  AFTER INSERT ON public.public_echoes
  FOR EACH ROW EXECUTE FUNCTION public.handle_echo_insert_transcode();
