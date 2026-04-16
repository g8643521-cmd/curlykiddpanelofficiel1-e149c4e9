-- Drop overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated can view shares" ON public.server_shares;

-- Restrict SELECT to involved parties or admins
CREATE POLICY "Users can view shares they're involved in"
ON public.server_shares
FOR SELECT
TO authenticated
USING (
  auth.uid() = shared_by
  OR shared_with = auth.uid()::text
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow share creator (or admin) to update permission
CREATE POLICY "Share creators can update their shares"
ON public.server_shares
FOR UPDATE
TO authenticated
USING (auth.uid() = shared_by OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (auth.uid() = shared_by OR has_role(auth.uid(), 'admin'::app_role));

-- Allow share creator (or admin) to delete
CREATE POLICY "Share creators can delete their shares"
ON public.server_shares
FOR DELETE
TO authenticated
USING (auth.uid() = shared_by OR has_role(auth.uid(), 'admin'::app_role));