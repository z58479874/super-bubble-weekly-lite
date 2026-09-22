import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const TEXT_IDENTIFIER = /(订单编号|直播ID|商品ID|券码|uid|UID|抖音号)/;
const EPSILON = 0.015;

const text = (value) => value === null || value === undefined ? "" : String(value).trim();
const number = (value) => {
  if (value === null || value === undefined || value === "" || value === "-" || value === "--") return null;
  const parsed = Number(String(value).replace(/[¥￥,%]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};
const close = (left, right, tolerance = EPSILON) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
const sum = (rows, key) => {
  let hasValue = false;
  let total = 0;
  for (const row of rows) {
    const value = number(typeof key === "function" ? key(row) : row[key]);
    if (value !== null) { hasValue = true; total += value; }
  }
  return hasValue ? total : null;
};
const count = (rows, key) => rows.reduce((total, row) => total + (number(typeof key === "function" ? key(row) : row[key]) || 0), 0);
const ratio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator * 100 : null;
const stableKey = (row) => Object.keys(row).sort().map((key) => `${key}:${text(row[key])}`).join("\u001f");

function dateParts(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(), hour: value.getHours(), minute: value.getMinutes(), second: value.getSeconds() };
  }
  if (typeof value === "number") {
    if (value >= 20200101 && value <= 20991231) {
      const raw = String(Math.trunc(value));
      return { year: +raw.slice(0, 4), month: +raw.slice(4, 6), day: +raw.slice(6, 8), hour: 0, minute: 0, second: 0 };
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return { year: parsed.y, month: parsed.m, day: parsed.d, hour: parsed.H || 0, minute: parsed.M || 0, second: parsed.S || 0 };
  }
  const raw = text(value);
  if (/^20\d{6}$/.test(raw)) return { year: +raw.slice(0, 4), month: +raw.slice(4, 6), day: +raw.slice(6, 8), hour: 0, minute: 0, second: 0 };
  const match = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日?[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!match) return null;
  return { year: +match[1], month: +match[2], day: +match[3], hour: +(match[4] || 0), minute: +(match[5] || 0), second: +(match[6] || 0) };
}
function dayOf(value) {
  const p = dateParts(value);
  return p ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` : null;
}
function timestamp(value) {
  const p = dateParts(value);
  return p ? new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second).getTime() : null;
}
function addDays(day, amount) {
  const [year, month, date] = String(day).split("-").map(Number);
  const next = new Date(year, month - 1, date + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}
function inPeriod(day, week) { return Boolean(day && day >= week.startDate && day <= week.endDate); }
function durationHours(value) {
  if (typeof value === "number") return value <= 1 ? value * 24 : value;
  const raw = text(value);
  const hours = raw.match(/(\d+)小时/), minutes = raw.match(/(\d+)分/), seconds = raw.match(/(\d+)秒/);
  const result = (hours ? +hours[1] : 0) + (minutes ? +minutes[1] / 60 : 0) + (seconds ? +seconds[1] / 3600 : 0);
  return result || null;
}
function displayDay(day) { const [, month, date] = day.split("-"); return `${+month}月${+date}日`; }

export async function readWorkbookRows(filePath) {
  const bytes = await readFile(filePath);
  const book = XLSX.read(bytes, { type: "buffer", cellDates: true, dense: false });
  const rows = [];
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const headers = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
      headers.push(text(cell?.w ?? cell?.v) || `__${column}`);
    }
    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
      const record = {};
      let hasValue = false;
      headers.forEach((header, columnOffset) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + columnOffset })];
        const raw = cell?.v ?? null;
        const value = TEXT_IDENTIFIER.test(header) ? (cell?.w ?? raw) : raw;
        record[header] = value;
        if (value !== null && value !== undefined && value !== "") hasValue = true;
      });
      if (hasValue) rows.push(record);
    }
  }
  return rows;
}

export function sourceType(rows) {
  const headers = new Set(Object.keys(rows[0] || {}));
  if (headers.has("直播ID") && headers.has("直播间成交金额")) return "live";
  if (headers.has("商品ID") && headers.has("商品成交金额") && headers.has("投放渠道")) return "product";
  if (headers.has("售后编号") && (headers.has("售后完成时间") || headers.has("发起申请时间")) && !headers.has("用户实付")) return "aftersales";
  if (headers.has("订单编号") && headers.has("下单时间") && headers.has("订单状态")) return "orders";
  if (headers.has("订单编号") && headers.has("券码（已撤销核销加密）") && headers.has("核销状态")) return "redemptions";
  return "unknown";
}

const channelOf = (row) => {
  const channel = text(row["成交渠道"]);
  const role = text(row["带货角色"]);
  if (role.includes("达人") || text(row["达人昵称"])) return "达人";
  if (channel.includes("直播")) return "官号直播";
  if (channel.includes("货架")) return "商家货架";
  if (channel.includes("短视频") || channel.includes("视频")) return "短视频";
  if (channel.includes("搜索")) return "搜索";
  return "其他来源";
};

function normalizeInputs(input) {
  const live = (input.live || []).map((row) => ({ ...row, __day: dayOf(row["开播日期"]), __time: timestamp(row["开播时间"] || row["开播日期"]), __hour: dateParts(row["开播时间"] || row["开播日期"])?.hour ?? 0 }));
  const product = (input.product || []).map((row) => ({ ...row, __day: dayOf(row["天"]) }));
  const orders = (input.orders || []).map((row) => ({ ...row, __day: dayOf(row["支付时间"]), __time: timestamp(row["支付时间"]), __channel: channelOf(row) }));
  const redemptions = (input.redemptions || []).map((row) => ({ ...row, __day: dayOf(row["核销时间"]), __time: timestamp(row["核销时间"]), __orderDay: dayOf(row["下单时间"]), __channel: channelOf(row) }));
  const aftersales = (input.aftersales || []).map((row) => ({ ...row, __day: dayOf(row["售后完成时间"]), __time: timestamp(row["售后完成时间"]) }));
  return { live, product, orders, redemptions, aftersales };
}

function aggregateLive(rows) {
  const seen = new Set();
  const live = rows.filter((row) => {
    const id = text(row["直播ID"]);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((row) => ({
    id: text(row["直播ID"]), day: row.__day, hour: row.__hour,
    host: text(row["抖音号昵称"]) || text(row["直播间名称"]) || "未标注主播",
    hours: durationHours(row["直播时长"]), exposure: number(row["直播间曝光人数"]), exposureViews: number(row["直播间曝光次数"]),
    viewers: number(row["直播间观看人数"]), viewTimes: number(row["直播间观看次数"]), averageWatchSeconds: number(row["人均观看时长(秒)"]),
    onlinePerMinute: number(row["每分钟在线人数"]), peakOnline: number(row["最高在线人数"]), gmv: number(row["直播间成交金额"]),
    tickets: number(row["直播间成交券数"]), buyers: number(row["直播间成交人数"]), newBuyers: number(row["直播间成交新客数"]),
    newAmount: number(row["直播间新客成交金额"]), redeemedAmount: number(row["直播间核销金额"]), redeemedTickets: number(row["直播间核销券数"]),
    refundAmount: number(row["直播间退款金额"]), refundTickets: number(row["直播间退款券数"])
  }));
  const weightedWatchDenominator = sum(live, "viewers");
  const weightedWatchNumerator = live.reduce((total, row) => total + ((row.averageWatchSeconds || 0) * (row.viewers || 0)), 0);
  const totalHours = sum(live, "hours");
  return {
    sessions: live.length, hours: totalHours, exposure: sum(live, "exposure"), exposureViews: sum(live, "exposureViews"), viewers: sum(live, "viewers"), viewTimes: sum(live, "viewTimes"),
    gmv: sum(live, "gmv"), tickets: sum(live, "tickets"), buyers: sum(live, "buyers"), newBuyers: sum(live, "newBuyers"), newAmount: sum(live, "newAmount"),
    redeemedAmount: sum(live, "redeemedAmount"), redeemedTickets: sum(live, "redeemedTickets"), refundAmount: sum(live, "refundAmount"), refundTickets: sum(live, "refundTickets"),
    peakOnline: live.length ? Math.max(...live.map((row) => row.peakOnline || 0)) : null,
    averageWatchSeconds: weightedWatchDenominator ? weightedWatchNumerator / weightedWatchDenominator : null,
    onlinePerMinute: totalHours ? live.reduce((total, row) => total + ((row.onlinePerMinute || 0) * (row.hours || 0)), 0) / totalHours : null,
    gmvPerHour: totalHours ? sum(live, "gmv") / totalHours : null,
    exposurePerHour: totalHours ? sum(live, "exposure") / totalHours : null,
    exposureToView: ratio(sum(live, "viewers"), sum(live, "exposure")),
    viewToPurchase: ratio(sum(live, "buyers"), sum(live, "viewers")),
    live
  };
}

function aggregateProducts(rows) {
  const seen = new Set(), map = new Map();
  for (const row of rows) {
    const unique = `${row.__day}|${text(row["商品ID"])}|${text(row["投放渠道"])}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    const id = text(row["商品ID"]), target = map.get(id) || {
      id, name: text(row["商品名称"]) || "未命名商品", price: number(row["售价"]), exposure: 0, visits: 0, gmv: 0, tickets: 0, buyers: 0,
      redeemedAmount: 0, redeemedTickets: 0, redeemedPeople: 0, refundAmount: 0, refundTickets: 0, liveGmv: 0, videoGmv: 0, talentGmv: 0
    };
    for (const [targetKey, sourceKey] of Object.entries({ exposure: "商品曝光人数", visits: "商品访问人数", gmv: "商品成交金额", tickets: "商品成交券数", buyers: "商品成交人数", redeemedAmount: "商品核销金额", redeemedTickets: "商品核销券数", redeemedPeople: "商品核销人数", refundAmount: "商品退款金额", refundTickets: "商品退款券数", liveGmv: "直播间商品成交金额", videoGmv: "视频商品成交金额", talentGmv: "达人成交金额" })) target[targetKey] += number(row[sourceKey]) || 0;
    map.set(id, target);
  }
  const products = [...map.values()].map((row) => {
    const refundAnomaly = row.refundTickets > row.tickets || row.refundAmount > row.gmv + EPSILON;
    return { ...row, clickToPurchase: ratio(row.buyers, row.visits), redemptionRate: ratio(row.redeemedTickets, row.tickets), refundRate: refundAnomaly ? null : ratio(row.refundTickets, row.tickets), refundAnomaly };
  }).sort((a, b) => b.gmv - a.gmv);
  return { products, totalRedeemedAmount: sum(products, "redeemedAmount"), totalGmv: sum(products, "gmv"), totalExposure: sum(products, "exposure"), totalVisits: sum(products, "visits"), refundAnomalies: products.filter((row) => row.refundAnomaly).length };
}

function aggregateOrders(rows) {
  const byId = new Map(), duplicateIds = [];
  for (const row of rows) {
    const id = text(row["订单编号"]);
    if (!id) continue;
    if (byId.has(id)) { duplicateIds.push(id); continue; }
    byId.set(id, row);
  }
  const orders = [...byId.values()].map((row) => ({
    id: text(row["订单编号"]), day: row.__day, time: row.__time, productId: text(row["商品ID"]), productName: text(row["商品名称"]), quantity: number(row["购买数量"]),
    userPaid: number(row["用户实付"]), orderReceived: number(row["订单实收"]), expectedIncome: number(row["预计收入"]), refund: number(row["退款金额总计"]),
    softwareFee: number(row["软件服务费"]), hostingFee: number(row["出单宝托管服务费"]), talentFee: number(row["达人服务费"]), serviceFee: number(row["服务商服务费"]),
    channel: row.__channel, role: text(row["带货角色"]), promoter: text(row["带货人"]) || text(row["达人昵称"]), status: text(row["订单状态"])
  }));
  return { orders, byId: new Map(orders.map((row) => [row.id, row])), duplicateIds };
}

function aggregateAftersales(rows) {
  const seen = new Set();
  const records = [];
  for (const row of rows) {
    const id = text(row["售后编号"]);
    const status = text(row["售后状态"]);
    if (!id || seen.has(id) || (status && status !== "已退款")) continue;
    seen.add(id);
    records.push({ id, day: row.__day, amount: number(row["退款金额"]), vouchers: number(row["退款券数"]), orderId: text(row["订单编号"]), status });
  }
  return { records, applications: records.length, amount: sum(records, "amount"), vouchers: sum(records, "vouchers") };
}

function aggregateRedemptions(rows, productControl) {
  const valid = rows.filter((row) => text(row["核销状态"]) === "已核销" && !text(row["撤销核销时间"]));
  const exactSeen = new Set(), deduped = [], duplicates = [];
  for (const row of valid) { const key = stableKey(row); if (exactSeen.has(key)) duplicates.push(row); else { exactSeen.add(key); deduped.push(row); } }
  const allAmount = sum(valid, "订单实收"), dedupedAmount = sum(deduped, "订单实收");
  const removeExactDuplicates = duplicates.length > 0 && close(dedupedAmount, productControl) && !close(allAmount, productControl);
  const effective = removeExactDuplicates ? deduped : valid;
  const records = effective.map((row) => ({
    orderId: text(row["订单编号"]), voucher: text(row["券码（已撤销核销加密）"]), day: row.__day, time: row.__time, orderDay: row.__orderDay,
    productId: text(row["商品ID"]), productName: text(row["商品名称"]), quantity: number(row["购买数量"]), userPaid: number(row["用户实付"]), orderReceived: number(row["订单实收"]), expectedIncome: number(row["预计收入"]),
    platformFee: (number(row["软件服务费"]) || 0) + (number(row["出单宝托管服务费"]) || 0) + (number(row["AIGC 服务费"]) || 0),
    thirdPartyFee: (number(row["达人服务费"]) || 0) + (number(row["团长服务费"]) || 0) + (number(row["服务商服务费"]) || 0),
    channel: row.__channel, role: text(row["带货角色"]), promoter: text(row["带货人"]) || text(row["达人昵称"])
  }));
  const voucherKeys = new Set(records.map((row) => `${row.orderId}|${row.voucher}`).filter((key) => !key.endsWith("|")));
  return {
    records, rawRows: rows.length, validRows: valid.length, reversedRows: rows.length - valid.length, exactDuplicateCandidates: duplicates.length, duplicatesRemoved: removeExactDuplicates ? duplicates.length : 0,
    voucherCount: voucherKeys.size || records.length, orderCount: new Set(records.map((row) => row.orderId).filter(Boolean)).size,
    amount: sum(records, "orderReceived"), expectedIncome: sum(records, "expectedIncome"), userPaid: sum(records, "userPaid"),
    platformFee: sum(records, "platformFee"), thirdPartyFee: sum(records, "thirdPartyFee"),
    productControl, reconciled: close(sum(records, "orderReceived"), productControl),
    dedupeNote: removeExactDuplicates ? "已移除与商品汇总一致的完全重复导出行。" : duplicates.length ? "存在完全相同行；删除后会破坏商品核销金额对账，暂保留并标记需核对。" : "未发现完全重复导出行。"
  };
}

function aggregateChannel(orderRows, redemptionRows) {
  const names = ["官号直播", "商家货架", "短视频", "达人", "搜索", "其他来源"];
  return names.map((name) => {
    const orders = orderRows.filter((row) => row.channel === name), redemptions = redemptionRows.filter((row) => row.channel === name);
    return { name, paidOrders: orders.length, userPaid: sum(orders, "userPaid"), orderReceived: sum(orders, "orderReceived"), refund: sum(orders, "refund"), redeemedAmount: sum(redemptions, "orderReceived"), redeemedOrders: new Set(redemptions.map((row) => row.orderId)).size };
  }).filter((row) => row.paidOrders || row.redeemedOrders);
}

function aggregatePromoters(orderRows, redemptionRows) {
  const map = new Map();
  for (const row of orderRows.filter((row) => row.channel === "达人")) {
    const name = row.promoter || "未标注达人", target = map.get(name) || { name, paidOrders: 0, userPaid: 0, redeemedAmount: 0, refund: 0 };
    target.paidOrders += 1; target.userPaid += row.userPaid || 0; target.refund += row.refund || 0; map.set(name, target);
  }
  for (const row of redemptionRows.filter((row) => row.channel === "达人")) {
    const name = row.promoter || "未标注达人", target = map.get(name) || { name, paidOrders: 0, userPaid: 0, redeemedAmount: 0, refund: 0 };
    target.redeemedAmount += row.orderReceived || 0; map.set(name, target);
  }
  return [...map.values()].map((row) => ({ ...row, sevenDayArrivalRate: null })).filter((row) => row.paidOrders >= 3).sort((a, b) => b.userPaid - a.userPaid);
}

function liveBreakdown(liveRows) {
  const slots = [["早场", 0, 11], ["午场", 12, 17], ["晚场", 18, 23]];
  const group = (rows) => {
    // `liveRows` have already been normalized. Re-running aggregateLive would
    // expect raw Excel column names and silently turn every time-slot into 0.
    const hours = sum(rows, "hours");
    const gmv = sum(rows, "gmv");
    const tickets = sum(rows, "tickets");
    return {
      sessions: rows.length,
      hours,
      gmv,
      tickets,
      gmvPerHour: hours ? gmv / hours : null,
      ticketsPerHour: hours ? tickets / hours : null
    };
  };
  const bySlot = slots.map(([name, start, end]) => ({ name, weekday: group(liveRows.filter((row) => { const weekday = new Date(`${row.day}T12:00:00`).getDay(); return row.hour >= start && row.hour <= end && weekday >= 1 && weekday <= 5; })), weekend: group(liveRows.filter((row) => { const weekday = new Date(`${row.day}T12:00:00`).getDay(); return row.hour >= start && row.hour <= end && (weekday === 0 || weekday === 6); })) }));
  const cells = bySlot.flatMap((row) => [[`${row.name}·周中`, row.weekday], [`${row.name}·周末`, row.weekend]]).filter(([, fact]) => fact.hours > 0).sort((a, b) => (b[1].gmvPerHour || 0) - (a[1].gmvPerHour || 0));
  const dayMap = new Map();
  for (const row of liveRows) {
    const target = dayMap.get(row.day) || { day: row.day, sessions: 0, hours: 0, gmv: 0, tickets: 0, viewers: 0 };
    target.sessions += 1; target.hours += row.hours || 0; target.gmv += row.gmv || 0; target.tickets += row.tickets || 0; target.viewers += row.viewers || 0; dayMap.set(row.day, target);
  }
  return { bySlot, best: cells[0] ? { name: cells[0][0], ...cells[0][1] } : null, lowest: cells.at(-1) ? { name: cells.at(-1)[0], ...cells.at(-1)[1] } : null, daily: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)).map((row) => ({ ...row, gmvPerHour: row.hours ? row.gmv / row.hours : null })) };
}

function cohort7d(week, orders, redemptions, cutoff) {
  const eligible = orders.filter((row) => inPeriod(row.day, week) && row.day && addDays(row.day, 7) <= cutoff);
  if (!eligible.length) return { matureOrders: 0, userPaid: null, redeemedAmount: null, rate: null, note: "14天、30天数据持续积累中" };
  const ids = new Map(eligible.map((row) => [row.id, row]));
  const within = redemptions.filter((row) => {
    const order = ids.get(row.orderId);
    return order && row.day && row.day >= order.day && row.day <= addDays(order.day, 7);
  });
  return { matureOrders: eligible.length, userPaid: sum(eligible, "userPaid"), redeemedAmount: sum(within, "orderReceived"), rate: ratio(sum(within, "orderReceived"), sum(eligible, "userPaid")), note: "按已满7天的同批下单订单计算：7天内核销订单实收 ÷ 同批用户实付。" };
}

function statusFor(week, quality, coverage) {
  const labels = { live: "直播", product: "商品", orders: "订单", redemptions: "核销", aftersales: "售后" };
  const missing = Object.entries(coverage).filter(([, covered]) => !covered).map(([key]) => labels[key]);
  if (missing.length) return { level: "insufficient", label: "数据不足", message: `缺少${missing.join("、")}数据或未完整覆盖本周期，相关指标显示数据不足。` };
  if (week.isPartialWeek) return { level: "observe", label: "观察", message: "非完整自然周，不做强环比结论。" };
  if (!quality.productReconciled || quality.unmatchedRedemptionOrders > 0 || quality.exactDuplicateCandidates > 0 || quality.productRefundAnomalies > 0) return { level: "observe", label: "需关注", message: "存在需核对的数据质量提示，结论仅供经营观察。" };
  return { level: "normal", label: "正常", message: "核心数据覆盖完整，金额口径已完成基础对账。" };
}

function sourceCoverage(rows, dayKey, week) {
  const allDates = rows.map((row) => row[dayKey]).filter(Boolean).sort();
  const dates = new Set(allDates.filter((day) => inPeriod(day, week)));
  let expected = 0;
  for (let day = week.startDate; day <= week.endDate; day = addDays(day, 1)) expected += 1;
  // 交易或核销某天为零时不会有记录，不能据此误判为文件缺失；以源表日期范围覆盖本周为准。
  return { days: dates.size, expected, start: allDates[0] || null, end: allDates.at(-1) || null, complete: Boolean(allDates[0] && allDates.at(-1) && allDates[0] <= week.startDate && allDates.at(-1) >= week.endDate) };
}

function diagnosis(topic, previousTopic) {
  const live = topic.live;
  if (!previousTopic || previousTopic.period.isPartialWeek) return `上一对比期为非完整周期，不做强环比。当前直播每小时成交额 ${Math.round(live.gmvPerHour || 0).toLocaleString("zh-CN")} 元；已记录到店核销订单实收 ${Math.round(topic.fulfillment.redeemedAmount || 0).toLocaleString("zh-CN")} 元，7天到店仍在持续积累。`;
  const previous = previousTopic.live;
  const hourDown = Number.isFinite(live.gmvPerHour) && Number.isFinite(previous.gmvPerHour) && live.gmvPerHour < previous.gmvPerHour;
  const gmvUp = Number.isFinite(live.gmv) && Number.isFinite(previous.gmv) && live.gmv > previous.gmv;
  const best = topic.liveBreakdown.best?.name;
  if (gmvUp && hourDown) return `直播成交增长，但每小时成交下降${best ? `；${best}表现相对更好` : ""}。已记录核销仍在持续释放，需继续追踪下单到到店转化。`;
  if (hourDown) return `直播每小时成交下降${best ? `，${best}为当前相对高效时段` : ""}；建议优先核对流量、进房和观看到成交环节。`;
  if (gmvUp) return `直播成交与每小时产出均有改善${best ? `，${best}为当前高效时段` : ""}；核销与7天到店仍需按同批订单持续观察。`;
  return `直播成交表现平稳，当前已记录核销订单实收 ${Math.round(topic.fulfillment.redeemedAmount || 0).toLocaleString("zh-CN")} 元；继续以成熟订单的7天到店率判断成交质量。`;
}

export function buildDouyinTopics({ weeks, live = [], product = [], orders = [], redemptions = [], aftersales = [] }) {
  const data = normalizeInputs({ live, product, orders, redemptions, aftersales });
  const allProducts = aggregateProducts(data.product);
  const allOrders = aggregateOrders(data.orders);
  const allRedemptions = aggregateRedemptions(data.redemptions, allProducts.totalRedeemedAmount);
  const sourceCutoff = [data.live, data.product, data.orders, data.redemptions, data.aftersales].flatMap((rows) => rows.map((row) => row.__day).filter(Boolean)).sort().at(-1) || null;
  const topics = {};
  for (const week of weeks) {
    const liveRows = data.live.filter((row) => inPeriod(row.__day, week));
    const productRows = data.product.filter((row) => inPeriod(row.__day, week));
    const orderRows = allOrders.orders.filter((row) => inPeriod(row.day, week));
    const redemptionRows = allRedemptions.records.filter((row) => inPeriod(row.day, week));
    const afterSales = aggregateAftersales(data.aftersales.filter((row) => inPeriod(row.__day, week)));
    const products = aggregateProducts(productRows);
    const liveFacts = aggregateLive(liveRows);
    const matched = redemptionRows.filter((row) => allOrders.byId.has(row.orderId));
    const currentPurchase = matched.filter((row) => inPeriod(allOrders.byId.get(row.orderId)?.day, week));
    const priorPurchase = matched.filter((row) => { const day = allOrders.byId.get(row.orderId)?.day; return day && day < week.startDate; });
    const unmatched = redemptionRows.filter((row) => !allOrders.byId.has(row.orderId));
    const coverage = {
      live: sourceCoverage(data.live, "__day", week).complete,
      product: sourceCoverage(data.product, "__day", week).complete,
      orders: sourceCoverage(data.orders, "__day", week).complete,
      redemptions: sourceCoverage(data.redemptions, "__day", week).complete,
      aftersales: sourceCoverage(data.aftersales, "__day", week).complete
    };
    const orderAmounts = {
      paidOrders: orderRows.length, userPaid: sum(orderRows, "userPaid"), orderReceived: sum(orderRows, "orderReceived"), expectedIncome: sum(orderRows, "expectedIncome"), refund: sum(orderRows, "refund"),
      retained: (sum(orderRows, "userPaid") ?? 0) - (sum(orderRows, "refund") ?? 0), softwareFee: sum(orderRows, "softwareFee"), hostingFee: sum(orderRows, "hostingFee"), talentFee: sum(orderRows, "talentFee"), serviceFee: sum(orderRows, "serviceFee")
    };
    const topic = {
      schemaVersion: "douyin-topic-v1", period: { id: week.id, startDate: week.startDate, endDate: week.endDate, isPartialWeek: Boolean(week.isPartialWeek), dataAsOf: sourceCutoff },
      live: liveFacts, products, orders: orderAmounts, aftersales: { applications: afterSales.applications, amount: afterSales.amount, vouchers: afterSales.vouchers, periodBasis: "售后完成时间" },
      fulfillment: {
        redemptionRecords: redemptionRows.length, redeemedVouchers: new Set(redemptionRows.map((row) => `${row.orderId}|${row.voucher}`).filter((key) => !key.endsWith("|"))).size || redemptionRows.length,
        redeemedOrders: new Set(redemptionRows.map((row) => row.orderId)).size, redeemedAmount: sum(redemptionRows, "orderReceived"), expectedIncome: sum(redemptionRows, "expectedIncome"),
        currentPurchaseCurrentRedemption: sum(currentPurchase, "orderReceived"), priorPurchaseCurrentRedemption: sum(priorPurchase, "orderReceived"), unmatchedPurchaseCurrentRedemption: sum(unmatched, "orderReceived"),
        matchedOrderRate: ratio(matched.length, redemptionRows.length), sevenDay: cohort7d(week, allOrders.orders, allRedemptions.records, sourceCutoff)
      },
      channels: aggregateChannel(orderRows, redemptionRows), promoters: aggregatePromoters(orderRows, redemptionRows), liveBreakdown: liveBreakdown(liveFacts.live),
      quality: {
        coverage, orderDuplicateIds: allOrders.duplicateIds.length, exactDuplicateCandidates: allRedemptions.exactDuplicateCandidates, duplicatesRemoved: allRedemptions.duplicatesRemoved,
        redemptionReversed: data.redemptions.filter((row) => inPeriod(row.__day, week)).length - redemptionRows.length, productReconciled: close(sum(redemptionRows, "orderReceived"), products.totalRedeemedAmount),
        productDifference: (sum(redemptionRows, "orderReceived") ?? 0) - (products.totalRedeemedAmount ?? 0), unmatchedRedemptionOrders: new Set(unmatched.map((row) => row.orderId)).size,
        multiVoucherOrders: [...new Set(redemptionRows.map((row) => row.orderId))].filter((id) => redemptionRows.filter((row) => row.orderId === id).length > 1).length,
        productRefundAnomalies: products.refundAnomalies,
        dedupeNote: allRedemptions.dedupeNote, sourceCutoff
      }
    };
    topic.status = statusFor(week, topic.quality, coverage);
    topics[week.id] = topic;
  }
  const ordered = weeks.map((week) => topics[week.id]);
  ordered.forEach((topic, index) => { topic.diagnosis = diagnosis(topic, ordered[index - 1]); });
  return { topics, dataAsOf: sourceCutoff, sourceCounts: { live: data.live.length, product: data.product.length, orders: data.orders.length, redemptions: data.redemptions.length, aftersales: data.aftersales.length } };
}
