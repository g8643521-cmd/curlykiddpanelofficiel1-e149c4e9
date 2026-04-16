-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Public can read profiles via safe view" ON public.profiles;

-- Create a safe public view exposing only non-sensitive fields
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  display_name,
  avatar_url,
  bio,
  theme,
  badges,
  xp,
  level,
  discord_username,
  discord_avatar,
  created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Ensure base table only allows the owner (or admin) to read full profile
-- (The existing "Users can view own full profile" policy already covers this.)
-- No additional public SELECT policy is added — public reads must go via profiles_public.