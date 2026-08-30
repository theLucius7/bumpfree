# 公开演示与宣传素材

[返回 README](../README.md) · [使用指南](usage.md)

## 公开只读 Demo

[打开演示 Room](https://bumpfree.lucius7.dev/room/?id=59685c90-bea8-4d4f-8212-9378e83c526f)，无需注册。

这是正式应用中的真实 Room，不是静态模型。它包含 **3 位虚构成员、每人 5 门课程**，用来展示课程叠色、重叠时段与按人查看。成员昵称均带“演示”标记，课程、教师、学校与地点均为虚构。

- Demo 对外只读；公开访问者不能编辑课表、邀请成员或加入忙碌时段。演示账号不向公众提供登录凭据。
- Demo 日期从 **2026-08-24** 开始，共 **20 周**，覆盖至 **2027-01-10**。提前一周放置示例，便于开学前体验；这不是任何学校的实际校历。
- 日历默认打开当前日期。若处于演示日期范围之外，请用“上一时间段 / 下一时间段”切换到上述范围。
- [可下载 ICS](../examples/demo-schedule.ics) 是独立的单人导入示例，从 **2026-08-31** 开始，包含单周实验课程，与 Demo 的三人排课不完全相同。
- 空白时段只能用于人工对照，不代表成员已同意参加活动，也不是自动排会结果。

## 使用截图

目前已发布共享周历和按人查看两张真实截图，均来自正式应用的实际操作，不修改 DOM、不伪造功能、不混入真实用户资料。公开日历截图展示 **2026-08-31 至 2026-09-06**。

ICS 导入预览截图尚待补充：需在获授权登录演示账号后，使用仓库内的虚构 ICS 拍摄。社交预览中的向量示意图不能替代这张真实使用截图。

维护截图时请使用新的虚构演示数据，并检查账号标识、恢复码、课程备注及浏览器内容是否适合公开。不要在公共 Issue 或提交中包含密码、会话、恢复码和原始私人课表。

## GitHub 社交预览图

- [PNG 成品](images/social-preview.png)：1280 × 640，适合 GitHub Social Preview。
- [SVG 源文件](images/social-preview.svg)：可编辑标题、标语与配色。
- 图中的叠色日历是明确标注的向量示意，并非产品截图；实际界面以 README 使用截图和 Demo 为准。

在仓库 **Settings → General → Social preview → Edit → Upload an image** 上传 PNG。GitHub 建议 1280 × 640，支持小于 1 MB 的 PNG、JPG 或 GIF，详见 [官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)。提交图片到仓库本身不会自动设置 Social Preview。

## 维护提醒

演示 Room 与账号是专用的虚构记录，保留用于公开展示；临时登录会话应在操作完成后退出。不要把演示登录凭据写入 README，或把真实用户的 Room 改成宣传样例。

更新学期时同步核对 Demo 日期、下载示例、截图与文档；若更换演示 Room，请同时替换中英文 README 和本文的链接。演示数据不会自动滚动到新学期。
