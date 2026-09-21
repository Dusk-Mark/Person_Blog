export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const settle = (process.env.GATE_SETTLE || "usdt").toLowerCase();
  const requested = new URL(request.url).searchParams.get("symbols")?.split(",").map(value => value.trim().toUpperCase()).filter(value => /^[A-Z0-9]{2,20}$/.test(value)).slice(0, 20) || [];
  const contracts = (requested.length ? requested : ["BTC", "ETH"]).map(asset => `${asset}_USDT`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://api.gateio.ws/api/v4/futures/${settle}/tickers?contract=${contracts.join("&contract=")}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    const payload = await response.json() as unknown;
    if (!response.ok || !Array.isArray(payload)) return Response.json({ error: "Gate 行情暂时不可用。" }, { status: 502 });
    return Response.json(payload.filter((item): item is { contract: string; last: string; change_percentage: string; funding_rate: string } => Boolean(item && typeof item === "object" && "contract" in item && "last" in item)).map(item => ({ contract: item.contract, last: Number(item.last), changePercentage: Number(item.change_percentage), fundingRate: Number(item.funding_rate || 0), updatedAt: new Date().toISOString() })));
  } catch { return Response.json({ error: "Gate 行情请求超时。" }, { status: 504 }); }
  finally { clearTimeout(timeout); }
}
