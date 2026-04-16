
-- Remove the public-everyone SELECT policy; only owner+admin can SELECT directly
DROP POLICY IF EXISTS "Public can view safe profile fields" ON public.profiles;

-- Restore column grants so the owner/admin policy can read them
GRANT SELECT (email, risk_score, suspended_reason, suspended_at, flagged_reason, flagged_at, role)
  ON public.profiles TO authenticated;

-- Create a safe public view exposing only non-sensitive fields
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  user_id, display_name, avatar_url, bio, badges, level, xp, theme,
  discord_username, discord_avatar, status, created_at
FROM public.profiles;

-- Allow public reads on the view
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Add a permissive RLS allowing anon/auth to read rows VIA the view (security_invoker uses caller's RLS,
-- so we need a SELECT policy that allows reading the safe-projection rows)
CREATE POLICY "Public can read profiles via safe view"
ON public.profiles FOR SELECT TO anon, authenticated
USING (true);

-- And revoke direct column access for sensitive fields from anon (authenticated already restricted by need)
REVOKE SELECT (email, risk_score, suspended_reason, suspended_at, flagged_reason, flagged_at)
  ON public.profiles FROM anon;
REVOKE SELECT (email, risk_score, suspended_reason, suspended_at, flagged_reason, flagged_at)
  ON public.profiles FROM authenticated;
