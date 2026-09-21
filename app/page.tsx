"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Opening from "./opening";

type PublicPost = {
  id: string; title: string; category: string; date: string; text: string;
  image: string; time: number; content: string;
};
type Holding = { id: string; asset: string; amount: number; value_usd: number | null; source: string; synced_at: string };
const categories = ["最新文章", "加密货币", "美股", "软件工程", "生活随笔"];

function Icon({ name }: { name: string }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "search" ? <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></> : name === "sun" ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : name === "eye" ? <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></> : name === "clock" ? <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></> : name === "mail" ? <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></> : <><path d="m3 10 18-7-6 18-4-7-8-4Z"/><path d="m11 14 10-11"/></>}
  </svg>;
}

export default function Home() {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [holdingsUpdated, setHoldingsUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function loadPosts() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) throw new Error("Missing configuration");
        // Always use anonymous credentials, even when the browser has an admin session.
        const response = await fetch(url + "/rest/v1/blog_posts?select=id,title,category,created_at,excerpt,cover_url,content&status=eq.published&order=created_at.desc", {
          headers: { apikey: key }, signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("Articles unavailable");
        const rows: { id: string; title: string; category: string; created_at: string; excerpt: string; cover_url: string; content: string }[] = await response.json();
        if (!controller.signal.aborted) {
          setPosts(rows.map(row => ({
            id: row.id, title: row.title, category: row.category,
            date: row.created_at.slice(0, 10), text: row.excerpt,
            image: row.cover_url || "/首页顶部图片.png", content: row.content,
            time: Math.max(1, Math.ceil(row.content.length / 500)),
          })));
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
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    fetch(url + "/rest/v1/portfolio_holdings?select=id,asset,amount,value_usd,source,synced_at&is_public=eq.true&order=value_usd.desc.nullslast", { headers: { apikey: key }, cache: "no-store" })
      .then(response => response.ok ? response.json() : [])
      .then(rows => { if (Array.isArray(rows)) { setHoldings(rows); setHoldingsUpdated(rows[0]?.synced_at ?? null); } })
      .catch(() => undefined);
  }, [reload]);
  const [category, setCategory] = useState("最新文章");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [selected, setSelected] = useState<PublicPost | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const filtered = posts.filter(post => (category === "最新文章" || category === post.category) && (post.title + post.text + post.content).toLowerCase().includes(search.toLowerCase()));
  return <div className={dark ? "site dark" : "site"} id="home">
    <Opening/>
    <header className="header"><div className="container header-inner">
      <a className="brand" href="#home"><span className="logo" aria-hidden="true"><i/><i/><i/></span>NILING_DUSK</a>
      <span className="brand-description">Crypto <i>•</i> Stocks <i>•</i> Engineering</span>
      <nav aria-label="主导航"><a className="active" href="#home">首页</a><a href="#articles">文章</a><a href="#categories">分类</a><a href="#about">关于我</a></nav>
      <div className="header-actions"><button aria-label="搜索文章" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Icon name="search"/></button><button aria-label={dark ? "切换浅色模式" : "切换深色模式"} onClick={() => setDark(!dark)}><Icon name="sun"/></button></div>
    </div></header>
    <section className="hero">
      <Image className="hero-image" src="/首页顶部图片.png" alt="加密货币、股票行情与代码组成的工作空间" fill sizes="100vw" preload/>
      <div className="hero-overlay"/>
      <div className="container hero-content"><p className="eyebrow">BETTER IDEAS. HIGHER COMPOUND.</p><h1>在加密、美股与技术的交汇处<br/>记录思考与成长</h1><p className="hero-description">我是 NILING_DUSK，一名热爱技术与金融的探索者。<br/>在这里，分享关于加密货币、美股投资与软件工程的学习、研究与思考。</p><div className="hero-tags">{categories.slice(1).map(c => <a href="#articles" key={c} onClick={() => setCategory(c)}>{c === "美股" ? "美股投资" : c}</a>)}</div></div>
    </section>
    <main className="container content" id="articles">
      <section className="feed" aria-label="文章列表">
        <div className="tabs" id="categories" role="tablist" aria-label="文章分类">{categories.map(c => <button role="tab" aria-selected={category === c} className={category === c ? "selected" : ""} key={c} onClick={() => setCategory(c)}>{c}</button>)}</div>
        {searchOpen && <div className="search-field"><Icon name="search"/><input autoFocus aria-label="搜索文章标题和内容" placeholder="搜索文章标题或关键词…" value={search} onChange={e => setSearch(e.target.value)}/><button onClick={() => {setSearch("");setSearchOpen(false);}} aria-label="关闭搜索">×</button></div>}
        {filtered.map(post => <article className="post" key={post.id}>
          <button className="post-cover" onClick={() => setSelected(post)} aria-label={post.title}><Image src={post.image} alt="" fill sizes="(max-width: 650px) 100vw, 360px" unoptimized/></button>
          <div className="post-body"><div className="meta"><span className="badge">{post.category}</span><span className="meta-divider"/><time>{post.date}</time></div><h2><button onClick={() => setSelected(post)}>{post.title}</button></h2><p>{post.text}</p><div className="stats"><span><Icon name="clock"/>{post.time} min</span></div></div>
        </article>)}
        {loading && <p className="empty" role="status">正在加载文章…</p>}
        {loadError && <div className="empty" role="alert">文章暂时无法加载。<button className="posts-retry" onClick={() => {setLoading(true);setLoadError(false);setReload(n => n + 1);}}>重新加载</button></div>}
        {!loading && !loadError && filtered.length === 0 && <p className="empty">{posts.length ? "没有找到相关文章，试试其他关键词。" : "新的思考正在酝酿，敬请期待第一篇文章。"}</p>}
      </section>
      <aside className="sidebar">
        <section className="portfolio-card"><div className="portfolio-heading"><div><p className="portfolio-kicker">LIVE PORTFOLIO</p><h2>我的持仓</h2></div><span className="live-dot">● 实时</span></div>{holdings.length ? <><div className="portfolio-total">{holdings.reduce((sum, item) => sum + (item.value_usd || 0), 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</div><div className="holding-list">{holdings.slice(0, 6).map(item => <div className="holding-row" key={item.id}><strong>{item.asset}</strong><span>{item.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span><b>{item.value_usd == null ? "—" : item.value_usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</b></div>)}</div><small className="portfolio-updated">更新于 {holdingsUpdated ? new Date(holdingsUpdated).toLocaleString("zh-CN") : "—"}</small></> : <p className="portfolio-empty">持仓数据将在配置并同步后显示。</p>}</section>
        <section className="profile" id="about"><div className="profile-cover"><Image src="/个人封面.jpg" alt="云雾中的群山" fill sizes="350px"/></div><div className="profile-info"><Image className="avatar" src="/头像.jpg" alt="NILING_DUSK 的头像" width={66} height={66}/><h2>NILING_DUSK</h2><p>Stop-losses keep you in the game; take-profits decide how you win it.。</p><div className="profile-signature"><span className="signature-dot"/>向内求索</div></div></section>
        <section className="popular"><h2>最新发布</h2>{posts.slice(0, 4).map((post, index) => <button className="popular-item" key={post.id} onClick={() => setSelected(post)}><span className="rank">{index + 1}</span><span className="popular-image"><Image src={post.image} alt="" fill sizes="60px" unoptimized/></span><span className="popular-text">{post.title}<span className="stats">{post.date}</span></span></button>)}</section>
        <section className="subscribe"><div className="subscribe-title"><Icon name="send"/><div><h2>订阅我的博客</h2><p>获取最新文章、市场观点与技术分享</p></div></div><form onSubmit={e => {e.preventDefault();setMessage("感谢关注！邮件订阅服务即将开放。");}}><input type="email" required value={email} onChange={e => setEmail(e.target.value)} aria-label="订阅邮箱" placeholder="请输入你的邮箱"/><button type="submit">订阅</button></form>{message && <p className="subscribe-message" role="status">{message}</p>}</section>
      </aside>
    </main>
    <footer className="footer"><div className="container footer-inner"><a className="brand" href="#home"><span className="logo" aria-hidden="true"><i/><i/><i/></span>NILING_DUSK</a><span className="footer-tagline">Better Ideas. Higher Compound.</span><nav aria-label="页脚导航"><a href="#home">首页</a><a href="#articles">文章</a><a href="#categories">分类</a><a href="#about">关于我</a></nav><span className="copyright">© 2026 NILING_DUSK</span></div></footer>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><section className="article-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={e => e.stopPropagation()} onKeyDown={e => {if(e.key === "Escape") setSelected(null);}}><button autoFocus className="modal-close" aria-label="关闭文章" onClick={() => setSelected(null)}>×</button><span className="badge">{selected.category}</span><h2>{selected.title}</h2><p className="modal-byline">NILING_DUSK · {selected.date} · {selected.time} 分钟阅读</p><div className="public-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{selected.content}</ReactMarkdown></div></section></div>}
  </div>;
}
