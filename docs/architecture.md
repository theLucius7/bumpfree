# 架构与目录

[返回 README](../README.md) · [部署指南](deployment.md)

## 数据如何流动

```text
ICS 文件 ──→ 浏览器 Web Worker ──→ 导入预览
                                    │ 用户确认
                                    ▼
Cloudflare Pages 页面 ── /api/* ── Cloudflare Worker ── Cloudflare D1
                                    身份与权限校验       持久保存业务数据
```

浏览器解析 ICS，只在确认后发送结构化课程。静态页面不包含账号数据；API 对每次读写执行身份、所有权与成员关系检查。没有运行时 Next.js 服务端或 Server Actions。

D1 保存用户、会话、课表、课程、Room、成员、邀请、busy 记录和人工处理附件。它不会自动提供 Supabase RLS；授权由 Worker 明确执行，数据库约束与事务负责一致性。

## 目录速览

```text
app/                 页面、布局与静态导出
components/          导入、课表、日历与 Room 界面
lib/                 前端 API、认证客户端、ICS 与其他格式解析器
worker/              Cloudflare Worker API、权限校验及 D1 迁移
scripts/             构建、测试、发布与管理员工具
examples/            不含个人信息的可导入示例
docs/                使用、部署、架构与真实界面截图
.github/             CI、Issue 表单与 PR 模板
supabase/            1.x 历史 SQL，仅供参考，不参与运行
```

## 技术栈

Next.js 16 静态导出、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、react-big-calendar、date-fns、ical.js，以及 Cloudflare Pages / Workers / D1。

具体依赖版本以 `package.json` 与 `package-lock.json` 为准。`next` 和 `eslint-config-next` 版本需同步；ical.js 精确锁定为 2.2.1，因为内嵌 VTIMEZONE 适配依赖其转移数据结构，升级必须验证夏令时回归。SheetJS 使用官方 0.20.3 tarball，不要退回 npm registry 中过时的 0.18.5。

## 测试与安全

`npm test` 使用虚构数据和内存 D1，不读取部署凭据，覆盖解析、时区/重复/例外、身份隔离、会话失效、配额、并发邀请、事务回滚与附件权限。CI 还在 UTC、上海与纽约环境运行日历测试。

认证协议、恢复码、公开分享和免费配额的边界详见 [SECURITY.md](../SECURITY.md)。当前测试不等同于第三方安全审计。

## 截图说明

更新截图时保持真实界面，不要修改 DOM 来伪造功能、隐藏错误或展示不存在的数据。使用隔离的虚构演示数据，不使用真实用户的账号、恢复码或私人文件。公开 Demo 学期从 2026-08-24 开始；可下载的单人 ICS 示例从 2026-08-31 开始，详见 [Demo 说明](demo.md)。
