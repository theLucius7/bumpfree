# 部署与维护

[返回 README](../README.md) · [架构说明](architecture.md) · [安全边界](../SECURITY.md)

## 部署结构

本项目使用 Cloudflare Pages 托管 Next.js 静态导出，Worker 处理同一域名下的 `/api/*`，D1 保存业务数据。当前生产站点是 [bumpfree.lucius7.dev](https://bumpfree.lucius7.dev)。不需要运行时 Next.js 服务端、Vercel、Supabase 或 R2。

GitHub Actions 只执行检查和构建，**推送代码不会自动部署生产**。

## 本地开发

使用 Node.js 22（见 `.nvmrc`），执行 `npm ci`，复制 `.dev.vars.example` 到 `worker/.dev.vars`。

配置独立的本地 `AUTH_PEPPER`，以及 `SITE_URL=http://localhost:3000`、`DEV_ORIGIN=http://localhost:3000`。生成 pepper：

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
npm run db:local
```

分别运行 `npm run dev:api` 与 `npm run dev`。前端将 `/api/*` 转发到本地 8787 端口。更改前端端口时必须同步更改 `DEV_ORIGIN` 和 `SITE_URL`。不要将 `DEV_ORIGIN` 部署到生产。

本地开发无需 Cloudflare API Token。`npm start` 仅预览已构建的 `out/` 静态文件，不会启动完整 API。

## 首次部署到自己的账号

仓库当前包含维护者的数据库 UUID 和域名配置。Fork 后请先替换配置，不要直接对原项目执行部署命令。

1. 复制 `.env.cloudflare.example` 为 `.env.cloudflare`，填入目标账号 ID 与限制到所需账号、D1、Pages、Worker 和域名资源的 API Token。包装脚本会读取此文件；自动化环境也可直接提供同名环境变量。不要提交真实文件。
2. 在目标账号创建 D1 数据库与 Pages 项目。若保留项目名 `bumpfree`，可运行：

   ```bash
   node scripts/wrangler.mjs d1 create bumpfree
   node scripts/wrangler.mjs pages project create bumpfree --production-branch main
   ```

3. 替换以下配置：

   | 文件                                   | 必须核对                                                      |
   | -------------------------------------- | ------------------------------------------------------------- |
   | `worker/wrangler.jsonc`                | D1 UUID/名称、Worker 名称、`SITE_URL`、`routes` 的域名与 zone |
   | `package.json`                         | D1 命令中的数据库名、Pages 发布命令中的项目名（若改名）       |
   | `app/layout.tsx`                       | `metadataBase` 与正式站点地址                                 |
   | `components/PrimaryDomainRedirect.tsx` | Pages 默认/预览域名及正式域名                                 |

4. 先执行数据库迁移，再发布代码：

   ```bash
   npm run db:remote
   node scripts/wrangler.mjs secret put AUTH_PEPPER --config worker/wrangler.jsonc
   npm run build
   npm run deploy:web
   ```

   为生产生成并安全备份独立 pepper。它不是 Cloudflare API Token，**不能在每次部署时重新生成**；错误轮换会使已有账号验证值失效。

5. 为 Pages 项目关联自定义域名，并按 Cloudflare 提示配置 DNS。使用 Cloudflare 托管的 DNS 时，配置指向 `<你的项目名>.pages.dev` 的代理 CNAME。等待域名和证书生效后运行 `npm run deploy:api`，启用 `你的域名/api/*` Worker route。
6. 不要使用 Worker Custom Domain 接管整个主机名：Pages 负责页面，Worker route 只负责 API。访问 `https://你的域名/api/health`，确认 D1 查询正常，再验证注册、登录和一次 ICS 导入。

Pages 默认及预览域名不提供独立 API，浏览器会跳回配置的正式域名。旧 `/room/<uuid>` 链接由 Pages 重写兼容；新分享链接使用 `/room/?id=<uuid>`。

## 后续发布

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run db:remote
npm run deploy:api
npm run deploy:web
```

本仓库没有配置自动生产发布，亦不需要 Vercel 发布工作流。Cloudflare 发布凭据只用于显式发布步骤，不进入前端 bundle。

## 管理员引导

所有公开注册的账号都是普通用户，不存在“首位用户自动成为管理员”。

部署者在可信终端生成单次管理员激活链接：

```bash
npm run admin -- invite owner@example.com "Site owner"
```

此命令需要 `.env.cloudflare` 与已上线的认证 API，不发送邮件。链接有效期为 7 天，请私下交给确认过身份的接收者。

若账号已经激活，命令不会自动提升权限。核实归属后，使用确切用户 UUID：

```bash
npm run admin -- promote <existing-user-uuid>
```

邮箱未经验证，不得仅凭邮箱名称认定身份。不要在 Issue、公共日志或公开聊天中粘贴激活链接和恢复码。

## 免费额度与容量

下列额度按 **Workers Free** 计划说明，核对日期：2026-08-30。以 Cloudflare 官方最新说明及账号实际计划为准。

| 资源        | 免费额度 / 限制                |
| ----------- | ------------------------------ |
| D1 行读取   | 每日 500 万行                  |
| D1 行写入   | 每日 10 万行                   |
| D1 存储     | 账号合计 5 GB；单库最多 500 MB |
| Worker 请求 | 每日 10 万次                   |
| Worker CPU  | 每次请求 10 ms                 |

Free 档超额会受限或返回错误，不会自动升级付费。额度由同一账号的项目共享；索引、会话和限流计数也消耗读写次数，附件会较快占用单库空间。复杂办公文件抽取可能触及 CPU 限制，优先使用浏览器解析的 ICS。

参考：[D1 计费](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 限制](https://developers.cloudflare.com/d1/platform/limits/) · [Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)。免费额度并不是可用性保证，也不代表无限人数或无限流量。

## 数据、备份与回滚

- D1 迁移只在 `worker/migrations/`，按编号顺序执行。重新发布应用不会清空数据库。每日定时任务仅清理过期会话、限流桶与激活链接。
- `supabase/` 是 1.x 历史参考，不再参与构建、运行或部署。新建 D1 不等于已经迁入旧账号与历史数据；原 Supabase 数据库未被迁移操作读取、修改或删除。
- 如需搬迁旧数据，先取得授权导出、建立字段映射并验证导入；旧 Auth 凭据不能直接用于本版。不要执行历史破坏性 reset 脚本。
- 数据库变更前备份，使用 D1 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) 或经过验证的导出恢复。备份含私人课表与凭据验证数据，必须放在仓库之外并限制访问。
- Pages/Worker 回滚版本必须与当前 D1 schema 兼容。恢复数据库不是普通发布步骤，不要在自动化里删除或重建生产表。
- `.env.cloudflare`、`.env.auth`、`worker/.dev.vars`、原始用户文件、管理员链接、SQLite 状态和构建日志不得提交。泄露过的 API Token 应轮换；不要将它与 `AUTH_PEPPER` 的受控轮换混淆。

## 验证上线

CI 覆盖依赖审计、lint、类型检查、UTC/上海/纽约时区回归、真实 workerd + D1 集成测试、静态构建和 Worker dry-run；它不代表完成了生产发布。

可选生产接口测试会创建本轮专用的临时账号，随后仅按记录的确切 ID/邮箱清理其数据。需部署者显式启用，且会消耗免费额度：

```bash
SMOKE_WRITES=yes node --import tsx scripts/smoke-production.ts
```

不要高频运行或使用真实私人文件。浏览器验收还应包括文件选择、预览、确认保存、Room 日历、移动端导航及恢复码提示。
