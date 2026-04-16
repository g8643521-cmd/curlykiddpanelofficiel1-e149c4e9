DROP POLICY IF EXISTS "Authenticated can read member joins" ON public.discord_member_joins;

CREATE POLICY "Guild owners or admins can read member joins"
ON public.discord_member_joins
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    guild_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.discord_bot_servers s
      WHERE s.guild_id = discord_member_joins.guild_id
        AND s.user_id = auth.uid()
    )
  )
);