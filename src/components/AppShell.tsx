import { Link, Outlet, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Home, LineChart, LogOut, Receipt, Shield, User, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type Key } from "@/lib/i18n";
import { Logo } from "@/routes/index";
import { LangToggle } from "./LangToggle";

const nav: { to: string; key: Key; icon: typeof Home }[] = [
  { to: "/dashboard", key: "home", icon: Home },
  { to: "/stocks", key: "stocks", icon: LineChart },
  { to: "/properties", key: "properties", icon: Building2 },
  { to: "/portfolio", key: "portfolio", icon: Wallet },
  { to: "/transactions", key: "transactions", icon: Receipt },
  { to: "/profile", key: "profile", icon: User },
];

export function AppShell() {
  const { t } = useI18n();
  const { isAdmin } = useRouteContext({ from: "/_authenticated" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const items = isAdmin ? [...nav, { to: "/admin", key: "admin" as Key, icon: Shield }] : nav;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-border bg-surface p-5 md:flex">
        <Logo />
        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <Link key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              activeProps={{ className: "bg-card !text-primary" }}>
              <n.icon className="h-5 w-5" />{t(n.key)}
            </Link>
          ))}
        </nav>
        <LangToggle />
        <button onClick={signOut} className="mt-3 flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-negative">
          <LogOut className="h-4 w-4" />{t("signOut")}
        </button>
      </aside>
      <div className="flex-1 pb-24 md:pb-0">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 md:hidden">
          <Logo />
          <div className="flex gap-2"><LangToggle /><button onClick={signOut} aria-label={t("signOut")} className="rounded-lg border border-border p-2"><LogOut className="h-4 w-4" /></button></div>
        </header>
        <main className="mx-auto max-w-6xl p-5 md:p-10"><Outlet /></main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-surface/95 py-2 backdrop-blur md:hidden">
        {[nav[0], nav[1], nav[2], nav[3], isAdmin ? items[items.length - 1] : nav[5]].map((n) => (
          <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 px-2 text-[11px] text-muted-foreground" activeProps={{ className: "!text-primary" }}>
            <n.icon className="h-5 w-5" />{t(n.key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
      {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const { t } = useI18n();
  const cls = s === "active" || s === "confirmed" ? "bg-positive/15 text-positive" : s === "rejected" ? "bg-negative/15 text-negative" : "bg-primary/15 text-primary";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{t(s as Key)}</span>;
}
