import { createClient } from "@supabase/supabase-js";

/**
 * 创建浏览器端 Supabase 客户端。
 * 只使用公开的 publishable key，真正的权限由数据库行级安全策略决定；
 * 环境变量缺失时返回 null，由调用方决定如何降级提示。
 */
export function createBrowserDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
