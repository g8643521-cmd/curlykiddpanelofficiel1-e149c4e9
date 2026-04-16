import { useState, useEffect, useCallback } from 'react';
import { Crown, ShieldCheck, Trash2, Loader2, RefreshCw, Shield, Users, MoreHorizontal, UserCog, Eye, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const ROLE_META: Record<string, { icon: typeof Crown; label: string; badgeClass: string; dotColor: string; order: number }> = {
  owner:              { icon: Crown,       label: 'Owner',       badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',   dotColor: 'bg-amber-400', order: 0 },
  admin:              { icon: Shield,      label: 'Admin',       badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',         dotColor: 'bg-sky-400',   order: 1 },
  moderator:          { icon: ShieldCheck, label: 'Moderator',   badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20', dotColor: 'bg-violet-400', order: 2 },
  mod_creator:        { icon: ShieldCheck, label: 'Mod Creator', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dotColor: 'bg-emerald-400', order: 3 },
  integrations_manager: { icon: Shield,    label: 'Integrations', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',  dotColor: 'bg-slate-400', order: 4 },
};

const STAFF_ROLES = ['owner', 'admin', 'moderator', 'mod_creator', 'integrations_manager'];
const ASSIGNABLE_ROLES = ['admin', 'moderator', 'mod_creator', 'integrations_manager', 'user'];

const RoleManagementPanel = () => {
  const [entries, setEntries] = useState<RoleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .in('role', STAFF_ROLES)
        .order('created_at', { ascending: false });

      if (error) { toast.error('Failed to load roles'); setIsLoading(false); return; }

      const userIds = [...new Set((roles ?? []).map((r: any) => r.user_id))];
      let profileMap = new Map();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, email, avatar_url')
          .in('user_id', userIds);
        profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      }

      setEntries((roles ?? []).map((r: any) => ({ ...r, profile: profileMap.get(r.user_id) || null })));
      setLastUpdated(new Date());
    } catch {
      toast.error('Failed to load roles');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  const handleRemove = async (entry: RoleEntry) => {
    if (entry.role === 'owner') { toast.error('Cannot remove owner role'); return; }
    setActionId(entry.id);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
    try {
      const { error } = await supabase.from('user_roles').delete().eq('id', entry.id);
      if (error) {
        setEntries(prev => [...prev, entry].sort((a, b) => b.created_at.localeCompare(a.created_at)));
        toast.error('Failed to remove role');
      } else {
        toast.success(`Removed ${entry.role} from ${displayName(entry)}`);
      }
    } catch {
      setEntries(prev => [...prev, entry].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      toast.error('Failed to remove role');
    }
    setActionId(null);
  };

  const handleChangeRole = async (entry: RoleEntry, newRole: string) => {
    if (entry.role === 'owner') { toast.error('Cannot change owner role'); return; }
    setActionId(entry.id);
    try {
      const { error } = await supabase.from('user_roles').update({ role: newRole as any }).eq('id', entry.id);
      if (error) {
        toast.error('Failed to change role');
      } else {
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, role: newRole } : e));
        toast.success(`Changed ${displayName(entry)} to ${ROLE_META[newRole]?.label || newRole}`);
      }
    } catch {
      toast.error('Failed to change role');
    }
    setActionId(null);
  };

  // Group and deduplicate by role
  const grouped = entries.reduce<Record<string, RoleEntry[]>>((acc, entry) => {
    const key = entry.role;
    if (!acc[key]) acc[key] = [];
    // Deduplicate by user_id within same role
    if (!acc[key].some(e => e.user_id === entry.user_id)) {
      acc[key].push(entry);
    }
    return acc;
  }, {});

  const sortedGroups = STAFF_ROLES
    .filter(r => grouped[r]?.length)
    .sort((a, b) => (ROLE_META[a]?.order ?? 99) - (ROLE_META[b]?.order ?? 99));

  const totalStaff = entries.length;

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Crown className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Staff Overview</h3>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {totalStaff} member{totalStaff !== 1 ? 's' : ''} with elevated access
              {lastUpdated && (
                <span className="ml-2 text-muted-foreground/40">
                  · Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchRoles}
          disabled={isLoading}
          className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </div>
      ) : sortedGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground/60">No staff roles assigned yet</p>
        </div>
      ) : (
        <div className="py-2">
          {sortedGroups.map((roleKey, gi) => {
            const meta = ROLE_META[roleKey];
            const members = grouped[roleKey];

            return (
              <div key={roleKey} className={gi > 0 ? 'mt-1' : ''}>
                {/* Role group header */}
                <div className="px-6 py-2 flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                  <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/50">
                    {meta.label}{members.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] text-muted-foreground/30 ml-1">{members.length}</span>
                </div>

                {/* Members */}
                {members.map((entry) => (
                  <StaffRow
                    key={entry.id}
                    entry={entry}
                    meta={meta}
                    roleKey={roleKey}
                    isActioning={actionId === entry.id}
                    onRemove={() => handleRemove(entry)}
                    onChangeRole={(newRole) => handleChangeRole(entry, newRole)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function displayName(entry: RoleEntry): string {
  if (entry.profile?.display_name) return entry.profile.display_name;
  if (entry.profile?.email) return entry.profile.email;
  return 'Pending user';
}

function StaffRow({
  entry, meta, roleKey, isActioning, onRemove, onChangeRole,
}: {
  entry: RoleEntry;
  meta: typeof ROLE_META[string];
  roleKey: string;
  isActioning: boolean;
  onRemove: () => void;
  onChangeRole: (role: string) => void;
}) {
  const name = displayName(entry);
  const isPending = !entry.profile?.display_name && !entry.profile?.email;
  const initials = isPending ? '?' : name[0].toUpperCase();

  return (
    <div className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/5 transition-colors group">
      <Avatar className="h-8 w-8 ring-1 ring-border/10">
        <AvatarImage src={entry.profile?.avatar_url || undefined} />
        <AvatarFallback className="bg-secondary/30 text-[11px] font-medium text-muted-foreground/70">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isPending ? 'text-muted-foreground/50 italic' : 'text-foreground'}`}>
          {name}
        </p>
        {entry.profile?.email && entry.profile?.display_name && (
          <p className="text-[11px] text-muted-foreground/40 truncate leading-tight mt-0.5">
            {entry.profile.email}
          </p>
        )}
      </div>

      <Badge variant="outline" className={`text-[10px] font-medium tracking-wide px-2 py-0.5 border ${meta.badgeClass}`}>
        {meta.label}
      </Badge>

      {roleKey !== 'owner' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
              disabled={isActioning}
            >
              {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs gap-2">
                <UserCog className="h-3.5 w-3.5" />
                Change role
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {ASSIGNABLE_ROLES.filter(r => r !== roleKey).map(r => (
                  <DropdownMenuItem key={r} className="text-xs" onClick={() => onChangeRole(r)}>
                    {ROLE_META[r]?.label || r}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-destructive focus:text-destructive gap-2" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove role
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default RoleManagementPanel;
