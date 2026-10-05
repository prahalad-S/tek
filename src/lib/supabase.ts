import { createClient } from "@supabase/supabase-js";
const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function client() {
  if (!supabase)
    throw new Error("Connect your Supabase project to use the live workspace.");
  return supabase;
}
export const previewEnabled =
  Boolean(import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_PREVIEW === "true");
