import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Shield,
  ShieldCheck,
  Server,
  Calendar,
  Download,
  FileJson,
  FileText,
  ExternalLink,
  Copy,
  Eye,
  Info,
  Loader2,
  Database,
  Fingerprint,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { supabase } from '@/lib/supabase';
import { pingRpc, pingHead, getCached } from '@/lib/connectionCache';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import ParticleBackground from '@/components/ParticleBackground';
import AppHeader from '@/components/AppHeader';
import { useAdminStatus } from '@/hooks/useAdminStatus';

// Animated counter component
const AnimatedCounter = ({ value, duration = 1.5 }: { value: number; duration?: number }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString('en-US'));
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const controls = animate(count, value, {
      duration,
      ease: [0.25, 0.46, 0.45, 0.94],
    });
    const unsubscribe = rounded.on('change', (v) => setDisplay(v));
    return () => { controls.stop(); unsubscribe(); };
  }, [value, duration, count, rounded]);

  return <span>{display}</span>;
};

interface PlayerIdentifiers {
  steam?: string;
  discord?: string;
  discord_avatar?: string;
  discord_username?: string;
  fivem?: string;
  license?: string;
}

interface CheaterReport {
  id: string;
  player_name: string;
  player_identifiers: PlayerIdentifiers | null;
  server_code: string | null;
  server_name: string | null;
  reason: string;
  evidence_url: string | null;
  status: string;
  created_at: string;
}

// Helper to get Discord avatar URL
const getDiscordAvatarUrl = (discordId: string, avatarHash?: string) => {
  if (avatarHash) {
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
  }
  const defaultIndex = Number(BigInt(discordId) % BigInt(5));
  return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
};

const CheaterSearch = () => {
  const { isAdmin } = useAdminStatus();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<CheaterReport[]>([]);
  const [allCheaters, setAllCheaters] = useState<CheaterReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [stats, setStats] = useState({ total: 0, confirmed: 0, suspected: 0 });
  const [sxResult, setSxResult] = useState<any>(null);
  const [sxDiscordUser, setSxDiscordUser] = useState<any>(null);
  const [sxLoading, setSxLoading] = useState(false);
  const [sxError, setSxError] = useState<string | null>(null);
  // Hydrate from cache instantly so the pill renders with last-known latency on mount
  const _cachedSx = getCached('head:cheater_reports');
  const _cachedDb = getCached('head:mod_categories');
  // Static table count — known from schema, no need to query information_schema (~150ms saved)
  const KNOWN_TABLE_COUNT = 20;
  const [sxStats, setSxStats] = useState<{ connected: boolean; latency: number | null; ticketCount: number }>({
    connected: _cachedSx?.connected ?? false,
    latency: _cachedSx?.latency ?? null,
    ticketCount: (_cachedSx as any)?.data ?? 0,
  });
  const [dbStats, setDbStats] = useState<{ connected: boolean; tableCount: number; latency: number | null }>({
    connected: _cachedDb?.connected ?? false,
    tableCount: KNOWN_TABLE_COUNT,
    latency: _cachedDb?.latency ?? null,
  });
  const hasAutoSearched = useRef(false);
  const lastSearchRunRef = useRef<{ query: string; at: number } | null>(null);

  const fetchDbStats = async () => {
    // Bypass cache so the pill updates with a fresh measurement every tick
    const { connected, latency } = await pingHead('mod_categories', { bypassCache: true });
    setDbStats({
      connected,
      tableCount: KNOWN_TABLE_COUNT,
      latency: connected ? latency : null,
    });
  };

  useEffect(() => {
    // Fire connection pings first for instant feedback, then heavier stats
    fetchDbStats();
    fetchSxStats();
    Promise.all([fetchStats(), fetchStatsOverrides()]);
    // Live-refresh status pills every 3s so the latency reflects current conditions
    const interval = setInterval(() => {
      fetchSxStats();
      fetchDbStats();
    }, 3000);
    return () => { clearInterval(interval); };
  }, []);

  // Auto-search from URL query param (e.g. /cheaters?q=somePlayer)
  const pendingSearch = useRef<string | null>(null);
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !hasAutoSearched.current) {
      hasAutoSearched.current = true;
      setSearchQuery(q);
      pendingSearch.current = q;
    }
  }, [searchParams]);

  // Single auto-search path for URL-driven lookups
  useEffect(() => {
    if (pendingSearch.current && searchQuery === pendingSearch.current) {
      pendingSearch.current = null;
      handleSearch();
    }
  }, [searchQuery]);

  const fetchSxStats = async () => {
    // Use lightweight HEAD ping instead of RPC — count comes for free via Content-Range
    const { connected, latency, count } = await pingHead('cheater_reports');
    setSxStats({
      connected,
      latency: connected ? latency : null,
      ticketCount: count ?? 0,
    });
  };

  const [statsOverrides, setStatsOverrides] = useState<{ total?: number; confirmed?: number; suspected?: number }>({});

  const fetchStatsOverrides = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['stats_total_override', 'stats_confirmed_override', 'stats_suspected_override']);
    
    if (data) {
      const overrides: any = {};
      for (const row of data) {
        const val = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value ?? '');
        const num = parseInt(val, 10);
        if (!isNaN(num) && val !== '') {
          if (row.key === 'stats_total_override') overrides.total = num;
          if (row.key === 'stats_confirmed_override') overrides.confirmed = num;
          if (row.key === 'stats_suspected_override') overrides.suspected = num;
        }
      }
      setStatsOverrides(overrides);
    }
  };

  // Fast stats via DB function — no need to fetch all rows
  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_cheater_stats');
      if (!error && data) {
        setStats({
          total: data.total || 0,
          confirmed: data.confirmed || 0,
          suspected: data.suspected || 0,
        });
      }
    } catch {}
  };

  // Only used when browsing/displaying the list — lazy loaded
  const fetchAllCheaters = async () => {
    if (allCheaters.length > 0) return; // Already cached in state
    try {
      const { data, error } = await supabase
        .from('cheater_reports')
        .select('id, player_name, player_identifiers, server_code, server_name, reason, evidence_url, status, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        const typedData = data.map(item => ({
          ...item,
          player_identifiers: item.player_identifiers as PlayerIdentifiers | null,
        }));
        setAllCheaters(typedData);
      }
    } catch {}
  };


  const handleSearch = async () => {
    const query = searchQuery.trim();

    if (!query) {
      setResults([]);
      setHasSearched(false);
      setSxResult(null);
      setSxError(null);
      return;
    }

    const now = Date.now();
    if (
      lastSearchRunRef.current &&
      lastSearchRunRef.current.query === query &&
      now - lastSearchRunRef.current.at < 1500
    ) {
      return;
    }
    lastSearchRunRef.current = { query, at: now };

    setIsLoading(true);
    setHasSearched(true);
    setSxResult(null);
    setSxDiscordUser(null);
    setSxError(null);
    const isDiscordId = /^\d{17,19}$/.test(query);
    const isSteamHex = /^steam:/.test(query.toLowerCase()) || /^[a-f0-9]{15,17}$/i.test(query);
    const isFiveM = /^fivem:/.test(query.toLowerCase()) || /^\d{1,10}$/.test(query);
    const isLicense = /^license:/.test(query.toLowerCase()) || /^[a-f0-9]{40}$/i.test(query);

    // If Discord ID, also query external API
    let sxData: any = null;
    let sxDiscordUserData: any = null;
    if (isDiscordId) {
      try {
        const { data } = await supabase.functions.invoke('screensharex-lookup', {
          body: { discord_id: query },
        });
        if (data?.success) {
          sxData = data.data;
          sxDiscordUserData = data.data?.discord_user || data.discord_user;
          setSxResult(data.data);
          setSxDiscordUser(sxDiscordUserData || null);
        } else {
          setSxError(data?.error || 'Lookup failed');
        }
      } catch {}
      setSxLoading(false);
    }

    // Fetch all and filter client-side for identifier matching (JSONB)
    let typedData: CheaterReport[] = [];
    try {
      const { data, error } = await supabase
        .from('cheater_reports')
        .select('id, player_name, player_identifiers, server_code, server_name, reason, evidence_url, status, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        typedData = data.map(item => ({
          ...item,
          player_identifiers: item.player_identifiers as PlayerIdentifiers | null,
        }));
      }
    } catch {}



    // Filter results by name OR any matching identifier
    const filtered = typedData.filter(cheater => {
      const lowerQuery = query.toLowerCase();
      const ids = cheater.player_identifiers;

      // Match by player name
      if (cheater.player_name.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      if (!ids) return false;

      // Match by Discord ID
      if (isDiscordId && ids.discord === query) {
        return true;
      }

      // Match by Steam (with or without prefix)
      if (isSteamHex) {
        const steamQuery = query.toLowerCase().replace(/^steam:/, '');
        const storedSteam = ids.steam?.toLowerCase().replace(/^steam:/, '');
        if (storedSteam && storedSteam.includes(steamQuery)) {
          return true;
        }
      }

      // Match by FiveM ID
      if (isFiveM) {
        const fivemQuery = query.toLowerCase().replace(/^fivem:/, '');
        const storedFiveM = ids.fivem?.toLowerCase().replace(/^fivem:/, '');
        if (storedFiveM && storedFiveM.includes(fivemQuery)) {
          return true;
        }
      }

      // Match by License
      if (isLicense) {
        const licenseQuery = query.toLowerCase().replace(/^license:/, '');
        const storedLicense = ids.license?.toLowerCase().replace(/^license:/, '');
        if (storedLicense && storedLicense.includes(licenseQuery)) {
          return true;
        }
      }

      // Fallback: partial match on any identifier value
      const idValues = Object.values(ids).filter(Boolean).map(v => String(v).toLowerCase());
      return idValues.some(val => val.includes(lowerQuery));
    });

    // Enrich filtered results with avatar data if available
    if (isDiscordId && sxDiscordUserData?.avatar) {
      for (const cheater of filtered) {
        const ids = cheater.player_identifiers;
        if (ids?.discord === query && !ids?.discord_avatar) {
          // Update in-memory
          cheater.player_identifiers = { ...ids, discord_avatar: sxDiscordUserData.avatar, discord_username: sxDiscordUserData.global_name || sxDiscordUserData.username };
          // Persist avatar hash to DB (fire-and-forget)
          supabase
            .from('cheater_reports')
            .update({ player_identifiers: cheater.player_identifiers })
            .eq('id', cheater.id)
            .then(() => {});
        }
      }
    }

    setResults(filtered);
    setIsLoading(false);

    // Send Discord webhook notification with full data
    const session = (await supabase.auth.getSession()).data.session;
    const avatarUrl = sxDiscordUserData?.avatar && isDiscordId
      ? `https://cdn.discordapp.com/avatars/${query}/${sxDiscordUserData.avatar}.${sxDiscordUserData.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
      : null;
    const allTickets = [
      ...((sxData?.tickets as any[]) || []),
      ...((sxData?.tickets_v2 as any[]) || []),
    ];
    const guildNames = [...new Set(allTickets.map((t: any) => t.guild_name || t.guildname).filter(Boolean))];
    const guildActivity = (sxData?.guild_join_leave as any[]) || [];
    const totalTickets = (sxData?.summary?.total_tickets || 0) + (sxData?.summary?.total_tickets_v2 || 0);

    supabase.functions.invoke('cheater-webhook', {
      body: {
        search_query: query,
        results_count: filtered.length,
        searched_by: session?.user?.email || 'Anonymous',
        sx_username: sxDiscordUserData?.global_name || sxDiscordUserData?.username || null,
        sx_tickets: totalTickets,
        sx_guilds: sxData?.summary?.total_guild_records || 0,
        sx_guild_names: guildNames,
        sx_avatar_url: avatarUrl,
        sx_discord_id: isDiscordId ? query : null,
        sx_guild_activity: guildActivity.slice(0, 10).map((g: any) => ({
          guild: g.guildname,
          joined: g.joined_at,
          left: g.left_at,
          username: g.memberUsername,
        })),
        sx_tickets_detail: allTickets.slice(0, 5).map((t: any) => ({
          guild: t.guild_name || t.guildname,
          action: t.action,
          channel: t.channelname,
          time: t.time,
          games: t.games,
        })),
        db_matches: filtered.map(r => ({
          name: r.player_name,
          status: r.status,
          reason: r.reason,
          evidence_url: r.evidence_url,
          server_name: r.server_name,
          server_code: r.server_code,
          created_at: r.created_at,
          player_identifiers: r.player_identifiers,
        })),
      },
    }).catch(err => console.error('Discord webhook failed:', err));
  };


  const lookupExternalDB = async (discordId: string) => {
    setSxLoading(true);
    setSxDiscordUser(null);
    try {
      const { data, error } = await supabase.functions.invoke('screensharex-lookup', {
        body: { discord_id: discordId },
      });
      if (error) throw error;
      if (data?.success) {
        setSxResult(data.data);
        const discordUserData = data.data?.discord_user || data.discord_user;
        if (discordUserData) {
          setSxDiscordUser(discordUserData);
        }
      } else {
        setSxError(data?.error || 'Lookup failed');
      }
    } catch (err: any) {
      setSxError(err.message || 'Failed to contact external source');
    }
    setSxLoading(false);
  };

  const handleExportJSON = () => {
    const dataToExport = allCheaters.map(c => ({
      player_name: c.player_name,
      identifiers: c.player_identifiers,
      reason: c.reason,
      status: c.status,
      server: c.server_name || c.server_code,
      reported_at: c.created_at,
    }));

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cheater_database_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${allCheaters.length} records as JSON`);
  };

  const handleExportCSV = () => {
    const headers = ['Player Name', 'Status', 'Reason', 'Server', 'Discord ID', 'Reported Date'];
    const rows = allCheaters.map(c => [
      `"${c.player_name.replace(/"/g, '""')}"`,
      c.status,
      `"${c.reason.replace(/"/g, '""')}"`,
      `"${(c.server_name || c.server_code || '').replace(/"/g, '""')}"`,
      c.player_identifiers?.discord || '',
      new Date(c.created_at).toISOString(),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cheater_database_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${allCheaters.length} records as CSV`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <Badge className="bg-destructive/20 text-destructive border-destructive/50">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Confirmed
          </Badge>
        );
      case 'suspected':
        return (
          <Badge className="bg-[hsl(var(--yellow))]/20 text-[hsl(var(--yellow))] border-[hsl(var(--yellow))]/50">
            <HelpCircle className="w-3 h-3 mr-1" />
            Suspected
          </Badge>
        );
      case 'cleared':
        return (
          <Badge className="bg-[hsl(var(--green))]/20 text-[hsl(var(--green))] border-[hsl(var(--green))]/50">
            <CheckCircle className="w-3 h-3 mr-1" />
            Cleared
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderCheaterCard = (cheater: CheaterReport, isSearchResult = false) => {
    const identifiers = cheater.player_identifiers;
    const discordId = identifiers?.discord;
    const discordAvatar = identifiers?.discord_avatar;

    return (
      <ContextMenu key={cheater.id}>
        <ContextMenuTrigger asChild>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden bg-card/60 backdrop-blur-md border border-border/50 hover:border-border/70 transition-all"
          >
            {/* Header with status indicator */}
            <div className={`px-5 py-3 border-b flex items-center justify-between ${
              cheater.status === 'confirmed'
                ? 'border-destructive/30 bg-destructive/5'
                : cheater.status === 'suspected'
                ? 'border-[hsl(var(--yellow))]/30 bg-[hsl(var(--yellow))]/5'
                : 'border-[hsl(var(--green))]/30 bg-[hsl(var(--green))]/5'
            }`}>
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10 border-2 border-border/50">
                  {discordId ? (
                    <AvatarImage src={getDiscordAvatarUrl(discordId, discordAvatar)} alt={cheater.player_name} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-muted-foreground font-bold text-sm">
                    {cheater.player_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-foreground text-base leading-tight">{cheater.player_name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Reported {formatDistanceToNow(new Date(cheater.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(cheater.status)}
                {cheater.evidence_url && (
                  <a
                    href={cheater.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary text-xs font-medium hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" /> Evidence
                  </a>
                )}
              </div>
            </div>

            {/* Info Grid */}
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Details */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-1">Reason</h4>
                    <p className="text-sm text-foreground leading-relaxed">{cheater.reason}</p>
                  </div>
                  {cheater.server_name && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-1">Server</h4>
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-primary/60" />
                        <span className="text-sm text-foreground">{cheater.server_name}</span>
                        {cheater.server_code && (
                          <span className="text-xs text-muted-foreground font-mono">({cheater.server_code})</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-1">Reported</h4>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary/60" />
                      <span className="text-sm text-foreground">
                        {new Date(cheater.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Identifiers */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">Identifiers</h4>
                  <div className="space-y-1.5">
                    {discordId && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 group">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-4 h-4 text-[#5865F2] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                          </svg>
                          <span className="text-xs font-mono text-foreground truncate">{discordId}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => copyToClipboard(discordId)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted">
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <a href={`https://discord.com/users/${discordId}`} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted">
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        </div>
                      </div>
                    )}
                    {identifiers?.steam && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 group">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-4 h-4 text-[#66c0f4] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/>
                          </svg>
                          <span className="text-xs font-mono text-foreground truncate">{identifiers.steam}</span>
                        </div>
                        <button onClick={() => copyToClipboard(identifiers.steam!)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted shrink-0">
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {identifiers?.license && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 group">
                        <div className="flex items-center gap-2 min-w-0">
                          <Shield className="w-4 h-4 text-[#f40552] shrink-0" />
                          <span className="text-xs font-mono text-foreground truncate">{identifiers.license}</span>
                        </div>
                        <button onClick={() => copyToClipboard(identifiers.license!)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted shrink-0">
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {identifiers?.fivem && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/30 group">
                        <div className="flex items-center gap-2 min-w-0">
                          <Database className="w-4 h-4 text-orange-400 shrink-0" />
                          <span className="text-xs font-mono text-foreground truncate">{identifiers.fivem}</span>
                        </div>
                        <button onClick={() => copyToClipboard(identifiers.fivem!)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted shrink-0">
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {!discordId && !identifiers?.steam && !identifiers?.license && !identifiers?.fivem && (
                      <p className="text-xs text-muted-foreground italic px-3 py-2">No identifiers recorded</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </ContextMenuTrigger>
        
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={() => copyToClipboard(cheater.player_name)}>
            <Copy className="w-4 h-4 mr-2" />
            Copy Player Name
          </ContextMenuItem>
          
          {discordId && (
            <>
              <ContextMenuItem onClick={() => copyToClipboard(discordId)}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Discord ID
              </ContextMenuItem>
              <ContextMenuItem onClick={() => window.open(`https://discord.com/users/${discordId}`, '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Discord Profile
              </ContextMenuItem>
            </>
          )}
          
          {identifiers?.steam && (
            <ContextMenuItem onClick={() => copyToClipboard(identifiers.steam!)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy Steam ID
            </ContextMenuItem>
          )}
          
          {identifiers?.license && (
            <ContextMenuItem onClick={() => copyToClipboard(identifiers.license!)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy FiveM License
            </ContextMenuItem>
          )}
          
          {identifiers?.fivem && (
            <ContextMenuItem onClick={() => copyToClipboard(identifiers.fivem!)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy FiveM ID
            </ContextMenuItem>
          )}
          
          {cheater.evidence_url && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => window.open(cheater.evidence_url!, '_blank')}>
                <Eye className="w-4 h-4 mr-2" />
                View Evidence
              </ContextMenuItem>
            </>
          )}
          
          <ContextMenuSeparator />
          
          <ContextMenuItem onClick={() => {
            const allIds = [
              cheater.player_name,
              discordId ? `Discord: ${discordId}` : null,
              identifiers?.steam ? `Steam: ${identifiers.steam}` : null,
              identifiers?.license ? `License: ${identifiers.license}` : null,
              identifiers?.fivem ? `FiveM: ${identifiers.fivem}` : null,
            ].filter(Boolean).join('\n');
            copyToClipboard(allIds);
          }}>
            <Info className="w-4 h-4 mr-2" />
            Copy All Info
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="min-h-screen bg-background relative">
      <MaintenanceBanner />
      <ParticleBackground />
      <AppHeader />
      
      <div className="container mx-auto px-4 py-4 max-w-6xl relative z-10">

        {/* Hero & Stats - hidden when searching */}
        {!hasSearched && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/60 block leading-none mb-0.5">
                    CurlyKidd
                  </span>
                  <span className="text-xs font-semibold text-foreground/80">
                    Anti-Cheat Intelligence
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Combined connection indicator */}
                <motion.div 
                  className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-card/60 border border-border/30 backdrop-blur-sm cursor-pointer"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => { fetchSxStats(); fetchDbStats(); }}
                  title="Click to refresh status"
                >
                  {sxStats.connected ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <span className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_8px_hsl(var(--destructive)/0.5)]" />}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {sxStats.connected ? 'Service' : 'Service Offline'}
                  </span>
                  {sxStats.connected && sxStats.latency && (
                    <span className={`text-[10px] font-mono ${sxStats.latency < 300 ? 'text-emerald-400' : sxStats.latency < 800 ? 'text-yellow-400' : 'text-orange-400'}`}>
                      {sxStats.latency}ms
                    </span>
                  )}
                  <span className="w-px h-4 bg-border/50" />
                  {dbStats.connected ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <span className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_8px_hsl(var(--destructive)/0.5)]" />}
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {dbStats.connected ? 'Database' : 'DB Offline'}
                  </span>
                  {dbStats.connected && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      {dbStats.tableCount} tables
                    </span>
                  )}
                  {dbStats.connected && dbStats.latency && (
                    <span className={`text-[10px] font-mono ${dbStats.latency < 300 ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {dbStats.latency}ms
                    </span>
                  )}
                </motion.div>
                
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground h-8 px-3">
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExportJSON}>
                        <FileJson className="w-4 h-4 mr-2" />
                        Export as JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportCSV}>
                        <FileText className="w-4 h-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Hero */}
            <div className="text-center mb-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05, duration: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-8"
              >
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary">Verified Data Sources</span>
              </motion.div>

              <motion.h1 
                className="font-display text-5xl md:text-6xl lg:text-[5.5rem] font-black text-foreground tracking-[-0.03em] leading-[0.85]"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.7 }}
              >
                Cheater
                <br />
                <span className="relative">
                  <span className="bg-gradient-to-r from-primary via-[hsl(var(--cyan-glow))] to-primary bg-clip-text text-transparent">
                    Database
                  </span>
                  <span className="absolute -inset-x-4 -inset-y-2 bg-primary/5 blur-3xl rounded-full pointer-events-none" />
                </span>
              </motion.h1>
              
              <motion.p 
                className="text-muted-foreground/60 text-sm md:text-base mt-6 max-w-md mx-auto leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                Cross-referenced screening intelligence across Discord, Steam, FiveM, and license identifiers.
              </motion.p>
            </div>

            {/* Stats Cards */}
            <motion.div 
              className="max-w-3xl mx-auto mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
            >
              <div className="grid grid-cols-3 gap-4">
                {[
                  { 
                    label: 'Total Reports', 
                    value: statsOverrides.total ?? stats.total, 
                    icon: Shield,
                    gradient: 'from-foreground/10 to-foreground/5',
                    iconColor: 'text-foreground/70',
                    valueColor: 'text-foreground',
                    glowColor: 'shadow-[0_0_30px_hsl(var(--foreground)/0.05)]',
                  },
                  { 
                    label: 'Confirmed', 
                    value: statsOverrides.confirmed ?? stats.confirmed, 
                    icon: ShieldCheck,
                    gradient: 'from-primary/15 to-primary/5',
                    iconColor: 'text-primary',
                    valueColor: 'text-primary',
                    glowColor: 'shadow-[0_0_30px_hsl(var(--primary)/0.1)]',
                  },
                  { 
                    label: 'Suspected', 
                    value: statsOverrides.suspected ?? stats.suspected, 
                    icon: AlertTriangle,
                    gradient: 'from-[hsl(var(--yellow))]/15 to-[hsl(var(--yellow))]/5',
                    iconColor: 'text-[hsl(var(--yellow))]',
                    valueColor: 'text-[hsl(var(--yellow))]',
                    glowColor: 'shadow-[0_0_30px_hsl(var(--yellow)/0.1)]',
                  },
                ].map((stat, i) => (
                  <motion.div 
                    key={i} 
                    className="relative group"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                    whileHover={{ y: -4, scale: 1.02 }}
                  >
                    {/* Glow effect */}
                    <div className={`absolute inset-0 rounded-2xl ${stat.glowColor} opacity-0 group-hover:opacity-100 transition-all duration-300`} />
                    
                    <div className={`relative rounded-2xl border border-border/30 bg-gradient-to-b ${stat.gradient} backdrop-blur-xl p-6 text-center hover:border-border/60 transition-all duration-300`}>
                      <p className={`text-3xl md:text-4xl font-black tabular-nums tracking-tight ${stat.valueColor}`}>
                        <AnimatedCounter value={stat.value} />
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mt-2 font-semibold">
                        {stat.label}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Trust bar */}
            <motion.div
              className="flex items-center justify-center gap-6 text-muted-foreground/40 text-[11px] font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
            >
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary/50" />
                <span>Verified data sources</span>
              </div>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
              <div className="flex items-center gap-1.5">
                <Fingerprint className="w-3.5 h-3.5 text-primary/50" />
                <span>Multi-identifier cross-reference</span>
              </div>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary/50" />
                <span>Real-time updates</span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Search Bar */}
        <motion.div 
          className={`${hasSearched ? '' : 'max-w-2xl mx-auto'} mb-8`}
          layout
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Search type hints */}
          {!hasSearched && (
            <motion.div 
              className="flex items-center justify-center gap-3 mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              <TooltipProvider>
                {[
                  { icon: (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                  ), label: 'Discord' },
                  { icon: (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0z"/></svg>
                  ), label: 'Steam' },
                  { icon: <Database className="w-3.5 h-3.5" />, label: 'FiveM' },
                  { icon: <Fingerprint className="w-3.5 h-3.5" />, label: 'License' },
                ].map((item, i) => (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/40 border border-border/20 text-muted-foreground/50 hover:text-muted-foreground hover:border-border/40 transition-all duration-200 cursor-default">
                        {item.icon}
                        <span className="text-[11px] font-medium">{item.label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Search by {item.label} identifier
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </motion.div>
          )}

          <div className="relative group">
            {/* Outer glow */}
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/20 via-[hsl(var(--cyan-glow))]/10 to-primary/20 opacity-0 group-focus-within:opacity-100 transition-all duration-300 blur-lg" />
            
            <div className="relative flex items-center bg-card/70 backdrop-blur-xl border border-border/40 rounded-2xl overflow-hidden focus-within:border-primary/50 transition-all duration-300 shadow-lg shadow-black/10">
              <div className="pl-5 pr-2 pointer-events-none">
                <Search className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <Input
                placeholder="Search by name, Discord ID, Steam, FiveM, or license..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="border-0 bg-transparent h-14 md:h-16 text-base focus-visible:ring-0 focus-visible:ring-offset-0 px-3 placeholder:text-muted-foreground/30"
              />
              <div className="pr-3">
                <Button 
                  onClick={handleSearch} 
                  disabled={isLoading}
                  size="sm"
                  className="h-10 md:h-11 px-6 rounded-xl font-semibold text-sm bg-gradient-to-r from-primary to-[hsl(var(--cyan-glow))] hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] transition-all duration-300 text-primary-foreground"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching...</>
                  ) : (
                    <><Search className="w-4 h-4 mr-2" /> Search</>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Keyboard hint */}
          {!hasSearched && (
            <motion.p 
              className="text-center text-[11px] text-muted-foreground/30 mt-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              Press <kbd className="px-1.5 py-0.5 rounded bg-card/60 border border-border/30 text-muted-foreground/50 font-mono text-[10px]">Enter</kbd> to search
            </motion.p>
          )}
        </motion.div>

        {/* External Screening Results */}
        {hasSearched && (sxLoading || sxResult || sxError) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 space-y-4"
          >

            {sxLoading && (
              <div className="glass-card p-8 flex items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Querying external database...</span>
              </div>
            )}

            {sxError && (
              <div className="glass-card p-5 border border-destructive/20">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Could not reach external source: {sxError}
                </p>
              </div>
            )}

            {sxResult && (() => {
              // Handle structured API response
              const tickets = Array.isArray(sxResult.tickets) ? sxResult.tickets : [];
              const ticketsV2 = Array.isArray(sxResult.tickets_v2) ? sxResult.tickets_v2 : [];
              const guildJoinLeave = Array.isArray(sxResult.guild_join_leave) ? sxResult.guild_join_leave : [];
              const confirmedUser = Array.isArray(sxResult.confirmed_user) ? sxResult.confirmed_user : [];
              const guildIcons: Record<string, string> = sxResult.guild_icons || {};
              const summary = sxResult.summary || {};
              const userInfo = sxResult.user || {};
              const isFlagged = sxResult.flagged || summary.is_flagged;
              
              const totalRecords = tickets.length + ticketsV2.length + guildJoinLeave.length + confirmedUser.length;
              const discordId = userInfo.discord_id || searchQuery;
              const discordUser =
                (sxDiscordUser && typeof sxDiscordUser === 'object' ? sxDiscordUser : null) ||
                (sxResult.discord_user && typeof sxResult.discord_user === 'object' ? sxResult.discord_user : null) ||
                {};
              const hasDiscordProfile = Object.keys(discordUser).length > 0;

              if (totalRecords === 0 && !isFlagged && !hasDiscordProfile) {
                return (
                  <div className="glass-card p-8 text-center">
                    <CheckCircle className="w-10 h-10 mx-auto mb-3 text-[hsl(var(--green))] opacity-60" />
                    <p className="text-foreground font-medium">No Records Found</p>
                    <p className="text-sm text-muted-foreground mt-1">This user has no entries in the external screening database</p>
                  </div>
                );
              }
              
              // Calculate Discord account creation date from snowflake ID
              const getDiscordCreatedDate = (id: string) => {
                try {
                  const snowflake = BigInt(id);
                  const timestamp = Number(snowflake >> BigInt(22)) + 1420070400000;
                  return new Date(timestamp);
                } catch { return null; }
              };
              const createdDate = getDiscordCreatedDate(String(discordId));
              const username = discordUser.global_name || discordUser.username
                || guildJoinLeave.find((r: any) => r.memberUsername && r.memberUsername !== r.memberId)?.memberUsername 
                || tickets.find((r: any) => r.memberUsername && r.memberUsername !== 'Unknown')?.memberUsername 
                || 'Unknown';
              
              // Build avatar URL from Discord API data
              const avatarUrl = discordUser.avatar 
                ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.${String(discordUser.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`
                : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(String(discordId)) % BigInt(5))}.png`;

              const formatTime = (time: string) => {
                try {
                  const d = new Date(time);
                  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                } catch { return String(time); }
              };

              const getActionBadge = (action: string) => {
                const lower = (action || '').toLowerCase();
                let className = 'bg-muted text-muted-foreground border-border';
                if (lower.includes('created') || lower.includes('join')) className = 'bg-[hsl(var(--green))]/15 text-[hsl(var(--green))] border-[hsl(var(--green))]/30';
                if (lower.includes('leave') || lower.includes('left')) className = 'bg-destructive/15 text-destructive border-destructive/30';
                if (lower.includes('ban') || lower.includes('kick')) className = 'bg-destructive/20 text-destructive border-destructive/40';
                if (lower.includes('warn')) className = 'bg-[hsl(var(--yellow))]/15 text-[hsl(var(--yellow))] border-[hsl(var(--yellow))]/30';
                return <Badge variant="outline" className={`text-xs font-medium ${className}`}>{String(action)}</Badge>;
              };

              const getGameBadge = (games: any, guildname?: string) => {
                let gameStr = games ? String(games) : '';
                if (!gameStr || gameStr === 'null') {
                  // Infer FiveM from guild context (External source is primarily FiveM-focused)
                  if (guildname) gameStr = 'FiveM';
                  else return null;
                }
                const color = gameStr.toLowerCase().includes('fivem') 
                  ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' 
                  : 'bg-primary/15 text-primary border-primary/30';
                return <Badge variant="outline" className={`text-xs ${color}`}>{gameStr}</Badge>;
              };

              // Build Discord badge list from public_flags
              const discordBadges: { name: string; emoji: string; color: string }[] = [];
              const flags = typeof discordUser.public_flags === 'number'
                ? discordUser.public_flags
                : typeof discordUser.flags === 'number'
                  ? discordUser.flags
                  : 0;
              const premiumType = typeof discordUser.premium_type === 'number'
                ? discordUser.premium_type
                : Number(discordUser.premium_type || 0);
              if ((flags & 1) !== 0) discordBadges.push({ name: 'Discord Staff', emoji: '⚙️', color: '#5865F2' });
              if ((flags & 2) !== 0) discordBadges.push({ name: 'Partnered Server Owner', emoji: '🤝', color: '#5865F2' });
              if ((flags & 4) !== 0) discordBadges.push({ name: 'HypeSquad Events', emoji: '🏠', color: '#f47b67' });
              if ((flags & 8) !== 0) discordBadges.push({ name: 'Bug Hunter Level 1', emoji: '🐛', color: '#3ba55c' });
              if ((flags & 16384) !== 0) discordBadges.push({ name: 'Bug Hunter Level 2', emoji: '🐛', color: '#f8d44c' });
              if ((flags & 64) !== 0) discordBadges.push({ name: 'HypeSquad Bravery', emoji: '🟣', color: '#9c84ef' });
              if ((flags & 128) !== 0) discordBadges.push({ name: 'HypeSquad Brilliance', emoji: '🟠', color: '#f47b67' });
              if ((flags & 256) !== 0) discordBadges.push({ name: 'HypeSquad Balance', emoji: '🟢', color: '#45ddc0' });
              if ((flags & 512) !== 0) discordBadges.push({ name: 'Early Supporter', emoji: '💎', color: '#7289da' });
              if ((flags & 131072) !== 0) discordBadges.push({ name: 'Early Verified Bot Developer', emoji: '🤖', color: '#5865F2' });
              if ((flags & 4194304) !== 0) discordBadges.push({ name: 'Active Developer', emoji: '🔨', color: '#23a55a' });
              if ((flags & 262144) !== 0) discordBadges.push({ name: 'Discord Certified Moderator', emoji: '🛡️', color: '#5865F2' });
              if (premiumType === 1) discordBadges.push({ name: 'Nitro Classic', emoji: '💜', color: '#f47fff' });
              if (premiumType === 2) discordBadges.push({ name: 'Nitro', emoji: '🚀', color: '#f47fff' });
              if (premiumType === 3) discordBadges.push({ name: 'Nitro Basic', emoji: '💜', color: '#f47fff' });

              // Shared section styling
              const sectionClass = "rounded-xl overflow-hidden bg-card/40 backdrop-blur-xl border border-border/30 shadow-lg shadow-black/10 hover:border-border/50 transition-all duration-300";
              const sectionHeaderClass = "px-5 py-3.5 border-b border-border/20 flex items-center justify-between";
              const sectionTitleClass = "text-sm font-semibold text-foreground flex items-center gap-2";
              const tableHeaderClass = "text-left text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-[0.12em] px-5 py-3";
              const tableCellClass = "px-5 py-3.5";
              const tableRowClass = "border-b border-border/10 hover:bg-primary/[0.03] transition-colors duration-200";

              return (
                <>
                  {/* Discord Profile Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className={sectionClass}
                  >
                    <div className="p-5">
                      <div className="flex items-center gap-4 mb-4">
                        <Avatar className="w-[64px] h-[64px]">
                          <AvatarImage src={avatarUrl} alt={username} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <AvatarFallback className="bg-primary/20 text-primary font-bold text-xl">
                            {(username || '?').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{username}</h3>
                          {discordUser.username && (
                            <span className="text-sm text-muted-foreground">{discordUser.username}</span>
                          )}
                        </div>
                      </div>

                      {discordUser.bio && (
                        <>
                          <div className="h-px bg-border/20 my-3" />
                          <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{discordUser.bio}</p>
                        </>
                      )}

                      <div className="h-px bg-border/20 my-3" />
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] mb-1.5">Member Since</h4>
                          {createdDate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-primary/60" />
                              <span className="text-[13px] text-foreground font-medium">
                                {createdDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-[11px] text-muted-foreground/50">({formatDistanceToNow(createdDate, { addSuffix: true })})</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] mb-1.5">Discord ID</h4>
                          <div className="flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 text-primary/60" />
                            <span className="text-[13px] font-mono text-foreground select-all">{String(discordId)}</span>
                            <button onClick={() => copyToClipboard(String(discordId))} className="text-muted-foreground/40 hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted/50">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {totalRecords === 0 && !isFlagged && (
                      <div className="mx-5 mb-5 rounded-lg border border-border/20 bg-muted/10 px-4 py-2.5 text-xs text-muted-foreground/60">
                        No screening records found — only public Discord profile data is available for this user.
                      </div>
                    )}

                    {/* Bottom bar */}
                    <div className="flex items-center justify-between px-5 pb-4 border-t border-border/10 pt-3">
                      <div />
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px] bg-card/40 border-border/30 text-foreground/70 font-medium px-2.5 py-1">
                          {(summary.total_tickets || 0) + (summary.total_tickets_v2 || 0)} tickets · {summary.total_guild_records || 0} guilds
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1.5 border-border/30 text-muted-foreground hover:text-foreground hover:bg-card/60 font-medium backdrop-blur-sm"
                          onClick={() => window.open(`https://discord.com/users/${discordId}`, '_blank')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open in Discord
                        </Button>
                      </div>
                    </div>
                  </motion.div>

                  {/* Current Guild Memberships */}
                  {(() => {
                    const currentGuilds = guildJoinLeave.filter((r: any) => !r.left_at);
                    if (currentGuilds.length === 0) return null;
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.08 }}
                        className={sectionClass}
                      >
                        <div className={sectionHeaderClass}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)] animate-pulse" />
                            <h4 className={sectionTitleClass}>Active Memberships</h4>
                            <Badge variant="outline" className="text-[10px] border-border/30 bg-card/40 text-muted-foreground font-medium">{currentGuilds.length}</Badge>
                          </div>
                        </div>
                        <div className="p-3 space-y-1">
                          {currentGuilds.map((r: any, i: number) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-primary/[0.04] transition-all duration-200 group"
                            >
                              {guildIcons[String(r.guildid)] ? (
                                <img 
                                  src={guildIcons[String(r.guildid)]} 
                                  alt={String(r.guildname || '?')}
                                  className="w-9 h-9 rounded-lg object-cover ring-1 ring-border/20"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as HTMLElement).style.removeProperty('display'); }}
                                />
                              ) : null}
                              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0" style={guildIcons[String(r.guildid)] ? { display: 'none' } : {}}>
                                <span className="text-primary font-bold text-sm">{String(r.guildname || '?').charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground break-words">{String(r.guildname || 'Unknown')}</p>
                                {r.joined_at && (
                                  <p className="text-[11px] text-muted-foreground/50">
                                    Joined {formatDistanceToNow(new Date(r.joined_at), { addSuffix: true })}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.4)]" />
                                <span className="text-[11px] font-medium text-primary">Active</span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })()}

                  {/* Confirmed User Records */}
                  {confirmedUser.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.12 }}
                      className={`${sectionClass} border-destructive/20`}
                    >
                      <div className={`${sectionHeaderClass} bg-destructive/[0.03]`}>
                        <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Confirmed Cheater
                        </h4>
                        <Badge variant="outline" className="text-[10px] border-destructive/20 bg-destructive/10 text-destructive font-medium">{confirmedUser.length}</Badge>
                      </div>
                      <div className="p-4 space-y-2">
                        {confirmedUser.map((r: any, i: number) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/[0.04] border border-destructive/10 hover:bg-destructive/[0.07] transition-colors duration-200"
                          >
                            <span className="text-sm text-foreground font-medium">{String(r.reason || r.action || 'Confirmed cheater')}</span>
                            {r.games && getGameBadge(r.games)}
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Ticket Data Table */}
                  {tickets.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.16 }}
                      className={sectionClass}
                    >
                      <div className={sectionHeaderClass}>
                        <div>
                          <h4 className={sectionTitleClass}>Ticket Data</h4>
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Screening ticket history</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-border/30 bg-card/40 text-muted-foreground font-medium">{tickets.length}</Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border/15">
                              <th className={tableHeaderClass}>Time</th>
                              <th className={tableHeaderClass}>Ticket Name</th>
                              <th className={tableHeaderClass}>Action</th>
                              <th className={tableHeaderClass}>Guild</th>
                              <th className={tableHeaderClass}>Games</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tickets.map((r: any, i: number) => (
                              <motion.tr
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.03 }}
                                className={tableRowClass}
                              >
                                <td className={`${tableCellClass} text-sm text-muted-foreground/70 whitespace-nowrap`}>{formatTime(r.time)}</td>
                                <td className={`${tableCellClass} text-sm font-mono text-foreground/80`}>{String(r.channelname || '—')}</td>
                                <td className={tableCellClass}>{getActionBadge(r.action)}</td>
                                <td className={tableCellClass}>
                                  <div>
                                    <span className="text-sm text-foreground/80">{String(r.guildname || '—')}</span>
                                    {r.guildid && <p className="text-[11px] text-muted-foreground/40 font-mono">{String(r.guildid)}</p>}
                                  </div>
                                </td>
                                <td className={tableCellClass}>{getGameBadge(r.games, r.guildname)}</td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {/* Tickets V2 Data Table */}
                  {ticketsV2.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 }}
                      className={sectionClass}
                    >
                      <div className={sectionHeaderClass}>
                        <div>
                          <h4 className={sectionTitleClass}>Ticket Data V2</h4>
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Extended screening ticket history</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-border/30 bg-card/40 text-muted-foreground font-medium">{ticketsV2.length}</Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border/15">
                              <th className={tableHeaderClass}>Time</th>
                              <th className={tableHeaderClass}>Ticket Name</th>
                              <th className={tableHeaderClass}>Action</th>
                              <th className={tableHeaderClass}>Guild</th>
                              <th className={tableHeaderClass}>Games</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ticketsV2.map((r: any, i: number) => (
                              <motion.tr
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.03 }}
                                className={tableRowClass}
                              >
                                <td className={`${tableCellClass} text-sm text-muted-foreground/70 whitespace-nowrap`}>{formatTime(r.time || r.created_at)}</td>
                                <td className={`${tableCellClass} text-sm font-mono text-foreground/80`}>{String(r.channelname || r.ticket_name || '—')}</td>
                                <td className={tableCellClass}>{getActionBadge(r.action || r.status)}</td>
                                <td className={tableCellClass}>
                                  <div>
                                    <span className="text-sm text-foreground/80">{String(r.guildname || r.guild_name || '—')}</span>
                                    {(r.guildid || r.guild_id) && <p className="text-[11px] text-muted-foreground/40 font-mono">{String(r.guildid || r.guild_id)}</p>}
                                  </div>
                                </td>
                                <td className={tableCellClass}>{getGameBadge(r.games, r.guildname || r.guild_name)}</td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {/* Guild Join/Leave Table */}
                  {guildJoinLeave.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.24 }}
                      className={sectionClass}
                    >
                      <div className={sectionHeaderClass}>
                        <div>
                          <h4 className={sectionTitleClass}>Guild Activity</h4>
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Server join/leave history</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-border/30 bg-card/40 text-muted-foreground font-medium">{guildJoinLeave.length}</Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border/15">
                              <th className={tableHeaderClass}>Time</th>
                              <th className={tableHeaderClass}>Action</th>
                              <th className={tableHeaderClass}>Guild</th>
                              <th className={tableHeaderClass}>Username</th>
                            </tr>
                          </thead>
                          <tbody>
                            {guildJoinLeave.flatMap((r: any, i: number) => {
                              const rows: React.ReactNode[] = [];
                              if (r.left_at) {
                                rows.push(
                                  <motion.tr
                                    key={`${i}-leave`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.03 }}
                                    className={tableRowClass}
                                  >
                                    <td className={`${tableCellClass} text-sm text-muted-foreground/70 whitespace-nowrap`}>{formatTime(r.left_at)}</td>
                                    <td className={tableCellClass}><Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">Guild Leave</Badge></td>
                                    <td className={tableCellClass}>
                                      <div>
                                        <span className="text-sm font-medium text-foreground/80">{String(r.guildname || '—')}</span>
                                        {r.guildid && <p className="text-[11px] text-muted-foreground/40 font-mono">{String(r.guildid)}</p>}
                                      </div>
                                    </td>
                                    <td className={`${tableCellClass} text-sm text-muted-foreground/70`}>{String(r.memberUsername || '—')}</td>
                                  </motion.tr>
                                );
                              }
                              if (r.joined_at) {
                                rows.push(
                                  <motion.tr
                                    key={`${i}-join`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.03 }}
                                    className={tableRowClass}
                                  >
                                    <td className={`${tableCellClass} text-sm text-muted-foreground/70 whitespace-nowrap`}>{formatTime(r.joined_at)}</td>
                                    <td className={tableCellClass}><Badge variant="outline" className="text-xs bg-[hsl(var(--green))]/10 text-[hsl(var(--green))] border-[hsl(var(--green))]/20">Guild Join</Badge></td>
                                    <td className={tableCellClass}>
                                      <div>
                                        <span className="text-sm font-medium text-foreground/80">{String(r.guildname || '—')}</span>
                                        {r.guildid && <p className="text-[11px] text-muted-foreground/40 font-mono">{String(r.guildid)}</p>}
                                      </div>
                                    </td>
                                    <td className={`${tableCellClass} text-sm text-muted-foreground/70`}>{String(r.memberUsername || '—')}</td>
                                  </motion.tr>
                                );
                              }
                              return rows;
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </>
              );
            })()}
          </motion.div>
        )}


        {hasSearched && (isLoading || sxLoading) && (
          <div className="rounded-xl border border-border/30 bg-card/30 backdrop-blur-sm p-16 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 text-primary animate-spin" />
            <h3 className="text-base font-semibold text-foreground mb-1">Scanning databases...</h3>
            <p className="text-xs text-muted-foreground/60">Cross-referencing multiple sources</p>
          </div>
        )}

        {hasSearched && !isLoading && !sxLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {results.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-5 rounded-full bg-primary" />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    {results.length} {results.length === 1 ? 'Match' : 'Matches'} Found
                  </h2>
                </div>
                <div className="space-y-3">
                  {results.map((cheater) => renderCheaterCard(cheater, true))}
                </div>
              </>
            )}

            {results.length === 0 && !sxResult && !isLoading && !sxLoading && (
              <div className="rounded-xl border border-border/30 bg-card/30 backdrop-blur-sm p-16 text-center">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle className="w-7 h-7 text-primary/60" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5">No Records Found</h3>
                <p className="text-sm text-muted-foreground/60 max-w-xs mx-auto">
                  "{searchQuery}" has no reports in our database. This doesn't guarantee they're legitimate.
                </p>
              </div>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
};

export default CheaterSearch;
