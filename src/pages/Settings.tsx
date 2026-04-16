import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Volume2, Download, Trash2, Bell, BellOff, Monitor, Palette, Shield, EyeOff, Zap, Settings2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import Footer from '@/components/Footer';
import AppHeader from '@/components/AppHeader';
const CosmicNebulaBackground = lazy(() => import('@/components/CosmicNebulaBackground'));
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/hooks/useNotifications';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { soundEffects, CLICK_SOUND_PRESETS, type ClickSoundPreset } from '@/services/soundEffects';
import { toast } from 'sonner';
import profileBanner from '@/assets/profile-banner.jpg';

const ROLE_DISPLAY: Record<string, { label: string; color: string }> = {
  owner: { label: 'OWNER', color: 'text-[hsl(var(--yellow))]' },
  admin: { label: 'ADMIN', color: 'text-primary' },
  moderator: { label: 'MODERATOR', color: 'text-[hsl(var(--cyan))]' },
  integrations_manager: { label: 'INTEGRATIONS', color: 'text-[hsl(var(--purple))]' },
  mod_creator: { label: 'MOD CREATOR', color: 'text-[hsl(var(--green))]' },
  user: { label: 'USER', color: 'text-muted-foreground' },
};

const Settings = () => {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const { userRole } = useAdminStatus();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    user_id: string;
  } | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(soundEffects.isEnabled());
  const [clickPreset, setClickPreset] = useState<ClickSoundPreset>(soundEffects.getClickPreset());
  const { permissionGranted, requestPermission } = useNotifications();
  const [notificationsEnabled, setNotificationsEnabled] = useState(permissionGranted);
  const [isExporting, setIsExporting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('ckp-reduced-motion') === 'true');
  const [streamerMode, setStreamerMode] = useState(() => localStorage.getItem('ckp-streamer-mode') === 'true');
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('ckp-compact-mode') === 'true');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }
      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', session.user.id)
        .maybeSingle();

      setUserInfo({
        display_name: (profile as any)?.display_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
        avatar_url: (profile as any)?.avatar_url || session.user.user_metadata?.avatar_url || null,
        created_at: session.user.created_at,
        user_id: session.user.id,
      });
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => { setNotificationsEnabled(permissionGranted); }, [permissionGranted]);

  const handleSoundToggle = () => {
    const v = !soundEnabled;
    setSoundEnabled(v);
    soundEffects.setEnabled(v);
    if (v) soundEffects.playClick();
  };

  const handleNotificationToggle = async () => {
    if (!notificationsEnabled) {
      const granted = await requestPermission();
      setNotificationsEnabled(granted);
      if (granted) toast.success(t('settings.notifications_enabled'));
    } else {
      setNotificationsEnabled(false);
      toast.success(t('settings.notifications_disabled'));
    }
  };

  const toggleReducedMotion = () => {
    const v = !reducedMotion;
    setReducedMotion(v);
    localStorage.setItem('ckp-reduced-motion', String(v));
    toast.success(v ? t('settings.reduced_motion_on') : t('settings.animations_restored'));
  };

  const toggleStreamerMode = () => {
    const v = !streamerMode;
    setStreamerMode(v);
    localStorage.setItem('ckp-streamer-mode', String(v));
    toast.success(v ? t('settings.streamer_on') : t('settings.streamer_off'));
  };

  const toggleCompactMode = () => {
    const v = !compactMode;
    setCompactMode(v);
    localStorage.setItem('ckp-compact-mode', String(v));
    toast.success(v ? t('settings.compact_on') : t('settings.compact_off'));
  };

  const exportUserData = async () => {
    if (!userId) return;
    setIsExporting(true);
    try {
      const [profileRes, historyRes, favoritesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('search_history').select('*').eq('user_id', userId),
        supabase.from('server_favorites').select('*').eq('user_id', userId),
      ]);
      const exportData = { exportDate: new Date().toISOString(), profile: profileRes.data, searchHistory: historyRes.data, favorites: favoritesRes.data };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `curlykiddpanel-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('settings.export_success'));
    } catch {
      toast.error(t('settings.export_failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const clearSearchHistory = async () => {
    if (!userId) return;
    try {
      const { error } = await supabase.from('search_history').delete().eq('user_id', userId);
      if (error) throw error;
      toast.success(t('settings.history_cleared'));
    } catch {
      toast.error(t('settings.history_clear_failed'));
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const roleMeta = ROLE_DISPLAY[userRole] || ROLE_DISPLAY.user;
  const displayName = userInfo?.display_name || 'User';
  const initials = displayName[0]?.toUpperCase() || '?';

  const SettingRow = ({ icon: Icon, iconColor = 'text-primary', label, description, children }: {
    icon: any; iconColor?: string; label: string; description?: string; children: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-muted/10 transition-colors duration-150">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-1.5 rounded-lg bg-muted/30 shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-tight">{description}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  const SectionCard = ({ title, icon: Icon, delay, children, variant = 'default' }: {
    title: string; icon: any; delay: number; children: React.ReactNode; variant?: 'default' | 'danger';
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={`rounded-xl border overflow-hidden backdrop-blur-sm ${
        variant === 'danger'
          ? 'border-destructive/20 bg-card/60'
          : 'border-border/25 bg-card/60'
      }`}
    >
      <div className={`px-4 py-3 border-b flex items-center gap-2 ${
        variant === 'danger' ? 'border-destructive/10' : 'border-border/15'
      }`}>
        <Icon className={`w-3.5 h-3.5 ${variant === 'danger' ? 'text-destructive/70' : 'text-primary/70'}`} />
        <h3 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-border/10">{children}</div>
    </motion.div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <Suspense fallback={<div className="fixed inset-0 -z-10" style={{ background: 'hsl(230, 25%, 4%)' }} />}>
        <CosmicNebulaBackground />
      </Suspense>
      <MaintenanceBanner />
      <AppHeader />

      <main className="flex-1 relative z-10">
        <div className="container mx-auto px-4 py-6 md:py-10 max-w-2xl">
          {/* Hero Banner Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative rounded-2xl overflow-hidden border border-border/30 shadow-2xl shadow-black/40 mb-6"
          >
            <div className="relative h-44 sm:h-52 overflow-hidden">
              <img src={profileBanner} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
            </div>
            <div className="relative px-6 pb-6 -mt-16">
              <div className="flex items-end gap-5">
                <div className="w-24 h-24 rounded-full shadow-xl shadow-primary/20 overflow-hidden bg-card shrink-0">
                  {userInfo?.avatar_url ? (
                    <img src={userInfo.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-xl font-bold text-primary">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="pb-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground truncate">{displayName}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${roleMeta.color}`}>{roleMeta.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">·</span>
                    <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                      <Settings2 className="w-3 h-3" />
                      {t('settings.title')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="space-y-4">
            {/* Appearance & Language */}
            <SectionCard title={t('settings.appearance')} icon={Palette} delay={0.1}>
              <SettingRow icon={Globe} label={t('settings.language')} description={t('settings.choose_language')}>
                <div className="flex gap-1">
                  <button
                    onClick={() => setLang('en')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      lang === 'en' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >EN</button>
                  <button
                    onClick={() => setLang('da')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      lang === 'da' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >DA</button>
                </div>
              </SettingRow>
              <SettingRow icon={Zap} label={t('settings.reduced_motion_label')} description={t('settings.reduced_motion_desc2')}>
                <Switch checked={reducedMotion} onCheckedChange={toggleReducedMotion} />
              </SettingRow>
              <SettingRow icon={Monitor} label={t('settings.compact_mode')} description={t('settings.compact_mode_desc')}>
                <Switch checked={compactMode} onCheckedChange={toggleCompactMode} />
              </SettingRow>
            </SectionCard>

            {/* Sound & Notifications */}
            <SectionCard title={t('settings.sound_notif')} icon={Volume2} delay={0.15}>
              <SettingRow icon={Volume2} label={t('settings.sound_effects')} description={t('settings.sound_desc2')}>
                <Switch checked={soundEnabled} onCheckedChange={handleSoundToggle} />
              </SettingRow>
              {soundEnabled && (
                <div className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-2 font-medium">{t('settings.click_sound')}</p>
                  <div className="grid grid-cols-1 gap-1">
                    {CLICK_SOUND_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setClickPreset(preset.id);
                          soundEffects.setClickPreset(preset.id);
                          soundEffects.playClick(preset.id);
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                          clickPreset === preset.id
                            ? 'bg-primary/10 border border-primary/30 text-foreground'
                            : 'border border-transparent text-muted-foreground hover:bg-muted/15 hover:text-foreground'
                        }`}
                      >
                        <span className="font-medium">{preset.label}</span>
                        {clickPreset === preset.id && (
                          <span className="text-[10px] text-primary font-semibold px-2 py-0.5 bg-primary/10 rounded-md">{t('settings.active')}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <SettingRow icon={notificationsEnabled ? Bell : BellOff} label={t('settings.push_notifications')} description={t('settings.push_desc')}>
                <Switch checked={notificationsEnabled} onCheckedChange={handleNotificationToggle} />
              </SettingRow>
            </SectionCard>

            {/* Privacy & Security */}
            <SectionCard title={t('settings.privacy_security')} icon={Shield} delay={0.2}>
              <SettingRow icon={EyeOff} label={t('settings.streamer_mode')} description={t('settings.streamer_desc2')}>
                <Switch checked={streamerMode} onCheckedChange={toggleStreamerMode} />
              </SettingRow>
            </SectionCard>

            {/* Data Management */}
            <SectionCard title={t('settings.data')} icon={Download} delay={0.25}>
              <SettingRow icon={Download} label={t('settings.export_data')} description={t('settings.export_desc2')}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportUserData}
                  disabled={isExporting}
                  className="h-8 text-xs rounded-lg border-border/30 hover:border-primary/30 hover:bg-primary/5"
                >
                  {isExporting ? t('settings.exporting') : t('settings.export')}
                </Button>
              </SettingRow>
            </SectionCard>

            {/* Danger Zone */}
            <SectionCard title={t('settings.danger_zone')} icon={Trash2} delay={0.3} variant="danger">
              <SettingRow icon={Trash2} iconColor="text-destructive/70" label={t('settings.clear_history')} description={t('settings.clear_desc2')}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSearchHistory}
                  className="h-8 text-xs rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  {t('settings.clear')}
                </Button>
              </SettingRow>
            </SectionCard>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Settings;
