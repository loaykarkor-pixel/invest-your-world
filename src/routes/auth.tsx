import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./index";
import { LangToggle } from "@/components/LangToggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authError } from "@/lib/auth-errors";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ mode: s["mode"] === "signup" ? "signup" : "login" }) as { mode: "login" | "signup" },
  head: () => ({
    meta: [
      { title: "Sign in — INVESTERRA" },
      { name: "description", content: "Sign in or create your INVESTERRA investor account." },
      { property: "og:title", content: "Sign in — INVESTERRA" },
      { property: "og:description", content: "Access your investment portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useI18n();
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + "/auth", data: { full_name: name } },
      });
      setBusy(false);
      if (error) { toast.error(authError(error.message, lang)); return; }
      if (data.user && data.user.identities?.length === 0) { toast.error(t("alreadyExists")); return; }
      toast.success(t("checkEmail"));
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error(authError(error.message, lang)); return; }
      navigate({ to: "/dashboard" });
    }
  }

  async function forgot() {
    if (!email) { toast.error(t("enterEmailFirst")); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
    if (error) { toast.error(authError(error.message, lang)); return; }
    toast.success(t("resetSent"));
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) { toast.error(authError(String(r.error.message ?? r.error), lang)); return; }
    if (r.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="absolute top-6 end-6"><LangToggle /></div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold">{isSignup ? t("signup") : t("login")}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {isSignup && (
            <div className="space-y-1.5"><Label>{t("fullName")}</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          )}
          <div className="space-y-1.5"><Label>{t("email")}</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("password")}</Label><Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {!isSignup && <button type="button" onClick={forgot} className="text-sm text-primary">{t("forgot")}</button>}
          <button disabled={busy} className="w-full rounded-xl bg-gradient-gold py-3 font-semibold text-primary-foreground shadow-gold disabled:opacity-60">
            {isSignup ? t("signup") : t("login")}
          </button>
        </form>
        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />{t("or")}<div className="h-px flex-1 bg-border" /></div>
        <button onClick={google} className="w-full rounded-xl border border-border py-3 font-medium hover:bg-accent">{t("google")}</button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignup ? t("haveAccount") : t("noAccount")}{" "}
          <button className="font-semibold text-primary" onClick={() => navigate({ to: "/auth", search: { mode: isSignup ? "login" : "signup" } })}>
            {isSignup ? t("login") : t("signup")}
          </button>
        </p>
      </div>
    </div>
  );
}
