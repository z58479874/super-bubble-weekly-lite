import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const context={window:{},crypto:webcrypto};
vm.runInNewContext(readFileSync('public/report-items.js','utf8'),context);
const R=context.window.ReportItems;
test('两个事项模板有五个完整模块，默认三条复盘、所有输入为空',()=>{
  const report=R.prepare();assert.equal(R.sections.length,5);assert.equal(report.closure_review.length,3);
  for(const s of R.sections){assert.ok(report[`closure_${s.key}`].length);assert.ok(report[`closure_${s.key}`].every(row=>!R.filled(row)))}
  const html=R.render(report);assert.doesNotMatch(html,/最多|关键结果|经营数据卡/);
  assert.equal((html.match(/data-add-closure=/g)||[]).length,5);
});
test('跨周仅带入未完成事项，重复来源不会带入两次',()=>{
  const prior=R.prepare();prior.weekId='last';
  prior.closure_plans=[{id:'a',title:'安全绳复检',owner:'李主管',due:'2026-09-18',status:'延期'},{id:'b',title:'已完成培训',status:'已完成'},{id:'c',title:'取消排班',status:'已取消'}];
  prior.closure_followups=[{id:'d',source:'last:plans:a',title:'安全绳复检',status:'进行中'}];
  const current=R.prepare({},prior),rows=current.closure_review.filter(R.filled);
  assert.equal(rows.length,1);assert.equal(rows[0].title,'安全绳复检');assert.equal(rows[0].owner,'李主管');
  assert.equal(JSON.stringify(R.prepare(current,prior)),JSON.stringify(current));
});
test('旧版周报迁移保留原文、计划、未完成原因和支持事项',()=>{
  const report=R.prepare({result_explanation:'旧结果',focus_0_title:'盘点',undone_0:'补货',undone_0_reason:'未到货',support_0_title:'批准预算',support_0_target:'店长'});
  assert.equal(report.result_explanation,'旧结果');assert.equal(report.closure_plans[0].title,'盘点');
  assert.equal(report.closure_review[0].reason,'未到货');assert.equal(report.closure_decisions[0].title,'批准预算');
});
test('跟进带入排除已完成、幂等；删除来源后不会自动复活',()=>{
  let report=R.prepare();report.closure_plans=[{id:'a',title:'培训',status:'进行中'},{id:'b',title:'结束',status:'已完成'}];
  report.closure_coordination=[{id:'c',title:'协调排班',status:'待回复'}];
  report=R.carryFollowups(report);assert.equal(report.closure_followups.filter(R.filled).length,2);
  report=R.carryFollowups(report);assert.equal(report.closure_followups.filter(R.filled).length,2);
  report.closure_dismissed_sources=['plans:a'];report.closure_followups=report.closure_followups.filter(x=>x.source!=='plans:a');
  assert.equal(R.carryFollowups(report).closure_followups.filter(R.filled).length,1);
});
test('支持超过三条、删除到零不会补回，周会摘要包含第四条以后计划',()=>{
  const report=R.prepare();report.closure_plans=Array.from({length:20},(_,i)=>({id:`p${i}`,title:`计划${i}`}));
  assert.equal(R.summary(report,'ops').focus.length,20);
  report.closure_review=[];assert.equal(R.prepare(report).closure_review.length,0);
});
test('状态与临近截止提醒，不把空行或已完成标为逾期',()=>{
  const now=Date.parse('2026-09-21T12:00:00+08:00');
  assert.equal(R.tone({title:'支持',due:'2026-09-22'},'decisions',now).color,'orange');
  assert.equal(R.tone({title:'支持',due:'2026-09-20'},'decisions',now).color,'red');
  assert.equal(R.tone({title:'支持',due:'2026-09-20',status:'已解决'},'decisions',now).color,'green');
  assert.equal(R.tone({},'review',now).color,'gray');
});
test('用户文字在表单与只读历史中均转义',()=>{
  const report=R.prepare();report.closure_plans=[{id:'a',title:'<img src=x onerror=alert(1)>'}];
  assert.doesNotMatch(R.render(report),/<img/);assert.doesNotMatch(R.historyHTML([{label:'<test>',report}]),/<img|<test>/);
});
