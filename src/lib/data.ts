import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const stocksQ = queryOptions({
  queryKey: ["stocks"],
  queryFn: async () => {
    const { data, error } = await supabase.from("stocks").select("*").order("symbol");
    if (error) throw error;
    return data;
  },
});

export const propertiesQ = queryOptions({
  queryKey: ["properties"],
  queryFn: async () => {
    const { data, error } = await supabase.from("properties").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const investmentsQ = queryOptions({
  queryKey: ["investments"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("investments")
      .select("*, stocks(*), properties(*)")
      .eq("user_id", u.user!.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const paymentsQ = queryOptions({
  queryKey: ["payments"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("payments")
      .select("*, investments(asset_type, stocks(symbol), properties(title_en, title_ar))")
      .eq("user_id", u.user!.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

type Inv = Awaited<ReturnType<NonNullable<typeof investmentsQ.queryFn>>>[number];

export function annualRate(i: Inv) {
  if (i.asset_type === "property") return Number(i.properties?.annual_yield ?? 0) / 100;
  return Number(i.stocks?.dividend_yield ?? 0) / 100;
}

export function assetName(i: { asset_type: string; stocks?: { symbol: string; name_en?: string; name_ar?: string } | null; properties?: { title_en: string; title_ar: string } | null }, lang: string) {
  if (i.asset_type === "stock") return i.stocks?.symbol ?? "";
  return lang === "ar" ? i.properties?.title_ar ?? "" : i.properties?.title_en ?? "";
}
