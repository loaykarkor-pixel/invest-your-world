import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { propertiesQ, stocksQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { WALLETS, fmtUsd } from "@/lib/config";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/invest")({
  validateSearch: (s: Record<string, unknown>) => ({ type: s.type === "stock" ? "stock" : "property", id: String(s.id ?? "") }) as { type: "stock" | "property"; id: string },
  head: () => ({ meta: [{ title: "Invest — INVESTERRA" }, { name: "description", content: "Fund an investment with USDT or Bitcoin." }, { property: "og:title", content: "Invest — INVESTERRA" }, { property: "og:description", content: "Fund an investment." }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(stocksQ), context.queryClient.ensureQueryData(propertiesQ)]),
  component: Invest,
});

function Invest() {
  const { t, lang } = useI18n();
  const { type, id } = Route.useSearch();
  const { data: stocks } = useSuspenseQuery(stocksQ);
  const { data: props } = useSuspenseQuery(propertiesQ);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const stock = type === "stock" ? stocks.find((s) => s.id === id) : undefined;
  const prop = type === "property" ? props.find((p) => p.id === id) : undefined;
  const min = prop ? Number(prop.min_investment) : 100;
  const rate = prop ? Number(prop.annual_yield) : Number(stock?.dividend_yield ?? 0);
  const [amount, setAmount] = useState(min * 2);
  const [cur, setCur] = useState<"USDT" | "BTC">("USDT");
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);

  if (!stock && !prop) return <p className="text-muted-foreground">{t("empty")}</p>;
  const name = stock ? (lang === "ar" ? stock.name_ar : stock.name_en) : lang === "ar" ? prop!.title_ar : prop!.title_en;
  const w = WALLETS[cur];

  async function submit() {
    if (amount < min) return toast.error(`${t("minInvest")}: ${fmtUsd(min, lang)}`);
    if (tx.trim().length < 10) return toast.error(t("txHash"));
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: inv, error } = await supabase.from("investments").insert({
      user_id: u.user!.id, asset_type: type, stock_id: stock?.id ?? null, property_id: prop?.id ?? null,
      amount, units: stock ? amount / Number(stock.price) : 0,
    }).select().single();
    if (error) { setBusy(false); return toast.error(error.message); }
    const { error: e2 } = await supabase.from("payments").insert({
      user_id: u.user!.id, investment_id: inv.id, currency: cur, network: w.network, amount_usd: amount, tx_hash: tx.trim(),
    });
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success(t("submitted"));
    qc.invalidateQueries();
    navigate({ to: "/transactions" });
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title={`${t("invest")} · ${name}`} sub={`${rate}% ${stock ? t("dividend") : t("yield")}`} />
      <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="space-y-1.5">
          <Label>{t("amount")}</Label>
          <Input type="number" min={min} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <p className="text-sm text-positive">{t("monthlyIncome")}: <span className="num">{fmtUsd((amount * rate) / 100 / 12, lang)}</span></p>
        </div>
        <div>
          <Label>{t("payWith")}</Label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["USDT", "BTC"] as const).map((c) => (
              <button key={c} onClick={() => setCur(c)} className={`rounded-xl border p-3 font-semibold transition-colors ${cur === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="text-muted-foreground">{t("sendTo")}</p>
          <p className="num mt-1 text-start text-xl font-bold text-gradient-gold">{fmtUsd(amount, lang)} {cur === "USDT" ? "USDT" : "in BTC"}</p>
          <p className="mt-3 text-muted-foreground">{t("network")}: {w.network}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="num flex-1 break-all rounded bg-background p-2 text-xs">{w.address}</code>
            <button onClick={() => { navigator.clipboard.writeText(w.address); toast.success(t("copy")); }} className="rounded-lg border border-border p-2"><Copy className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("txHash")}</Label>
          <Input value={tx} onChange={(e) => setTx(e.target.value)} className="num" />
        </div>
        <button disabled={busy} onClick={submit} className="w-full rounded-xl bg-gradient-gold py-3 font-semibold text-primary-foreground shadow-gold disabled:opacity-60">{t("submit")}</button>
        <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </div>
  );
}
