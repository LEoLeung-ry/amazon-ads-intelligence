(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = {
    files: [],
    campaignRows: [],
    targetRows: [],
    searchRows: [],
    placementRows: [],
    hourlyRows: [],
    mentorRows: [],
    productFilter: "全部",
    selectedCampaigns: new Set(),
    charts: {},
    bulkLoaded: false,
    hourlyLoaded: false,
    mentorLoaded: false,
    targetAcos: 0.3,
    tableFilters: {
      targetCampaign: "",
      targetAction: "all",
      searchCampaign: "",
      searchAction: "all",
    },
    tableExports: {
      target: { columns: [], rows: [] },
      search: { columns: [], rows: [] },
    },
  };

  const mentorRules = [
    {
      title: "冷启动先跑数据",
      body: "没有稳定点击和订单前，不急着大幅调价；先用自动、广泛和商品定向积累搜索词与 ASIN 信号。",
    },
    {
      title: "花费打不出去",
      body: "在预算上限可控时，按阶梯加价观察。讲师记录里常见动作是先给 30%，仍不足再继续小幅提高。",
    },
    {
      title: "自动广告分层",
      body: "紧密匹配、同类商品接近核心词竞价的一半；宽泛匹配、关联商品再降一档，避免泛流量抢预算。",
    },
    {
      title: "大词低 bid",
      body: "流量大词先低价跑，不一开始高抢；等转化、ACOS 和搜索词质量确认后再放量。",
    },
    {
      title: "归因期保护",
      body: "点击未出单但样本不足时先观察。7 天归因会滞后，过早否定容易砍掉正在学习的流量。",
    },
    {
      title: "稳定后再优化",
      body: "表现基本符合预期时多跑一周，避免因为单日波动造成频繁改价和算法学习中断。",
    },
    {
      title: "主推 SKU 拆分",
      body: "当广告转化和自然转化都稳定时，给主推 SKU 单独建立 KT/PT 活动，混投活动里逐步暂停对应 SKU。",
    },
    {
      title: "稳定转化抢流量",
      body: "转化率稳定且流量增长时，增长点不是 Listing 小修小补，而是抢更高质量的位置和搜索词流量。",
    },
    {
      title: "波动率监控",
      body: "稳定 SKU 的 7 天 CVR 波动超过 ±1 个百分点时预警，优先排查差评、竞品活动、价格和库存。",
    },
  ];

  const els = {};
  const currency = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
  const compactNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

  document.addEventListener("DOMContentLoaded", () => {
    [
      "dropZone",
      "fileInput",
      "browseBtn",
      "fileStack",
      "targetAcos",
      "campaignSearch",
      "productSegments",
      "selectVisibleBtn",
      "clearSelectionBtn",
      "campaignList",
      "selectionCount",
      "workspaceTitle",
      "workspaceSubtitle",
      "statusPills",
      "emptyState",
      "kpiGrid",
      "healthBadge",
      "aiBrief",
      "volatilityBadge",
      "volatilityBrief",
      "mentorBadge",
      "mentorBrief",
      "campaignTableMeta",
      "decisionStrip",
      "hourTableMeta",
      "targetCampaignFilter",
      "targetActionFilter",
      "exportTargetCsv",
      "searchCampaignFilter",
      "searchActionFilter",
      "exportSearchCsv",
      "hourlyInsightStrip",
      "placementSummary",
    ].forEach((id) => {
      els[id] = $(id);
    });
    buildLoadingMask();
    initCharts();
    bindEvents();
    renderAll();
  });

  function buildLoadingMask() {
    const mask = document.createElement("div");
    mask.className = "loading-mask";
    mask.id = "loadingMask";
    mask.innerHTML = '<div class="loading-box"><strong>正在解析广告文件</strong><span id="loadingText">读取数据结构...</span></div>';
    document.body.appendChild(mask);
    els.loadingMask = mask;
    els.loadingText = $("loadingText");
  }

  function initCharts() {
    ["campaignChart", "mixChart", "hourlyChart", "dayChart", "placementChart"].forEach((id) => {
      const el = $(id);
      if (el && window.echarts) {
        state.charts[id] = echarts.init(el, null, { renderer: "canvas" });
      }
    });
    window.addEventListener("resize", debounce(() => {
      Object.values(state.charts).forEach((chart) => chart.resize());
    }, 150));
  }

  function bindEvents() {
    els.browseBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
    els.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
    els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
    els.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
      handleFiles(event.dataTransfer.files);
    });
    els.targetAcos.addEventListener("input", () => {
      state.targetAcos = clamp(toNumber(els.targetAcos.value) / 100, 0.01, 1);
      renderAnalysis();
    });
    els.campaignSearch.addEventListener("input", () => {
      state.search = els.campaignSearch.value.trim().toLowerCase();
      renderAll();
    });
    els.targetCampaignFilter.addEventListener("input", () => {
      state.tableFilters.targetCampaign = els.targetCampaignFilter.value.trim().toLowerCase();
      renderAnalysis();
    });
    els.targetActionFilter.addEventListener("change", () => {
      state.tableFilters.targetAction = els.targetActionFilter.value;
      renderAnalysis();
    });
    els.exportTargetCsv.addEventListener("click", () => exportTableCsv("target", "标的诊断.csv"));
    els.searchCampaignFilter.addEventListener("input", () => {
      state.tableFilters.searchCampaign = els.searchCampaignFilter.value.trim().toLowerCase();
      renderAnalysis();
    });
    els.searchActionFilter.addEventListener("change", () => {
      state.tableFilters.searchAction = els.searchActionFilter.value;
      renderAnalysis();
    });
    els.exportSearchCsv.addEventListener("click", () => exportTableCsv("search", "搜索词诊断.csv"));
    els.selectVisibleBtn.addEventListener("click", () => {
      getVisibleCampaigns().forEach((row) => state.selectedCampaigns.add(row.name));
      renderAll();
    });
    els.clearSelectionBtn.addEventListener("click", () => {
      state.selectedCampaigns.clear();
      renderAll();
    });
    $("tabs").addEventListener("click", (event) => {
      const button = event.target.closest(".tab");
      if (!button) return;
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      $(`tab-${button.dataset.tab}`).classList.add("active");
      setTimeout(() => Object.values(state.charts).forEach((chart) => chart.resize()), 30);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setLoading(true, "读取上传文件...");
    for (const file of files) {
      const record = { name: file.name, status: "loading", type: "识别中" };
      state.files.unshift(record);
      renderFileStack();
      try {
        await parseFile(file, record);
        record.status = "loaded";
      } catch (error) {
        console.error(error);
        record.status = "warn";
        record.type = "未识别";
        record.note = error.message || "解析失败";
      }
      renderFileStack();
    }
    finalizeDefaultSelection();
    setLoading(false);
    renderAll();
  }

  async function parseFile(file, record) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      setLoading(true, `解析 ${file.name}`);
      const text = await readTextSmart(file);
      const rows = parseCsv(text);
      if (!rows.length) throw new Error("CSV 没有可读内容");
      const headers = normalizeHeaderRow(rows[0]);
      if (hasAny(headers, ["开始时间", "广告活动名称", "7天总销售额"])) {
        state.hourlyRows = parseHourlyRows(rows);
        state.hourlyLoaded = true;
        record.type = `每小时报告 · ${state.hourlyRows.length} 行`;
        return;
      }
      throw new Error("CSV 不是商品推广每小时报告");
    }

    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      setLoading(true, `解析 ${file.name}`);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: false,
        raw: false,
        dense: false,
        nodim: true,
      });
      const sheetNames = workbook.SheetNames || [];
      const campaignSheetName = findSheetName(sheetNames, ["商品推广活动", "Sponsored Products Campaigns"]);
      const searchSheetName = findSheetName(sheetNames, ["商品推广搜索词报告", "Sponsored Products Search Term"]);
      if (campaignSheetName || searchSheetName) {
        parseBulkWorkbook(workbook, campaignSheetName, searchSheetName);
        record.type = `Bulk · ${state.campaignRows.length} 活动`;
        state.bulkLoaded = true;
        return;
      }
      parseMentorWorkbook(workbook);
      record.type = `SciAds 记录 · ${state.mentorRows.length} 条`;
      state.mentorLoaded = true;
      return;
    }

    throw new Error("暂不支持该文件类型");
  }

  async function readTextSmart(file) {
    const buffer = await file.arrayBuffer();
    const encodings = ["utf-8", "gb18030", "gbk", "big5", "shift_jis"];
    for (const encoding of encodings) {
      try {
        return new TextDecoder(encoding, { fatal: true }).decode(buffer).replace(/^\ufeff/, "");
      } catch (error) {
        // Try the next common marketplace export encoding.
      }
    }
    return new TextDecoder("utf-8").decode(buffer).replace(/^\ufeff/, "");
  }

  function parseBulkWorkbook(workbook, campaignSheetName, searchSheetName) {
    const campaignRowsRaw = campaignSheetName ? sheetToRows(workbook.Sheets[campaignSheetName]) : [];
    const searchRowsRaw = searchSheetName ? sheetToRows(workbook.Sheets[searchSheetName]) : [];
    const campaignMap = new Map();
    const targetMap = new Map();
    const placementMap = new Map();
    const targetedByCampaign = new Map();
    const bulkCampaignMetrics = new Map();

    if (campaignRowsRaw.length > 1) {
      const header = makeHeader(campaignRowsRaw[0]);
      const indexes = {
        entity: findIndex(header, ["实体层级", "Entity"]),
        campaignId: findIndex(header, ["广告活动编号", "Campaign ID"]),
        adGroupId: findIndex(header, ["广告组编号", "Ad Group ID"]),
        campaign: findIndex(header, ["广告活动名称", "广告活动名称（仅供参考）", "Campaign Name"]),
        campaignRef: findIndex(header, ["广告活动名称（仅供参考）", "Campaign Name (Informational only)"]),
        adGroup: findIndex(header, ["广告组名称", "广告组名称（仅供参考）", "Ad Group Name"]),
        product: findIndex(header, ["SKU", "ASIN（仅供参考）", "ASIN"]),
        asin: findIndex(header, ["ASIN（仅供参考）", "ASIN"]),
        targetType: findIndex(header, ["投放类型", "Targeting Type"]),
        status: findIndex(header, ["状态", "Status"]),
        campaignStatus: findIndex(header, ["广告活动状态（仅供参考）"]),
        dailyBudget: findIndex(header, ["每日预算", "Daily Budget"]),
        defaultBid: findIndex(header, ["广告组默认竞价", "广告组默认竞价（仅供参考）"]),
        bid: findIndex(header, ["竞价", "Bid"]),
        keyword: findIndex(header, ["关键词文本", "Keyword Text"]),
        match: findIndex(header, ["匹配类型", "Match Type"]),
        bidding: findIndex(header, ["竞价方案", "Bidding Strategy"]),
        placement: findIndex(header, ["广告位", "Placement"]),
        modifier: findIndex(header, ["百分比", "Percentage"]),
        targetId: findIndex(header, ["商品投放 ID", "拓展商品投放编号", "Product Targeting ID"]),
        targetName: findIndex(header, ["拓展商品投放名称（仅供参考）", "Product Targeting Expression"]),
        impressions: findIndex(header, ["展示量", "Impressions"]),
        clicks: findIndex(header, ["点击量", "Clicks"]),
        spend: findIndex(header, ["花费", "Spend"]),
        sales: findIndex(header, ["销量", "Sales"]),
        orders: findIndex(header, ["订单数量", "Orders"]),
        units: findIndex(header, ["商品数量", "Units"]),
      };

      for (let i = 1; i < campaignRowsRaw.length; i += 1) {
        const row = campaignRowsRaw[i] || [];
        const campaign = cleanText(firstValue(row, [indexes.campaign, indexes.campaignRef]));
        if (!campaign) continue;
        const entity = cleanText(valueAt(row, indexes.entity));
        const campaignId = cleanText(valueAt(row, indexes.campaignId));
        const adGroup = cleanText(valueAt(row, indexes.adGroup));
        const adGroupId = cleanText(valueAt(row, indexes.adGroupId));
        const keyword = cleanText(valueAt(row, indexes.keyword));
        const targetName = cleanText(valueAt(row, indexes.targetName));
        const targetId = cleanText(valueAt(row, indexes.targetId));
        const placement = cleanText(valueAt(row, indexes.placement));
        const product = cleanText(firstValue(row, [indexes.asin, indexes.product]));
        const campaignRow = getOrCreateCampaign(campaignMap, campaign, {
          campaignId,
          productGroup: inferProductGroup(product, campaign),
          kind: classifyCampaign(campaign, cleanText(valueAt(row, indexes.targetType))),
          status: cleanText(firstValue(row, [indexes.campaignStatus, indexes.status])),
          budget: toNumber(valueAt(row, indexes.dailyBudget)),
          bidding: cleanText(valueAt(row, indexes.bidding)),
        });

        const metrics = metricsFromRow(row, indexes);
        if (isCampaignLevel(entity, keyword, targetName, targetId, placement)) {
          addMetrics(getMapMetric(bulkCampaignMetrics, campaign), metrics);
        }

        if (placement) {
          const key = `${campaign}||${normalizePlacement(placement)}`;
          if (!placementMap.has(key)) {
            placementMap.set(key, {
              campaign,
              productGroup: campaignRow.productGroup,
              placement: normalizePlacement(placement),
              rawPlacement: placement,
              currentModifier: parseModifier(valueAt(row, indexes.modifier)),
              metrics: blankMetrics(),
            });
          }
          const placementRow = placementMap.get(key);
          if (placementRow.currentModifier === null) {
            placementRow.currentModifier = parseModifier(valueAt(row, indexes.modifier));
          }
          addMetrics(placementRow.metrics, metrics);
          continue;
        }

        const targetText = keyword || targetName || targetId;
        if (!targetText || !isTargetEntity(entity, keyword, targetName, targetId)) continue;
        addTargetedTerm(targetedByCampaign, campaign, targetText);
        const targetKey = [
          campaignId || campaign,
          adGroupId || adGroup,
          cleanText(valueAt(row, indexes.targetId)) || keyword || targetName,
          cleanText(valueAt(row, indexes.match)),
        ].join("||");
        if (!targetMap.has(targetKey)) {
          targetMap.set(targetKey, {
            campaign,
            productGroup: campaignRow.productGroup,
            kind: classifyTarget(targetText, keyword, targetName),
            target: targetText,
            adGroup,
            matchType: cleanText(valueAt(row, indexes.match)),
            status: cleanText(valueAt(row, indexes.status)),
            bid: firstPositive([toNumber(valueAt(row, indexes.bid)), toNumber(valueAt(row, indexes.defaultBid))]),
            metrics: blankMetrics(),
            source: "bulk",
          });
        }
        const targetRow = targetMap.get(targetKey);
        targetRow.bid = targetRow.bid || firstPositive([toNumber(valueAt(row, indexes.bid)), toNumber(valueAt(row, indexes.defaultBid))]);
        addMetrics(targetRow.metrics, metrics);
      }
    }

    const searchRows = [];
    const searchTargetMetrics = new Map();
    if (searchRowsRaw.length > 1) {
      const header = makeHeader(searchRowsRaw[0]);
      const indexes = {
        campaignId: findIndex(header, ["广告活动编号", "Campaign ID"]),
        adGroupId: findIndex(header, ["广告组编号", "Ad Group ID"]),
        keywordId: findIndex(header, ["关键词编号", "Keyword ID"]),
        targetId: findIndex(header, ["商品投放 ID", "拓展商品投放编号", "Product Targeting ID"]),
        campaign: findIndex(header, ["广告活动名称（仅供参考）", "广告活动名称", "Campaign Name"]),
        adGroup: findIndex(header, ["广告组名称（仅供参考）", "广告组名称", "Ad Group Name"]),
        status: findIndex(header, ["状态", "Status"]),
        bid: findIndex(header, ["竞价", "Bid"]),
        keyword: findIndex(header, ["关键词文本", "Keyword Text"]),
        match: findIndex(header, ["匹配类型", "Match Type"]),
        targetName: findIndex(header, ["拓展商品投放名称（仅供参考）", "Product Targeting Expression"]),
        query: findIndex(header, ["顾客搜索词", "Customer Search Term", "Search Term"]),
        impressions: findIndex(header, ["展示量", "Impressions"]),
        clicks: findIndex(header, ["点击量", "Clicks"]),
        spend: findIndex(header, ["花费", "Spend"]),
        sales: findIndex(header, ["销量", "Sales"]),
        orders: findIndex(header, ["订单数量", "Orders"]),
        units: findIndex(header, ["商品数量", "Units"]),
      };

      for (let i = 1; i < searchRowsRaw.length; i += 1) {
        const row = searchRowsRaw[i] || [];
        const campaign = cleanText(valueAt(row, indexes.campaign));
        const query = cleanText(valueAt(row, indexes.query));
        if (!campaign || !query) continue;
        const campaignId = cleanText(valueAt(row, indexes.campaignId));
        const adGroup = cleanText(valueAt(row, indexes.adGroup));
        const adGroupId = cleanText(valueAt(row, indexes.adGroupId));
        const keyword = cleanText(valueAt(row, indexes.keyword));
        const targetName = cleanText(valueAt(row, indexes.targetName));
        const targetId = cleanText(firstValue(row, [indexes.keywordId, indexes.targetId]));
        const targetText = keyword || targetName || targetId || query;
        const metrics = metricsFromRow(row, indexes);
        const campaignRow = getOrCreateCampaign(campaignMap, campaign, {
          campaignId,
          productGroup: inferProductGroup("", campaign),
          kind: classifyCampaign(campaign, ""),
        });
        addMetrics(campaignRow.searchMetrics, metrics);
        addTargetedTerm(targetedByCampaign, campaign, targetText);

        const targetKey = [campaignId || campaign, adGroupId || adGroup, targetId || targetText, cleanText(valueAt(row, indexes.match))].join("||");
        if (!searchTargetMetrics.has(targetKey)) {
          searchTargetMetrics.set(targetKey, {
            campaign,
            productGroup: campaignRow.productGroup,
            kind: classifyTarget(targetText, keyword, targetName),
            target: targetText,
            adGroup,
            matchType: cleanText(valueAt(row, indexes.match)),
            status: cleanText(valueAt(row, indexes.status)),
            bid: toNumber(valueAt(row, indexes.bid)),
            metrics: blankMetrics(),
            source: "search",
          });
        }
        addMetrics(searchTargetMetrics.get(targetKey).metrics, metrics);

        searchRows.push({
          campaign,
          productGroup: campaignRow.productGroup,
          query,
          queryType: /^b0[a-z0-9]{8}$/i.test(query) ? "ASIN" : "搜索词",
          target: targetText,
          matchType: cleanText(valueAt(row, indexes.match)),
          bid: toNumber(valueAt(row, indexes.bid)),
          metrics,
        });
      }
    }

    for (const [key, target] of searchTargetMetrics.entries()) {
      const existing = targetMap.get(key);
      if (!existing || sumActivity(existing.metrics) === 0) targetMap.set(key, target);
    }

    campaignMap.forEach((campaign, name) => {
      const primary = sumActivity(campaign.searchMetrics) > 0 ? campaign.searchMetrics : bulkCampaignMetrics.get(name);
      if (primary) campaign.metrics = cloneMetrics(primary);
    });

    state.campaignRows = Array.from(campaignMap.values())
      .filter((row) => row.name)
      .map((row) => enrichMetrics(row))
      .sort((a, b) => b.metrics.spend - a.metrics.spend || b.metrics.clicks - a.metrics.clicks);
    state.targetRows = Array.from(targetMap.values())
      .filter((row) => row.campaign)
      .map((row) => enrichMetrics(row))
      .sort((a, b) => b.metrics.spend - a.metrics.spend || b.metrics.clicks - a.metrics.clicks);
    state.searchRows = searchRows.map((row) => ({
      ...row,
      productGroup: getCampaignProduct(row.campaign) || row.productGroup,
      metrics: cloneMetrics(row.metrics),
      calculated: calc(row.metrics),
    }));
    state.placementRows = Array.from(placementMap.values())
      .map((row) => enrichMetrics(row))
      .sort((a, b) => b.metrics.spend - a.metrics.spend || b.metrics.clicks - a.metrics.clicks);
    state.targetedByCampaign = targetedByCampaign;
  }

  function parseHourlyRows(rows) {
    const header = makeHeader(rows[0]);
    const indexes = {
      date: findIndex(header, ["开始日期", "Date"]),
      time: findIndex(header, ["开始时间", "Start Time", "Hour"]),
      campaign: findIndex(header, ["广告活动名称", "Campaign Name"]),
      impressions: findIndex(header, ["展示量", "Impressions"]),
      clicks: findIndex(header, ["点击量", "Clicks"]),
      spend: findIndex(header, ["花费", "Spend"]),
      orders: findIndex(header, ["7天总订单数(#)", "7天总订单数", "Orders"]),
      sales: findIndex(header, ["7天总销售额", "7 Day Total Sales", "Sales"]),
    };
    const parsed = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const campaign = cleanText(valueAt(row, indexes.campaign));
      if (!campaign) continue;
      const hour = parseHour(valueAt(row, indexes.time));
      if (hour === null) continue;
      parsed.push({
        date: cleanDate(valueAt(row, indexes.date)),
        hour,
        campaign,
        segment: daypartSegment(hour),
        metrics: {
          impressions: toNumber(valueAt(row, indexes.impressions)),
          clicks: toNumber(valueAt(row, indexes.clicks)),
          spend: toNumber(valueAt(row, indexes.spend)),
          sales: toNumber(valueAt(row, indexes.sales)),
          orders: toNumber(valueAt(row, indexes.orders)),
          units: 0,
        },
      });
    }
    return parsed;
  }

  function parseMentorWorkbook(workbook) {
    const sheetName = workbook.SheetNames[0];
    const rows = sheetToRows(workbook.Sheets[sheetName]);
    const snippets = [];
    for (let i = 0; i < rows.length; i += 1) {
      const parts = (rows[i] || []).map(cleanText).filter(Boolean);
      const text = parts.join(" / ");
      if (text.length >= 8) {
        snippets.push({
          row: i + 1,
          text: text.slice(0, 360),
        });
      }
    }
    state.mentorRows = snippets.slice(0, 120);
  }

  function renderAll() {
    renderStatus();
    renderFileStack();
    renderProductSegments();
    renderCampaignList();
    renderRules();
    renderAnalysis();
  }

  function renderStatus() {
    const pills = [
      { text: state.bulkLoaded ? "Bulk 已加载" : "Bulk 待导入", cls: state.bulkLoaded ? "ok" : "warn" },
      { text: state.hourlyLoaded ? "小时报告已联动" : "小时报告待导入", cls: state.hourlyLoaded ? "ok" : "warn" },
      { text: state.mentorLoaded ? "SciAds 已读取" : "SciAds 内置规则", cls: state.mentorLoaded ? "ok" : "info" },
    ];
    els.statusPills.innerHTML = pills.map((pill) => `<span class="status-pill ${pill.cls}">${escapeHtml(pill.text)}</span>`).join("");
  }

  function renderFileStack() {
    if (!state.files.length) {
      els.fileStack.innerHTML = "";
      return;
    }
    els.fileStack.innerHTML = state.files
      .slice(0, 5)
      .map((file) => {
        const dot = file.status === "loaded" ? "loaded" : file.status === "warn" ? "warn" : "";
        return `<div class="file-item">
          <span class="file-dot ${dot}"></span>
          <span class="file-name" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</span>
          <span class="file-type">${escapeHtml(file.type || "")}</span>
        </div>`;
      })
      .join("");
  }

  function renderProductSegments() {
    const counts = new Map();
    state.campaignRows.forEach((row) => counts.set(row.productGroup, (counts.get(row.productGroup) || 0) + 1));
    const segments = [["全部", state.campaignRows.length], ...Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12)];
    if (!segments.some(([name]) => name === state.productFilter)) state.productFilter = "全部";
    els.productSegments.innerHTML = segments
      .map(([name, count]) => `<button class="segment ${state.productFilter === name ? "active" : ""}" data-product="${escapeAttr(name)}" type="button">${escapeHtml(shorten(name, 20))} · ${count}</button>`)
      .join("");
    els.productSegments.querySelectorAll(".segment").forEach((button) => {
      button.addEventListener("click", () => {
        state.productFilter = button.dataset.product;
        renderProductSegments();
        renderCampaignList();
      });
    });
  }

  function renderCampaignList() {
    const visible = getVisibleCampaigns();
    els.selectionCount.textContent = String(state.selectedCampaigns.size);
    if (!state.bulkLoaded) {
      els.campaignList.innerHTML = '<div class="campaign-empty">导入 Bulk 文件后会出现广告活动列表。</div>';
      return;
    }
    if (!visible.length) {
      els.campaignList.innerHTML = '<div class="campaign-empty">当前筛选下没有广告活动。</div>';
      return;
    }
    const rows = visible.slice(0, 260);
    els.campaignList.innerHTML = rows
      .map((row) => {
        const selected = state.selectedCampaigns.has(row.name);
        return `<button class="campaign-item ${selected ? "selected" : ""}" type="button" data-campaign="${escapeAttr(row.name)}">
          <span class="campaign-check">${selected ? "✓" : ""}</span>
          <span class="campaign-main">
            <span class="campaign-name" title="${escapeAttr(row.name)}">${escapeHtml(row.name)}</span>
            <span class="campaign-meta">${escapeHtml(row.productGroup)} · ${escapeHtml(row.kind)} · ${fmtPct(row.calculated.acos)}</span>
          </span>
          <span class="campaign-money">${fmtMoney(row.metrics.spend)}</span>
        </button>`;
      })
      .join("");
    els.campaignList.querySelectorAll(".campaign-item").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.campaign;
        if (state.selectedCampaigns.has(name)) state.selectedCampaigns.delete(name);
        else state.selectedCampaigns.add(name);
        renderAll();
      });
    });
  }

  function renderAnalysis() {
    const selectedCampaigns = getAnalysisCampaigns();
    const selectedNames = selectedCampaigns.map((row) => row.name);
    const selectedSet = new Set(selectedNames);
    const metrics = selectedCampaigns.reduce((acc, row) => addMetrics(acc, row.metrics), blankMetrics());
    const selectedTargets = state.targetRows.filter((row) => selectedSet.has(row.campaign));
    const selectedSearch = state.searchRows.filter((row) => selectedSet.has(row.campaign));
    const selectedPlacement = state.placementRows.filter((row) => selectedSet.has(row.campaign));
    const calculated = calc(metrics);
    const hasSelection = selectedCampaigns.length > 0;

    els.emptyState.classList.toggle("hidden", state.bulkLoaded);
    els.workspaceTitle.textContent = hasSelection ? `${selectedCampaigns.length} 个广告活动正在分析` : "请选择广告活动";
    els.workspaceSubtitle.textContent = hasSelection
      ? analysisSubtitle(selectedCampaigns.length)
      : state.bulkLoaded
        ? "活动搜索为空时展示全部；输入活动名后，右侧只分析匹配活动。也可以勾选多个活动做固定组合。"
        : "拖入完整 Bulk 文件后选择多个广告活动；每小时报告会自动联动分时效率。";

    renderKpis(metrics, calculated, selectedCampaigns.length, selectedSearch.length);
    renderBrief(metrics, calculated, selectedTargets, selectedSearch);
    renderCampaignTable(selectedCampaigns);
    renderTargetDiagnostics(selectedTargets, metrics);
    renderSearchDiagnostics(selectedSearch, metrics);
    renderHourly(selectedNames);
    renderPlacement(selectedPlacement, metrics);
    renderMentorTable();
    renderCharts(selectedCampaigns, selectedTargets, selectedPlacement, selectedNames);
  }

  function renderKpis(metrics, calculated, campaignCount, searchCount) {
    const items = [
      ["花费", fmtKpiMoney(metrics.spend), `CPC ${fmtMoney(calculated.cpc)}`],
      ["销售额", fmtKpiMoney(metrics.sales), `RPC ${fmtMoney(calculated.rpc)}`],
      ["ACOS", fmtPct(calculated.acos), calculated.acos <= state.targetAcos ? "低于目标" : "高于目标"],
      ["ROAS", fmtNumber(calculated.roas, 2), `目标 ${fmtNumber(1 / state.targetAcos, 2)}`],
      ["订单", fmtInt(metrics.orders), `CVR ${fmtPct(calculated.cvr)}`],
      ["点击", fmtInt(metrics.clicks), `CTR ${fmtPct(calculated.ctr)}`],
      ["活动", fmtInt(campaignCount), `${fmtInt(searchCount)} 条搜索词`],
    ];
    els.kpiGrid.innerHTML = items
      .map(([label, value, foot]) => `<article class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${escapeHtml(foot)}</div></article>`)
      .join("");
  }

  function renderBrief(metrics, calculated, targets, searchRows) {
    const actionCounts = countBy(targets.map((row) => targetAction(row, metrics).action));
    const searchActions = countBy(searchRows.map((row) => searchDecision(row, metrics).action));
    const cpa = safeDivide(metrics.spend, metrics.orders);
    const targetCpa = safeDivide(metrics.sales, metrics.orders) * state.targetAcos;
    let badgeClass = "badge-good";
    let badge = "健康";
    if (!metrics.clicks) {
      badge = "待选择";
      badgeClass = "";
    } else if (calculated.acos > state.targetAcos * 1.35) {
      badge = "需控费";
      badgeClass = "badge-bad";
    } else if (calculated.acos > state.targetAcos) {
      badge = "偏高";
      badgeClass = "badge-warn";
    }
    els.healthBadge.textContent = badge;
    els.healthBadge.className = badgeClass;

    const brief = [];
    if (!metrics.clicks) {
      brief.push("先从左侧选择广告活动，系统会把 Bulk、搜索词和小时报告缩小到这组活动后再计算。");
    } else {
      brief.push(`当前 ACOS ${fmtPct(calculated.acos)}，目标 ${fmtPct(state.targetAcos)}，单次点击销售额 ${fmtMoney(calculated.rpc)}。`);
      if (calculated.acos <= state.targetAcos * 0.8 && metrics.orders >= 3) {
        brief.push("转化和回报处在可放量区间，优先看高 RPC 的广告位、精准词和高转化 ASIN。");
      } else if (calculated.acos > state.targetAcos * 1.35) {
        brief.push(`实际 CPA ${fmtMoney(cpa)} 已明显高于目标 CPA ${fmtMoney(targetCpa)}，先处理无单高花费标的和否定词。`);
      } else {
        brief.push("整体还在可控区间，适合用小步调价保护学习期，同时把高质量搜索词拆出来。");
      }
      brief.push(`标的动作：放量 ${actionCounts["放量"] || 0}，降价 ${actionCounts["降价"] || 0}，止损 ${actionCounts["止损"] || 0}；搜索词建议加词 ${sumKeys(searchActions, ["加精准词", "加商品定向"])}，否定 ${searchActions["否定"] || 0}。`);
    }
    els.aiBrief.textContent = brief.join(" ");

    els.mentorBadge.textContent = state.mentorLoaded ? "已加载" : "内置";
    els.mentorBrief.textContent = state.mentorLoaded
      ? `已读取 ${state.mentorRows.length} 条陪跑记录。当前规则会优先保护归因期，花费打不出去才阶梯加价，稳定转化后再抢流量。`
      : "内置 SciAds 陪跑逻辑：先积累数据，再小步加价；稳定转化率的 SKU，后续增长重点在抢流量。";
  }

  function renderCampaignTable(rows) {
    els.campaignTableMeta.textContent = rows.length ? `${rows.length} 个已选活动` : "";
    const tableRows = rows
      .slice()
      .sort((a, b) => b.metrics.spend - a.metrics.spend)
      .map((row) => {
        const status = campaignStatus(row);
        return {
          name: row.name,
          product: row.productGroup,
          kind: row.kind,
          spend: row.metrics.spend,
          sales: row.metrics.sales,
          clicks: row.metrics.clicks,
          orders: row.metrics.orders,
          acos: row.calculated.acos,
          cvr: row.calculated.cvr,
          rpc: row.calculated.rpc,
          status,
        };
      });
    renderTable("campaignTable", [
      col("活动", "name", "full"),
      col("产品组", "product"),
      col("类型", "kind", "tag"),
      col("花费", "spend", "money"),
      col("销售额", "sales", "money"),
      col("点击", "clicks", "int"),
      col("订单", "orders", "int"),
      col("ACOS", "acos", "pct"),
      col("CVR", "cvr", "pct"),
      col("RPC", "rpc", "money"),
      col("判断", "status", "tag"),
    ], tableRows, "左侧选择广告活动后显示。");
  }

  function renderTargetDiagnostics(rows, globalMetrics) {
    const enriched = rows
      .map((row) => {
        const action = targetAction(row, globalMetrics);
        return {
          campaign: row.campaign,
          target: row.target,
          kind: row.kind,
          match: row.matchType || "-",
          spend: row.metrics.spend,
          sales: row.metrics.sales,
          clicks: row.metrics.clicks,
          orders: row.metrics.orders,
          acos: row.calculated.acos,
          cvr: row.calculated.cvr,
          bid: row.bid,
          recBid: action.recBid,
          bidChange: action.bidChange,
          action: action.action,
          reason: action.reason,
        };
      })
      .sort((a, b) => actionPriority(a.action) - actionPriority(b.action) || b.spend - a.spend);
    const filtered = enriched.filter((row) => {
      const campaignOk = !state.tableFilters.targetCampaign || row.campaign.toLowerCase().includes(state.tableFilters.targetCampaign);
      const actionOk = state.tableFilters.targetAction === "all" || row.action === state.tableFilters.targetAction;
      return campaignOk && actionOk;
    });
    const columns = [
      col("动作", "action", "tag"),
      col("标的", "target", "text"),
      col("活动", "campaign", "clip"),
      col("类型", "kind", "tag"),
      col("匹配", "match"),
      col("花费", "spend", "money"),
      col("销售额", "sales", "money"),
      col("点击", "clicks", "int"),
      col("订单", "orders", "int"),
      col("ACOS", "acos", "pct"),
      col("CVR", "cvr", "pct"),
      col("当前竞价", "bid", "money"),
      col("建议竞价", "recBid", "money"),
      col("调价", "bidChange", "signedPct"),
      col("原因", "reason", "small"),
    ];
    state.tableExports.target = { columns, rows: filtered };
    els.exportTargetCsv.textContent = `导出 CSV (${filtered.length})`;
    renderTable("targetTable", columns, filtered.slice(0, 260), "没有可诊断的标的。");
  }

  function renderSearchDiagnostics(rows, globalMetrics) {
    const decisions = rows
      .map((row) => {
        const decision = searchDecision(row, globalMetrics);
        return {
          action: decision.action,
          query: row.query,
          queryType: row.queryType,
          campaign: row.campaign,
          target: row.target,
          spend: row.metrics.spend,
          sales: row.metrics.sales,
          clicks: row.metrics.clicks,
          orders: row.metrics.orders,
          acos: row.calculated.acos,
          cvr: row.calculated.cvr,
          reason: decision.reason,
        };
      })
      .sort((a, b) => actionPriority(a.action) - actionPriority(b.action) || b.spend - a.spend);
    const filtered = decisions.filter((row) => {
      const campaignOk = !state.tableFilters.searchCampaign || row.campaign.toLowerCase().includes(state.tableFilters.searchCampaign);
      const actionOk = state.tableFilters.searchAction === "all" || row.action === state.tableFilters.searchAction;
      return campaignOk && actionOk;
    });
    const counts = countBy(filtered.map((row) => row.action));
    const pills = [
      ["加精准词", counts["加精准词"] || 0],
      ["加商品定向", counts["加商品定向"] || 0],
      ["否定", counts["否定"] || 0],
      ["保留/加预算", counts["保留/加预算"] || 0],
      ["观察", counts["观察"] || 0],
    ];
    els.decisionStrip.innerHTML = pills.map(([label, value]) => `<div class="metric-pill"><b>${fmtInt(value)}</b><span>${label}</span></div>`).join("");
    const columns = [
      col("动作", "action", "tag"),
      col("搜索词 / ASIN", "query", "text"),
      col("类型", "queryType", "tag"),
      col("活动", "campaign", "clip"),
      col("来源标的", "target", "small"),
      col("花费", "spend", "money"),
      col("销售额", "sales", "money"),
      col("点击", "clicks", "int"),
      col("订单", "orders", "int"),
      col("ACOS", "acos", "pct"),
      col("CVR", "cvr", "pct"),
      col("原因", "reason", "small"),
    ];
    state.tableExports.search = { columns, rows: filtered };
    els.exportSearchCsv.textContent = `导出 CSV (${filtered.length})`;
    renderTable("searchTable", columns, filtered.slice(0, 260), "没有搜索词数据。");
  }

  function renderHourly(selectedNames) {
    const selectedSet = new Set(selectedNames);
    const rows = state.hourlyRows.filter((row) => selectedSet.has(row.campaign));
    if (!state.hourlyLoaded) {
      els.volatilityBadge.textContent = "待联动";
      els.volatilityBadge.className = "";
      els.volatilityBrief.textContent = "导入商品推广每小时报告后，会自动寻找高 RPC、高 CVR 且样本足够的连续小时段。";
      els.hourTableMeta.textContent = "导入每小时报告后显示";
      els.hourlyInsightStrip.innerHTML = "";
      renderTable("hourTable", [col("小时", "hour"), col("分段", "segment"), col("点击", "clicks", "int"), col("销售额", "sales", "money")], [], "未导入每小时报告。");
      clearChart("hourlyChart", "等待小时报告");
      clearChart("dayChart", "等待小时报告");
      return;
    }
    if (!rows.length) {
      els.volatilityBadge.textContent = "无匹配";
      els.volatilityBadge.className = "badge-warn";
      els.volatilityBrief.textContent = "每小时报告已加载，但当前选择的活动没有匹配到小时数据。";
      els.hourTableMeta.textContent = "当前活动无小时数据";
      els.hourlyInsightStrip.innerHTML = "";
      renderTable("hourTable", [col("小时", "hour"), col("分段", "segment"), col("点击", "clicks", "int"), col("销售额", "sales", "money")], [], "当前活动无小时数据。");
      clearChart("hourlyChart", "无匹配小时数据");
      clearChart("dayChart", "无匹配日数据");
      return;
    }

    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, segment: daypartSegment(hour), metrics: blankMetrics() }));
    const byDay = new Map();
    const bySegment = new Map();
    const totalMetrics = blankMetrics();
    rows.forEach((row) => {
      addMetrics(hourly[row.hour].metrics, row.metrics);
      addMetrics(totalMetrics, row.metrics);
      addMetrics(getMapMetric(byDay, row.date || "未知日期"), row.metrics);
      addMetrics(getMapMetric(bySegment, row.segment), row.metrics);
    });
    const segmentAdvice = computeDaypartAdvice(bySegment);
    const hourAnalysis = analyzeHourlyWindows(hourly, totalMetrics);
    const tableRows = hourAnalysis.hourRows;
    const base = segmentAdvice["01-07"];
    const morning = segmentAdvice["07-13"];
    const afternoon = segmentAdvice["13-01"];
    const windowText = hourAnalysis.windows.length ? hourAnalysis.windows.map((win) => `${win.label} ${fmtSignedPct(win.adjustment)}`).join(" · ") : "未发现稳定加价窗口";
    els.hourTableMeta.textContent = `自动窗口：${windowText}`;
    renderHourlyInsights(hourAnalysis, base, morning, afternoon);
    renderTable("hourTable", [
      col("小时", "hour"),
      col("旧分段", "segment", "tag"),
      col("点击", "clicks", "int"),
      col("花费", "spend", "money"),
      col("销售额", "sales", "money"),
      col("订单", "orders", "int"),
      col("CVR", "cvr", "pct"),
      col("RPC", "rpc", "money", "RPC = 7天总销售额 / 点击量，用来衡量每次点击带来的销售额。"),
      col("RPC提升", "uplift", "signedPct"),
      col("建议加价", "advice", "signedPct"),
      col("判断", "hourStatus", "tag"),
    ], tableRows, "没有小时数据。");

    const dailyRows = Array.from(byDay.entries())
      .map(([date, metrics]) => ({ date, metrics: cloneMetrics(metrics), calculated: calc(metrics) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    renderVolatility(dailyRows, hourAnalysis, segmentAdvice);
    renderHourlyChart(tableRows);
    renderDayChart(dailyRows);
  }

  function renderVolatility(dailyRows, hourAnalysis, segmentAdvice) {
    if (dailyRows.length < 3) {
      els.volatilityBadge.textContent = "样本少";
      els.volatilityBadge.className = "badge-warn";
      els.volatilityBrief.textContent = "当前选中活动的日数据不足，先观察更多天数再判断稳定性。";
      return;
    }
    const last7 = dailyRows.slice(-7).filter((row) => row.metrics.clicks > 0);
    const cvrValues = last7.map((row) => row.calculated.cvr).filter(Number.isFinite);
    const rpcValues = last7.map((row) => row.calculated.rpc).filter(Number.isFinite);
    const cvrMean = average(cvrValues);
    const maxCvrDev = cvrValues.length ? Math.max(...cvrValues.map((v) => Math.abs(v - cvrMean))) : 0;
    const rpcMean = average(rpcValues);
    const rpcDev = rpcMean ? Math.max(...rpcValues.map((v) => Math.abs(v / rpcMean - 1))) : 0;
    const warn = maxCvrDev > 0.01;
    els.volatilityBadge.textContent = warn ? "预警" : "稳定";
    els.volatilityBadge.className = warn ? "badge-bad" : "badge-good";
    const dynamicText = hourAnalysis.windows.length
      ? hourAnalysis.windows.map((win) => `${win.label} ${fmtSignedPct(win.adjustment)}`).join("，")
      : "暂不加价";
    const morning = segmentAdvice["07-13"]?.adjustment || 0;
    const afternoon = segmentAdvice["13-01"]?.adjustment || 0;
    els.volatilityBrief.textContent = `近 ${last7.length} 天 CVR 均值 ${fmtPct(cvrMean)}，最大偏离 ${fmtPct(maxCvrDev)}；RPC 波动 ${fmtPct(rpcDev)}。自动时段建议：${dynamicText}。原三段参考：07-13 ${fmtSignedPct(morning)}，13-01 ${fmtSignedPct(afternoon)}。`;
  }

  function renderHourlyInsights(hourAnalysis, base, morning, afternoon) {
    const dynamic = hourAnalysis.windows.length
      ? hourAnalysis.windows.map((win) => `${win.label} ${fmtSignedPct(win.adjustment)}`).join(" · ")
      : "暂不建议加价";
    els.hourlyInsightStrip.innerHTML = [
      {
        title: "RPC = 销售额 / 点击",
        body: `当前整体 RPC ${fmtMoney(hourAnalysis.baseRpc)}；只有样本够、RPC 高于基准且 CVR 没有明显走弱的小时才会进入加价窗口。`,
      },
      {
        title: "自动发现窗口",
        body: dynamic,
      },
      {
        title: "原三段参考",
        body: `01-07 基准 ${fmtMoney(base?.rpc || 0)}；07-13 ${fmtSignedPct(morning?.adjustment || 0)}；13-01 ${fmtSignedPct(afternoon?.adjustment || 0)}。`,
      },
    ]
      .map((item) => `<article class="insight-card"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span></article>`)
      .join("");
  }

  function analyzeHourlyWindows(hourly, totalMetrics) {
    const total = calc(totalMetrics);
    const baseRpc = total.rpc || 0;
    const baseCvr = total.cvr || 0;
    const minClicks = Math.max(10, Math.ceil((totalMetrics.clicks || 0) * 0.006));
    const hourRows = hourly.map((row) => {
      const calculated = calc(row.metrics);
      const uplift = baseRpc ? calculated.rpc / baseRpc - 1 : 0;
      const sampleOk = row.metrics.clicks >= minClicks || row.metrics.orders >= 2;
      const cvrOk = !baseCvr || calculated.cvr >= baseCvr * 0.8 || row.metrics.orders >= 2;
      const candidate = sampleOk && cvrOk && uplift >= 0.08;
      const advice = candidate ? clamp(uplift * 0.6, 0.02, 0.6) : 0;
      return {
        hourNumber: row.hour,
        hour: `${String(row.hour).padStart(2, "0")}:00`,
        segment: row.segment,
        clicks: row.metrics.clicks,
        spend: row.metrics.spend,
        sales: row.metrics.sales,
        orders: row.metrics.orders,
        cvr: calculated.cvr,
        rpc: calculated.rpc,
        uplift,
        advice,
        hourStatus: advice > 0 ? "可加价" : sampleOk ? "观察" : "样本少",
        metrics: row.metrics,
      };
    });
    const windows = buildHourWindows(hourRows, baseRpc)
      .filter((window) => window.adjustment > 0 && window.metrics.clicks >= minClicks)
      .sort((a, b) => b.adjustment - a.adjustment)
      .slice(0, 4);
    return { hourRows, windows, baseRpc, baseCvr, minClicks };
  }

  function buildHourWindows(hourRows, baseRpc) {
    const flags = hourRows.map((row) => row.advice > 0);
    if (!flags.some(Boolean)) return [];
    if (flags.every(Boolean)) return [hourWindowFromHours(hourRows, hourRows.map((row) => row.hourNumber), baseRpc)];
    const start = flags.findIndex((flag, index) => flag && !flags[(index + 23) % 24]);
    const windows = [];
    let current = [];
    for (let offset = 0; offset < 24; offset += 1) {
      const hour = (start + offset) % 24;
      if (flags[hour]) {
        current.push(hour);
      } else if (current.length) {
        windows.push(hourWindowFromHours(hourRows, current, baseRpc));
        current = [];
      }
    }
    if (current.length) windows.push(hourWindowFromHours(hourRows, current, baseRpc));
    return windows;
  }

  function hourWindowFromHours(hourRows, hours, baseRpc) {
    const metrics = hours.reduce((acc, hour) => addMetrics(acc, hourRows[hour].metrics), blankMetrics());
    const calculated = calc(metrics);
    const uplift = baseRpc ? calculated.rpc / baseRpc - 1 : 0;
    const adjustment = clamp(Math.max(0, uplift * 0.6), 0, 0.6);
    const start = hours[0];
    const end = (hours[hours.length - 1] + 1) % 24;
    return {
      label: `${String(start).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00`,
      hours,
      metrics,
      rpc: calculated.rpc,
      cvr: calculated.cvr,
      uplift,
      adjustment,
    };
  }

  function renderPlacement(rows, globalMetrics) {
    if (!rows.length) {
      els.placementSummary.innerHTML = "";
      renderTable("placementTable", [
        col("活动", "campaign", "clip"),
        col("广告位", "placement", "tag"),
        col("建议加成", "recommended", "signedPct"),
      ], [], "Bulk 中没有可用广告位数据。");
      clearChart("placementChart", "无广告位数据");
      return;
    }
    const byCampaign = groupBy(rows, (row) => row.campaign);
    const output = [];
    byCampaign.forEach((items, campaign) => {
      const ros = items.find((row) => row.placement === "其余位置");
      const campaignMetrics = state.campaignRows.find((row) => row.name === campaign)?.metrics || globalMetrics;
      const baseRpc = ros && ros.metrics.clicks >= 10 && calc(ros.metrics).rpc > 0 ? calc(ros.metrics).rpc : calc(campaignMetrics).rpc;
      items.forEach((row) => {
        const c = calc(row.metrics);
        const uplift = baseRpc > 0 ? c.rpc / baseRpc - 1 : 0;
        const recommended = row.placement === "其余位置" ? 0 : clamp(Math.max(0, uplift * 0.6), 0, 4);
        output.push({
          campaign: row.campaign,
          placement: row.placement,
          current: row.currentModifier,
          spend: row.metrics.spend,
          sales: row.metrics.sales,
          clicks: row.metrics.clicks,
          orders: row.metrics.orders,
          rpc: c.rpc,
          acos: c.acos,
          recommended,
          reason: baseRpc ? `相对基准 RPC ${fmtSignedPct(uplift)}，按 60% 保守放大` : "缺少基准点击，暂不加成",
        });
      });
    });
    output.sort((a, b) => b.recommended - a.recommended || b.spend - a.spend);
    renderPlacementSummary(output);
    renderTable("placementTable", [
      col("活动", "campaign", "clip"),
      col("广告位", "placement", "tag"),
      col("当前加成", "current", "signedPct"),
      col("建议加成", "recommended", "signedPct"),
      col("花费", "spend", "money"),
      col("销售额", "sales", "money"),
      col("点击", "clicks", "int"),
      col("订单", "orders", "int"),
      col("RPC", "rpc", "money"),
      col("ACOS", "acos", "pct"),
      col("原因", "reason", "small"),
    ], output.slice(0, 160), "Bulk 中没有可用广告位数据。");
  }

  function renderPlacementSummary(rows) {
    const positive = rows.filter((row) => row.recommended > 0);
    const best = positive[0] || rows.slice().sort((a, b) => b.rpc - a.rpc)[0];
    const byPlacement = groupBy(rows, (row) => row.placement);
    const placementText = Array.from(byPlacement.entries())
      .map(([placement, items]) => {
        const metrics = items.reduce((acc, row) => addMetrics(acc, {
          impressions: 0,
          clicks: row.clicks,
          spend: row.spend,
          sales: row.sales,
          orders: row.orders,
          units: 0,
        }), blankMetrics());
        return `${placement} RPC ${fmtMoney(calc(metrics).rpc)}`;
      })
      .join(" · ");
    els.placementSummary.innerHTML = [
      {
        title: positive.length ? `${positive.length} 个广告位可加成` : "暂无明确加成",
        body: positive.length ? `最高建议：${best.placement} ${fmtSignedPct(best.recommended)}。` : "当前广告位表现没有明显跑赢基准，先保持或小幅测试。",
      },
      {
        title: "判断口径",
        body: "用广告位 RPC 相对基准提升 × 60% 做保守加成，避免广告位样本波动导致过度调价。",
      },
      {
        title: "广告位效率",
        body: placementText || "暂无广告位效率数据。",
      },
    ]
      .map((item) => `<article class="insight-card"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span></article>`)
      .join("");
  }

  function renderMentorTable() {
    renderTable("mentorTable", [
      col("行号", "row", "int"),
      col("内容", "text", "text"),
    ], state.mentorRows, "上传 SciAds 陪跑聊天记录后显示摘录。");
  }

  function renderRules() {
    $("rulesGrid").innerHTML = mentorRules
      .map((rule) => `<article class="rule-card"><h3>${escapeHtml(rule.title)}</h3><p>${escapeHtml(rule.body)}</p></article>`)
      .join("");
  }

  function renderCharts(selectedCampaigns, selectedTargets, selectedPlacement, selectedNames) {
    renderCampaignChart(selectedCampaigns);
    renderMixChart(selectedTargets);
    renderPlacementChart(selectedPlacement);
    if (!state.hourlyLoaded) {
      clearChart("hourlyChart", "等待小时报告");
      clearChart("dayChart", "等待小时报告");
    }
    if (!selectedNames.length) {
      clearChart("campaignChart", "选择广告活动");
      clearChart("mixChart", "选择广告活动");
      clearChart("placementChart", "选择广告活动");
    }
  }

  function renderCampaignChart(rows) {
    const chart = state.charts.campaignChart;
    if (!chart) return;
    if (!rows.length) return clearChart("campaignChart", "选择广告活动");
    const top = rows.slice().sort((a, b) => b.metrics.spend - a.metrics.spend).slice(0, 12).reverse();
    chart.setOption({
      color: ["#2563eb", "#0f766e", "#d97706"],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (items) => {
          const index = items?.[0]?.dataIndex ?? 0;
          const row = top[index];
          const lines = [`<b>${escapeHtml(row.name)}</b>`];
          items.forEach((item) => lines.push(`${item.marker}${escapeHtml(item.seriesName)}：${fmtMoney(item.value)}`));
          return lines.join("<br/>");
        },
      },
      grid: { left: 220, right: 42, top: 36, bottom: 34 },
      legend: { top: 4, itemWidth: 10, itemHeight: 10, textStyle: { color: "#475569" } },
      xAxis: { type: "value", axisLabel: { formatter: (v) => fmtShortMoney(v), color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
      yAxis: { type: "category", data: top.map((row) => row.name), axisLabel: { color: "#334155", formatter: (value) => wrapLabel(value, 18) } },
      series: [
        { name: "花费", type: "bar", data: top.map((row) => row.metrics.spend), barWidth: 12 },
        { name: "销售额", type: "bar", data: top.map((row) => row.metrics.sales), barWidth: 12 },
      ],
    }, true);
  }

  function renderMixChart(rows) {
    const chart = state.charts.mixChart;
    if (!chart) return;
    if (!rows.length) return clearChart("mixChart", "无标的数据");
    const globalMetrics = rows.reduce((acc, item) => addMetrics(acc, item.metrics), blankMetrics());
    const counts = countBy(rows.map((row) => targetAction(row, globalMetrics).action));
    const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
    chart.setOption({
      color: ["#16a34a", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#64748b"],
      tooltip: { trigger: "item" },
      legend: { bottom: 0, textStyle: { color: "#475569" } },
      series: [
        {
          type: "pie",
          radius: ["42%", "72%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          label: { formatter: "{b}\n{c}", color: "#334155" },
          data,
        },
      ],
    }, true);
  }

  function renderHourlyChart(rows) {
    const chart = state.charts.hourlyChart;
    if (!chart) return;
    chart.setOption({
      color: ["#0f766e", "#2563eb", "#d97706", "#7c3aed"],
      tooltip: {
        trigger: "axis",
        formatter: (items) => {
          const index = items?.[0]?.dataIndex ?? 0;
          const row = rows[index];
          return [
            `<b>${row.hour}</b>`,
            `花费：${fmtMoney(row.spend)}`,
            `RPC：${fmtMoney(row.rpc)}`,
            `CVR：${fmtPct(row.cvr)}`,
            `建议加价：${fmtSignedPct(row.advice)}`,
          ].join("<br/>");
        },
      },
      legend: { top: 4, itemWidth: 10, itemHeight: 10 },
      grid: { left: 48, right: 52, top: 44, bottom: 32 },
      xAxis: { type: "category", data: rows.map((row) => row.hour), axisLabel: { color: "#64748b" } },
      yAxis: [
        { type: "value", axisLabel: { formatter: (v) => fmtShortMoney(v), color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
        { type: "value", axisLabel: { formatter: (v) => `${Math.round(v * 100)}%`, color: "#64748b" } },
      ],
      series: [
        { name: "花费", type: "bar", data: rows.map((row) => row.spend), barWidth: 10 },
        { name: "RPC", type: "line", smooth: true, data: rows.map((row) => row.rpc), symbolSize: 5 },
        { name: "CVR", type: "line", smooth: true, yAxisIndex: 1, data: rows.map((row) => row.cvr), symbolSize: 5 },
        { name: "建议加价", type: "line", smooth: true, yAxisIndex: 1, data: rows.map((row) => row.advice), symbolSize: 5 },
      ],
    }, true);
  }

  function renderDayChart(rows) {
    const chart = state.charts.dayChart;
    if (!chart) return;
    if (!rows.length) return clearChart("dayChart", "无日数据");
    chart.setOption({
      color: ["#2563eb", "#0f766e"],
      tooltip: { trigger: "axis" },
      legend: { top: 4, itemWidth: 10, itemHeight: 10 },
      grid: { left: 48, right: 52, top: 44, bottom: 40 },
      xAxis: { type: "category", data: rows.map((row) => row.date), axisLabel: { color: "#64748b", rotate: rows.length > 8 ? 35 : 0 } },
      yAxis: [
        { type: "value", axisLabel: { formatter: (v) => `${Math.round(v * 100)}%`, color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
        { type: "value", axisLabel: { formatter: (v) => fmtShortMoney(v), color: "#64748b" } },
      ],
      series: [
        { name: "CVR", type: "line", smooth: true, data: rows.map((row) => row.calculated.cvr), symbolSize: 6 },
        { name: "RPC", type: "line", smooth: true, yAxisIndex: 1, data: rows.map((row) => row.calculated.rpc), symbolSize: 6 },
      ],
    }, true);
  }

  function renderPlacementChart(rows) {
    const chart = state.charts.placementChart;
    if (!chart) return;
    if (!rows.length) return clearChart("placementChart", "无广告位数据");
    const byPlacement = new Map();
    rows.forEach((row) => addMetrics(getMapMetric(byPlacement, row.placement), row.metrics));
    const items = Array.from(byPlacement.entries()).map(([placement, metrics]) => {
      const c = calc(metrics);
      return { placement, spend: metrics.spend, sales: metrics.sales, rpc: c.rpc, acos: c.acos };
    });
    chart.setOption({
      color: ["#0f766e", "#2563eb", "#d97706"],
      tooltip: { trigger: "axis" },
      legend: { top: 4, itemWidth: 10, itemHeight: 10 },
      grid: { left: 58, right: 48, top: 46, bottom: 32 },
      xAxis: { type: "category", data: items.map((row) => row.placement), axisLabel: { color: "#475569" } },
      yAxis: [
        { type: "value", axisLabel: { formatter: (v) => fmtShortMoney(v), color: "#64748b" }, splitLine: { lineStyle: { color: "#edf2f7" } } },
        { type: "value", axisLabel: { formatter: (v) => `${Math.round(v * 100)}%`, color: "#64748b" } },
      ],
      series: [
        { name: "RPC", type: "bar", data: items.map((row) => row.rpc), barWidth: 28 },
        { name: "花费", type: "bar", data: items.map((row) => row.spend), barWidth: 28 },
        { name: "ACOS", type: "line", yAxisIndex: 1, smooth: true, data: items.map((row) => row.acos), symbolSize: 7 },
      ],
    }, true);
  }

  function renderTable(id, columns, rows, emptyText) {
    const table = $(id);
    if (!table) return;
    const head = `<thead><tr>${columns.map((column) => `<th class="${column.cls || ""}"${column.tooltip ? ` title="${escapeAttr(column.tooltip)}"` : ""}>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>`;
    if (!rows.length) {
      table.innerHTML = `${head}<tbody><tr><td colspan="${columns.length}" class="small-text">${escapeHtml(emptyText)}</td></tr></tbody>`;
      return;
    }
    const body = rows
      .map((row) => `<tr>${columns.map((column) => tableCell(row, column)).join("")}</tr>`)
      .join("");
    table.innerHTML = `${head}<tbody>${body}</tbody>`;
  }

  function exportTableCsv(key, filename) {
    const table = state.tableExports[key];
    if (!table || !table.rows.length) return;
    const header = table.columns.map((column) => column.label);
    const body = table.rows.map((row) => table.columns.map((column) => formatForExport(row[column.key], column.type)));
    const csv = [header, ...body]
      .map((line) => line.map(csvEscape).join(","))
      .join("\r\n");
    document.body.dataset.lastExport = JSON.stringify({
      key,
      filename,
      rows: table.rows.length,
      columns: table.columns.length,
      sample: csv.slice(0, 160),
    });
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function formatForExport(value, type) {
    if (type === "money") return Math.round(Number(value) || 0);
    if (type === "pct") return fmtPct(value);
    if (type === "signedPct") return fmtSignedPct(value);
    if (type === "int") return Math.round(Number(value) || 0);
    if (type === "num") return fmtNumber(value, 1);
    return value ?? "";
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function tableCell(row, column) {
    const value = row[column.key];
    let cls = column.cls || "";
    if (["money", "pct", "signedPct", "int", "num"].includes(column.type)) cls += " num";
    if (column.type === "text") cls += " text-cell";
    if (column.type === "full") cls += " full-cell";
    if (column.type === "clip") cls += " clip-cell";
    if (column.type === "small") cls += " small-text";
    let html = "";
    if (column.type === "money") html = fmtMoney(value);
    else if (column.type === "pct") html = fmtPct(value);
    else if (column.type === "signedPct") html = fmtSignedPct(value);
    else if (column.type === "int") html = fmtInt(value);
    else if (column.type === "num") html = fmtNumber(value, 2);
    else if (column.type === "tag") html = tag(value);
    else html = escapeHtml(value ?? "");
    const title = ["clip", "full", "text", "small"].includes(column.type) ? ` title="${escapeAttr(value ?? "")}"` : "";
    return `<td class="${cls.trim()}"${title}>${html}</td>`;
  }

  function col(label, key, type = "text", tooltip = "") {
    const cls = type === "text" ? "text-cell" : type === "small" ? "small-text" : type === "full" ? "full-cell" : type === "clip" ? "clip-cell" : "";
    return { label, key, type, cls, tooltip };
  }

  function tag(value) {
    const text = String(value || "-");
    const cls = tagClass(text);
    return `<span class="tag ${cls}">${escapeHtml(text)}</span>`;
  }

  function tagClass(text) {
    if (/放量|健康|保留|加精准|加商品|ASIN|精准|首页/.test(text)) return "green";
    if (/降价|观察|宽泛|商品页面/.test(text)) return "amber";
    if (/止损|否定|偏高|无单/.test(text)) return "red";
    if (/自动|搜索词|词组|其余/.test(text)) return "blue";
    if (/品牌|主词|商品定向/.test(text)) return "violet";
    return "";
  }

  function targetAction(row, globalMetrics) {
    const global = calc(globalMetrics);
    const m = row.metrics;
    const c = row.calculated || calc(m);
    const aov = global.aov || c.aov || 0;
    const targetCpa = aov * state.targetAcos;
    const baselineCvr = global.cvr || c.cvr || 0.04;
    const smoothedCvr = safeDivide(m.orders + baselineCvr * 20, m.clicks + 20);
    const observedCpc = c.cpc || row.bid || 0;
    let recBid = targetCpa ? targetCpa * smoothedCvr : row.bid || observedCpc;
    if (observedCpc > 0) recBid = clamp(recBid, observedCpc * 0.45, observedCpc * 1.6);
    if (!recBid && row.bid) recBid = row.bid;
    const currentBid = row.bid || observedCpc || recBid;
    let action = "小幅优化";
    let reason = "按平滑 CVR 和目标 CPA 回推竞价";

    if (m.clicks < 3 && m.impressions < 500) {
      action = "无流量";
      recBid = currentBid ? currentBid * 1.15 : recBid;
      reason = "曝光和点击都不足，优先小步提高可见度";
    } else if (m.orders === 0 && (m.clicks >= 12 || m.spend >= Math.max(300, targetCpa * 0.8))) {
      action = "止损";
      recBid = currentBid ? currentBid * 0.7 : recBid;
      reason = "无订单且点击/花费已到止损阈值";
    } else if (c.acos > state.targetAcos * 1.4 && m.spend >= Math.max(200, targetCpa * 0.6)) {
      action = "降价";
      recBid = Math.min(recBid, currentBid ? currentBid * 0.85 : recBid);
      reason = "ACOS 明显高于目标，先降价控费";
    } else if (c.acos > 0 && c.acos <= state.targetAcos * 0.8 && m.orders >= 2) {
      action = "放量";
      recBid = Math.max(recBid, currentBid ? currentBid * 1.12 : recBid);
      reason = "有订单且 ACOS 低于目标，可小步放量";
    } else if (m.orders >= 1 && c.acos <= state.targetAcos) {
      action = "保持";
      reason = "表现接近目标，保持并继续观察";
    } else if (m.clicks < 8 && m.orders === 0) {
      action = "观察";
      reason = "点击样本不足，保护归因期";
    }

    const bidChange = currentBid ? recBid / currentBid - 1 : 0;
    return { action, reason, recBid, bidChange };
  }

  function searchDecision(row, globalMetrics) {
    const m = row.metrics;
    const c = row.calculated || calc(m);
    const global = calc(globalMetrics);
    const targetCpa = (global.aov || c.aov || 0) * state.targetAcos;
    const alreadyTargeted = isAlreadyTargeted(row.campaign, row.query) || isAlreadyTargeted(row.campaign, row.target);
    if (m.orders >= 1 && c.acos > 0 && c.acos <= state.targetAcos * 1.1) {
      if (alreadyTargeted) return { action: "保留/加预算", reason: "已有转化且 ACOS 合格，保留并给预算" };
      return {
        action: row.queryType === "ASIN" ? "加商品定向" : "加精准词",
        reason: "搜索词/ASIN 已出单且回报合格，可拆出承接",
      };
    }
    if (m.orders === 0 && (m.clicks >= 12 || m.spend >= Math.max(300, targetCpa * 0.8))) {
      return { action: "否定", reason: "无订单且点击/花费达到止损阈值" };
    }
    if (m.clicks < 8) return { action: "观察", reason: "样本不足，先保护归因期" };
    if (alreadyTargeted) return { action: "保留", reason: "已覆盖，继续观察出单质量" };
    return { action: "继续积累", reason: "需要更多点击或订单确认质量" };
  }

  function computeDaypartAdvice(bySegment) {
    const order = ["01-07", "07-13", "13-01"];
    const result = {};
    order.forEach((segment) => {
      const metrics = bySegment.get(segment) || blankMetrics();
      result[segment] = { metrics, rpc: calc(metrics).rpc, uplift: 0, adjustment: 0 };
    });
    const baseRpc = result["01-07"].rpc;
    order.forEach((segment) => {
      const item = result[segment];
      item.uplift = baseRpc ? item.rpc / baseRpc - 1 : 0;
      item.adjustment = segment === "01-07" ? 0 : clamp(Math.max(0, item.uplift * 0.6), 0, 1);
    });
    return result;
  }

  function finalizeDefaultSelection() {
    if (!state.bulkLoaded) return;
    if (state.selectedCampaigns.size) {
      const valid = new Set(state.campaignRows.map((row) => row.name));
      state.selectedCampaigns.forEach((name) => {
        if (!valid.has(name)) state.selectedCampaigns.delete(name);
      });
    }
  }

  function getVisibleCampaigns() {
    const search = (state.search || "").toLowerCase();
    return state.campaignRows.filter((row) => {
      const productOk = state.productFilter === "全部" || row.productGroup === state.productFilter;
      const searchOk = !search || `${row.name} ${row.productGroup} ${row.kind}`.toLowerCase().includes(search);
      return productOk && searchOk;
    });
  }

  function getAnalysisCampaigns() {
    const visible = getVisibleCampaigns();
    if (state.search) return visible;
    if (state.selectedCampaigns.size) {
      return visible.filter((row) => state.selectedCampaigns.has(row.name));
    }
    return visible;
  }

  function analysisSubtitle(count) {
    if (state.search) {
      return `活动搜索正在过滤：${count} 个匹配活动，目标 ACOS ${fmtPct(state.targetAcos)}。`;
    }
    if (state.selectedCampaigns.size) {
      return `当前目标 ACOS 为 ${fmtPct(state.targetAcos)}，诊断基于左侧已勾选活动。`;
    }
    return `当前目标 ACOS 为 ${fmtPct(state.targetAcos)}，未输入搜索词时展示全部活动。`;
  }

  function getOrCreateCampaign(map, name, seed = {}) {
    if (!map.has(name)) {
      map.set(name, {
        name,
        campaignId: seed.campaignId || "",
        productGroup: seed.productGroup || inferProductGroup("", name),
        kind: seed.kind || classifyCampaign(name, ""),
        status: seed.status || "",
        budget: seed.budget || 0,
        bidding: seed.bidding || "",
        metrics: blankMetrics(),
        searchMetrics: blankMetrics(),
      });
    }
    const campaign = map.get(name);
    if (!campaign.campaignId && seed.campaignId) campaign.campaignId = seed.campaignId;
    if ((!campaign.productGroup || campaign.productGroup === "未分组") && seed.productGroup) campaign.productGroup = seed.productGroup;
    if (!campaign.status && seed.status) campaign.status = seed.status;
    if (!campaign.budget && seed.budget) campaign.budget = seed.budget;
    if (!campaign.bidding && seed.bidding) campaign.bidding = seed.bidding;
    return campaign;
  }

  function getCampaignProduct(campaignName) {
    const row = state.campaignRows.find((campaign) => campaign.name === campaignName);
    return row ? row.productGroup : "";
  }

  function isAlreadyTargeted(campaign, term) {
    const normalized = normalizeTerm(term);
    if (!normalized) return false;
    const set = state.targetedByCampaign?.get(campaign);
    return set ? set.has(normalized) : false;
  }

  function addTargetedTerm(map, campaign, term) {
    const normalized = normalizeTerm(term);
    if (!normalized) return;
    if (!map.has(campaign)) map.set(campaign, new Set());
    map.get(campaign).add(normalized);
  }

  function enrichMetrics(row) {
    row.metrics = row.metrics || blankMetrics();
    row.calculated = calc(row.metrics);
    return row;
  }

  function campaignStatus(row) {
    if (!row.metrics.clicks) return "无流量";
    if (row.calculated.acos && row.calculated.acos <= state.targetAcos * 0.8 && row.metrics.orders >= 2) return "可放量";
    if (row.calculated.acos > state.targetAcos * 1.35) return "需控费";
    if (row.metrics.orders === 0 && row.metrics.spend > 500) return "无单花费";
    return "稳定观察";
  }

  function classifyCampaign(name, targetingType) {
    const text = `${name} ${targetingType}`.toLowerCase();
    if (/自动|auto/.test(text)) return "自动";
    if (/品牌词|brand/.test(text)) return "品牌词";
    if (/主词|核心|kt/.test(text)) return "主词";
    if (/商品定向|asin|竞品|pt|product/.test(text)) return "商品定向";
    if (/精准|exact/.test(text)) return "精准";
    if (/词组|phrase/.test(text)) return "词组";
    if (/广泛|broad/.test(text)) return "广泛";
    return "其他";
  }

  function classifyTarget(targetText, keyword, targetName) {
    const text = `${targetText} ${targetName}`.toLowerCase();
    if (keyword) return "关键词";
    if (/close-match|紧密/.test(text)) return "紧密匹配";
    if (/loose-match|宽泛/.test(text)) return "宽泛匹配";
    if (/substitutes|同类/.test(text)) return "同类商品";
    if (/complements|关联/.test(text)) return "关联商品";
    if (/^b0[a-z0-9]{8}$/i.test(targetText) || /asin/.test(text)) return "ASIN定向";
    if (/category|类目/.test(text)) return "类目定向";
    return "商品定向";
  }

  function inferProductGroup(product, campaignName) {
    const direct = cleanText(product);
    const asin = /b0[a-z0-9]{8}/i.exec(`${direct} ${campaignName}`);
    if (asin) return asin[0].toUpperCase();
    if (direct && direct !== "-") return shorten(direct, 26);
    const name = cleanText(campaignName);
    const parts = name.split(/[\s_\-—|｜/]+/).filter(Boolean);
    if (!parts.length) return "未分组";
    return shorten(parts.slice(0, Math.min(2, parts.length)).join(" "), 26);
  }

  function normalizePlacement(value) {
    const text = cleanText(value);
    if (/首页|top|search/i.test(text)) return "首页首位";
    if (/商品页面|product page|detail/i.test(text)) return "商品页面";
    if (/企业|business|b2b/i.test(text)) return "企业购";
    if (/其余|rest/i.test(text)) return "其余位置";
    return text || "未知广告位";
  }

  function isCampaignLevel(entity, keyword, targetName, targetId, placement) {
    const text = cleanText(entity);
    if (keyword || targetName || targetId || placement) return false;
    if (!text) return false;
    return /广告活动|campaign/i.test(text) && !/广告组|ad group|关键词|keyword|商品定向|target/i.test(text);
  }

  function isTargetEntity(entity, keyword, targetName, targetId) {
    if (keyword || targetName || targetId) return true;
    return /关键词|keyword|商品定向|target/i.test(cleanText(entity));
  }

  function blankMetrics() {
    return { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0 };
  }

  function cloneMetrics(metrics) {
    return { ...blankMetrics(), ...(metrics || {}) };
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

  function addMetrics(target, source) {
    target.impressions += source?.impressions || 0;
    target.clicks += source?.clicks || 0;
    target.spend += source?.spend || 0;
    target.sales += source?.sales || 0;
    target.orders += source?.orders || 0;
    target.units += source?.units || 0;
    return target;
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

  function getMapMetric(map, key) {
    if (!map.has(key)) map.set(key, blankMetrics());
    return map.get(key);
  }

  function sumActivity(metrics) {
    return (metrics?.impressions || 0) + (metrics?.clicks || 0) + (metrics?.spend || 0) + (metrics?.sales || 0);
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
    const current = sheet["!ref"];
    if (!current || current === "A1") {
      sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    }
  }

  function findSheetName(names, candidates) {
    const lowered = names.map((name) => [name, name.toLowerCase()]);
    for (const candidate of candidates) {
      const found = lowered.find(([, lower]) => lower.includes(candidate.toLowerCase()));
      if (found) return found[0];
    }
    return "";
  }

  function parseCsv(text) {
    const cleaned = String(text || "").replace(/^\ufeff/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quote = false;
    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      const next = cleaned[i + 1];
      if (quote) {
        if (ch === '"' && next === '"') {
          field += '"';
          i += 1;
        } else if (ch === '"') {
          quote = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quote = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((items) => items.some((item) => cleanText(item)));
  }

  function makeHeader(row) {
    return (row || []).map((item) => cleanText(item).replace(/\s+/g, ""));
  }

  function normalizeHeaderRow(row) {
    return makeHeader(row);
  }

  function findIndex(header, aliases) {
    const normalizedAliases = aliases.map((alias) => cleanText(alias).replace(/\s+/g, ""));
    for (const alias of normalizedAliases) {
      const exact = header.findIndex((item) => item === alias);
      if (exact >= 0) return exact;
    }
    for (const alias of normalizedAliases) {
      const partial = header.findIndex((item) => item.includes(alias) || alias.includes(item));
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

  function firstPositive(values) {
    return values.find((value) => Number.isFinite(value) && value > 0) || 0;
  }

  function hasAny(headers, aliases) {
    return aliases.every((alias) => headers.some((header) => header.includes(alias.replace(/\s+/g, ""))));
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const text = cleanText(value);
    if (!text || text === "-") return 0;
    const negative = /^\(.*\)$/.test(text);
    const normalized = text.replace(/[,%￥¥$,\s]/g, "").replace(/[()]/g, "");
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return negative ? -n : n;
  }

  function parseModifier(value) {
    const text = cleanText(value);
    if (!text) return null;
    const n = toNumber(text);
    if (!Number.isFinite(n)) return null;
    return Math.abs(n) > 1 ? n / 100 : n;
  }

  function parseHour(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 0 && value < 1) return Math.floor(value * 24);
      if (value >= 0 && value <= 23) return Math.floor(value);
    }
    const text = cleanText(value);
    const match = /(\d{1,2})/.exec(text);
    if (!match) return null;
    const hour = Number(match[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
  }

  function cleanDate(value) {
    const text = cleanText(value);
    if (!text) return "";
    const match = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/.exec(text);
    if (!match) return text.slice(0, 10);
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  function daypartSegment(hour) {
    if (hour >= 7 && hour < 13) return "07-13";
    if (hour >= 13 || hour < 1) return "13-01";
    return "01-07";
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").trim();
  }

  function normalizeTerm(value) {
    return cleanText(value).toLowerCase().replace(/\s+/g, " ");
  }

  function safeDivide(a, b) {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return 0;
    return x / y;
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function average(values) {
    const list = values.filter((value) => Number.isFinite(value));
    return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
  }

  function groupBy(rows, getter) {
    const map = new Map();
    rows.forEach((row) => {
      const key = getter(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  }

  function countBy(values) {
    return values.reduce((acc, value) => {
      const key = value || "-";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function sumKeys(object, keys) {
    return keys.reduce((sum, key) => sum + (object[key] || 0), 0);
  }

  function actionPriority(action) {
    const order = {
      止损: 1,
      否定: 1,
      降价: 2,
      放量: 3,
      加精准词: 3,
      加商品定向: 3,
      "保留/加预算": 4,
      保持: 5,
      保留: 5,
      无流量: 6,
      观察: 7,
      继续积累: 8,
      小幅优化: 9,
    };
    return order[action] || 10;
  }

  function setLoading(show, text = "") {
    if (!els.loadingMask) return;
    els.loadingMask.classList.toggle("visible", Boolean(show));
    if (text) els.loadingText.textContent = text;
  }

  function clearChart(id, title) {
    const chart = state.charts[id];
    if (!chart) return;
    chart.setOption({
      title: { text: title, left: "center", top: "middle", textStyle: { color: "#94a3b8", fontSize: 14, fontWeight: 600 } },
      xAxis: { show: false },
      yAxis: { show: false },
      series: [],
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
    }, true);
  }

  function fmtMoney(value) {
    const n = Number(value) || 0;
    return currency.format(n);
  }

  function fmtShortMoney(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1000000) return `¥${(n / 1000000).toFixed(1)}M`;
    if (Math.abs(n) >= 1000) return `¥${Math.round(n / 1000)}K`;
    return `¥${Math.round(n)}`;
  }

  function fmtKpiMoney(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 10000) {
      const wan = n / 10000;
      const digits = Math.abs(wan) >= 100 ? 0 : 1;
      return `¥${wan.toLocaleString("zh-CN", { maximumFractionDigits: digits })}万`;
    }
    return fmtMoney(n);
  }

  function fmtPct(value) {
    const n = Number(value) || 0;
    return `${(n * 100).toFixed(1)}%`;
  }

  function fmtSignedPct(value) {
    const n = Number(value) || 0;
    const sign = n > 0 ? "+" : "";
    return `${sign}${(n * 100).toFixed(1)}%`;
  }

  function fmtInt(value) {
    return compactNumber.format(Math.round(Number(value) || 0));
  }

  function fmtNumber(value, digits = 1) {
    const n = Number(value) || 0;
    return n.toFixed(digits);
  }

  function shorten(value, length = 24) {
    const text = cleanText(value);
    if (text.length <= length) return text;
    return `${text.slice(0, Math.max(1, length - 1))}…`;
  }

  function wrapLabel(value, lineLength = 18) {
    const text = cleanText(value);
    if (!text) return "";
    const chunks = [];
    let current = "";
    for (const char of text) {
      current += char;
      if (current.length >= lineLength && /[\s_\-—|｜/]|[A-Za-z0-9]$/.test(char)) {
        chunks.push(current.trim());
        current = "";
      }
    }
    if (current) chunks.push(current.trim());
    return chunks.join("\n");
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
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
})();
