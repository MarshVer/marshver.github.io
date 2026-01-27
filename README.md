# 个人博客（Vue 3 + Vite）

一个简单的个人博客项目：

- 首页展示文章列表（支持搜索/分页），显示摘要
- 归档页按年份展示文章
- 点击标题进入文章详情页，渲染 Markdown 内容
- 支持在线管理文章（/admin）：编辑/保存/删除，远程模式写回 GitHub 仓库并触发 Pages 自动部署

## 目录结构（你会用到的）

- `src/posts/`：文章（Markdown）源码
- `src/views/AdminView.vue`：管理页（/admin）
- `workers/`：Cloudflare Worker（用 GitHub API 写回仓库）
- `.github/workflows/pages.yml`：GitHub Actions（自动 build 并部署到 GitHub Pages）
- `.github/workflows/posts-index.yml`：GitHub Actions（当 `src/posts/*.md` 变更时自动生成 `src/posts/index.json` 并提交回 main）

补充说明：

- 构建时会生成文章元数据列表（slug/title/date/excerpt），用于首页/归档/管理列表
- 文章正文按 `slug` 动态加载（Vite code-splitting），并按年份合并 chunk（减少请求数）
- 远程管理使用 `src/posts/index.json` 作为文章列表索引（避免 Worker 的 N+1 读取）；索引会由：
  - 在线管理（Worker 写入时原子更新 md + index.json）
  - 或 `posts-index.yml`（当你手动改 md 时自动更新 index.json）

## 部署到 GitHub Pages（main 分支）

前提：你的仓库名是 `marshver.github.io`，默认分支是 `main`。

### 0) 这套“在线管理文章”的工作方式

GitHub Pages 只能托管静态文件，网页本身不能直接写文件。

所以这里采用：

1. 你在网页 `/admin` 编辑文章
2. 前端把请求发给 Cloudflare Worker
3. Worker 使用 GitHub API 把改动提交 commit 到仓库的 `src/posts/`
4. GitHub Actions 监听 `main` 分支 push，自动 `npm run build` 并部署 Pages
5. 部署完成后，站点内容更新（通常 1-2 分钟）

重要说明：本项目使用 `vue-router` 的 history 模式。为避免 GitHub Pages 直接访问 `/posts/xxx` 返回 404，工作流会把 `dist/index.html` 复制为 `dist/404.html`（SPA fallback）。

---

## 1) 先部署 Cloudflare Worker（写回 GitHub）

### 1.1 准备 GitHub Token（Fine-grained PAT）

在 GitHub：Settings → Developer settings → Personal access tokens → Fine-grained tokens

- Repository access：只选择 `marshver.github.io`
- Permissions：
  - Contents: Read and write
- 建议设置过期时间（方便定期轮换）

生成后复制保存（只会显示一次）。

### 1.2 安装并登录 wrangler

如果你没装过：

```sh
npm install
```

登录：

```sh
cd workers
npx wrangler login
```

### 1.3 配置 Worker 的 secrets / vars

在 `workers/` 目录执行：

```sh
# GitHub Token（上一步生成的 Fine-grained PAT）
npx wrangler secret put GITHUB_TOKEN(运行命令等待终端提示输入GITHUB_TOKEN的值)

# 你自己设置的强口令（管理密钥），用于保护写接口
npx wrangler secret put ADMIN_KEY(运行命令等待终端提示输入ADMIN_KEY的值)

# 部署
npx wrangler deploy --name blog-admin
```

部署完成后，wrangler 会输出 Worker URL，例如：

- `https://blog-admin.<your>.workers.dev`

把这个 URL 记下来，下一步要用。

---

## 2) 配置 GitHub Pages（用 Actions 部署）

### 2.1 开启 Pages 的 Actions 部署

GitHub 仓库：Settings → Pages

- Build and deployment → Source 选择 `GitHub Actions`

### 2.2 配置 Actions 变量（非常关键）

GitHub 仓库：Settings → Secrets and variables → Actions → Variables

新增变量：

- Name：`VITE_ADMIN_API_BASE`
- Value：填你的 Worker URL（不带末尾 `/`），例如：
  - `https://blog-admin.<your>.workers.dev`

这个变量会在 Actions 构建时注入到前端：

- 只有配置了 `VITE_ADMIN_API_BASE`，生产环境才会启用 `/admin` 并走远程 Worker。

---

## 3) 推送 main 分支，触发首次部署

把代码 push 到 `main` 分支后：

- GitHub → Actions 里会看到 `Deploy GitHub Pages` 工作流运行
- 运行成功后，访问：
  - `https://marshver.github.io/`

如果你改动了 `src/posts/`，也会触发重新部署。

---

## 4) 使用在线管理页（/admin）

1. 打开：`https://marshver.github.io/admin`
2. 右侧点“密钥”，输入你在 Worker 设置的 `ADMIN_KEY`
3. 现在你可以：
   - 新建文章（会在 `src/posts/` 生成 `时间戳.md`）
   - 编辑并保存（会提交到 GitHub）
   - 删除（会提交到 GitHub）
4. 保存/删除后：等待 GitHub Actions 部署完成，主页/归档/文章页才会看到更新

提示：

- 401 Unauthorized：密钥不对或没设置（重新点“密钥”输入）
- CORS 报错：确认你是从 `https://marshver.github.io` 访问，或把自定义域名加入 Worker 的允许列表

---

## 5) 本地开发（可选）

### 5.1 纯本地写文件模式（开发时）

```sh
npm install
npm run dev
```

本地开发默认端口：`http://localhost:1117/`。

本地开发时 `/admin` 默认可用，并通过 Vite dev server 的本地接口写入 `src/posts/`。

如果你是“手动编辑/新增 Markdown 文件”，建议顺手执行一次：

```sh
npm run gen:posts-index
```

### 5.2 本地连远程 Worker（可选）

PowerShell：

```powershell
$env:VITE_ENABLE_ADMIN='true'
$env:VITE_ADMIN_API_BASE='https://blog-admin.<your>.workers.dev'
npm run dev
```

---

## 6) 安全建议（强烈建议看一眼）

- 不要把 GitHub Token 写进前端代码；只放在 Worker 的 secret
- `ADMIN_KEY` 请设置复杂一点；只在你自己的浏览器里输入
- Token 建议设置过期时间，并定期轮换
