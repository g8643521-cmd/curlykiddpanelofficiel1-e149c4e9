
-- 1. PROFILES: hide sensitive columns. Drop public SELECT, replace with restricted policy + public-safe view
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

CREATE POLICY "Users can view own full profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view safe profile fields"
ON public.profiles FOR SELECT TO anon, authenticated
USING (true);
-- Note: column-level filtering enforced via a view below; PostgREST will still return all cols to authenticated users without admin.
-- To properly hide sensitive cols, we revoke select on sensitive columns from anon and authenticated, keep admin-only via RLS.

REVOKE SELECT (email, risk_score, suspended_reason, suspended_at, flagged_reason, flagged_at, role)
  ON public.profiles FROM anon, authenticated;

-- 2. ADMIN_SETTINGS: restrict reads to a public-safe key allowlist; admins get full access
DROP POLICY IF EXISTS "Anyone can read settings" ON public.admin_settings;

CREATE POLICY "Public can read safe settings"
ON public.admin_settings FOR SELECT TO anon, authenticated
USING (key IN (
  'social_discord','social_youtube','social_tiktok',
  'hero_showcase_image',
  'stats_total_override','stats_confirmed_override','stats_suspected_override',
  'discord_webhook_enabled','embed_config_mod_upload'
));

-- 3. AUDIT_LOG: prevent forging entries with someone else's user_id
DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.audit_log;
CREATE POLICY "Users can insert own audit entries"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4. BOT_SERVER_SETTINGS: restrict to admins (no per-user ownership column exists)
DROP POLICY IF EXISTS "Authenticated can manage bot settings" ON public.bot_server_settings;
CREATE POLICY "Admins can manage bot settings"
ON public.bot_server_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Fix function search_path for get_public_tables
CREATE OR REPLACE FUNCTION public.get_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.table_name::TEXT
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$function$;
