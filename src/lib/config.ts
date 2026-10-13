export const APP_NAME = "INVESTERRA";

// Receiving wallets shown to investors. Replace with the company's real addresses.
export const WALLETS = {
  USDT: { network: "TRC20 (Tron)", address: "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
  BTC: { network: "Bitcoin", address: "bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
} as const;

export const fmtUsd = (n: number, lang: string) =>
  new Intl.NumberFormat(lang === "ar" ? "en-US" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
