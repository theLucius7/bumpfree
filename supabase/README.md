# 历史迁移，仅供参考

本目录是 BumpFree 1.x 的 PostgreSQL / Supabase schema 历史，不参与 2.x 的运行、构建或部署。当前迁移位于 `worker/migrations/`，使用 Cloudflare D1。

不要对生产环境运行 `manual/reset_schema.sql`。它是历史破坏性恢复脚本，不是新部署步骤。Supabase 的历史账号和业务数据没有被自动搬到 D1；如需迁移，应先备份、映射字段，并通过单独审核的导入流程处理。
