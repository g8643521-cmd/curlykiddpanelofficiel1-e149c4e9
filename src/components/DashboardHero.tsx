import { Zap, Crosshair } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useHeroImage } from "@/hooks/useHeroImage";

interface DashboardHeroProps {
  onExploreFeatures?: () => void;
  onGetStarted?: () => void;
}

export default function DashboardHero({ onExploreFeatures, onGetStarted }: DashboardHeroProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const heroImage = useHeroImage("/images/e20c2ec0-77ed-413b-9e0a-9157fa575bae.png");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center min-h-[60vh] py-8">
      {/* Left side - Text content */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
        className="space-y-6"
      >
        <h1 className="font-display text-5xl sm:text-6xl lg:text-[5rem] font-black leading-[1.05] tracking-tight">
          <span className="text-foreground">CurlyKidd</span>
          <br />
          <span className="bg-gradient-to-r from-primary via-[hsl(var(--cyan-glow))] to-primary bg-clip-text text-transparent">Panel</span>
        </h1>

        <p className="text-muted-foreground/70 text-base md:text-lg max-w-md leading-relaxed">
          {t('hero.tagline')} <em className="text-foreground font-semibold not-italic">{t('hero.popular')}</em> {t('hero.hero_desc')}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={onGetStarted}
            className="gap-2 px-8 h-12 text-sm font-semibold shadow-lg shadow-primary/20"
          >
            <Zap className="w-4 h-4" />
            {t('hero.server_lookup')}
          </Button>
          <Button
            size="lg"
            onClick={() => navigate("/cheaters")}
            className="gap-2 px-8 h-12 text-sm font-semibold shadow-lg shadow-primary/20"
          >
            <Crosshair className="w-4 h-4" />
            {t('hero.player_locator')}
          </Button>
        </div>

        {/* Trust indicators */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground/40 pt-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {t('hero.free')}
          </span>
          <span className="w-px h-3 bg-border/30" />
          <span>{t('hero.no_cc')}</span>
          <span className="w-px h-3 bg-border/30" />
          <span>{t('hero.instant')}</span>
        </div>
      </motion.div>

      {/* Right side - Browser mockup with stat cards */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative hidden lg:block"
      >
        {/* Glow */}
        <div className="absolute -inset-8 bg-gradient-to-br from-primary/15 via-transparent to-[hsl(var(--cyan-glow))]/15 rounded-3xl blur-3xl opacity-50" />

        {/* Floating stat card - left */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="absolute -left-8 top-1/2 -translate-y-1/2 z-20 rounded-xl bg-card/80 backdrop-blur-xl p-4 shadow-xl"
        >
          <p className="text-2xl font-bold text-primary">99.9%</p>
          <p className="text-xs text-muted-foreground/60">Uptime</p>
        </motion.div>

        {/* Floating stat card - right */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="absolute -right-6 top-1/3 z-20 rounded-xl bg-card/80 backdrop-blur-xl p-4 shadow-xl"
        >
          <p className="text-2xl font-bold text-primary">&lt;50ms</p>
          <p className="text-xs text-muted-foreground/60">Response Time</p>
        </motion.div>

        {/* Browser chrome mockup */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-card/60 to-card/30 backdrop-blur-sm shadow-2xl shadow-background/50">
          <div className="flex items-center gap-2 px-4 py-3 bg-card/60">
            <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-[#FF5F57] shadow-sm shadow-[#FF5F57]/30" />
              <span className="w-3 h-3 rounded-full bg-[#FEBC2E] shadow-sm shadow-[#FEBC2E]/30" />
              <span className="w-3 h-3 rounded-full bg-[#28C840] shadow-sm shadow-[#28C840]/30" />
            </div>
            <div className="flex-1 flex justify-center">
              <span className="text-[11px] text-muted-foreground/30 bg-card/40 px-4 py-1 rounded-lg font-medium">
                curlykiddpanel.com
              </span>
            </div>
            <div className="w-[52px]" />
          </div>
          <img src={heroImage} alt="CurlyKiddPanel Server Details" className="w-full" loading="eager" />
        </div>
      </motion.div>
    </div>
  );
}
