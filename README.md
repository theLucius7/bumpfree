# BumpFree

面向高校班级、社团和项目组的多人课表协作工具：导入课程、创建 Room、邀请成员，在同一日历查看课程与临时忙碌时段。

线上站点：[bumpfree.lucius7.dev](https://bumpfree.lucius7.dev)

## 当前架构

| 组件                             | 用途                                                   |
| -------------------------------- | ------------------------------------------------------ |
| Cloudflare Pages                 | Next.js 16 静态导出、页面与浏览器解析器                |
| Cloudflare Worker `bumpfree-api` | 同源 `/api/*`：登录、权限校验、业务接口                |
| Cloudflare D1 `bumpfree`         | 用户、会话、课表、课程、Room、成员、邀请及人工处理附件 |
| 浏览器 Web Worker                | 解析 ICS；确认预览后只上传结构化课程，不保存原始 ICS   |

无需 Supabase、WakeUp 口令、Vercel、付费数据库或 R2。没有运行时 Next.js 服务端或 Server Actions。静态页面不含账号数据；Worker 对每个读写接口检查身份和所有权。

## 使用方式

1. 注册账号，**立即保存一次性恢复码**，然后登录。
2. 在“我的课表”选择 ICS，核对第 1 周周一、学期周数、课程时间、老师和地点，再确认导入。
3. 创建 Room，按昵称搜索并邀请已注册用户。对方接受后，其当前启用的课表会出现在共享日历。
4. Room 默认为私密。房主可以开启公开只读分享；公开访问不显示成员邮箱和 busy 的私人标题、备注。
5. 可管理多个课表、切换当前课表、手动编辑课程，以及添加一次性 busy 时间。

邮箱只是**未经验证的登录标识**。本站不发送验证邮件、邀请邮件或找回密码邮件。管理员邀请生成 7 天有效的单次激活链接，需要管理员私下转交。找回密码使用恢复码，每次使用后换发新码并撤销旧会话。详细安全边界见 [SECURITY.md](SECURITY.md)。

### ICS 导入边界

- 读取 `SUMMARY`、`DTSTART/DTEND` 或小时/分钟 `DURATION`、`LOCATION`、备注。老师从 `X-TEACHER` 或备注中的“教师/老师/Teacher/Instructor:”读取；文件没有该字段就显示“未提供”，不猜测。
- 支持日/周/月/年 RRULE、单双周、RDATE（含 PERIOD）、EXDATE、同 UID 的 RECURRENCE-ID 精确调课，以及同一时区的 THISANDFUTURE。冲突的相同 UID 修订按 SEQUENCE/修改时间选择。
- 支持 UTC、IANA 时区、文件中的 VTIMEZONE；无时区的时间使用文件时区或默认北京时间。精确 UTC 调课保留绝对时刻；内嵌 VTIMEZONE 的折返有独立回归。
- 输出课表默认使用 Asia/Shanghai；日历按查看者设备时区显示。默认西南石油大学 2026–2027 秋季第 1 周周一为 **2026-08-31**，共 20 周，导入前可改。以 ICS 实际日期为准，不推测额外停课或补课。
- 透明全天提醒跳过并提示；占用全天、跨午夜、秒级、不存在的夏令时时刻、跨时区 THISANDFUTURE 等暂不支持的情况会明确拒绝，不静默改时间。
- 单文件最多 2 MiB、2000 条 VEVENT、5000 次实际课程，最终每份课表最多 500 条周次记录。解析在独立浏览器线程中进行，5 秒超时终止。
- 默认“覆盖同名课表”，重复导入不会增加副本。覆盖前有确认；数据库事务保证失败时保留旧课表。也可显式新建副本。

“其他导入方式与人工处理”保留了标准/松散文本、HTML、DOCX、XLS/XLSX/CSV/TXT 抽取及人工处理。自动抽取文件最多 5 MiB，人工处理附件最多 2 MiB。复杂办公文件仍可能触及 Workers Free CPU 限制，优先使用浏览器解析的 ICS。PDF 服务端解析与自动 OCR 未开放。

## 免费额度与容量

在 Workers Free 计划下，D1 有每日 500 万行读取、10 万行写入、账号合计 5 GB 的免费额度；**单个免费数据库最多 500 MB**。超出免费限制时会返回错误，不会自动切换到付费。额度按账号共享，索引与限流计数也消耗读写次数。[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。

Workers Free 有每日 10 万次请求和每次 10 ms CPU 限制。普通静态资源由 Pages 提供；本项目没有主动开通 Workers Paid 或绑定 R2。小规模课程与 Room 数据通常很小，但附件会较快占满单库空间；不能承诺无限人数或无限流量免费。[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)。

## 本地开发

推荐 Node.js 22（`.nvmrc`）和 npm：

```bash
npm ci
cp .dev.vars.example worker/.dev.vars
```

给 `worker/.dev.vars` 填入独立的本地 `AUTH_PEPPER`（32 随机字节的 64 位十六进制），并让 `SITE_URL`、`DEV_ORIGIN` 与开发地址一致，例如 `http://localhost:3000`。生成命令：

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
npm run db:local
```

分别启动两个终端：

```bash
npm run dev:api
npm run dev
```

前端开发服务器把 `/api/*` 转发到本地 8787 端口。非默认前端端口必须同步修改本地 `DEV_ORIGIN`。不要把 `DEV_ORIGIN` 部署到生产。

前端不需要任何密钥。`npm start` 只预览 `out/` 静态资源，不会启动完整 API；完整本地开发请用上述两个终端。

## 部署与维护

本仓库当前绑定指定的 `bumpfree` 数据库和域名。部署到另一个账号前，必须替换 `worker/wrangler.jsonc` 中的数据库 UUID、名称、SITE_URL 和 routes，并修改页面 metadata 与 `PrimaryDomainRedirect` 的正式域名。

1. 复制 `.env.cloudflare.example` 为 `.env.cloudflare`，填入账号 ID 与仅覆盖目标账号/域名的 API Token。命令包装器会自动读取它；CI 也可直接提供同名环境变量。
2. 首次部署创建 D1 和 Pages 项目，将真实 D1 UUID 写入配置。数据库迁移与发布是两步，必须先执行迁移：

   ```bash
   npm run db:remote
   ```

3. 使用 `wrangler secret put AUTH_PEPPER --config worker/wrangler.jsonc` 设置**独立的生产**随机密钥。它不是 Cloudflare API Token，不能在每次部署时重新生成；必须安全备份。CLI 可通过 `node scripts/wrangler.mjs secret put AUTH_PEPPER --config worker/wrangler.jsonc` 自动读取本地 Cloudflare 凭据。
4. 首次域名启用时：先部署 Pages、关联自定义域名、添加指向 `bumpfree.pages.dev` 的代理 CNAME，等待域名与证书 active，再启用 `bumpfree.lucius7.dev/api/*` Worker route。不要让 Worker Custom Domain 接管整个主机名；Pages 负责页面，Worker 只负责 API。
5. 后续发布：

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npm run db:remote
   npm run deploy:api
   npm run deploy:web
   ```

6. 访问 `/api/health` 确认 D1 查询正常，然后测试注册/登录和一次 ICS 导入。Pages 的默认与预览域名没有独立 API，页面会在浏览器跳回正式域名。旧 `/room/<uuid>` 链接由 Pages 重写兼容；新分享链接为 `/room/?id=<uuid>`。

GitHub Actions 运行依赖审计、lint、typecheck、解析器回归、真实 workerd + D1 集成测试、静态构建及 Worker dry-run。**推送代码不会自动部署线上**；当前发布使用上面的显式命令，不把账号 Token 存入仓库。

### 管理员引导

新注册者永远是普通用户，不存在“首个注册者自动成为管理员”。

部署者在可信终端生成私密管理员激活链接：

```bash
npm run admin -- invite owner@example.com "Site owner"
```

命令需要 `.env.cloudflare` 和已上线的认证 API，不会发送邮件。账号若已激活，命令拒绝自动提升权限；核实账号归属后，以其确切 UUID 显式提升：

```bash
npm run admin -- promote <existing-user-uuid>
```

公开注册的邮箱未经验证，不得仅因对方用了某个邮箱就认定其身份。激活链接和恢复码等同于凭据，不能粘贴到 Issue、日志或公开聊天。

### 数据、备份与回滚

- D1 迁移仅在 `worker/migrations/`；编号顺序执行。数据库重新部署不会清空数据。每日定时任务只清理过期会话、限流桶与激活链接。
- 旧 `supabase/` SQL 仅作历史参考，不再被应用、构建或迁移执行。原 Supabase 数据库未被读取、修改或删除；本次新建 D1 **不等于已经迁移旧账号与历史数据**。如需搬迁，应先取得导出、做字段映射/导入验证；旧 Auth 凭据不能直接拿来登录本版。
- 数据库变更前导出备份，使用 D1 的 [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) 或经过验证的导出恢复。不要运行旧的破坏性 reset 脚本。备份包含私人课表与凭据验证数据，必须放在仓库之外并限制读取权限。
- Pages/Worker 回滚要使用与当前 D1 schema 兼容的版本。恢复数据库不是普通发布步骤，不要在自动化中删除/重建生产表。
- `.env.cloudflare`、`.env.auth`、`worker/.dev.vars`、原始用户文件、管理员链接、构建日志与本地 SQLite 状态均不应提交。泄露过的 Cloudflare API Token 应轮换；**不要把 API Token 轮换与 AUTH_PEPPER 轮换混为一谈**。

## 测试

`npm test` 仅使用内存数据库和虚构课程，不读取部署凭据。覆盖普通文本/HTML/办公文件防护、ICS 时区/重复/例外、身份隔离、会话失效、配额、并发邀请、过期重签、晚失败事务回滚与附件权限。

可选的生产端到端接口测试会创建明确标记的临时账号，最后仅按本轮记录的确切 ID/邮箱清理其数据；需要部署者显式启用：

```bash
SMOKE_WRITES=yes node --import tsx scripts/smoke-production.ts
```

此检查会消耗少量 Cloudflare 免费额度；不要高频运行或把真实个人文件放入测试。完整浏览器测试还应覆盖文件选择、预览、确认保存、Room 日历、移动端导航及恢复码保存提示。生产实测不代表所有规模都不会触及免费 CPU/存储限制。

## 技术栈与贡献

Next.js 16.3.3、React 19.2、TypeScript、Tailwind CSS 4、shadcn/ui、react-big-calendar、date-fns、ical.js 2.2.1、Cloudflare Workers/D1/Pages。Next 与 eslint-config-next 精确同步；ical.js 精确锁定是因为 VTIMEZONE 适配依赖其转移数据结构，升级必须运行 DST 回归。SheetJS 使用官方 0.20.3 tarball，不退回 npm registry 中过时的 0.18.5。

欢迎 Issue / Pull Request。涉及依赖、数据库或认证协议的变更，请同时更新 lockfile、说明和回归测试。

特别感谢 [@zalataraglados-prog](https://github.com/zalataraglados-prog) 在 [PR #1](https://github.com/theLucius7/bumpfree/pull/1) 中提出并实现课表导入、课程管理、忙碌时段、Room 协作与管理员配置等改进方向。相关贡献保留在此版本的演进中。
