import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assetName } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle, StatusBadge } from "@/components/AppShell";
import { cryptoStatusQ } from "@/lib/crypto-status";
import { Button } from "@/components/ui/button";
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


const allDepositsQ = queryOptions({ queryKey: ["admin-deposits"], queryFn: async () => {
  const { data, error } = await supabase.from("deposit_requests").select("id, user_id, amount_claimed, amount_confirmed, deposit_address, tx_hash, status, admin_note, created_at").order("created_at", { ascending: false });
  if (error) throw error; return data;
} });

const allBitcoinDepositsQ = queryOptions({ queryKey: ["admin-bitcoin-deposits"], queryFn: async () => {
  const { data, error } = await supabase.from("bitcoin_deposit_requests").select("id, user_id, amount_claimed, amount_confirmed, deposit_address, tx_hash, status, admin_note, created_at").order("created_at", { ascending: false });
  if (error) throw error; return data;
} });

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
  head: () => ({ meta: [{ title: "Admin — Al Rayyan Real Estate Investment" }, { name: "description", content: "Review crypto payments." }, { property: "og:title", content: "Admin — Al Rayyan Real Estate Investment" }, { property: "og:description", content: "Admin dashboard." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allPaymentsQ),
  component: Admin,
});

function Admin() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(allPaymentsQ);
  const { data: withdrawals, error: withdrawalsError } = useQuery(allWithdrawalsQ);
  const { data: deposits, error: depositsError } = useQuery(allDepositsQ);
  const { data: bitcoinDeposits, error: bitcoinDepositsError } = useQuery(allBitcoinDepositsQ);
  const qc = useQueryClient();
  const { data: cryptoStatus } = useQuery(cryptoStatusQ);
  const isTest = cryptoStatus?.operating_mode === "test";
  const pending = data.filter((p) => p.status === "pending");
  const confirmed = data.filter((p) => p.status === "confirmed").reduce((s, p) => s + Number(p.amount_usd), 0);


  async function reviewDeposit(id: string, confirm: boolean, amount?: number) {
    let confirmedAmount: number | null = null;
    if (confirm) { const entered = prompt(lang === "ar" ? "أدخل المبلغ الذي تحققت منه على الشبكة" : "Enter the amount verified on-chain", String(amount ?? "")); if (entered === null) return; confirmedAmount = Number(entered); if (!Number.isFinite(confirmedAmount) || confirmedAmount <= 0) { toast.error(lang === "ar" ? "المبلغ غير صحيح" : "Invalid amount"); return; } }
    const note = confirm ? prompt(t("verificationEvidence")) : prompt(t("reject"));
    if (confirm && (!note || note.trim().length < 10)) return;
    const { error } = await supabase.rpc("review_deposit_request", { _request_id: id, _confirm: confirm, _confirmed_amount: confirmedAmount, _note: note });
    if (error) { toast.error(error.message); return; }
    toast.success(t("depositCreditResult"));
    qc.invalidateQueries({ queryKey: ["admin-deposits"] });
  }

  async function reviewBitcoinDeposit(id: string, confirm: boolean, claimedAmount: number) {
    let confirmedAmount: number | null = null;
    if (confirm) {
      const entered = prompt(lang === "ar" ? "أدخل المبلغ الذي تحققت منه فعلياً على شبكة Bitcoin (BTC)" : "Enter the BTC amount you actually verified on the Bitcoin network", String(claimedAmount));
      if (entered === null) return;
      confirmedAmount = Number(entered);
      if (!Number.isFinite(confirmedAmount) || confirmedAmount <= 0) {
        toast.error(lang === "ar" ? "المبلغ غير صحيح" : "Invalid amount");
        return;
      }
      const verified = window.confirm(lang === "ar"
        ? "هل تحققت بنفسك من mempool.space أن المعاملة مؤكدة، وأنها أرسلت إلى العنوان المعروض وبالمبلغ الصحيح؟ لا تؤكد اعتماداً على TXID وحده."
        : "Did you independently verify on mempool.space that the transaction is confirmed, sent to the displayed address, and for the correct amount? Do not confirm based on TXID alone.");
      if (!verified) return;
    }
    const note = confirm ? prompt(t("verificationEvidence")) : prompt(t("reject"));
    if (confirm && (!note || note.trim().length < 10)) return;
    const { error } = await supabase.rpc("review_bitcoin_deposit_request", {
      _request_id: id, _confirm: confirm, _confirmed_amount: confirmedAmount, _note: note,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(lang === "ar"
      ? (confirm ? "تم تأكيد الإيداع وإضافة المبلغ المتحقق منه إلى دفتر الرصيد." : "تم رفض طلب إيداع BTC.")
      : (confirm ? "Deposit confirmed and verified amount credited to the wallet ledger." : "BTC deposit request rejected."));
    qc.invalidateQueries({ queryKey: ["admin-bitcoin-deposits"] });
  }

  async function reviewWithdrawal(id: string, approve: boolean) {
    const note = approve ? null : prompt(lang === "ar" ? "سبب الرفض (اختياري)" : "Reason for rejection (optional)") ?? null;
    const { error } = await supabase.rpc("review_withdrawal_request", { _request_id: id, _approve: approve, _note: note });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? (lang === "ar" ? "موافقة للمراجعة فقط — لم يتم الدفع" : "Withdrawal approved for review only — not paid") : (lang === "ar" ? "تم رفض طلب السحب" : "Withdrawal request rejected"));
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
      <p role="status" className="mb-6 border border-border p-4 text-primary">{t(!cryptoStatus ? "cryptoUnavailable" : isTest ? "cryptoTest" : "cryptoUnconfigured")}</p>
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
              <Button disabled={!isTest} onClick={() => reviewWithdrawal(w.id, true)} className="rounded-lg bg-positive px-3 py-1.5 text-sm font-semibold text-primary-foreground">{t("approve")}</Button>
              <Button onClick={() => reviewWithdrawal(w.id, false)} className="rounded-lg border border-negative px-3 py-1.5 text-sm font-semibold text-negative">{t("reject")}</Button>
            </div>}
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">{lang === "ar" ? "طلبات إيداع USDT" : "USDT deposit requests"}</h2>
      {depositsError && <p className="text-sm text-destructive">{lang === "ar" ? "تعذر تحميل الإيداعات؛ تأكد من تطبيق الترحيل." : "Could not load deposits; ensure migration is applied."}</p>}
      {deposits?.length === 0 && <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد طلبات إيداع." : "No deposit requests."}</p>}
      <div className="space-y-3">{deposits?.map(d => <div key={d.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"><div className="min-w-0 flex-1"><p className="font-semibold">{Number(d.amount_claimed)} USDT · {lang === "ar" ? "المستخدم" : "User"} {d.user_id.slice(0,8)}</p><p className="break-all text-xs text-muted-foreground">{d.deposit_address}</p>{d.tx_hash && <a className="break-all text-xs underline" href={`https://tronscan.org/#/transaction/${d.tx_hash}`} target="_blank" rel="noreferrer">{lang === "ar" ? "افتح المعاملة على TronScan للتحقق" : "Open transaction on TronScan to verify"}</a>}<p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>{d.admin_note && <p className="text-xs text-muted-foreground">{d.admin_note}</p>}</div><StatusBadge s={d.status} />{d.status === "pending_verification" && <div className="flex gap-2"><Button disabled={!isTest} onClick={() => reviewDeposit(d.id, true, Number(d.amount_claimed))} className="rounded-lg bg-positive px-3 py-1.5 text-sm font-semibold text-primary-foreground">{lang === "ar" ? "تحقق وأكّد" : "Verify & confirm"}</Button><Button onClick={() => reviewDeposit(d.id, false)} className="rounded-lg border border-negative px-3 py-1.5 text-sm font-semibold text-negative">{t("reject")}</Button></div>}</div>)}</div>

      <h2 className="mb-3 mt-8 font-semibold">{lang === "ar" ? "طلبات إيداع Bitcoin (BTC)" : "Bitcoin (BTC) deposit requests"}</h2>
      {bitcoinDepositsError && <p className="text-sm text-destructive">{lang === "ar" ? "تعذر تحميل طلبات BTC. تأكد من تطبيق ترحيل قاعدة البيانات." : "Could not load BTC requests. Ensure the database migration is applied."}</p>}
      {bitcoinDeposits?.length === 0 && <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد طلبات BTC." : "No BTC requests."}</p>}
      <div className="space-y-3">
        {bitcoinDeposits?.map(d => <div key={d.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{Number(d.amount_claimed)} BTC · {lang === "ar" ? "المستخدم" : "User"} {d.user_id.slice(0, 8)}</p>
            <p className="break-all text-xs text-muted-foreground">{d.deposit_address}</p>
            {d.tx_hash && <a className="break-all text-xs underline" href={`https://mempool.space/tx/${d.tx_hash}`} target="_blank" rel="noreferrer">{lang === "ar" ? "افتح المعاملة على mempool.space وتحقق منها" : "Open transaction on mempool.space and verify"}</a>}
            <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
            {d.admin_note && <p className="text-xs text-muted-foreground">{d.admin_note}</p>}
          </div>
          <StatusBadge s={d.status} />
          {d.status === "pending_verification" && <div className="flex gap-2">
            <Button disabled={!isTest} onClick={() => reviewBitcoinDeposit(d.id, true, Number(d.amount_claimed))} className="rounded-lg bg-positive px-3 py-1.5 text-sm font-semibold text-primary-foreground">{lang === "ar" ? "تحقق وأكّد" : "Verify & confirm"}</Button>
            <Button onClick={() => reviewBitcoinDeposit(d.id, false, Number(d.amount_claimed))} className="rounded-lg border border-negative px-3 py-1.5 text-sm font-semibold text-negative">{t("reject")}</Button>
          </div>}
        </div>)}
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
                <Button onClick={() => review(p.id, true)} className="rounded-lg bg-positive px-3 py-1.5 text-sm font-semibold text-primary-foreground">{t("approve")}</Button>
                <Button onClick={() => review(p.id, false)} className="rounded-lg border border-negative px-3 py-1.5 text-sm font-semibold text-negative">{t("reject")}</Button>
              </div>
            ) : <StatusBadge s={p.status} />}
          </div>
        ))}
      </div>
    </div>
  );
}
