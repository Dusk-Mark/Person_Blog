"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { createBrowserDatabase } from "@/lib/supabase";
import {
  calculateRecordMetrics,
  formatRoi,
  holdingRoi,
  roiClass,
  type Holding,
  type HoldingDirection,
  type HoldingRecord,
  type LiveMarks,
} from "@/lib/portfolio";

type HoldingForm = {
  asset: string;
  account: string;
  amount: string;
  entryPrice: string;
  leverage: string;
  direction: HoldingDirection;
  is_public: boolean;
};

function errorMessage(error: { message: string; code?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205")
    return "数据库表尚未初始化，请在 Supabase 中运行 SQL。";
  if (error.code === "42501") return "权限不足，请检查管理员授权与数据库策略。";
  return error.message;
}

export default function AdminPortfolioPage() {
  const db = useMemo(() => createBrowserDatabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<"loading" | "guest" | "admin" | "denied">("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // 持仓状态
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingMarks, setHoldingMarks] = useState<LiveMarks>({});
  const [holdingBusy, setHoldingBusy] = useState(false);
  const [holdingNotice, setHoldingNotice] = useState("");
  const [holdingForm, setHoldingForm] = useState<HoldingForm>({
    asset: "",
    account: "spot",
    amount: "",
    entryPrice: "",
    leverage: "1",
    direction: "long",
    is_public: true,
  });
  const [holdingPriceResult, setHoldingPriceResult] = useState<{
    asset: string;
    price: number | null;
  } | null>(null);

  // 历史记录状态
  const [records, setRecords] = useState<HoldingRecord[]>([]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordForm, setRecordForm] = useState({
    asset: "",
    direction: "long" as HoldingDirection,
    entryPriceUsd: "",
    exitPriceUsd: "",
    amount: "",
    leverage: "1",
    isPublic: true,
    closedAt: "",
  });

  const holdingAsset = holdingForm.asset.trim().toUpperCase();
  const holdingPrice =
    holdingPriceResult?.asset === holdingAsset
      ? holdingPriceResult.price
      : null;
  const holdingPriceState = !/^[A-Z0-9]{2,20}$/.test(holdingAsset)
    ? "idle"
    : holdingPriceResult?.asset !== holdingAsset
      ? "loading"
      : holdingPriceResult.price == null
        ? "missing"
        : "ready";

  useEffect(() => {
    if (!db) {
      setAccess("denied");
      setNotice("部署环境缺少 Supabase 配置。");
      return;
    }
    const database = db;
    let alive = true;
    async function load(next: Session | null) {
      if (!alive) return;
      setSession(next);
      setAccess("loading");
      if (!next) {
        setAccess("guest");
        return;
      }
      const membership = await database
        .from("blog_admins")
        .select("user_id")
        .eq("user_id", next.user.id)
        .maybeSingle();
      if (!alive) return;
      if (membership.error || !membership.data) {
        setAccess("denied");
        setNotice(
          membership.error
            ? errorMessage(membership.error)
            : "该账号尚未获得管理员权限。",
        );
        return;
      }
      setAccess("admin");

      const holdingResult = await database
        .from("portfolio_holdings")
        .select("*")
        .order("value_usd", { ascending: false, nullsFirst: false });
      if (!holdingResult.error) setHoldings(holdingResult.data as Holding[]);

      const recordResult = await database
        .from("portfolio_records")
        .select("*")
        .order("closed_at", { ascending: false });
      if (!recordResult.error) setRecords(recordResult.data as HoldingRecord[]);
    }

    let currentUser: string | undefined;
    const { data: listener } = database.auth.onAuthStateChange((event, next) => {
      if (event === "INITIAL_SESSION" || next?.user.id !== currentUser) {
        currentUser = next?.user.id;
        window.setTimeout(() => {
          if (alive) void load(next);
        }, 0);
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [db]);

  // 查询单个输入资产的实时行情
  useEffect(() => {
    const asset = holdingForm.asset.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,20}$/.test(asset)) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void fetch(`/api/gate/tickers?symbols=${asset}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : []))
        .then((rows: unknown) => {
          if (!alive) return;
          const price = Array.isArray(rows)
            ? (rows as { contract: string; last: number }[]).find(
                (row) => row.contract === `${asset}_USDT`,
              )?.last
            : undefined;
          setHoldingPriceResult({
            asset,
            price: typeof price === "number" && Number.isFinite(price) ? price : null,
          });
        })
        .catch(() => {
          if (alive) setHoldingPriceResult({ asset, price: null });
        });
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [holdingForm.asset]);

  // 定时刷新持仓列表中的品种实时行情 (30s)
  useEffect(() => {
    if (!holdings.length) return;
    let alive = true;
    const refresh = async () => {
      try {
        const symbols = holdings.map((item) => item.asset).join(",");
        const response = await fetch(
          `/api/gate/tickers?symbols=${encodeURIComponent(symbols)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (alive && response.ok && Array.isArray(data))
          setHoldingMarks(
            Object.fromEntries(
              data.map((item: { contract: string; last: number }) => [
                item.contract.split("_")[0],
                item.last,
              ]),
            ),
          );
      } catch {
        /* 保留上次行情 */
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [holdings]);

  // 计算收益统计 (1天/1周/3周)
  const recordStats = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;
    const threeWeeksMs = 21 * oneDayMs;

    const calcForPeriod = (ms: number) => {
      const filtered = records.filter(
        (r) => now - new Date(r.closed_at).getTime() <= ms,
      );
      const totalPnl = filtered.reduce((acc, r) => acc + (r.pnl_usd || 0), 0);
      const count = filtered.length;
      const avgRoi = count
        ? filtered.reduce((acc, r) => acc + (r.roi || 0), 0) / count
        : 0;
      return { totalPnl, count, avgRoi };
    };

    return {
      day1: calcForPeriod(oneDayMs),
      week1: calcForPeriod(oneWeekMs),
      week3: calcForPeriod(threeWeeksMs),
    };
  }, [records]);

  function updateHoldingForm<K extends keyof HoldingForm>(
    key: K,
    value: HoldingForm[K],
  ) {
    setHoldingForm((prev) => ({ ...prev, [key]: value }));
  }

  async function addHolding(event: React.FormEvent) {
    event.preventDefault();
    if (!db || !session) return;
    const asset = holdingForm.asset.trim().toUpperCase();
    const amount = Number(holdingForm.amount);
    const entryPrice = Number(holdingForm.entryPrice);
    const leverage = Number(holdingForm.leverage);

    if (!/^[A-Z0-9]{2,20}$/.test(asset) || !Number.isFinite(amount) || amount < 0) {
      setHoldingNotice("请填写合法的资产代码和数量。");
      return;
    }
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      setHoldingNotice("请填写大于 0 的入场价格。");
      return;
    }
    if (!Number.isFinite(leverage) || leverage <= 0) {
      setHoldingNotice("请填写大于 0 的杠杆倍数。");
      return;
    }
    if (holdingPrice === null) {
      setHoldingNotice(
        holdingPriceState === "loading"
          ? "正在获取实时价格，请稍候再保存。"
          : `未取到 ${asset}_USDT 的永续价格，请确认 Gate 上有该合约。`,
      );
      return;
    }

    setHoldingBusy(true);
    setHoldingNotice("");
    const { data, error } = await db
      .from("portfolio_holdings")
      .upsert(
        {
          source: "manual",
          asset,
          account: holdingForm.account || "spot",
          amount,
          price_usd: holdingPrice,
          entry_price_usd: entryPrice,
          leverage,
          direction: holdingForm.direction,
          is_public: holdingForm.is_public,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,source,account,asset" },
      )
      .select("*")
      .single();

    if (error) setHoldingNotice(errorMessage(error));
    else {
      setHoldings((prev) => [
        data as Holding,
        ...prev.filter((item) => item.id !== data.id),
      ]);
      setHoldingForm({
        asset: "",
        account: "spot",
        amount: "",
        entryPrice: "",
        leverage: "1",
        direction: "long",
        is_public: true,
      });
      setHoldingPriceResult(null);
      setHoldingNotice(`持仓已保存：${asset} 入场价 $${entryPrice}。`);
    }
    setHoldingBusy(false);
  }

  async function removeHolding(id: string) {
    if (!db || !window.confirm("删除这项持仓？")) return;
    const { error } = await db.from("portfolio_holdings").delete().eq("id", id);
    if (error) setHoldingNotice(errorMessage(error));
    else setHoldings((prev) => prev.filter((item) => item.id !== id));
  }

  async function saveRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!db || !session) return;
    const asset = recordForm.asset.trim().toUpperCase();
    const entryPrice = Number(recordForm.entryPriceUsd);
    const exitPrice = Number(recordForm.exitPriceUsd);
    const amount = Number(recordForm.amount);
    const leverage = Number(recordForm.leverage) || 1;

    if (!/^[A-Z0-9]{2,20}$/.test(asset)) {
      setHoldingNotice("请填写合法的资产代码（如 BTC, ETH）。");
      return;
    }
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(exitPrice) || exitPrice <= 0) {
      setHoldingNotice("请填写大于 0 的入场价格与平仓价格。");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setHoldingNotice("请填写大于 0 的平仓数量。");
      return;
    }

    const { roi, pnlUsd } = calculateRecordMetrics(
      entryPrice,
      exitPrice,
      amount,
      recordForm.direction,
      leverage,
    );

    setRecordBusy(true);
    setHoldingNotice("");

    const closedAt = recordForm.closedAt
      ? new Date(recordForm.closedAt).toISOString()
      : new Date().toISOString();

    if (editingRecordId) {
      const { data, error } = await db
        .from("portfolio_records")
        .update({
          asset,
          direction: recordForm.direction,
          entry_price_usd: entryPrice,
          exit_price_usd: exitPrice,
          amount,
          leverage,
          roi,
          pnl_usd: pnlUsd,
          is_public: recordForm.isPublic,
          closed_at: closedAt,
        })
        .eq("id", editingRecordId)
        .select("*")
        .single();

      if (error) setHoldingNotice(errorMessage(error));
      else {
        setRecords((prev) =>
          prev.map((item) => (item.id === editingRecordId ? (data as HoldingRecord) : item)),
        );
        resetRecordForm();
        setHoldingNotice("交易记录已修改。");
      }
    } else {
      const { data, error } = await db
        .from("portfolio_records")
        .insert({
          owner_id: session.user.id,
          asset,
          direction: recordForm.direction,
          entry_price_usd: entryPrice,
          exit_price_usd: exitPrice,
          amount,
          leverage,
          roi,
          pnl_usd: pnlUsd,
          is_public: recordForm.isPublic,
          closed_at: closedAt,
        })
        .select("*")
        .single();

      if (error) setHoldingNotice(errorMessage(error));
      else {
        setRecords((prev) => [data as HoldingRecord, ...prev]);
        resetRecordForm();
        setHoldingNotice("交易记录已成功录入！");
      }
    }
    setRecordBusy(false);
  }

  function startEditRecord(item: HoldingRecord) {
    setEditingRecordId(item.id);
    setRecordForm({
      asset: item.asset,
      direction: item.direction,
      entryPriceUsd: String(item.entry_price_usd),
      exitPriceUsd: String(item.exit_price_usd),
      amount: String(item.amount),
      leverage: String(item.leverage ?? 1),
      isPublic: item.is_public ?? true,
      closedAt: item.closed_at ? new Date(item.closed_at).toISOString().slice(0, 16) : "",
    });
  }

  function resetRecordForm() {
    setEditingRecordId(null);
    setRecordForm({
      asset: "",
      direction: "long",
      entryPriceUsd: "",
      exitPriceUsd: "",
      amount: "",
      leverage: "1",
      isPublic: true,
      closedAt: "",
    });
  }

  async function removeRecord(id: string) {
    if (!db || !window.confirm("确定删除这条交易平仓记录？")) return;
    const { error } = await db.from("portfolio_records").delete().eq("id", id);
    if (error) setHoldingNotice(errorMessage(error));
    else setRecords((prev) => prev.filter((item) => item.id !== id));
  }

  async function logout() {
    if (!db) return;
    setBusy(true);
    await db.auth.signOut({ scope: "local" });
    setBusy(false);
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link href="/admin">
          NILING_DUSK <span>/ 持仓管理控制台</span>
        </Link>
        <div>
          <Link href="/admin">返回文章管理</Link>
          <Link href="/">查看博客主页</Link>
          {session && (
            <button disabled={busy} onClick={logout}>
              退出登录
            </button>
          )}
        </div>
      </header>

      {access === "loading" ? (
        <div className="admin-login">
          <h1>正在验证访问权限…</h1>
        </div>
      ) : access !== "admin" ? (
        <section className="admin-login">
          <p className="admin-kicker">ACCESS DENIED</p>
          <h1>未获得访问权限</h1>
          <p>{notice || "请先登录管理员账号后访问此页面。"}</p>
          <Link href="/admin" className="admin-primary" style={{ display: "inline-block", marginTop: "16px", textAlign: "center" }}>
            去登录后台
          </Link>
        </section>
      ) : (
        <div style={{ maxWidth: "1200px", margin: "30px auto", padding: "0 20px" }}>
          {holdingNotice && <p className="admin-notice">{holdingNotice}</p>}

          {/* 1. 当前持仓管理 */}
          <section className="admin-portfolio">
            <div className="admin-portfolio-head">
              <div>
                <p className="admin-kicker">CURRENT HOLDINGS</p>
                <h3>当前持仓管理</h3>
              </div>
            </div>
            <p className="admin-help">
              持仓由你手动录入，需填写入场价格与杠杆倍数；实时价格由服务端从 Gate 永续合约行情接口获取。
            </p>

            <div className="admin-holding-list">
              {holdings.map((item) => {
                const roi = holdingRoi(item, holdingMarks);
                return (
                  <div className="admin-holding-row" key={item.id}>
                    <strong>{item.asset}</strong>
                    <span className={item.direction === "short" ? "position-short" : "position-long"}>
                      {item.direction === "short" ? "空" : "多"}
                    </span>
                    <span>
                      {item.source === "gate" ? "Gate" : "手动"} · {item.account}
                    </span>
                    <span>数量 {item.amount}</span>
                    <span>
                      入场 ${item.entry_price_usd ?? "—"} · {item.leverage ?? 1}x
                    </span>
                    <span className={roiClass(roi)}>
                      {formatRoi(roi) ?? "—"}
                    </span>
                    <button type="button" onClick={() => removeHolding(item.id)}>
                      删除
                    </button>
                  </div>
                );
              })}
              {!holdings.length && <p className="admin-help">暂无持仓记录。</p>}
            </div>

            <form className="admin-holding-form" onSubmit={addHolding}>
              <input
                aria-label="资产代码"
                placeholder="资产，如 ETH"
                value={holdingForm.asset}
                onChange={(e) => updateHoldingForm("asset", e.target.value)}
              />
              <input
                aria-label="账户"
                placeholder="账户，如 spot"
                value={holdingForm.account}
                onChange={(e) => updateHoldingForm("account", e.target.value)}
              />
              <input
                aria-label="数量"
                type="number"
                min="0"
                step="any"
                placeholder="数量"
                value={holdingForm.amount}
                onChange={(e) => updateHoldingForm("amount", e.target.value)}
              />
              <input
                aria-label="入场价格"
                type="number"
                min="0"
                step="any"
                required
                placeholder="入场价格 USD"
                value={holdingForm.entryPrice}
                onChange={(e) => updateHoldingForm("entryPrice", e.target.value)}
              />
              <input
                aria-label="杠杆倍数"
                type="number"
                min="0"
                step="any"
                required
                placeholder="杠杆，如 10"
                value={holdingForm.leverage}
                onChange={(e) => updateHoldingForm("leverage", e.target.value)}
              />
              <input
                aria-label="当前价格"
                readOnly
                title="Gate 永续合约实时价格"
                placeholder={
                  holdingPriceState === "loading"
                    ? "正在获取价格…"
                    : holdingPriceState === "missing"
                      ? "未找到该永续合约"
                      : "自动获取价格"
                }
                value={
                  holdingPrice == null
                    ? ""
                    : `$${holdingPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
                }
              />
              <select
                aria-label="方向"
                value={holdingForm.direction}
                onChange={(e) => updateHoldingForm("direction", e.target.value as HoldingDirection)}
              >
                <option value="long">多仓</option>
                <option value="short">空仓</option>
              </select>
              <label className="admin-public-check">
                <input
                  type="checkbox"
                  checked={holdingForm.is_public}
                  onChange={(e) => updateHoldingForm("is_public", e.target.checked)}
                />{" "}
                公开
              </label>
              <button type="submit" disabled={holdingBusy}>
                {holdingBusy ? "保存中…" : "添加持仓"}
              </button>
            </form>
          </section>

          {/* 2. 历史平仓记录与收益统计 */}
          <section className="admin-portfolio admin-records-section">
            <div className="admin-portfolio-head">
              <div>
                <p className="admin-kicker">HISTORY & STATS</p>
                <h3>平仓历史与收益统计</h3>
              </div>
            </div>
            <p className="admin-help">
              录入已平仓交易，系统将自动计算杠杆收益率 (ROI) 与实际收益额 (PnL USD)。可按 1天/1周/3周 自动汇总收益指标。
            </p>

            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="stat-label">近 1 天收益统计</div>
                <div className={`stat-value ${recordStats.day1.totalPnl >= 0 ? "up" : "down"}`}>
                  ${recordStats.day1.totalPnl >= 0 ? "+" : ""}{recordStats.day1.totalPnl.toFixed(2)}
                </div>
                <div className="stat-sub">
                  {recordStats.day1.count} 笔交易 · 均 ROI {formatRoi(recordStats.day1.avgRoi) ?? "0%"}
                </div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-label">近 1 周收益统计</div>
                <div className={`stat-value ${recordStats.week1.totalPnl >= 0 ? "up" : "down"}`}>
                  ${recordStats.week1.totalPnl >= 0 ? "+" : ""}{recordStats.week1.totalPnl.toFixed(2)}
                </div>
                <div className="stat-sub">
                  {recordStats.week1.count} 笔交易 · 均 ROI {formatRoi(recordStats.week1.avgRoi) ?? "0%"}
                </div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-label">近 3 周收益统计</div>
                <div className={`stat-value ${recordStats.week3.totalPnl >= 0 ? "up" : "down"}`}>
                  ${recordStats.week3.totalPnl >= 0 ? "+" : ""}{recordStats.week3.totalPnl.toFixed(2)}
                </div>
                <div className="stat-sub">
                  {recordStats.week3.count} 笔交易 · 均 ROI {formatRoi(recordStats.week3.avgRoi) ?? "0%"}
                </div>
              </div>
            </div>

            <div className="admin-record-list">
              {records.map((item) => (
                <div className="admin-record-row" key={item.id}>
                  <div className="record-asset">
                    <strong>{item.asset}</strong>
                    <span className={item.direction === "short" ? "position-short" : "position-long"}>
                      {item.direction === "short" ? "空" : "多"}
                    </span>
                    {item.leverage && item.leverage > 1 && (
                      <span className="record-lev">{item.leverage}x</span>
                    )}
                  </div>
                  <div className="record-prices">
                    <span>入场 ${item.entry_price_usd}</span>
                    <span>平仓 ${item.exit_price_usd}</span>
                  </div>
                  <div className="record-amount">
                    <span>数量 {item.amount}</span>
                  </div>
                  <div className="record-metrics">
                    <span className={roiClass(item.roi)}>
                      ROI: {formatRoi(item.roi) ?? "0%"}
                    </span>
                    <span className={`record-pnl ${item.pnl_usd >= 0 ? "up" : "down"}`}>
                      PnL: ${item.pnl_usd >= 0 ? "+" : ""}{item.pnl_usd.toFixed(2)}
                    </span>
                  </div>
                  <div className="record-time">
                    <span>{item.closed_at ? item.closed_at.slice(0, 16).replace("T", " ") : "—"}</span>
                    <span className="record-public">{item.is_public ? "公开" : "私密"}</span>
                  </div>
                  <div className="record-actions">
                    <button type="button" onClick={() => startEditRecord(item)}>
                      编辑
                    </button>
                    <button type="button" className="btn-del" onClick={() => removeRecord(item.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {!records.length && <p className="admin-help">暂无历史平仓记录。</p>}
            </div>

            <form className="admin-record-form" onSubmit={saveRecord}>
              <div className="form-head-title">
                {editingRecordId ? "编辑平仓记录" : "新增平仓记录"}
                {editingRecordId && (
                  <button type="button" className="btn-cancel" onClick={resetRecordForm}>
                    取消编辑
                  </button>
                )}
              </div>
              <div className="record-form-grid">
                <input
                  aria-label="资产代码"
                  placeholder="资产，如 SOL"
                  required
                  value={recordForm.asset}
                  onChange={(e) => setRecordForm({ ...recordForm, asset: e.target.value })}
                />
                <select
                  aria-label="方向"
                  value={recordForm.direction}
                  onChange={(e) =>
                    setRecordForm({ ...recordForm, direction: e.target.value as HoldingDirection })
                  }
                >
                  <option value="long">做多 (Long)</option>
                  <option value="short">做空 (Short)</option>
                </select>
                <input
                  aria-label="入场价格"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="入场价 USD"
                  value={recordForm.entryPriceUsd}
                  onChange={(e) => setRecordForm({ ...recordForm, entryPriceUsd: e.target.value })}
                />
                <input
                  aria-label="平仓价格"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="平仓价 USD"
                  value={recordForm.exitPriceUsd}
                  onChange={(e) => setRecordForm({ ...recordForm, exitPriceUsd: e.target.value })}
                />
                <input
                  aria-label="平仓数量"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="数量"
                  value={recordForm.amount}
                  onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
                />
                <input
                  aria-label="杠杆倍数"
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="杠杆，默认 1"
                  value={recordForm.leverage}
                  onChange={(e) => setRecordForm({ ...recordForm, leverage: e.target.value })}
                />
                <input
                  aria-label="平仓时间"
                  type="datetime-local"
                  value={recordForm.closedAt}
                  onChange={(e) => setRecordForm({ ...recordForm, closedAt: e.target.value })}
                />
                <label className="admin-public-check">
                  <input
                    type="checkbox"
                    checked={recordForm.isPublic}
                    onChange={(e) => setRecordForm({ ...recordForm, isPublic: e.target.checked })}
                  />{" "}
                  公开展示
                </label>
                <button type="submit" disabled={recordBusy} className="admin-primary btn-save-rec">
                  {recordBusy ? "保存中…" : editingRecordId ? "保存修改" : "添加记录"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
