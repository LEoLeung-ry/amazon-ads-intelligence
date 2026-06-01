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
- Lets the user filter product groups and search campaign names.
- Recalculates the right-side analysis when campaign search or selection changes.
- Shows overview, target diagnostics, search term decisions, hourly dayparting, placement advice, and SciAds rules.
- Exports filtered target/search tables as CSV from the browser.
- Provides a separate `投放关键词检查` entry that rereads the Bulk workbook for keyword coverage, match type, bid structure, negative terms, and ad group structure.

Important behavior:

- If the left campaign search box is empty, analyze all currently visible campaigns.
- If the campaign search box has text, analyze only fuzzy-matched campaigns.
- Manual campaign selection is still supported, but global campaign search takes priority when present.

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
- CPA = spend / orders

### Target diagnostics

Target recommendations are produced from:

- click volume
- spend
- orders
- sales
- ACOS versus target ACOS
- smoothed CVR
- target CPA
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
- `保留/加预算`
- `保留`
- `观察`
- `继续积累`

Core principle:

- Add terms/ASINs when there is at least one order and ACOS is acceptable.
- Negate when there are enough clicks/spend and no orders.
- Protect low-sample terms during the attribution window.

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
- Absorb: advertising as constrained optimization: maximize ad orders subject to budget, stock, and target ACOS/CPS constraints.
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
- The left sidebar has two separate mode buttons: `广告诊断` and `投放关键词检查`.
- Left sidebar contains upload, target ACOS, product groups, campaign search, campaign list.
- Top status pills show Bulk/hourly/SciAds load status.
- `投放关键词检查` must remain a separate workspace, not merged into the original tab set.
- Keyword checker should expose KPI cards, math/course brief, risk brief, manual term input, keyword coverage table, ad group table, filters, and CSV export.
- Target diagnostics and search term decision tables must include the related ad group column (`广告组`) next to campaign (`活动`) so every action is traceable to both campaign and ad group.
- The analysis workspace uses a quieter focus layout: four-column KPI chunks, a stronger primary judgment card, muted support cards, and a plain layered background to reduce cognitive load.
- Overview campaign names must be readable; do not aggressively truncate them.
- Target/search table campaign columns should not wrap into tall rows; use single-line clipping with full text on hover.
- Target/search tabs must have campaign-name search, action filter, and filtered CSV export.
- Hourly tab must explain RPC.
- Numeric percentages should show at most one decimal place.
- CVR/ACOS/uplift/bid adjustment must display as percentages, not decimals.

## 7. Deployment and Git Workflow

Current deployment:

- GitHub Pages from `main` branch root.
- Public URL: https://leoleung-ry.github.io/amazon-ads-intelligence/

Future change workflow:

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
