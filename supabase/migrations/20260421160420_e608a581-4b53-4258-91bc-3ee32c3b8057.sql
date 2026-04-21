-- Audit log for per-server actions (welcome resends, scans, etc.)
CREATE TABLE public.server_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id UUID NOT NULL,
  guild_id TEXT,
  user_id UUID,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'fail', 'partial')),
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_audit_log_server_id ON public.server_audit_log(server_id, created_at DESC);
CREATE INDEX idx_server_audit_log_user_id ON public.server_audit_log(user_id, created_at DESC);

ALTER TABLE public.server_audit_log ENABLE ROW LEVEL SECURITY;

-- Owners (and admins) can view audit entries for their servers
CREATE POLICY "Server owners and admins can view audit log"
ON public.server_audit_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.discord_bot_servers s
    WHERE s.id = server_audit_log.server_id
      AND s.user_id = auth.uid()
  )
);

-- Authenticated users can insert audit entries for servers they own (or admins for any)
CREATE POLICY "Users can insert audit entries for own servers"
ON public.server_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.discord_bot_servers s
    WHERE s.id = server_audit_log.server_id
      AND s.user_id = auth.uid()
  )
);