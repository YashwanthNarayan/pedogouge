import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ?? "https://placeholder.supabase.co";
const SUPABASE_ANON_KEY =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? "placeholder-anon-key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
