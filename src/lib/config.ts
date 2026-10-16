export const APP_NAME = "الريان للاستثمار العقاري";

// Receiving wallets shown to investors. Replace with the company's real addresses.
export const WALLETS = {
  USDT: { network: "TRC20 (Tron)", address: "" },
  BTC: { network: "Bitcoin", address: "" },
} as const;

export const fmtUsd = (n: number, lang: string) =>
  new Intl.NumberFormat(lang === "ar" ? "en-US" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
