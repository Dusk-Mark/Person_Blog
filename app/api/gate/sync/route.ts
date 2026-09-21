import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function gateSignature(method: string, path: string, query: string, body: string, secret: string, timestamp: string) {
  const hashed = crypto.createHash("sha512").update(body).digest("hex");
  const message = `${method}\n${path}\n${query}\n${hashed}\n${timestamp}`;
  return crypto.createHmac("sha512", secret).update(message).digest("hex");
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const gateKey = process.env.GATE_API_KEY;
  const gateSecret = process.env.GATE_API_SECRET;
  if (!url || !anon) return Response.json({ error: "Supabase 环境变量未配置。" }, { status: 503 });
  if (!gateKey || !gateSecret) return Response.json({ error: "Gate API 环境变量未配置。" }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "需要管理员登录。" }, { status: 401 });
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "登录已过期，请重新登录。" }, { status: 401 });
  const { data: admin, error: adminError } = await db.from("blog_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (adminError || !admin) return Response.json({ error: "没有管理员权限。" }, { status: 403 });
  const settle = (process.env.GATE_SETTLE || "usdt").toLowerCase();
  const path = `/api/v4/futures/${settle}/positions`;
  const query = "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = gateSignature("GET", path, query, "", gateSecret, timestamp);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let gateResponse: Response;
  try {
    gateResponse = await fetch(`https://api.gateio.ws${path}`, { headers: { Accept: "application/json", KEY: gateKey, Timestamp: timestamp, SIGN: signature }, cache: "no-store", signal: controller.signal });
  } catch { return Response.json({ error: "Gate 合约接口超时，请检查 Vercel 出口网络、API IP 白名单和合约权限。" }, { status: 504 }); }
  finally { clearTimeout(timeout); }
  const payload = await gateResponse.json() as unknown;
  if (!gateResponse.ok || !Array.isArray(payload)) return Response.json({ error: "Gate API 请求失败，请检查只读权限、IP 白名单和密钥。", detail: payload }, { status: 502 });
  const accounts = payload.filter((item): item is { contract: string; size: string; mark_price: string } => Boolean(item && typeof item === "object" && "contract" in item && "size" in item && "mark_price" in item)).map(item => ({ asset: item.contract.split("_")[0].toUpperCase(), amount: Math.abs(Number(item.size)), price: Number(item.mark_price) })).filter(item => Number.isFinite(item.amount) && item.amount > 0);
  const syncedAt = new Date().toISOString();
  const rows = accounts.map(item => ({ owner_id: userData.user.id, source: "gate", account: `futures_${settle}`, asset: item.asset, amount: item.amount, price_usd: item.price, is_public: true, synced_at: syncedAt }));
  const { error: clearError } = await db.from("portfolio_holdings").delete().eq("owner_id", userData.user.id).eq("source", "gate");
  if (clearError) return Response.json({ error: "旧 Gate 持仓清理失败，请确认已执行最新 data.sql。", detail: clearError.message }, { status: 500 });
  const { error: saveError } = await db.from("portfolio_holdings").upsert(rows, { onConflict: "owner_id,source,account,asset" });
  if (saveError) return Response.json({ error: "持仓写入失败，请确认已执行最新 data.sql。", detail: saveError.message }, { status: 500 });
  return Response.json({ count: rows.length, syncedAt: new Date().toISOString() });
}
