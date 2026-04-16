import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, User, ArrowRight, Chrome, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ParticleBackground from "@/components/ParticleBackground";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import { supabase } from "@/lib/supabase";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import Footer from "@/components/Footer";
import BrandLogo from "@/components/BrandLogo";
import { useI18n } from "@/lib/i18n";

type AuthMode = "login" | "signup" | "forgot-password";

const Auth = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    // Check if user is already logged in
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate("/dashboard");
      } else if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleOAuthSignIn = async (provider: "google" | "apple") => {
    setIsLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error(`${provider} auth error:`, error);
      toast.error(error.message || `${provider} sign-in failed`);
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });
      if (error) throw error;
      toast.success(t("auth.reset_sent"));
      setAuthMode("login");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success(t("auth.welcome_msg"));
      } else if (authMode === "signup") {
        // Always register as 'user' role - admin access is controlled separately
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              display_name: displayName || email.split("@")[0],
              role: "user", // Always set to user - no admin self-registration
            },
          },
        });
        if (error) throw error;
        // Send Discord webhook for new signup
        supabase.functions.invoke('new-user-webhook', {
          body: {
            display_name: displayName || email.split("@")[0],
            email,
            id: 'new-user',
          },
        }).catch(err => console.error('Signup webhook failed:', err));
        toast.success(t("auth.account_created"));
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      if (error.message?.includes("User already registered")) {
        toast.error("This email is already registered. Try logging in instead.");
      } else if (error.message?.includes("Invalid login credentials")) {
        toast.error("Invalid email or password.");
      } else {
        toast.error(error.message || "Authentication failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (authMode) {
      case "login": return t("auth.welcome_back");
      case "signup": return t("auth.create_account");
      case "forgot-password": return t("auth.reset_password");
    }
  };

  const getSubtitle = () => {
    switch (authMode) {
      case "login": return t("auth.sign_in_desc");
      case "signup": return t("auth.sign_up_desc");
      case "forgot-password": return t("auth.reset_desc");
    }
  };

  return (
    <div className="relative">
      <MaintenanceBanner />
      <ParticleBackground />

      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-lg"
        >
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <BrandLogo size="lg" />
          </div>

          {/* Auth Card */}
          <div className="glass-card p-6 sm:p-8">
            <div className="text-center mb-6">
              <h2 className="font-display text-2xl font-bold gradient-text mb-1">
                {getTitle()}
              </h2>
              <p className="text-muted-foreground text-sm">
                {getSubtitle()}
              </p>
            </div>

            {authMode === "forgot-password" ? (
              <>
                <form onSubmit={handleForgotPassword} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">{t("auth.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="pl-11 bg-secondary/50 border-border/50"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <>
                        {t("auth.send_reset")}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t("auth.back_to_sign_in")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 mb-5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOAuthSignIn("google")}
                    disabled={isLoading}
                    className="w-full h-12"
                  >
                    <Chrome className="w-5 h-5 mr-2" />
                    {t("auth.continue_google")}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOAuthSignIn("apple")}
                    disabled={isLoading}
                    className="w-full h-12"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    Continue with Apple
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">{t("auth.or")}</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {authMode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="displayName" className="text-foreground">{t("auth.display_name")}</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="displayName"
                          type="text"
                          placeholder={t("auth.display_name_placeholder")}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="pl-11 bg-secondary/50 border-border/50"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">{t("auth.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="pl-11 bg-secondary/50 border-border/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-foreground">{t("auth.password")}</Label>
                      {authMode === "login" && (
                        <button
                          type="button"
                          onClick={() => setAuthMode("forgot-password")}
                          className="text-xs text-primary hover:text-primary/80 transition-colors"
                        >
                          {t("auth.forgot_password")}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="pl-11 bg-secondary/50 border-border/50"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <>
                        {authMode === "login" ? t("auth.sign_in") : t("auth.sign_up")}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {authMode === "login" ? (
                      <>{t("auth.no_account")} <span className="text-primary font-medium">{t("auth.sign_up_link")}</span></>
                    ) : (
                      <>{t("auth.has_account")} <span className="text-primary font-medium">{t("auth.sign_in_link")}</span></>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default Auth;
