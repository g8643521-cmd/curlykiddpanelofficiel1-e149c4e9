-- Advanced per-server bot settings
CREATE TABLE public.bot_server_advanced_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL UNIQUE REFERENCES public.discord_bot_servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Cheater role
  cheater_role_id TEXT,
  auto_assign_cheater_role BOOLEAN NOT NULL DEFAULT false,

  -- Auto-moderation (mutually exclusive)
  auto_kick_cheaters BOOLEAN NOT NULL DEFAULT false,
  auto_ban_cheaters BOOLEAN NOT NULL DEFAULT false,

  -- Alerts
  min_bans_for_alert INTEGER NOT NULL DEFAULT 1,
  alert_mention_role_id TEXT,
  notify_on_clean_joins BOOLEAN NOT NULL DEFAULT false,

  -- Logging & scanning
  log_all_joins BOOLEAN NOT NULL DEFAULT false,
  auto_scan_interval_minutes INTEGER NOT NULL DEFAULT 0,
  info_channel_id TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT auto_mod_mutually_exclusive CHECK (NOT (auto_kick_cheaters AND auto_ban_cheaters)),
  CONSTRAINT min_bans_for_alert_positive CHECK (min_bans_for_alert >= 0),
  CONSTRAINT auto_scan_interval_non_negative CHECK (auto_scan_interval_minutes >= 0)
);

-- Indexes
CREATE INDEX idx_bot_advanced_settings_user ON public.bot_server_advanced_settings(user_id);
CREATE INDEX idx_bot_advanced_settings_server ON public.bot_server_advanced_settings(server_id);

-- RLS
ALTER TABLE public.bot_server_advanced_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own advanced settings"
ON public.bot_server_advanced_settings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own advanced settings"
ON public.bot_server_advanced_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can update own advanced settings"
ON public.bot_server_advanced_settings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own advanced settings"
ON public.bot_server_advanced_settings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_bot_advanced_settings_updated_at
BEFORE UPDATE ON public.bot_server_advanced_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();