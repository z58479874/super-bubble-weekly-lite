import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const context={window:{},crypto:webcrypto};
vm.runInNewContext(readFileSync('public/front-report.js','utf8'),context);
const F=context.window.FrontReport;

test('前厅模板保留数据分析与六类不限条数事项，默认复盘有三行且不填无',()=>{
  const report=F.prepare();
  assert.equal(report.front_review.length,3);
  assert.equal(F.sections.length,6);
  for(const section of F.sections)assert.ok(report[`front_${section.key}`].length>=1);
  assert.ok(F.insightFields.every(([key])=>report[key]===''));
  const html=F.render(report);
  assert.match(html,/本周经营亮点/);
  assert.match(html,/下周经营目标与行动计划/);
  assert.doesNotMatch(html,/最多\s*3项/);
  assert.equal((html.match(/data-front-add=/g)||[]).length,6);
});

test('上周未完成计划、问题、协调和店长决策自动进入前厅复盘，已完成不带入',()=>{
  const prior=F.prepare();prior.weekId='period-old';
  prior.front_plans=[{id:'p1',title:'周末转化训练',status:'进行中',owner:'张曼'},{id:'p2',title:'完成培训',status:'已完成'}];
  prior.front_issues=[{id:'i1',title:'高峰收银排队',status:'延期'}];
  prior.front_coordination=[{id:'c1',title:'周末增派人员',status:'待回复'}];
  prior.front_decisions=[{id:'d1',title:'确认临时激励',status:'已解决'}];
  const report=F.prepare({},prior),rows=report.front_review.filter(F.filled);
  assert.equal(rows.map(row=>row.title).sort().join('|'),['周末转化训练','高峰收银排队','周末增派人员'].sort().join('|'));
  assert.equal(JSON.stringify(F.prepare(report,prior)),JSON.stringify(report));
});

test('旧版前厅周报迁移保留原文并映射问题、计划与支持事项',()=>{
  const report=F.prepare({result_explanation:'旧版前厅总结',problems_0:'会员办理解释不清',problems_0_impact:'转化受影响',focus_0_title:'补齐话术',undone_0:'培训未完成',support_0_title:'周末支援',support_0_target:'店长'});
  assert.equal(report.front_insight_change,'旧版前厅总结');
  assert.equal(report.front_issues[0].title,'会员办理解释不清');
  assert.equal(report.front_plans[0].title,'补齐话术');
  assert.equal(report.front_review[0].title,'培训未完成');
  assert.equal(report.front_decisions[0].title,'周末支援');
});

test('旧版占位文本无不会变成前厅事项，新模板保持空白待填写',()=>{
  const report=F.prepare({problems_0:'无',support_0_title:'无',undone_0:'无'});
  assert.ok(report.front_issues.every(row=>!F.filled(row)));
  assert.ok(report.front_coordination.every(row=>!F.filled(row)));
  assert.ok(report.front_review.every(row=>!F.filled(row)));
});

test('前厅计划不限条数、排序和持续跟进带入均可幂等运行',()=>{
  let report=F.prepare();
  report.front_plans=Array.from({length:12},(_,i)=>({id:`p${i}`,title:`计划${i}`,status:i===10?'已完成':'进行中'}));
  report.front_issues=[{id:'issue',title:'核销差错',status:'延期'}];
  report.front_coordination=[{id:'coord',title:'协同排班',status:'待回复'}];
  report=F.carryFollowups(report);
  assert.equal(report.front_followups.filter(F.filled).length,13);
  report=F.carryFollowups(report);
  assert.equal(report.front_followups.filter(F.filled).length,13);
  assert.equal(F.summary(report,'front').focus.length,12);
  report.front_review=[];
  assert.equal(F.prepare(report).front_review.length,0);
});

test('前厅确认历史和表单内容对用户文字转义',()=>{
  const report=F.prepare();report.front_issues=[{id:'x',title:'<img src=x onerror=alert(1)>'}];
  assert.doesNotMatch(F.render(report),/<img/);
  assert.doesNotMatch(F.historyHTML([{label:'<label>',report}]),/<img|<label>/);
});

test('前厅销售表和事项表单在手机断点改为单列，不依赖横向长表',()=>{
  const css=readFileSync('public/shared.css','utf8');
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.front-sales-table table[\s\S]*display: block/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.front-insight-fields \{ grid-template-columns: 1fr/);
  assert.match(css,/@media\(max-width:650px\)\{\.closure-fields\{grid-template-columns:1fr/);
});
