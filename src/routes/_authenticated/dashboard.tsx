import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { annualRate, investmentsQ, propertiesQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — INVESTERRA" }, { name: "description", content: "Your investment overview." }, { property: "og:title", content: "Dashboard — INVESTERRA" }, { property: "og:description", content: "Your investment overview." }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(investmentsQ), context.queryClient.ensureQueryData(propertiesQ)]),
  component: Dashboard,
});

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" | "pos" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`num mt-2 text-start text-2xl font-bold ${tone === "gold" ? "text-gradient-gold" : tone === "pos" ? "text-positive" : ""}`}>{value}</p>
    </div>
  );
}

function Dashboard() {
  const { t, lang } = useI18n();
  const { data: inv } = useSuspenseQuery(investmentsQ);
  const { data: props } = useSuspenseQuery(propertiesQ);
  const active = inv.filter((i) => i.status === "active");
  const total = active.reduce((s, i) => s + Number(i.amount), 0);
  const annual = active.reduce((s, i) => s + Number(i.amount) * annualRate(i), 0);
  const pending = inv.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.amount), 0);
  const stocks = active.filter((i) => i.asset_type === "stock").reduce((s, i) => s + Number(i.amount), 0);
  const pie = [
    { name: t("stocks"), value: stocks },
    { name: t("properties"), value: total - stocks },
  ];

  return (
    <div>
      <PageTitle title={t("welcome")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("totalValue")} value={fmtUsd(total, lang)} tone="gold" />
        <Stat label={t("monthlyIncome")} value={fmtUsd(annual / 12, lang)} tone="pos" />
        <Stat label={t("annualIncome")} value={fmtUsd(annual, lang)} />
        <Stat label={t("pending")} value={fmtUsd(pending, lang)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("allocation")}</h2>
          {total > 0 ? (
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pie} dataKey="value" innerRadius={55} outerRadius={85} stroke="none">
                    <Cell fill="var(--chart-3)" /><Cell fill="var(--chart-1)" />
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("empty")}
              <div className="mt-4"><Link to="/properties" className="rounded-lg bg-gradient-gold px-4 py-2 font-semibold text-primary-foreground">{t("explore")}</Link></div>
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t("properties")}</h2><Link to="/properties" className="text-sm text-primary">→</Link></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {props.slice(0, 2).map((p) => (
              <Link key={p.id} to="/invest" search={{ type: "property", id: p.id }} className="group overflow-hidden rounded-2xl border border-border bg-card">
                <img src={p.image_url} alt="" loading="lazy" className="h-36 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="p-4">
                  <p className="font-semibold">{lang === "ar" ? p.title_ar : p.title_en}</p>
                  <p className="text-sm text-positive">{p.annual_yield}% {t("yield")}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">{t("disclaimer")}</p>
    </div>
  );
}
