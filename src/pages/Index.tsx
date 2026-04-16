import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Users, Search, Package, MapPin, Crosshair, Eye, Globe, Code, Trophy, MessageCircle, Sparkles, Play, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
const CosmicNebulaBackground = lazy(() => import("@/components/CosmicNebulaBackground"));
import BrandLogo from "@/components/BrandLogo";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { useHeroImage } from "@/hooks/useHeroImage";
import { useI18n } from "@/lib/i18n";
import showcasePlayers from "@/assets/showcase-players.png";

import showcaseCheaters from "@/assets/showcase-cheaters.png";
import showcaseMods from "@/assets/showcase-mods.png";

const Index = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const heroImage = useHeroImage("/images/showcase-server-details.png");

  const showcaseFeatures = [
    { icon: Search, title: t("index.server_lookup"), desc: t("index.server_lookup_desc"), image: "/images/showcase-server-details.png" },
    { icon: Users, title: t("index.online_players"), desc: t("index.online_players_desc"), image: showcasePlayers },
    { icon: Shield, title: t("index.cheater_db"), desc: t("index.cheater_db_desc"), image: showcaseCheaters },
    { icon: Package, title: t("index.fivem_mods"), desc: t("index.fivem_mods_desc"), image: showcaseMods },
  ];

  const extraFeatures = [
    { icon: MapPin, title: t("index.player_locator"), desc: t("index.player_locator_desc"), color: "text-[hsl(var(--cyan))]", bg: "bg-[hsl(var(--cyan))]/10" },
    { icon: Crosshair, title: t("index.coord_lookup"), desc: t("index.coord_lookup_desc"), color: "text-[hsl(var(--magenta))]", bg: "bg-[hsl(var(--magenta))]/10" },
    { icon: Eye, title: t("index.watchlist"), desc: t("index.watchlist_desc"), color: "text-[hsl(var(--yellow))]", bg: "bg-[hsl(var(--yellow))]/10" },
    { icon: Globe, title: t("index.geolocation"), desc: t("index.geolocation_desc"), color: "text-[hsl(var(--purple))]", bg: "bg-[hsl(var(--purple))]/10" },
    { icon: Code, title: t("index.embed"), desc: t("index.embed_desc"), color: "text-primary", bg: "bg-primary/10" },
    { icon: Trophy, title: t("index.leaderboard"), desc: t("index.leaderboard_desc"), color: "text-[hsl(var(--yellow))]", bg: "bg-[hsl(var(--yellow))]/10" },
    { icon: MessageCircle, title: t("index.social"), desc: t("index.social_desc"), color: "text-[hsl(var(--cyan))]", bg: "bg-[hsl(var(--cyan))]/10" },
  ];

  useEffect(() => {
    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          navigate("/dashboard");
        } else {
          setIsLoggedIn(false);
        }
      }).catch(() => {
        setIsLoggedIn(false);
      });
    } catch {
      setIsLoggedIn(false);
    }
  }, [navigate]);

  if (isLoggedIn === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <Suspense fallback={<div className="fixed inset-0 -z-10" style={{ background: 'hsl(230, 25%, 4%)' }} />}>
        <CosmicNebulaBackground />
      </Suspense>

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/20 bg-background/60 backdrop-blur-2xl">
        <div className="container mx-auto px-6 flex items-center justify-between h-14">
          <button onClick={() => navigate("/")} className="hover:opacity-80 transition-opacity">
            <BrandLogo size="md" />
          </button>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Button onClick={() => navigate("/dashboard")} size="sm" className="gap-2">
                {t("index.dashboard")} <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-muted-foreground/70 hover:text-foreground">
                  {t("index.log_in")}
                </Button>
                <Button size="sm" onClick={() => navigate("/auth")} className="gap-2">
                  {t("index.get_started")} <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="container mx-auto px-6 pt-28 pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left - Text */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ duration: 0.7 }}
            >
              <h1 className="font-display text-5xl sm:text-6xl lg:text-[5rem] font-black leading-[1.05] tracking-tight">
                <span className="text-foreground">CurlyKidd</span>
                <br />
                <span className="bg-gradient-to-r from-primary via-[hsl(var(--cyan-glow))] to-primary bg-clip-text text-transparent">Panel</span>
              </h1>
              <p className="text-muted-foreground/70 text-base md:text-lg mt-8 max-w-md leading-relaxed">
                {t("hero.tagline")} <em className="text-foreground font-semibold not-italic">{t("hero.popular")}</em> {t("hero.hero_desc")}
              </p>
              <div className="flex flex-wrap gap-3 mt-10">
                <Button 
                  size="lg" 
                  onClick={() => navigate("/auth")} 
                  className="gap-2 px-8 h-12 text-sm font-semibold shadow-lg shadow-primary/20"
                >
                  <Zap className="w-4 h-4" />
                  {t("hero.server_lookup")}
                </Button>
                <Button 
                  size="lg" 
                  onClick={() => navigate("/cheaters")} 
                  className="gap-2 px-8 h-12 text-sm font-semibold shadow-lg shadow-primary/20"
                >
                  <Crosshair className="w-4 h-4" />
                  {t("hero.player_locator")}
                </Button>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center gap-6 mt-12 text-xs text-muted-foreground/40">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {t("hero.free")}
                </span>
                <span className="w-px h-3 bg-border/30" />
                <span>{t("hero.no_cc")}</span>
                <span className="w-px h-3 bg-border/30" />
                <span>{t("hero.instant")}</span>
              </div>
            </motion.div>

            {/* Right - Screenshot with floating stat cards */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Glow effects */}
              <div className="absolute -inset-8 bg-gradient-to-br from-primary/15 via-transparent to-[hsl(var(--cyan-glow))]/15 rounded-3xl blur-3xl opacity-50" />
              
              {/* Floating stat card - left */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="absolute -left-8 top-1/2 -translate-y-1/2 z-20 rounded-xl border border-border/30 bg-card/80 backdrop-blur-xl p-4 shadow-xl"
              >
                <p className="text-2xl font-bold text-primary">24,000+</p>
                <p className="text-xs text-muted-foreground/60">{t("hero.players_tracked")}</p>
              </motion.div>

              {/* Floating stat card - right */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute -right-6 top-1/3 z-20 rounded-xl border border-border/30 bg-card/80 backdrop-blur-xl p-4 shadow-xl"
              >
                <p className="text-2xl font-bold text-primary">5,000+</p>
                <p className="text-xs text-muted-foreground/60">{t("hero.cheaters_flagged")}</p>
              </motion.div>

              {/* Main screenshot */}
              <div className="relative rounded-2xl overflow-hidden border border-border/25 bg-gradient-to-b from-card/60 to-card/30 backdrop-blur-sm shadow-2xl shadow-background/50">
                <div className="flex items-center gap-2 px-4 py-3 bg-card/60 border-b border-border/15">
                  <div className="flex gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#FF5F57] shadow-sm shadow-[#FF5F57]/30" />
                    <span className="w-3 h-3 rounded-full bg-[#FEBC2E] shadow-sm shadow-[#FEBC2E]/30" />
                    <span className="w-3 h-3 rounded-full bg-[#28C840] shadow-sm shadow-[#28C840]/30" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <span className="text-[11px] text-muted-foreground/30 bg-card/40 px-4 py-1 rounded-lg border border-border/10 font-medium">
                      curlykiddpanel.com
                    </span>
                  </div>
                  <div className="w-[52px]" />
                </div>
                <img src={heroImage} alt="CurlyKiddPanel Server Details" className="w-full" loading="eager" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Showcase Features */}
        <section id="features" className="container mx-auto px-6 py-24">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold">
              <span className="gradient-text">{t("index.features_title")}</span>
            </h2>
            <p className="text-muted-foreground/60 mt-3 max-w-lg mx-auto">
              {t("index.features_desc")}
            </p>
          </motion.div>

          <div className="space-y-28">
            {showcaseFeatures.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5 }}
                className={`flex flex-col ${i % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"} items-center gap-10 lg:gap-16`}
              >
                <div className="flex-1 text-center lg:text-left">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary mb-5">
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground/70 text-base max-w-md mx-auto lg:mx-0 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
                <div className="flex-1 w-full">
                  <div className="rounded-xl overflow-hidden border border-border/30 shadow-xl shadow-primary/5 hover:shadow-primary/10 transition-shadow duration-500">
                    <img src={feature.image} alt={feature.title} className="w-full" loading="lazy" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Extra Features Grid */}
        <section className="container mx-auto px-6 py-24">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold">
              <span className="gradient-text">{t("index.more_features")}</span>
            </h2>
            <p className="text-muted-foreground/60 mt-3 max-w-lg mx-auto">
              {t("index.more_features_desc")}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {extraFeatures.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="p-6 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm hover:-translate-y-1 hover:border-border/40 transition-all duration-300 group cursor-default"
              >
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${feature.bg} ${feature.color} mb-4`}>
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="font-display text-base font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground/60 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-6 py-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-2xl border border-border/20 bg-card/30 backdrop-blur-xl p-12 md:p-20 text-center max-w-3xl mx-auto overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-[hsl(var(--cyan-glow))]/5" />
            <div className="relative">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                <span className="gradient-text">{t("index.cta_title")}</span>
              </h2>
              <p className="text-muted-foreground/60 text-lg mb-8 max-w-md mx-auto">
                {t("index.ready_desc")}
              </p>
              <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 px-10 h-12">
                {t("index.cta_button")} <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
