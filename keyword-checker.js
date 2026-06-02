(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    loaded: false,
    targetAcos: 0.3,
    positiveRows: [],
    negativeRows: [],
    searchRows: [],
    keywordSummaries: [],
    adGroupSummaries: [],
    manualTerms: [],
    filters: {
      search: "",
      campaign: "all",
      action: "all",
    },
    exportRows: [],
    exportColumns: [],
    exportTableId: "keywordCoverageTable",
    tableViews: {},
  };

  const els = {};
  const currency = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
  const compactNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

  window.KeywordChecker = {
    receiveBulk,
    getState: () => ({
      loaded: state.loaded,
      positiveRows: state.positiveRows.length,
      negativeRows: state.negativeRows.length,
      searchRows: state.searchRows.length,
      keywordSummaries: state.keywordSummaries.length,
      adGroupSummaries: state.adGroupSummaries.length,
    }),
  };

  document.addEventListener("DOMContentLoaded", () => {
    [
      "analysisWorkspace",
      "keywordWorkspace",
      "keywordStatusPills",
      "keywordEmptyState",
      "keywordKpiGrid",
      "keywordMathBrief",
      "keywordRiskBadge",
      "keywordRiskBrief",
      "keywordCourseBrief",
      "keywordTargetAcos",
      "keywordSearchInput",
      "keywordCampaignFilter",
      "keywordActionFilter",
      "exportKeywordCsv",
      "manualKeywordInput",
      "runManualKeywordCheck",
      "useAllKeywordCheck",
      "keywordInsightStrip",
      "keywordTableMeta",
      "keywordCoverageTable",
      "adGroupCoverageTable",
    ].forEach((id) => {
      els[id] = $(id);
    });
    bindModeSwitch();
    bindKeywordEvents();
    document.addEventListener("click", handleColumnControlClick);
    document.addEventListener("change", handleColumnControlChange);
    renderKeywordChecker();
  });

  function bindModeSwitch() {
    document.querySelectorAll(".mode-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        document.querySelectorAll(".mode-btn").forEach((item) => item.classList.toggle("active", item === button));
        if (els.analysisWorkspace) {
          els.analysisWorkspace.hidden = mode !== "analysis";
          els.analysisWorkspace.classList.toggle("active", mode === "analysis");
        }
        if (els.keywordWorkspace) {
          els.keywordWorkspace.hidden = mode !== "keyword";
          els.keywordWorkspace.classList.toggle("active", mode === "keyword");
        }
        setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
      });
    });
  }

  function bindKeywordEvents() {
    if (!els.keywordTargetAcos) return;
    els.keywordTargetAcos.addEventListener("input", () => {
      state.targetAcos = clamp(toNumber(els.keywordTargetAcos.value) / 100, 0.01, 1);
      rebuildSummaries();
      renderKeywordChecker();
    });
    els.keywordSearchInput.addEventListener("input", () => {
      state.filters.search = cleanText(els.keywordSearchInput.value).toLowerCase();
      renderKeywordTables();
    });
    els.keywordCampaignFilter.addEventListener("change", () => {
      state.filters.campaign = els.keywordCampaignFilter.value;
      renderKeywordTables();
    });
    els.keywordActionFilter.addEventListener("change", () => {
      state.filters.action = els.keywordActionFilter.value;
      renderKeywordTables();
    });
    els.runManualKeywordCheck.addEventListener("click", () => {
      state.manualTerms = parseManualTerms(els.manualKeywordInput.value);
      renderKeywordChecker();
    });
    els.useAllKeywordCheck.addEventListener("click", () => {
      state.manualTerms = [];
      els.manualKeywordInput.value = "";
      renderKeywordChecker();
    });
    els.exportKeywordCsv.addEventListener("click", exportKeywordCsv);
  }

  function receiveBulk(workbook, options = {}) {
    const sheetNames = workbook.SheetNames || [];
    const campaignSheetName = options.campaignSheetName || findSheetName(sheetNames, ["商品推广活动", "Sponsored Products Campaigns"]);
    const searchSheetName = options.searchSheetName || findSheetName(sheetNames, ["商品推广搜索词报告", "Sponsored Products Search Term"]);
    const campaignRows = campaignSheetName ? sheetToRows(workbook.Sheets[campaignSheetName]) : [];
    const searchRows = searchSheetName ? sheetToRows(workbook.Sheets[searchSheetName]) : [];
    state.positiveRows = parseKeywordRows(campaignRows).positiveRows;
    state.negativeRows = parseKeywordRows(campaignRows).negativeRows;
    state.searchRows = parseSearchRows(searchRows);
    state.loaded = Boolean(state.positiveRows.length || state.negativeRows.length || state.searchRows.length);
    rebuildSummaries();
    renderKeywordChecker();
  }

  function rebuildSummaries() {
    state.keywordSummaries = buildKeywordSummaries();
    state.adGroupSummaries = buildAdGroupSummaries();
  }

  function parseKeywordRows(rows) {
    const headerIndex = findHeaderRow(rows, ["关键词文本", "Keyword Text"], ["匹配类型", "Match Type"]);
    if (headerIndex < 0) return { positiveRows: [], negativeRows: [] };
    const header = makeHeader(rows[headerIndex]);
    const indexes = {
      entity: findIndex(header, ["实体层级", "Entity"]),
      campaignId: findIndex(header, ["广告活动编号", "Campaign ID"]),
      adGroupId: findIndex(header, ["广告组编号", "Ad Group ID"]),
      campaign: findIndex(header, ["广告活动名称", "广告活动名称（仅供参考）", "Campaign Name"]),
      campaignRef: findIndex(header, ["广告活动名称（仅供参考）", "Campaign Name (Informational only)"]),
      adGroup: findIndex(header, ["广告组名称", "广告组名称（仅供参考）", "Ad Group Name"]),
      keyword: findIndex(header, ["关键词文本", "Keyword Text"]),
      match: findIndex(header, ["匹配类型", "Match Type"]),
      bid: findIndex(header, ["竞价", "Bid"]),
      status: findIndex(header, ["状态", "Status"]),
      impressions: findIndex(header, ["展示量", "Impressions"]),
      clicks: findIndex(header, ["点击量", "Clicks"]),
      spend: findIndex(header, ["花费", "Spend"]),
      sales: findIndex(header, ["销量", "Sales"]),
      orders: findIndex(header, ["订单数量", "Orders"]),
      units: findIndex(header, ["商品数量", "Units"]),
    };
    const positiveRows = [];
    const negativeRows = [];
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const keyword = cleanText(valueAt(row, indexes.keyword));
      if (!keyword) continue;
      const matchInfo = normalizeMatch(valueAt(row, indexes.match));
      if (!matchInfo.type) continue;
      const campaign = cleanText(firstValue(row, [indexes.campaign, indexes.campaignRef])) || "未命名广告活动";
      const adGroup = cleanText(valueAt(row, indexes.adGroup)) || cleanText(valueAt(row, indexes.adGroupId)) || "未命名广告组";
      const item = {
        keyword,
        norm: normalizeTerm(keyword),
        match: matchInfo.type,
        family: matchInfo.family,
        campaign,
        campaignId: cleanText(valueAt(row, indexes.campaignId)),
        adGroup,
        adGroupId: cleanText(valueAt(row, indexes.adGroupId)),
        bid: toNumber(valueAt(row, indexes.bid)),
        status: cleanText(valueAt(row, indexes.status)),
        entity: cleanText(valueAt(row, indexes.entity)),
        metrics: metricsFromRow(row, indexes),
      };
      if (item.family === "negative") negativeRows.push(item);
      else positiveRows.push(item);
    }
    return { positiveRows, negativeRows };
  }

  function parseSearchRows(rows) {
    const headerIndex = findHeaderRow(rows, ["顾客搜索词", "Customer Search Term", "Search Term"], ["广告活动名称", "Campaign Name"]);
    if (headerIndex < 0) return [];
    const header = makeHeader(rows[headerIndex]);
    const indexes = {
      campaign: findIndex(header, ["广告活动名称（仅供参考）", "广告活动名称", "Campaign Name"]),
      adGroup: findIndex(header, ["广告组名称（仅供参考）", "广告组名称", "Ad Group Name"]),
      query: findIndex(header, ["顾客搜索词", "Customer Search Term", "Search Term"]),
      target: findIndex(header, ["关键词文本", "Keyword Text", "拓展商品投放名称（仅供参考）", "Product Targeting Expression"]),
      match: findIndex(header, ["匹配类型", "Match Type"]),
      impressions: findIndex(header, ["展示量", "Impressions"]),
      clicks: findIndex(header, ["点击量", "Clicks"]),
      spend: findIndex(header, ["花费", "Spend"]),
      sales: findIndex(header, ["销量", "Sales"]),
      orders: findIndex(header, ["订单数量", "Orders"]),
      units: findIndex(header, ["商品数量", "Units"]),
    };
    const parsed = [];
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const query = cleanText(valueAt(row, indexes.query));
      if (!query) continue;
      parsed.push({
        query,
        norm: normalizeTerm(query),
        campaign: cleanText(valueAt(row, indexes.campaign)) || "未命名广告活动",
        adGroup: cleanText(valueAt(row, indexes.adGroup)) || "未命名广告组",
        target: cleanText(valueAt(row, indexes.target)),
        match: cleanText(valueAt(row, indexes.match)),
        metrics: metricsFromRow(row, indexes),
      });
    }
    return parsed;
  }

  function buildKeywordSummaries() {
    const byTerm = new Map();
    state.positiveRows.forEach((row) => ensureTerm(byTerm, row.norm, row.keyword).positive.push(row));
    state.negativeRows.forEach((row) => ensureTerm(byTerm, row.norm, row.keyword).negative.push(row));
    state.searchRows.forEach((row) => {
      const active = row.metrics.orders > 0 || row.metrics.clicks >= 8 || row.metrics.spend >= 300;
      if (active) ensureTerm(byTerm, row.norm, row.query).search.push(row);
    });
    return Array.from(byTerm.values())
      .map((item) => summarizeKeyword(item.norm, item.display, item.positive, item.negative, item.search))
      .sort((a, b) => actionRank(a.action) - actionRank(b.action) || a.score - b.score || b.spend - a.spend);
  }

  function ensureTerm(map, norm, display) {
    if (!norm) norm = normalizeTerm(display);
    if (!map.has(norm)) {
      map.set(norm, {
        norm,
        display: cleanText(display),
        positive: [],
        negative: [],
        search: [],
      });
    }
    const item = map.get(norm);
    if (!item.display && display) item.display = cleanText(display);
    return item;
  }

  function summarizeKeyword(norm, display, positive, negative, search) {
    const exact = positive.filter((row) => row.match === "精准");
    const phrase = positive.filter((row) => row.match === "词组");
    const broad = positive.filter((row) => row.match === "广泛");
    const metrics = positive.reduce((acc, row) => addMetrics(acc, row.metrics), blankMetrics());
    const searchMetrics = search.reduce((acc, row) => addMetrics(acc, row.metrics), blankMetrics());
    const activeMetrics = sumActivity(metrics) ? metrics : searchMetrics;
    const calculated = calc(activeMetrics);
    const campaigns = unique([...positive.map((row) => row.campaign), ...search.map((row) => row.campaign)]);
    const adGroups = unique(positive.map((row) => `${row.adGroup} / ${row.campaign}`));
    const exactBid = averageBid(exact);
    const phraseBid = averageBid(phrase);
    const broadBid = averageBid(broad);
    const duplicate = duplicateFootprint(positive);
    const conflict = hasPositiveNegativeConflict(positive, negative);
    const hasPositive = positive.length > 0;
    const hasExact = exact.length > 0;
    const hasPhrase = phrase.length > 0;
    const hasBroad = broad.length > 0;
    const inverted = hasExact && ((broadBid && exactBid && exactBid < broadBid * 0.98) || (phraseBid && exactBid && exactBid < phraseBid * 0.98));
    const convertingSearch = searchMetrics.orders >= 1 && (!calculated.acos || calculated.acos <= state.targetAcos * 1.1);
    const decision = keywordDecision({
      hasPositive,
      hasExact,
      hasPhrase,
      hasBroad,
      inverted,
      duplicate,
      conflict,
      convertingSearch,
      metrics: activeMetrics,
      calculated,
    });
    return {
      keyword: display,
      norm,
      action: decision.action,
      score: decision.score,
      coverage: hasPositive ? matchCoverageLabel(hasExact, hasPhrase, hasBroad) : "未投放",
      matchDetails: matchDetails(exact, phrase, broad, negative),
      campaigns: campaigns.length ? campaigns.slice(0, 5).join("｜") : "-",
      campaignCount: campaigns.length,
      adGroupCount: adGroups.length,
      exactBid,
      phraseBid,
      broadBid,
      spend: activeMetrics.spend,
      sales: activeMetrics.sales,
      clicks: activeMetrics.clicks,
      orders: activeMetrics.orders,
      acos: calculated.acos,
      cvr: calculated.cvr,
      reason: decision.reason,
      searchOrders: searchMetrics.orders,
      negativeCount: negative.length,
      duplicateCount: duplicate.count,
      conflict,
    };
  }

  function keywordDecision(input) {
    let score = 100;
    const reasons = [];
    if (!input.hasPositive) {
      score -= input.convertingSearch ? 45 : 30;
      return {
        action: input.convertingSearch ? "搜索出单未承接" : "未投放",
        score: clampScore(score),
        reason: input.convertingSearch ? "搜索词已有订单但 Bulk 中没有正向关键词承接，建议新增精准词。" : "手动检查词表中存在，但 Bulk 未找到正向投放。",
      };
    }
    if (input.conflict) {
      score -= 35;
      reasons.push("同一词同时存在正向投放和否定，可能切断有效流量。");
      return { action: "正负冲突", score: clampScore(score), reason: reasons.join(" ") };
    }
    if (!input.hasExact && (input.hasBroad || input.hasPhrase)) {
      score -= 28;
      reasons.push("只有广泛/词组在探索流量，缺少精准词作为效率控制位。");
      if (input.convertingSearch) reasons.push("该词已有搜索词转化，应优先拆精准。");
      return { action: "缺精准", score: clampScore(score), reason: reasons.join(" ") };
    }
    if (input.inverted) {
      score -= 22;
      return {
        action: "竞价倒挂",
        score: clampScore(score),
        reason: "精准平均竞价低于广泛或词组；按结构建议应保持 精准 ≥ 词组 ≥ 广泛。",
      };
    }
    if (input.duplicate.count >= 3) {
      score -= 18;
      return {
        action: "重复分散",
        score: clampScore(score),
        reason: `同一词分散在 ${input.duplicate.count} 个活动/广告组/匹配组合里，可能造成管理和预算分散。`,
      };
    }
    if (input.hasExact && (input.hasBroad || input.hasPhrase)) {
      return {
        action: "结构完整",
        score: clampScore(score),
        reason: "精准负责控制效率，广泛/词组负责探索；结合表现继续微调竞价。",
      };
    }
    if (input.hasExact) {
      score -= input.metrics.clicks < 5 ? 5 : 0;
      return {
        action: "精准控制",
        score: clampScore(score),
        reason: "已进入精准控制位；如果需要拓量，再补词组/广泛并设置更低探索竞价。",
      };
    }
    return { action: "观察", score: clampScore(score), reason: "结构暂未触发强动作，继续结合点击、订单和 ACOS 判断。" };
  }

  function buildAdGroupSummaries() {
    const groups = new Map();
    state.positiveRows.forEach((row) => {
      const item = ensureAdGroup(groups, row);
      item.positive.push(row);
      item.matches[row.match] = (item.matches[row.match] || 0) + 1;
      addMetrics(item.metrics, row.metrics);
      item.keywords.add(row.keyword);
    });
    state.negativeRows.forEach((row) => {
      const item = ensureAdGroup(groups, row);
      item.negative.push(row);
      item.negativeKeywords.add(row.keyword);
    });
    return Array.from(groups.values())
      .map((item) => {
        const calculated = calc(item.metrics);
        const exact = item.matches["精准"] || 0;
        const phrase = item.matches["词组"] || 0;
        const broad = item.matches["广泛"] || 0;
        const negative = item.negative.length;
        const issue = adGroupIssue(exact, phrase, broad, negative, item.positive.length);
        return {
          campaign: item.campaign,
          adGroup: item.adGroup,
          issue,
          exact,
          phrase,
          broad,
          negative,
          keywords: item.keywords.size,
          spend: item.metrics.spend,
          sales: item.metrics.sales,
          clicks: item.metrics.clicks,
          orders: item.metrics.orders,
          acos: calculated.acos,
          sample: Array.from(item.keywords).slice(0, 8).join("｜") || Array.from(item.negativeKeywords).slice(0, 8).join("｜"),
        };
      })
      .sort((a, b) => adGroupRank(a.issue) - adGroupRank(b.issue) || b.spend - a.spend);
  }

  function ensureAdGroup(map, row) {
    const key = `${row.campaign}||${row.adGroup}`;
    if (!map.has(key)) {
      map.set(key, {
        campaign: row.campaign,
        adGroup: row.adGroup,
        positive: [],
        negative: [],
        matches: {},
        keywords: new Set(),
        negativeKeywords: new Set(),
        metrics: blankMetrics(),
      });
    }
    return map.get(key);
  }

  function adGroupIssue(exact, phrase, broad, negative, positive) {
    if (!positive && negative) return "仅否定";
    if (!exact && (phrase || broad)) return "缺精准控制";
    if (exact && phrase + broad > exact * 3) return "探索偏重";
    if (exact && (phrase || broad)) return "分层完整";
    if (exact) return "精准组";
    return "观察";
  }

  function renderKeywordChecker() {
    if (!els.keywordStatusPills) return;
    renderKeywordStatus();
    renderKeywordSummary();
    renderCampaignOptions();
    renderKeywordTables();
  }

  function renderKeywordStatus() {
    const pills = [
      { text: state.loaded ? "Bulk 已读取" : "等待 Bulk", cls: state.loaded ? "ok" : "warn" },
      { text: `${fmtInt(state.positiveRows.length)} 个正向关键词`, cls: state.positiveRows.length ? "ok" : "info" },
      { text: `${fmtInt(state.negativeRows.length)} 个否定词`, cls: state.negativeRows.length ? "info" : "warn" },
    ];
    els.keywordStatusPills.innerHTML = pills.map((pill) => `<span class="status-pill ${pill.cls}">${escapeHtml(pill.text)}</span>`).join("");
  }

  function renderKeywordSummary() {
    els.keywordEmptyState.classList.toggle("hidden", state.loaded);
    const actionCounts = countBy(state.keywordSummaries.map((row) => row.action));
    const campaigns = unique([...state.positiveRows.map((row) => row.campaign), ...state.negativeRows.map((row) => row.campaign)]);
    const adGroups = unique([...state.positiveRows.map((row) => `${row.campaign}||${row.adGroup}`), ...state.negativeRows.map((row) => `${row.campaign}||${row.adGroup}`)]);
    const kpis = [
      ["投放词", fmtInt(unique(state.positiveRows.map((row) => row.norm)).length), `${fmtInt(state.positiveRows.length)} 条记录`],
      ["广告活动", fmtInt(campaigns.length), `${fmtInt(adGroups.length)} 个广告组`],
      ["缺精准", fmtInt(actionCounts["缺精准"] || 0), "广泛/词组有投，精准缺位"],
      ["竞价倒挂", fmtInt(actionCounts["竞价倒挂"] || 0), "精准低于探索匹配"],
      ["重复分散", fmtInt(actionCounts["重复分散"] || 0), "同词跨多组重复"],
      ["否定词", fmtInt(state.negativeRows.length), `${fmtInt(actionCounts["正负冲突"] || 0)} 个冲突`],
    ];
    els.keywordKpiGrid.innerHTML = kpis
      .map(([label, value, foot]) => `<article class="kpi-card"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-foot">${escapeHtml(foot)}</div></article>`)
      .join("");
    els.keywordMathBrief.textContent = state.loaded
      ? `本模块采用课程里可验证的思想：把广告看作 Max(订单) 且受预算、库存、目标 CPS 与参考 ACOS 约束的优化问题；关键词结构用精准承接效率，用广泛/词组探索流量。`
      : "等待 Bulk 文件。这里会按“最大化订单，受预算、库存、目标 CPS 与参考 ACOS 约束”的思路检查投放结构。";
    const riskCount = sumKeys(actionCounts, ["缺精准", "竞价倒挂", "重复分散", "正负冲突", "搜索出单未承接"]);
    els.keywordRiskBadge.textContent = state.loaded ? `${riskCount} 个风险` : "未加载";
    els.keywordRiskBadge.className = riskCount ? "badge-warn" : state.loaded ? "badge-good" : "";
    els.keywordRiskBrief.textContent = state.loaded
      ? `当前优先处理：缺精准 ${actionCounts["缺精准"] || 0}，竞价倒挂 ${actionCounts["竞价倒挂"] || 0}，重复分散 ${actionCounts["重复分散"] || 0}，搜索出单未承接 ${actionCounts["搜索出单未承接"] || 0}。`
      : "重点找缺精准、竞价倒挂、重复分散、正负冲突和出单搜索词未承接。";
    els.keywordCourseBrief.textContent = "判断结果只吸收课程中可落地、可验证的部分：漏斗指标、CPS/ACOS 约束、精准/探索/否定分工；不把无法验证的经验句子当成硬规则。";
    renderKeywordInsights(actionCounts);
  }

  function renderKeywordInsights(actionCounts) {
    const rows = [
      {
        title: "优先补精准",
        body: `广泛/词组有投但缺精准的词有 ${fmtInt(actionCounts["缺精准"] || 0)} 个；这些词应先做精准承接，再看是否保留探索流量。`,
      },
      {
        title: "校正竞价层级",
        body: `竞价倒挂 ${fmtInt(actionCounts["竞价倒挂"] || 0)} 个；推荐结构是 精准 ≥ 词组 ≥ 广泛，避免探索流量抢走控制位预算。`,
      },
      {
        title: "保护流量切分",
        body: `正负冲突 ${fmtInt(actionCounts["正负冲突"] || 0)} 个；否定词要用于切分流量，而不是误伤已经出单或正在承接的词。`,
      },
    ];
    els.keywordInsightStrip.innerHTML = rows
      .map((item) => `<article class="insight-card"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span></article>`)
      .join("");
  }

  function renderCampaignOptions() {
    const current = state.filters.campaign;
    const campaigns = unique([...state.positiveRows.map((row) => row.campaign), ...state.negativeRows.map((row) => row.campaign), ...state.searchRows.map((row) => row.campaign)]).sort((a, b) => a.localeCompare(b));
    els.keywordCampaignFilter.innerHTML = ['<option value="all">全部广告活动</option>', ...campaigns.map((name) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)].join("");
    if (campaigns.includes(current)) els.keywordCampaignFilter.value = current;
    else state.filters.campaign = "all";
  }

  function renderKeywordTables() {
    const keywordRows = filteredKeywordRows();
    const columns = [
      col("标注", "action", "tag"),
      col("结构分", "score", "score"),
      col("关键词", "keyword", "text"),
      col("覆盖", "coverage", "tag"),
      col("匹配/竞价", "matchDetails", "match"),
      col("活动", "campaigns", "clip", { defaultVisible: false }),
      col("活动数", "campaignCount", "int", { defaultVisible: false }),
      col("广告组数", "adGroupCount", "int", { defaultVisible: false }),
      col("花费", "spend", "money", { defaultVisible: false }),
      col("销售额", "sales", "money", { defaultVisible: false }),
      col("点击", "clicks", "int", { defaultVisible: false }),
      col("订单", "orders", "int"),
      col("ACOS", "acos", "pct"),
      col("CVR", "cvr", "pct", { defaultVisible: false }),
      col("原因", "reason", "reason", { description: "精准承接、探索层、否定词和竞价层级的综合判断。" }),
    ];
    state.exportTableId = "keywordCoverageTable";
    state.exportColumns = columns;
    state.exportRows = keywordRows;
    els.keywordTableMeta.textContent = state.loaded
      ? `${fmtInt(keywordRows.length)} 行；${state.manualTerms.length ? "手动词表模式" : "全部投放词模式"}`
      : "等待 Bulk 文件";
    els.exportKeywordCsv.textContent = `导出 CSV (${keywordRows.length})`;
    renderTable("keywordCoverageTable", columns, keywordRows.slice(0, 420), "等待 Bulk 文件，或当前筛选下没有关键词。");

    const adGroupRows = filteredAdGroupRows();
    renderTable("adGroupCoverageTable", [
      col("结构", "issue", "tag"),
      col("广告活动", "campaign", "clip"),
      col("广告组", "adGroup", "clip"),
      col("关键词", "keywords", "int"),
      col("精准", "exact", "int"),
      col("词组", "phrase", "int", { defaultVisible: false }),
      col("广泛", "broad", "int", { defaultVisible: false }),
      col("否定", "negative", "int", { defaultVisible: false }),
      col("花费", "spend", "money"),
      col("销售额", "sales", "money", { defaultVisible: false }),
      col("订单", "orders", "int"),
      col("ACOS", "acos", "pct"),
      col("样例词", "sample", "reason"),
    ], adGroupRows.slice(0, 320), "等待 Bulk 文件，或当前筛选下没有广告组。");
    document.body.dataset.keywordChecker = JSON.stringify({
      loaded: state.loaded,
      keywordRows: keywordRows.length,
      adGroupRows: adGroupRows.length,
      actions: countBy(keywordRows.map((row) => row.action)),
    });
  }

  function filteredKeywordRows() {
    const base = state.manualTerms.length
      ? state.manualTerms.map((term) => state.keywordSummaries.find((row) => row.norm === normalizeTerm(term)) || summarizeKeyword(normalizeTerm(term), term, [], [], []))
      : state.keywordSummaries;
    return base.filter((row) => {
      const search = state.filters.search;
      const text = `${row.keyword} ${row.campaigns} ${row.action} ${row.reason} ${row.matchDetails}`.toLowerCase();
      const searchOk = !search || text.includes(search);
      const campaignOk = state.filters.campaign === "all" || row.campaigns.includes(state.filters.campaign);
      const actionOk = state.filters.action === "all" || row.action === state.filters.action;
      return searchOk && campaignOk && actionOk;
    });
  }

  function filteredAdGroupRows() {
    return state.adGroupSummaries.filter((row) => {
      const search = state.filters.search;
      const text = `${row.campaign} ${row.adGroup} ${row.issue} ${row.sample}`.toLowerCase();
      const searchOk = !search || text.includes(search);
      const campaignOk = state.filters.campaign === "all" || row.campaign === state.filters.campaign;
      return searchOk && campaignOk;
    });
  }

  function exportKeywordCsv() {
    if (!state.exportRows.length) return;
    const columns = getVisibleColumns(state.exportTableId, state.exportColumns);
    const header = columns.map((column) => column.label);
    const body = state.exportRows.map((row) => columns.map((column) => formatForExport(row[column.key], column.type)));
    const csv = [header, ...body].map((line) => line.map(csvEscape).join(",")).join("\r\n");
    document.body.dataset.lastKeywordExport = JSON.stringify({
      rows: state.exportRows.length,
      columns: columns.length,
      sample: csv.slice(0, 160),
    });
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "投放关键词检查.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function matchCoverageLabel(hasExact, hasPhrase, hasBroad) {
    if (hasExact && hasPhrase && hasBroad) return "三型覆盖";
    if (hasExact && (hasPhrase || hasBroad)) return "精准+探索";
    if (hasExact) return "仅精准";
    if (hasPhrase && hasBroad) return "词组+广泛";
    if (hasPhrase) return "仅词组";
    if (hasBroad) return "仅广泛";
    return "未投放";
  }

  function matchDetails(exact, phrase, broad, negative) {
    const parts = [];
    addMatchPart(parts, "精准", exact);
    addMatchPart(parts, "词组", phrase);
    addMatchPart(parts, "广泛", broad);
    if (negative.length) parts.push(`否定 ×${negative.length}`);
    return parts.length ? parts.join("｜") : "-";
  }

  function addMatchPart(parts, label, rows) {
    if (!rows.length) return;
    const bids = rows.map((row) => row.bid).filter((value) => value > 0);
    const bidText = bids.length ? fmtMoney(average(bids)) : "无竞价";
    parts.push(`${label} ${bidText} ×${rows.length}`);
  }

  function duplicateFootprint(rows) {
    const combos = unique(rows.map((row) => `${row.campaign}||${row.adGroup}||${row.match}`));
    return { count: combos.length };
  }

  function hasPositiveNegativeConflict(positive, negative) {
    if (!positive.length || !negative.length) return false;
    const positiveAdGroups = new Set(positive.map((row) => `${row.campaign}||${row.adGroup}`));
    return negative.some((row) => positiveAdGroups.has(`${row.campaign}||${row.adGroup}`));
  }

  function averageBid(rows) {
    const bids = rows.map((row) => row.bid).filter((value) => value > 0);
    return average(bids);
  }

  function parseManualTerms(text) {
    return unique(String(text || "")
      .split(/\r?\n|[,，;；、]+/)
      .map(cleanText)
      .filter(Boolean));
  }

  function normalizeMatch(value) {
    const raw = cleanText(value);
    const text = raw.toLowerCase();
    if (!text) return { type: "", family: "" };
    if (/negative/.test(text) || /否定/.test(raw)) {
      if (/phrase|词组/.test(text) || /词组/.test(raw)) return { type: "否定词组", family: "negative" };
      if (/exact|精准|精确/.test(text) || /精准|精确/.test(raw)) return { type: "否定精准", family: "negative" };
      return { type: "否定", family: "negative" };
    }
    if (/exact/.test(text) || /精准|精确/.test(raw)) return { type: "精准", family: "positive" };
    if (/phrase/.test(text) || /词组/.test(raw)) return { type: "词组", family: "positive" };
    if (/broad/.test(text) || /广泛/.test(raw)) return { type: "广泛", family: "positive" };
    return { type: "", family: "" };
  }

  function sheetToRows(sheet) {
    if (!sheet) return [];
    ensureRef(sheet);
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  }

  function ensureRef(sheet) {
    const keys = Object.keys(sheet).filter((key) => key[0] !== "!");
    if (!keys.length) return;
    let maxR = 0;
    let maxC = 0;
    keys.forEach((key) => {
      const cell = XLSX.utils.decode_cell(key);
      if (cell.r > maxR) maxR = cell.r;
      if (cell.c > maxC) maxC = cell.c;
    });
    if (!sheet["!ref"] || sheet["!ref"] === "A1") {
      sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    }
  }

  function findHeaderRow(rows, aliasesA, aliasesB) {
    for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
      const header = makeHeader(rows[i]);
      const hasA = findIndex(header, aliasesA) >= 0;
      const hasB = findIndex(header, aliasesB) >= 0;
      if (hasA && hasB) return i;
    }
    return -1;
  }

  function makeHeader(row) {
    return (row || []).map((item) => cleanText(item).replace(/\s+/g, ""));
  }

  function findSheetName(names, candidates) {
    const lowered = names.map((name) => [name, name.toLowerCase()]);
    for (const candidate of candidates) {
      const found = lowered.find(([, lower]) => lower.includes(candidate.toLowerCase()));
      if (found) return found[0];
    }
    return "";
  }

  function findIndex(header, aliases) {
    const normalizedAliases = aliases.map((alias) => cleanText(alias).replace(/\s+/g, ""));
    for (const alias of normalizedAliases) {
      const exact = header.findIndex((item) => item === alias);
      if (exact >= 0) return exact;
    }
    for (const alias of normalizedAliases) {
      const partial = header.findIndex((item) => item && (item.includes(alias) || alias.includes(item)));
      if (partial >= 0) return partial;
    }
    return -1;
  }

  function valueAt(row, index) {
    return index >= 0 ? row[index] : "";
  }

  function firstValue(row, indexes) {
    for (const index of indexes) {
      const value = cleanText(valueAt(row, index));
      if (value) return value;
    }
    return "";
  }

  function metricsFromRow(row, indexes) {
    return {
      impressions: toNumber(valueAt(row, indexes.impressions)),
      clicks: toNumber(valueAt(row, indexes.clicks)),
      spend: toNumber(valueAt(row, indexes.spend)),
      sales: toNumber(valueAt(row, indexes.sales)),
      orders: toNumber(valueAt(row, indexes.orders)),
      units: toNumber(valueAt(row, indexes.units)),
    };
  }

  function blankMetrics() {
    return { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0 };
  }

  function addMetrics(target, source) {
    target.impressions += source?.impressions || 0;
    target.clicks += source?.clicks || 0;
    target.spend += source?.spend || 0;
    target.sales += source?.sales || 0;
    target.orders += source?.orders || 0;
    target.units += source?.units || 0;
    return target;
  }

  function sumActivity(metrics) {
    return (metrics?.impressions || 0) + (metrics?.clicks || 0) + (metrics?.spend || 0) + (metrics?.sales || 0) + (metrics?.orders || 0);
  }

  function calc(metrics) {
    const m = metrics || blankMetrics();
    return {
      ctr: safeDivide(m.clicks, m.impressions),
      cpc: safeDivide(m.spend, m.clicks),
      cvr: safeDivide(m.orders, m.clicks),
      acos: safeDivide(m.spend, m.sales),
      roas: safeDivide(m.sales, m.spend),
      rpc: safeDivide(m.sales, m.clicks),
      aov: safeDivide(m.sales, m.orders),
      cpa: safeDivide(m.spend, m.orders),
    };
  }

  function renderTable(id, columns, rows, emptyText) {
    const table = $(id);
    if (!table) return;
    state.tableViews[id] = { columns, rows, emptyText };
    const visibleColumns = getVisibleColumns(id, columns);
    renderColumnControls(id, columns, visibleColumns);
    const head = `<thead><tr>${visibleColumns.map((column) => `<th class="${column.cls || ""}"${column.description ? ` title="${escapeAttr(column.description)}"` : ""}>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
    if (!rows.length) {
      table.innerHTML = `${head}<tbody><tr><td colspan="${visibleColumns.length}" class="small-text">${escapeHtml(emptyText)}</td></tr></tbody>`;
      return;
    }
    const body = rows.map((row) => `<tr>${visibleColumns.map((column) => tableCell(row, column)).join("")}</tr>`).join("");
    table.innerHTML = `${head}<tbody>${body}</tbody>`;
  }

  function tableCell(row, column) {
    const value = row[column.key];
    let cls = column.cls || "";
    if (["money", "pct", "signedPct", "int", "num", "score"].includes(column.type)) cls += " num";
    let html = "";
    if (column.type === "money") html = fmtMoney(value);
    else if (column.type === "pct") html = fmtPct(value);
    else if (column.type === "signedPct") html = fmtSignedPct(value);
    else if (column.type === "int") html = fmtInt(value);
    else if (column.type === "score") html = fmtInt(value);
    else if (column.type === "tag") html = tag(value);
    else html = escapeHtml(value ?? "");
    const title = ["text", "clip", "reason", "match"].includes(column.type) ? ` title="${escapeAttr(value ?? "")}"` : "";
    return `<td class="${cls.trim()}"${title}>${html}</td>`;
  }

  function col(label, key, type = "text", options = {}) {
    const clsMap = {
      text: "text-cell",
      clip: "clip-cell",
      reason: "keyword-reason",
      match: "keyword-match",
      score: "keyword-score",
    };
    return {
      label,
      key,
      type,
      cls: clsMap[type] || "",
      description: options.description || "",
      defaultVisible: options.defaultVisible !== false,
      expertVisible: options.expertVisible !== false,
    };
  }

  function renderColumnControls(tableId, columns, visibleColumns) {
    const table = $(tableId);
    const card = table?.closest(".table-card");
    if (!card || columns.length < 2) return;
    let controls = card.querySelector(`.column-controls[data-table-id="${tableId}"]`);
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "column-controls";
      controls.dataset.tableId = tableId;
      const head = card.querySelector(".table-head");
      if (head) head.insertAdjacentElement("afterend", controls);
      else card.insertBefore(controls, card.firstChild);
    }
    const prefs = loadColumnPrefs(tableId);
    const mode = prefs.mode || "default";
    const visibleKeys = new Set(visibleColumns.map((column) => column.key));
    const orderedColumns = orderedColumnsForCustom(tableId, columns);
    controls.innerHTML = `
      <div class="column-summary">
        <span>显示 ${visibleColumns.length}/${columns.length} 列</span>
        <div class="column-mode">
          ${columnModeButton(tableId, "default", "默认列", mode)}
          ${columnModeButton(tableId, "expert", "专家列", mode)}
          ${columnModeButton(tableId, "custom", "自定义列", mode)}
        </div>
      </div>
      <div class="column-picker${mode === "custom" ? "" : " hidden"}">
        ${orderedColumns.map((column) => `
          <label class="column-choice">
            <input type="checkbox" data-column-scope="keyword" data-column-toggle="${escapeAttr(column.key)}" data-table-id="${escapeAttr(tableId)}"${visibleKeys.has(column.key) ? " checked" : ""} />
            <span>${escapeHtml(column.label)}</span>
            <button type="button" data-column-scope="keyword" data-column-move="up" data-column-key="${escapeAttr(column.key)}" data-table-id="${escapeAttr(tableId)}" title="上移">↑</button>
            <button type="button" data-column-scope="keyword" data-column-move="down" data-column-key="${escapeAttr(column.key)}" data-table-id="${escapeAttr(tableId)}" title="下移">↓</button>
          </label>
        `).join("")}
      </div>
    `;
  }

  function columnModeButton(tableId, mode, label, currentMode) {
    return `<button type="button" class="${currentMode === mode ? "active" : ""}" data-column-scope="keyword" data-column-mode="${mode}" data-table-id="${escapeAttr(tableId)}">${escapeHtml(label)}</button>`;
  }

  function handleColumnControlClick(event) {
    const modeButton = event.target.closest("[data-column-mode][data-column-scope='keyword']");
    if (modeButton) {
      const tableId = modeButton.dataset.tableId;
      const prefs = loadColumnPrefs(tableId);
      prefs.mode = modeButton.dataset.columnMode;
      if (prefs.mode === "custom" && !prefs.columns?.length) {
        prefs.columns = getVisibleColumns(tableId, state.tableViews[tableId]?.columns || []).map((column) => column.key);
      }
      saveColumnPrefs(tableId, prefs);
      rerenderTable(tableId);
      return;
    }
    const moveButton = event.target.closest("[data-column-move][data-column-scope='keyword']");
    if (!moveButton) return;
    const tableId = moveButton.dataset.tableId;
    const prefs = loadColumnPrefs(tableId);
    const columns = state.tableViews[tableId]?.columns || [];
    const current = orderedColumnsForCustom(tableId, columns).map((column) => column.key);
    const index = current.indexOf(moveButton.dataset.columnKey);
    const nextIndex = moveButton.dataset.columnMove === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    prefs.mode = "custom";
    prefs.columns = current.filter((key) => (prefs.columns?.length ? prefs.columns : current).includes(key));
    saveColumnPrefs(tableId, prefs);
    rerenderTable(tableId);
  }

  function handleColumnControlChange(event) {
    const checkbox = event.target.closest("[data-column-toggle][data-column-scope='keyword']");
    if (!checkbox) return;
    const tableId = checkbox.dataset.tableId;
    const columns = state.tableViews[tableId]?.columns || [];
    const prefs = loadColumnPrefs(tableId);
    const orderedKeys = orderedColumnsForCustom(tableId, columns).map((column) => column.key);
    const current = new Set(prefs.columns?.length ? prefs.columns : getVisibleColumns(tableId, columns).map((column) => column.key));
    if (checkbox.checked) current.add(checkbox.dataset.columnToggle);
    else current.delete(checkbox.dataset.columnToggle);
    prefs.mode = "custom";
    prefs.columns = orderedKeys.filter((key) => current.has(key));
    if (!prefs.columns.length && columns[0]) prefs.columns = [columns[0].key];
    saveColumnPrefs(tableId, prefs);
    rerenderTable(tableId);
  }

  function rerenderTable(tableId) {
    const view = state.tableViews[tableId];
    if (view) renderTable(tableId, view.columns, view.rows, view.emptyText);
  }

  function getVisibleColumns(tableId, columns) {
    if (!columns.length) return [];
    const prefs = loadColumnPrefs(tableId);
    if (prefs.mode === "custom" && prefs.columns?.length) {
      const byKey = new Map(columns.map((column) => [column.key, column]));
      const selected = prefs.columns.map((key) => byKey.get(key)).filter(Boolean);
      return selected.length ? selected : [columns[0]];
    }
    const mode = prefs.mode || "default";
    const visible = columns.filter((column) => mode === "expert" ? column.expertVisible !== false : column.defaultVisible !== false);
    return visible.length ? visible : [columns[0]];
  }

  function orderedColumnsForCustom(tableId, columns) {
    const prefs = loadColumnPrefs(tableId);
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const ordered = (prefs.columns || []).map((key) => byKey.get(key)).filter(Boolean);
    const rest = columns.filter((column) => !ordered.some((item) => item.key === column.key));
    return [...ordered, ...rest];
  }

  function loadColumnPrefs(tableId) {
    try {
      return JSON.parse(localStorage.getItem(`amazonAds.columnPrefs.${tableId}`) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function saveColumnPrefs(tableId, prefs) {
    localStorage.setItem(`amazonAds.columnPrefs.${tableId}`, JSON.stringify(prefs));
  }

  function tag(value) {
    const text = String(value || "-");
    return `<span class="tag ${tagClass(text)}">${escapeHtml(text)}</span>`;
  }

  function tagClass(text) {
    if (/结构完整|精准控制|三型覆盖|精准\+探索|分层完整|精准组/.test(text)) return "green";
    if (/缺精准|竞价倒挂|探索偏重|缺精准控制|观察/.test(text)) return "amber";
    if (/正负冲突|未投放|搜索出单未承接/.test(text)) return "red";
    if (/重复分散|仅词组|仅广泛|词组|广泛/.test(text)) return "blue";
    if (/否定|仅否定/.test(text)) return "violet";
    return "";
  }

  function actionRank(action) {
    const order = ["搜索出单未承接", "正负冲突", "缺精准", "竞价倒挂", "重复分散", "未投放", "精准控制", "结构完整", "观察"];
    const index = order.indexOf(action);
    return index >= 0 ? index : order.length;
  }

  function adGroupRank(issue) {
    const order = ["缺精准控制", "探索偏重", "仅否定", "观察", "精准组", "分层完整"];
    const index = order.indexOf(issue);
    return index >= 0 ? index : order.length;
  }

  function formatForExport(value, type) {
    if (type === "money") return Math.round(Number(value) || 0);
    if (type === "pct") return fmtPct(value);
    if (type === "signedPct") return fmtSignedPct(value);
    if (type === "int" || type === "score") return Math.round(Number(value) || 0);
    return value ?? "";
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeTerm(value) {
    return cleanText(value).toLowerCase();
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const text = String(value ?? "").replace(/[¥￥,$,%\s]/g, "").replace(/,/g, "");
    if (!text) return 0;
    const number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }

  function safeDivide(a, b) {
    const numerator = Number(a) || 0;
    const denominator = Number(b) || 0;
    return denominator ? numerator / denominator : 0;
  }

  function average(values) {
    const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
    return filtered.length ? filtered.reduce((acc, value) => acc + value, 0) / filtered.length : 0;
  }

  function unique(values) {
    return Array.from(new Set(values.map(cleanText).filter(Boolean)));
  }

  function countBy(values) {
    return values.reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function sumKeys(source, keys) {
    return keys.reduce((sum, key) => sum + (source[key] || 0), 0);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampScore(value) {
    return Math.round(clamp(value, 0, 100));
  }

  function fmtMoney(value) {
    return currency.format(Number(value) || 0);
  }

  function fmtInt(value) {
    return compactNumber.format(Math.round(Number(value) || 0));
  }

  function fmtPct(value) {
    const number = Number(value) || 0;
    return `${(number * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
  }

  function fmtSignedPct(value) {
    const number = Number(value) || 0;
    const sign = number > 0 ? "+" : "";
    return `${sign}${fmtPct(number)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
