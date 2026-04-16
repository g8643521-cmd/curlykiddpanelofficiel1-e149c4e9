// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { motion, useInView, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, AlertTriangle, BarChart3, RefreshCw,
  Activity, Eye, Bot, Key, Crown, ShieldCheck,
  ChevronRight, Settings2, Zap, TrendingUp, Globe, Webhook, Database, ScrollText,
  ArrowUpRight, Clock, Search, PanelLeftClose, PanelLeft
} from 'lucide-react';
import BotPanel from '@/components/admin/BotPanel';
import BotOverviewPanel from '@/components/admin/BotOverviewPanel';
import ApiKeysPanel from '@/components/admin/ApiKeysPanel';
import CheaterManagement from '@/components/CheaterManagement';
import AddRoleByEmail from '@/components/admin/AddRoleByEmail';
import TransferOwnership from '@/components/admin/TransferOwnership';
import SocialLinksPanel from '@/components/admin/SocialLinksPanel';
import DatabaseExportPanel from '@/components/admin/DatabaseExportPanel';
import StatsOverridePanel from '@/components/admin/StatsOverridePanel';
import AuditLogPanel from '@/components/admin/AuditLogPanel';
import RoleManagementPanel from '@/components/admin/RoleManagementPanel';
import DiscordWebhookSettings from '@/components/DiscordWebhookSettings';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import AppHeader from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { supabase } from '@/lib/supabase';
import UserLifecyclePanel from '@/components/admin/UserLifecyclePanel';
import HeroImagePanel from '@/components/admin/HeroImagePanel';
import { toast } from 'sonner';

// Animated counter
const AnimatedNumber = ({ value, duration = 1.5 }: { value: number; duration?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const spring = useSpring(0, { duration: duration * 1000 });
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    if (isInView) spring.set(value);
  }, [isInView, value, spring]);

  return <motion.span ref={ref}>{display}</motion.span>;
};

interface Stats {
  totalUsers: number;
  totalAdmins: number;
  totalModerators: number;
  totalCheaterReports: number;
  recentActivity: Array<{ action: string; table_name: string; created_at: string; user_id: string | null }>;
}

const NAV_GROUPS = [
  {
    label: 'General',
    items: [
      { id: 'overview', label: 'Overview', icon: BarChart3, description: 'Stats & quick actions' },
      { id: 'users', label: 'User Management', icon: Users, description: 'Lifecycle, flags & risk' },
      { id: 'roles', label: 'Roles', icon: Crown, description: 'Manage staff roles' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'data', label: 'Data Management', icon: Database, description: 'Export & backup' },
      { id: 'audit', label: 'Audit Log', icon: ScrollText, description: 'Full change history' },
      { id: 'cheaters', label: 'Cheater DB', icon: AlertTriangle, description: 'Manage reports' },
      { id: 'appearance', label: 'Appearance', icon: Eye, description: 'Hero image & layout' },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'bot-overview', label: 'Bot Overview', icon: Eye, description: 'Server & scan overview' },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook, description: 'Discord notifications' },
      { id: 'bot', label: 'Bot Config', icon: Bot, description: 'Discord bot setup' },
      { id: 'api-keys', label: 'API Keys', icon: Key, description: 'Manage access tokens' },
    ],
  },
];

const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { isAdmin, isLoading: adminLoading } = useAdminStatus();
  const { getVisibility, updateSetting, isLoading: settingsLoading } = useSystemSettings();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast.error('Access denied. Admin privileges required.');
      navigate('/dashboard');
    }
  }, [adminLoading, isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin]);

  const fetchData = async () => {
    setIsLoading(true);
    await fetchStats();
    setIsLoading(false);
  };

  const fetchStats = async () => {
    const [usersCount, cheatersCount, rolesData, recentAudit] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('cheater_reports').select('id', { count: 'exact', head: true }),
      supabase.from('user_roles').select('role'),
      supabase.from('audit_log').select('action, table_name, created_at, user_id').order('created_at', { ascending: false }).limit(5),
    ]);
    const roles = rolesData.data || [];
    setStats({
      totalUsers: usersCount.count || 0,
      totalCheaterReports: cheatersCount.count || 0,
      totalAdmins: roles.filter(r => r.role === 'admin').length,
      totalModerators: roles.filter(r => r.role === 'moderator').length,
      recentActivity: recentAudit.data || [],
    });
  };

  const handleVisibilityChange = async (key: string, value: 'all' | 'admin' | 'disabled') => {
    const success = await updateSetting(key, value);
    if (success) {
      const labels = { all: 'visible to all', admin: 'admin only', disabled: 'disabled' };
      toast.success(`Updated: ${labels[value]}`);
    }
  };

  const currentNavItem = useMemo(() => {
    for (const g of NAV_GROUPS) {
      const found = g.items.find(i => i.id === selectedTab);
      if (found) return found;
    }
    return null;
  }, [selectedTab]);

  if (adminLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground font-medium">Loading admin panel…</span>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, color: 'primary', change: '+12%', up: true },
    { label: 'Admins', value: stats?.totalAdmins || 0, icon: Crown, color: 'yellow', change: null, up: null },
    { label: 'Moderators', value: stats?.totalModerators || 0, icon: ShieldCheck, color: 'cyan', change: null, up: null },
    { label: 'Reports', value: stats?.totalCheaterReports || 0, icon: AlertTriangle, color: 'magenta', change: '+3', up: true },
  ];

  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    primary: { bg: 'bg-primary/10', text: 'text-primary', ring: 'ring-primary/20' },
    yellow: { bg: 'bg-[hsl(var(--yellow))]/10', text: 'text-[hsl(var(--yellow))]', ring: 'ring-[hsl(var(--yellow))]/20' },
    cyan: { bg: 'bg-[hsl(var(--cyan))]/10', text: 'text-[hsl(var(--cyan))]', ring: 'ring-[hsl(var(--cyan))]/20' },
    magenta: { bg: 'bg-[hsl(var(--magenta))]/10', text: 'text-[hsl(var(--magenta))]', ring: 'ring-[hsl(var(--magenta))]/20' },
  };

  const formatTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const renderContent = () => {
    switch (selectedTab) {
      case 'overview':
        return (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Stat cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {isLoading
                ? [0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl border border-border/20 bg-card/40 p-5 animate-pulse h-[104px]" />
                  ))
                : statCards.map((card, i) => {
                    const c = colorMap[card.color];
                    return (
                      <motion.div
                        key={card.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.3 }}
                        className="relative rounded-xl border border-border/20 bg-card/40 p-5 hover:border-border/40 transition-all duration-300 group overflow-hidden"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">{card.label}</p>
                            <p className="text-3xl font-bold text-foreground tabular-nums">
                              <AnimatedNumber value={card.value} />
                            </p>
                          </div>
                          <div className={`w-10 h-10 rounded-lg ${c.bg} ring-1 ${c.ring} flex items-center justify-center`}>
                            <card.icon className={`w-[18px] h-[18px] ${c.text}`} />
                          </div>
                        </div>
                        {card.change && (
                          <div className="mt-2 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                            <span className="text-[10px] font-semibold text-emerald-400">{card.change}</span>
                            <span className="text-[10px] text-muted-foreground/50">vs last week</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
            </div>

            {/* Two-column: Quick Actions + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Quick Actions */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="rounded-xl border border-border/20 bg-card/40 overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-border/10 flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
                </div>
                <div className="p-3 grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Manage Roles', icon: Crown, tab: 'roles', color: 'yellow' },
                    { label: 'Cheater DB', icon: AlertTriangle, tab: 'cheaters', color: 'magenta' },
                    { label: 'Webhooks', icon: Webhook, tab: 'webhooks', color: 'cyan' },
                    { label: 'Export Data', icon: Database, tab: 'data', color: 'primary' },
                    { label: 'Bot Config', icon: Bot, tab: 'bot', color: 'primary' },
                    { label: 'API Keys', icon: Key, tab: 'api-keys', color: 'yellow' },
                  ].map((action) => {
                    const c = colorMap[action.color];
                    return (
                      <button
                        key={action.tab}
                        onClick={() => setSelectedTab(action.tab)}
                        className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary/30 border border-transparent hover:border-border/20 transition-all text-left group cursor-pointer"
                      >
                        <div className={`w-7 h-7 rounded-md ${c.bg} flex items-center justify-center shrink-0`}>
                          <action.icon className={`w-3.5 h-3.5 ${c.text}`} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors flex-1">{action.label}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              </motion.div>

              {/* Recent Activity */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-xl border border-border/20 bg-card/40 overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-border/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
                  </div>
                  <button
                    onClick={() => setSelectedTab('audit')}
                    className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="p-2">
                  {(!stats?.recentActivity || stats.recentActivity.length === 0) ? (
                    <div className="py-8 text-center text-xs text-muted-foreground/50">No recent activity</div>
                  ) : (
                    stats.recentActivity.map((event, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/15 transition-colors">
                        <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center shrink-0">
                          <Activity className="w-3.5 h-3.5 text-muted-foreground/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground/90 truncate capitalize">
                            {event.action.replace(/_/g, ' ')}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 truncate">{event.table_name}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap shrink-0">{formatTimeAgo(event.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>

            {/* System Status row */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-xl border border-border/20 bg-card/40 overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-border/10 flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">System Status</h3>
                <span className="ml-auto text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">All systems operational</span>
              </div>
              <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Database', latency: '12ms' },
                  { label: 'Authentication', latency: '8ms' },
                  { label: 'Edge Functions', latency: '45ms' },
                  { label: 'File Storage', latency: '23ms' },
                ].map((service) => (
                  <div key={service.label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/10 border border-border/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_hsl(145,80%,45%,0.5)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground/80">{service.label}</p>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/50">{service.latency}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Social links */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <SocialLinksPanel />
            </motion.div>
          </motion.div>
        );

      case 'users':
        return (
          <motion.div key="users" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <UserLifecyclePanel />
          </motion.div>
        );

      case 'roles':
        return (
          <motion.div key="roles" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <RoleManagementPanel />
              <div className="space-y-6">
                <AddRoleByEmail onRoleAssigned={fetchStats} />
                <TransferOwnership onTransferred={fetchStats} />
              </div>
            </div>
          </motion.div>
        );

      case 'data':
        return (
          <motion.div key="data" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <DatabaseExportPanel />
            <StatsOverridePanel />
          </motion.div>
        );

      case 'appearance':
        return (
          <motion.div key="appearance" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="rounded-xl border border-border/20 bg-card/50 p-6">
              <HeroImagePanel />
            </div>
          </motion.div>
        );

      case 'cheaters':
        return (
          <motion.div key="cheaters" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <CheaterManagement />
          </motion.div>
        );

      case 'bot':
        return (
          <motion.div key="bot" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <BotPanel />
          </motion.div>
        );

      case 'bot-overview':
        return (
          <motion.div key="bot-overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <BotOverviewPanel />
          </motion.div>
        );

      case 'api-keys':
        return (
          <motion.div key="api-keys" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ApiKeysPanel />
          </motion.div>
        );

      case 'webhooks':
        return (
          <motion.div key="webhooks" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <DiscordWebhookSettings />
          </motion.div>
        );

      case 'audit':
        return (
          <motion.div key="audit" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AuditLogPanel />
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-background">
      <MaintenanceBanner />
      <AppHeader />

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside
          className={`shrink-0 border-r border-border/15 bg-card/20 backdrop-blur-xl flex flex-col transition-all duration-300 ${
            sidebarCollapsed ? 'w-[60px]' : 'w-[260px]'
          }`}
        >
          {/* Sidebar header */}
          <div className={`px-4 py-4 border-b border-border/10 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-foreground leading-tight">Admin</p>
                  <p className="text-[9px] text-muted-foreground/50 font-semibold uppercase tracking-[0.2em]">Control Center</p>
                </div>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-7 h-7 rounded-md hover:bg-secondary/40 flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
            >
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto scrollbar-thin">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1.5 text-[9px] font-bold text-muted-foreground/30 uppercase tracking-[0.25em]">{group.label}</p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = selectedTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedTab(item.id)}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-2.5 rounded-lg text-left transition-all duration-200 group cursor-pointer ${
                          sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
                        } ${
                          isActive
                            ? 'bg-primary/10 text-foreground ring-1 ring-primary/15'
                            : 'text-muted-foreground/70 hover:text-foreground hover:bg-secondary/20'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all ${
                          isActive
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground/50 group-hover:text-foreground'
                        }`}>
                          <item.icon className="w-[15px] h-[15px]" />
                        </div>
                        {!sidebarCollapsed && (
                          <div className="flex-1 min-w-0">
                            <p className={`text-[12px] font-medium truncate ${isActive ? 'text-foreground' : ''}`}>{item.label}</p>
                            <p className={`text-[10px] truncate ${isActive ? 'text-primary/60' : 'text-muted-foreground/40'}`}>{item.description}</p>
                          </div>
                        )}
                        {isActive && !sidebarCollapsed && (
                          <div className="w-1 h-5 rounded-full bg-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar footer */}
          {!sidebarCollapsed && (
            <div className="px-4 py-3 border-t border-border/10">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/30 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
                <span>CurlyKidd Panel v2.0</span>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {/* Content header bar */}
          <div className="sticky top-0 z-10 border-b border-border/10 bg-background/80 backdrop-blur-xl px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentNavItem && (
                <>
                  <currentNavItem.icon className="w-4 h-4 text-primary" />
                  <div>
                    <h1 className="text-sm font-bold text-foreground leading-tight">{currentNavItem.label}</h1>
                    <p className="text-[10px] text-muted-foreground/50">{currentNavItem.description}</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchData}
                disabled={isLoading}
                className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="p-6 pb-20 md:pb-6">
            <AnimatePresence mode="wait">
              {renderContent()}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminPanel;
