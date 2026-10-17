import { supabase } from '@/integrations/supabase/client';

export const cryptoStatusQ = {
  queryKey: ['crypto-operation-status'],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('crypto_operation_status');
    if (error) throw error;
    const value = data as { operating_mode: string; deposits_enabled: boolean; withdrawals_enabled: boolean };
    return value;
  },
};
export const cryptoBalancesQ = {
  queryKey: ['crypto-balances'],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('my_crypto_balances');
    if (error) throw error;
    return data as Record<string, string>;
  },
};
