# 安全边界

本项目面向小规模课表协作，不声称经过第三方密码学审计或达到 NIST 全面合规。报告安全问题时不要附上真实密钥、恢复码、会话或私人课表；优先使用 GitHub 私密安全报告渠道。

## 认证方案

为适应 Workers Free 的 CPU 限制，浏览器通过 Web Crypto 执行 PBKDF2-HMAC-SHA256（600,000 次、独立 16 字节盐），只发送 32 字节 proof。Worker 存储由 AUTH_PEPPER 计算的 HMAC 验证值；用户 ID、盐、算法和版本参与消息构造。盐派生和验证值使用分离的域标签，签名验证使用 Web Crypto 的 verify。

这是 client-side server-relief 设计，不是 PAKE。proof 是可重放的密码等价物：必须使用 HTTPS，不能写日志、分析事件、浏览器持久存储或数据库。浏览器和服务器代码、TLS 或 AUTH_PEPPER 被攻破时，本方案不能提供额外的魔法保护。不要用一次快速 SHA-256 代替密码 KDF。设计背景参见 [libsodium server relief](https://doc.libsodium.org/password_hashing#server-relief) 和 [OWASP post-hashing peppers](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#post-hashing-peppers)。

官方前端要求 15–128 字符并做 NFC 归一化。但服务器接收的是 proof，**无法证明恶意客户端确实使用了足够长的密码或执行了规定 KDF**。前端校验不是服务端密码强度的保证。高保障或更大规模部署应采用经过评审的认证提供商/协议，并为服务端密码 KDF 配置足够资源。

AUTH_PEPPER 只保存在 Worker Secret 与部署者私密备份中，没有开发默认回退。数据库单独泄露时不含原密码或 proof；若数据库和 pepper 同时泄露，攻击者可离线猜测正常前端用户的密码。不能在发布时换 pepper：这会使已有验证值失效；轮换需要受控的凭据升级或重新激活方案。

## 邮箱、恢复与会话

- 邮箱未经验证，仅作登录标识；没有自动邮件服务，不根据邮箱域名授予权限。
- 恢复码和激活令牌均为 32 字节随机值，仅保存其哈希，激活链接 7 天失效。恢复码一次性使用后换发新码。丢失恢复码后不会通过“不受验证的邮箱”直接重置密码。
- 身份变更需要当前密码重新验证。密码恢复/更新会增加 auth_version，使旧会话立即失效。退出会撤销该用户的全部会话。
- 生产会话采用 __Host- 前缀、Secure、HttpOnly、SameSite=Lax、Path=/，无 Domain；令牌仅保存哈希，最长 7 天，每用户最多 10 条有效会话。
- 写入要求精确匹配配置的 Origin，并拒绝 Sec-Fetch-Site=cross-site。身份参数、登录和上传有 D1 原子限流；限流不等于完整反滥用系统。
- DEV_ORIGIN 只用于本地开发，同时影响 Cookie Secure 属性，生产绝不能配置它。

## 数据授权与容量

- D1 没有 Supabase RLS。本应用只提供明确的业务 API，不给客户端任意 SQL 接口；每个接口都必须执行 Worker 侧身份、角色、所有权/成员关系检查。
- 外键、唯一索引、CHECK、触发器及 D1 batch 事务共同保证配额、单个当前课表、邀请接受和导入替换的一致性。对条件更新的 0 行结果必须显式检查，不能当成成功。
- Room 默认私密；公开模式会公开其成员昵称、启用课表中的课程/老师/地点/课程备注，以及匿名化的忙碌时段。**不要在计划公开的课程备注中写隐私内容**。公开模式不是任意私人数据的自动脱敏工具。
- 未成为成员的公开访问者看不到成员邮箱、密码字段、inactive 课表或 busy 私人标题/备注。房间过期后关闭外部公开读取，既有成员仍能查看。
- 人工处理附件只允许管理员下载，强制 attachment、nosniff、no-store 和 sandbox CSP。不提供公开文件 URL。
- ICS 在带大小/复杂度上限和终止超时的浏览器 Web Worker 中解析。办公文件服务端抽取另做真实 ZIP 解压大小、文件签名与输出上限检查；Free CPU 额度不是可靠的通用文件沙箱。
- 限额、上传和公开注册仍可能被恶意请求耗尽免费配额。免费计划拒绝请求比自动产生账单更可控，但不能保证持续可用；应观察账号级 D1/Workers Metrics。

## 运维

Cloudflare API Token、AUTH_PEPPER、D1 导出、用户文件、会话、恢复码和邀请链接均不得提交到 Git。生产默认不开启 Worker 请求日志，避免意外记录敏感内容；调试时也不要打印认证请求或 Cookie。Cloudflare 平台自身可能保留运营/计量日志。

普通用户不会自动升级为管理员。引导只能通过部署者可信 CLI 和确切账号信息进行；公开页面没有 bootstrap 后门。保留至少一名管理员的应用约束不阻止拥有 Cloudflare/D1 管理权限的部署者修改数据库，因此账号 Token 本身也是最高权限凭据。
