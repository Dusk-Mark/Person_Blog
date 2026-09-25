"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import Opening from "./opening";
import {
  formatRoi,
  holdingRoi,
  marketValue,
  markPrice,
  roiClass,
  type Holding,
  type HoldingRecord,
  type LiveMarks,
} from "@/lib/portfolio";

type PublicPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  date: string;
  text: string;
  image: string;
  time: number;
  content: string;
};
type Ticker = {
  contract: string;
  last: number;
  changePercentage: number;
  fundingRate: number;
  updatedAt: string;
};
type TickerInfo = {
  last: number;
  changePercentage: number;
  fundingRate: number;
};
type TickerMap = Record<string, TickerInfo>;
const categories = ["最新文章", "加密货币", "美股", "软件工程", "生活随笔"];

function Icon({ name }: { name: string }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      ) : name === "sun" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </>
      ) : name === "eye" ? (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : name === "clock" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : name === "mail" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 6 9 7 9-7" />
        </>
      ) : (
        <>
          <path d="m3 10 18-7-6 18-4-7-8-4Z" />
          <path d="m11 14 10-11" />
        </>
      )}
    </svg>
  );
}

/** 侧栏持仓概览卡片，点击后打开持仓详情弹窗。 */
function PortfolioCard({
  holdings,
  marks,
  updatedAt,
  onOpen,
}: {
  holdings: Holding[];
  marks: LiveMarks;
  updatedAt: string | null;
  onOpen: () => void;
}) {
  const total = holdings.reduce(
    (sum, item) => sum + (marketValue(item, marks) ?? 0),
    0,
  );
  return (
    <button
      className="portfolio-card portfolio-card-button"
      onClick={onOpen}
      aria-label="查看详细持仓"
    >
      <div className="portfolio-heading">
        <div>
          <p className="portfolio-kicker">LIVE PORTFOLIO</p>
          <h2>我的持仓</h2>
        </div>
        <span className="live-dot">● 实时 · 查看详情</span>
      </div>
      {holdings.length ? (
        <>
          <div className="portfolio-total">
            {total.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="holding-list">
            {holdings.slice(0, 6).map((item) => {
              const value = marketValue(item, marks);
              const roi = holdingRoi(item, marks);
              return (
                <div className="holding-row" key={item.id}>
                  <strong>{item.asset}</strong>
                  <span>
                    {item.amount.toLocaleString(undefined, {
                      maximumFractionDigits: 8,
                    })}
                  </span>
                  <b className={roiClass(roi)}>{formatRoi(roi) ?? "—"}</b>
                  <b>
                    {value == null
                      ? "—"
                      : value.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 2,
                        })}
                  </b>
                </div>
              );
            })}
          </div>
          <small className="portfolio-updated">
            更新于{" "}
            {updatedAt ? new Date(updatedAt).toLocaleString("zh-CN") : "—"}
          </small>
        </>
      ) : (
        <p className="portfolio-empty">持仓数据将在后台录入后显示。</p>
      )}
    </button>
  );
}

/** 持仓详情弹窗：支持搜索品种显示 1s 实时行情，逐项展示入场价、杠杆、实时价与当前收益率。 */
function PortfolioModal({
  holdings,
  records,
  marks,
  tickerMap,
  searchedSymbol,
  onSearchChange,
  updatedAt,
  onClose,
}: {
  holdings: Holding[];
  records: HoldingRecord[];
  marks: LiveMarks;
  tickerMap: TickerMap;
  searchedSymbol: string;
  onSearchChange: (symbol: string) => void;
  updatedAt: string | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"current" | "records">("current");
  const cleanSearch = searchedSymbol.trim().toUpperCase();
  const searchTicker = cleanSearch ? tickerMap[cleanSearch] : null;
  const isSearchValid = /^[A-Z0-9]{2,20}$/.test(cleanSearch);

  const filteredHoldings = holdings.filter((item) =>
    cleanSearch ? item.asset.includes(cleanSearch) : true,
  );
  const filteredRecords = records.filter((item) =>
    cleanSearch ? item.asset.includes(cleanSearch) : true,
  );

  const isInHolding = holdings.some((item) => item.asset === cleanSearch);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="portfolio-modal"
        role="dialog"
        aria-modal="true"
        aria-label="持仓与交易记录"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          autoFocus
          className="modal-close"
          aria-label="关闭弹窗"
          onClick={onClose}
        >
          ×
        </button>
        <div className="portfolio-modal-head">
          <div>
            <p className="portfolio-kicker">LIVE PORTFOLIO & TRADING RECORDS</p>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 4 }}>
              <button
                className={`portfolio-tab-btn ${activeTab === "current" ? "active" : ""}`}
                onClick={() => setActiveTab("current")}
              >
                当前持仓 ({holdings.length})
              </button>
              <button
                className={`portfolio-tab-btn ${activeTab === "records" ? "active" : ""}`}
                onClick={() => setActiveTab("records")}
              >
                历史持仓记录 ({records.length})
              </button>
            </div>
          </div>
          <span className="live-dot">● 实时价格 · 1 秒刷新</span>
        </div>

        {/* 品种搜索输入框 */}
        <div className="portfolio-search-bar">
          <div className="portfolio-search-input-wrapper">
            <Icon name="search" />
            <input
              type="text"
              placeholder="搜索持仓/平仓记录或输入品种代码（如 SOL, DOGE, BTC）查看 1s 实时价格..."
              value={searchedSymbol}
              onChange={(e) => onSearchChange(e.target.value.toUpperCase().trim())}
              className="portfolio-search-input"
            />
            {searchedSymbol && (
              <button
                className="search-clear-btn"
                onClick={() => onSearchChange("")}
                title="清空搜索"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 搜索品种的 1s 实时行情卡片 */}
        {cleanSearch && isSearchValid && (
          <div className="portfolio-search-result-card">
            <div className="search-result-head">
              <div>
                <strong>{cleanSearch} / USDT 永续合约</strong>
                <span className="search-result-badge" style={{ marginLeft: 10 }}>
                  {isInHolding ? "当前持仓中" : "行情查询品种"}
                </span>
              </div>
              <span className="live-dot-pulse">1s 实时刷新中</span>
            </div>
            {searchTicker ? (
              <div className="search-result-grid">
                <div className="search-result-item">
                  <small>实时最新价 (USD)</small>
                  <b>
                    $
                    {searchTicker.last.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </b>
                </div>
                <div className="search-result-item">
                  <small>24H 涨跌幅</small>
                  <b
                    className={
                      searchTicker.changePercentage >= 0 ? "up" : "down"
                    }
                  >
                    {searchTicker.changePercentage >= 0 ? "+" : ""}
                    {searchTicker.changePercentage.toFixed(2)}%
                  </b>
                </div>
                <div className="search-result-item">
                  <small>资金费率</small>
                  <b>{(searchTicker.fundingRate * 100).toFixed(4)}%</b>
                </div>
              </div>
            ) : (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                正在查询 {cleanSearch} 的 1s 实时价格...
              </p>
            )}
          </div>
        )}

        {/* 当前持仓 TAB */}
        {activeTab === "current" && (
          <>
            {filteredHoldings.length ? (
              <div className="portfolio-detail-list">
                {filteredHoldings.map((item) => {
                  const direction = item.direction === "short" ? "short" : "long";
                  const mark = markPrice(item, marks);
                  const value = marketValue(item, marks);
                  const roi = holdingRoi(item, marks);
                  return (
                    <div className="portfolio-detail" key={item.id}>
                      <div className="portfolio-detail-title">
                        <div className="asset-heading">
                          <strong>{item.asset}</strong>
                          <span className={`position-badge ${direction}`}>
                            {direction === "short" ? "空仓" : "多仓"}
                          </span>
                        </div>
                        <span>
                          {item.source === "gate"
                            ? `Gate · ${item.account}`
                            : "手动持仓"}
                        </span>
                      </div>
                      <div className="portfolio-metrics">
                        <div>
                          <small>仓位方向</small>
                          <b className={`position-value ${direction}`}>
                            {direction === "short" ? "空仓" : "多仓"}
                          </b>
                        </div>
                        <div>
                          <small>杠杆倍数</small>
                          <b>{item.leverage == null ? "—" : `${item.leverage}x`}</b>
                        </div>
                        <div>
                          <small>持仓数量</small>
                          <b>
                            {item.amount.toLocaleString(undefined, {
                              maximumFractionDigits: 8,
                            })}
                          </b>
                        </div>
                        <div>
                          <small>入场价格</small>
                          <b>
                            {item.entry_price_usd == null
                              ? "—"
                              : `$${item.entry_price_usd.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                          </b>
                        </div>
                        <div>
                          <small>实时价格 (1s)</small>
                          <b>
                            {mark == null
                              ? "加载中…"
                              : `$${mark.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
                          </b>
                        </div>
                        <div>
                          <small>持仓市值</small>
                          <b>
                            {value == null
                              ? "—"
                              : value.toLocaleString("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                  maximumFractionDigits: 2,
                                })}
                          </b>
                        </div>
                        <div>
                          <small>当前收益率</small>
                          <b className={roiClass(roi)}>{formatRoi(roi) ?? "—"}</b>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : holdings.length ? (
              <p className="portfolio-empty">未查找到匹配“{searchedSymbol}”的当前持仓。</p>
            ) : (
              <p className="portfolio-empty">暂无公开持仓。</p>
            )}
          </>
        )}

        {/* 历史持仓记录 TAB (所有人均可查看：包含入场价格，平仓价格，收益率) */}
        {activeTab === "records" && (
          <>
            {filteredRecords.length ? (
              <div className="portfolio-detail-list">
                {filteredRecords.map((item) => {
                  const direction = item.direction === "short" ? "short" : "long";
                  return (
                    <div className="portfolio-detail" key={item.id}>
                      <div className="portfolio-detail-title">
                        <div className="asset-heading">
                          <strong>{item.asset}</strong>
                          <span className={`position-badge ${direction}`}>
                            {direction === "short" ? "空仓" : "多仓"}
                          </span>
                        </div>
                        <span>平仓时间：{new Date(item.closed_at).toLocaleString("zh-CN")}</span>
                      </div>
                      <div className="portfolio-metrics" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                        <div>
                          <small>杠杆倍数</small>
                          <b>{item.leverage == null ? "—" : `${item.leverage}x`}</b>
                        </div>
                        <div>
                          <small>平仓数量</small>
                          <b>
                            {item.amount.toLocaleString(undefined, {
                              maximumFractionDigits: 8,
                            })}
                          </b>
                        </div>
                        <div>
                          <small>入场价格</small>
                          <b>
                            ${item.entry_price_usd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </b>
                        </div>
                        <div>
                          <small>平仓价格</small>
                          <b>
                            ${item.exit_price_usd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </b>
                        </div>
                        <div>
                          <small>平仓收益率</small>
                          <b className={roiClass(item.roi)}>{formatRoi(item.roi) ?? "—"}</b>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : records.length ? (
              <p className="portfolio-empty">未查找到匹配“{searchedSymbol}”的历史平仓记录。</p>
            ) : (
              <p className="portfolio-empty">暂无公开的历史平仓记录。</p>
            )}
          </>
        )}

        <small className="portfolio-updated">
          最后更新：
          {updatedAt ? new Date(updatedAt).toLocaleString("zh-CN") : "—"}
        </small>
      </section>
    </div>
  );
}

export default function Home() {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [records, setRecords] = useState<HoldingRecord[]>([]);
  const [holdingsUpdated, setHoldingsUpdated] = useState<string | null>(null);
  const [liveMarks, setLiveMarks] = useState<LiveMarks>({});
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [searchedSymbol, setSearchedSymbol] = useState("");
  const [tickerMap, setTickerMap] = useState<TickerMap>({});
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [category, setCategory] = useState("最新文章");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  // 文章列表：始终用匿名凭据读取已发布文章，不受后台登录态影响。
  useEffect(() => {
    const controller = new AbortController();
    async function loadPosts() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) throw new Error("Missing configuration");
        const response = await fetch(
          url +
            "/rest/v1/blog_posts?select=id,title,slug,category,created_at,excerpt,cover_url,content&status=eq.published&order=created_at.desc",
          {
            headers: { apikey: key },
            signal: controller.signal,
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("Articles unavailable");
        const rows: {
          id: string;
          title: string;
          slug: string;
          category: string;
          created_at: string;
          excerpt: string;
          cover_url: string;
          content: string;
        }[] = await response.json();
        if (!controller.signal.aborted) {
          setPosts(
            rows.map((row) => ({
              id: row.id,
              title: row.title,
              slug: row.slug,
              category: row.category,
              date: row.created_at.slice(0, 10),
              text: row.excerpt,
              image: row.cover_url || "/首页顶部图片.png",
              content: row.content,
              time: Math.max(1, Math.ceil(row.content.length / 500)),
            })),
          );
          setLoadError(false);
        }
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadPosts();
    return () => controller.abort();
  }, [reload]);
  // 首屏行情标签：只取默认的 BTC / ETH，1 秒刷新一次。
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const response = await fetch("/api/gate/tickers", {
          cache: "no-store",
        });
        const data = await response.json();
        if (alive && response.ok && Array.isArray(data)) setTickers(data);
      } catch {
        /* 行情标签失败时不影响博客 */
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  // 公开持仓与历史平仓记录：访客未登录也要能看，所以只用匿名 apikey 直连 REST 接口。
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;

    // 获取当前持仓
    fetch(
      url +
        "/rest/v1/portfolio_holdings?select=id,asset,amount,value_usd,price_usd,entry_price_usd,leverage,direction,source,account,synced_at&is_public=eq.true&order=value_usd.desc.nullslast",
      { headers: { apikey: key }, cache: "no-store" },
    )
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) {
          setHoldings(rows);
          setHoldingsUpdated(rows[0]?.synced_at ?? null);
        }
      })
      .catch(() => undefined);

    // 获取历史持仓/平仓记录
    fetch(
      url +
        "/rest/v1/portfolio_records?select=id,asset,direction,entry_price_usd,exit_price_usd,amount,leverage,roi,pnl_usd,closed_at&is_public=eq.true&order=closed_at.desc",
      { headers: { apikey: key }, cache: "no-store" },
    )
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) {
          setRecords(rows);
        }
      })
      .catch(() => undefined);
  }, [reload]);
  // 持仓市值与搜索品种实时行情均按 1 秒 (1000ms) 轮询 Gate 永续合约实时价格。
  useEffect(() => {
    const symbolSet = new Set<string>();
    holdings.forEach((item) => symbolSet.add(item.asset));
    if (searchedSymbol && /^[A-Z0-9]{2,20}$/.test(searchedSymbol)) {
      symbolSet.add(searchedSymbol);
    }
    const symbolsList = Array.from(symbolSet);
    if (!symbolsList.length) return;

    let alive = true;
    const refresh = async () => {
      try {
        const symbols = symbolsList.join(",");
        const response = await fetch(
          `/api/gate/tickers?symbols=${encodeURIComponent(symbols)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (alive && response.ok && Array.isArray(data)) {
          const newMarks: LiveMarks = {};
          const newTickerMap: TickerMap = {};
          data.forEach(
            (item: {
              contract: string;
              last: number;
              changePercentage: number;
              fundingRate: number;
            }) => {
              const asset = item.contract.split("_")[0];
              newMarks[asset] = item.last;
              newTickerMap[asset] = {
                last: item.last,
                changePercentage: item.changePercentage,
                fundingRate: item.fundingRate,
              };
            },
          );
          setLiveMarks((prev) => ({ ...prev, ...newMarks }));
          setTickerMap((prev) => ({ ...prev, ...newTickerMap }));
        }
      } catch {
        /* 保留上次实时价格 */
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [holdings, searchedSymbol]);

  const filtered = posts.filter(
    (post) =>
      (category === "最新文章" || category === post.category) &&
      (post.title + post.text + post.content)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className={dark ? "site dark" : "site"} id="home">
      <Opening />
      <header className="header">
        <div className="container header-inner">
          <a className="brand" href="#home">
            <span className="logo" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            NILING_DUSK
          </a>
          <span className="brand-description">
            Crypto <i>•</i> Stocks <i>•</i> Engineering
          </span>
          <nav aria-label="主导航">
            <a className="active" href="#home">
              首页
            </a>
            <a href="#articles">文章</a>
            <a href="#categories">分类</a>
            <a href="#about">关于我</a>
          </nav>
          <div className="header-actions">
            <button
              aria-label="搜索文章"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Icon name="search" />
            </button>
            <button
              aria-label={dark ? "切换浅色模式" : "切换深色模式"}
              onClick={() => setDark(!dark)}
            >
              <Icon name="sun" />
            </button>
          </div>
        </div>
      </header>
      <section className="hero">
        <Image
          className="hero-image"
          src="/首页顶部图片.png"
          alt="加密货币、股票行情与代码组成的工作空间"
          fill
          sizes="100vw"
          preload
        />
        <div className="hero-overlay" />
        <div className="container hero-content">
          <p className="eyebrow">BETTER IDEAS. HIGHER COMPOUND.</p>
          <h1>
            在加密、美股与技术的交汇处
            <br />
            记录思考与成长
          </h1>
          <p className="hero-description">
            我是 NILING_DUSK，一名热爱技术与金融的探索者。
            <br />
            在这里，分享关于加密货币、美股投资与软件工程的学习、研究与思考。
          </p>
          <div className="hero-tags">
            {categories.slice(1).map((c) => (
              <a href="#articles" key={c} onClick={() => setCategory(c)}>
                {c === "美股" ? "美股投资" : c}
              </a>
            ))}
          </div>
          <div className="gate-tickers" aria-label="Gate 永续合约实时行情">
            {tickers.map((ticker) => (
              <span className="gate-ticker" key={ticker.contract}>
                <b>GATE · {ticker.contract.replace("_USDT", "")}</b>
                <strong>
                  $
                  {ticker.last.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                </strong>
                <em className={ticker.changePercentage >= 0 ? "up" : "down"}>
                  {ticker.changePercentage >= 0 ? "+" : ""}
                  {ticker.changePercentage.toFixed(2)}%
                </em>
              </span>
            ))}
          </div>
        </div>
      </section>
      <main className="container content" id="articles">
        <section className="feed" aria-label="文章列表">
          <div
            className="tabs"
            id="categories"
            role="tablist"
            aria-label="文章分类"
          >
            {categories.map((c) => (
              <button
                role="tab"
                aria-selected={category === c}
                className={category === c ? "selected" : ""}
                key={c}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {searchOpen && (
            <div className="search-field">
              <Icon name="search" />
              <input
                autoFocus
                aria-label="搜索文章标题和内容"
                placeholder="搜索文章标题或关键词…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                aria-label="关闭搜索"
              >
                ×
              </button>
            </div>
          )}
          {filtered.map((post) => (
            <article className="post" key={post.id}>
              <Link
                className="post-cover"
                href={`/posts/${post.slug}`}
                aria-label={post.title}
              >
                <Image
                  src={post.image}
                  alt=""
                  fill
                  sizes="(max-width: 650px) 100vw, 360px"
                  unoptimized
                />
              </Link>
              <div className="post-body">
                <div className="meta">
                  <span className="badge">{post.category}</span>
                  <span className="meta-divider" />
                  <time>{post.date}</time>
                </div>
                <h2>
                  <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                </h2>
                <p>{post.text}</p>
                <div className="stats">
                  <span>
                    <Icon name="clock" />
                    {post.time} min
                  </span>
                </div>
              </div>
            </article>
          ))}
          {loading && (
            <p className="empty" role="status">
              正在加载文章…
            </p>
          )}
          {loadError && (
            <div className="empty" role="alert">
              文章暂时无法加载。
              <button
                className="posts-retry"
                onClick={() => {
                  setLoading(true);
                  setLoadError(false);
                  setReload((n) => n + 1);
                }}
              >
                重新加载
              </button>
            </div>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <p className="empty">
              {posts.length
                ? "没有找到相关文章，试试其他关键词。"
                : "新的思考正在酝酿，敬请期待第一篇文章。"}
            </p>
          )}
        </section>
        <aside className="sidebar">
          <PortfolioCard
            holdings={holdings}
            marks={liveMarks}
            updatedAt={holdingsUpdated}
            onOpen={() => setPortfolioOpen(true)}
          />
          <section className="profile" id="about">
            <div className="profile-cover">
              <Image
                src="/个人封面.jpg"
                alt="云雾中的群山"
                fill
                sizes="350px"
              />
            </div>
            <div className="profile-info">
              <Image
                className="avatar"
                src="/头像.jpg"
                alt="NILING_DUSK 的头像"
                width={66}
                height={66}
              />
              <h2>NILING_DUSK</h2>
              <p>
                Stop-losses keep you in the game; take-profits decide how you
                win it.。
              </p>
              <div className="profile-signature">
                <span className="signature-dot" />
                向内求索
              </div>
            </div>
          </section>
          <section className="popular">
            <h2>最新发布</h2>
            {posts.slice(0, 4).map((post, index) => (
              <Link
                className="popular-item"
                key={post.id}
                href={`/posts/${post.slug}`}
              >
                <span className="rank">{index + 1}</span>
                <span className="popular-image">
                  <Image
                    src={post.image}
                    alt=""
                    fill
                    sizes="60px"
                    unoptimized
                  />
                </span>
                <span className="popular-text">
                  {post.title}
                  <span className="stats">{post.date}</span>
                </span>
              </Link>
            ))}
          </section>
          <section className="subscribe">
            <div className="subscribe-title">
              <Icon name="send" />
              <div>
                <h2>订阅我的博客</h2>
                <p>获取最新文章、市场观点与技术分享</p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMessage("感谢关注！邮件订阅服务即将开放。");
              }}
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="订阅邮箱"
                placeholder="请输入你的邮箱"
              />
              <button type="submit">订阅</button>
            </form>
            {message && (
              <p className="subscribe-message" role="status">
                {message}
              </p>
            )}
          </section>
        </aside>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <a className="brand" href="#home">
            <span className="logo" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            NILING_DUSK
          </a>
          <span className="footer-tagline">Better Ideas. Higher Compound.</span>
          <nav aria-label="页脚导航">
            <a href="#home">首页</a>
            <a href="#articles">文章</a>
            <a href="#categories">分类</a>
            <a href="#about">关于我</a>
          </nav>
          <span className="copyright">© 2026 NILING_DUSK</span>
        </div>
      </footer>
      {portfolioOpen && (
        <PortfolioModal
          holdings={holdings}
          records={records}
          marks={liveMarks}
          tickerMap={tickerMap}
          searchedSymbol={searchedSymbol}
          onSearchChange={setSearchedSymbol}
          updatedAt={holdingsUpdated}
          onClose={() => setPortfolioOpen(false)}
        />
      )}
    </div>
  );
}
