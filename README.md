# NILING_DUSK Blog

基于 Next.js 与 Supabase 的个人博客，包含公开文章首页、Markdown 阅读、管理员后台、文章管理与封面图床。

## 本地运行

复制 `.env.example` 为 `.env.local`，填写 Supabase 项目 URL 和 publishable key，然后运行：

```bash
npm install
npm run dev
```

数据库初始化与管理员授权参见 [ADMIN_SETUP.md](./ADMIN_SETUP.md)，完整 SQL 位于 [data.sql](./data.sql)。

## 部署

导入 GitHub 仓库到 Vercel，并在项目环境变量中配置：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

不要提交 `.env.local`，也不要在客户端使用 Supabase `service_role` 或 secret key。

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
