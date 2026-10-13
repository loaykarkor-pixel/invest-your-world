import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, LineChart, ShieldCheck } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { useI18n } from "@/lib/i18n";
import { APP_NAME } from "@/lib/config";
import { LangToggle } from "@/components/LangToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "INVESTERRA — Stocks & Fractional Real Estate" },
      { name: "description", content: "Invest in global stocks and fractional premium real estate. Track monthly income in one secure portfolio." },
      { property: "og:title", content: "INVESTERRA — Stocks & Fractional Real Estate" },
      { property: "og:description", content: "Global stocks and premium real estate in one secure portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const { t } = useI18n();
  return (
    <div className="relative min-h-screen overflow-hidden">
      <img src={hero} alt="" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-hero" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <Logo />
          <LangToggle />
        </header>
        <main className="flex flex-1 flex-col justify-end pb-16 md:justify-center md:pb-0">
          <h1 className="max-w-2xl text-4xl font-bold leading-tight md:text-6xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            {t("headline")}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("sub")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth" search={{ mode: "signup" }} className="rounded-xl bg-gradient-gold px-7 py-3.5 font-semibold text-primary-foreground shadow-gold transition-transform hover:scale-[1.02]">
              {t("getStarted")}
            </Link>
            <Link to="/auth" search={{ mode: "login" }} className="rounded-xl border border-border bg-card/60 px-7 py-3.5 font-semibold backdrop-blur transition-colors hover:bg-accent">
              {t("login")}
            </Link>
          </div>
          <div className="mt-12 grid max-w-2xl grid-cols-3 gap-4 text-sm text-muted-foreground">
            <Feature icon={<LineChart className="h-5 w-5" />} label={t("stocks")} />
            <Feature icon={<Building2 className="h-5 w-5" />} label={t("properties")} />
            <Feature icon={<ShieldCheck className="h-5 w-5" />} label="USDT · BTC" />
          </div>
        </main>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card/50 p-3 backdrop-blur">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-gold font-bold text-primary-foreground">I</div>
      <span className="text-lg font-bold tracking-[0.2em]">{APP_NAME}</span>
    </div>
  );
}
