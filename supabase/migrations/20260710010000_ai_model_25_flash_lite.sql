-- OpenRouter removed the gemini-2.0 chat models from its catalog, which
-- silently broke every feature routed through them: the moderation gate
-- (phantom "can't be shared publicly" + hidden posts), thinking-fingerprint
-- synthesis (eternal spinner), and the user-selectable "2.0 Flash Lite" chat
-- model. Server/client now use gemini-2.5-flash-lite; migrate the persisted
-- preference and the constraint with them.

UPDATE public.profiles
   SET ai_model = 'gemini-2.5-flash-lite'
 WHERE ai_model = 'gemini-2.0-flash-lite';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ai_model_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ai_model_check
  CHECK (ai_model IN ('gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'));
