
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- user_roles FIRST (referenced by other RLS policies)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper function for role checks (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- user_roles policies
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- admin_settings
CREATE TABLE public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage settings" ON public.admin_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can read settings" ON public.admin_settings FOR SELECT USING (true);

-- audit_log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit log" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can insert audit log" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- bot_detected_cheaters
CREATE TABLE public.bot_detected_cheaters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT,
  discord_username TEXT,
  discord_avatar TEXT,
  guild_id TEXT,
  guild_name TEXT,
  total_bans INTEGER DEFAULT 0,
  total_tickets INTEGER DEFAULT 0,
  summary_text TEXT,
  is_flagged BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_detected_cheaters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read cheaters" ON public.bot_detected_cheaters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cheaters" ON public.bot_detected_cheaters FOR INSERT TO authenticated WITH CHECK (true);

-- bot_server_settings
CREATE TABLE public.bot_server_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_server_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage bot settings" ON public.bot_server_settings FOR ALL TO authenticated USING (true);

-- cheater_reports
CREATE TABLE public.cheater_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user TEXT,
  reason TEXT,
  evidence TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cheater_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON public.cheater_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view own reports" ON public.cheater_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- discord_alerted_members
CREATE TABLE public.discord_alerted_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.discord_alerted_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read alerted members" ON public.discord_alerted_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert alerted members" ON public.discord_alerted_members FOR INSERT TO authenticated WITH CHECK (true);

-- discord_bot_servers
CREATE TABLE public.discord_bot_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  guild_name TEXT,
  guild_icon TEXT,
  webhook_url TEXT,
  manual_webhook_url TEXT,
  alert_channel_name TEXT,
  is_active BOOLEAN DEFAULT true,
  member_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  auto_scan_webhook_url TEXT,
  full_scan_webhook_url TEXT,
  info_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.discord_bot_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own or admin all bot servers" ON public.discord_bot_servers FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own bot servers" ON public.discord_bot_servers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own or admin all bot servers" ON public.discord_bot_servers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can delete own or admin all bot servers" ON public.discord_bot_servers FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- discord_member_joins
CREATE TABLE public.discord_member_joins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id TEXT,
  discord_username TEXT,
  discord_avatar TEXT,
  guild_id TEXT,
  guild_name TEXT,
  is_cheater BOOLEAN DEFAULT false,
  is_flagged BOOLEAN DEFAULT false,
  total_bans INTEGER DEFAULT 0,
  total_tickets INTEGER DEFAULT 0,
  summary_text TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.discord_member_joins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read member joins" ON public.discord_member_joins FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert member joins" ON public.discord_member_joins FOR INSERT TO authenticated WITH CHECK (true);

-- mod_categories (before fivem_mods for FK)
CREATE TABLE public.mod_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mod_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view categories" ON public.mod_categories FOR SELECT USING (true);

-- fivem_mods
CREATE TABLE public.fivem_mods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  version TEXT,
  category_id UUID REFERENCES public.mod_categories(id) ON DELETE SET NULL,
  tags TEXT[],
  screenshots TEXT[],
  model_url TEXT,
  author_notes TEXT,
  changelog TEXT,
  compatibility TEXT,
  requirements TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  download_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fivem_mods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view mods" ON public.fivem_mods FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert mods" ON public.fivem_mods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update mods" ON public.fivem_mods FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete mods" ON public.fivem_mods FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- notification_settings
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  sound_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notifications" ON public.notification_settings FOR ALL TO authenticated USING (auth.uid() = user_id);

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  email TEXT,
  discord_user_id TEXT,
  discord_username TEXT,
  discord_avatar TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  risk_score INTEGER DEFAULT 0,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  flagged_at TIMESTAMPTZ,
  flagged_reason TEXT,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  badges TEXT[] DEFAULT '{}',
  theme TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON public.profiles (email) WHERE email IS NOT NULL;

-- scan_history
CREATE TABLE public.scan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  server_id TEXT,
  guild_id TEXT,
  guild_name TEXT,
  scan_type TEXT,
  status TEXT DEFAULT 'pending',
  total_members INTEGER DEFAULT 0,
  total_checked INTEGER DEFAULT 0,
  total_alerts INTEGER DEFAULT 0,
  total_skipped INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  duration_seconds NUMERIC,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own scans" ON public.scan_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert scans" ON public.scan_history FOR INSERT TO authenticated WITH CHECK (true);

-- search_history
CREATE TABLE public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  search_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own search history" ON public.search_history FOR ALL TO authenticated USING (auth.uid() = user_id);

-- server_favorites
CREATE TABLE public.server_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  server_id TEXT NOT NULL,
  server_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.server_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites" ON public.server_favorites FOR ALL TO authenticated USING (auth.uid() = user_id);

-- server_shares
CREATE TABLE public.server_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL,
  shared_with TEXT,
  shared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  permission TEXT DEFAULT 'view',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.server_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view shares" ON public.server_shares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create shares" ON public.server_shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = shared_by);

-- user_flags
CREATE TABLE public.user_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  flag_type TEXT NOT NULL,
  reason TEXT,
  flagged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage flags" ON public.user_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- visitor_logs
CREATE TABLE public.visitor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  page TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view visitor logs" ON public.visitor_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert visitor logs" ON public.visitor_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Functions
CREATE OR REPLACE FUNCTION public.get_public_tables()
RETURNS TABLE(table_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT t.table_name::TEXT
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$$;

CREATE OR REPLACE FUNCTION public.get_cheater_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*)::int,
    'confirmed', count(*) FILTER (WHERE status = 'confirmed')::int,
    'suspected', count(*) FILTER (WHERE status = 'suspected' OR status = 'pending')::int
  )
  FROM public.cheater_reports
$$;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_admin_settings_updated_at BEFORE UPDATE ON public.admin_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fivem_mods_updated_at BEFORE UPDATE ON public.fivem_mods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bot_server_settings_updated_at BEFORE UPDATE ON public.bot_server_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('fivem-mods', 'fivem-mods', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('mod-screenshots', 'mod-screenshots', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('public-assets', 'public-assets', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('hero-images', 'hero-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('map-tiles', 'map-tiles', true) ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Auth upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Public read mods" ON storage.objects FOR SELECT USING (bucket_id = 'fivem-mods');
CREATE POLICY "Auth upload mods" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fivem-mods');
CREATE POLICY "Public read screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'mod-screenshots');
CREATE POLICY "Auth upload screenshots" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'mod-screenshots');
CREATE POLICY "Public read assets" ON storage.objects FOR SELECT USING (bucket_id = 'public-assets');
CREATE POLICY "Auth upload assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'public-assets');
CREATE POLICY "Hero images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'hero-images');
CREATE POLICY "Admins can upload hero images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update hero images" ON storage.objects FOR UPDATE USING (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete hero images" ON storage.objects FOR DELETE USING (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public read access for map tiles" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'map-tiles');
