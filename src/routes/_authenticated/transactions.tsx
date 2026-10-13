import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { assetName, paymentsQ } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { fmtUsd } from "@/lib/config";
import { PageTitle, StatusBadge } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — INVESTERRA" }, { name: "description", content: "Your payment and investment history." }, { property: "og:title", content: "Transactions — INVESTERRA" }, { property: "og:description", content: "Payment history." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(paymentsQ),
  component: Tx,
});

function Tx() {
  const { t, lang } = useI18n();
  const { data } = useSuspenseQuery(paymentsQ);
  return (
    <div>
      <PageTitle title={t("transactions")} />
      {data.length === 0 ? <p className="text-muted-foreground">{t("empty")}</p> : (
        <div className="space-y-3">
          {data.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex-1">
                <p className="font-semibold">{p.investments ? assetName(p.investments, lang) : "—"}</p>
                <p className="num text-start text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} · {p.currency} · {p.tx_hash.slice(0, 14)}…</p>
                {p.admin_note && <p className="mt-1 text-xs text-muted-foreground">{p.admin_note}</p>}
              </div>
              <p className="num font-semibold">{fmtUsd(Number(p.amount_usd), lang)}</p>
              <StatusBadge s={p.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
