# 个人博客（Vue 3 + Vite）

一个简单的个人博客项目：

- 首页按日期分组展示文章标题
- 点击标题进入文章详情页，渲染 Markdown 内容
- UI 基于 Element Plus

## 添加文章

在 `src/posts/` 新建 `*.md` 文件，建议使用 frontmatter：

```md
---
title: 我的标题
date: 2026-01-26
---

# 正文从这里开始
```

## 运行

```sh
npm install
npm run dev
```

## 构建

```sh
npm run build
```

## 在 GitHub Pages 上在线管理文章（写回 GitHub 仓库）

GitHub Pages 是静态托管，网页本身不能直接写文件。这里用 Cloudflare Workers 代你调用 GitHub API，把改动提交到仓库的 `src/posts/`。

该模式适用于个人使用：
- 前端：GitHub Pages（展示 + 管理界面）
- 后端：Cloudflare Worker（持有 GitHub Token，负责提交 commit）
- 部署：GitHub Actions（仓库有新 commit 后自动重新 build 并发布 Pages）

说明：本项目使用 `vue-router` 的 history 模式。为兼容 GitHub Pages 直接访问 `/posts/xxx` 这类路由，工作流会把 `dist/index.html` 复制为 `dist/404.html`（SPA fallback）。

### 1) 部署 Cloudflare Worker

目录：`workers/`

用 wrangler 部署（示例）：

```sh
cd workers
wrangler login

# 必填：GitHub Token（建议 Fine-grained PAT，仅授权此仓库 Contents: Read and write）
wrangler secret put GITHUB_TOKEN

# 必填：管理密钥（你自己设置的强口令，用于保护写接口）
wrangler secret put ADMIN_KEY

# 必填：仓库信息（你的默认分支是 main）
wrangler deploy --var OWNER=MarshVer --var REPO=marshver.github.io --var BRANCH=main
```

部署完成后，你会得到一个 Worker URL，例如：`https://blog-admin.<your>.workers.dev`。

### 2) 配置 GitHub Actions 自动部署 Pages

本仓库已添加工作流：`.github/workflows/pages.yml`（push 到 `main` 自动构建并部署）。

在 GitHub 仓库 Settings：

- Pages → Build and deployment → Source 选择 `GitHub Actions`
- Settings → Secrets and variables → Actions → Variables 新增：
  - `VITE_ADMIN_API_BASE`：填你的 Worker URL（不带末尾 `/`）

### 3) 使用在线管理页

部署到 Pages 后，访问：

- `https://marshver.github.io/admin`

首次进入点击右侧“密钥”，输入你在 Worker 中设置的 `ADMIN_KEY`，然后就可以新建/保存/删除文章了（写入仓库的 `src/posts/`）。

注意：写入仓库后，需要等待 GitHub Actions 重新构建并部署完成，站点内容才会更新（通常 1-2 分钟）。
