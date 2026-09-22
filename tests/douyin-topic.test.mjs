import test from "node:test";
import assert from "node:assert/strict";
import { buildDouyinTopics } from "../scripts/lib/douyin-topic.mjs";

const week = { id: "week-1", startDate: "2026-09-01", endDate: "2026-09-07", isPartialWeek: false };
const input = {
  weeks: [week],
  live: [{ "直播ID": "900000000000000001", "开播日期": "20260901", "开播时间": "2026-09-01 08:00:00", "直播时长": "2小时", "直播间曝光人数": 1000, "直播间观看人数": 100, "直播间成交金额": 500, "直播间成交券数": 5, "直播间成交人数": 4 }],
  product: [{ "天": "2026-09-01", "商品ID": "100000000000000001", "商品名称": "亲子票", "投放渠道": "不限", "售价": 100, "商品曝光人数": 1000, "商品访问人数": 100, "商品成交金额": 200, "商品成交券数": 2, "商品成交人数": 1, "商品核销金额": 200, "商品核销券数": 2, "商品退款金额": 0, "商品退款券数": 0 }],
  orders: [{ "订单编号": "800000000000000001", "下单时间": "2026-09-01 09:00:00", "订单状态": "待使用", "商品ID": "100000000000000001", "商品名称": "亲子票", "购买数量": 2, "用户实付": 200, "订单实收": 200, "预计收入": 180, "退款金额总计": 0, "成交渠道": "直播", "带货角色": "商家" }],
  redemptions: [
    { "订单编号": "800000000000000001", "券码（已撤销核销加密）": "A", "核销状态": "已核销", "核销时间": "2026-09-02 12:00:00", "下单时间": "2026-09-01 09:00:00", "订单实收": 100, "预计收入": 90, "商品ID": "100000000000000001", "商品名称": "亲子票", "成交渠道": "直播" },
    { "订单编号": "800000000000000001", "券码（已撤销核销加密）": "B", "核销状态": "已核销", "核销时间": "2026-09-02 12:00:00", "下单时间": "2026-09-01 09:00:00", "订单实收": 100, "预计收入": 90, "商品ID": "100000000000000001", "商品名称": "亲子票", "成交渠道": "直播" },
    { "订单编号": "700000000000000001", "券码（已撤销核销加密）": "C", "核销状态": "已撤销核销", "核销时间": "2026-09-02 12:00:00", "订单实收": 100, "商品ID": "100000000000000001", "商品名称": "亲子票" }
  ]
};

test("多券订单按订单+券码保留，核销金额不被订单号去重", () => {
  const topic = buildDouyinTopics(input).topics[week.id];
  assert.equal(topic.fulfillment.redeemedOrders, 1);
  assert.equal(topic.fulfillment.redeemedVouchers, 2);
  assert.equal(topic.fulfillment.redeemedAmount, 200);
  assert.equal(topic.quality.productReconciled, true);
  assert.equal(topic.quality.redemptionReversed, 1);
});

test("7天到店率只计算已成熟同批订单，直播成交额不混入订单实付", () => {
  const matured = structuredClone(input);
  // 数据截至9月8日，9月1日下单的同批订单已满7天。
  matured.live.push({ ...matured.live[0], "直播ID": "900000000000000002", "开播日期": "20260908", "开播时间": "2026-09-08 08:00:00" });
  const topic = buildDouyinTopics(matured).topics[week.id];
  assert.equal(topic.orders.userPaid, 200);
  assert.equal(topic.live.gmv, 500);
  assert.equal(topic.fulfillment.sevenDay.redeemedAmount, 200);
  assert.equal(topic.fulfillment.sevenDay.rate, 100);
});

test("商品退款超过本期成交时不静默展示为正常退款率", () => {
  const changed = structuredClone(input);
  changed.product[0]["商品退款金额"] = 300;
  changed.product[0]["商品退款券数"] = 3;
  const product = buildDouyinTopics(changed).topics[week.id].products.products[0];
  assert.equal(product.refundRate, null);
  assert.equal(product.refundAnomaly, true);
});
