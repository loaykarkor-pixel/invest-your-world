import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { stocksQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/stocks")({
  head: () => ({ meta: [{ title: "Stocks — INVESTERRA" }, { name: "description", content: "Global and UAE stocks with dividend yields." }, { property: "og:title", content: "Stocks — INVESTERRA" }, { property: "og:description", content: "Global and UAE stocks." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(stocksQ),
  component: Stocks,
});

function Stocks() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(stocksQ);
  const [amt, setAmt] = useState(10000);
  const [sel, setSel] = useState(data[0]?.id);
  const s = data.find((x) => x.id === sel);
  const annual = s ? (amt * Number(s.dividend_yield)) / 100 : 0;

  return (
    <div>
      <PageTitle title={t("stocks")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {data.map((st) => {
            const up = Number(st.change_pct) >= 0;
            return (
              <div key={st.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-xs font-bold text-primary">{st.symbol.slice(0, 4)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{lang === "ar" ? st.name_ar : st.name_en}</p>
                  <p className="text-xs text-muted-foreground">{st.symbol} · {st.exchange} · {t("dividend")} {st.dividend_yield}%</p>
                </div>
                <div className="text-end">
                  <p className="num font-semibold">{fmtUsd(Number(st.price), lang)}</p>
                  <p className={`num text-sm ${up ? "text-positive" : "text-negative"}`}>{up ? "+" : ""}{st.change_pct}%</p>
                </div>
                <Link to="/invest" search={{ type: "stock", id: st.id }} className="rounded-lg bg-gradient-gold px-4 py-2 text-sm font-semibold text-primary-foreground">{t("invest")}</Link>
              </div>
            );
          })}
        </div>
        <div className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-10">
          <h2 className="font-semibold">{t("calc")}</h2>
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="mt-4 w-full rounded-lg border border-input bg-surface p-2.5">
            {data.map((x) => <option key={x.id} value={x.id}>{x.symbol}</option>)}
          </select>
          <Input type="number" className="mt-3" value={amt} onChange={(e) => setAmt(Number(e.target.value))} />
          <div className="mt-5 space-y-2 text-sm">
            <Row k={t("monthly")} v={fmtUsd(annual / 12, lang)} />
            <Row k={t("annualIncome")} v={fmtUsd(annual, lang)} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="num font-semibold text-positive">{v}</span></div>;
}
