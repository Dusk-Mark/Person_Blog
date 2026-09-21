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
  const path = "/api/v4/spot/accounts";
  const query = "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = gateSignature("GET", path, query, "", gateSecret, timestamp);
  const gateResponse = await fetch(`https://api.gateio.ws${path}`, { headers: { Accept: "application/json", KEY: gateKey, Timestamp: timestamp, SIGN: signature }, cache: "no-store" });
  const payload = await gateResponse.json() as unknown;
  if (!gateResponse.ok || !Array.isArray(payload)) return Response.json({ error: "Gate API 请求失败，请检查只读权限、IP 白名单和密钥。", detail: payload }, { status: 502 });
  const rows = payload.filter((item): item is { currency: string; available: string; locked: string } => Boolean(item && typeof item === "object" && "currency" in item && "available" in item && "locked" in item)).map(item => ({
    owner_id: userData.user.id, source: "gate", account: "spot", asset: item.currency.toUpperCase(), amount: Number(item.available) + Number(item.locked), is_public: true, synced_at: new Date().toISOString(),
  })).filter(item => Number.isFinite(item.amount) && item.amount > 0);
  const { error: saveError } = await db.from("portfolio_holdings").upsert(rows, { onConflict: "owner_id,source,account,asset" });
  if (saveError) return Response.json({ error: "持仓写入失败，请确认已执行最新 data.sql。", detail: saveError.message }, { status: 500 });
  return Response.json({ count: rows.length, syncedAt: new Date().toISOString() });
}
