# NILING_DUSK 管理后台

## 初始化

1. 在 Authentication → Users → Add user 中创建管理员的邮箱密码账号（确认邮箱）。
2. 打开根目录的 `data.sql`，修改末尾 `admin_email` 的值。默认值为 `person_blog@nilingdusk.com`。
3. 在 Supabase SQL Editor 中确认执行角色为 `postgres`，然后一次性执行完整的 `data.sql`。不要使用 `authenticated` 角色，也不要向它授予 `auth.users` 或 `blog_admins` 的插入权限。
4. 脚本会一次性完成建表、索引、触发器、RLS、公开文章读取权限、Storage 图床和管理员授权。脚本可重复执行，不会删除或覆盖已有文章。
5. 如果执行结果提示没有找到管理员邮箱，先创建对应 Auth 用户，再重新执行完整脚本即可。
6. 本地 `.env.local` 已配置项目 URL 和 publishable key，该文件不提交到 Git。部署时设置：
   - `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目根 URL，不能带 /rest/v1。
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`：项目 publishable key。
7. 安装依赖并启动：`npm install`、`npm run dev`，访问 `/admin` 登录。

无需也不要把 service_role 或 secret key 放进客户端。publishable key 本身不赋予管理员权限；访问由 Auth 会话和 RLS 策略保护。建议在 Supabase Auth 设置中关闭不需要的公开注册。

## GitHub 与 Vercel

- `.env.local` 已由 Git 忽略，不能提交到 GitHub。仓库只提交不含真实值的 `.env.example`。
- 在 Vercel 项目的 Environment Variables 中配置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，并勾选 Production、Preview 和 Development。
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 会被 Next.js 放入浏览器代码，这是 Supabase publishable key 的设计用途，并不是管理员密钥。数据库安全由 `data.sql` 中的 RLS 策略保证。
- 任何 `service_role`、secret key 或数据库密码都不能添加 `NEXT_PUBLIC_` 前缀，也不能写入本项目的客户端代码。
- 在 Supabase Authentication → URL Configuration 中，把 Vercel 正式域名加入 Site URL 和 Redirect URLs。

## 使用

- 新建、编辑、保存、删除文章；支持摘要、分类、唯一 URL 路径和草稿/发布状态。
- Markdown 支持 GFM 表格、任务列表、代码块与图片；不解析原始 HTML，避免脚本注入。
- 封面可粘贴外部 HTTPS 图床链接，或上传到 `blog-covers` Storage 图床。仅接受 JPEG、PNG、WebP、GIF，最大 5MB；链接公开可访问，请勿上传私密图片。
- 上传后仍需保存文章。清除封面和删除文章不会删除图床文件，以免影响其他引用；可在 Supabase Storage 控制台清理未使用的文件。
- 公开首页从数据库读取已发布文章，支持分类、搜索和完整 Markdown 阅读。将文章保存为“已发布”后，访客刷新首页即可看到；改回草稿后不再对新请求开放。
- 管理员可以管理所有文章，访客只能读取已发布文章。没有管理员账号时无法完成登录、保存和上传的端到端验证。

## 权限检查

执行 SQL 后建议用三个角色验证：

1. 未登录：只能查询已发布文章，草稿不可见，不允许写入或上传。
2. 普通 Auth 用户：后台拒绝访问，直接查询只能读取已发布文章，写入及上传被策略拒绝。
3. 已加入 blog_admins 的用户：可以增删改查文章并上传封面。

SQL 可重复执行；不创建默认密码、示例文章，仅向匿名用户开放已发布文章的查询权限。撤销管理员只需删除对应 blog_admins 记录，后续数据库请求立即受限。

## 开场动画

首页使用 public/开场动画.png 播放约 3.6 秒的全屏开场动画，可点击跳过或按 Esc 关闭。遵循系统减少动态效果偏好；JavaScript 不可用时不会阻挡页面。
