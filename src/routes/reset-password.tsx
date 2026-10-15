import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { authError } from "@/lib/auth-errors";
import { Logo } from "./index";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — INVESTERRA" },
      { name: "description", content: "Set a new password for your INVESTERRA account." },
      { property: "og:title", content: "Reset password — INVESTERRA" },
      { property: "og:description", content: "Set a new password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { setReady(true); setChecked(true); }
    });
    const t1 = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      if (s.session) setReady(true);
      setChecked(true);
    }, 1200);
    return () => { data.subscription.unsubscribe(); clearTimeout(t1); };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(authError(error.message, lang)); return; }
    toast.success(t("passwordUpdated"));
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <Logo />
        {checked && !ready ? (
          <p className="mt-6 text-muted-foreground">{t("invalidLink")}</p>
        ) : (
          <form onSubmit={save} className="mt-6 space-y-4">
            <div className="space-y-1.5"><Label>{t("newPassword")}</Label><Input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <button disabled={busy || !ready} className="w-full rounded-xl bg-gradient-gold py-3 font-semibold text-primary-foreground disabled:opacity-60">{t("save")}</button>
          </form>
        )}
      </div>
    </div>
  );
}
