
-- 1. Add new role to enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'server_owner';

-- 2. Server creation keys (personal one-time keys)
CREATE TABLE public.server_creation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code TEXT NOT NULL UNIQUE,
  issued_to UUID,
  issued_to_email TEXT,
  created_by UUID NOT NULL,
  used_by UUID,
  used_at TIMESTAMPTZ,
  used_for_server_id UUID,
  expires_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_creation_keys_code ON public.server_creation_keys(key_code) WHERE used_at IS NULL;
CREATE INDEX idx_server_creation_keys_issued_to ON public.server_creation_keys(issued_to) WHERE used_at IS NULL;

ALTER TABLE public.server_creation_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all keys"
  ON public.server_creation_keys
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Users can view own unused keys"
  ON public.server_creation_keys
  FOR SELECT
  TO authenticated
  USING (issued_to = auth.uid() AND used_at IS NULL);

-- 3. Server members (invite-only access)
CREATE TABLE public.server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.discord_bot_servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
  invited_by UUID,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (server_id, user_id)
);

CREATE INDEX idx_server_members_server ON public.server_members(server_id);
CREATE INDEX idx_server_members_user ON public.server_members(user_id);

ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is a member with at least a given role
CREATE OR REPLACE FUNCTION public.is_server_member(_server_id UUID, _user_id UUID, _min_role TEXT DEFAULT 'viewer')
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = _server_id
      AND user_id = _user_id
      AND CASE _min_role
        WHEN 'viewer' THEN role IN ('viewer','editor','admin')
        WHEN 'editor' THEN role IN ('editor','admin')
        WHEN 'admin'  THEN role = 'admin'
        ELSE FALSE
      END
  )
$$;

-- Helper: is user the server owner (creator)
CREATE OR REPLACE FUNCTION public.is_server_owner(_server_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.discord_bot_servers
    WHERE id = _server_id AND user_id = _user_id
  )
$$;

CREATE POLICY "View members if owner, member or admin"
  ON public.server_members
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_owner(server_id, auth.uid())
    OR user_id = auth.uid()
    OR public.is_server_member(server_id, auth.uid(), 'viewer')
  );

CREATE POLICY "Owner or server-admin can add members"
  ON public.server_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_owner(server_id, auth.uid())
    OR public.is_server_member(server_id, auth.uid(), 'admin')
  );

CREATE POLICY "Owner or server-admin can update members"
  ON public.server_members
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_owner(server_id, auth.uid())
    OR public.is_server_member(server_id, auth.uid(), 'admin')
  );

CREATE POLICY "Owner, server-admin or self can remove member"
  ON public.server_members
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_owner(server_id, auth.uid())
    OR public.is_server_member(server_id, auth.uid(), 'admin')
    OR user_id = auth.uid()
  );

-- 4. Update discord_bot_servers RLS so invited members can view (not break existing)
DROP POLICY IF EXISTS "Users can view own or admin all bot servers" ON public.discord_bot_servers;
CREATE POLICY "View own, member or admin servers"
  ON public.discord_bot_servers
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_member(id, auth.uid(), 'viewer')
  );

DROP POLICY IF EXISTS "Users can update own or admin all bot servers" ON public.discord_bot_servers;
CREATE POLICY "Update own, editor+ or admin servers"
  ON public.discord_bot_servers
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_member(id, auth.uid(), 'editor')
  );

-- 5. Update bot_server_advanced_settings RLS so editor+ members can manage
DROP POLICY IF EXISTS "Users can view own advanced settings" ON public.bot_server_advanced_settings;
CREATE POLICY "View advanced settings if owner, member or admin"
  ON public.bot_server_advanced_settings
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_member(server_id, auth.uid(), 'viewer')
  );

DROP POLICY IF EXISTS "Users can update own advanced settings" ON public.bot_server_advanced_settings;
CREATE POLICY "Update advanced settings if owner, editor+ or admin"
  ON public.bot_server_advanced_settings
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_server_member(server_id, auth.uid(), 'editor')
  );
