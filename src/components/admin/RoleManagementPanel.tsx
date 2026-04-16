import { useState, useEffect, useCallback } from 'react';
import { Crown, ShieldCheck, Trash2, Loader2, RefreshCw, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface RoleEntry {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

const ROLE_META: Record<string, { icon: typeof Crown; color: string; badgeClass: string; label: string; dotColor: string }> = {
  owner:       { icon: Crown,       color: 'text-[hsl(var(--yellow))]', badgeClass: 'bg-[hsl(var(--yellow))]/10 text-[hsl(var(--yellow))] border-[hsl(var(--yellow))]/20', label: 'Owner',       dotColor: 'bg-[hsl(var(--yellow))]' },
  admin:       { icon: Shield,      color: 'text-primary',              badgeClass: 'bg-primary/10 text-primary border-primary/20',                                       label: 'Admin',       dotColor: 'bg-primary' },
  moderator:   { icon: ShieldCheck, color: 'text-[hsl(var(--cyan))]',   badgeClass: 'bg-[hsl(var(--cyan))]/10 text-[hsl(var(--cyan))] border-[hsl(var(--cyan))]/20',       label: 'Moderator',   dotColor: 'bg-[hsl(var(--cyan))]' },
  mod_creator: { icon: ShieldCheck, color: 'text-[hsl(var(--green))]',  badgeClass: 'bg-[hsl(var(--green))]/10 text-[hsl(var(--green))] border-[hsl(var(--green))]/20',     label: 'Mod Creator', dotColor: 'bg-[hsl(var(--green))]' },
};

const VISIBLE_ROLES = ['admin', 'moderator', 'user'];

const RoleManagementPanel = () => {
  const [entries, setEntries] = useState<RoleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .in('role', VISIBLE_ROLES)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load roles');
        setIsLoading(false);
        return;
      }

      const userIds = [...new Set((roles ?? []).map((r: any) => r.user_id))];

      let profileMap = new Map();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, email, avatar_url')
          .in('user_id', userIds);
        profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      }

      const enriched: RoleEntry[] = (roles ?? []).map((r: any) => ({
        ...r,
        profile: profileMap.get(r.user_id) || null,
      }));

      setEntries(enriched);
    } catch {
      toast.error('Failed to load roles');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleRemove = async (entry: RoleEntry) => {
    if (entry.role === 'owner') {
      toast.error('Cannot remove owner role');
      return;
    }

    setRemovingId(entry.id);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', entry.id);

      if (error) {
        setEntries((prev) => [...prev, entry].sort((a, b) => b.created_at.localeCompare(a.created_at)));
        toast.error('Failed to remove role');
      } else {
        toast.success(`Removed ${entry.role} from ${entry.profile?.display_name || entry.profile?.email || 'user'}`);
      }
    } catch {
      setEntries((prev) => [...prev, entry].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      toast.error('Failed to remove role');
    }
    setRemovingId(null);
  };

  const grouped = entries.reduce<Record<string, RoleEntry[]>>((acc, entry) => {
    const key = entry.role;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const sortedGroups = VISIBLE_ROLES.filter((r) => grouped[r]?.length);
  const elevatedCount = entries.length;

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--yellow))]/10 flex items-center justify-center">
            <Crown className="w-4 h-4 text-[hsl(var(--yellow))]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Staff Overview</h3>
            <p className="text-xs text-muted-foreground">
              {elevatedCount} member{elevatedCount !== 1 ? 's' : ''} with elevated access
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchRoles}
          disabled={isLoading}
          className="gap-1.5 h-8 text-xs border-border/30 bg-card/50 hover:bg-card"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sortedGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No staff roles assigned yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border/10">
          {sortedGroups.map((roleKey) => {
            const meta = ROLE_META[roleKey] || ROLE_META.admin;
            const members = grouped[roleKey];

            return (
              <div key={roleKey}>
                {/* Role group header */}
                <div className="px-6 py-2.5 flex items-center gap-2.5 bg-secondary/5">
                  <div className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {meta.label}s
                  </span>
                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] font-semibold bg-secondary/40 text-muted-foreground border-0">
                    {members.length}
                  </Badge>
                </div>

                {/* Members */}
                {members.map((entry) => {
                  const initials = (entry.profile?.display_name || entry.profile?.email || '?')[0].toUpperCase();

                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/8 transition-colors group"
                    >
                      <Avatar className="h-9 w-9 ring-1 ring-border/20">
                        <AvatarImage src={entry.profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-secondary/50 text-xs font-semibold text-muted-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-tight">
                          {entry.profile?.display_name || 'Unknown'}
                        </p>
                        <p className="text-[11px] text-muted-foreground/60 truncate leading-tight mt-0.5">
                          {entry.profile?.email || entry.user_id.slice(0, 12) + '…'}
                        </p>
                      </div>

                      <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ${meta.badgeClass}`}>
                        {meta.label}
                      </Badge>

                      {roleKey !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemove(entry)}
                          disabled={removingId === entry.id}
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          {removingId === entry.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RoleManagementPanel;
