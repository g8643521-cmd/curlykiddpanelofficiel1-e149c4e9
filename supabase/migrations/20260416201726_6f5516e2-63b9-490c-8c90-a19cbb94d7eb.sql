
-- Revoke table-level SELECT so column-level grants are enforced
REVOKE SELECT ON public.profiles FROM anon, authenticated, PUBLIC;

-- Re-grant SELECT only on safe (non-sensitive) columns to anon and authenticated
GRANT SELECT (
  id, user_id, display_name, avatar_url, bio, badges, level, xp, theme,
  discord_username, discord_avatar, discord_user_id, status, created_at, updated_at
) ON public.profiles TO anon, authenticated;

-- Sensitive columns: only authenticated users can SELECT them, and RLS still restricts to owner/admin
GRANT SELECT (email, role, risk_score, suspended_at, suspended_reason, flagged_at, flagged_reason)
  ON public.profiles TO authenticated;

-- Ensure update/insert grants are intact for authenticated owners
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
