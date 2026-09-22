import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/weekly-insights.js', 'utf8'), context);
const { build, headline } = context.window.WeeklyInsights;

const previous = {
  target: 100000, operatingRevenue: 100000, admission: 600, historical: 0,
  revenue: { newMember: 58000 }, cards: { c299: 50, c599: 40, c999: 10 }, ops: { newCardFamilies: 100 }
};
const current = {
  target: 90000, operatingRevenue: 70000, admission: 400, historical: 0,
  revenue: { newMember: 35000 }, cards: { c299: 40, c599: 15, c999: 5 }, ops: { newCardFamilies: 61 }
};

test('经营诊断从同一周快照生成目标、转化、会员与质量提示', () => {
  const items = build({ data: { douyinFacts: {}, douyinTopic: {} }, current, previous });
  assert.equal(items[0].title, '经营目标尚未完成');
  assert.ok(items.some(item => item.title === '客流与转化需要拆开复盘'));
  assert.ok(items.some(item => item.title === '会员销售结构走弱'));
  assert.ok(items.some(item => item.title === '数据质量提示，结论需保留边界'));
  assert.match(headline(items), /退款后净经营营业额/);
});

test('抖音判断明确支付和核销是不同时间事实，未成熟7天率不伪造比例', () => {
  const data = {
    douyinFacts: {},
    douyinTopic: {
      current: { orders: { userPaid: 500 }, fulfillment: { redeemedAmount: 100, sevenDay: { rate: null } } },
      previous: { orders: { userPaid: 800 }, fulfillment: { redeemedAmount: 300, sevenDay: { rate: 50 } } }
    }
  };
  const items = build({ data, current: { ...current, id: 'current' }, previous: { ...previous, id: 'previous' } });
  const douyin = items.find(item => item.domain === 'douyin');
  assert.match(douyin.judgement, /不同时间事实/);
  assert.match(douyin.judgement, /持续积累中/);
});
