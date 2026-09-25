import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getPublishedPost,
  readingMinutes,
} from "@/lib/posts";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) {
    return { title: "文章未找到 | NILING_DUSK" };
  }
  return {
    title: `${post.title} | NILING_DUSK`,
    description:
      post.excerpt ||
      "NILING_DUSK 的个人博客，分享加密货币、美股投资与软件工程的学习、研究与思考。",
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const cover = post.cover_url || "/首页顶部图片.png";
  const date = post.created_at.slice(0, 10);
  const minutes = readingMinutes(post.content);

  return (
    <div className="site post-site">
      <header className="header">
        <div className="container header-inner">
          <Link className="brand" href="/">
            <span className="logo" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            NILING_DUSK
          </Link>
          <span className="brand-description">
            Crypto <i>•</i> Stocks <i>•</i> Engineering
          </span>
          <nav aria-label="主导航">
            <Link href="/">首页</Link>
            <Link href="/#articles">文章</Link>
            <Link href="/#about">关于我</Link>
          </nav>
        </div>
      </header>

      <main className="container post-reading">
        <Link className="post-reading-back" href="/#articles">
          ← 返回文章列表
        </Link>

        <article>
          <div className="post-reading-cover">
            <Image
              src={cover}
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 860px"
              unoptimized
              priority
            />
          </div>

          <header className="post-reading-head">
            <span className="badge">{post.category}</span>
            <h1>{post.title}</h1>
            <p className="post-reading-byline">
              NILING_DUSK · {date} · {minutes} 分钟阅读
            </p>
            {post.excerpt ? (
              <p className="post-reading-excerpt">{post.excerpt}</p>
            ) : null}
          </header>

          <div className="public-prose post-reading-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
              {post.content}
            </ReactMarkdown>
          </div>
        </article>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <Link className="brand" href="/">
            <span className="logo" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            NILING_DUSK
          </Link>
          <span className="footer-tagline">Better Ideas. Higher Compound.</span>
          <nav aria-label="页脚导航">
            <Link href="/">首页</Link>
            <Link href="/#articles">文章</Link>
            <Link href="/#about">关于我</Link>
          </nav>
          <span className="copyright">© 2026 NILING_DUSK</span>
        </div>
      </footer>
    </div>
  );
}
