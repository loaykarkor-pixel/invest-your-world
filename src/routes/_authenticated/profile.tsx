import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — INVESTERRA" }, { name: "description", content: "Manage your investor profile." }, { property: "og:title", content: "Profile — INVESTERRA" }, { property: "og:description", content: "Investor profile." }] }),
  component: Profile,
});

function Profile() {
  const { t } = useI18n();
  const { user } = Route.useRouteContext();
  const [f, setF] = useState({ full_name: "", phone: "", country: "" });
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setF({ full_name: data.full_name ?? "", phone: data.phone ?? "", country: data.country ?? "" });
    });
  }, [user.id]);
  async function save() {
    const { error } = await supabase.from("profiles").update(f).eq("id", user.id);
    error ? toast.error(error.message) : toast.success(t("save"));
  }
  return (
    <div className="max-w-lg">
      <PageTitle title={t("profile")} sub={user.email} />
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        {(["full_name", "phone", "country"] as const).map((k) => (
          <div key={k} className="space-y-1.5">
            <Label>{t(k === "full_name" ? "fullName" : k)}</Label>
            <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <button onClick={save} className="rounded-xl bg-gradient-gold px-6 py-2.5 font-semibold text-primary-foreground">{t("save")}</button>
      </div>
    </div>
  );
}
