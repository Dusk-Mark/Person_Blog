import { createClient } from "@supabase/supabase-js";

export function createBrowserDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("请配置 Supabase 环境变量后重启应用。");
  return createClient(url, key);
}
