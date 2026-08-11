-- Fix Security Definer View issue detected by Supabase Analyzer
-- Changes views to SECURITY INVOKER to respect row level security policies of the querying user.

ALTER VIEW public.echo_reaction_summary SET (security_invoker = true);
ALTER VIEW public.notification_groups SET (security_invoker = true);
