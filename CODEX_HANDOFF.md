# Codex Handoff: Amazon Ads Intelligence Workbench

This document is the source of truth for future Codex sessions and engineers working on this repository.
Read it before modifying code or advertising logic.

## 1. Project Identity

- Project name: Amazon Ads Intelligence Workbench
- Production URL: https://leoleung-ry.github.io/amazon-ads-intelligence/
- GitHub repository: https://github.com/LEoLeung-ry/amazon-ads-intelligence
- Hosting: GitHub Pages, deployed from the `main` branch root.
- Application type: pure static frontend. There is no backend, database, API server, login system, or file upload server.
- Privacy rule: user-provided ad files are parsed only inside the browser. Do not add server upload, telemetry, remote parsing, or third-party data transmission unless the owner explicitly approves it.

## 2. Current Repository Shape

Tracked files should stay small and deployment-safe:

- `index.html`: app shell, tabs, upload area, tables, chart containers.
- `app.js`: all parsing, analysis, filtering, chart rendering, and CSV export logic.
- `styles.css`: full UI styling.
- `keyword-checker.js`: separate keyword coverage checker. Keep this module independent from the original diagnostics logic except for the small Bulk handoff call in `app.js`.
- `keyword-checker.css`: separate styling for the keyword checker entry and tables.
- `assets/xlsx.full.min.js`: SheetJS browser bundle for XLSX/CSV-like workbook parsing.
- `assets/echarts.min.js`: chart rendering library.
- `README.md`: user-facing project summary.
- `CODEX_HANDOFF.md`: this future-maintainer context document.
- `.nojekyll`: prevents GitHub Pages/Jekyll interference with static assets.
- `.gitignore`: blocks real ad data and local verification artifacts.

Do not commit:

- Real Amazon ad reports: `*.csv`, `*.xlsx`, `*.xls`.
- Verification screenshots: `verification*.png`.
- Local sample data, private business data, generated analysis exports.

## 3. User Workflow

The user opens the GitHub Pages URL and drags in files manually:

1. Amazon Bulk workbook.
2. Sponsored Products hourly campaign report CSV.
3. Optional `SciAds` coaching/chat workbook.

The app then:

- Parses files locally in the browser.
- Lets the user search campaign names from the top of the left sidebar, filter product groups, and optionally select campaigns.
- Uses product-level default CPS plus optional per-campaign CPS overrides as the primary optimization target.
- Uses manually entered natural CVR to smooth small-sample bid recommendations.
- Recalculates the right-side analysis when campaign search or selection changes.
- Shows overview, an all-product action queue, target diagnostics, search term decisions, hourly dayparting, placement advice, and SciAds rules.
- Exports filtered target/search tables as CSV from the browser.
- Provides a separate `投放关键词检查` entry that rereads the Bulk workbook for keyword coverage, match type, bid structure, negative terms, and ad group structure.

Important behavior:

- If the left campaign search box is empty, analyze all currently visible campaigns.
- If the campaign search box has text, analyze only fuzzy-matched campaigns.
- Manual campaign selection is still supported, but global campaign search takes priority when present.
- The owner optimizes one product at a time across all of that product's campaigns. The default homepage workflow must therefore stay product-wide first, not campaign-by-campaign first.
- Campaign-level CPS overrides are optional. Empty override fields inherit the product default CPS.
- Goal preferences are saved in `localStorage` under `amazonAds.goalPrefs.v2`; uploaded files themselves are never persisted.
- The first screen should communicate a task path, not a feature catalog: import data, confirm goals, review the action queue, confirm actions, export execution data.
- Required file guidance is part of the empty state: Bulk is required; hourly CSV and SciAds records are optional enrichments.

## 4. Input Files and Expected Columns

The application is designed around Amazon Japan Sponsored Products exports with Chinese/Japanese localized headers.

### Bulk workbook

Expected sheets:

- `商品推广活动`
- `商品推广搜索词报告`

Important campaign/target columns include:

- `实体层级`
- `广告活动编号`
- `广告组编号`
- `广告活动名称`
- `广告活动名称（仅供参考）`
- `广告组名称`
- `SKU`
- `ASIN（仅供参考）`
- `投放类型`
- `状态`
- `每日预算`
- `广告组默认竞价`
- `竞价`
- `关键词文本`
- `匹配类型`
- `竞价方案`
- `广告位`
- `百分比`
- `商品投放 ID`
- `拓展商品投放名称（仅供参考）`
- `展示量`
- `点击量`
- `花费`
- `销量`
- `订单数量`
- `商品数量`

Important search term columns include:

- `广告活动编号`
- `广告组编号`
- `关键词编号`
- `商品投放 ID`
- `广告活动名称（仅供参考）`
- `广告组名称（仅供参考）`
- `竞价`
- `关键词文本`
- `匹配类型`
- `拓展商品投放名称（仅供参考）`
- `顾客搜索词`
- `展示量`
- `点击量`
- `花费`
- `销量`
- `订单数量`
- `商品数量`

Implementation note:

- Some Amazon workbooks have an incorrect worksheet dimension such as `A1`. Keep the `ensureRef()` / SheetJS `nodim: true` handling, or the app may read only one cell.

### Hourly campaign CSV

Expected columns include:

- `开始日期`
- `开始时间`
- `广告活动名称`
- `展示量`
- `点击量`
- `花费`
- `7天总订单数(#)`
- `7天总销售额`

Encoding note:

- The provided hourly CSV was `gb18030`, not UTF-8.
- Keep `readTextSmart()` with fallback decoding for `utf-8`, `gb18030`, `gbk`, `big5`, and `shift_jis`.

### SciAds workbook

- The app reads the first sheet and extracts non-empty text rows as coaching snippets.
- Built-in SciAds rules remain available even if the user does not upload the workbook.

## 5. Core Advertising Logic

Use these definitions consistently:

- CTR = clicks / impressions
- CPC = spend / clicks
- CVR = orders / clicks
- ACOS = spend / sales
- ROAS = sales / spend
- RPC = sales / clicks
- AOV = sales / orders
- CPS/CPA = spend / orders. The UI currently uses the label `CPS`; code may still use `cpa` where it means spend per order.

### Current target model: CPS first

The current application is CPS-driven. Do not revert it to target-ACOS-as-primary-input.

Primary state in `app.js`:

- `defaultTargetCps`: product default target CPS. Current default is `670`.
- `naturalCvr`: manually entered product natural conversion rate. Current default is `0.05`.
- `campaignTargetCpsOverrides`: object keyed by campaign name. A positive value overrides the product default for that campaign.
- `targetAcos`: retained only as a derived/explanatory value for existing ACOS comparisons and UI display.

Local persistence:

- `amazonAds.goalPrefs.v2`
- Stores `defaultTargetCps`, `naturalCvr`, and `campaignTargetCpsOverrides`.
- Do not read older `amazonAds.goalPrefs.v1` values by default; old local caches may contain obsolete CPS/CVR defaults.
- When a new Bulk file is loaded, overrides for campaign names that are no longer present are removed.

Required formulas:

- campaign target CPS = campaign override CPS || product default CPS
- AOV = sales / orders
- derived target ACOS = target CPS / AOV
- smoothed CVR = `(ad orders + natural CVR * 20) / (ad clicks + 20)`
- recommended bid = target CPS * smoothed CVR
- no-order stop-loss threshold = `max(300, target CPS * 0.8)`

Important interpretation:

- ACOS is now an explanation metric derived from CPS and AOV, not the user's main control input.
- Natural CVR must affect low-sample bid recommendations. Keep the smoothing behavior in `targetAction()` and `searchDecision()`.
- The KPI display order is fixed: clicks, CTR, CVR, orders, CPC, spend, sales, ACOS, ROAS, campaign count.

### Target diagnostics

Target recommendations are produced from:

- click volume
- spend
- orders
- sales
- actual CPS versus target CPS
- natural-CVR-smoothed CVR
- campaign-level CPS override if present
- current bid / observed CPC

Current action categories:

- `放量`
- `降价`
- `止损`
- `保持`
- `观察`
- `无流量`
- `小幅优化`

The logic intentionally uses conservative smoothing and small-step changes to avoid overreacting to attribution lag and low sample size.

### Search term diagnostics

Search term actions include:

- `加精准词`
- `加商品定向`
- `否定`
- `检查否定`
- `已否定`
- `保留/加预算`
- `保留`
- `观察`
- `继续积累`

Core principle:

- Add terms/ASINs when there is at least one order and CPS is acceptable.
- Negate when there are enough clicks/spend and no orders, using the CPS stop-loss threshold.
- Protect low-sample terms during the attribution window.
- Parse active Bulk negative keyword rows into `state.negativeByScope` before search term decisions.
- Match negative keyword coverage by campaign plus ad group name or ad group ID. Amazon Bulk campaign rows may expose ad group ID while search term rows expose the informational ad group name, so both scopes must be indexed.
- If a no-order search term is already covered by an active negative keyword in the same campaign/ad group, return `已否定` with `recBid: 0` and keep it out of the all-product action queue.
- If a search term has orders but is covered by a negative keyword, return `检查否定`; this is an exception that should remain visible because it may indicate an accidental traffic block.
- When exact and phrase negatives both match a query, prefer the exact negative in the explanation.

### All-product action queue

The homepage action queue is now the primary workflow.

- `renderActionQueue()` shows three summary cards plus the `productActionTable`.
- `buildProductActionRows()` mixes target rows and search term rows into one product-wide queue.
- The queue is sorted by action priority first, then spend.
- The default queue is intentionally strict. It should include only real action categories: `止损`, `否定`, `检查否定`, `降价`, `放量`, `加精准词`, `加商品定向`, and `保留/加预算`.
- Keep `观察`, `无流量`, `保持`, `保留`, `继续积累`, `小幅优化`, and `已否定` out of the default queue. These can still appear in expanded diagnostic tables, but showing them by default makes the homepage feel overwhelming.
- It must show review status, action, object, campaign, ad group, current CPS, target CPS, ACOS, recommended bid, and reason.
- Each queue row has a lightweight review status: `待确认`, `已确认`, or `暂缓`. This is stored in memory under `state.actionReviews` because uploaded files are not persisted.
- Review row keys must be precise enough that confirming one row does not accidentally confirm duplicate-looking rows. Include source/action/campaign/ad group/item plus metrics such as spend/orders/recommended bid.
- The queue summary shows counts for pending/confirmed/held actions.
- The queue can export all rows or only `已确认` rows. Keep `productQueueConfirmed` wired to the same columns so current column choices apply to both exports.
- It uses the same column preference system as other tables and exports through `exportTableCsv("productQueue", ...)`.
- Keep this product-wide queue as the default path so the user does not have to jump through hundreds of campaigns manually.
- The deeper tabs (`总览`, `标的诊断`, `搜索词`, `分时联动`, `广告位`, `规则库`) are collapsed by default after import and are revealed through the action queue button. This avoids repeating the queue and prevents a dense report wall from appearing before the user asks for details.

### Keyword coverage checker

This is a separate feature, not a tab inside the original diagnostics logic.

Files:

- UI shell lives in `index.html` under `#keywordWorkspace`.
- Logic lives in `keyword-checker.js`.
- Styles live in `keyword-checker.css`.
- `app.js` should only notify it after a Bulk workbook is parsed through `window.KeywordChecker.receiveBulk(workbook, { campaignSheetName, searchSheetName })`.

Inputs:

- Reads `商品推广活动` for positive keyword rows, negative keyword rows, bids, campaign names, ad group names, status, and performance metrics.
- Reads `商品推广搜索词报告` for search terms with activity or orders, so the checker can flag search terms that generated orders but are not explicitly covered as positive keywords.

Course logic assessment:

- The SciAds course is worth learning only where the idea is mathematically checkable.
- Absorb: advertising as constrained optimization: maximize ad orders subject to budget, stock, and target CPS constraints; use ACOS as a derived check, not the main steering wheel.
- Absorb: Exact match is the efficiency/control layer; phrase and broad are exploration layers; negative keywords are for traffic splitting.
- Do not absorb blindly: anecdotal percentage rules, platform behavior claims, or old Sponsored Display rules unless current Amazon documentation/data verifies them.

Current keyword checker actions:

- `搜索出单未承接`: search term has orders and acceptable ACOS but no positive keyword coverage.
- `缺精准`: phrase/broad exists but exact is missing.
- `竞价倒挂`: exact average bid is lower than phrase or broad, against the intended `exact >= phrase >= broad` hierarchy.
- `重复分散`: same term is spread across many campaign/ad group/match combinations.
- `正负冲突`: same term has positive and negative rows inside the same campaign + ad group. Do not mark different ad groups inside the same campaign as conflict; that can be intentional traffic splitting.
- `未投放`: manual term or active search term is absent from positive keyword targeting.
- `精准控制`: exact exists without exploration matches.
- `结构完整`: exact plus phrase/broad exists and bid hierarchy is acceptable.

Manual mode:

- The checker has a textarea where the user can paste one term per line.
- Empty textarea means automatic mode: check all positive keywords plus active/search-order terms.
- Manual mode must preserve Japanese terms and spaces inside terms. Split only on newlines and punctuation separators, not arbitrary spaces.

### Hourly/daypart logic

The original fixed-segment explanation is preserved for reference:

- baseline: `01:00 <= hour < 07:00`
- morning: `07:00 <= hour < 13:00`
- later day: `13:00 <= hour < 01:00`
- recommended adjustment = RPC uplift versus baseline * 60% conservative factor

The current app also has dynamic daypart discovery:

- Analyze all 24 hours.
- Identify hours with enough clicks/orders, higher RPC than account baseline, and acceptable CVR.
- Merge consecutive qualified hours into windows.
- Recommend bid adjustment for each window using conservative uplift logic.

Do not regress back to only fixed `07-13` and `13-01` windows. The owner specifically requested flexible time-window discovery.

### Placement logic

Placement recommendations compare placement RPC against a baseline and apply a conservative multiplier.

Current placement labels normalize into:

- `首页首位`
- `商品页面`
- `其余位置`
- `企业购`

The placement tab should keep summary cards explaining:

- how many placement rows are candidates,
- the decision logic,
- RPC by placement.

## 6. UI Requirements to Preserve

The app should feel like an operational SaaS tool, not a marketing landing page.

Important UI behavior:

- First screen is the usable app, not a landing page.
- The analysis workspace top area includes a compact workflow strip: `导入数据`, `确认目标`, `查看队列`, `确认动作`, `导出结果`. Keep this lightweight and status-driven.
- The empty state uses business language around turning ad reports into executable actions, and it shows file requirements instead of decorative graphics.
- The left sidebar has two separate mode buttons: `广告诊断` and `投放关键词检查`.
- Left sidebar campaign search appears above upload and goal controls.
- Left sidebar contains upload, product default target CPS, natural CVR, derived ACOS, actual CPS, target gap, product groups, and campaign list.
- Each campaign row supports a compact CPS override input. Empty input means inherit product default CPS.
- Top status pills show Bulk/hourly/SciAds load status.
- `投放关键词检查` must remain a separate workspace, not merged into the original tab set.
- Keyword checker should expose KPI cards, math/course brief, risk brief, manual term input, keyword coverage table, ad group table, filters, and CSV export.
- Target diagnostics and search term decision tables must include the related ad group column (`广告组`) next to campaign (`活动`) so every action is traceable to both campaign and ad group.
- The analysis workspace uses a quieter focus layout: fixed-order KPI chunks, a stronger primary judgment card, muted support cards, and a plain layered background to reduce cognitive load.
- KPI order must remain: 点击, CTR, CVR, 订单, CPC, 花费, 销售额, ACOS, ROAS, 活动.
- The all-product action queue should stay above deep tab tables after data import.
- Deep analysis tabs should stay hidden until the user clicks `展开详细分析`.
- Overview campaign names must be readable; do not aggressively truncate them.
- Target/search table campaign columns should not wrap into tall rows; use single-line clipping with full text on hover.
- Target/search table reason columns should stay single-line clipped with hover/title access through existing table rendering, so reason text does not inflate row height.
- Target/search tabs must have campaign-name search, action filter, and filtered CSV export.
- Hourly tab must explain RPC.
- Numeric percentages should show at most one decimal place.
- CVR/ACOS/uplift/bid adjustment must display as percentages, not decimals.

## 7. Deployment and Git Workflow

Current deployment:

- GitHub Pages from `main` branch root.
- Public URL: https://leoleung-ry.github.io/amazon-ads-intelligence/

Default future change workflow:

1. Create a new branch from `main`.
2. Make the change.
3. Verify locally with a simple static server.
4. Confirm no real CSV/XLSX files are staged.
5. Push the branch.
6. Open a Pull Request.
7. Merge to `main` only after review.

Suggested branch names:

- `feature/hourly-window-v2`
- `feature/search-filtering`
- `fix/csv-encoding`
- `fix/github-pages-assets`

Never force-push `main` unless the owner explicitly requests it.

Owner-requested direct publish:

- If the owner explicitly asks to push/replace the GitHub Pages version, direct commits to `main` are allowed.
- Before every GitHub push, update `CODEX_HANDOFF.md` so another AI can reconstruct the current code logic, UI architecture, data flow, and business rules without this conversation.
- Direct publish still requires syntax checks and `git diff --check`.

## 8. Local Verification Checklist

Before opening a PR or merging:

1. Run a JavaScript syntax check:

   ```powershell
   node --check app.js
   node --check keyword-checker.js
   ```

   If system `node` is blocked, use the bundled Codex runtime Node path.

2. Serve the repository root locally:

   ```powershell
   python -m http.server 8765 --bind 127.0.0.1
   ```

3. Open:

   ```text
   http://127.0.0.1:8765/
   ```

4. Drag in real local test files manually. Do not commit them.

5. Verify:

   - Bulk file loads and campaign count appears.
   - With `bulk-ap762ut670mr2-20260502-20260530-1780320002160.xlsx`, the search term `ベビーカー 扇風機` in campaign/ad group `ryo_手持风扇_e8_自动` is detected as already covered by Bulk negative exact (`否定精准匹配`) and does not appear in the all-product action queue.
   - Left sidebar shows activity search above upload.
   - Product goal card shows default target CPS, natural CVR, derived ACOS, actual CPS, and target gap.
   - Editing default CPS or natural CVR updates recommendations.
   - Campaign CPS override fields save to `amazonAds.goalPrefs.v2` and override target CPS for that campaign.
   - Empty state shows the five-step path and file requirements for required Bulk plus optional hourly CSV/SciAds files.
   - Workflow strip updates from `先上传 Bulk` to campaign/search-term counts after import.
   - Action queue rows can be marked `已确认` or `暂缓`; the review summary updates immediately.
   - `导出已确认` is disabled until at least one action is confirmed, then exports only confirmed rows with the current column setup.
   - KPI order is clicks, CTR, CVR, orders, CPC, spend, sales, ACOS, ROAS, campaigns.
   - All-product action queue renders and exports CSV using current columns.
   - The all-product action queue excludes observation/keep/no-flow/already-negated rows by default.
   - Deep tabs remain collapsed after import until `展开详细分析` is clicked.
   - Hourly CSV loads and hourly table has 24 rows.
   - SciAds workbook loads or built-in rules remain available.
   - Left campaign search filters the right-side analysis.
   - Target/search tab campaign filters work.
   - Target/search CSV export produces filtered rows.
   - Dynamic hourly windows are shown.
   - Placement summary cards render.
   - `投放关键词检查` mode appears as a separate entry.
   - After loading Bulk, keyword checker produces keyword rows and ad group rows.
   - Manual keyword input returns both found and not-found terms.
   - Keyword checker CSV export produces filtered rows.
   - Browser console has no errors.

## 9. Known Constraints and Risks

- There is no backend persistence. Refreshing the page clears loaded files.
- Browser memory limits may matter for very large Amazon reports.
- Amazon may change column names or sheet names; header matching should stay tolerant.
- On Windows PowerShell, Chinese text may appear mojibake in terminal output even when the files are valid UTF-8. Verify with a browser, Node `fs.readFile(..., "utf8")`, or an editor before rewriting Chinese strings.
- Some browser automation environments cannot capture downloads; CSV export can still be validated by checking generated row counts or browser-side export state.
- This repository intentionally stores minified third-party browser bundles locally for GitHub Pages reliability.

## 10. Prompt for Future Codex Sessions

When starting a future Codex session, give it this instruction:

```text
Read CODEX_HANDOFF.md first. This is a static GitHub Pages app for Amazon Sponsored Products analysis. Preserve client-side-only file parsing and never commit real CSV/XLSX ad reports. Use a new branch and PR for changes. Verify with local static serving and manual file drag/drop before proposing a merge.
```

If the future Codex can access the repository but not this conversation, this document is sufficient context.
