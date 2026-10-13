import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { propertiesQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle } from "@/components/AppShell";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({ meta: [{ title: "Properties — INVESTERRA" }, { name: "description", content: "Fractional premium real estate in the UAE." }, { property: "og:title", content: "Properties — INVESTERRA" }, { property: "og:description", content: "Fractional premium real estate." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(propertiesQ),
  component: Properties,
});

function Properties() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(propertiesQ);
  return (
    <div>
      <PageTitle title={t("properties")} />
      <div className="grid gap-6 sm:grid-cols-2">
        {data.map((p) => {
          const pct = Math.min(100, (Number(p.funded) / Number(p.total_value)) * 100);
          return (
            <div key={p.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              <div className="relative h-52 overflow-hidden">
                <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <span className="absolute top-3 start-3 rounded-full bg-background/80 px-3 py-1 text-xs backdrop-blur">{p.property_type}</span>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-semibold">{lang === "ar" ? p.title_ar : p.title_en}</h3>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{lang === "ar" ? p.city_ar : p.city_en}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-muted-foreground">{t("yield")}</p><p className="num text-start font-semibold text-positive">{p.annual_yield}%</p></div>
                  <div><p className="text-muted-foreground">{t("minInvest")}</p><p className="num text-start font-semibold">{fmtUsd(Number(p.min_investment), lang)}</p></div>
                  <div><p className="text-muted-foreground">{t("funded")}</p><p className="num text-start font-semibold">{pct.toFixed(0)}%</p></div>
                </div>
                <Progress value={pct} className="mt-3 h-1.5" />
                <Link to="/invest" search={{ type: "property", id: p.id }} className="mt-5 block rounded-xl bg-gradient-gold py-2.5 text-center font-semibold text-primary-foreground">{t("invest")}</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
