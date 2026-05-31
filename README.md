# Amazon Ads Intelligence Workbench

Future maintainers and Codex sessions should read [`CODEX_HANDOFF.md`](./CODEX_HANDOFF.md) before changing code or advertising logic.

纯前端 Amazon Sponsored Products 广告分析工具，适合通过 GitHub Pages 发布。用户拖入的广告文件只在浏览器本地解析，不会上传到 GitHub 或任何服务器。

打开页面后拖入以下文件即可分析：

- Amazon Bulk 工作簿：包含 `商品推广活动` 和 `商品推广搜索词报告`。
- 商品推广每小时 CSV：用于分时竞价、7 天 CVR 波动和 RPC 稳定性。
- SciAds 陪跑聊天记录：用于规则库和运营判断提示。

左侧可以按产品组筛选、搜索活动，并勾选多个活动重新计算；活动搜索为空时默认分析全部活动。

核心逻辑：

- 标的诊断：按点击、花费、订单、ACOS、平滑 CVR 和目标 CPA 回推建议竞价。
- 搜索词：判断加精准词、加商品定向、否定、保留或观察。
- 分时竞价：以 `01-07` 为基准，计算 `07-13` 和 `13-01` 的每次点击销售额提升，再乘以 60% 保守系数。
- 自动分时：同时会按 24 小时数据寻找 RPC 和 CVR 更好的连续小时窗口，给出动态加价建议。
- 波动监控：选中活动近 7 天 CVR 最大偏离超过 1 个百分点时预警。

交互改良：

- 左侧活动搜索为空时分析全部活动；输入关键词后右侧只分析匹配活动。
- 标的诊断和搜索词页面支持按广告活动名称搜索、按动作筛选，并导出当前筛选后的 CSV。
- RPC 表头带解释：`RPC = 7天总销售额 / 点击量`。

发布建议：

- GitHub Pages 来源：`main` 分支根目录。
- 不要提交任何真实广告 CSV/XLSX 文件。
- 后续修改建议使用新分支和 Pull Request。
