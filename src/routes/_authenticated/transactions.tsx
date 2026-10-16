
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assetName, paymentsQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle, StatusBadge } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Al Rayyan Real Estate Investment" },
      { name: "description", content: "Payment history and withdrawal requests." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(paymentsQ),
  component: Tx,
});

const withdrawalsQ = {
  queryKey: ["withdrawal-requests"],
  queryFn: async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error("Please sign in again.");

    const { data, error } = await supabase
      .from("withdrawal_requests")
      .select("id, amount, currency, network, destination_address, status, admin_note, transaction_hash, created_at, reviewed_at, paid_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  },
};


const depositAddressQ = {
  queryKey: ["my-deposit-address"],
  queryFn: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("Please sign in again.");
    const { data, error } = await supabase.from("deposit_addresses").select("address, network, currency").eq("user_id", userData.user.id).eq("active", true).maybeSingle();
    if (error) throw error;
    return data;
  },
};
const depositsQ = {
  queryKey: ["my-deposit-requests"],
  queryFn: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("Please sign in again.");
    const { data, error } = await supabase.from("deposit_requests").select("id, amount_claimed, amount_confirmed, deposit_address, tx_hash, status, admin_note, created_at").eq("user_id", userData.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};


const walletLedgerQ = {
  queryKey: ["my-wallet-ledger"],
  queryFn: async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error("Please sign in again.");
    const { data, error } = await supabase.from("wallet_ledger").select("id, amount, currency, entry_type, note, created_at").eq("user_id", userData.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};

function Tx() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(paymentsQ);
  const qc = useQueryClient();
  const { data: withdrawals, isLoading, error: withdrawalsError } = useQuery(withdrawalsQ);
  const { data: depositAddress, error: depositAddressError } = useQuery(depositAddressQ);
  const { data: deposits, error: depositsError } = useQuery(depositsQ);
  const { data: ledger, error: ledgerError } = useQuery(walletLedgerQ);
  const walletBalance = (ledger ?? []).reduce((sum, entry) => sum + Number(entry.amount), 0);
  const [depositAmount, setDepositAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitWithdrawal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const value = Number(amount);
    const wallet = address.trim();

    if (!Number.isFinite(value) || value <= 0) {
      toast.error(lang === "ar" ? "أدخل مبلغاً صحيحاً." : "Enter a valid amount.");
      return;
    }

    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet)) {
      toast.error(lang === "ar" ? "تحقق من عنوان محفظة TRC20." : "Enter a valid TRC20 address.");
      return;
    }

    setBusy(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error(lang === "ar" ? "يرجى تسجيل الدخول مجدداً." : "Please sign in again.");

      const { error } = await supabase.from("withdrawal_requests").insert({
        user_id: authData.user.id,
        amount: value,
        currency: "USDT",
        network: "TRC20",
        destination_address: wallet,
        status: "pending",
      });

      if (error) throw error;

      toast.success(lang === "ar" ? "تم إرسال طلب السحب للمراجعة." : "Withdrawal request submitted for review.");
      setAmount("");
      setAddress("");
      await qc.invalidateQueries({ queryKey: ["withdrawal-requests"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (lang === "ar" ? "تعذر إرسال الطلب." : "Could not submit request."));
    } finally {
      setBusy(false);
    }
  }


  async function submitDeposit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = Number(depositAmount);
    const hash = txHash.trim();
    if (!Number.isFinite(value) || value <= 0 || !/^([0-9a-fA-F]{64})$/.test(hash)) {
      toast.error(lang === "ar" ? "أدخل مبلغاً صحيحاً وبصمة تحويل من 64 خانة." : "Enter a valid amount and a 64-character transaction hash."); return;
    }
    if (!depositAddress?.address) { toast.error(lang === "ar" ? "لا يوجد عنوان إيداع مخصص لحسابك بعد." : "No deposit address is assigned to your account yet."); return; }
    setDepositBusy(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) throw new Error(lang === "ar" ? "يرجى تسجيل الدخول مجدداً." : "Please sign in again.");
      const { error } = await supabase.from("deposit_requests").insert({ user_id: userData.user.id, amount_claimed: value, deposit_address: depositAddress.address, network: "TRC20", currency: "USDT", tx_hash: hash, status: "pending_verification" });
      if (error) throw error;
      toast.success(lang === "ar" ? "تم إرسال التحويل للتحقق. لن يُضاف أي رصيد قبل التحقق." : "Submitted for verification. No balance is credited before verification.");
      setDepositAmount(""); setTxHash(""); await qc.invalidateQueries({ queryKey: ["my-deposit-requests"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : (lang === "ar" ? "تعذر إرسال الطلب." : "Could not submit request.")); }
    finally { setDepositBusy(false); }
  }

  const statusLabel: Record<string, string> = {
    pending: lang === "ar" ? "قيد المراجعة" : "Pending review",
    approved: lang === "ar" ? "تمت الموافقة" : "Approved",
    rejected: lang === "ar" ? "مرفوض" : "Rejected",
    paid: lang === "ar" ? "تم الدفع" : "Paid",
    cancelled: lang === "ar" ? "ملغي" : "Cancelled",
  };

  return (
    <div className="space-y-8">
      <PageTitle title={t("transactions")} />
      <section className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{lang === "ar" ? "رصيد المحفظة المؤكد" : "Confirmed wallet balance"}</p><p className="mt-1 text-2xl font-bold">{walletBalance.toLocaleString(undefined, { maximumFractionDigits: 8 })} USDT</p>{ledgerError && <p className="mt-2 text-sm text-destructive">{lang === "ar" ? "تعذر تحميل الرصيد." : "Could not load balance."}</p>}<p className="mt-2 text-xs text-muted-foreground">{lang === "ar" ? "يعكس هذا الرصيد قيود دفتر الحساب فقط؛ لا يعني وجود أموال متاحة للسحب في المحفظة الخارجية." : "This is the internal ledger balance only; it does not guarantee funds are available in the external wallet."}</p></section>


      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">{lang === "ar" ? "إيداع USDT عبر TRC20" : "Deposit USDT via TRC20"}</h2>
        <p className="text-sm text-muted-foreground">{lang === "ar" ? "أرسل فقط إلى العنوان المخصص أدناه. أرسل بصمة المعاملة بعد التحويل؛ الطلب يبقى قيد التحقق ولا يُضاف رصيد تلقائياً." : "Send only to your assigned address. Submit the transaction hash after transfer; deposits remain pending and no balance is credited automatically."}</p>
        {depositAddressError && <p className="text-sm text-destructive">{lang === "ar" ? "تعذر تحميل عنوان الإيداع. تحقق من إعداد قاعدة البيانات." : "Could not load deposit address. Check database setup."}</p>}
        {depositAddress?.address ? <div className="rounded-xl border border-border p-3"><p className="mb-1 text-xs text-muted-foreground">{lang === "ar" ? "عنوانك المخصص" : "Your assigned address"}</p><p className="break-all font-mono text-sm">{depositAddress.address}</p><button type="button" className="mt-2 rounded-lg border border-border px-3 py-1 text-sm" onClick={() => { void navigator.clipboard?.writeText(depositAddress.address); toast.success(lang === "ar" ? "تم نسخ العنوان" : "Address copied"); }}>{lang === "ar" ? "نسخ العنوان" : "Copy address"}</button></div> : <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">{lang === "ar" ? "لم يتم تخصيص عنوان إيداع لهذا الحساب بعد. لا ترسل الأموال إلى عنوان غير مؤكد." : "No deposit address has been assigned to this account yet. Do not send funds to an unverified address."}</p>}
        <form onSubmit={submitDeposit} className="space-y-3"><div className="space-y-1.5"><Label>{lang === "ar" ? "المبلغ المحوّل (USDT)" : "Amount sent (USDT)"}</Label><Input type="number" min="0.000001" step="0.000001" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} required /></div><div className="space-y-1.5"><Label>{lang === "ar" ? "بصمة المعاملة (TXID)" : "Transaction hash (TXID)"}</Label><Input value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="64-character transaction hash" autoComplete="off" spellCheck={false} required /></div><button type="submit" disabled={depositBusy || !depositAddress?.address} className="w-full rounded-xl bg-gradient-gold py-3 font-semibold text-primary-foreground disabled:opacity-60">{depositBusy ? (lang === "ar" ? "جارٍ الإرسال..." : "Submitting...") : (lang === "ar" ? "إرسال للتحقق" : "Submit for verification")}</button></form>
        <div className="space-y-2"><h3 className="font-semibold">{lang === "ar" ? "سجل الإيداعات" : "Deposit history"}</h3>{depositsError && <p className="text-sm text-destructive">{lang === "ar" ? "تعذر تحميل سجل الإيداعات." : "Could not load deposits."}</p>}{deposits?.map(d => <div key={d.id} className="space-y-1 rounded-xl border border-border p-3"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{Number(d.amount_confirmed ?? d.amount_claimed)} USDT</span><StatusBadge s={d.status} /></div>{d.tx_hash && <a className="break-all text-xs underline" href={`https://tronscan.org/#/transaction/${d.tx_hash}`} target="_blank" rel="noreferrer">{lang === "ar" ? "عرض المعاملة على TronScan" : "View on TronScan"}</a>}{d.admin_note && <p className="text-sm text-muted-foreground">{d.admin_note}</p>}</div>)}</div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">
          {lang === "ar" ? "طلب سحب USDT" : "Request a USDT withdrawal"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {lang === "ar"
            ? "الشبكة: TRC20. إرسال الطلب لا يعني الموافقة عليه أو تحويل الأموال. يجب التحقق من الرصيد قبل تنفيذ أي سحب."
            : "Network: TRC20. Submitting a request does not approve or transfer funds. Available balance must be verified before any withdrawal."}
        </p>

        <form onSubmit={submitWithdrawal} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{lang === "ar" ? "المبلغ (USDT)" : "Amount (USDT)"}</Label>
            <Input
              type="number"
              min="0.000001"
              step="0.000001"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>{lang === "ar" ? "عنوان محفظة الاستلام (TRC20)" : "Receiving wallet address (TRC20)"}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="T..."
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-gold py-3 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? (lang === "ar" ? "جارٍ الإرسال..." : "Submitting...")
              : (lang === "ar" ? "إرسال طلب السحب" : "Submit withdrawal request")}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          {lang === "ar" ? "طلبات السحب السابقة" : "Withdrawal history"}
        </h2>

        {isLoading && <p className="text-sm text-muted-foreground">{lang === "ar" ? "جارٍ التحميل..." : "Loading..."}</p>}

        {withdrawalsError && (
          <p className="text-sm text-destructive">
            {lang === "ar"
              ? "تعذر تحميل الطلبات. تأكد من تطبيق ترحيل قاعدة البيانات."
              : "Could not load requests. Check that the database migration has been applied."}
          </p>
        )}

        {withdrawals?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {lang === "ar" ? "لا توجد طلبات سحب حتى الآن." : "No withdrawal requests yet."}
          </p>
        )}

        {withdrawals?.map((w) => (
          <div key={w.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="num font-semibold">{fmtUsd(Number(w.amount), lang)} USDT</p>
              <span className="rounded-full border border-border px-3 py-1 text-sm">
                {statusLabel[w.status] ?? w.status}
              </span>
            </div>
            <p className="break-all text-xs text-muted-foreground">
              {lang === "ar" ? "عنوان الاستلام: " : "Destination: "}{w.destination_address}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(w.created_at).toLocaleString()} · TRC20
            </p>
            {w.admin_note && <p className="text-sm text-muted-foreground">{w.admin_note}</p>}
            {w.transaction_hash && (
              <p className="break-all text-xs text-muted-foreground">
                {lang === "ar" ? "رقم التحويل: " : "Transaction hash: "}{w.transaction_hash}
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{lang === "ar" ? "سجل المعاملات" : "Transaction history"}</h2>
        {data.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-3">
            {data.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex-1">
                  <p className="font-semibold">{p.investments ? assetName(p.investments, lang) : "—"}</p>
                  <p className="num text-start text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString()} · {p.currency} · {p.tx_hash.slice(0, 14)}…
                  </p>
                  {p.admin_note && <p className="mt-1 text-xs text-muted-foreground">{p.admin_note}</p>}
                </div>
                <p className="num font-semibold">{fmtUsd(Number(p.amount_usd), lang)}</p>
                <StatusBadge s={p.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
    }
