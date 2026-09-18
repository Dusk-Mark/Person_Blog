"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createBrowserDatabase } from "@/lib/supabase";

type Post = {
  id: string; title: string; slug: string; excerpt: string;
  category: string; content: string; cover_url: string;
  status: "draft" | "published"; updated_at: string;
};
type Draft = Omit<Post, "id" | "updated_at"> & { id?: string };
const emptyPost = (): Draft => ({
  title: "", slug: "", excerpt: "", category: "软件工程",
  content: "", cover_url: "", status: "draft",
});
const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};
function httpsUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function errorMessage(error: { message: string; code?: string }) {
  if (error.code === "23505") return "文章路径已被使用，请更换。";
  if (error.code === "42P01" || error.code === "PGRST205") return "数据库尚未初始化，请先执行 data.sql。";
  if (error.code === "42501") return "权限不足，请检查管理员授权与数据库策略。";
  if (error.message.includes("Invalid login credentials")) return "邮箱或密码不正确。";
  return error.message;
}

export default function AdminPage() {
  const db = useMemo(() => createBrowserDatabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<"loading" | "guest" | "admin" | "denied">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyPost);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertSyntax(before: string, after: string, placeholder: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.content.slice(start, end) || placeholder;
    const next = draft.content.slice(0, start) + before + selected + after + draft.content.slice(end);
    if (next.length > 200000) return; // respect maxLength
    setDraft(previous => ({ ...previous, content: next }));
    setDirty(true);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  useEffect(() => {
    if (!db) {
      setAccess("denied");
      setNotice("部署环境缺少 Supabase 配置。请在 Vercel Environment Variables 中添加 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY，然后重新部署。");
      return;
    }
    const database = db;
    let alive = true;
    async function load(next: Session | null) {
      if (!alive) return;
      setSession(next); setAccess("loading"); setPosts([]); setDraft(emptyPost()); setDirty(false);
      if (!next) { setAccess("guest"); return; }
      const membership = await database.from("blog_admins").select("user_id").eq("user_id", next.user.id).maybeSingle();
      if (!alive) return;
      if (membership.error || !membership.data) {
        setAccess("denied");
        setNotice(membership.error ? errorMessage(membership.error) : "该账号尚未获得管理员权限，请按 data.sql 末尾说明授权。");
        return;
      }
      const result = await database.from("blog_posts").select("*").order("updated_at", { ascending: false });
      if (!alive) return;
      setAccess("admin");
      if (result.error) setNotice(errorMessage(result.error));
      else { setPosts(result.data as Post[]); setNotice(""); }
    }
    let currentUser: string | undefined;
    const { data: listener } = database.auth.onAuthStateChange((event, next) => {
      if (event === "INITIAL_SESSION" || next?.user.id !== currentUser) {
        currentUser = next?.user.id;
        // Auth callback must return before making another Supabase request.
        window.setTimeout(() => { if (alive) void load(next); }, 0);
      }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [db]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); setDirty(true);
  }
  function choose(post?: Post) {
    if (dirty && !window.confirm("当前修改尚未保存，是否放弃修改？")) return;
    setDraft(post ? { ...post } : emptyPost()); setDirty(false); setNotice("");
  }
  function leaveEditor(event: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm("当前修改尚未保存，是否离开后台？")) event.preventDefault();
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    if (!db) { setBusy(false); setNotice("Supabase 环境变量尚未配置。"); return; }
    try {
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setNotice(errorMessage(error));
      else setPassword("");
    } catch { setNotice("连接失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!db) return;
    if (dirty && !window.confirm("当前修改尚未保存，确定退出？")) return;
    setBusy(true);
    const { error } = await db.auth.signOut({ scope: "local" });
    if (error) setNotice(errorMessage(error));
    setBusy(false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!db) { setNotice("Supabase 环境变量尚未配置。"); return; }
    if (draft.cover_url && !httpsUrl(draft.cover_url)) { setNotice("封面必须为有效的 HTTPS 图床链接。"); return; }
    if (!draft.title.trim()) { setNotice("请输入文章标题。"); return; }
    if (draft.status === "published" && !draft.content.trim()) { setNotice("发布前请填写文章正文。"); return; }
    setBusy(true); setNotice("");
    const payload = {
      title: draft.title.trim(), slug: draft.slug, excerpt: draft.excerpt,
      category: draft.category, content: draft.content,
      cover_url: draft.cover_url, status: draft.status,
    };
    try {
      const query = draft.id
        ? db.from("blog_posts").update(payload).eq("id", draft.id)
        : db.from("blog_posts").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) { setNotice(errorMessage(error)); return; }
      const saved = data as Post;
      setPosts(previous => [saved, ...previous.filter(p => p.id !== saved.id)]);
      setDraft(saved); setDirty(false); setNotice("文章已保存。已发布文章将展示在公开博客中，草稿仅管理员可见。");
    } catch { setNotice("保存失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!db) { setNotice("Supabase 环境变量尚未配置。"); return; }
    if (!draft.id) return;
    if (!window.confirm("确定要删除这篇文章吗？如果已发布，访客将无法再查看。")) return;
    if (!window.confirm(`这是最后确认：永久删除「${draft.title}」？删除后无法恢复。`)) return;
    setBusy(true);
    try {
      const { data, error } = await db.from("blog_posts").delete().eq("id", draft.id).select("id");
      if (error) { setNotice(errorMessage(error)); return; }
      if (!data.length) { setNotice("删除未生效，请刷新并检查权限。"); return; }
      setPosts(previous => previous.filter(p => p.id !== draft.id));
      setDraft(emptyPost()); setDirty(false); setNotice("文章已删除。封面文件保留在图床中。");
    } catch { setNotice("删除失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file || !session || !db) return;
    const extension = mimeExtensions[file.type];
    if (!extension || file.size > 5 * 1024 * 1024) {
      setNotice("请选择不超过 5MB 的 JPG、PNG、WebP 或 GIF 图片。"); return;
    }
    setBusy(true); setNotice("");
    try {
      const path = session.user.id + "/" + crypto.randomUUID() + "." + extension;
      const { error } = await db.storage.from("blog-covers").upload(path, file, { contentType: file.type, upsert: false });
      if (error) { setNotice(errorMessage(error)); return; }
      const { data } = db.storage.from("blog-covers").getPublicUrl(path);
      edit("cover_url", data.publicUrl);
      setNotice("封面已上传，请保存文章。图床链接可公开访问。");
    } catch { setNotice("上传失败，请检查网络与 Storage 配置。"); }
    finally { setBusy(false); }
  }

  return <main className="admin-shell">
    <header className="admin-header"><Link href="/" onClick={leaveEditor}>NILING_DUSK <span>/ 管理后台</span></Link><div><Link href="/" onClick={leaveEditor}>查看博客</Link>{session && <button disabled={busy} onClick={logout}>退出登录</button>}</div></header>
    {access === "loading" ? <div className="admin-login"><h1>正在验证访问权限…</h1></div> :
      access !== "admin" ? <section className="admin-login">
        <p className="admin-kicker">PRIVATE WORKSPACE</p><h1>欢迎回来，NILING_DUSK</h1><p>登录以管理文章与创作内容。</p>
        {access === "guest" && <form onSubmit={login}><label>邮箱<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/></label><button className="admin-primary" disabled={busy}>{busy ? "正在登录…" : "登录后台"}</button></form>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        <p className="admin-help">首次使用：执行 data.sql，创建 Auth 用户并授予管理员权限。后台不提供公开注册。</p>
      </section> : <div className="admin-workspace">
        <aside className="admin-list"><div className="admin-list-title"><h1>文章管理</h1><button disabled={busy} onClick={() => choose()}>＋ 新建</button></div><input aria-label="筛选文章" placeholder="搜索标题…" value={filter} onChange={e => setFilter(e.target.value)}/>
          <div className="admin-post-list">{(() => {
            const filtered = posts.filter(p => p.title.toLowerCase().includes(filter.toLowerCase()));
            const drafts = filtered.filter(p => p.status === "draft");
            const published = filtered.filter(p => p.status === "published");
            if (!posts.length) return <p className="admin-help">还没有文章，开始你的第一篇创作吧。</p>;
            if (!filtered.length) return <p className="admin-help">没有匹配的文章。</p>;
            return <>{drafts.length > 0 && <><div className="admin-section-title">草稿</div>{drafts.map(p => <button disabled={busy} className={draft.id === p.id ? "is-current" : ""} key={p.id} onClick={() => choose(p)}><strong>{p.title}</strong><span>{p.category}</span></button>)}</>}{published.length > 0 && <><div className="admin-section-title">已发布</div>{published.map(p => <button disabled={busy} className={draft.id === p.id ? "is-current" : ""} key={p.id} onClick={() => choose(p)}><strong>{p.title}</strong><span>{p.category} · {p.updated_at?.slice(0, 10)}</span></button>)}</>}</>;
          })()}</div>
          <p className="admin-help">已发布文章对所有访客可见，草稿仅管理员可见。</p>
        </aside>
        <section className="admin-editor"><div className="admin-editor-heading"><div><p className="admin-kicker">WRITE · THINK · BUILD</p><h2>{draft.id ? "编辑文章" : "新的创作"}{dirty && <span> · 未保存</span>}</h2></div></div>
          {notice && <p className="admin-notice" role="status">{notice}</p>}
          <form onSubmit={save}><fieldset disabled={busy}>
            <label>文章标题<input required maxLength={200} value={draft.title} onChange={e => edit("title", e.target.value)} placeholder="为你的思考起一个标题"/></label>
            <div className="admin-fields"><label>文章路径<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" title="小写英文字母、数字与中划线，例如 my-first-post" value={draft.slug} onChange={e => edit("slug", e.target.value)} placeholder="my-first-post"/></label><label>分类<select value={draft.category} onChange={e => edit("category", e.target.value)}>{["加密货币","美股","软件工程","生活随笔"].map(c => <option key={c}>{c}</option>)}</select></label><label>状态<select value={draft.status} onChange={e => edit("status", e.target.value as Draft["status"])}><option value="draft">草稿</option><option value="published">已发布（公开可见）</option></select></label></div>
            <label>文章摘要<textarea rows={2} maxLength={500} value={draft.excerpt} onChange={e => edit("excerpt", e.target.value)} placeholder="用几句话概括文章内容"/></label>
            <label>封面图床链接<input type="url" value={draft.cover_url} onChange={e => edit("cover_url", e.target.value)} placeholder="https://你的图床/cover.jpg"/></label>
            <div className="admin-cover-row"><label className="admin-upload">上传到图床<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => {void upload(e.target.files?.[0]);e.target.value = "";}}/></label><span>JPG / PNG / WebP / GIF · 最大 5MB</span>{draft.cover_url && <button type="button" onClick={() => edit("cover_url", "")}>清除封面</button>}</div>
            {httpsUrl(draft.cover_url) && <div className="admin-cover-preview">
              {/* External image hosts are chosen by the administrator. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.cover_url} referrerPolicy="no-referrer" alt="文章封面预览"/>
            </div>}
            <div className="admin-markdown-heading"><label htmlFor="markdown">文章正文 · Markdown</label><div className="admin-md-actions"><button type="button" onClick={() => setPreview(!preview)}>{preview ? "隐藏预览" : "显示预览"}</button><button type="button" className={showHint ? "active" : ""} onClick={() => setShowHint(!showHint)}>语法速查</button></div></div>
            <div className="admin-md-toolbar">{[
              { label: "B", title: "加粗 **文字**", before: "**", after: "**", placeholder: "加粗文字" },
              { label: "I", title: "斜体 *文字*", before: "*", after: "*", placeholder: "斜体文字" },
              { label: "H", title: "标题 ## 标题", before: "## ", after: "", placeholder: "标题" },
              { label: ">", title: "引用 > 引用内容", before: "> ", after: "", placeholder: "引用内容" },
              { label: "\u2022", title: "无序列表 - 列表项", before: "- ", after: "", placeholder: "列表项" },
              { label: "`", title: "行内代码 `代码`", before: "`", after: "`", placeholder: "代码" },
              { label: "代码块", title: "代码块 ```", before: "```\n", after: "\n```", placeholder: "代码" },
              { label: "\u2261", title: "表格 | 列名 | 列名 |", before: "| 列名 | 列名 |\n| --- | --- |\n| ", after: " |", placeholder: "内容" },
              { label: "链接", title: "链接 [文字](url)", before: "[", after: "](https://)", placeholder: "链接文字" },
              { label: "图片", title: "图片 ![描述](url)", before: "![", after: "](https://)", placeholder: "图片描述" },
            ].map(b => <button key={b.label} type="button" title={b.title} onClick={() => insertSyntax(b.before, b.after, b.placeholder)} className="admin-md-btn">{b.label}</button>)}</div>
            <div className={preview ? "admin-markdown split" : "admin-markdown"}><textarea id="markdown" ref={textareaRef} maxLength={200000} value={draft.content} onChange={e => edit("content", e.target.value)} placeholder={"# 从这里开始\n\n支持标题、列表、代码块、表格和图片链接。"} spellCheck={false}/>{preview && <div className="admin-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{draft.content || "*Markdown 实时预览*"}</ReactMarkdown></div>}</div>
            {showHint && <details className="admin-md-hint" open><summary>Markdown 语法速查</summary><table><thead><tr><th>类型</th><th>写法</th></tr></thead><tbody>{[
              ["加粗", "**文字**"], ["斜体", "*文字*"], ["删除线", "~~文字~~"],
              ["标题", "# 一级\n## 二级\n### 三级"],
              ["引用", "> 引用内容"], ["无序列表", "- 列表项"], ["有序列表", "1. 列表项"],
              ["行内代码", "`代码`"], ["代码块", "```语言\n代码\n```"],
              ["表格", "| 列 | 列 |\n|---|---|\n| 内容 | 内容 |"],
              ["链接", "[文字](https://)"], ["图片", "![描述](https://)"],
              ["任务列表", "- [x] 已完成\n- [ ] 未完成"],
              ["分割线", "---"],
            ].map(([type, sample]) => <tr key={type}><td>{type}</td><td><code>{sample}</code></td></tr>)}</tbody></table></details>}
            <div className="admin-save"><span>{draft.content.length.toLocaleString()} 字符</span>{draft.id && <button type="button" className="admin-danger" onClick={remove}>删除文章</button>}<button className="admin-primary" type="submit">{busy ? "处理中…" : "保存文章"}</button></div>
          </fieldset></form>
        </section>
      </div>}
  </main>;
}
