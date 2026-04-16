import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, Loader2, XCircle } from 'lucide-react';
import DiscordMascot from '@/components/DiscordMascot';
import BrandLogo from '@/components/BrandLogo';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useScanStore } from '@/stores/scanStore';

interface Profile {
  display_name: string | null;
  role: string | null;
  avatar_url: string | null;
}

interface AppHeaderProps {
  showBackButton?: boolean;
  title?: string;
  subtitle?: string;
}

const PROFILE_CACHE_KEY = 'ckp_profile_cache';

const getCachedProfile = (): Profile | null => {
  try {
    const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const setCachedProfile = (profile: Profile) => {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {}
};

const AppHeader = ({ showBackButton = false, title, subtitle }: AppHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isOwner, isModerator, userRole } = useAdminStatus();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(getCachedProfile);
  const { isScanning, scanServerId, scanServerName, progress, stopScan } = useScanStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const sessionFallback: Profile = {
        display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
        role: null,
        avatar_url: session.user.user_metadata?.avatar_url || null,
      };
      if (!profile) {
        setProfile(sessionFallback);
      }
      supabase
        .from('profiles')
        .select('display_name, role, avatar_url')
        .eq('user_id', session.user.id)
        .single()
        .then(({ data, error }) => {
          if (data) {
            const profileData = {
              ...data,
              avatar_url: data.avatar_url || session.user.user_metadata?.avatar_url || null,
            };
            setProfile(profileData);
            setCachedProfile(profileData);
          } else if (error) {
            setProfile(sessionFallback);
            setCachedProfile(sessionFallback);
          }
        });
    });
  }, []);

  const handleLogout = async () => {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    await supabase.auth.signOut();
    toast.success(t('nav.logged_out'));
    navigate('/auth');
  };

  const handleStopActiveScan = async () => {
    const startedAt = progress?.startedAt?.toISOString();
    const activeServerId = scanServerId;

    stopScan();

    try {
      if (activeServerId && startedAt) {
        const { data, error } = await supabase.functions.invoke('discord-member-check', {
          body: {
            action: 'stop-scan',
            serverId: activeServerId,
            scanStartedAt: startedAt,
          },
        });

        if (error || data?.success === false) {
          throw new Error(error?.message || data?.error || 'Failed to stop scan');
        }
      }

      toast.info('Scan stopped. Discord has been notified.');
    } catch {
      toast.error('Stop signal sent locally, but Discord confirmation failed');
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `relative px-1 py-1 text-sm font-medium transition-colors cursor-pointer ${
      isActive(path)
        ? 'text-foreground'
        : 'text-muted-foreground/70 hover:text-foreground'
    }`;

  const getRoleBadge = () => {
    if (isOwner) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[hsl(var(--yellow))]/15 text-[hsl(var(--yellow))] border border-[hsl(var(--yellow))]/20">
          Owner
        </span>
      );
    }
    if (isAdmin) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[hsl(var(--magenta))]/15 text-[hsl(var(--magenta))] border border-[hsl(var(--magenta))]/20">
          Admin
        </span>
      );
    }
    if (isModerator) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[hsl(var(--cyan))]/15 text-[hsl(var(--cyan))] border border-[hsl(var(--cyan))]/20">
          Moderator
        </span>
      );
    }
    if (userRole === 'mod_creator') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[hsl(var(--green))]/15 text-[hsl(var(--green))] border border-[hsl(var(--green))]/20">
          Mod Creator
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
        User
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/20 bg-background/60 backdrop-blur-2xl">
      <div className="container mx-auto px-6">
        <div className="flex items-center h-14">
          <div className="relative">
            <button
              onClick={() => navigate('/')}
              className="flex items-center hover:opacity-80 transition-opacity cursor-pointer mr-8"
            >
              <BrandLogo size="md" />
            </button>
            <DiscordMascot />
          </div>

          <nav className="flex items-center gap-6 flex-1">
            {isAdmin && (
              <button onClick={() => navigate('/admin')} className={navLinkClass('/admin')}>
                {t('nav.admin_label')}
              </button>
            )}
            <button onClick={() => navigate('/cheaters')} className={navLinkClass('/cheaters')}>
              {t('nav.cheater_db_label')}
            </button>
            <button onClick={() => navigate('/mods')} className={navLinkClass('/mods')}>
              {t('nav.mods_label')}
            </button>
            <button onClick={() => navigate('/coordinates')} className={navLinkClass('/coordinates')}>
              {t('nav.coords_label')}
            </button>
            <button onClick={() => navigate('/bot')} className={navLinkClass('/bot')}>
              Bot
              <span className="ml-1.5 px-1 py-px rounded text-[8px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25 leading-none align-top">Beta</span>
            </button>
          </nav>

          {isScanning && (
            <div onClick={() => navigate('/bot')} className="flex items-center gap-2 px-3 py-1.5 mr-4 rounded-lg border border-primary/30 bg-primary/10 animate-pulse cursor-pointer hover:bg-primary/20 transition-colors">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" style={{ animationDuration: '1s' }} />
              <span className="text-xs font-medium text-primary whitespace-nowrap">
                Scanning {scanServerName}…
              </span>
              <button
                onClick={handleStopActiveScan}
                className="p-0.5 rounded hover:bg-destructive/20 transition-colors cursor-pointer"
                title="Stop scan"
              >
                <XCircle className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/30 bg-card/40 hover:bg-card/60 transition-colors cursor-pointer"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-primary">
                    {(profile?.display_name || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {profile ? (
                <span className="text-sm text-foreground font-medium">{profile.display_name || t('nav.user_fallback')}</span>
              ) : (
                <span className="text-sm text-muted-foreground animate-pulse">{t('nav.loading')}</span>
              )}
              {getRoleBadge()}
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-card/60 transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('nav.logout')}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
