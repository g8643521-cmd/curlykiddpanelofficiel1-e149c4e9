-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Authenticated can read cheaters" ON public.bot_detected_cheaters;
DROP POLICY IF EXISTS "Authenticated can insert cheaters" ON public.bot_detected_cheaters;

-- Only guild owners (via discord_bot_servers) or admins can read
CREATE POLICY "Guild owners or admins can read cheaters"
ON public.bot_detected_cheaters
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    guild_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.discord_bot_servers s
      WHERE s.guild_id = bot_detected_cheaters.guild_id
        AND s.user_id = auth.uid()
    )
  )
);

-- Only guild owners or admins can insert
CREATE POLICY "Guild owners or admins can insert cheaters"
ON public.bot_detected_cheaters
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    guild_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.discord_bot_servers s
      WHERE s.guild_id = bot_detected_cheaters.guild_id
        AND s.user_id = auth.uid()
    )
  )
);