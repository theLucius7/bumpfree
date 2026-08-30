# 贡献指南

感谢你帮助改进 BumpFree。欢迎报告问题、完善文档、提供匿名化的解析样例，或提交功能改进。

## 报告问题与建议

请先搜索已有 [Issues](https://github.com/theLucius7/bumpfree/issues)，再使用对应模板提交。

- Bug：描述复现步骤、预期/实际行为、浏览器和部署方式。
- 导入问题：优先提供最小的虚构 ICS，不提交真实私人课表。
- 功能建议：说明使用场景、目前的困难和期望的结果。
- 安全问题：先阅读 [安全说明](SECURITY.md)，不要在公开 Issue 中暴露漏洞细节、密码、会话、恢复码、API Token 或数据库备份。

## 开发流程

1. 按 [本地开发指南](docs/deployment.md#本地开发) 启动前端与本地 API，不使用生产凭据或生产数据库测试。
2. 从 `main` 创建目的明确的分支。尽量让一个 PR 聚焦一个问题，避免混入无关格式化。
3. 行为变化需附测试；页面变化附不含个人信息的截图。文档与示例应与实际功能一致。
4. 提交前运行：

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

5. 在 PR 中说明目的、改动、验证方式和影响范围。数据库或认证变更还应说明迁移、兼容性与回滚风险。

## 约定

- 安装依赖使用 npm，同时提交 `package.json` 与 lockfile 的相关变更。
- 新 D1 迁移放入 `worker/migrations/`，使用新的顺序编号；不要把历史 Supabase SQL 当成当前迁移。
- 所有写接口必须在 Worker 侧检查权限，不能依赖前端隐藏按钮。
- 涉及时区、重复日程或 ical.js 的改动，应在 UTC、Asia/Shanghai、America/New_York 下补充回归。
- 不要运行生产 smoke 测试作为普通贡献检查；它会实际创建临时账号并消耗配额。
- 不提交 `.env*` 真值、`worker/.dev.vars`、数据库文件、用户上传文件或构建日志。
- 更新中英文 README 时，保持功能、限制、截图和文档链接一致。

本项目采用 [MIT License](LICENSE)。贡献请遵循项目许可证，并保留现有版权与许可声明。
