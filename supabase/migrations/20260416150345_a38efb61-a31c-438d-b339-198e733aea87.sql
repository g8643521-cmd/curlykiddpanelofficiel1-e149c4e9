
CREATE TABLE public.discord_bot_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id text NOT NULL UNIQUE,
  bot_username text,
  bot_avatar text,
  bot_discriminator text,
  selected_guild_id text,
  selected_guild_name text,
  invite_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bot config" ON public.discord_bot_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read bot config" ON public.discord_bot_config
  FOR SELECT TO authenticated
  USING (true);
