import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { annualRate, assetName, investmentsQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle, StatusBadge } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — INVESTERRA" }, { name: "description", content: "Your holdings and monthly income per investment." }, { property: "og:title", content: "Portfolio — INVESTERRA" }, { property: "og:description", content: "Your holdings." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(investmentsQ),
  component: Portfolio,
});

function Portfolio() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(investmentsQ);
  return (
    <div>
      <PageTitle title={t("portfolio")} />
      {data.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : (
        <div className="space-y-3">
          {data.map((i) => {
            const annual = Number(i.amount) * annualRate(i);
            return (
              <div key={i.id} className="grid grid-cols-2 items-center gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-5">
                <div className="col-span-2 md:col-span-2">
                  <p className="font-semibold">{assetName(i, lang)}</p>
                  <p className="text-xs text-muted-foreground">{i.asset_type === "stock" ? t("stocks") : t("properties")}</p>
                </div>
                <div><p className="text-xs text-muted-foreground">{t("totalValue")}</p><p className="num text-start font-semibold">{fmtUsd(Number(i.amount), lang)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("monthlyIncome")}</p><p className="num text-start font-semibold text-positive">{fmtUsd(annual / 12, lang)}</p></div>
                <div className="md:text-end"><StatusBadge s={i.status} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
