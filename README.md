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
```

```sh
npm run dev
```

```sh
npm run build
```

## 在 GitHub Pages 上在线管理文章（写回 GitHub 仓库）

GitHub Pages 是静态托管，网页本身不能直接写文件。这里用 Cloudflare Workers 代你调用 GitHub API，把改动提交到仓库的 `src/posts/`。

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

# 必填：仓库信息（你的默认分支是 master）
wrangler deploy --var OWNER=MarshVer --var REPO=<你的仓库名> --var BRANCH=master
```

部署完成后，你会得到一个 Worker URL，例如：`https://blog-admin.<your>.workers.dev`。

### 2) 配置 GitHub Actions 自动部署 Pages

本仓库已添加工作流：`.github/workflows/pages.yml`（push 到 `master` 自动构建并部署）。

在 GitHub 仓库 Settings：

- Pages → Build and deployment → Source 选择 `GitHub Actions`
- Settings → Secrets and variables → Actions → Variables 新增：
  - `VITE_ADMIN_API_BASE`：填你的 Worker URL（不带末尾 `/`）

### 3) 使用在线管理页

部署到 Pages 后，访问：

- `https://marshver.github.io/admin`

首次进入点击右侧“密钥”，输入你在 Worker 中设置的 `ADMIN_KEY`，然后就可以新建/保存/删除文章了（写入仓库的 `src/posts/`）。
