import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore, getPhaseLabel } from '@/stores/scanStore';
import { useI18n } from '@/lib/i18n';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { AnimatedStat } from '@/components/AnimatedStat';
import ServerCard, { type BotServer, type ServerScanSummary, timeAgo } from '@/components/bot/ServerCard';

import {
  Bot, Plus, Trash2, Shield, ExternalLink, Copy, Loader2, Search,
  CheckCircle, XCircle, Webhook, Server, Power, PowerOff, Users,
  Zap, Settings, Settings2, Activity, Clock, AlertTriangle, Sparkles, Pencil,
  Download, Globe, Hash, Calendar, BarChart3, Eye, Radio, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { supabase } from '@/lib/supabase';
import { pingRpc } from '@/lib/connectionCache';
import { claimImportedDataForCurrentUser } from '@/lib/claimImportedData';
import { toast } from 'sonner';
import AppHeader from '@/components/AppHeader';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import { z } from 'zod';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { useAuthReady } from '@/hooks/useAuthReady';

// Lazy-load heavy components that aren't needed on initial render
const ParticleBackground = lazy(() => import('@/components/ParticleBackground'));
const BotExportDialog = lazy(() => import('@/components/BotExportDialog'));
const ScanHistory = lazy(() => import('@/components/ScanHistory'));
const ShareServerDialog = lazy(() => import('@/components/bot/ShareServerDialog'));
const ServerDetailPanel = lazy(() => import('@/components/bot/ServerDetailPanel'));

const BOT_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1491049580005949622&permissions=536871985&integration_type=0&scope=bot';

// BotServer type is imported from ServerCard

const serverSchema = z.object({
  guild_id: z.string().trim().regex(/^\d{17,20}$/, 'Invalid Discord Server ID'),
  guild_name: z.string().trim().min(1, 'Server name is required').max(100),
  webhook_url: z.string().trim().url('Invalid URL').regex(/^https:\/\/discord\.com\/api\/webhooks\//, 'Must be a Discord webhook URL'),
  alert_channel_name: z.string().trim().max(100).optional(),
});

// timeAgo is imported from ServerCard

// ServerScanSummary type is imported from ServerCard

const BotSetup = () => {
  const { isAdmin } = useAdminStatus();
  const { isReady, isAuthenticated } = useAuthReady();
  const { t } = useI18n();
  const [servers, setServers] = useState<BotServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [lastScanResults, setLastScanResults] = useState<Record<string, ServerScanSummary>>({});
  const [detectedCheaters, setDetectedCheaters] = useState<any[]>([]);
  const [detectedLoading, setDetectedLoading] = useState(false);
  const [totalCheatersFound, setTotalCheatersFound] = useState(0);
  const [recentJoins, setRecentJoins] = useState<any[]>([]);
  const [joinsLoading, setJoinsLoading] = useState(false);
  const [joinsFilter, setJoinsFilter] = useState<'all' | 'cheaters'>('all');
  const [joinsSort, setJoinsSort] = useState<'newest' | 'oldest'>('newest');
  const [expandedJoinsServer, setExpandedJoinsServer] = useState<string | null>(null);
  const [expandedJoinId, setExpandedJoinId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareServerId, setShareServerId] = useState<string | null>(null);
  const [shareServerName, setShareServerName] = useState('');
  const [ownedServerIds, setOwnedServerIds] = useState<Set<string>>(new Set());
  const scanStore = useScanStore();
  const isScanning = scanStore.scanServerId;
  const [elapsedTick, setElapsedTick] = useState(0);
  const [sxStats, setSxStats] = useState<{ connected: boolean; latency: number | null }>({ connected: false, latency: null });
  const [dbStats, setDbStats] = useState<{ connected: boolean; tableCount: number; latency: number | null }>({ connected: false, tableCount: 0, latency: null });

  const fetchSxStats = useCallback(async () => {
    try {
      const { connected, latency } = await pingRpc('get_cheater_stats');
      setSxStats(connected ? { connected: true, latency } : { connected: false, latency: null });
    } catch {
      setSxStats({ connected: false, latency: null });
    }
  }, []);

  const fetchDbStats = useCallback(async () => {
    try {
      const { connected, latency } = await pingRpc('get_public_tables');
      if (connected) {
        const { data } = await supabase.rpc('get_public_tables');
        setDbStats({ connected: true, tableCount: data?.length || 0, latency });
      } else {
        setDbStats({ connected: false, tableCount: 0, latency: null });
      }
    } catch {
      setDbStats({ connected: false, tableCount: 0, latency: null });
    }
  }, []);

  useEffect(() => {
    // Defer connectivity checks to not block initial render
    const timer = setTimeout(() => {
      Promise.all([fetchDbStats(), fetchSxStats()]);
    }, 2000);
    const interval = setInterval(fetchSxStats, 120000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [fetchSxStats, fetchDbStats]);

  // Tick every second while scanning so elapsed/progress update live
  useEffect(() => {
    if (!scanStore.isScanning) return;
    const iv = setInterval(() => setElapsedTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [scanStore.isScanning]);
  const [isVerifying, setIsVerifying] = useState<string | null>(null);
  const navigate = useNavigate();

  // Edit state
  const [editServer, setEditServer] = useState<BotServer | null>(null);
  const [detailServer, setDetailServer] = useState<BotServer | null>(null);
  const [editGuildName, setEditGuildName] = useState('');
  const [editWebhookUrl, setEditWebhookUrl] = useState('');
  const [editManualWebhookUrl, setEditManualWebhookUrl] = useState('');
  const [editChannelName, setEditChannelName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Form fields
  const [guildId, setGuildId] = useState('');
  const [guildName, setGuildName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [manualWebhookUrl, setManualWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');

  // Auto-import from Discord
  const [availableGuilds, setAvailableGuilds] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(false);
  const [addMode, setAddMode] = useState<'auto' | 'manual'>('auto');

  // Ownership verification
  const [discordUserId, setDiscordUserId] = useState('');
  const [isVerifyingOwnership, setIsVerifyingOwnership] = useState(false);
  const [ownershipVerified, setOwnershipVerified] = useState<{ guildId: string; username: string | null } | null>(null);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);

  // Fetch saved Discord User ID from profile
  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('discord_user_id')
        .eq('user_id', session.session.user.id)
        .maybeSingle();
      if (profile?.discord_user_id) {
        setDiscordUserId(profile.discord_user_id);
      }
    })();
  }, []);

  // Save Discord ID to profile after successful verification
  const saveDiscordIdToProfile = useCallback(async (id: string) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) return;
    await supabase
      .from('profiles')
      .update({ discord_user_id: id } as any)
      .eq('user_id', session.session.user.id);
  }, []);

  const fetchGuilds = useCallback(() => {
    setIsLoadingGuilds(true);
    supabase.functions.invoke('discord-member-check', { body: { action: 'list-guilds' } })
      .then(({ data }) => {
        if (data?.success && data.guilds) {
          setAvailableGuilds(data.guilds);
        } else {
          setAvailableGuilds([]);
        }
      })
      .catch(() => {
        setAvailableGuilds([]);
        toast.error('Could not fetch servers from Discord');
      })
      .finally(() => setIsLoadingGuilds(false));
  }, []);

  const verifyOwnership = useCallback(async (targetGuildId: string, userDiscordId: string) => {
    if (!userDiscordId.match(/^\d{17,20}$/)) {
      setOwnershipError('Ugyldigt Discord User ID format');
      return;
    }
    setIsVerifyingOwnership(true);
    setOwnershipError(null);
    setOwnershipVerified(null);
    try {
      const { data, error } = await supabase.functions.invoke('discord-member-check', {
        body: { action: 'verify-ownership', guildId: targetGuildId, discordUserId: userDiscordId },
      });
      if (error || !data?.success) {
        setOwnershipError(data?.error || 'Verification failed');
      } else if (!data.verified) {
        setOwnershipError('You do not have admin/manage permissions on this server');
      } else {
        setOwnershipVerified({ guildId: targetGuildId, username: data.username });
        toast.success(`Verified as ${data.username || userDiscordId} ✓`);
        // Save Discord ID to profile for future use
        saveDiscordIdToProfile(userDiscordId);
      }
    } catch {
      setOwnershipError('Verification failed - try again');
    }
    setIsVerifyingOwnership(false);
  }, []);

  const openAddDialog = useCallback(() => {
    setAddDialogOpen(true);
    setAddMode('auto');
    setOwnershipVerified(null);
    setOwnershipError(null);
    setDiscordUserId('');
    fetchGuilds();
  }, [fetchGuilds]);

  const fetchLastScanResults = useCallback(async (serverIds: string[]) => {
    if (serverIds.length === 0) {
      setLastScanResults({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from('scan_history')
        .select('server_id, total_checked, total_skipped, total_alerts, total_members, total_failed, finished_at')
        .in('server_id', serverIds)
        .order('finished_at', { ascending: false })
        .limit(serverIds.length * 5);

      if (!error && data) {
        const grouped = (data as any[]).reduce<Record<string, any[]>>((acc, row) => {
          (acc[row.server_id] ||= []).push(row);
          return acc;
        }, {});

        const latest = Object.entries(grouped).reduce<Record<string, ServerScanSummary>>((acc, [serverId, rows]) => {
          const preferred = rows.find((row) => !(row.total_checked > 0 && row.total_failed >= row.total_checked)) || rows[0];
          acc[serverId] = {
            checked: preferred.total_checked,
            skipped: preferred.total_skipped,
            alerts: preferred.total_alerts,
            totalMembers: preferred.total_members,
            time: new Date(preferred.finished_at),
          };
          return acc;
        }, {});

        setLastScanResults(latest);
      }
    } catch {}
  }, []);

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      setIsLoading(false);
      return;
    }

    const userId = session.session.user.id;
    await claimImportedDataForCurrentUser(userId);

    const { data, error } = await supabase
      .from('discord_bot_servers')
      .select('id, user_id, guild_id, guild_name, guild_icon, member_count, webhook_url, manual_webhook_url, auto_scan_webhook_url, full_scan_webhook_url, info_channel_id, alert_channel_name, is_active, last_checked_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchServers: Error fetching owned servers', error);
      setIsLoading(false);
      return;
    }

    const ownedData = data || [];
    const ownedIds = new Set<string>(ownedData.map((s: any) => s.id as string));

    // Also fetch shared servers
    const { data: shares } = await supabase
      .from('server_shares')
      .select('server_id')
      .eq('shared_with', userId);

    let allServers = [...ownedData];

    if (shares && shares.length > 0) {
      const sharedServerIds = shares.map((s: any) => s.server_id).filter((id: string) => !ownedIds.has(id));
      if (sharedServerIds.length > 0) {
        const { data: sharedServers } = await supabase
          .from('discord_bot_servers')
          .select('id, user_id, guild_id, guild_name, guild_icon, member_count, webhook_url, manual_webhook_url, auto_scan_webhook_url, full_scan_webhook_url, info_channel_id, alert_channel_name, is_active, last_checked_at, created_at')
          .in('id', sharedServerIds)
          .order('created_at', { ascending: false });
        if (sharedServers) allServers = [...allServers, ...sharedServers];
      }
    }

    setOwnedServerIds(ownedIds);
    setServers(allServers);
    fetchLastScanResults(allServers.map((server) => server.id));
    setIsLoading(false);

    // Refresh guild info in background (non-blocking, after initial render)
    supabase.functions.invoke('discord-member-check', {
      body: { action: 'fetch-icons' },
    }).then(async () => {
      const { data: refreshed } = await supabase
        .from('discord_bot_servers')
        .select('id, user_id, guild_id, guild_name, guild_icon, member_count, webhook_url, manual_webhook_url, auto_scan_webhook_url, full_scan_webhook_url, info_channel_id, alert_channel_name, is_active, last_checked_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (refreshed) {
        const sharedInList = allServers.filter(s => !ownedIds.has(s.id));
        setServers([...refreshed, ...sharedInList]);
      }
    }).catch(() => {});
  }, [fetchLastScanResults]);

  // Fetch joins for a specific server (lazy-loaded)
  const fetchJoinsForServer = useCallback(async (guildId: string) => {
    setJoinsLoading(true);
    try {
      const { data, error } = await supabase
        .from('discord_member_joins')
        .select('id, discord_user_id, discord_username, discord_avatar, guild_id, guild_name, is_cheater, is_flagged, total_bans, total_tickets, summary_text, logged_at')
        .eq('guild_id', guildId)
        .order('logged_at', { ascending: false })
        .limit(500);

      if (!error && data) {
        const seen = new Set<string>();
        const uniqueJoins = data.filter((join: any) => {
          const key = `${join.guild_id}:${join.discord_user_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setRecentJoins(prev => {
          // Replace joins for this guild, keep others
          const otherJoins = prev.filter(j => j.guild_id !== guildId);
          return [...uniqueJoins, ...otherJoins];
        });
      }
    } catch {}
    setJoinsLoading(false);
  }, []);

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;

    // Fetch servers immediately, defer heavy data loads
    fetchServers();
    // Defer non-critical data by 1.5s to prioritize initial render
    const deferTimer = setTimeout(() => {
      Promise.all([fetchDetectedCheaters(), fetchTotalCheatersFound(), fetchRecentJoins()]);
    }, 1500);

    // Real-time subscription for new member joins
    const channel = supabase
      .channel('discord_member_joins_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discord_member_joins',
        },
        (payload) => {
          const newJoin = payload.new as any;
          setRecentJoins((prev) => {
            const key = `${newJoin.guild_id}:${newJoin.discord_user_id}:${newJoin.logged_at || ''}`;
            const alreadyExists = prev.some((j: any) => 
              `${j.guild_id}:${j.discord_user_id}:${j.logged_at || ''}` === key
            );
            if (alreadyExists) return prev;
            // Keep max 500 per guild to prevent memory pressure
            const updated = [newJoin, ...prev];
            if (updated.length > 1000) return updated.slice(0, 1000);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(deferTimer);
    };
  }, [fetchServers, isReady, isAuthenticated]);

  const handleAdd = async () => {
    const effectiveGuildName = guildName.trim() || `Server ${guildId}`;

    if (!guildId.trim()) {
      toast.error('Select a server first');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error('Please log in');
        setIsSubmitting(false);
        return;
      }

      let effectiveWebhookUrl = webhookUrl.trim();

      // Auto-create channels & webhooks if none provided (auto mode)
      if (!effectiveWebhookUrl && addMode === 'auto') {
        toast.info('Checking existing channels and webhooks...');
        const { data: whData, error: whError } = await supabase.functions.invoke('discord-member-check', {
          body: { action: 'create-webhook', guildId },
        });
        if (whError || !whData?.success) {
          toast.error('Failed to auto-create channels: ' + (whData?.error || whError?.message || 'Unknown error'));
          setIsSubmitting(false);
          return;
        }
        effectiveWebhookUrl = whData.webhook_url;

        // Store the extra webhook URLs for saving to DB
        (window as any).__autoScanWebhookUrl = whData.auto_scan_webhook_url;
        (window as any).__fullScanWebhookUrl = whData.full_scan_webhook_url;
        (window as any).__infoChannelId = whData.info_channel_id;

        if (whData.all_existed) {
          const skipped = (whData.skipped_channels || []).map((c: string) => `#${c}`).join(', ');
          toast.info(`Channels already exist (${skipped}) — no new channels were created. Using existing webhooks.`);
        } else {
          const created = (whData.created_channels || []).map((c: string) => `#${c}`).join(', ');
          const skipped = (whData.skipped_channels || []).map((c: string) => `#${c}`).join(', ');
          const parts: string[] = [];
          if (created) parts.push(`Created: ${created}`);
          if (skipped) parts.push(`Already existed: ${skipped}`);
          toast.success(parts.join(' · '));
        }
      }

      if (!effectiveWebhookUrl) {
        toast.error('Webhook URL is required');
        setIsSubmitting(false);
        return;
      }

      const parsed = serverSchema.safeParse({
        guild_id: guildId,
        guild_name: effectiveGuildName,
        webhook_url: effectiveWebhookUrl,
        alert_channel_name: channelName || undefined,
      });

      if (!parsed.success) {
        const firstErr = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
        toast.error(firstErr || 'Invalid input');
        setIsSubmitting(false);
        return;
      }

      const insertPayload: any = {
        user_id: session.session.user.id,
        guild_id: parsed.data.guild_id,
        guild_name: parsed.data.guild_name,
        webhook_url: parsed.data.webhook_url,
        manual_webhook_url: manualWebhookUrl.trim() && /^https:\/\/discord\.com\/api\/webhooks\//.test(manualWebhookUrl.trim()) ? manualWebhookUrl.trim() : null,
        alert_channel_name: parsed.data.alert_channel_name || null,
        auto_scan_webhook_url: (window as any).__autoScanWebhookUrl || null,
        full_scan_webhook_url: (window as any).__fullScanWebhookUrl || null,
        info_channel_id: (window as any).__infoChannelId || null,
      };

      // Clean up temp vars
      delete (window as any).__autoScanWebhookUrl;
      delete (window as any).__fullScanWebhookUrl;
      delete (window as any).__infoChannelId;

      const selectedGuild = availableGuilds.find(g => g.id === guildId);
      if (selectedGuild?.icon) {
        (insertPayload as any).guild_icon = selectedGuild.icon;
      }

      const { error } = await supabase.from('discord_bot_servers').insert(insertPayload);

      if (error) {
        console.error('Insert server error:', error);
        if (error.code === '23505') {
          toast.error('This server is already registered');
        } else {
          toast.error(`Failed to add server: ${error.message || 'Unknown error'}`);
        }
      } else {
        toast.success('Server added! CurlyKidd Bot will now monitor it.');
        setAddDialogOpen(false);
        setGuildId('');
        setGuildName('');
        setWebhookUrl('');
        setManualWebhookUrl('');
        setChannelName('');
        await fetchServers();
      }
    } catch (e: any) {
      console.error('Add server exception:', e);
      toast.error(`Error: ${e?.message || 'Unknown error'}`);
    }
    setIsSubmitting(false);
  };

  const handleToggle = async (server: BotServer) => {
    const { error } = await supabase
      .from('discord_bot_servers')
      .update({ is_active: !server.is_active })
      .eq('id', server.id);

    if (!error) {
      const updated = { ...server, is_active: !server.is_active };
      setServers(prev => prev.map(s => s.id === server.id ? updated : s));
      setDetailServer(prev => prev && prev.id === server.id ? updated : prev);
      toast.success(server.is_active ? 'Monitoring paused' : 'Monitoring resumed');
    }
  };

  const handleDelete = async (serverId: string) => {
    const { error } = await supabase
      .from('discord_bot_servers')
      .delete()
      .eq('id', serverId);

    if (!error) {
      setServers(prev => prev.filter(s => s.id !== serverId));
      toast.success('Server removed');
    }
  };

  const handleTestWebhook = async (server: BotServer) => {
    setIsTesting(server.id);
    try {
      const testEmbed = {
        embeds: [{
          title: '✅ CurlyKidd Bot Connected',
          description: `Webhook test successful for **${server.guild_name}**. The bot will send alerts to this channel when flagged players join your server.`,
          color: 0x00d4aa,
          fields: [
            { name: '🔍 Monitoring', value: 'Active', inline: true },
            { name: '📊 Database', value: 'Connected', inline: true },
          ],
          footer: { text: 'CurlyKidd Panel • Cheater Detection System' },
          timestamp: new Date().toISOString(),
        }],
        username: 'CurlyKidd Bot',
      };

      const res = await fetch(server.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testEmbed),
      });

      if (res.ok) {
        toast.success('Test message sent! Check your Discord channel.');
      } else {
        toast.error('Webhook failed — check the URL is correct');
      }
    } catch {
      toast.error('Failed to reach webhook');
    }
    setIsTesting(null);
  };

  const handleVerifyWebhook = async (server: BotServer) => {
    setIsVerifying(server.id);
    toast.info(`Verifying webhook alerts for ${server.guild_name || server.guild_id}…`);
    try {
      const { data, error } = await supabase.functions.invoke('discord-member-check', {
        body: { action: 'verify-alerts', serverId: server.id },
      });
      if (error) {
        toast.error('Verification failed: ' + error.message);
      } else if (data?.missing > 0) {
        toast.warning(`${data.missing} flagged member(s) were missing — ${data.resent} resent.`);
      } else if (data?.verified === 0) {
        toast.info('No flagged members to verify.');
      } else {
        toast.success(`All ${data?.verified || 0} flagged members confirmed.`);
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast.error('Verification failed unexpectedly.');
    }
    setIsVerifying(null);
  };

  // ── Poll scan_history for background scan progress ──
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRequestInFlightRef = useRef(false);

  const pollScanProgress = useCallback(async (scanHistoryId: string) => {
    if (pollRequestInFlightRef.current) return;
    pollRequestInFlightRef.current = true;

    try {
      const { data } = await supabase
        .from('scan_history')
        .select('*')
        .eq('id', scanHistoryId)
        .single();

      if (!data) return;

      const processed = (data.total_checked || 0) + (data.total_skipped || 0);
      const batch = Math.max(1, Math.ceil(processed / 50));

      scanStore.updateProgress({
        totalMembers: data.total_members || 0,
        checked: data.total_checked || 0,
        skipped: data.total_skipped || 0,
        alerts: data.total_alerts || 0,
        batch,
        phase: data.status === 'running' ? (processed > 0 ? 'processing' : 'fetching_members') : 'finishing',
        simulatedProgress: 0,
      });

      if (data.guild_id && processed > 0) {
        const { data: joins } = await supabase
          .from('discord_member_joins')
          .select('*')
          .eq('guild_id', data.guild_id)
          .gte('logged_at', data.started_at)
          .order('logged_at', { ascending: false })
          .limit(500);

        if (joins) {
          setRecentJoins(joins);
        }
      }

      if (data.status !== 'running') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;

        const allFailed = data.total_checked > 0 && (data.total_failed || 0) >= data.total_checked;
        if (allFailed) {
          toast.error(`Scan finished, but all ${data.total_checked} lookups failed.`);
        } else if (data.status === 'stopped') {
          toast.info('Scan was stopped.');
        } else {
          const failSuffix = (data.total_failed || 0) > 0 ? `, ${data.total_failed} failed` : '';
          toast.success(`Scan complete! ${data.total_checked} checked, ${data.total_skipped} skipped, ${data.total_alerts} alerts${failSuffix}.`);
        }

        setLastScanResults(prev => ({
          ...prev,
          [scanStore.scanServerId || '']: {
            checked: data.total_checked,
            skipped: data.total_skipped,
            alerts: data.total_alerts,
            totalMembers: data.total_members || (data.total_checked + data.total_skipped),
            time: new Date(),
          },
        }));

        scanStore.finishScan();
        fetchServers();
        fetchDetectedCheaters();
        fetchRecentJoins();
      }
    } finally {
      pollRequestInFlightRef.current = false;
    }
  }, [scanStore, fetchServers]);

  const startScanPolling = useCallback((scanHistoryId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollRequestInFlightRef.current = false;
    void pollScanProgress(scanHistoryId);
    pollIntervalRef.current = setInterval(() => {
      void pollScanProgress(scanHistoryId);
    }, 900);
  }, [pollScanProgress]);

  // ── Restore active scan on mount ──
  useEffect(() => {
    const persisted = scanStore.getPersistedScan();
    if (!persisted) return;

    // Check if scan is still running
    supabase
      .from('scan_history')
      .select('*')
      .eq('id', persisted.scanHistoryId)
      .single()
      .then(({ data }) => {
        if (data?.status === 'running') {
          // Restore scan UI
          scanStore.restoreScan(persisted);
          scanStore.updateProgress({
            totalMembers: data.total_members || persisted.memberCount,
            checked: data.total_checked || 0,
            skipped: data.total_skipped || 0,
            alerts: data.total_alerts || 0,
            batch: Math.max(1, Math.ceil(((data.total_checked || 0) + (data.total_skipped || 0)) / 50)),
            phase: 'processing',
          });
          setExpandedJoinsServer(persisted.guildId);
          startScanPolling(persisted.scanHistoryId);
          toast.info(`Scan genoptaget for ${persisted.serverName}`);
        } else {
          // Scan already finished
          scanStore.clearPersistedScan();
        }
      });
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleScanAll = async (server: BotServer) => {
    const startedAt = new Date();
    const scanId = crypto.randomUUID();
    scanStore.startScan(server.id, server.guild_name || server.guild_id, startedAt, scanId);
    scanStore.updateProgress({ totalMembers: server.member_count || 0, phase: 'initializing', simulatedProgress: 2 });
    setExpandedJoinsServer(server.guild_id);

    // Optimistic progress simulation while waiting for backend
    let simProg = 2;
    const simInterval = setInterval(() => {
      if (!scanStore.isScanning) { clearInterval(simInterval); return; }
      const current = scanStore.progress;
      if (current && current.batch > 0) { clearInterval(simInterval); return; }
      simProg = Math.min(simProg + 0.5, 25);
      const phase: 'fetching_members' | 'checking_database' = simProg >= 15 ? 'checking_database' : simProg >= 5 ? 'fetching_members' : 'fetching_members';
      scanStore.updateProgress({ simulatedProgress: simProg, phase });
    }, 300);

    try {
      // Start background scan on backend
      const { data, error } = await supabase.functions.invoke('discord-member-check', {
        body: { action: 'background-scan', serverId: server.id, scanId },
      });

      clearInterval(simInterval);

      if (error || !data?.success || !data?.scanHistoryId) {
        toast.error('Failed to start scan: ' + (error?.message || data?.error || 'Unknown error'));
        scanStore.stopScan();
        return;
      }

      // Save scan info for persistence
      scanStore.setScanHistoryId(data.scanHistoryId);
      scanStore.persistActiveScan({
        scanHistoryId: data.scanHistoryId,
        serverId: server.id,
        serverName: server.guild_name || server.guild_id,
        scanId: data.scanId,
        startedAt: data.scanStartedAt,
        memberCount: data.memberCount,
        guildId: data.guildId,
      });

      // Update progress with real member count + first real batch
      const initialProcessed = (data.initialChecked || 0) + (data.initialSkipped || 0);
      scanStore.updateProgress({
        totalMembers: data.memberCount || server.member_count || 0,
        checked: data.initialChecked || 0,
        skipped: data.initialSkipped || 0,
        alerts: data.initialAlerts || 0,
        batch: initialProcessed > 0 ? Math.max(1, Math.ceil(initialProcessed / 50)) : 0,
        phase: initialProcessed > 0 ? 'processing' : 'fetching_members',
        simulatedProgress: 0,
      });

      if (Array.isArray(data.initialBatchJoins) && data.initialBatchJoins.length > 0) {
        setRecentJoins(data.initialBatchJoins);
      }

      // Start polling for progress updates
      startScanPolling(data.scanHistoryId);

    } catch (err) {
      clearInterval(simInterval);
      toast.error('Failed to start scan');
      scanStore.stopScan();
    }
  };

  const handleStopScan = async () => {
    const startedAt = scanStore.progress?.startedAt?.toISOString();
    const scanId = scanStore.progress?.scanId;
    const activeServerId = scanStore.scanServerId;

    if (!activeServerId || !scanId) return;

    scanStore.requestStop();

    try {
      const { data, error } = await supabase.functions.invoke('discord-member-check', {
        body: {
          action: 'stop-scan',
          serverId: activeServerId,
          scanId,
          scanStartedAt: startedAt,
        },
      });

      if (error || data?.success === false) {
        throw new Error(error?.message || data?.error || 'Failed to stop scan');
      }

      toast.info('Stopping full scan...');
    } catch {
      toast.error('Failed to send stop signal to the scan');
    }
  };

  const openEditDialog = (server: BotServer) => {
    setEditServer(server);
    setEditGuildName(server.guild_name || '');
    setEditWebhookUrl(server.auto_scan_webhook_url || server.webhook_url);
    setEditManualWebhookUrl(server.full_scan_webhook_url || server.manual_webhook_url || '');
    setEditChannelName(server.alert_channel_name || '');
  };

  const handleSaveEdit = async () => {
    if (!editServer) return;
    if (!editWebhookUrl.trim() || !/^https:\/\/discord\.com\/api\/webhooks\//.test(editWebhookUrl.trim())) {
      toast.error('Invalid auto-scan webhook URL');
      return;
    }
    if (editManualWebhookUrl.trim() && !/^https:\/\/discord\.com\/api\/webhooks\//.test(editManualWebhookUrl.trim())) {
      toast.error('Invalid full scan webhook URL');
      return;
    }
    setIsEditing(true);
    const { error } = await supabase
      .from('discord_bot_servers')
      .update({
        guild_name: editGuildName.trim() || editServer.guild_name,
        webhook_url: editWebhookUrl.trim(),
        auto_scan_webhook_url: editWebhookUrl.trim(),
        manual_webhook_url: editManualWebhookUrl.trim() || null,
        full_scan_webhook_url: editManualWebhookUrl.trim() || null,
        alert_channel_name: editChannelName.trim() || null,
      })
      .eq('id', editServer.id);

    if (error) {
      toast.error('Failed to update server');
    } else {
      toast.success('Server updated!');
      setEditServer(null);
      fetchServers();
    }
    setIsEditing(false);
  };

  const fetchDetectedCheaters = async () => {
    setDetectedLoading(true);
    try {
      const { data, error } = await supabase
        .from('bot_detected_cheaters')
        .select('id, discord_user_id, discord_username, discord_avatar, guild_id, guild_name, is_flagged, total_bans, total_tickets, summary_text, detected_at')
        .order('detected_at', { ascending: false })
        .limit(100);
      if (!error && data) setDetectedCheaters(data);
    } catch {}
    setDetectedLoading(false);
  };

  const fetchTotalCheatersFound = async () => {
    try {
      const { data, error } = await supabase
        .from('scan_history')
        .select('total_alerts');
      if (!error && data) {
        setTotalCheatersFound(data.reduce((sum: number, s: any) => sum + (s.total_alerts || 0), 0));
      }
    } catch {}
  };

  const fetchRecentJoins = async () => {
    setJoinsLoading(true);
    try {
      const { data, error } = await supabase
        .from('discord_member_joins')
        .select('id, discord_user_id, discord_username, discord_avatar, guild_id, guild_name, is_cheater, is_flagged, total_bans, total_tickets, summary_text, logged_at')
        .order('logged_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        const seen = new Set<string>();
        const uniqueJoins = data.filter((join: any) => {
          const key = `${join.guild_id}:${join.discord_user_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setRecentJoins(uniqueJoins);
      }
    } catch {}
    setJoinsLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('bot.copied'));
  };

  const activeServers = useMemo(() => servers.filter(s => s.is_active).length, [servers]);

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } },
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <Suspense fallback={null}><ParticleBackground /></Suspense>
        <MaintenanceBanner />
        <AppHeader />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-16">
          {/* ═══════════ HERO + GETTING STARTED (only when no servers) ═══════════ */}
          {!isLoading && servers.length === 0 && (<>
          {/* ═══════════ HERO ═══════════ */}
          <motion.section
            initial="hidden"
            animate="show"
            variants={stagger}
            className="text-center mb-16"
          >

            <motion.h1 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight max-w-3xl mx-auto">
              {t('bot.hero_title')}{' '}
              <span className="text-primary">{t('bot.hero_highlight')}</span> {t('bot.hero_desc').split('.')[0]}
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-4 text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              {t('bot.hero_desc')}
            </motion.p>

            <motion.div variants={fadeUp} className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {[
                { icon: Zap, label: t('bot.realtime_alerts') },
                { icon: Settings, label: t('bot.easy_setup') },
                { icon: Shield, label: t('bot.trusted') },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              ))}
            </motion.div>
          </motion.section>

          {/* ═══════════ GETTING STARTED ═══════════ */}
          <motion.section
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
            variants={stagger}
            className="mb-14"
          >
            <motion.h2 variants={fadeUp} className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {t('bot.getting_started')}
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1 – highlighted */}
              <motion.div
                variants={fadeUp}
                className="group relative p-5 rounded-xl border border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.25)]"
              >
                <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                <div className="relative space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm border border-primary/20">
                    1
                  </div>
                  <h3 className="font-semibold text-foreground">{t('bot.invite_bot')}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('bot.invite_bot_desc')}
                  </p>
                  <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button size="sm" className="gap-1.5 w-full mt-1 shadow-[0_0_20px_-6px_hsl(var(--primary)/0.4)]">
                      <ExternalLink className="w-3.5 h-3.5" /> {t('bot.invite_bot_btn')}
                    </Button>
                  </a>
                </div>
              </motion.div>

              {/* Step 2 */}
              <motion.div
                variants={fadeUp}
                className="group p-5 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-border/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-10px_hsl(0,0%,0%,0.3)]"
              >
                <div className="space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground font-bold text-sm border border-border/40">
                    2
                  </div>
                  <h3 className="font-semibold text-foreground">{t('bot.create_webhook')}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('bot.create_webhook_desc')}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-2">
                    {t('bot.webhook_path')}
                  </p>
                </div>
              </motion.div>

              {/* Step 3 */}
              <motion.div
                variants={fadeUp}
                className="group p-5 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-border/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-10px_hsl(0,0%,0%,0.3)]"
              >
                <div className="space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground font-bold text-sm border border-border/40">
                    3
                  </div>
                  <h3 className="font-semibold text-foreground">{t('bot.register_server')}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('bot.register_server_desc')}
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.section>
          </>)}

          {/* ═══════════ KPI STATS ═══════════ */}
          {servers.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: t('bot.total_servers'), value: servers.length, icon: Server, color: 'text-primary', bg: 'bg-primary/10' },
                  { label: t('bot.active'), value: activeServers, icon: Shield, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { label: t('bot.cheaters_found'), value: totalCheatersFound, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className="group flex flex-col items-center justify-center p-5 min-h-[100px] rounded-xl border border-border/20 bg-card/50 backdrop-blur-sm hover:border-border/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 transition-all duration-200">
                    <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center ${color} shrink-0 mb-3 transition-transform duration-200 group-hover:scale-110`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className={`text-2xl font-bold leading-none tabular-nums ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-2 font-semibold uppercase tracking-widest">{label}</p>
                  </div>
                ))}
              </div>

               {/* Connection indicator - combined */}
              <div className="flex items-center justify-center mt-3">
                <motion.div
                  className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card/60 border border-border/30 backdrop-blur-sm cursor-pointer"
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
                    <span className={`text-[10px] font-mono ${dbStats.latency < 100 ? 'text-emerald-400' : dbStats.latency < 300 ? 'text-emerald-400' : 'text-orange-400'}`}>
                      {dbStats.latency}ms
                    </span>
                  )}
                </motion.div>
              </div>
            </motion.section>
          )}

          {/* ═══════════ YOUR SERVERS ═══════════ */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {t('bot.your_servers')}
                  </h2>
                  <p className="text-xs text-muted-foreground/50">
                    {servers.length} server{servers.length !== 1 ? 's' : ''} · {activeServers} active
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 h-8 text-xs border-border/20 text-muted-foreground/60 hover:text-foreground hover:border-border/40 transition-all duration-200">
                  <Download className="w-3.5 h-3.5" />
                  {t('bot.export')}
                </Button>
                <Button size="sm" onClick={openAddDialog} className="gap-1.5 h-8 text-xs transition-all duration-200">
                  <Plus className="w-3.5 h-3.5" />
                  {t('bot.add_server')}
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-xl border border-border/10 bg-card/30 p-5 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-muted/15" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 bg-muted/15 rounded" />
                        <div className="h-3 w-56 bg-muted/10 rounded" />
                      </div>
                      <div className="flex gap-1.5">
                        {[1,2,3].map(j => <div key={j} className="w-16 h-8 bg-muted/10 rounded-md" />)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-border/15 bg-card/30 backdrop-blur-sm">
                <div className="w-14 h-14 rounded-2xl bg-muted/10 flex items-center justify-center mb-4">
                  <Server className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground/60">{t('bot.no_servers')}</p>
                <p className="text-xs text-muted-foreground/30 mt-1">{t('bot.no_servers_desc')}</p>
                <Button onClick={openAddDialog} variant="outline" size="sm" className="gap-1.5 mt-5 border-border/20 text-muted-foreground/60 hover:text-foreground">
                  <Plus className="w-3.5 h-3.5" />
                  {t('bot.add_first')}
                </Button>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="show"
                variants={stagger}
                className="space-y-4"
              >
                <AnimatePresence mode="popLayout">
                  {servers.map((server) => {
                    const isActive = server.is_active;
                    const hasWebhook = !!server.webhook_url;

                    return (
                      <ContextMenu key={server.id}>
                        <ContextMenuTrigger asChild>
                          <motion.div
                            variants={fadeUp}
                            exit={{ opacity: 0, y: -10 }}
                            layout
                            className={`group rounded-xl border bg-card/40 backdrop-blur-sm overflow-hidden cursor-pointer relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 ${
                              isActive
                                ? 'border-border/20 hover:border-border/40'
                                : 'border-border/10 opacity-80 hover:opacity-100 hover:border-border/30'
                            }`}
                            onClick={() => setDetailServer(server)}
                          >

                        {/* Main row */}
                        <div className="p-5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            {server.guild_icon ? (
                              <img
                                src={`https://cdn.discordapp.com/icons/${server.guild_id}/${server.guild_icon}.${server.guild_icon.startsWith('a_') ? 'gif' : 'webp'}?size=96`}
                                alt={server.guild_name || 'Server'}
                                className="w-12 h-12 rounded-xl object-cover shrink-0 ring-1 ring-border/10"
                                loading="lazy"
                              />
                            ) : (
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-border/10 ${
                                isActive ? 'bg-primary/10 text-primary' : 'bg-muted/20 text-muted-foreground/50'
                              }`}>
                                <Server className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex items-center gap-2.5">
                                <h3 className="font-semibold text-foreground text-[15px] truncate leading-tight">
                                  {server.guild_name || 'Unknown Server'}
                                </h3>
                                {!ownedServerIds.has(server.id) && (
                                  <Badge variant="outline" className="text-[9px] shrink-0 px-1.5 py-0 border-primary/20 text-primary/70 bg-primary/5">
                                    <Users className="w-2.5 h-2.5 mr-0.5" /> {t('bot.shared')}
                                  </Badge>
                                )}
                                <Badge
                                  variant={isActive ? 'default' : 'secondary'}
                                  className={`text-[9px] shrink-0 px-2 py-0.5 font-medium ${
                                    isActive
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-muted/20 text-muted-foreground/50 border-border/15'
                                  }`}
                                >
                                  {isActive ? (
                                    <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 inline-block" /> {t('bot.protected')}</>
                                  ) : (
                                    <><PowerOff className="w-2.5 h-2.5 mr-1" /> {t('bot.paused')}</>
                                  )}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/40">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(server.guild_id); }}
                                      className="hover:text-muted-foreground transition-colors flex items-center gap-1 font-mono"
                                    >
                                      <Hash className="w-3 h-3" />
                                      {server.guild_id}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('bot.copy_server_id')}</TooltipContent>
                                </Tooltip>
                                {(server.member_count != null && server.member_count > 0) && (
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {server.member_count.toLocaleString()}
                                  </span>
                                )}
                                {server.alert_channel_name && (
                                  <span>#{server.alert_channel_name}</span>
                                )}
                              </div>

                              {/* Scan stats row */}
                              {lastScanResults[server.id] && (
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                                    <Users className="w-3 h-3 text-primary/50" />
                                    <span className="font-semibold text-foreground/70">{lastScanResults[server.id].totalMembers.toLocaleString()}</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                                    <CheckCircle className="w-3 h-3 text-emerald-500/50" />
                                    <span className="font-semibold text-foreground/70">{lastScanResults[server.id].checked.toLocaleString()}</span>
                                  </span>
                                  {lastScanResults[server.id].alerts > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-destructive/8 text-destructive/80">
                                      <AlertTriangle className="w-3 h-3" />
                                      <span className="font-bold">{lastScanResults[server.id].alerts.toLocaleString()}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/30">
                                      <AlertTriangle className="w-3 h-3" />
                                      0
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground/25">
                                    {timeAgo(lastScanResults[server.id].time.toISOString())}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Actions row */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {isScanning === server.id ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      onClick={handleStopScan}
                                      variant="destructive"
                                      className="gap-1.5 text-xs h-8 px-3"
                                    >
                                      <XCircle className="w-3.5 h-3.5" /> {t('bot.stop')}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('bot.stop_scan')}</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      onClick={() => handleScanAll(server)}
                                      disabled={isScanning !== null}
                                      className="gap-1.5 text-xs h-8 px-3 transition-all duration-200"
                                    >
                                      <Users className="w-3.5 h-3.5" /> {t('bot.scan_now')}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('bot.scan_all_desc')}</TooltipContent>
                                </Tooltip>
                              )}

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTestWebhook(server)}
                                    disabled={isTesting === server.id}
                                    className="gap-1 text-xs h-8 px-2.5 text-muted-foreground/50 hover:text-foreground transition-all duration-200"
                                  >
                                    {isTesting === server.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Webhook className="w-3.5 h-3.5" />
                                    )}
                                    {t('bot.test')}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('bot.test_webhook_desc')}</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleVerifyWebhook(server)}
                                    disabled={isVerifying === server.id || isScanning !== null}
                                    className="gap-1 text-xs h-8 px-2.5 text-muted-foreground/50 hover:text-foreground transition-all duration-200"
                                  >
                                    {isVerifying === server.id ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('bot.verifying')}</>
                                    ) : (
                                      <><ShieldCheck className="w-3.5 h-3.5" /> {t('bot.verify')}</>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t('bot.verify_desc')}</TooltipContent>
                              </Tooltip>

                            {ownedServerIds.has(server.id) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setShareServerId(server.id); setShareServerName(server.guild_name || 'Server'); }}
                                    className="gap-1 text-xs h-8 px-2.5 text-muted-foreground/50 hover:text-foreground transition-all duration-200"
                                  >
                                    <Users className="w-3.5 h-3.5" /> Share
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Share server with other admins</TooltipContent>
                              </Tooltip>
                            )}

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDetailServer(server)}
                                    className="text-xs h-8 w-8 p-0 text-muted-foreground/40 hover:text-foreground transition-all duration-200"
                                  >
                                    <Settings2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Server indstillinger</TooltipContent>
                              </Tooltip>
                            </div>

                            <div className="w-px h-5 bg-border/15 mx-0.5" />

                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center">
                                    <Switch
                                      checked={server.is_active}
                                      onCheckedChange={() => handleToggle(server)}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>{isActive ? t('bot.pause_scan') : t('bot.enable_scan')}</TooltipContent>
                              </Tooltip>

                              <AlertDialog>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="text-muted-foreground/30 hover:text-destructive h-8 w-8 p-0 transition-all duration-200">
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>{t('bot.remove_server')}</TooltipContent>
                                </Tooltip>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('bot.remove_server_q')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('bot.remove_server_desc')} <strong>{server.guild_name}</strong>. {t('bot.remove_readd')}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('bot.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(server.id)}>
                                      {t('bot.remove')}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>

                        {/* Footer row */}
                        <div className="px-5 py-2.5 border-t border-border/10 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {t('bot.last_scan')} {server.last_checked_at ? timeAgo(server.last_checked_at) : t('bot.never')}
                          </span>
                          <div className="flex items-center gap-3">
                            <Button
                              variant={expandedJoinsServer === server.guild_id ? 'default' : 'ghost'}
                              size="sm"
                              className={`h-7 text-[11px] gap-1.5 px-3 transition-all duration-200 ${expandedJoinsServer === server.guild_id ? '' : 'hover:bg-primary/10 hover:text-primary'}`}
                              onClick={() => {
                                const isOpen = expandedJoinsServer === server.guild_id;
                                setExpandedJoinsServer(isOpen ? null : server.guild_id);
                                if (!isOpen) {
                                  setJoinsFilter('cheaters');
                                  if (recentJoins.length === 0) fetchRecentJoins();
                                }
                              }}
            >
              <Eye className="w-3 h-3" />
              {expandedJoinsServer === server.guild_id ? t('bot.hide_feed') : isScanning === server.id ? t('bot.live_feed') : t('bot.scan_results')}
            </Button>
                            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 inline-block" />
                              {t('bot.db_linked')}
                            </span>
                          </div>
                        </div>

                        {/* Scan progress panel */}
                        <AnimatePresence>
                          {isScanning === server.id && scanStore.progress && (() => {
                            const p = scanStore.progress!;
                            const processed = p.checked + p.skipped;
                            const total = p.totalMembers || server.member_count || 0;
                            const realPct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
                            const progressPct = processed > 0 ? realPct : Math.round(p.simulatedProgress || 0);
                            const elapsed = Math.max(1, (Date.now() - p.startedAt.getTime()) / 1000);
                            const rate = processed / elapsed;
                            const remaining = total > 0 ? total - processed : 0;
                            const etaSeconds = rate > 0 && remaining > 0 ? Math.round(remaining / rate) : null;
                            const etaLabel = etaSeconds && etaSeconds > 0
                              ? etaSeconds > 60 ? `~${Math.ceil(etaSeconds / 60)} min left` : `~${etaSeconds}s left`
                              : total > 0 ? 'Almost done…' : '';
                            const phaseLabel = getPhaseLabel(p.phase);

                            return (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                              >
                                <div className="px-5 py-4 bg-primary/[0.03] border-t border-primary/20">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-primary flex items-center gap-1.5">
                                      <Loader2 className="w-3 h-3" style={{ animation: 'spin 1s linear infinite' }} />
                                      {phaseLabel}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {processed > 0
                                        ? `${processed.toLocaleString()} / ${total > 0 ? total.toLocaleString() : '?'} members${etaLabel ? ` — ${etaLabel}` : ''}`
                                        : `${Math.round(elapsed)}s`
                                      }
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <Progress value={progressPct} className="h-1.5 mb-3" />
                                    {processed === 0 && (
                                      <div className="absolute inset-0 h-1.5 rounded-full overflow-hidden">
                                        <div className="h-full w-1/3 bg-primary/30 rounded-full animate-pulse" 
                                          style={{ animation: 'pulse 1.5s ease-in-out infinite, shimmer 2s ease-in-out infinite' }} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-6 gap-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-default">
                                          <AnimatedStat value={total} className="text-sm font-bold text-primary" />
                                          <div className="text-[10px] text-muted-foreground">{t('bot.members')}</div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('bot.total_members_tip')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-default">
                                          <AnimatedStat value={processed} fallback="0" className="text-sm font-bold text-foreground" />
                                          <div className="text-[10px] text-muted-foreground">{t('bot.processed')}</div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('bot.processed_tip')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-default">
                                          <AnimatedStat value={p.checked} fallback="0" className="text-sm font-bold text-foreground" />
                                          <div className="text-[10px] text-muted-foreground">{t('bot.new_checks')}</div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('bot.new_checks_tip')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-default">
                                          <AnimatedStat value={p.skipped} fallback="0" className="text-sm font-bold text-foreground" />
                                          <div className="text-[10px] text-muted-foreground">{t('bot.skipped')}</div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('bot.skipped_tip')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-default">
                                          <AnimatedStat value={p.alerts} fallback="0" className={`text-sm font-bold ${p.alerts > 0 ? 'text-destructive' : 'text-foreground'}`} />
                                          <div className="text-[10px] text-muted-foreground">{t('bot.flagged')}</div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('bot.flagged_tip')}</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="text-center cursor-default">
                                          <div className="text-sm font-bold text-foreground">
                                            {p.checked > 0
                                              ? `${((p.alerts / p.checked) * 100).toFixed(1)}%`
                                              : '0%'}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground">{t('bot.flag_rate')}</div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>{t('bot.flag_rate_tip')}</TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
                                    <span className="text-[10px] text-muted-foreground">
                                      Batch {p.batch} • {processed > 0 ? `${Math.round(rate * 60)} members/min` : t('bot.starting')}
                                      {p.lastBatchLatency != null ? ` • Latency: ${Math.round(p.lastBatchLatency)}ms` : ''}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {progressPct}% • Elapsed: {Math.floor(elapsed / 60)}m {Math.floor(elapsed % 60)}s
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })()}
                        </AnimatePresence>

                        {/* Joins panel for this server */}
                        <AnimatePresence>
                          {expandedJoinsServer === server.guild_id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 py-4 border-t border-border/20 bg-card/20" onClick={(e) => e.stopPropagation()}>
                                {/* Header */}
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    {isScanning === server.id ? (
                                      <Radio className="w-4 h-4 text-primary animate-pulse" />
                                    ) : (
                                      <Shield className="w-4 h-4 text-primary" />
                                    )}
                                    <span className="text-sm font-semibold text-foreground">
                                      {isScanning === server.id ? t('bot.live_feed') : t('bot.scan_results')}
                                    </span>
                                    {isScanning === server.id && (
                                      <Badge className="text-[9px] bg-primary/15 text-primary border-primary/20 animate-pulse">
                                        LIVE
                                      </Badge>
                                    )}
                                    <span className="text-[10px] text-muted-foreground/60">
                                      {server.guild_name || server.guild_id}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRecentJoins(prev => prev.filter(j => j.guild_id !== server.guild_id));
                                        toast.success(t('bot.results_cleared'));
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" /> {t('bot.clear')}
                                    </Button>
                                  </div>
                                </div>

                                {/* Filter tabs + sort */}
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
                                    <button
                                      className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${
                                        joinsFilter === 'cheaters'
                                          ? 'bg-destructive/15 text-destructive shadow-sm'
                                          : 'text-muted-foreground hover:text-foreground'
                                      }`}
                                      onClick={(e) => { e.stopPropagation(); setJoinsFilter('cheaters'); }}
                                    >
                                      <span className="flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> {t('bot.flagged')}
                                      </span>
                                    </button>
                                    <button
                                      className={`px-3 py-1 rounded-md text-[10px] font-medium transition-all ${
                                        joinsFilter === 'all'
                                          ? 'bg-primary/15 text-primary shadow-sm'
                                          : 'text-muted-foreground hover:text-foreground'
                                      }`}
                                      onClick={(e) => { e.stopPropagation(); setJoinsFilter('all'); }}
                                    >
                                      {t('bot.all_members')}
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {(() => {
                                      const serverRecentJoins = recentJoins.filter(j => j.guild_id === server.guild_id);
                                      const liveProgress = isScanning === server.id ? scanStore.progress : null;
                                      const lastResult = lastScanResults[server.id];
                                      const flaggedCount = liveProgress
                                        ? liveProgress.alerts
                                        : lastResult
                                          ? lastResult.alerts
                                          : serverRecentJoins.filter(j => j.is_cheater).length;
                                      const totalCount = liveProgress
                                        ? liveProgress.checked + liveProgress.skipped
                                        : lastResult
                                          ? (lastResult.totalMembers || (lastResult.checked + lastResult.skipped))
                                          : serverRecentJoins.length;
                                      const totalLabel = liveProgress ? t('bot.scanned') : lastResult ? t('bot.members') : t('bot.recent');
                                      return (
                                        <span className="text-[10px] text-muted-foreground/60">
                                          {flaggedCount.toLocaleString()} flagged / {totalCount.toLocaleString()} {totalLabel}
                                        </span>
                                      );
                                    })()}
                                    <button
                                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                      onClick={(e) => { e.stopPropagation(); setJoinsSort(s => s === 'newest' ? 'oldest' : 'newest'); }}
                                    >
                                      <Clock className="w-3 h-3" />
                                      {joinsSort === 'newest' ? t('bot.newest') : t('bot.oldest')}
                                    </button>
                                  </div>
                                </div>

                                {joinsLoading ? (
                                  <div className="py-8 text-center">
                                    <Loader2 className="w-5 h-5 mx-auto text-primary animate-spin" />
                                  </div>
                                ) : (() => {
                                  const serverJoins = recentJoins
                                    .filter(j => j.guild_id === server.guild_id)
                                    .filter(j => joinsFilter === 'cheaters' ? j.is_cheater : true)
                                    .sort((a, b) => {
                                      const da = new Date(a.logged_at || 0).getTime();
                                      const db = new Date(b.logged_at || 0).getTime();
                                      return joinsSort === 'newest' ? db - da : da - db;
                                    });

                                  // Show skeleton loaders when scan is running but no results yet
                                  if (serverJoins.length === 0 && isScanning === server.id) {
                                    return (
                                      <div className="space-y-2">
                                        {[1, 2, 3, 4, 5].map(i => (
                                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border/10 animate-pulse">
                                            <div className="w-8 h-8 rounded-full bg-muted/30" />
                                            <div className="flex-1 space-y-1.5">
                                              <div className="h-3 w-24 bg-muted/30 rounded" />
                                              <div className="h-2 w-40 bg-muted/20 rounded" />
                                            </div>
                                            <div className="h-5 w-14 bg-muted/20 rounded-full" />
                                          </div>
                                        ))}
                                        <p className="text-center text-[10px] text-muted-foreground/40 pt-2">
                                          {t('bot.waiting_results')}
                                        </p>
                                      </div>
                                    );
                                  }

                                  if (serverJoins.length === 0) {
                                    return (
                                      <div className="py-8 text-center">
                                        <Shield className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                                         <p className="text-xs text-muted-foreground/60 font-medium">
                                          {joinsFilter === 'cheaters' ? t('bot.no_flagged') : t('bot.no_results_yet')}
                                         </p>
                                         <p className="text-[10px] text-muted-foreground/40 mt-1">
                                          {joinsFilter === 'cheaters' ? t('bot.run_full_scan') : t('bot.start_scan_hint')}
                                        </p>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="grid gap-1 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                                      {serverJoins.map((join) => {
                                        const avatarUrl = join.discord_avatar
                                          ? `https://cdn.discordapp.com/avatars/${join.discord_user_id}/${join.discord_avatar}.${join.discord_avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`
                                          : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(join.discord_user_id) % BigInt(5))}.png`;

                                        return (
                                          <div key={join.id} className="rounded-lg border transition-all overflow-hidden border-border/10">
                                            <button
                                              onClick={() => setExpandedJoinId(expandedJoinId === join.id ? null : join.id)}
                                              className={`w-full text-left p-2.5 flex items-center gap-3 transition-all cursor-pointer ${
                                                join.is_cheater
                                                  ? 'bg-destructive/[0.03] hover:bg-destructive/[0.07] border-destructive/20'
                                                  : 'bg-card/10 hover:bg-card/30'
                                              }`}
                                            >
                                              <div className="relative">
                                                <Avatar className="w-7 h-7 shrink-0 ring-2 ring-border/10">
                                                  <AvatarImage src={avatarUrl} />
                                                  <AvatarFallback className="bg-muted/30 text-muted-foreground text-[10px]">
                                                    {(join.discord_username || '?')[0]}
                                                  </AvatarFallback>
                                                </Avatar>
                                                {join.is_cheater && (
                                                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-destructive flex items-center justify-center ring-2 ring-card">
                                                    <AlertTriangle className="w-1.5 h-1.5 text-destructive-foreground" />
                                                  </div>
                                                )}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs font-medium text-foreground truncate">
                                                    {join.discord_username || join.discord_user_id}
                                                  </span>
                                                  {join.is_cheater && (
                                                    <Badge className="text-[8px] bg-destructive/15 text-destructive border-destructive/20 px-1.5 py-0 uppercase tracking-wider font-bold">
                                                      {t('bot.flagged')}
                                                    </Badge>
                                                  )}
                                                </div>
                                              </div>
                                              <svg className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform ${expandedJoinId === join.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </button>

                                            {expandedJoinId === join.id && (
                                              <div className="px-3 py-2.5 border-t border-border/10 bg-card/5 space-y-2">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                                                  <div>
                                                    <span className="text-muted-foreground/50">{t('bot.discord_id')}</span>
                                                    <button onClick={(e) => { e.stopPropagation(); copyToClipboard(join.discord_user_id); }} className="block font-mono text-foreground/80 hover:text-primary transition-colors">
                                                      {join.discord_user_id}
                                                    </button>
                                                  </div>
                                                  <div>
                                                    <span className="text-muted-foreground/50">{t('bot.username')}</span>
                                                    <p className="text-foreground/80">{join.discord_username || t('bot.unknown')}</p>
                                                  </div>
                                                  {join.logged_at && (
                                                    <div>
                                                      <span className="text-muted-foreground/50">{t('bot.joined_server')}</span>
                                                      <p className="text-foreground/80">{timeAgo(join.logged_at)}</p>
                                                    </div>
                                                  )}
                                                  {join.logged_at && (
                                                    <div>
                                                      <span className="text-muted-foreground/50">{t('bot.last_scanned')}</span>
                                                      <p className="text-foreground/80">{timeAgo(join.logged_at)}</p>
                                                    </div>
                                                  )}
                                                  {join.summary_text && (
                                                    <div className="col-span-2">
                                                       <span className="text-muted-foreground/50">{t('bot.summary')}</span>
                                                      <p className="text-destructive/80 flex items-center gap-1">
                                                        <Shield className="w-3 h-3 shrink-0" />
                                                        {join.summary_text}
                                                      </p>
                                                    </div>
                                                  )}
                                                  {join.cheater_summary && !join.summary_text && (
                                                    <div className="col-span-2">
                                                      <span className="text-muted-foreground/50">{t('bot.summary')}</span>
                                                      <p className="text-destructive/80 flex items-center gap-1">
                                                        <Shield className="w-3 h-3 shrink-0" />
                                                        {join.cheater_summary}
                                                      </p>
                                                    </div>
                                                  )}
                                                  {join.total_bans > 0 && (
                                                    <div>
                                                      <span className="text-muted-foreground/50">{t('bot.bans')}</span>
                                                      <p className="text-destructive/80 font-semibold">{join.total_bans}</p>
                                                    </div>
                                                  )}
                                                  {join.total_tickets > 0 && (
                                                    <div>
                                                      <span className="text-muted-foreground/50">{t('bot.tickets')}</span>
                                                      <p className="text-destructive/80 font-semibold">{join.total_tickets}</p>
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-1.5 pt-1 border-t border-border/10">
                                                  {join.is_cheater && (
                                                    <>
                                                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); navigate(`/cheaters?q=${join.discord_user_id}`); }}>
                                                        <Search className="w-3 h-3" /> {t('bot.cheater_db')}
                                                      </Button>
                                                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); window.open(`https://discord.com/users/${join.discord_user_id}`, '_blank'); }}>
                                                        <ExternalLink className="w-3 h-3" /> Discord
                                                      </Button>
                                                    </>
                                                  )}
                                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); copyToClipboard(join.discord_user_id); }}>
                                                    <Copy className="w-3 h-3" /> {t('bot.copy_id')}
                                                  </Button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                          </motion.div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => openEditDialog(server)} className="gap-2">
                            <Pencil className="w-3.5 h-3.5" /> {t('bot.edit_server')}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => copyToClipboard(server.guild_id)} className="gap-2">
                            <Copy className="w-3.5 h-3.5" /> {t('bot.copy_server_id')}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => copyToClipboard(server.webhook_url)} className="gap-2">
                            <Webhook className="w-3.5 h-3.5" /> {t('bot.copy_auto_webhook')}
                          </ContextMenuItem>
                          {server.manual_webhook_url && (
                            <ContextMenuItem onClick={() => copyToClipboard(server.manual_webhook_url!)} className="gap-2">
                              <Webhook className="w-3.5 h-3.5" /> {t('bot.copy_full_scan_webhook')}
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem onClick={() => handleDelete(server.id)} className="gap-2 text-destructive focus:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" /> {t('bot.remove_server')}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </section>

          {/* ═══════════ SCAN HISTORY ═══════════ */}
          <section className="mt-8">
            <Suspense fallback={<div className="h-32 animate-pulse bg-card/20 rounded-xl" />}><ScanHistory cheatersFoundCount={totalCheatersFound} /></Suspense>
          </section>



          {/* ═══════════ FOOTER ═══════════ */}
          <footer className="border-t border-border/10 mt-12 pt-8 pb-6 text-center">
            <p className="text-[11px] text-muted-foreground/40 flex items-center justify-center gap-3 font-medium tracking-wide">
              {t('bot.powered_by')} <span className="text-primary/60 font-semibold">CurlyKidd</span>
              <span className="w-1 h-1 rounded-full bg-border/40" />
              v1.0.0
              <span className="w-1 h-1 rounded-full bg-border/40" />
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 inline-block animate-pulse" />
                {t('bot.operational')}
              </span>
            </p>
          </footer>
        </div>

        {/* ═══════════ ADD SERVER DIALOG ═══════════ */}
        <Dialog open={addDialogOpen} onOpenChange={(open) => {
          if (open) {
            openAddDialog();
          } else {
            setAddDialogOpen(false);
          }
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                {t('bot.add_discord_server')}
              </DialogTitle>
              <DialogDescription>
                {t('bot.add_dialog_desc')}
              </DialogDescription>
            </DialogHeader>

            <div className="mb-2">
              <a
                href={BOT_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors mb-3"
              >
                <Bot className="w-3.5 h-3.5" />
                {t('bot.invite_link')}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => {
                  setAddMode('auto');
                  fetchGuilds();
                }}
                className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg transition-all ${
                  addMode === 'auto'
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Zap className="w-3.5 h-3.5 inline mr-1.5" />
                {t('bot.auto_detect')}
              </button>
              <button
                onClick={() => setAddMode('manual')}
                className={`flex-1 text-xs font-medium py-2 px-3 rounded-lg transition-all ${
                  addMode === 'manual'
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Settings className="w-3.5 h-3.5 inline mr-1.5" />
                {t('bot.manual')}
              </button>
            </div>

            {addMode === 'auto' ? (
              <div className="space-y-4 py-2">
                {isLoadingGuilds ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
                    <span className="ml-2 text-sm text-muted-foreground">{t('bot.fetching_servers')}</span>
                  </div>
                ) : availableGuilds.length === 0 ? (
                  <div className="text-center py-8">
                    <Server className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{t('bot.no_discord_servers')}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{t('bot.ensure_bot_invited')}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={fetchGuilds}
                    >
                      {t('bot.refresh')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>{t('bot.discord_servers')}</Label>
                        <span className="text-[11px] text-muted-foreground">{availableGuilds.length} {t('bot.found')}</span>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-border/30 bg-secondary/10 p-2">
                        {availableGuilds.map((guild) => {
                          const isAlreadyAdded = servers.some((server) => server.guild_id === guild.id);

                          return (
                            <button
                              key={guild.id}
                              onClick={() => {
                                setGuildId(guild.id);
                                setGuildName(guild.name);
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                                guildId === guild.id
                                  ? 'border-primary/40 bg-primary/10'
                                  : isAlreadyAdded
                                    ? 'border-border/30 bg-muted/20 hover:bg-muted/30'
                                    : 'border-border/30 bg-secondary/20 hover:bg-secondary/40'
                              }`}
                            >
                              {guild.icon ? (
                                <img
                                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=48`}
                                  alt={guild.name}
                                  className="w-9 h-9 rounded-lg"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground text-sm font-bold">
                                  {guild.name[0]}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-foreground truncate">{guild.name}</p>
                                  {isAlreadyAdded && (
                                    <Badge variant="outline" className="text-[10px] border-border/40 bg-card/60 text-muted-foreground">
                                      {t('bot.already_added')}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground font-mono">{guild.id}</p>
                              </div>
                              {guildId === guild.id ? (
                                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t('bot.all_servers_shown')}
                      </p>
                    </div>

                    {/* Ownership verification */}
                    {guildId && !servers.some((s) => s.guild_id === guildId) && !isAdmin && (
                      <div className="space-y-2 rounded-lg border border-border/30 bg-secondary/10 p-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <Label className="text-sm font-medium">{t('bot.ownership_verification')}</Label>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {t('bot.enter_discord_id')}
                        </p>
                        <div className="flex gap-2">
                          <Input
                            placeholder={t('bot.your_discord_id')}
                            value={discordUserId}
                            onChange={(e) => {
                              setDiscordUserId(e.target.value);
                              setOwnershipVerified(null);
                              setOwnershipError(null);
                            }}
                            className="flex-1 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verifyOwnership(guildId, discordUserId)}
                            disabled={isVerifyingOwnership || !discordUserId.trim() || ownershipVerified?.guildId === guildId}
                            className="shrink-0"
                          >
                            {isVerifyingOwnership ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : ownershipVerified?.guildId === guildId ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <Shield className="w-3.5 h-3.5" />
                            )}
                            {ownershipVerified?.guildId === guildId ? t('bot.verified') : t('bot.verify')}
                          </Button>
                        </div>
                        {ownershipVerified?.guildId === guildId && (
                          <p className="text-[11px] text-green-500 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {t('bot.verified_as')} {ownershipVerified.username || discordUserId}
                          </p>
                        )}
                        {ownershipError && (
                          <p className="text-[11px] text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {ownershipError}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60">
                        {t('bot.find_discord_id')}
                        </p>
                      </div>
                    )}
                    {guildId && !servers.some((s) => s.guild_id === guildId) && isAdmin && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        {t('bot.admin_bypass')}
                      </div>
                    )}

                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5" />
                      Webhook oprettes automatisk i #cheater-alerts (eller første kanal)
                    </div>

                    <details className="group">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5">
                        <Settings className="w-3 h-3" />
                        Avanceret: Brug egen webhook URL
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="auto-webhook-url">{t('bot.auto_scan_webhook')}</Label>
                          <Input
                            id="auto-webhook-url"
                            placeholder="https://discord.com/api/webhooks/... (valgfri)"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Lad feltet stå tomt for automatisk oprettelse
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="auto-manual-webhook-url">{t('bot.full_scan_webhook')}</Label>
                          <Input
                            id="auto-manual-webhook-url"
                            placeholder="https://discord.com/api/webhooks/... (valgfri)"
                            value={manualWebhookUrl}
                            onChange={(e) => setManualWebhookUrl(e.target.value)}
                          />
                        </div>
                      </div>
                    </details>

                    {guildId && servers.some((server) => server.guild_id === guildId) && (
                      <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                        {t('bot.already_added_hint')}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="guild-id">{t('bot.discord_server_id')}</Label>
                  <Input
                    id="guild-id"
                    placeholder="123456789012345678"
                    value={guildId}
                    onChange={(e) => setGuildId(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('bot.server_id_help')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="guild-name">{t('bot.server_name')}</Label>
                  <Input
                    id="guild-name"
                    placeholder="My FiveM Server"
                    value={guildName}
                    onChange={(e) => setGuildName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook-url">{t('bot.auto_scan_webhook')}</Label>
                  <Input
                    id="webhook-url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('bot.auto_scan_desc')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manual-webhook-url">{t('bot.full_scan_webhook')}</Label>
                  <Input
                    id="manual-webhook-url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={manualWebhookUrl}
                    onChange={(e) => setManualWebhookUrl(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('bot.full_scan_desc')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="channel-name">{t('bot.channel_name')}</Label>
                  <Input
                    id="channel-name"
                    placeholder="cheater-alerts"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                  />
                </div>

                {/* Ownership verification for manual mode */}
                {guildId && !isAdmin && (
                  <div className="space-y-2 rounded-lg border border-border/30 bg-secondary/10 p-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-medium">{t('bot.ownership_verification')}</Label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('bot.enter_discord_id')}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('bot.your_discord_id')}
                        value={discordUserId}
                        onChange={(e) => {
                          setDiscordUserId(e.target.value);
                          setOwnershipVerified(null);
                          setOwnershipError(null);
                        }}
                        className="flex-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verifyOwnership(guildId, discordUserId)}
                        disabled={isVerifyingOwnership || !discordUserId.trim() || ownershipVerified?.guildId === guildId}
                        className="shrink-0"
                      >
                        {isVerifyingOwnership ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : ownershipVerified?.guildId === guildId ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Shield className="w-3.5 h-3.5" />
                        )}
                        {ownershipVerified?.guildId === guildId ? t('bot.verified') : t('bot.verify')}
                      </Button>
                    </div>
                    {ownershipVerified?.guildId === guildId && (
                      <p className="text-[11px] text-green-500 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {t('bot.verified_as')} {ownershipVerified.username || discordUserId}
                      </p>
                    )}
                    {ownershipError && (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {ownershipError}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60">
                      {t('bot.find_discord_id')}
                    </p>
                  </div>
                )}
                {guildId && isAdmin && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    {t('bot.admin_bypass')}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>{t('bot.cancel')}</Button>
              <Button
                onClick={handleAdd}
                disabled={
                  isSubmitting ||
                  !guildId ||
                  (!isAdmin && ownershipVerified?.guildId !== guildId) ||
                  (addMode === 'auto' && servers.some((server) => server.guild_id === guildId))
                }
                className="gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {!isAdmin && (!ownershipVerified || ownershipVerified.guildId !== guildId)
                  ? t('bot.verify_first')
                  : addMode === 'auto' && servers.some((server) => server.guild_id === guildId)
                    ? t('bot.already_added_btn')
                    : t('bot.add_server')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══════════ EDIT SERVER DIALOG ═══════════ */}
        <Dialog open={!!editServer} onOpenChange={(open) => !open && setEditServer(null)}>
          <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
            {/* Server header with icon */}
            {editServer && (() => {
              const iconUrl = editServer.guild_icon
                ? `https://cdn.discordapp.com/icons/${editServer.guild_id}/${editServer.guild_icon}.${editServer.guild_icon.startsWith('a_') ? 'gif' : 'png'}?size=128`
                : null;
              return (
                <div className="relative bg-gradient-to-br from-primary/10 via-card/60 to-card/30 border-b border-border/20 px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt={editServer.guild_name || ''}
                          className="w-14 h-14 rounded-2xl object-cover ring-2 ring-primary/20 shadow-lg"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-primary/15 ring-2 ring-primary/20 flex items-center justify-center shadow-lg">
                          <Server className="w-6 h-6 text-primary" />
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-background" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-foreground truncate">
                        {editServer.guild_name || 'Unknown Server'}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          {editServer.guild_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        {editServer.member_count && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {editServer.member_count.toLocaleString()} members
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Added {formatDistanceToNow(new Date(editServer.created_at), { addSuffix: true })}
                        </span>
                        {editServer.is_active ? (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/20 px-1.5 py-0">Protected</Badge>
                        ) : (
                          <Badge className="text-[9px] bg-destructive/15 text-destructive border-destructive/20 px-1.5 py-0">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="px-6 py-5 space-y-5">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('bot.server_name')}</Label>
                <Input
                  value={editGuildName}
                  onChange={(e) => setEditGuildName(e.target.value)}
                  className="bg-card/40 border-border/30 focus:border-primary/50"
                />
              </div>

              <div className="rounded-lg border border-border/20 bg-card/20 p-4 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Webhook className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{t('bot.webhook_config')}</span>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('bot.auto_scan_label')} <span className="text-primary/60">(every 1 min)</span></Label>
                  <Input
                    value={editWebhookUrl}
                    onChange={(e) => setEditWebhookUrl(e.target.value)}
                    className="bg-card/40 border-border/30 focus:border-primary/50 font-mono text-xs"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('bot.full_scan_label')} <span className="text-muted-foreground/50">(optional)</span></Label>
                  <Input
                    placeholder="https://discord.com/api/webhooks/..."
                    value={editManualWebhookUrl}
                    onChange={(e) => setEditManualWebhookUrl(e.target.value)}
                    className="bg-card/40 border-border/30 focus:border-primary/50 font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground/50">
                    {t('bot.fallback_hint')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('bot.alert_channel')} <span className="text-muted-foreground/50 normal-case">(optional)</span></Label>
                <Input
                  value={editChannelName}
                  onChange={(e) => setEditChannelName(e.target.value)}
                  placeholder="#alerts"
                  className="bg-card/40 border-border/30 focus:border-primary/50"
                />
              </div>
            </div>

            <div className="px-6 pb-5 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setEditServer(null)} className="px-4">{t('bot.cancel')}</Button>
              <Button onClick={handleSaveEdit} disabled={isEditing} className="gap-2 px-5">
                {isEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {t('bot.save_changes')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ═══════════ SERVER DETAIL PANEL ═══════════ */}
        <Suspense fallback={null}>
          <ServerDetailPanel
            server={detailServer}
            onClose={() => setDetailServer(null)}
            isOwner={detailServer ? ownedServerIds.has(detailServer.id) : false}
            scanResult={detailServer ? lastScanResults[detailServer.id] : undefined}
            recentJoins={recentJoins}
            detectedCheaters={detectedCheaters}
            onEdit={(srv) => openEditDialog(srv)}
            onScan={(srv) => handleScanAll(srv)}
            onTestWebhook={(srv) => handleTestWebhook(srv)}
            onToggle={(srv) => handleToggle(srv)}
            isScanning={isScanning}
            isTesting={isTesting}
            copyToClipboard={copyToClipboard}
          />

          <BotExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            servers={servers.map(s => ({ guild_id: s.guild_id, guild_name: s.guild_name }))}
          />
          <ShareServerDialog
            open={!!shareServerId}
            onOpenChange={(open) => { if (!open) setShareServerId(null); }}
            serverId={shareServerId || ''}
            serverName={shareServerName}
            isOwner={shareServerId ? ownedServerIds.has(shareServerId) : false}
          />
        </Suspense>
      </div>
    </TooltipProvider>
  );
};

export default BotSetup;
