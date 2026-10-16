import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assetName } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle, StatusBadge } from "@/components/AppShell";
import { Stat } from "./dashboard";

const allWithdrawalsQ = queryOptions({
  queryKey: ["admin-withdrawals"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("withdrawal_requests")
      .select("id, user_id, amount, currency, network, destination_address, status, admin_note, transaction_hash, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

const allPaymentsQ = queryOptions({
  queryKey: ["admin-payments"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("payments")
      .select("*, investments(asset_type, stocks(symbol), properties(title_en, title_ar))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => { if (!context.isAdmin) throw redirect({ to: "/dashboard" }); },
  head: () => ({ meta: [{ title: "Admin — INVESTERRA" }, { name: "description", content: "Review crypto payments." }, { property: "og:title", content: "Admin — INVESTERRA" }, { property: "og:description", content: "Admin dashboard." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allPaymentsQ),
  component: Admin,
});

function Admin() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(allPaymentsQ);
  const { data: withdrawals, error: withdrawalsError } = useQuery(allWithdrawalsQ);
  const qc = useQueryClient();
  const pending = data.filter((p) => p.status === "pending");
  const confirmed = data.filter((p) => p.status === "confirmed").reduce((s, p) => s + Number(p.amount_usd), 0);

  async function reviewWithdrawal(id: string, approve: boolean) {
    const note = approve ? null : prompt(lang === "ar" ? "سبب الرفض (اختياري)" : "Reason for rejection (optional)") ?? null;
    const { error } = await supabase.rpc("review_withdrawal_request", { _request_id: id, _approve: approve, _note: note });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? (lang === "ar" ? "تمت الموافقة على طلب السحب" : "Withdrawal approved for manual processing") : (lang === "ar" ? "تم رفض طلب السحب" : "Withdrawal request rejected"));
    qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
  }

  async function review(id: string, approve: boolean) {
    const note = approve ? null : prompt(t("reject")) ?? null;
    const { error } = await supabase.rpc("review_payment", { _payment_id: id, _approve: approve, ...(note ? { _note: note } : {}) });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? t("confirmed") : t("rejected"));
    qc.invalidateQueries();
  }

  return (
    <div>
      <PageTitle title={t("admin")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("pendingPayments")} value={String(pending.length)} tone="gold" />
        <Stat label={t("confirmed")} value={fmtUsd(confirmed, lang)} tone="pos" />
        <Stat label={t("transactions")} value={String(data.length)} />
      </div>
      <h2 className="mb-3 mt-8 font-semibold">{lang === "ar" ? "طلبات السحب" : "Withdrawal requests"}</h2>
      {withdrawalsError && <p className="text-sm text-destructive">{lang === "ar" ? "تعذر تحميل طلبات السحب. تأكد من تطبيق ترحيل قاعدة البيانات." : "Could not load withdrawals. Ensure database migrations are applied."}</p>}
      <div className="space-y-3">
        {withdrawals?.length === 0 && <p className="text-muted-foreground">{lang === "ar" ? "لا توجد طلبات سحب." : "No withdrawal requests."}</p>}
        {withdrawals?.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{Number(w.amount).toLocaleString()} {w.currency}</p>
              <p className="break-all text-start text-xs text-muted-foreground">{w.network} · {w.destination_address}</p>
              <p className="text-xs text-muted-foreground">{lang === "ar" ? "المستخدم" : "User"}: {w.user_id.slice(0, 8)} · {new Date(w.created_at).toLocaleString()}</p>
              {w.admin_note && <p className="text-xs text-muted-foreground">{lang === "ar" ? "ملاحظة" : "Note"}: {w.admin_note}</p>}
            </div>
            <StatusBadge s={w.status} />
            {w.status === "pending" && <div className="flex gap-2">
              <button onClick={() => reviewWithdrawal(w.id, true)} className="rounded-lg bg-positive px-3 py-1.5 text-sm font-semibold text-primary-foreground">{t("approve")}</button>
              <button onClick={() => reviewWithdrawal(w.id, false)} className="rounded-lg border border-negative px-3 py-1.5 text-sm font-semibold text-negative">{t("reject")}</button>
            </div>}
          </div>
        ))}
      </div>
      <h2 className="mb-3 mt-8 font-semibold">{t("transactions")}</h2>
      <div className="space-y-3">
        {data.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}
        {data.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.investments ? assetName(p.investments, lang) : "—"}</p>
              <p className="num break-all text-start text-xs text-muted-foreground">{p.currency} · {p.network} · {p.tx_hash}</p>
              <p className="num text-start text-xs text-muted-foreground">{t("user")}: {p.user_id.slice(0, 8)} · {new Date(p.created_at).toLocaleString()}</p>
            </div>
            <p className="num font-semibold">{fmtUsd(Number(p.amount_usd), lang)}</p>
            {p.status === "pending" ? (
              <div className="flex gap-2">
                <button onClick={() => review(p.id, true)} className="rounded-lg bg-positive px-3 py-1.5 text-sm font-semibold text-primary-foreground">{t("approve")}</button>
                <button onClick={() => review(p.id, false)} className="rounded-lg border border-negative px-3 py-1.5 text-sm font-semibold text-negative">{t("reject")}</button>
              </div>
            ) : <StatusBadge s={p.status} />}
          </div>
        ))}
      </div>
    </div>
  );
}
