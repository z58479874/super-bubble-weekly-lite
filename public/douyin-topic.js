(function () {
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const money = (value) => Number.isFinite(value) ? `¥${Math.abs(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}` : "未统计";
  const integer = (value, suffix = "") => Number.isFinite(value) ? `${Math.round(value).toLocaleString("zh-CN")}${suffix}` : "未统计";
  const percent = (value, digits = 1) => Number.isFinite(value) ? `${value.toFixed(digits)}%` : "不可计算";
  const change = (current, prior, type = "money") => {
    if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return "暂不可比";
    const value = current - prior;
    if (type === "percentage") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
    return `${value >= 0 ? "+" : "-"}${type === "money" ? money(Math.abs(value)) : integer(Math.abs(value))}（${(value / Math.abs(prior) * 100).toFixed(1)}%）`;
  };
  const direction = (current, prior, invert = false) => !Number.isFinite(current) || !Number.isFinite(prior) ? "neutral" : (current >= prior) !== invert ? "up" : "down";
  const blankFinding = () => ({ id: `finding-${Date.now()}-${Math.random().toString(16).slice(2)}`, fact: "", judgement: "", impact: "", observe: "是" });
  const blankAction = () => ({ id: `action-${Date.now()}-${Math.random().toString(16).slice(2)}`, action: "", basis: "", owner: "", due: "", criteria: "", status: "未开始" });
  const noteRecord = (source = {}) => ({
    departmentId: "douyin", topic_template: 1, status: source.status || "草稿", topic_findings: Array.isArray(source.topic_findings) ? source.topic_findings : [], topic_actions: Array.isArray(source.topic_actions) ? source.topic_actions : [], ...source
  });

  const statusTag = (status = {}) => `<span class="dy-status ${esc(status.level || "observe")}"><i></i>${esc(status.label || "数据不足")}</span>`;
  const metric = (label, value, previousValue, format, { rate = false, count = false, invert = false, note = "" } = {}) => `<article class="dy-topic-metric"><span>${label}</span><b>${format(value)}</b><small>上期 ${format(previousValue)} · <em class="${direction(value, previousValue, invert)}">${change(value, previousValue, rate ? "percentage" : count ? "count" : "money")}</em></small>${note ? `<i>${note}</i>` : ""}</article>`;
  const dataRow = (label, value, note = "") => `<div class="dy-data-row"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ""}</div>`;
  const noData = (text = "暂无可展示数据") => `<p class="dy-empty">${esc(text)}</p>`;

  function summary(topic, previous) {
    if (!topic) return noData("尚未生成本周抖音专题数据");
    const p = previous || {}, order = topic.orders, fulfillment = topic.fulfillment, live = topic.live, previousOrder = p.orders || {}, previousFulfillment = p.fulfillment || {}, previousLive = p.live || {};
    return `<section class="panel douyin-topic-summary"><div class="panel-title"><div><h2>本周抖音经营专题</h2><p>${esc(topic.status?.message || "按订单、核销、直播和商品四类事实分别统计。")} </p></div><div class="dy-summary-title-side">${statusTag(topic.status)}<button data-open-douyin-topic>查看抖音经营详情</button></div></div>
      <div class="dy-topic-summary-grid">
        ${metric("抖音用户实付", order.userPaid, previousOrder.userPaid, money)}
        ${metric("抖音退款金额", order.refund, previousOrder.refund, money, { invert: true })}
        ${metric("订单保留金额", order.retained, previousOrder.retained, money)}
        ${metric("已记录核销订单实收", fulfillment.redeemedAmount, previousFulfillment.redeemedAmount, money)}
        ${metric("直播成交金额", live.gmv, previousLive.gmv, money)}
        <article class="dy-topic-metric"><span>直播场次 / 总时长</span><b>${integer(live.sessions, "场")} / ${Number.isFinite(live.hours) ? `${live.hours.toFixed(1)}h` : "未统计"}</b><small>上期 ${integer(previousLive.sessions, "场")} / ${Number.isFinite(previousLive.hours) ? `${previousLive.hours.toFixed(1)}h` : "未统计"}</small></article>
        ${metric("直播每小时成交额", live.gmvPerHour, previousLive.gmvPerHour, money)}
        ${metric("抖音订单数", order.paidOrders, previousOrder.paidOrders, value => integer(value, "单"), { count: true })}
        ${metric("核销订单数", fulfillment.redeemedOrders, previousFulfillment.redeemedOrders, value => integer(value, "单"), { count: true })}
        ${metric("7天到店率", fulfillment.sevenDay?.rate, previousFulfillment.sevenDay?.rate, value => percent(value, 1), { rate: true, note: fulfillment.sevenDay?.matureOrders ? `${fulfillment.sevenDay.matureOrders}单已满7天` : "订单尚未成熟" })}
        ${metric("观看到成交转化率", live.viewToPurchase, previousLive.viewToPurchase, value => percent(value, 2), { rate: true })}
        ${metric("退款率", order.refund && order.userPaid ? order.refund / order.userPaid * 100 : null, previousOrder.refund && previousOrder.userPaid ? previousOrder.refund / previousOrder.userPaid * 100 : null, value => percent(value, 2), { rate: true, invert: true })}
      </div>
      <div class="dy-topic-diagnosis"><b>本周抖音一句话诊断</b><p>${esc(topic.diagnosis || "数据持续积累中。")}</p></div></section>`;
  }

  function liveSection(topic) {
    const live = topic.live, rows = topic.liveBreakdown?.daily || [], max = Math.max(...rows.map((row) => row.gmv || 0), 1);
    const matrix = topic.liveBreakdown?.bySlot || [];
    return `<section class="dy-topic-section" id="dy-live"><div class="dy-section-head"><div><span>01</span><h2>直播经营效率</h2><p>仅用于直播场次效率分析，不与订单成交额重复相加。</p></div></div>
      <div class="dy-stat-strip">${[
        ["直播场次", integer(live.sessions, "场")], ["总直播时长", Number.isFinite(live.hours) ? `${live.hours.toFixed(1)}小时` : "未统计"], ["直播成交金额", money(live.gmv)], ["每小时成交额", money(live.gmvPerHour)], ["每小时曝光", integer(live.exposurePerHour)], ["曝光到观看", percent(live.exposureToView, 2)], ["观看到成交", percent(live.viewToPurchase, 2)], ["新客成交", `${money(live.newAmount)} / ${integer(live.newBuyers, "人")}`], ["直播退款", money(live.refundAmount)], ["直播核销", money(live.redeemedAmount)]
      ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}</div>
      <div class="dy-two-columns"><article class="dy-subpanel"><h3>每日直播趋势</h3>${rows.length ? `<div class="dy-day-chart">${rows.map((row) => `<div title="${row.day}：${money(row.gmv)}"><i style="height:${Math.max(5, (row.gmv || 0) / max * 100)}%"></i><b>${money(row.gmv)}</b><span>${row.day.slice(5).replace("-", "/")}</span></div>`).join("")}</div><p class="chart-note">柱高为成交额，标签为每日成交额；每小时效率需结合直播时长判断。</p>` : noData()}</article>
      <article class="dy-subpanel"><h3>时段效率矩阵</h3><table class="dy-mini-table"><thead><tr><th>时段</th><th>周中成交/小时</th><th>周末成交/小时</th><th>周中券/h</th><th>周末券/h</th></tr></thead><tbody>${matrix.map((row) => `<tr><td>${row.name}</td><td>${money(row.weekday.gmvPerHour)}</td><td>${money(row.weekend.gmvPerHour)}</td><td>${Number.isFinite(row.weekday.ticketsPerHour) ? row.weekday.ticketsPerHour.toFixed(1) : "未统计"}</td><td>${Number.isFinite(row.weekend.ticketsPerHour) ? row.weekend.ticketsPerHour.toFixed(1) : "未统计"}</td></tr>`).join("")}</tbody></table><div class="dy-best-worst"><span>最优：<b>${esc(topic.liveBreakdown?.best?.name || "未统计")}</b> ${money(topic.liveBreakdown?.best?.gmvPerHour)}</span><span>最低：<b>${esc(topic.liveBreakdown?.lowest?.name || "未统计")}</b> ${money(topic.liveBreakdown?.lowest?.gmvPerHour)}</span></div></article></div></section>`;
  }

  function productSection(topic) {
    const products = topic.products?.products || [];
    return `<section class="dy-topic-section" id="dy-product"><div class="dy-section-head"><div><span>02</span><h2>商品与票型表现</h2><p>商品表用于票型与渠道结构分析，不与订单成交额重复相加。退款率异常时只显示“需核对”。</p></div></div><div class="dy-table-wrap"><table class="dy-topic-table"><thead><tr><th>商品 / 票型</th><th>售价</th><th>曝光人数</th><th>访问人数</th><th>成交金额</th><th>成交券数</th><th>点击成交率</th><th>核销金额</th><th>核销率</th><th>退款金额</th><th>退款率</th><th>直播成交</th><th>短视频成交</th><th>达人成交</th></tr></thead><tbody>${products.map((row) => `<tr><td><b>${esc(row.name)}</b></td><td>${money(row.price)}</td><td>${integer(row.exposure)}</td><td>${integer(row.visits)}</td><td>${money(row.gmv)}</td><td>${integer(row.tickets)}</td><td>${percent(row.clickToPurchase, 2)}</td><td>${money(row.redeemedAmount)}</td><td>${percent(row.redemptionRate, 1)}</td><td>${money(row.refundAmount)}</td><td class="${row.refundAnomaly ? "needs-check" : ""}">${row.refundAnomaly ? "需核对" : percent(row.refundRate, 1)}</td><td>${money(row.liveGmv)}</td><td>${money(row.videoGmv)}</td><td>${money(row.talentGmv)}</td></tr>`).join("") || `<tr><td colspan="14">暂无商品数据</td></tr>`}</tbody></table></div></section>`;
  }

  function valueChain(topic) {
    const order = topic.orders, fulfillment = topic.fulfillment;
    return `<section class="dy-topic-section" id="dy-chain"><div class="dy-section-head"><div><span>03</span><h2>成交到到店价值链</h2><p>成交与核销是不同日期事实。本周核销总额不能直接除以本周成交额作为同批订单核销率。</p></div></div><div class="dy-value-chain">
      ${[["本期用户实付", money(order.userPaid)], ["已退款", money(order.refund)], ["订单保留金额", money(order.retained)], ["本周购买且本周核销", money(fulfillment.currentPurchaseCurrentRedemption)], ["此前购买、本周核销", money(fulfillment.priorPurchaseCurrentRedemption)], ["订单表未覆盖的本周核销", money(fulfillment.unmatchedPurchaseCurrentRedemption)], ["本周已记录到店核销", money(fulfillment.redeemedAmount)], ["7天内到店核销", money(fulfillment.sevenDay?.redeemedAmount)], ["7天到店率", percent(fulfillment.sevenDay?.rate, 1)]].map(([label, value], index) => `<article><i>${index + 1}</i><span>${label}</span><b>${value}</b></article>`).join("")}
    </div><p class="dy-chain-note">${esc(fulfillment.sevenDay?.note || "7天同批到店数据持续积累中。")} 订单表未覆盖的历史购买订单会单列显示，避免把此前购买误归为本期成交。</p></section>`;
  }

  function channelSection(topic) {
    const channels = topic.channels || [], promoters = topic.promoters || [];
    return `<section class="dy-topic-section" id="dy-channel"><div class="dy-section-head"><div><span>04</span><h2>成交渠道与达人来源</h2><p>成交按订单下单来源统计，核销按核销明细来源统计；两者仅用于贡献观察。</p></div></div><div class="dy-two-columns"><article class="dy-subpanel"><h3>渠道成交与核销贡献</h3><table class="dy-mini-table"><thead><tr><th>来源</th><th>支付订单</th><th>用户实付</th><th>退款</th><th>核销订单实收</th></tr></thead><tbody>${channels.map((row) => `<tr><td>${esc(row.name)}</td><td>${integer(row.paidOrders)}</td><td>${money(row.userPaid)}</td><td>${money(row.refund)}</td><td>${money(row.redeemedAmount)}</td></tr>`).join("") || `<tr><td colspan="5">暂无渠道归属数据</td></tr>`}</tbody></table></article><article class="dy-subpanel"><h3>达人来源（至少3单才展示）</h3>${promoters.length ? `<table class="dy-mini-table"><thead><tr><th>达人</th><th>订单</th><th>用户实付</th><th>退款</th><th>核销订单实收</th></tr></thead><tbody>${promoters.slice(0, 8).map((row) => `<tr><td>${esc(row.name)}</td><td>${integer(row.paidOrders)}</td><td>${money(row.userPaid)}</td><td>${money(row.refund)}</td><td>${money(row.redeemedAmount)}</td></tr>`).join("")}</tbody></table>` : noData("达人样本不足，不做能力排名。")}</article></div></section>`;
  }

  function qualitySection(topic) {
    const q = topic.quality || {}, issues = [
      [q.orderDuplicateIds ? "需核对" : "正常", `订单编号重复：${integer(q.orderDuplicateIds, "笔")}`],
      [q.exactDuplicateCandidates ? "需核对" : "正常", `完全相同核销记录：${integer(q.exactDuplicateCandidates, "行")}`],
      [q.productReconciled ? "已对平" : "需核对", `核销订单实收与商品核销金额：${q.productReconciled ? "已对平" : `差异 ${money(q.productDifference)}`}`],
      [q.multiVoucherOrders ? "需关注" : "正常", `多券订单：${integer(q.multiVoucherOrders, "笔")}`],
      [q.unmatchedRedemptionOrders ? "需核对" : "正常", `核销订单未在本次订单表匹配：${integer(q.unmatchedRedemptionOrders, "笔")}`],
      [q.productRefundAnomalies ? "需核对" : "正常", `商品退款超过本期商品成交的票型：${integer(q.productRefundAnomalies, "个")}`]
    ];
    return `<section class="dy-topic-section dy-quality" id="dy-quality"><div class="dy-section-head"><div><span>05</span><h2>数据质量检查</h2><p>发现问题只标记需核对，不自动篡改任何源表事实。</p></div></div><div class="dy-quality-grid">${issues.map(([status, label]) => `<div class="${status === "正常" || status === "已对平" ? "pass" : "warn"}"><b>${status}</b><span>${label}</span></div>`).join("")}</div><p class="dy-quality-note">${esc(q.dedupeNote || "")} 核销撤销记录已排除 ${integer(q.redemptionReversed, "行")}；数据截至 ${esc(q.sourceCutoff || "未统计")}。</p></section>`;
  }

  function notesSection(record, editable) {
    const findings = record.topic_findings || [], actions = record.topic_actions || [];
    const readonly = editable ? "" : "disabled";
    return `<section class="dy-topic-section dy-notes" id="dy-notes"><div class="dy-section-head"><div><span>06</span><h2>本周关键发现与下周动作</h2><p>由主管手工填写；仅主动点击保存才会写入共享周报。</p></div></div><form data-topic-notes><fieldset ${readonly}><div class="dy-note-module"><div class="dy-note-head"><h3>本周关键发现</h3><button type="button" data-topic-add="findings">+ 新增发现</button></div>${findings.length ? findings.map((row) => `<article data-topic-row="${esc(row.id)}" data-topic-list="findings"><div class="dy-fields four"><label>数据事实<textarea data-topic-field="fact" placeholder="看到的真实数据或现象">${esc(row.fact)}</textarea></label><label>原因判断<textarea data-topic-field="judgement" placeholder="当前判断，可注明需继续验证">${esc(row.judgement)}</textarea></label><label>对经营的影响<textarea data-topic-field="impact" placeholder="说明经营影响">${esc(row.impact)}</textarea></label><label>是否继续观察<select data-topic-field="observe"><option ${row.observe === "是" ? "selected" : ""}>是</option><option ${row.observe === "否" ? "selected" : ""}>否</option></select></label></div><button type="button" class="row-delete" data-topic-delete="findings">删除本行</button></article>`).join("") : noData("尚未填写关键发现。")}</div><div class="dy-note-module"><div class="dy-note-head"><h3>下周重点动作</h3><button type="button" data-topic-add="actions">+ 新增动作</button></div>${actions.length ? actions.map((row) => `<article data-topic-row="${esc(row.id)}" data-topic-list="actions"><div class="dy-fields action"><label>动作事项<input data-topic-field="action" value="${esc(row.action)}" placeholder="例如：保障周末早场资源"></label><label>对应问题 / 数据依据<textarea data-topic-field="basis">${esc(row.basis)}</textarea></label><label>负责人<input data-topic-field="owner" value="${esc(row.owner)}"></label><label>完成时间<input type="date" data-topic-field="due" value="${esc(row.due)}"></label><label>验收标准<textarea data-topic-field="criteria">${esc(row.criteria)}</textarea></label><label>当前状态<select data-topic-field="status">${["未开始", "进行中", "已完成", "待复盘"].map((item) => `<option ${row.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></label></div><button type="button" class="row-delete" data-topic-delete="actions">删除本行</button></article>`).join("") : noData("尚未填写下周动作。")}</div><div class="sticky-actions"><span data-topic-save-status>已保存</span>${editable ? '<button type="button" class="primary" data-topic-save>保存抖音专题填写</button>' : '<span class="dy-edit-hint">进入编辑模式后可填写</span>'}</div></fieldset></form></section>`;
  }

  function render(topic, previous, record, { editable = false } = {}) {
    return `<main class="content dy-topic-page"><section class="dy-topic-hero"><div><span>抖音经营详情</span><h1>从成交表现到到店价值</h1><p>周期：${esc(topic?.period?.startDate || "未统计")} 至 ${esc(topic?.period?.endDate || "未统计")} · 数据截至 ${esc(topic?.period?.dataAsOf || "未统计")}</p></div>${statusTag(topic?.status)}</section>${summary(topic, previous)}${liveSection(topic)}${productSection(topic)}${valueChain(topic)}${channelSection(topic)}${qualitySection(topic)}${notesSection(record, editable)}</main>`;
  }
  window.DouyinTopic = { render, summary, noteRecord, blankFinding, blankAction };
})();
