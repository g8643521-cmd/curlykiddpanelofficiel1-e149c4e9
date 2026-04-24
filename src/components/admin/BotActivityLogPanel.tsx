import { useState, useEffect, useMemo } from 'react';
import {
  Bot, RefreshCw, Loader2, Filter, ShieldCheck, Key, Users, Server,
  Power, Webhook, Settings2, AlertCircle, CheckCircle2, XCircle, Search, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';

interface BotAuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  record_id: string | null;
  new_data: any;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const ACTION_META: Record<string, { label: string; icon: any; tone: string }> = {
  'server.create':           { label: 'Server created',       icon: Server,      tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'server.create_failed':    { label: 'Server create failed', icon: AlertCircle, tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'server.delete':           { label: 'Server deleted',       icon: Server,      tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'server.toggle_active':    { label: 'Monitoring toggled',   icon: Power,       tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  'server.update':           { label: 'Server updated',       icon: Settings2,   tone: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  'key.generate':            { label: 'Key generated',        icon: Key,         tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  'key.revoke':              { label: 'Key revoked',          icon: Key,         tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'key.validate_failed':     { label: 'Key rejected',         icon: XCircle,     tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'key.consumed':            { label: 'Key consumed',         icon: ShieldCheck, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'member.invite':           { label: 'Member invited',       icon: Users,       tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'member.role_change':      { label: 'Member role changed',  icon: Users,       tone: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  'member.remove':           { label: 'Member removed',       icon: Users,       tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  'webhook.test':            { label: 'Webhook tested',       icon: Webhook,     tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  'webhook.verify':          { label: 'Webhook verified',     icon: Webhook,     tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  'advanced_settings.update':{ label: 'Settings updated',     icon: Settings2,   tone: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
};

const CATEGORY_FILTERS = [
  { id: 'all',    label: 'All',          prefix: '' },
  { id: 'server', label: 'Servers',      prefix: 'server.' },
  { id: 'key',    label: 'Access keys',  prefix: 'key.' },
  { id: 'member', label: 'Members',      prefix: 'member.' },
  { id: 'other',  label: 'Webhooks & settings', prefix: 'webhook.|advanced' },
];

function summarize(entry: BotAuditEntry): string {
  const d = entry.new_data || {};
  const parts: string[] = [];
  if (d.guild_name) parts.push(d.guild_name);
  else if (d.guild_id) parts.push(`guild ${d.guild_id}`);
  if (d.details?.role) parts.push(`as ${d.details.role}`);
  if (d.details?.from && d.details?.to) parts.push(`${d.details.from} → ${d.details.to}`);
  if (d.details?.email) parts.push(d.details.email);
  if (d.details?.reason) parts.push(`(${d.details.reason})`);
  if (d.details?.is_active !== undefined) parts.push(d.details.is_active ? 'enabled' : 'paused');
  return parts.join(' · ') || '—';
}

function statusOf(entry: BotAuditEntry): 'success' | 'failure' | 'info' {
  return entry.new_data?.status ?? 'info';
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BotActivityLogPanel = () => {
  const [entries, setEntries] = useState<BotAuditEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, user_id, action, record_id, new_data, created_at')
      .eq('table_name', 'bot_action')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) {
      setIsLoading(false);
      return;
    }
    const rows = data as BotAuditEntry[];
    setEntries(rows);

    const ids = new Set<string>();
    rows.forEach((r) => {
      if (r.user_id) ids.add(r.user_id);
      const target = r.new_data?.target_user_id;
      if (typeof target === 'string') ids.add(target);
    });

    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, email, avatar_url')
        .in('user_id', Array.from(ids))
        .limit(1000);
      const map = new Map<string, ProfileLite>();
      (profs || []).forEach((p: any) => map.set(p.user_id, p));
      setProfiles(map);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      // Category
      if (category !== 'all') {
        const def = CATEGORY_FILTERS.find((c) => c.id === category);
        if (def && def.prefix) {
          const prefixes = def.prefix.split('|');
          if (!prefixes.some((p) => e.action.startsWith(p))) return false;
        }
      }
      // Status
      if (statusFilter !== 'all' && statusOf(e) !== statusFilter) return false;
      // Search
      if (q) {
        const actor = e.user_id ? profiles.get(e.user_id) : null;
        const haystack = [
          e.action,
          actor?.display_name,
          actor?.email,
          e.new_data?.guild_name,
          e.new_data?.guild_id,
          e.new_data?.details?.email,
          JSON.stringify(e.new_data ?? {}),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, category, statusFilter, search, profiles]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length, server: 0, key: 0, member: 0, other: 0 };
    entries.forEach((e) => {
      if (e.action.startsWith('server.')) c.server++;
      else if (e.action.startsWith('key.')) c.key++;
      else if (e.action.startsWith('member.')) c.member++;
      else c.other++;
    });
    return c;
  }, [entries]);

  const exportCsv = () => {
    const headers = ['created_at', 'action', 'status', 'actor_email', 'actor_name', 'guild_name', 'guild_id', 'server_id', 'target_user_id', 'error', 'details'];
    const rows = filtered.map((e) => {
      const actor = e.user_id ? profiles.get(e.user_id) : null;
      const d = e.new_data || {};
      return [
        e.created_at,
        e.action,
        d.status ?? '',
        actor?.email ?? '',
        actor?.display_name ?? '',
        d.guild_name ?? '',
        d.guild_id ?? '',
        d.server_id ?? '',
        d.target_user_id ?? '',
        d.error ?? '',
        JSON.stringify(d.details ?? {}),
      ].map(csvEscape).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-activity-${new Date().toISOString()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/20 px-6 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-sm">
              <Bot className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-400/70">/bot · audit</p>
              <h3 className="text-sm font-semibold text-foreground">Bot Activity Log</h3>
              <p className="text-xs text-muted-foreground">Every action from the /bot platform — servers, keys, members, webhooks.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0} className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={isLoading} className="h-8 px-2.5 text-muted-foreground hover:text-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search actor, guild, email, action…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm bg-background/50 border-border/40"
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                category === c.id
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {c.label} ({counts[c.id] ?? entries.length})
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5">
          {(['all', 'success', 'failure'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                statusFilter === s
                  ? s === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : s === 'failure'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-transparent'
              }`}
            >
              {s === 'all' ? 'All status' : s === 'success' ? 'Success' : 'Failures'}
            </button>
          ))}
        </div>

        {/* Entries */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading bot activity…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No bot activity matches your filters.
          </div>
        ) : (
          <ScrollArea className="max-h-[560px]">
            <div className="space-y-1">
              {filtered.map((entry) => {
                const meta = ACTION_META[entry.action] || { label: entry.action, icon: Filter, tone: 'text-muted-foreground bg-secondary/30 border-border/20' };
                const Icon = meta.icon;
                const status = statusOf(entry);
                const actor = entry.user_id ? profiles.get(entry.user_id) : null;
                const targetId = entry.new_data?.target_user_id;
                const target = typeof targetId === 'string' ? profiles.get(targetId) : null;
                const isExpanded = expanded === entry.id;

                return (
                  <div key={entry.id}>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : entry.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/20 transition-colors text-left"
                    >
                      <div className={`flex items-center justify-center w-7 h-7 rounded-lg border ${meta.tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.tone}`}>
                            {meta.label}
                          </span>
                          {status === 'failure' && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-red-500/30 bg-red-500/10 text-red-400">
                              <XCircle className="w-2.5 h-2.5 mr-0.5" /> failed
                            </Badge>
                          )}
                          {status === 'success' && (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400/70" />
                          )}
                          <span className="text-xs text-foreground truncate">{summarize(entry)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                          {actor?.display_name || actor?.email || entry.user_id?.slice(0, 8) || 'unknown'}
                          {target && (
                            <> → <span className="text-foreground/70">{target.display_name || target.email || targetId?.slice(0, 8)}</span></>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="ml-10 mr-3 mb-2 p-3 rounded-lg bg-secondary/10 border border-border/10 text-[11px] font-mono space-y-2 overflow-x-auto">
                        {entry.new_data?.error && (
                          <div>
                            <p className="text-muted-foreground/60 mb-1 font-sans text-[10px] uppercase tracking-wider">Error</p>
                            <pre className="text-red-400/80 whitespace-pre-wrap break-all">{String(entry.new_data.error)}</pre>
                          </div>
                        )}
                        <div>
                          <p className="text-muted-foreground/60 mb-1 font-sans text-[10px] uppercase tracking-wider">Payload</p>
                          <pre className="text-cyan-400/80 whitespace-pre-wrap break-all">
                            {JSON.stringify(entry.new_data ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="font-sans text-[10px] text-muted-foreground/50 pt-1 border-t border-border/10">
                          actor_id: {entry.user_id || '—'} · record_id: {entry.record_id || '—'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default BotActivityLogPanel;
