/** 已发布文章的读取与校验，供阅读页与元数据共用。 */

export type PublishedPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  created_at: string;
  excerpt: string;
  cover_url: string;
  content: string;
};

/** 与 data.sql 中 slug 约束一致。 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** 按 slug 读取已发布文章；无效 slug 或不存在时返回 null。 */
export async function getPublishedPost(
  slug: string,
): Promise<PublishedPost | null> {
  if (!isValidSlug(slug)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const response = await fetch(
    `${url}/rest/v1/blog_posts?select=id,title,slug,category,created_at,excerpt,cover_url,content&status=eq.published&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const rows: PublishedPost[] = await response.json();
  return rows[0] ?? null;
}

/** 按正文长度估算阅读分钟数。 */
export function readingMinutes(content: string): number {
  return Math.max(1, Math.ceil(content.length / 500));
}
