# BumpFree

BumpFree 是面向高校班级、社团和项目组的多人课表协作工具。它把成员的课程与临时忙碌时间汇总到 Room 日历中，帮助组织者快速找到共同空闲时段。

## 主要能力

- 管理课程、多个学期课表和一次性忙碌时段。
- 创建私有或公开 Room，邀请成员并按成员筛选聚合日历。
- 通过标准文本、松散文本和学校专用适配器预览、校正并导入课表。
- 在自动解析失败时提交文本或图片，交由管理员人工处理。
- 使用 Supabase Auth、PostgreSQL 与 Row Level Security 隔离用户数据。

## 课表导入格式与边界

| 来源 | 当前处理方式 | 注意事项 |
| --- | --- | --- |
| WakeUp | 在个人课表页粘贴完整分享消息或 32 位 key；服务端限时请求 WakeUp API，校验后安全覆盖同名学期 | 分享 key 可读取课表，应按敏感数据处理；不要写入日志或公开 Issue |
| BumpFree v1 / 普通文本 | 解析标准格式、中文或英文星期、12/24 小时时间及常见手机粘贴格式 | 导入前会显示课程、学期和周次预览 |
| HTML | 通用解析器可读取表格；另有厦门大学马来西亚分校 HTML 适配器 | HTML 必须包含可识别的课表表格结构 |
| PDF | 不在站内直接解析；先用本地工具或可信 AI 转成 UTF-8 文本，再粘贴或上传 TXT | 小体积 PDF 也可能包含超大压缩流；在没有进程级隔离前禁用服务端解析 |
| DOCX | 服务端用 `mammoth` 抽取纯文本，再交给选中的文本适配器 | 任意 Word 排版不保证能自动还原成课程，需要检查预览 |
| XLS / XLSX / CSV | 服务端用 SheetJS 将工作表转换为制表符分隔文本，再交给文本适配器 | 合并单元格和视觉布局可能需要人工整理 |
| TXT | 严格按 UTF-8 文本读取 | 无法识别时可改用人工处理入口 |
| 图片 | 可提交给管理员人工处理 | 当前没有自动 OCR；人工处理文件上限为 2 MB |

自动文件抽取支持 DOCX、XLS、XLSX、CSV、HTML 和 TXT，单文件上限为 5 MB；抽取结果最多 100,000 字符，工作簿最多 20 张工作表和 200,000 个有效范围单元格。页面实际允许选择的类型由启用的导入接口及其 `accepted_file_types` 决定，并不代表任意文件都能自动解析成课表。

## 技术栈

- Next.js 16.3.3（App Router、React Server Components、Server Actions、Turbopack）
- React 19.2、TypeScript 5、Tailwind CSS 4
- shadcn/ui、Radix UI、react-big-calendar、date-fns
- Supabase Auth、PostgreSQL、RLS
- Mammoth、SheetJS Community Edition

## 环境要求

- Node.js `>=20.16 <21 || >=22.3`；开发和 CI 推荐 Node.js 22。
- npm，并以仓库中的 `package-lock.json` 作为可复现安装依据。
- 一个 Supabase 项目。

仓库的 `.nvmrc` 固定到 Node.js 22：

```bash
nvm install
nvm use
```

## 本地启动

```bash
git clone https://github.com/theLucius7/bumpfree.git
cd bumpfree
nvm use
npm ci
cp .env.example .env.local
```

`npm ci` 适合按 lockfile 做干净安装；只有在主动调整依赖时才使用 `npm install`，并同时提交更新后的 `package-lock.json`。

编辑 `.env.local`：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`：真实运行环境必填。
- `NEXT_PUBLIC_SITE_URL`：认证回调基地址；生产环境应使用站点的 HTTPS 地址。
- `SUPABASE_SERVICE_ROLE_KEY`：管理员邀请和用户列表等服务端操作需要；它会绕过 RLS，绝不能使用 `NEXT_PUBLIC_` 前缀、发送到浏览器或提交到 Git。

启动开发服务器：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 数据库迁移顺序

在 Supabase SQL Editor 中逐个执行迁移，并确认当前文件成功后再继续。全新项目的正常顺序是：

1. [`001_init.sql`](./supabase/migrations/001_init.sql)
2. [`003_fix_rooms_recursion.sql`](./supabase/migrations/003_fix_rooms_recursion.sql)
3. [`004_busy_blocks.sql`](./supabase/migrations/004_busy_blocks.sql)
4. [`005_allow_room_members_read_comembers.sql`](./supabase/migrations/005_allow_room_members_read_comembers.sql)
5. [`006_import_interfaces.sql`](./supabase/migrations/006_import_interfaces.sql)
6. [`007_custom_import_interfaces.sql`](./supabase/migrations/007_custom_import_interfaces.sql)
7. [`008_manual_schedule_submissions.sql`](./supabase/migrations/008_manual_schedule_submissions.sql)
8. [`009_security_hardening.sql`](./supabase/migrations/009_security_hardening.sql)

已有环境只执行尚未应用的增量迁移，并保持上述顺序。编号 `002` 已从正常迁移链移除：破坏性恢复脚本位于 [`supabase/manual/reset_schema.sql`](./supabase/manual/reset_schema.sql)，会删除 BumpFree 的业务表和数据，不得交给自动迁移流程。只有在完成可验证备份并获得明确运维批准后才能手动执行；执行后必须重新应用完整迁移链。

为避免公开站点被“首个注册者”抢占管理员权限，新用户一律以普通用户创建。全新部署完成迁移后，先注册部署者账号，再审阅并手工执行 [`supabase/manual/bootstrap_superadmin.sql`](./supabase/manual/bootstrap_superadmin.sql)，显式填写该账号邮箱后完成一次性管理员引导。该脚本只允许在 Supabase SQL Editor 等受信任的 `postgres` 会话中运行；不要放入自动迁移、应用接口或客户端。已有环境中的管理员不会被 `009` 重选或降级。

## 工程命令

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript noEmit 检查
npm test           # 文本、HTML、WakeUp 与 XLSX 文件抽取回归测试
npm run build      # Next.js 生产构建
```

GitHub Actions 在 Node.js 22 上依次执行 `npm ci`、生产依赖审计、lint、typecheck、test 和 build。工作流中的 Supabase 值仅是编译占位符，不具备线上权限；部署时必须配置真实环境变量。

## 依赖与文件处理安全

- Next.js 与 `eslint-config-next` 精确锁定同一个安全补丁版本，升级时应同步修改并完整运行工程命令。
- npm registry 中的 `xlsx@0.18.5` 已过期且存在公开安全告警。本项目固定使用 SheetJS 官方 CDN 的 `0.20.3` tarball，并通过 lockfile integrity 校验；不要退回 npm registry 的旧包。
- DOCX 和工作簿都属于不可信输入。系统会在第三方解析器前实际、有界地校验 ZIP 解压数据，并限制工作表、单元格和输出文本；这些边界不能替代解析器安全更新、请求限流与内存监控。
- PDF 服务端直解析保持禁用，直至解析任务具备独立进程或容器的硬内存、CPU 和超时限制；不要仅靠文件大小或异步超时放开。
- WakeUp 分享 key 可读取分享课表，应视作敏感数据，不要写入日志、Issue 或公开测试夹具。
- 所有数据库表、函数和策略都应通过最新迁移验证 RLS；service-role key 只能在受控服务端代码中使用。
- `.env.local`、真实密钥、用户课表和上传文件不得提交到仓库。

## 部署到 Vercel

1. 导入 GitHub 仓库并选择 Node.js 22。
2. 配置真实的 Supabase 与站点 URL 环境变量。
3. 按上述顺序完成数据库迁移，并为全新项目显式引导管理员账号。
4. 部署前在干净环境执行 `npm ci && npm run lint && npm run typecheck && npm test && npm run build`。

## 贡献

欢迎提交 Issue 和 Pull Request。涉及依赖、数据库迁移或导入解析器的改动，请同时更新 lockfile、迁移说明或可移植回归测试。
