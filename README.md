<div align="center">

# BumpFree

### 把大家的课表，放在同一张日历上。

导入 ICS，把团队的课程与忙碌时段放进同一个 Room。<br />
为班委、社团和课程小组准备的共享课表：安排活动前，先看清大家的时间。

<sub>Shared timetables for student groups. Import ICS, compare calendars, plan together.</sub>

[![Live Demo](https://img.shields.io/badge/Live-Demo-6366f1)](https://bumpfree.lucius7.dev/room/?id=59685c90-bea8-4d4f-8212-9378e83c526f)
[![CI](https://github.com/theLucius7/bumpfree/actions/workflows/ci.yml/badge.svg)](https://github.com/theLucius7/bumpfree/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)](docs/deployment.md)

[开始使用](https://bumpfree.lucius7.dev) · [免登录查看 Demo](https://bumpfree.lucius7.dev/room/?id=59685c90-bea8-4d4f-8212-9378e83c526f) · [30 秒上手](#30-秒上手指南) · [反馈建议](https://github.com/theLucius7/bumpfree/issues)

**简体中文** · [English](README.en.md)

</div>

![BumpFree 多人课表：三位成员的课程以不同颜色显示在同一个周视图中](docs/images/room-calendar.jpg)

> 真实界面截图。可以先打开 [公开只读 Demo Room](https://bumpfree.lucius7.dev/room/?id=59685c90-bea8-4d4f-8212-9378e83c526f)，无需注册。成员、课程、教师和地点均为虚构演示数据，不代表实际学校或个人课表。演示日期为 2026-08-24 起 20 周，范围外请切换日期，详见 [Demo 说明](docs/demo.md)。

## 为什么使用 BumpFree？

“周三下午大家都有空吗？”不必再靠来回发课表截图确认。

BumpFree 把成员的课程与临时忙碌时段放进同一个 Room，方便一起查看时间安排。适合班级事务、社团活动、课程小组和小型团队协作。

**[WakeUp课程表](https://www.wakeup.fun/) 和 [超级课程表](https://www.super.cn/index.php) 等工具帮助管理个人课表；BumpFree 更聚焦多人 ICS 课表对照与 Room 协作。** 如果你已有 ICS 文件，可以直接导入，在同一张日历中对照团队安排。

| 能力               | 可以怎么用                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| **ICS 导入与预览** | 核对课程名称、时间、教师、地点与周次，确认后保存；不需要 WakeUp 分享口令。 |
| **多人共享日历**   | 成员按颜色区分，支持周视图、月视图与按人查看。                             |
| **Room 协作**      | 创建小组、搜索昵称邀请成员；对方接受后，当前启用的课表加入日历。           |
| **多课表管理**     | 保存不同学期的课表、切换当前课表，手动补充或编辑课程。                     |
| **临时忙碌时段**   | 在课程之外标记会议、社团事务等一次性占用。                                 |
| **可控的分享方式** | Room 默认私密；房主可开启公开只读链接。                                    |

日历帮助你对照时间，不会自动替成员确认可参加，也不提供自动排会算法。

## 使用截图

### 导入前，先核对每一门课

<!-- TODO: 补充经授权登录后拍摄的真实 ICS 导入预览截图。 -->

选择 ICS 文件后，可以先核对学期、课程时间、教师与地点，再确认保存。

支持常见重复规则、单双周和日程例外；遇到不支持的情况会给出提示，不会猜测缺失信息。详细范围见 [ICS 导入说明](docs/usage.md#ics-导入支持范围)。

### 同一个 Room，也可以只看一个人

![按人查看课表：选择成员后聚焦其一周课程安排](docs/images/person-view.jpg)

## 30 秒上手指南

1. **注册并保存恢复码**：打开 [BumpFree](https://bumpfree.lucius7.dev)，注册后将恢复码保存在安全的地方。
2. **导入课表**：进入 **我的课表**，选择 `.ics` 文件，核对学期、课程时间与预览内容，再确认保存。
3. **创建 Room**：在 **我的 Room** 创建小组，通过昵称邀请已注册的伙伴；对方接受后，当前启用的课表加入日历。
4. **一起对照时间**：在同一张日历中查看课程与忙碌时段。需要分享给未注册的人时，房主可开启公开只读链接。

**还没有 ICS？** 下载 [虚构示例课表](https://raw.githubusercontent.com/theLucius7/bumpfree/main/examples/demo-schedule.ics) 试用。将第 1 周周一设为 **2026-08-31**、学期设为 **20 周**；当前导入界面使用 `Asia/Shanghai` 时区。导入后将日历切到对应日期，示例不会反映你的真实课程。

## 隐私与使用边界

- **不获取教务密码**：导入你已有的 ICS 文件，无需向 BumpFree 提供学校教务系统账号或密码。
- **不持久化存储原始 ICS**：文件在浏览器中解析，确认导入后保存结构化课程数据，用于课表和 Room 展示；这不意味着课程数据只保存在本地。
- **Room 默认私密**：开启公开链接后，课程、教师、地点和**课程备注**可被任何持有链接的人查看，请勿放入隐私内容。
- **恢复码请妥善保存**：邮箱目前仅作未经验证的登录标识，本站不发送验证或找回邮件，账号找回依赖恢复码。

日历空白不等于对方一定有空。临时事务和未记录的安排仍需本人确认。详见 [使用与隐私说明](docs/usage.md)。

## 给开发者：本地运行与部署

BumpFree 使用 **Cloudflare Pages + Workers + D1**：Pages 托管页面，Worker 提供同源 API，D1 持久保存用户、Room 和课表。

当前版本不依赖 Vercel 或 Supabase，可在 Cloudflare 免费额度内运行；免费不等于无限容量或无限流量。账号级配额、认证配置和上线步骤见 [部署与维护指南](docs/deployment.md)。

<details>
<summary>展开本地开发步骤（Node.js 22 + npm）</summary>

首次启动：

```bash
git clone https://github.com/theLucius7/bumpfree.git
cd bumpfree
npm ci
cp .dev.vars.example worker/.dev.vars
```

为 `worker/.dev.vars` 中的 `AUTH_PEPPER` 生成独立的本地密钥，将 `SITE_URL`、`DEV_ORIGIN` 设置为 `http://localhost:3000`：

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
npm run db:local
```

在两个终端分别运行：

```bash
# 终端一：本地 API，端口 8787
npm run dev:api

# 终端二：前端，端口 3000
npm run dev
```

打开 [localhost:3000](http://localhost:3000)。本地开发不需要 Cloudflare API Token；不要把生产密钥复制进开发环境。

</details>

部署自己的实例前，请替换域名、D1 UUID 和项目配置。GitHub CI 负责检查与构建，**不会自动部署生产环境**。完整步骤见 [部署与维护指南](docs/deployment.md)。

## 文档导航

| 文档                               | 内容                                              |
| ---------------------------------- | ------------------------------------------------- |
| [使用指南](docs/usage.md)          | 账号、导入、Room、分享与常见问题                  |
| [部署与维护](docs/deployment.md)   | 本地配置、Cloudflare 部署、管理员、免费额度与备份 |
| [架构与目录](docs/architecture.md) | 数据流、技术栈、项目结构与测试                    |
| [安全说明](SECURITY.md)            | 认证设计、权限边界和敏感信息处理                  |
| [贡献指南](CONTRIBUTING.md)        | 提交 Issue、开发检查和 Pull Request               |
| [Demo 与宣传素材](docs/demo.md)    | 演示日期、截图来源、社交预览图与维护说明          |

## 参与改进

欢迎 [报告问题](https://github.com/theLucius7/bumpfree/issues/new/choose)、分享使用场景，或提交 Pull Request。若它帮你少问了一次“大家什么时候有空”，也欢迎给项目一个 Star，让更多人找到它。

感谢 [@zalataraglados-prog](https://github.com/zalataraglados-prog) 在 [PR #1](https://github.com/theLucius7/bumpfree/pull/1) 中对课表导入、课程管理、忙碌时段、Room 协作与管理员配置作出的贡献。

## 许可证

本项目采用 [MIT License](LICENSE)。使用和分发时请保留版权与许可声明。
