(function(){
  let D=window.LITE_DATA, app=document.getElementById("app");
  const explainDefaults={refund:{status:"待说明",note:""},conversion:{status:"待说明",note:""}};
  let savedExplains={};try{savedExplains=JSON.parse(localStorage.getItem("super_bubble_weekly_lite_explains")||"{}")}catch(_){}
  const EDITOR_NAME_KEY="super_bubble_weekly_lite_editor_name";
  const savedEditorName=()=>{try{return localStorage.getItem(EDITOR_NAME_KEY)||""}catch(_){return ""}};
  const state={page:"overview",tab:"front",dept:"ops",rank:"rate",modal:null,reports:{},reviewRows:{ops:0},meetingMode:"supervisor",presentation:false,meetingEditor:null,meeting:{actions:[],decisions:[],ownerSupport:[]},toast:"",explains:{...explainDefaults,...savedExplains},authIntent:"edit",cloud:{status:"loading",source:"notes",lastUpdated:"",session:window.CloudSync?.session?.()||null}};
  let reportAutosaveTimer=null,reportSaveQueue=Promise.resolve();
  let historyReports=[],closureDragId=null;
  const isClosureDepartment=id=>id==='ops'||id==='admin';
  function closureReport(id=state.dept){
    if(state.reports[id]?.closure_template===1)return state.reports[id];
    const prior=historyReports.find(r=>r.departmentId===id&&r.weekId===previous?.id);
    const priorVersion=prior?.status==='已确认'?prior:prior?.confirmationHistory?.at(-1)?.report||prior;
    const record=window.ReportItems.prepare(state.reports[id]||{},priorVersion);
    state.reports[id]=record;return record;
  }
  function closureHistory(id){
    const own=state.reports[id]||{},entries=[];
    for(const r of historyReports.filter(r=>r.departmentId===id&&r.weekId!==current?.id)){
      const week=weeks.find(w=>w.id===r.weekId),label=week?.range||r.weekId;
      entries.push({label:`${label} · ${r.status||'未填写'}`,report:r});
      for(const v of r.confirmationHistory||[])entries.push({label:`${label} · 已确认版本`,report:v.report});
    }
    for(const v of own.confirmationHistory||[])entries.push({label:'本周 · 已确认版本',report:v.report});
    if(Object.entries(own).some(([key,value])=>/^(result_explanation|problems_|focus_|support_|undone_|review_|specific_|advice)/.test(key)&&typeof value==='string'&&value.trim()))entries.push({label:'本周旧模板原始填写（保留）',report:{...own,closure_template:0}});
    return window.ReportItems.historyHTML(entries);
  }
  function closureReports(){
    const report=closureReport(),dept=reportDepartments[state.dept],confirmed=report.status==='已确认',editable=Boolean(state.cloud.session)&&!confirmed;
    return `${header('部门周报','聚焦待办闭环、协同事项与本周计划，不强制填写经营数据。')}<main class="content report-page"><div class="dept-tabs" style="grid-template-columns:repeat(3,1fr)">${Object.entries(reportDepartments).map(([id,x])=>`<button class="${state.dept===id?'active':''}" data-dept="${id}"><span>${x.name}</span><small>${state.reports[id]?.status||'未填写'}</small></button>`).join('')}</div><section class="report-head"><div><span>当前填写</span><h2>${dept.name} · ${current.label}周报</h2><p>周期：${current.range}</p><p>主管：${safeValue(report.editorName||state.cloud.session?.name||'未填写')} · 保存方式：共享保存，离线时使用本机缓存</p><small class="report-flow">填写后保存草稿，完成后标记已确认；已确认周报可重新编辑，确认版本保留。</small></div><div><span class="report-status ${confirmed?'confirmed':report.status==='草稿'?'draft':''}">${report.status||'未填写'}</span>${confirmed&&report.confirmedBy?`<small>确认人：${safeValue(report.confirmedBy)} · ${reportTime(report.confirmedAt)}</small>`:''}</div></section>${closureHistory(state.dept)}<form class="report-form closure-form" data-report-form><fieldset class="report-edit-fields" ${editable?'':'disabled'}>${window.ReportItems.render(report,confirmed)}</fieldset><div class="sticky-actions"><span>最近保存：${reportTime(report.updatedAt||report.savedAt)}</span>${confirmed?'<button type="button" class="ghost" data-reopen-report>重新编辑</button>':'<button type="button" class="ghost" data-save-draft>保存草稿</button><button type="button" class="primary" data-confirm-report>标记已确认</button>'}</div></form></main>`;
  }
  function frontPreviousFullWeek(){return [...weeks].slice(0,-1).reverse().find(week=>!week.isPartialWeek)||null}
  function frontReport(){
    if(state.reports.front?.front_template===1)return state.reports.front;
    const prior=historyReports.find(report=>report.departmentId==='front'&&report.weekId===frontPreviousFullWeek()?.id);
    const priorVersion=prior?.status==='已确认'?prior:prior?.confirmationHistory?.at(-1)?.report||prior;
    const record=window.FrontReport.prepare(state.reports.front||{},priorVersion);
    state.reports.front=record;return record;
  }
  function frontHistory(){
    const own=state.reports.front||{},entries=[];
    for(const report of historyReports.filter(report=>report.departmentId==='front'&&report.weekId!==current?.id)){
      const week=weeks.find(item=>item.id===report.weekId),label=week?.range||report.weekId;
      entries.push({label:`${label} · ${report.status||'未填写'}`,report});
      for(const version of report.confirmationHistory||[])entries.push({label:`${label} · 已确认版本`,report:version.report});
    }
    for(const version of own.confirmationHistory||[])entries.push({label:'本周 · 已确认版本',report:version.report});
    if(Object.entries(own).some(([key,value])=>/^(result_explanation|problems_|focus_|support_|undone_|review_|specific_|advice)/.test(key)&&typeof value==='string'&&value.trim()))entries.push({label:'本周旧模板原始填写（保留）',report:{...own,front_template:0}});
    return window.FrontReport.historyHTML(entries);
  }
  function frontMetricChange(currentValue,previousValue,type='number'){
    if(!Number.isFinite(currentValue))return '数据未同步';
    if(!Number.isFinite(previousValue))return '上周完整周数据未同步';
    if(type==='ratio')return `较上周 ${currentValue>=previousValue?'提升':'下降'} ${Math.abs(currentValue-previousValue).toFixed(2)} 个百分点`;
    const change=currentValue-previousValue,format=type==='money'?money(Math.abs(change)):type==='count'?`${Math.abs(change).toLocaleString()}${type==='count'?'':''}`:String(Math.abs(change));
    return `较上周 ${change>=0?'+':'-'}${format}（${delta(currentValue,previousValue)}）`;
  }
  function frontMemberSales(week){
    if(!Number.isFinite(week?.revenue?.newMember))return null;
    return Number.isFinite(week?.revenue?.renewal)?week.revenue.newMember+week.revenue.renewal:week.revenue.newMember;
  }
  function frontOverviewMetrics(){
    const prior=frontPreviousFullWeek(),currentRate=ratio(cardCount(current),valid(current)),priorRate=ratio(cardCount(prior),valid(prior)),online=Number.isFinite(current?.revenue?.online)?current.revenue.online:null,priorOnline=Number.isFinite(prior?.revenue?.online)?prior.revenue.online:null,member=frontMemberSales(current),priorMember=frontMemberSales(prior),memberLabel=Number.isFinite(current?.revenue?.renewal)?'会员卡销售额':'会员卡销售额（续卡未同步）';
    return [
      ['本周总业绩（退款后净额）',rev(current),prior?rev(prior):null,'money','primary'],
      ['本周业绩目标',current?.target,prior?.target,'money',''],
      ['本周目标完成率',ratio(rev(current),current?.target),prior?ratio(rev(prior),prior.target):null,'ratio','primary'],
      ['本周线下收入',current?.ops?.offline,prior?.ops?.offline,'money',''],
      ['本周线上核销订单实收',online,priorOnline,'money',''],
      [memberLabel,member,priorMember,'money','primary'],
      ['本周办卡数',cardCount(current),prior?cardCount(prior):null,'count','primary'],
      ['本周续卡数',current?.ops?.renewalCount,prior?.ops?.renewalCount,'count',''],
      ['本周整体办卡转化率',currentRate,priorRate,'ratio','primary'],
      ['本周入园家庭数',current?.admission,prior?.admission,'count','primary'],
      ['本周内场总客流',current?.traffic,prior?.traffic,'count',''],
      ['本周二销收入',current?.revenue?.secondary,prior?.revenue?.secondary,'money','primary'],
      ['本周线上收入占比',ratio(online,rev(current)),ratio(priorOnline,rev(prior)),'ratio',''],
      [Number.isFinite(current?.revenue?.renewal)?'本周会员销售占比':'本周会员新办占比（续卡未同步）',ratio(member,rev(current)),ratio(priorMember,rev(prior)),'ratio','']
    ];
  }
  function frontMetricValue(value,type){return Number.isFinite(value)?type==='money'?money(value):type==='ratio'?pct(value,2):`${Number(value).toLocaleString()}`:'数据未同步'}
  function frontOverview(){
    const metrics=frontOverviewMetrics(),prior=frontPreviousFullWeek();
    return `<section class="front-data-overview" data-front-module="overview"><div class="front-data-head"><div><span>1. 本周经营数据总览</span><h2>数据自动读取，无需主管重复填写</h2><p>${prior?`与上周完整周 ${prior.label} · ${prior.range} 对比`:'上周完整周数据未同步，暂不生成环比结论'}；金额单位：元。</p></div><small>闭店日不纳入日均口径；缺失数据不显示为0。</small></div><div class="front-metric-grid">${metrics.map(([label,value,previousValue,type,accent])=>{const comparisonClass=!Number.isFinite(value)||!Number.isFinite(previousValue)?'missing':value>=previousValue?'up':'down';return `<article class="${accent}"><span>${label}</span><b class="${Number.isFinite(value)?'':'missing'}">${frontMetricValue(value,type)}</b><small>上周完整周：${frontMetricValue(previousValue,type)}</small><em class="${comparisonClass}">${frontMetricChange(value,previousValue,type)}</em>${label==='本周目标完成率'&&Number.isFinite(current?.target)?`<i>目标 ${money(current.target)} · ${rev(current)>=current.target?'已达成':`距目标 ${money(current.target-rev(current))}`}</i>`:''}</article>`}).join('')}</div></section>`;
  }
  function frontAutoInterpretation(){
    const prior=frontPreviousFullWeek(),rate=ratio(cardCount(current),valid(current)),priorRate=ratio(cardCount(prior),valid(prior)),facts=[];
    if(prior&&Number.isFinite(rev(current))&&Number.isFinite(rev(prior)))facts.push(`总业绩${rev(current)>=rev(prior)?'增长':'下降'} ${money(Math.abs(rev(current)-rev(prior)))}（${delta(rev(current),rev(prior))}）`);
    if(Number.isFinite(rate)&&Number.isFinite(priorRate))facts.push(`办卡转化率${rate>=priorRate?'提升':'下降'} ${Math.abs(rate-priorRate).toFixed(2)}个百分点`);
    if(prior&&Number.isFinite(current?.revenue?.secondary)&&Number.isFinite(prior?.revenue?.secondary))facts.push(`二销${current.revenue.secondary>=prior.revenue.secondary?'增长':'下降'} ${money(Math.abs(current.revenue.secondary-prior.revenue.secondary))}`);
    if(prior&&Number.isFinite(current?.admission)&&Number.isFinite(prior?.admission))facts.push(`入园家庭${current.admission>=prior.admission?'增加':'减少'} ${Math.abs(current.admission-prior.admission)}户`);
    return `<section class="front-auto-reading"><b>自动数据提示</b><span>${facts.length?facts.join('；'):'上周完整周数据未同步，暂不自动生成环比提示。'}</span></section>`;
  }
  function frontSalesRows(week){return Array.isArray(D.receptionByWeek?.[week?.id])?D.receptionByWeek[week.id]:[]}
  function frontSalesPerformance(){
    const rows=frontSalesRows(current),priorRows=frontSalesRows(frontPreviousFullWeek()),priorByName=new Map(priorRows.map(row=>[row.name,row]));
    if(!rows.length)return `<section class="panel form-section front-sales-module" data-front-module="sales"><div class="panel-title"><div><h2>3. 销售人员本周表现</h2><p>销售数据未同步，暂不显示虚构排名。</p></div></div><p class="empty">销售数据未同步</p></section>`;
    const ranked=[...rows].filter(row=>!row.aggregate).sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0)||(Number(b.enrolled)||0)-(Number(a.enrolled)||0)||((b.receptionKnown?ratio(b.enrolled,b.reception):-1)-(a.receptionKnown?ratio(a.enrolled,a.reception):-1)));
    const value=(number,format='count')=>Number.isFinite(number)?format==='money'?money(number):`${number.toLocaleString()}`:'数据未同步';
    const comparison=(row,key,type)=>{const prior=priorByName.get(row.name)?.[key];if(!Number.isFinite(row[key])||!Number.isFinite(prior))return '上周完整周数据未同步';if(key==='reception'&&!row.receptionKnown)return '覆盖不完整，暂不可比';return frontMetricChange(row[key],prior,type)};
    return `<section class="panel form-section front-sales-module" data-front-module="sales"><div class="panel-title"><div><h2>3. 销售人员本周表现</h2><p>默认按办卡金额、办卡数、个人办卡率排序；家庭/金额覆盖不完整时仅供参考，不作正式横向评价。</p></div></div><div class="table-wrap front-sales-table"><table><thead><tr><th>姓名</th><th>办卡数</th><th>办卡金额</th><th>散客家庭数</th><th>个人办卡率</th><th>家庭办卡客单价</th><th>299</th><th>599</th><th>999</th><th>与上周办卡金额对比</th><th>与上周办卡率对比</th></tr></thead><tbody>${ranked.map((row,index)=>{const rate=row.receptionKnown?ratio(row.enrolled,row.reception):null,prior=priorByName.get(row.name),priorRate=prior?.receptionKnown?ratio(prior.enrolled,prior.reception):null;return `<tr><td data-label="姓名"><b>${index+1}. ${safeValue(row.name)}</b></td><td data-label="办卡数">${value(row.enrolled)}</td><td data-label="办卡金额">${row.amountKnown?value(row.amount,'money'):`${value(row.amount,'money')}（部分）`}</td><td data-label="散客家庭数">${row.receptionKnown?value(row.reception):`${value(row.reception)}（覆盖不完整）`}</td><td data-label="个人办卡率">${Number.isFinite(rate)?pct(rate,2):'暂不可比'}</td><td data-label="家庭办卡客单价">${row.amountKnown&&row.receptionKnown&&row.enrolled>0?money(row.amount/row.enrolled):'暂不可比'}</td><td data-label="299">${value(row.c299)}</td><td data-label="599">${value(row.c599)}</td><td data-label="999">${value(row.c999)}</td><td data-label="与上周办卡金额对比">${row.amountKnown&&prior?.amountKnown?comparison(row,'amount','money'):'暂不可比'}</td><td data-label="与上周办卡率对比">${Number.isFinite(rate)&&Number.isFinite(priorRate)?frontMetricChange(rate,priorRate,'ratio'):'暂不可比'}</td></tr>`}).join('')}</tbody></table></div><p class="front-data-warning">当前员工个人家庭数与办卡金额存在覆盖不完整日期：个人办卡率、客单价及金额对比显示“暂不可比”时，不应用于正式排名。</p></section>`;
  }
  function frontReports(){
    const report=frontReport(),confirmed=report.status==='已确认',editable=Boolean(state.cloud.session)&&!confirmed;
    return `${header('部门周报','前厅部：先看经营数据，再做分析、改善和量化行动计划')}<main class="content report-page front-report-page"><div class="dept-tabs" style="grid-template-columns:repeat(3,1fr)">${Object.entries(reportDepartments).map(([id,item])=>`<button class="${state.dept===id?'active':''}" data-dept="${id}"><span>${item.name}</span><small>${state.reports[id]?.status||'未填写'}</small></button>`).join('')}</div><section class="report-head"><div><span>当前填写</span><h2>前厅部 · ${current.label}周报</h2><p>周期：${current.range}</p><p>主管：${safeValue(report.editorName||state.cloud.session?.name||'未填写')} · 保存方式：共享保存，离线时使用本机缓存</p><small class="report-flow">数据区域自动读取；分析、原因、措施和计划由主管填写。填写后保存草稿，完成后标记已确认。</small></div><div><span class="report-status ${confirmed?'confirmed':report.status==='草稿'?'draft':''}">${report.status||'未填写'}</span>${confirmed&&report.confirmedBy?`<small>确认人：${safeValue(report.confirmedBy)} · ${reportTime(report.confirmedAt)}</small>`:''}</div></section>${frontOverview()}${frontAutoInterpretation()}${frontSalesPerformance()}${frontHistory()}<form class="report-form front-report-form" data-report-form><fieldset class="report-edit-fields" ${editable?'':'disabled'}>${window.FrontReport.render(report,!editable)}</fieldset><div class="sticky-actions"><span>最近保存：${reportTime(report.updatedAt||report.savedAt)}</span>${confirmed?'<button type="button" class="ghost" data-reopen-report>重新编辑</button>':'<button type="button" class="ghost" data-save-draft>保存草稿</button><button type="button" class="primary" data-confirm-report>标记已确认</button>'}</div></form></main>`;
  }
  function persistExplains(){try{localStorage.setItem("super_bubble_weekly_lite_explains",JSON.stringify(state.explains))}catch(_){}}
  async function persistMeeting(){
    if(!current||state.cloud.session?.role!=="manager")return;
    window.CloudSync.cacheMeeting({...state.meeting,weekId:current.id});
    state.cloud.status="saving";render();
    try{const result=await window.CloudSync.saveMeeting({...state.meeting,weekId:current.id});state.meeting={...state.meeting,...result.meeting};state.cloud.status="synced";state.cloud.lastUpdated=result.meeting.updatedAt;}
    catch(error){state.cloud.status="offline";flash(error.message||"周会内容保存失败，内容已保存在本机");}
    render();
  }
  const nav=[{id:"overview",icon:"▦",label:"周经营总览"},{id:"frontDouyin",icon:"↗",label:"前厅与抖音"},{id:"reports",icon:"▤",label:"部门周报"},{id:"meeting",icon:"◈",label:"周会与老板汇报"}];
  const money=n=>Number.isFinite(n)?`¥${Math.abs(n).toLocaleString("zh-CN",{maximumFractionDigits:0})}`:"未统计";
  const ratio=(a,b)=>b>0?a/b*100:null;
  const pct=(n,d=1)=>Number.isFinite(n)?`${n.toFixed(d)}%`:"不可计算";
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?`${a>=b?"+":""}${((a-b)/Math.abs(b)*100).toFixed(1)}%`:"暂不可比";
  const sum=(rows,key)=>rows.reduce((t,x)=>t+(Number.isFinite(Number(key?x[key]:x))?Number(key?x[key]:x):0),0);
  const rev=w=>Number.isFinite(w?.operatingRevenue)?w.operatingRevenue:Object.values(w?.revenue||{}).filter(Number.isFinite).reduce((a,b)=>a+b,0);
  const cardCount=w=>[w?.cards?.c299,w?.cards?.c599,w?.cards?.c999].filter(Number.isFinite).reduce((a,b)=>a+b,0);
  const valid=w=>Number.isFinite(w?.admission)&&Number.isFinite(w?.historical)?w.admission-w.historical:null;
  let weeks=[],current=null,previous=null,older=null;
  function applyData(next){D=next||window.LITE_DATA;weeks=D.weeks||[];current=weeks.at(-1)||null;previous=weeks.at(-2)||null;older=weeks.at(-3)||null;if(current)D.reception=(D.receptionByWeek?.[current.id]||D.reception||[]);}
  applyData(D);
  function douyinSummary(week){
    const fact=D.douyinFacts[week?.id]||{};
    if(Number.isFinite(fact.paidOrders))return fact;
    if(!fact.products)return fact;
    const products=fact.products, live=fact.live;
    return {
      exposure:fact.exposure,viewers:fact.viewers,clicks:fact.clicks,
      liveHours:sum(live,"hours"),gmv:sum(products,"gmv"),paidOrders:sum(products,"orders"),
      paidAmount:sum(products,"paidAmount"),refundOrders:sum(products,"refundOrders"),refundAmount:sum(products,"refundAmount"),
      redeemedOrders:sum(products,"redeemed"),redeemedOrderReceived:sum(products,"redeemedAmount"),
      tracked:sum(products,"tracked"),enrolled:sum(products,"enrolled")
    };
  }
  const douyinDetails=week=>D.douyinFacts[week.id];
  function flash(text){state.toast=text;render();setTimeout(()=>{state.toast="";render()},2200)}
  function spark(values){const clean=values.filter(Number.isFinite);if(clean.length<2)return `<span class="spark-empty">${clean.length===1?'单期':'暂无趋势'}</span>`;const min=Math.min(...clean),max=Math.max(...clean),step=68/(clean.length-1),pts=clean.map((v,i)=>`${6+i*step},${32-(v-min)/(max-min||1)*24}`).join(" "),last=pts.split(" ").at(-1).split(",");return `<svg class="spark" viewBox="0 0 80 38" aria-label="最近${clean.length}期趋势"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="currentColor"/></svg>`}
  function metric(label,get,format=x=>x,accent="blue") {const vals=weeks.map(get),c=vals.at(-1),p=vals.at(-2);return `<article class="metric ${accent}"><div class="metric-head"><span>${label}</span>${spark(vals)}</div><strong>${format(c)}</strong><div class="compare"><span>上期 <b>${Number.isFinite(p)?format(p):'暂无'}</b></span>${vals.length>=3?`<span>前一期 <b>${format(vals.at(-3))}</b></span>`:''}</div><div class="metric-foot"><span>较上期</span><b class="${Number.isFinite(c)&&Number.isFinite(p)&&c>=p?"up":"down"}">${delta(c,p)}</b></div></article>`}
  function sidebar(){const status=state.cloud.status==="synced"?"● 周报已同步":state.cloud.status==="saving"?"● 正在保存":state.cloud.status==="loading"?"● 正在读取周报":"● 离线 / 本机缓存";return `<aside class="sidebar"><div class="brand"><i>泡</i><div><strong>超级泡泡</strong><span>周经营看板 Lite</span></div></div><nav>${nav.map(x=>`<button ${x.pending?'disabled':''} class="${state.page===x.id?'active':''}" data-nav="${x.id}"><i>${x.icon}</i><span>${x.label}</span>${x.pending?'<em>待开发</em>':''}</button>`).join("")}</nav><div class="local-note cloud-note"><b>静态经营数据 · 共享周报</b><span class="cloud-state ${state.cloud.status}">${status}</span><small>${weeks.length?`${current.label} · 经营数据随版本发布${state.cloud.lastUpdated?` · 周报更新 ${new Date(state.cloud.lastUpdated).toLocaleString('zh-CN',{hour12:false})}`:''}`:'尚未发布经营数据'}</small><button data-edit-mode>${state.cloud.session?`${state.cloud.session.name} · ${state.cloud.session.role==='manager'?'店长编辑':'编辑模式'}（退出）`:'进入编辑模式'}</button><button class="usage-link" data-editor-guide>使用说明</button></div></aside>`}
  function header(title,sub){return `<header class="topbar"><div><h1>${title}</h1><p>${sub}</p></div><div class="top-actions">${current?`<div class="week-pill"><span>当前经营期</span><b>${current.label} · ${current.range}</b></div>`:''}</div></header>`}
  function overview(){
    const rate=w=>ratio(cardCount(w),valid(w));
    const mid=w=>ratio(w.cards.c599+w.cards.c999,cardCount(w));
    const online=w=>ratio(douyinSummary(w).redeemedOrderReceived,rev(w));
    const renewalComplete=weeks.length>0&&weeks.every(w=>Number.isFinite(w?.revenue?.renewal));
    const memberIncome=w=>renewalComplete?w.revenue.newMember+w.revenue.renewal:w.revenue.newMember;
    const memberIncomeLabel=renewalComplete?"会员收入":"会员新办收入";
    const familySpend=w=>Number.isFinite(rev(w))&&w.admission>0?rev(w)/w.admission:null;
    const productivity=w=>Number.isFinite(rev(w))&&w.staff>0?rev(w)/w.staff:null;
    const values=get=>weeks.map(get);
    const tiny=(vals,label)=>`<span class="micro-spark" title="${weeks.length}期 ${label}趋势">${spark(vals)}</span>`;
    const core=(label,get,format,accent="blue")=>{const vals=values(get),c=vals.at(-1),p=vals.at(-2);return `<article class="core-kpi ${accent}"><div class="core-kpi-head"><span>${label}</span>${tiny(vals,label)}</div><strong>${format(c)}</strong><div class="core-kpi-meta"><span>上期 <b>${Number.isFinite(p)?format(p):'暂无'}</b></span><span>环比 <b class="${Number.isFinite(c)&&Number.isFinite(p)&&c>=p?'up':'down'}">${delta(c,p)}</b></span></div></article>`};
    const secondary=(label,get,format)=>{const vals=values(get),c=vals.at(-1),p=vals.at(-2);return `<article class="secondary-kpi"><span>${label}</span><strong>${format(c)}</strong><small>上期 ${Number.isFinite(p)?format(p):'暂无'} · <b class="${Number.isFinite(c)&&Number.isFinite(p)&&c>=p?'up':'down'}">${delta(c,p)}</b></small></article>`};
    const coreCards=[core("退款后净营业额",rev,money,"navy"),core("目标完成率",w=>ratio(rev(w),w.target),pct,"green"),core("入园家庭",w=>w.admission,x=>`${x}户`),core("办卡率",rate,x=>pct(x,2),"green"),core(memberIncomeLabel,memberIncome,money,"violet"),core("抖音核销订单实收",w=>douyinSummary(w).redeemedOrderReceived,money,"violet")].join("");
    const secondaryCards=[secondary("家庭客单价",familySpend,money),secondary("中大卡率",mid,x=>pct(x,2)),secondary("线上收入占比",online,x=>pct(x,2)),secondary("二销",w=>w.revenue.secondary,money),secondary("人效",productivity,money)].join("");
    const revenueGroups=[
      {label:"会员收入",items:[["newMember","会员新办"],["renewal","会员续卡"]]},
      {label:"门票经营",items:[["online","抖音核销订单实收"],["ticket","线下票务"]]},
      {label:"其他经营",items:[["secondary","二销"],["other","其他经营收入"]]},
      {label:"冲减",items:[["refund","已确认退款"]]}
    ].map(group=>({...group,items:group.items.map(([key,label])=>({key,label,c:current.revenue[key],p:previous.revenue[key]}))}));
    const lines=revenueGroups.flatMap(group=>group.items);
    const changes=lines.map(x=>({...x,d:x.c-x.p}));
    const growth=changes.filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,3);
    const drag=changes.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,3);
    const growthNames=growth.slice(0,2).map(x=>x.label).join("和")||"无明显增长项";
    const judgementGrowthNames=growth.slice(0,2).map(x=>x.key==="refund"?"退款减少":x.key==="newMember"?"会员新办增长":`${x.label}增长`).join("和")||"暂无明显正向贡献";
    const revenueWow=delta(rev(current),rev(previous));
    const signedMoney=n=>`${n>=0?"+":"-"}${money(n)}`;
    const revenueValue=x=>Number.isFinite(x.c)?`${x.c<0?"-":""}${money(x.c)}`:"未统计";
    const revenueComparison=x=>{if(!Number.isFinite(x.c)||!Number.isFinite(x.p))return"";if(x.key==="refund"){const currentRefund=Math.abs(x.c),previousRefund=Math.abs(x.p),difference=currentRefund-previousRefund;if(difference<0)return `较上期减少 ${money(Math.abs(difference))}（改善${pct(Math.abs(difference)/previousRefund*100,1)}）`;if(difference>0)return `较上期增加 ${money(difference)}（恶化${pct(difference/previousRefund*100,1)}）`;return "较上期持平"}const change=x.c-x.p,rateText=x.p!==0?`（${delta(x.c,x.p)}）`:"";return `较上期 ${signedMoney(change)}${rateText}`};
    const changeDisplay=(x,kind)=>{if(x.key==="refund"){const improved=kind==="growth";return {label:improved?"退款减少":"退款增加",note:improved?"净收入改善":"净收入拖累",amount:`${improved?"+":"-"}${money(Math.abs(x.d))}${improved?"净收入贡献":"净收入拖累"}`};}return {label:x.label,note:kind==="growth"?"较上周增加":"较上周减少",amount:`${kind==="growth"?"+":"-"}${money(Math.abs(x.d))}`};};
    const trendItems=[["净经营营业额",rev,money],["办卡率",rate,x=>pct(x,1)],["抖音核销订单实收",w=>douyinSummary(w).redeemedOrderReceived,money],["入园家庭",w=>w.admission,x=>`${x}户`]];
    const periodNames=weeks.map((_,index)=>index===weeks.length-1?"本期":index===weeks.length-2?"上期":`${weeks.length-index-1}期前`);
    const explainItems=[
      {key:"refund",title:"退款金额变化较大",fact:`退款由上周 ${money(Math.abs(previous.revenue.refund))} 变为 ${money(Math.abs(current.revenue.refund))}，请前厅说明跨周退款及确认口径。`},
      {key:"conversion",title:"增长主要来自转化与客单",fact:`入园家庭环比 ${delta(current.admission,previous.admission)}，营业额环比 ${revenueWow}，请主管说明改善动作能否持续。`}
    ];
    const escapeAttr=value=>String(value||"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
    return `${header("周经营总览","每周主管会经营简报 · 先看结论，再看数字和变化原因")}
      <main class="content overview-page">
        <section class="weekly-judgement">
          <div class="judgement-kicker"><span>本周经营判断</span><em>数据自动生成 · 不自动定责</em></div>
          <p>本周退款后净营业额 <b>${money(rev(current))}</b>，较上周 <b class="up">${revenueWow}</b>，目标完成率 <b>${pct(ratio(rev(current),current.target),1)}</b>；<b>正向贡献主要来自${judgementGrowthNames}。</b><span>最需要说明：退款金额变化较大，请前厅说明跨周退款及确认口径。</span></p>
          <div class="judgement-meta"><span><i></i>经营结果：${ratio(rev(current),current.target)>=100?'达到目标':'未达目标'}</span><span>增长来源：${growthNames}</span><span>静态经营数据 · ${weeks.length}期</span></div>
        </section>
        <section class="core-kpis">${coreCards}</section>
        <section class="analysis-first">
          <article class="panel compact-analysis revenue-structure"><div class="panel-title"><div><h2>收入结构</h2><p>口径已对齐：退款后净额 + 抖音核销订单实收</p></div><span class="check ${current.ops.reconciled?'':'danger'}">${current.ops.reconciled?'✓ 已对齐':`收入未对账 ${money(Math.abs(current.ops.reconciliationDifference))}`}</span></div><div class="revenue-groups">${revenueGroups.map(group=>`<section class="revenue-group"><h3>${group.label}</h3>${group.items.map(x=>{const comparison=revenueComparison(x),change=Number.isFinite(x.c)&&Number.isFinite(x.p)?x.c-x.p:null;return `<div class="revenue-row"><span>${x.label}</span><div class="revenue-values"><b class="${Number.isFinite(x.c)?'':'missing'}">${revenueValue(x)}</b>${comparison?`<em class="${change>=0?'up':'down'}">${comparison}</em>`:''}</div></div>`}).join("")}</section>`).join("")}</div><div class="revenue-total"><span>退款后净经营营业额</span><b>${money(rev(current))}</b></div><p class="revenue-note">经营营业额按退款后净额统计；抖音收入按有效核销订单实收计入。</p></article>
          <article class="panel compact-analysis"><div class="panel-title"><div><h2>客流会员漏斗</h2><p>有效可转化家庭 = 入园家庭 − 历史会员家庭</p></div><b>${pct(rate(current),2)}</b></div><div class="funnel compact-funnel">${[["入园家庭",current.admission],["历史会员家庭",current.historical],["有效可转化",valid(current)],["办卡家庭",cardCount(current)]].map((x,i)=>`<div><span>${x[0]}</span><b>${x[1]}户</b><i style="width:${100-i*17}%"></i></div>`).join("")}</div><div class="card-mix">${[[299,current.cards.c299],[599,current.cards.c599],[999,current.cards.c999]].map(x=>`<div><span>${x[0]}元</span><b>${x[1]}张</b><small>${pct(ratio(x[1],cardCount(current)),1)}</small></div>`).join("")}<div class="featured"><span>中大卡</span><b>${current.cards.c599+current.cards.c999}张</b><small>${pct(mid(current),2)}</small></div></div></article>
        </section>
        <section class="secondary-kpis" aria-label="次级经营指标">${secondaryCards}</section>
        <section class="panel weekly-trends"><div class="panel-title"><div><h2>${weeks.length>=3?`近${weeks.length}期趋势`:weeks.length===2?'两期对比':'单期数据'}</h2><p>${weeks.length>=3?'趋势用于判断变化是否连续':'不制造不存在的第三期数据'}</p></div></div><div class="trend-grid-lite">${trendItems.map(([label,get,format])=>{const vals=values(get);return `<article class="trend-item"><div><span>${label}</span><b>${format(vals.at(-1))}</b></div>${spark(vals)}<small>${weeks.map((w,i)=>`<span><b>${periodNames[i]}</b><em>${w.label}${w.isPartialWeek?' · 非完整周':''}</em><strong>${format(vals[i])}</strong></span>`).join("")}</small></article>`}).join("")}</div></section>
        <section class="panel changes changes-lite"><div class="panel-title"><div><h2>本周主要变化</h2><p>按收入贡献自动排序；只陈述事实，由主管补充业务原因</p></div></div><div class="change-grid"><div><h3>主要增长贡献</h3>${growth.map((x,i)=>{const display=changeDisplay(x,"growth");return `<div class="change-row"><i>${i+1}</i><span><b>${display.label}</b><small>${display.note}</small></span><strong class="up">${display.amount}</strong></div>`}).join("")}</div><div><h3>下降拖累 TOP3</h3>${drag.length?drag.map((x,i)=>{const display=changeDisplay(x,"drag");return `<div class="change-row"><i>${i+1}</i><span><b>${display.label}</b><small>${display.note}</small></span><strong class="down">${display.amount}</strong></div>`}).join(""):'<p class="empty compact-empty">本周暂无明显收入拖累项。</p>'}</div><div><h3>需要主管解释</h3>${explainItems.map((item,i)=>{const explain=state.explains[item.key]||{status:"待说明",note:""};const done=explain.status==="已说明";return `<div class="explain-row ${done?'explained':''}"><i>${i+1}</i><div><b>${item.title}</b><span>${item.fact}</span><div class="explain-actions"><button class="explain-status ${done?'done':''}" data-explain-status="${item.key}">${done?'已说明':'待说明'}</button><input data-explain-note="${item.key}" value="${escapeAttr(explain.note)}" placeholder="填写一句会议说明（仅本机保存）"></div></div></div>`}).join("")}</div></div></section>
      </main>`;
  }
  function front(){
    const allRows=D.reception.map(x=>({...x,valid:x.reception,rate:x.receptionKnown?ratio(x.enrolled,x.reception):null,mid:ratio(x.c599+x.c999,x.enrolled),avg:x.amountKnown&&x.enrolled>0?x.amount/x.enrolled:null}));
    const namedRows=allRows.filter(x=>!x.aggregate).sort((a,b)=>(Number.isFinite(b[state.rank])?b[state.rank]:-1)-(Number.isFinite(a[state.rank])?a[state.rank]:-1));
    const aggregateRows=allRows.filter(x=>x.aggregate);
    const total=key=>sum(allRows,key), namedTotal=key=>sum(namedRows,key);
    const assignedValid=total("valid"), unassignedValid=valid(current)-assignedValid;
    const storeRate=ratio(cardCount(current),valid(current)), storeMid=ratio(current.cards.c599+current.cards.c999,cardCount(current));
    const assignedRate=ratio(total("enrolled"),assignedValid), coverage=ratio(assignedValid,valid(current));
    const comparable=namedRows.filter(x=>Number.isFinite(x.rate)),highest=(comparable.length?[...comparable].sort((a,b)=>b.rate-a.rate):[...namedRows].sort((a,b)=>b.enrolled-a.enrolled))[0];
    const cards=[[299,current.cards.c299],[599,current.cards.c599],[999,current.cards.c999]].map(([price,count])=>({price,count,amount:price*count,share:ratio(count,cardCount(current))}));
    const renderRow=(x,i,aggregate=false)=>{const rateNotComparable=state.rank==="rate"&&!Number.isFinite(x.rate),rank=aggregate||rateNotComparable?'':'<i class="rank">'+(i+1)+'</i>';return `<tr class="${aggregate?'aggregate-row':''}"><td><b>${rank}${x.name}</b>${!x.receptionKnown?'<small class="aggregate-note">家庭数据覆盖不完整 · 暂不可比</small>':aggregate?'<small class="aggregate-note">汇总项，不参与排名或诊断</small>':''}</td><td>${x.valid||'未统计完整'}</td><td>${x.enrolled}</td><td><strong>${Number.isFinite(x.rate)?pct(x.rate,1):'暂不可比'}</strong></td><td>${x.amountKnown?money(x.amount):`${money(x.amount)}（部分）`}</td><td>${pct(x.mid,1)}</td><td>${Number.isFinite(x.avg)?money(x.avg):'暂不可比'}</td></tr>`};
    return `<section class="meeting-section front-section"><div class="lite-section-head"><div><span>前厅销售</span><h2>门店转化与卡型结构</h2><p>办卡率采用全店有效可转化家庭口径；员工排行仅统计已归属接待。</p></div><b>${pct(storeRate,2)}</b></div>
      <section class="lite-quick-metrics">${[["员工已归属家庭",`${total("reception")}户`,`已归属到员工的有效家庭`],["全店有效可转化家庭",`${valid(current)}户`,`门店办卡率分母`],["办卡家庭",`${cardCount(current)}户`,`全店新办汇总`],["办卡率",pct(storeRate,2),`上周 ${pct(ratio(cardCount(previous),valid(previous)),2)}`],["办卡金额",money(current.revenue.newMember),`部分日期办卡金额未完整统计，金额仅供参考，不参与正式排名。`],["中大卡率",pct(storeMid,2),`${current.cards.c599+current.cards.c999}张`]].map(([label,value,help])=>`<article><span>${label}</span><b>${value}</b><small${label==="办卡金额"?' style="white-space:normal;overflow:visible;text-overflow:clip;line-height:1.35"':''}>${help}</small></article>`).join("")}</section>
      <section class="reception-reconcile"><div><span>全店有效可转化家庭</span><b>${valid(current)}户</b></div><i>−</i><div><span>员工已归属家庭</span><b>${assignedValid}户</b></div><i>=</i><div class="unassigned"><span>未归属家庭</span><b>${unassignedValid}户</b></div><p><strong>归属未完整</strong>：员工排行覆盖 ${pct(coverage,1)} 的全店有效可转化家庭；未归属家庭不参与员工排名和诊断。</p></section>
      <section class="front-brief-grid"><article class="panel light-panel"><div class="panel-title"><div><h2>卡型结构</h2><p>门店总量以运营报表为准</p></div></div><div class="card-type-grid">${cards.map(x=>`<div><span>${x.price}元</span><b>${x.count}张</b><strong>${money(x.amount)}</strong><small>占比 ${pct(x.share,1)}</small></div>`).join("")}</div></article><article class="panel light-panel front-brief"><span>本周前厅需要说明</span><div class="front-insight-list"><p><b>转化变化</b><small>全店办卡率 ${pct(storeRate,2)}，较上期 ${previous&&Number.isFinite(ratio(cardCount(previous),valid(previous)))?`${(storeRate-ratio(cardCount(previous),valid(previous))).toFixed(1)} 个百分点`:'暂不可比'}。</small></p><p><b>中大卡结构</b><small>中大卡率 ${pct(storeMid,2)}，599+999 共 ${current.cards.c599+current.cards.c999} 张。</small></p><p><b>员工覆盖</b><small>${highest?`${highest.name}办卡 ${highest.enrolled} 张；`:''}个人家庭数据覆盖不完整，不建议正式横向比较。</small></p></div></article></section>
      <section class="panel employee-panel"><div class="panel-title"><div><h2>员工排行</h2><p>真实员工参与排名；已归属样本办卡率 ${pct(assignedRate,1)}，仅基于已归属员工的${assignedValid}户计算，不代表全店办卡率；全店办卡率为${pct(storeRate,2)}。</p></div><div class="sorts">${[["rate","办卡率"],["amount","办卡金额"],["mid","中大卡率"]].map(x=>`<button class="${state.rank===x[0]?'active':''}" data-rank="${x[0]}">${x[1]}</button>`).join("")}</div></div><div class="table-wrap"><table><thead><tr><th>员工</th><th>有效销售家庭</th><th>办卡家庭</th><th>办卡率</th><th>办卡金额</th><th>中大卡率</th><th>卡均金额</th></tr></thead><tbody>${namedRows.map((x,i)=>renderRow(x,i)).join("")}<tr class="total"><td>员工已归属合计</td><td>${assignedValid}</td><td>${total("enrolled")}</td><td><strong>已归属样本办卡率 ${pct(assignedRate,1)}</strong></td><td>${money(total("amount"))}</td><td>${pct(ratio(total("c599")+total("c999"),total("enrolled")),1)}</td><td>${money(total("amount")/total("enrolled"))}</td></tr>${aggregateRows.map(x=>renderRow(x,0,true)).join("")}<tr class="unassigned-row"><td>未归属家庭（无员工归属）</td><td>${unassignedValid}</td><td>—</td><td>不参与排名</td><td>—</td><td>—</td><td>—</td></tr></tbody></table></div></section>
    </section>`;
  }
  function douyin(){
    const d=douyinSummary(current),detail=douyinDetails(current),products=detail.products||[],live=detail.live||[];
    const paymentToRedeemDifference=Number.isFinite(d.paidOrders)&&Number.isFinite(d.redeemedVouchers)?d.paidOrders-d.redeemedVouchers:null,arrivalRate=ratio(d.enrolled,d.tracked);
    const contentFacts=[["直播曝光",sum(live,"exposure")],["直播观看",sum(live,"viewers")],["商品曝光",sum(products,"exposure")],["商品点击",sum(products,"visits")],["商品成交",sum(products,"orders")]];
    const fulfillmentFacts=[["支付订单",d.paidOrders,"单"],["本期核销",d.redeemedVouchers,"个"],["近似到店",d.tracked,"户"],["办卡",d.enrolled,"户"]];
    const trend=[ ["GMV",w=>douyinSummary(w).gmv,money], ["核销订单实收",w=>douyinSummary(w).redeemedOrderReceived,money], ["近似到店办卡率",w=>ratio(douyinSummary(w).enrolled,douyinSummary(w).tracked),x=>pct(x,2)] ];
    const storeRate=ratio(cardCount(current),valid(current));
    return `<section class="meeting-section douyin-section"><div class="lite-section-head"><div><span>抖音经营</span><h2>从内容表现到门店办卡</h2><p>只保留周会需要的经营结果与经营链路观察。</p></div><b><small>近似到店办卡率</small>${pct(arrivalRate,2)}</b></div>
      <section class="lite-definition"><span><i></i><b>GMV</b> ${money(d.gmv)} · 直播/商品表现</span><span><i class="redeem"></i><b>支付金额</b> ${money(d.paidAmount)} · 用户实付</span><span><i class="redeem"></i><b>核销订单实收</b> ${money(d.redeemedOrderReceived)} · 经营口径</span><span><i class="settle"></i><b>预计收入</b> ${money(d.expectedIncome)}</span><span><i class="settle"></i><b>平台/第三方费用</b> ${money(d.platformServiceFee)} / ${money(d.thirdPartyServiceFee)}</span><span><i class="settle"></i><b>实际到账</b> ${Number.isFinite(d.actualReceived)?money(d.actualReceived):'暂无结算单数据'}</span></section>
      <section class="lite-quick-metrics dy-metrics">${[["GMV",money(d.gmv),"成交表现，不进入经营营业额"],["核销订单实收",money(d.redeemedOrderReceived),"有效核销明细，计入净经营营业额"],["近似到店",`${d.tracked??'未统计'}户`,`抖音主渠道近似口径`],["到店办卡",`${d.enrolled??'未统计'}户`,"运营报表线上转卡"],["近似到店办卡率",pct(arrivalRate,2),`近似口径 · 全店 ${pct(storeRate,2)}`]].map(([label,value,help])=>`<article><span>${label}</span><b>${value}</b><small>${help}</small></article>`).join("")}</section>
      <p class="attribution-note">当前约95%客源来自抖音，本指标按办卡家庭÷本期抖音到店核销量近似计算，不代表精准渠道归因。</p>
      <section class="panel light-panel funnel-panel"><div class="panel-title"><div><h2>经营链路观察（非同批订单转化漏斗）</h2><p>内容表现与交易履约来自不同数据源、不同周期。</p></div><span class="warn">抖音主渠道近似口径</span></div><div class="chain-observation"><section class="chain-zone"><div><span>A. 内容表现</span><small>用于观察内容与商品表现</small></div><div class="chain-facts">${contentFacts.map(x=>`<article><span>${x[0]}</span><b>${Number.isFinite(x[1])?x[1].toLocaleString():'未统计'}</b></article>`).join("")}</div></section><section class="chain-zone transaction"><div><span>B. 交易履约</span><small>用于观察成交后的履约与到店</small></div><div class="chain-facts">${fulfillmentFacts.map(x=>`<article><span>${x[0]}</span><b>${Number.isFinite(x[1])?`${x[1].toLocaleString()}${x[2]}`:'未统计'}</b></article>`).join("")}</div><p>不同周期事实，仅作经营链路观察，不代表同批订单逐级转化。</p></section></div><div class="redemption-reconcile"><span>本期支付订单 <b>${d.paidOrders??'未统计'}单</b></span><i>本期有效核销券码 <b>${d.redeemedVouchers??'未统计'}个</b></i><strong>同期数量差 <b>${Number.isFinite(paymentToRedeemDifference)?paymentToRedeemDifference:'不可比'}</b></strong></div></section>
      <section class="dy-lower-grid"><article class="panel light-panel"><div class="panel-title"><div><h2>直播 TOP3</h2><p>按GMV排序 · 新版直播数据</p></div></div><div class="compact-list">${[...live].sort((a,b)=>(b.gmv||0)-(a.gmv||0)).slice(0,3).map((x,i)=>`<div><i>${i+1}</i><span><b>${x.date} · ${x.host}</b><small>${Number.isFinite(x.hours)?x.hours.toFixed(1):'未统计'}小时 · ${x.viewers?.toLocaleString()||'未统计'}观看 · ${x.orders??'未统计'}成交券</small></span><strong>${money(x.gmv)}<small>${x.hours?money(x.gmv/x.hours):'不可计算'}/小时</small></strong></div>`).join("")||'<p class="empty">暂无直播数据</p>'}</div></article><article class="panel light-panel"><div class="panel-title"><div><h2>商品 TOP3</h2><p>按GMV排序 · 合计 ${money(sum(products,"gmv"))}</p></div></div><div class="compact-list">${[...products].sort((a,b)=>(b.gmv||0)-(a.gmv||0)).slice(0,3).map((x,i)=>`<div><i>${i+1}</i><span><b>${x.name}</b><small>${x.orders}成交券 · 核销率 ${pct(ratio(x.redeemed,x.orders),1)}</small></span><strong>${money(x.gmv)}<small>到店/转卡暂无商品级归因</small></strong></div>`).join("")||'<p class="empty">暂无商品数据</p>'}</div></article></section>
      <section class="panel light-panel lite-dy-trends"><div class="panel-title"><div><h2>${weeks.length>=3?`近${weeks.length}期趋势`:weeks.length===2?'两期对比':'单期数据'}</h2><p>GMV看成交期；核销订单实收看核销发生期</p></div></div><div class="lite-trend-row">${trend.map(([label,get,format])=>`<article><span>${label}</span><b>${format(get(current))}</b>${spark(weeks.map(get))}<small>${weeks.map((w,i)=>`${i===weeks.length-1?'本期':i===weeks.length-2?'上期':`${weeks.length-i-1}期前`} <em>${w.label}</em> ${format(get(w))}`).join(" · ")}</small></article>`).join("")}</div></section>
      <section class="panel light-panel douyin-explain"><div><span>本期抖音需要说明</span><b>本期成交、核销、到店和办卡来自不同时间事实，仅用于经营趋势观察，不用于计算同批订单严格转化率。</b></div><small>本期售后申请 ${d.refundOrders??'未统计'} 笔，不能等同于本期实际退款。</small></section>
    </section>`;
  }
  function frontDouyin(){return `${header("前厅与抖音","主管周会版：先看门店转化，再看线上是否真实带来到店办卡")}<main class="content weekly-detail-page">${front()}${douyin()}</main>`}
  const common=[{key:"undone",label:"5. 上周未完成事项及原因",limit:3,placeholder:"未完成事项｜原因｜下一步"},{key:"problems",label:"2. 本部门前三项问题",limit:3,placeholder:"问题事实｜影响"}];
  const reportDepartments={
    ops:{id:"ops",name:"现场运营部"},
    front:{id:"front",name:"前厅部",specific:["转化变化原因","销售表现","核销/退款差错","高峰接待","客诉","销售培训"]},
    admin:{id:"admin",name:"综合管理部",specific:["娃娃弹珠","奖品/库存","缺货","补货","损耗","报修","采购需求"]}
  };
  const opsTags=[
    {value:"高空项目",label:"高空项目"},
    {value:"淘气堡游乐",label:"淘气堡/游乐"},
    {value:"VR电玩",label:"VR/电玩"},
    {value:"公共区域",label:"公共区域"},
    {value:"其他",label:"其他现场运营"}
  ];
  function reportValue(dept,key){return state.reports[dept]?.[key]||""}
  function departmentFacts(){const rows=Array.isArray(D.reception)?D.reception:[],assignedFamilies=sum(rows,"reception"),assignedCards=sum(rows,"enrolled"),effectiveFamilies=valid(current),unassignedFamilies=Number.isFinite(effectiveFamilies)?Math.max(0,effectiveFamilies-assignedFamilies):null,storeRate=ratio(cardCount(current),effectiveFamilies),priorRate=ratio(cardCount(previous),valid(previous)),midRate=ratio(current.cards.c599+current.cards.c999,cardCount(current)),d=douyinSummary(current),arrivalRate=ratio(d.enrolled,d.tracked);return {assignedFamilies,assignedCards,effectiveFamilies,unassignedFamilies,storeRate,priorRate,midRate,d,arrivalRate}}
  function departmentMetrics(id){
    const f=departmentFacts(),rateChange=Number.isFinite(f.storeRate)&&Number.isFinite(f.priorRate)?`${f.storeRate>=f.priorRate?"↑":"↓"}${Math.abs(f.storeRate-f.priorRate).toFixed(2)}pp`:"暂不可比";
    if(id==="front")return [["全店办卡率",pct(f.storeRate,2),rateChange],["办卡家庭",String(cardCount(current))+"户","全店有效可转化 "+(Number.isFinite(f.effectiveFamilies)?f.effectiveFamilies:"未统计")+"户"],["会员新办收入",money(current.revenue.newMember),"运营报表权威口径"],["中大卡率",pct(f.midRate,2),"599+999 共 "+(current.cards.c599+current.cards.c999)+" 张"],["员工已归属家庭",String(f.assignedFamilies)+"户","未归属 "+(Number.isFinite(f.unassignedFamilies)?f.unassignedFamilies:"未统计")+" 户 · 办卡 "+f.assignedCards+" 张"],["抖音承接","到店 "+(f.d.tracked??"未统计")+"户","办卡 "+(f.d.enrolled??"未统计")+"户 · "+pct(f.arrivalRate,2)]];
    if(id==="admin"){const secondaryChange=Number.isFinite(current.revenue.secondary)&&Number.isFinite(previous?.revenue?.secondary)?"较上期 "+delta(current.revenue.secondary,previous.revenue.secondary):"较上期暂不可比";return [["二销收入",money(current.revenue.secondary),secondaryChange]]}
    return [];
  }
  function safeValue(value){return String(value||"").replaceAll("&","&amp;").replaceAll('"','&quot;').replaceAll("<","&lt;")}
  function tagOptions(value,placeholder="内部归属（可选）"){return `<option value="">${placeholder}</option>${opsTags.map(tag=>`<option value="${tag.value}" ${value===tag.value?'selected':''}>${tag.label}</option>`).join("")}`}
  function itemInputs(deptId,field){const tagged=deptId==="ops"&&field.key==="problems";return Array.from({length:field.limit},(_,i)=>`<label class="report-item" ${tagged?'style="grid-template-columns:21px 132px minmax(0,1fr)"':''}><i>${i+1}</i>${tagged?`<select name="${field.key}_${i}_tag" style="min-width:0;border:1px solid #d8dee9;border-radius:7px;padding:7px 6px;font-size:12px;color:#475467;background:#fff">${tagOptions(reportValue(deptId,`${field.key}_${i}_tag`))}</select>`:''}<input name="${field.key}_${i}" value="${safeValue(reportValue(deptId,`${field.key}_${i}`))}" placeholder="${field.placeholder}"></label>`).join("")}
  function reportField(deptId,field){return `<section class="report-field"><div><b>${field.label}</b><small>最多 ${field.limit} 项</small></div>${itemInputs(deptId,field)}</section>`}
  function problemInputs(deptId){const tagged=deptId==="ops";return Array.from({length:3},(_,i)=>`<section class="structured-item problem-item ${tagged?'with-tag':''}"><b>${i+1}</b>${tagged?`<label>内部归属（可选）<select name="problems_${i}_tag">${tagOptions(reportValue(deptId,`problems_${i}_tag`),"请选择")}</select></label>`:''}<label>问题事实<input name="problems_${i}" value="${safeValue(reportValue(deptId,`problems_${i}`))}" placeholder="发生了什么"></label><label>影响<input name="problems_${i}_impact" value="${safeValue(reportValue(deptId,`problems_${i}_impact`))}" placeholder="造成什么经营、现场或协同影响"></label></section>`).join("")}
  function undoneInputs(deptId){return Array.from({length:3},(_,i)=>`<section class="structured-item undone-item"><b>${i+1}</b><label>未完成事项<input name="undone_${i}" value="${safeValue(reportValue(deptId,`undone_${i}`))}" placeholder="哪件事没有完成"></label><label>原因<input name="undone_${i}_reason" value="${safeValue(reportValue(deptId,`undone_${i}_reason`))}" placeholder="为什么没有完成"></label><label>下一步<input name="undone_${i}_next" value="${safeValue(reportValue(deptId,`undone_${i}_next`))}" placeholder="准备如何继续"></label></section>`).join("")}
  function coreReportModule(id,title,description,content){return `<section class="panel form-section core-report-module" data-report-module="${id}"><div class="panel-title"><div><h2>${title}</h2><p>${description}</p></div></div>${content}</section>`}
  function keyResults(id){const f=departmentFacts(),metrics=departmentMetrics(id);if(id==="front")return `办卡率${pct(f.storeRate,2)}，较上期${Number.isFinite(f.storeRate)&&Number.isFinite(f.priorRate)?`${f.storeRate>=f.priorRate?'提升':'下降'}${Math.abs(f.storeRate-f.priorRate).toFixed(2)}个百分点`:'暂不可比'}；会员新办收入${money(current.revenue.newMember)}；中大卡率${pct(f.midRate,2)}；本期近似到店${f.d.tracked??'未统计'}户，办卡${f.d.enrolled??'未统计'}户。`;if(id==="admin")return `二销收入${money(current.revenue.secondary)}，较上期${Number.isFinite(current.revenue.secondary)&&Number.isFinite(previous?.revenue?.secondary)?delta(current.revenue.secondary,previous.revenue.secondary):'暂不可比'}。`;return metrics.length?metrics.slice(0,3).map(x=>`${x[0]} ${x[1]}（${x[2]}）`).join("；"):"暂无可自动带入的现场运营数据"}
  function focusInputs(deptId){return Array.from({length:3},(_,i)=>`<section class="structured-item"><b>${i+1}</b><label>事项${deptId==="ops"?`<select name="focus_${i}_tag" style="border:1px solid #d8dee9;border-radius:6px;padding:6px;font-size:11px;color:#475467;background:#fff">${tagOptions(reportValue(deptId,`focus_${i}_tag`))}</select>`:''}<input name="focus_${i}_title" value="${safeValue(reportValue(deptId,`focus_${i}_title`))}" placeholder="本周要完成什么"></label><label>负责人<input name="focus_${i}_owner" value="${safeValue(reportValue(deptId,`focus_${i}_owner`))}" placeholder="姓名"></label><label>完成期限<input name="focus_${i}_due" value="${safeValue(reportValue(deptId,`focus_${i}_due`))}" placeholder="例如：周五 18:00"></label><label>验收标准<input name="focus_${i}_criteria" value="${safeValue(reportValue(deptId,`focus_${i}_criteria`))}" placeholder="完成到什么程度"></label></section>`).join("")}
  function supportInputs(deptId){return Array.from({length:3},(_,i)=>`<section class="structured-item support-item"><b>${i+1}</b><label>支持对象<input name="support_${i}_target" value="${safeValue(reportValue(deptId,`support_${i}_target`))}" placeholder="部门 / 店长"></label><label>事项<input name="support_${i}_title" value="${safeValue(reportValue(deptId,`support_${i}_title`))}" placeholder="需要协调什么"></label><label>期望结果<input name="support_${i}_result" value="${safeValue(reportValue(deptId,`support_${i}_result`))}" placeholder="希望达成什么"></label><label>最晚需要时间<input name="support_${i}_due" value="${safeValue(reportValue(deptId,`support_${i}_due`))}" placeholder="例如：周四中午前"></label></section>`).join("")}
  function operationsReviewCount(deptId){const existing=Array.from({length:5},(_,i)=>["tag","fact","impact","plan"].some(field=>Boolean(reportValue(deptId,`review_${i}_${field}`)))).lastIndexOf(true)+1;return Math.min(5,Math.max(existing,state.reviewRows[deptId]||0))}
  function operationsReviewInputs(deptId,count){return Array.from({length:count},(_,i)=>`<section class="structured-item"><b>${i+1}</b><label>内部归属<select name="review_${i}_tag" style="border:1px solid #d8dee9;border-radius:6px;padding:7px;font-size:12px;color:#475467;background:#fff">${tagOptions(reportValue(deptId,`review_${i}_tag`),"请选择内部归属")}</select></label><label>发生了什么<input name="review_${i}_fact" value="${safeValue(reportValue(deptId,`review_${i}_fact`))}" placeholder="异常、重点变化或需复盘事项"></label><label>造成什么影响<input name="review_${i}_impact" value="${safeValue(reportValue(deptId,`review_${i}_impact`))}" placeholder="对安全、开放或体验的影响"></label><label>本周处理计划<input name="review_${i}_plan" value="${safeValue(reportValue(deptId,`review_${i}_plan`))}" placeholder="本周怎么处理或验证"></label></section>`).join("")}
  function operationsReviewBlock(deptId){const count=operationsReviewCount(deptId);return `<section class="panel form-section"><div class="panel-title"><div><h2>现场专项复盘</h2><p>仅在本周有异常、重点变化或需要复盘时填写；最多 5 条。</p></div>${count<5?'<button type="button" class="ghost compact-action" data-add-review>＋ 新增专项</button>':''}</div>${count?operationsReviewInputs(deptId,count):'<p class="empty" style="margin:0">本周暂无需专项复盘的现场事项。</p>'}</section>`}
  function specificInputs(deptId,groupId,label,i){const value=(field)=>reportValue(deptId,`specific_${groupId}_${i}_${field}`)||reportValue(deptId,`specific_${i}_${field}`);return `<section class="specific-item"><b>${label}</b><label>当前情况<textarea name="specific_${groupId}_${i}_current" rows="2" placeholder="当前发生了什么">${value("current")}</textarea></label><label>影响<textarea name="specific_${groupId}_${i}_impact" rows="2" placeholder="对经营、现场或人员的影响">${value("impact")}</textarea></label><label>本周计划<textarea name="specific_${groupId}_${i}_plan" rows="2" placeholder="本周如何处理或验证">${value("plan")}</textarea></label></section>`}
  function specificGroupBlocks(dept){const groups=dept.groups||[{id:dept.id,name:`${dept.name}专属区`,specific:dept.specific}];return groups.map(group=>`<section class="panel form-section"><div class="panel-title"><div><h2>${group.name}</h2><p>按当前情况、影响、本周计划填写；每项可留空。</p></div></div><div class="specific-item-grid">${group.specific.map((label,i)=>specificInputs(dept.id,group.id,label,i)).join("")}</div></section>`).join("")}
  function reportTime(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.toLocaleString("zh-CN",{hour12:false}):value||"尚未保存"}
  function meetingReportStatus(status){return status==="草稿"?"草稿 / 未确认":status||"未填写"}
  function reports(){
    if(isClosureDepartment(state.dept))return closureReports();
    if(state.dept==='front')return frontReports();
    const dept=reportDepartments[state.dept],report=state.reports[state.dept]||{},status=report.status||"未填写",confirmed=status==="已确认",metrics=departmentMetrics(state.dept),problem=common.find(x=>x.key==="problems"),undone=common.find(x=>x.key==="undone");
    const metricNotes=state.dept==="front"?`<p style="margin:10px 0 0;color:#667085;font-size:12px;line-height:1.55">员工个人转化率数据覆盖不完整，不做正式横向比较。当前为抖音主渠道近似口径，不代表精准渠道归因。</p>`:state.dept==="admin"?`<p style="margin:10px 0 0;color:#667085;font-size:12px;line-height:1.55">娃娃/弹珠、袜子/零售、缺货、补货、报修和采购需求暂无可靠自动数据。</p>`:"";
    const metricBlock=metrics.length?`<section class="department-metrics"><div class="department-metrics-title"><div><span>自动数据摘要</span><b>仅展示已有部门专属事实，无需重复抄写</b></div><small>主管只需解释变化</small></div><div class="department-metric-grid">${metrics.map(x=>`<article><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></article>`).join("")}</div>${metricNotes}</section>`:'<p class="department-empty-metrics" style="margin:0 0 14px"><b>本周暂无可自动归属的现场运营数据，请主管填写关键结果、问题与本周动作。</b></p>';
    const keyResult=coreReportModule("key-result","1. 上周关键结果","建议填写1—3条最重要结果或变化，不写流水账；优先写结果、数据变化和结论。",`<div class="key-result-summary"><span>自动摘要</span><b>${keyResults(state.dept)}</b></div><label class="key-result-main"><span>主管填写</span><textarea name="result_explanation" rows="4" placeholder="建议填写1—3条最重要结果或变化，不写流水账；优先写结果、数据变化和结论。">${safeValue(reportValue(state.dept,'result_explanation'))}</textarea></label>`);
    const problems=coreReportModule("problems","2. 本部门前三项问题","最多 3 项；只填写真实问题及其影响。",problemInputs(state.dept));
    const supports=coreReportModule("support","3. 需要跨部门 / 店长支持","最多 3 项；明确支持对象、需要什么、期望结果和最晚需要时间。",supportInputs(state.dept));
    const focuses=coreReportModule("focus","4. 本周重点工作","最多 3 项；每项明确事项、负责人、完成期限和验收标准。",focusInputs(state.dept));
    const undoneBlock=coreReportModule("undone","5. 上周未完成事项及原因","最多 3 项；明确未完成事项、原因和下一步。",`<div class="panel-actions"><button type="button" class="ghost compact-action" data-copy-undone>复制未完成事项到本周重点</button></div>${undoneInputs(state.dept)}`);
    const advice=coreReportModule("advice","6. 主管建议（可选）","只填写需要店长关注的一条建议。",`<label class="advice-field"><textarea name="advice" rows="3" placeholder="向店长提出一个清晰、可执行的建议">${safeValue(reportValue(state.dept,'advice'))}</textarea></label>`);
    return `${header("部门周报","自动带入已有事实，主管只填写结果、问题、支持与本周动作")}<main class="content report-page"><div class="dept-tabs" style="grid-template-columns:repeat(3,1fr)">${Object.entries(reportDepartments).map(([id,x])=>`<button class="${state.dept===id?'active':''}" data-dept="${id}"><span>${x.name}</span><small>${state.reports[id]?.status||'未填写'}</small></button>`).join("")}</div><section class="report-head"><div><span>当前填写</span><h2>${dept.name} · ${current.label}周报</h2><p style="display:flex;flex-wrap:wrap;gap:6px 16px"><span>主管：${safeValue(report.editorName||state.cloud.session?.name||'未填写')}</span><span>保存方式：Supabase共享保存（离线时使用本机缓存）</span></p><small class="report-flow">填写流程：进入编辑模式 → 填写周报 → 自动保存 / 保存草稿 → 填写完成后标记已确认。</small></div><div><span class="report-status ${status==='已确认'?'confirmed':status==='草稿'?'draft':''}">${status}</span>${confirmed&&report.confirmedBy?`<small>确认人：${safeValue(report.confirmedBy)} · ${reportTime(report.confirmedAt)}</small>`:''}</div></section>${metricBlock}<form class="report-form" data-report-form><fieldset class="report-edit-fields" ${confirmed?'disabled':''}>${keyResult}${problems}${supports}${focuses}${undoneBlock}${advice}${state.dept==="ops"?operationsReviewBlock(state.dept):specificGroupBlocks(dept)}</fieldset><div class="sticky-actions"><span>最近保存：${reportTime(report.updatedAt||report.savedAt)}</span>${confirmed?'<button type="button" class="ghost" data-reopen-report>重新编辑</button>':'<button type="button" class="ghost" data-save-draft>保存草稿</button><button type="button" class="primary" data-confirm-report>标记已确认</button>'}</div></form></main>`
  }
  function reportItems(deptId,key){return [0,1,2].map(i=>reportValue(deptId,`${key}_${i}`)).filter(Boolean)}
  function meetingRows(){return Object.entries(reportDepartments).map(([id,dept])=>{const report=state.reports[id]||{};if(isClosureDepartment(id)&&report.closure_template===1)return {id,dept,report,...window.ReportItems.summary(report,id)};if(id==='front'&&report.front_template===1)return {id,dept,report,...window.FrontReport.summary(report,id)};return {id,dept,report,key:keyResults(id),problems:reportItems(id,"problems"),undone:reportItems(id,"undone"),focus:[0,1,2].map(i=>({id:`${id}-${i}`,title:reportValue(id,`focus_${i}_title`),owner:reportValue(id,`focus_${i}_owner`),due:reportValue(id,`focus_${i}_due`),criteria:reportValue(id,`focus_${i}_criteria`)})).filter(x=>x.title),support:[0,1,2].map(i=>({id:`${id}-support-${i}`,target:reportValue(id,`support_${i}_target`),title:reportValue(id,`support_${i}_title`),result:reportValue(id,`support_${i}_result`),due:reportValue(id,`support_${i}_due`)})).filter(x=>x.title)}})}
  function meetingV2(){
    const d=douyinSummary(current),mode=state.meetingMode,rate=ratio(cardCount(current),valid(current)),priorRate=ratio(cardCount(previous),valid(previous));
    const lines=[["门票",current.revenue.ticket-previous.revenue.ticket],["会员新办",current.revenue.newMember-previous.revenue.newMember],["会员续卡",current.revenue.renewal-previous.revenue.renewal],["线上核销",current.revenue.online-previous.revenue.online],["二销",current.revenue.secondary-previous.revenue.secondary],["其他",current.revenue.other-previous.revenue.other],["退款",current.revenue.refund-previous.revenue.refund]];
    const gains=lines.filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,3),losses=lines.filter(x=>x[1]<0).sort((a,b)=>a[1]-b[1]).slice(0,3),rows=meetingRows();
    const attributedValidFamilies=D.reception.reduce((total,row)=>total+row.reception-row.historical,0);
    const unassignedValidFamilies=Math.max(0,valid(current)-attributedValidFamilies);
    const sourceActions=rows.filter(x=>x.report.status==="已确认").flatMap(x=>x.focus.map(y=>({...y,department:x.dept.name,sourceId:y.id})));
    const overrides=Object.fromEntries((state.meeting.actions||[]).filter(x=>x.sourceId).map(x=>[x.sourceId,x]));
    const actions=[...sourceActions.map(x=>({...x,...(overrides[x.sourceId]||{})})).filter(x=>!x.deleted),...(state.meeting.actions||[]).filter(x=>!x.sourceId&&!x.deleted)].slice(0,mode==="boss"?5:99);
    const supports=rows.flatMap(x=>x.support.map(y=>({...y,department:x.dept.name}))),reportProblems=rows.filter(x=>x.report.status==="已确认").flatMap(x=>x.problems.map(text=>({text,department:x.dept.name})));
    const core=[["退款后净营业额",money(rev(current)),`较上周 ${delta(rev(current),rev(previous))}`],["目标完成率",pct(ratio(rev(current),current.target),1),`周目标 ${money(current.target)}`],["入园家庭",`${current.admission}户`, `较上周 ${delta(current.admission,previous.admission)}`],["办卡率",pct(rate,2),`较上周 ${(rate-priorRate)>=0?"↑":"↓"}${Math.abs(rate-priorRate).toFixed(1)}pp`],["抖音核销订单实收",money(d.redeemedOrderReceived),`到店 ${d.tracked}户`],["人效",money(rev(current)/current.staff),`出勤 ${current.staff}人`]];
    const oneLine=mode==="supervisor"
      ? `本期退款后净营业额 ${money(rev(current))}，较上期 ${delta(rev(current),rev(previous))}，目标完成率 ${pct(ratio(rev(current),current.target),1)}。正向贡献主要来自退款减少和会员新办增长。${current.ops.incomeStatus}，抖音成交与核销按各自发生期独立统计。`
      : `本期退款后净营业额 ${money(rev(current))}，较上期 ${delta(rev(current),rev(previous))}，目标完成率 ${pct(ratio(rev(current),current.target),1)}。${gains.length?`正向变化主要来自 ${gains.slice(0,2).map(x=>x[0]).join("和")}`:'暂无明显正向收入项'}；${current.ops.incomeStatus}，抖音成交与核销按各自发生期独立统计。`;
    const actionEditor=state.meetingEditor?`<form class="meeting-editor" data-meeting-action-form><b>${state.meetingEditor.sourceId?'调整重点工作':'店长补充重点工作'}</b><input type="hidden" name="id" value="${safeValue(state.meetingEditor.id||"")}"><input type="hidden" name="sourceId" value="${safeValue(state.meetingEditor.sourceId||"")}"><label>事项<input name="title" required value="${safeValue(state.meetingEditor.title)}"></label><label>负责人<input name="owner" value="${safeValue(state.meetingEditor.owner)}"></label><label>完成期限<input name="due" value="${safeValue(state.meetingEditor.due)}"></label><label>验收标准<input name="criteria" value="${safeValue(state.meetingEditor.criteria)}"></label><div><button class="primary">保存</button><button type="button" class="ghost" data-cancel-action>取消</button></div></form>`:`<button class="ghost supervisor-only" data-add-action>＋ 店长补充重点工作</button>`;
    const actionTable=actions.length?`<div class="action-table"><div class="action-table-head"><span>部门</span><span>事项</span><span>负责人</span><span>期限</span><span>验收标准</span><span class="supervisor-only">处理</span></div>${actions.map(x=>`<div><span>${x.department||'店长补充'}</span><b>${x.title}</b><span>${x.owner||'待填写'}</span><span>${x.due||'待填写'}</span><span>${x.criteria||'待填写'}</span><span class="action-controls supervisor-only"><button data-action-retain="${x.sourceId||x.id}">${x.retained?'已保留':'保留'}</button><button data-action-edit="${x.sourceId||x.id}">调整</button><button data-action-delete="${x.sourceId||x.id}">删除</button></span></div>`).join("")}</div>`:'<p class="empty meeting-empty">暂无已确认周报带入的重点工作，可由店长补充。</p>';
    const decisions=(state.meeting.decisions||[]),decisionCards=decisions.length?`<div class="decision-list">${decisions.map(x=>`<article><span>${x.department||'店长升级'}</span><b>${x.title}</b><p><strong>背景：</strong>${x.background}</p><p><strong>店长建议：</strong>${x.suggestion}</p><p><strong>资源/预算：</strong>${x.resource||'待补充'} · <strong>最晚决策：</strong>${x.due||'待补充'}</p></article>`).join("")}</div>`:'<p class="empty meeting-empty">暂无已升级的老板决策事项。</p>';
    const departmentCard=(x,showSource=true)=>`<article class="dept-meeting-card"><div><b>${x.dept.name}</b><span class="report-status ${x.report.status==='已确认'?'confirmed':x.report.status==='草稿'?'draft':''}">${meetingReportStatus(x.report.status)}</span>${showSource?`<button data-open-report="${x.id}">展开原周报</button>`:''}</div><p><small>关键结果</small>${x.key}</p><p><small>主要问题</small>${x.problems.join("；")||'未填写'}</p><p><small>未完成事项</small>${x.undone.join("；")||'无'}</p><p><small>本周重点</small>${x.focus.map(v=>v.title).join("；")||'未填写'}</p><p><small>需要支持</small>${x.support.map(v=>v.title).join("；")||'无'}</p></article>`;
    const deptCards=rows.map(x=>departmentCard(x)).join(""),confirmedRows=rows.filter(x=>x.report.status==="已确认"),unconfirmedRows=rows.filter(x=>x.report.status!=="已确认");
    const departmentSection=mode==="boss"
      ? `<section class="panel boss-department-status"><div class="panel-title"><div><h2>部门周报状态</h2><p>已确认部门周报：${confirmedRows.length}/3</p></div></div>${unconfirmedRows.length?`<div class="boss-department-pending">${unconfirmedRows.map(x=>`<span>${x.dept.name}：${meetingReportStatus(x.report.status)}</span>`).join("")}</div>`:''}${confirmedRows.length?`<div class="department-meeting-grid">${confirmedRows.map(x=>departmentCard(x,false)).join("")}</div>`:''}</section>`
      : `<section><div class="meeting-section-title"><span>5—7</span><h2>三部门关键结果、问题与未完成事项</h2><p>只显示周会摘要；可点击查看原部门周报。</p></div><div class="department-meeting-grid">${deptCards}</div></section>`;
    const previousDouyin=douyinSummary(previous),bossScores=[current.revenue.newMember>previous.revenue.newMember?`会员新办收入 ${money(current.revenue.newMember)}，较上期增加 ${money(current.revenue.newMember-previous.revenue.newMember)}。`:null,d.gmv>previousDouyin.gmv?`抖音GMV ${money(d.gmv)}，较上期增加 ${money(d.gmv-previousDouyin.gmv)}；GMV仅代表成交表现。`:null,rate>priorRate?`办卡率 ${pct(rate,2)}，较上期提升 ${Math.abs(rate-priorRate).toFixed(1)}pp。`:null].filter(Boolean);
    const bossRisks=[ratio(rev(current),current.target)<100?`净经营营业额完成目标 ${pct(ratio(rev(current),current.target),1)}，距目标还差 ${money(current.target-rev(current))}。`:null,current.admission<previous.admission?`入园家庭较上期减少 ${previous.admission-current.admission} 户（${delta(current.admission,previous.admission)}）。`:null,d.redeemedOrderReceived<previousDouyin.redeemedOrderReceived?`本期核销订单实收较上期减少 ${money(previousDouyin.redeemedOrderReceived-d.redeemedOrderReceived)}；成交期与核销期口径独立。`:null,...reportProblems.slice(0,1).map(x=>`${x.department}：${x.text}`)].filter(Boolean);
    return `${header("周会与老板汇报",mode==='boss'?'老板汇报：结果 → 原因 → 风险 → 动作 → 待决策':'主管会：经营结果、部门复盘、协调、动作和店长决策')}<main class="content meeting-page ${mode==='boss'?'boss-mode':''}"><section class="meeting-top"><div><span>${current.label} · ${current.range}</span><h2>超级泡泡周经营复盘</h2><p>经营数字仅来自统一周数据快照；部门内容保留填写状态。</p></div><div class="meeting-switch"><button class="${mode==='supervisor'?'active':''}" data-meeting-mode="supervisor">主管会模式</button><button class="${mode==='boss'?'active':''}" data-meeting-mode="boss">老板汇报模式</button><button data-presentation>投屏模式</button><button data-print>打印 / PDF</button></div></section><section class="meeting-headline"><span>${mode==='boss'?'店长一句话判断':'1. 本周经营结果'}</span><p>${oneLine}</p></section><section class="meeting-core-grid">${core.map(x=>`<article><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></article>`).join("")}</section><section class="meeting-split"><article class="panel"><div class="panel-title"><div><h2>${mode==='boss'?'收入变化原因':'2. 较上周主要变化'}</h2><p>互斥收入分类自动汇总。</p></div></div><div class="meeting-change-list"><div><b>增长贡献</b>${gains.map((x,i)=>`<p><i>${i+1}</i><span>${mode==='boss'&&x[0]==='退款'?'退款减少':x[0]}</span><strong class="up">${mode==='boss'&&x[0]==='退款'?`+${money(x[1])}净收入贡献`:`+${money(x[1])}`}</strong></p>`).join("")}</div><div><b>下降拖累</b>${losses.length?losses.map((x,i)=>`<p><i>${i+1}</i><span>${x[0]}</span><strong class="down">-${money(Math.abs(x[1]))}</strong></p>`).join(""):'<p class="empty">暂无明显收入拖累项</p>'}</div></div></article><article class="panel"><div class="panel-title"><div><h2>${mode==='boss'?'客流、会员与抖音':'3—4. 前厅销售与抖音经营'}</h2><p>前厅看转化；抖音看核销和到店。</p></div></div><div class="meeting-facts"><p><b>客流会员</b><span>入园 ${current.admission} 户，有效可转化 ${valid(current)} 户，办卡 ${cardCount(current)} 户，办卡率 ${pct(rate,2)}。</span></p><p><b>前厅销售</b><span>会员收入 ${money(current.revenue.newMember+current.revenue.renewal)}，中大卡率 ${pct(ratio(current.cards.c599+current.cards.c999,cardCount(current)),2)}。</span></p><p><b>抖音经营</b><span>${mode==='supervisor'?`GMV ${money(d.gmv)}，核销订单实收 ${money(d.redeemedOrderReceived)}，近似到店 ${d.tracked}，近似到店办卡率 ${pct(ratio(d.enrolled,d.tracked),2)}；当前为抖音主渠道近似口径。`:`GMV ${money(d.gmv)}，核销订单实收 ${money(d.redeemedOrderReceived)}，近似到店 ${d.tracked}，近似到店办卡率 ${pct(ratio(d.enrolled,d.tracked),2)}；当前为抖音主渠道近似口径，不代表精准渠道归因。`}</span></p></div></article></section>${departmentSection}<section class="panel supervisor-only support-source"><div class="panel-title"><div><h2>8. 跨部门 / 店长支持事项</h2><p>可由店长升级为老板决策。</p></div></div>${supports.length?`<div class="support-list">${supports.map(x=>`<article><span>${x.department} → ${x.target||'待指定'}</span><b>${x.title}</b><p>期望结果：${x.result||'待填写'} · 最晚需要：${x.due||'待填写'}</p><button data-upgrade-decision="${x.id}">升级为老板决策</button></article>`).join("")}</div>`:'<p class="empty meeting-empty">暂无跨部门 / 店长支持事项。</p>'}</section><section class="panel action-summary"><div class="panel-title"><div><h2>${mode==='boss'?'下周5个重点动作':'9. 本周重点工作'}</h2><p>${mode==='boss'?'仅取已确认部门重点工作与店长补充。':'可保留、调整、删除或补充；不生成任务。'}</p></div>${mode==='supervisor'&&!state.meetingEditor?actionEditor:""}</div>${mode==='supervisor'&&state.meetingEditor?actionEditor:""}${actionTable}</section><section class="panel support-summary"><div class="panel-title"><div><h2>${mode==='boss'?'需要老板支持 / 决策':'10. 需要店长决定的事项'}</h2><p>仅来自部门支持事项的升级或店长补充。</p></div></div>${decisionCards}</section>${mode==='boss'?`<section class="boss-insights"><article><h2>本周3个主要成绩</h2>${bossScores.length?bossScores.map((x,i)=>`<p><i>${i+1}</i>${x}</p>`).join(""):'<p class="empty">暂无达到显著改善阈值的成绩项。</p>'}</article><article><h2>本周3个主要问题</h2>${bossRisks.length?bossRisks.slice(0,3).map((x,i)=>`<p><i>${i+1}</i>${x}</p>`).join(""):'<p class="empty">暂无明确经营或管理问题。</p>'}</article></section>`:""}</main>`
  }
  function modal(){
    if(!state.modal)return"";
    if(state.modal==='auth')return `<div class="modal-backdrop"><section class="modal auth-modal"><div class="modal-head"><div><span>共享周报填写</span><h2>进入编辑模式</h2></div><button data-close>×</button></div><div class="editor-guide"><b>首次填写请注意</b><span>先进入编辑模式；填写固定真实姓名，后续保持同一写法；只填写自己负责的部门；未完成先保存草稿，完成后再标记已确认。</span></div><form data-auth-form><label>编辑范围<select name="role"><option value="editor" ${state.authIntent==='manager'?'':'selected'}>部门周报编辑</option><option value="manager" ${state.authIntent==='manager'?'selected':''}>店长周会编辑</option></select></label><label>填写人<input name="name" autocomplete="name" required placeholder="例如：前厅主管" value="${safeValue(savedEditorName())}"></label><p>姓名只保存在当前浏览器，用于显示最近填写人；如首次填写有误，重新进入编辑模式后可修改。</p><div class="modal-foot"><button type="button" data-close>取消</button><button class="primary">进入编辑模式</button></div></form></section></div>`;
    if(state.modal==='editor-guide')return `<div class="modal-backdrop"><section class="modal auth-modal"><div class="modal-head"><div><span>部门周报</span><h2>使用说明</h2></div><button data-close>×</button></div><div class="editor-guide"><b>填写流程</b><span>进入编辑模式 → 填写固定真实姓名 → 只填写自己负责的部门 → 未完成点保存草稿 → 完成后点标记已确认。</span><small>请持续使用同一姓名写法，便于周会识别填写人。</small></div><div class="modal-foot"><button class="primary" data-close>知道了</button></div></section></div>`;
    return "";
  }
  function emptyData(){return `${header(state.page==='overview'?'周经营总览':state.page==='frontDouyin'?'前厅与抖音':state.page==='reports'?'部门周报':'周会与老板汇报','本周经营数据尚未发布')}<main class="content"><section class="panel real-data-empty"><span>等待周版本</span><h2>本周经营数据尚未写入网页</h2><p>请由店长把本周Excel交给Codex生成新的静态数据包并发布。门店员工无需自行导入Excel。</p></section></main>`}
  function validateReportDOM(){if(state.page!=="reports"||!current)return;const closure=isClosureDepartment(state.dept),front=state.dept==='front',expected=closure?Object.fromEntries(window.ReportItems.sections.map(s=>[s.key,0])):front?Object.fromEntries([['overview',0],['analysis',5],['sales',0],...window.FrontReport.sections.map(s=>[s.key,0])]):{"key-result":1,problems:6,support:12,focus:12,undone:9};const result={};for(const [id,minFields] of Object.entries(expected)){const selector=closure?`[data-closure-module="${id}"]`:`[data-${front?'front':'report'}-module="${id}"]`,module=document.querySelector(selector),fields=module?module.querySelectorAll("input, textarea, select").length:0;result[id]={exists:Boolean(module),fields,fillable:fields>=minFields}}const ok=Object.values(result).every(x=>x.exists&&x.fillable);document.documentElement.dataset.reportDomReady=ok?"true":"false";window.__liteReportDomCheck={ok,result};if(!ok)console.error("部门周报核心模块渲染不完整",result)}
  function render(){let body=!current?emptyData():state.page==='overview'?overview():state.page==='frontDouyin'?frontDouyin():state.page==='reports'?reports():meetingV2();app.innerHTML=`<div class="shell ${state.presentation?'presentation':''}">${sidebar()}<div class="workspace">${body}</div></div>${modal()}${state.toast?`<div class="toast">${state.toast}</div>`:''}`;bind();validateReportDOM()}
  function reportDraft(status="草稿"){
    const form=document.querySelector('[data-report-form]');if(!form||!current)return null;
    const existing=state.reports[state.dept]||{};let record={...existing,departmentId:state.dept,weekId:current.id,status,editorName:state.cloud.session?.name||existing.editorName||"未填写"};
    for(const [key,value] of new FormData(form).entries())record[key]=value;
    if(isClosureDepartment(state.dept))record=window.ReportItems.read(form,record);
    if(state.dept==='front')record=window.FrontReport.read(form,record);
    if(status!=="已确认"){record.confirmedBy="";record.confirmedAt=""}
    return record;
  }
  async function saveReport(status,{silent=false,record:providedRecord=null}={}){
    if(!state.cloud.session){if(!silent){state.authIntent="edit";state.modal="auth";render()}return}
    const record=providedRecord||reportDraft(status);if(!record)return;
    const department=record.departmentId||state.dept;
    if(status==='已确认'){record.confirmedBy=state.cloud.session.name;record.confirmedAt=new Date().toISOString()}
    state.reports[department]=record;window.CloudSync.cacheReport(department,record);state.cloud.status="saving";
    if(!silent)render();
    try{const result=await (reportSaveQueue=reportSaveQueue.catch(()=>{}).then(()=>window.CloudSync.saveReport(department,record)));if(state.reports[department]===record)state.reports[department]=result.report;state.cloud.status="synced";state.cloud.lastUpdated=result.report.updatedAt;if(!silent)flash(status==='已确认'?`${reportDepartments[department].name}周报已确认并同步`:'草稿已保存')}
    catch(error){state.cloud.status="offline";if(!silent)flash(`${error.message||"周报云端保存失败"}，本机缓存已保留`)}
  }
  async function reopenReport(){if(!state.cloud.session){state.authIntent="edit";state.modal="auth";render();return}const department=state.dept,existing=state.reports[department]||{};if(existing.status!=="已确认")return;try{await window.CloudSync.archiveConfirmed(department,{...existing,weekId:current.id})}catch(error){flash('历史确认版本尚未保存，请联网后再重新编辑');return}const record={...existing,departmentId:department,weekId:current.id,status:"草稿",confirmedBy:"",confirmedAt:""};state.reports[department]=record;render();await saveReport("草稿",{record});flash('已转为草稿，可继续修改')}
  function bindClosureReport(){
    if(state.page!=='reports'||!isClosureDepartment(state.dept)||!state.cloud.session||state.reports[state.dept]?.status==='已确认')return;
    const form=document.querySelector('[data-report-form]');if(!form)return;
    const change=fn=>{
      clearTimeout(reportAutosaveTimer);
      const next=reportDraft('草稿');if(!next)return;
      fn(next);state.reports[state.dept]=next;
      window.CloudSync.cacheReport(state.dept,next);render();saveReport('草稿',{silent:true});
    };
    form.querySelectorAll('[data-add-closure]').forEach(button=>button.onclick=()=>change(report=>{report[`closure_${button.dataset.addClosure}`].push(window.ReportItems.blank())}));
    form.querySelector('[data-carry-followups]')?.addEventListener('click',()=>change(report=>Object.assign(report,window.ReportItems.carryFollowups(report))));
    form.querySelectorAll('[data-delete-row]').forEach(button=>button.onclick=()=>{
      const el=button.closest('[data-closure-row]'),key=`closure_${el.dataset.section}`,id=el.dataset.closureRow;
      const row=window.ReportItems.read(form,state.reports[state.dept])[key].find(x=>x.id===id);
      if(window.ReportItems.filled(row)&&!window.confirm('确认删除本行？已确认的历史版本不受影响。'))return;
      change(report=>{if(row.source){report.closure_dismissed_sources=[...(report.closure_dismissed_sources||[]),row.source]}report[key]=report[key].filter(x=>x.id!==id)});
    });
    const move=(id,target)=>change(report=>{const rows=report.closure_plans,from=rows.findIndex(x=>x.id===id);if(from<0||target<0||target>=rows.length)return;rows.splice(target,0,rows.splice(from,1)[0])});
    form.querySelectorAll('[data-move-row]').forEach(button=>button.onclick=()=>{const id=button.closest('[data-closure-row]').dataset.closureRow;move(id,state.reports[state.dept].closure_plans.findIndex(x=>x.id===id)+Number(button.dataset.moveRow))});
    form.querySelectorAll('.closure-drag').forEach(handle=>{handle.ondragstart=event=>{closureDragId=handle.closest('[data-closure-row]').dataset.closureRow;event.dataTransfer.setData('text/plain',closureDragId);event.dataTransfer.effectAllowed='move'};handle.ondragend=()=>{closureDragId=null}});
    form.querySelectorAll('[data-section="plans"]').forEach(el=>{el.ondragover=event=>{if(closureDragId){event.preventDefault();event.dataTransfer.dropEffect='move'}};el.ondrop=event=>{event.preventDefault();if(!closureDragId)return;const id=closureDragId;closureDragId=null;move(id,state.reports[state.dept].closure_plans.findIndex(x=>x.id===el.dataset.closureRow))}});
    form.addEventListener('input',event=>{
      const el=event.target.closest('[data-closure-row]');if(!el)return;
      const row=window.ReportItems.read(form,state.reports[state.dept])[`closure_${el.dataset.section}`].find(x=>x.id===el.dataset.closureRow),t=window.ReportItems.tone(row,el.dataset.section);
      el.querySelector('[data-row-title]').textContent=row.title||'待填写事项';const badge=el.querySelector('[data-row-status]');badge.className=`closure-status ${t.color}`;badge.textContent=t.label;
    });
  }
  function bindFrontReport(){
    if(state.page!=='reports'||state.dept!=='front'||!state.cloud.session||state.reports.front?.status==='已确认')return;
    const form=document.querySelector('[data-report-form]');if(!form)return;
    const change=fn=>{
      clearTimeout(reportAutosaveTimer);
      const next=reportDraft('草稿');if(!next)return;
      fn(next);state.reports.front=next;window.CloudSync.cacheReport('front',next);render();saveReport('草稿',{silent:true,record:next});
    };
    form.querySelectorAll('[data-front-add]').forEach(button=>button.onclick=()=>change(report=>{report[`front_${button.dataset.frontAdd}`].push(window.FrontReport.blank())}));
    form.querySelector('[data-front-carry]')?.addEventListener('click',()=>change(report=>Object.assign(report,window.FrontReport.carryFollowups(report))));
    form.querySelectorAll('[data-front-delete]').forEach(button=>button.onclick=()=>{
      const element=button.closest('[data-front-row]'),key=`front_${element.dataset.frontSection}`,id=element.dataset.frontRow;
      const row=window.FrontReport.read(form,state.reports.front)[key].find(item=>item.id===id);
      if(window.FrontReport.filled(row)&&!window.confirm('确认删除本行？已确认的历史版本不受影响。'))return;
      change(report=>{if(row.source)report.front_dismissed_sources=[...(report.front_dismissed_sources||[]),row.source];report[key]=report[key].filter(item=>item.id!==id)});
    });
    const move=(id,target)=>change(report=>{const rows=report.front_plans,from=rows.findIndex(item=>item.id===id);if(from<0||target<0||target>=rows.length)return;rows.splice(target,0,rows.splice(from,1)[0])});
    form.querySelectorAll('[data-front-move]').forEach(button=>button.onclick=()=>{const id=button.closest('[data-front-row]').dataset.frontRow;move(id,state.reports.front.front_plans.findIndex(item=>item.id===id)+Number(button.dataset.frontMove))});
    form.querySelectorAll('.closure-drag').forEach(handle=>{handle.ondragstart=event=>{closureDragId=handle.closest('[data-front-row]').dataset.frontRow;event.dataTransfer.setData('text/plain',closureDragId);event.dataTransfer.effectAllowed='move'};handle.ondragend=()=>{closureDragId=null}});
    form.querySelectorAll('[data-front-section="plans"]').forEach(element=>{element.ondragover=event=>{if(closureDragId){event.preventDefault();event.dataTransfer.dropEffect='move'}};element.ondrop=event=>{event.preventDefault();if(!closureDragId)return;const id=closureDragId;closureDragId=null;move(id,state.reports.front.front_plans.findIndex(item=>item.id===element.dataset.frontRow))}});
    form.addEventListener('input',event=>{
      const element=event.target.closest('[data-front-row]');if(!element)return;
      const row=window.FrontReport.read(form,state.reports.front)[`front_${element.dataset.frontSection}`].find(item=>item.id===element.dataset.frontRow),tone=window.FrontReport.tone(row,element.dataset.frontSection);
      element.querySelector('[data-front-title]').textContent=row.title||'待填写事项';const badge=element.querySelector('[data-front-status]');badge.className=`closure-status ${tone.color}`;badge.textContent=tone.label;
    });
  }
  function bindCore(){
    const flushReport=()=>{const pending=reportAutosaveTimer;clearTimeout(reportAutosaveTimer);reportAutosaveTimer=null;if(pending&&state.page==='reports'&&state.cloud.session&&state.reports[state.dept]?.status!=='已确认')saveReport('草稿',{silent:true})};
    document.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>{flushReport();state.page=button.dataset.nav;window.scrollTo(0,0);render()});
    document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{state.modal=null;render()});
    document.querySelector('[data-edit-mode]')?.addEventListener('click',()=>{if(state.cloud.session){window.CloudSync.logout();state.cloud.session=null;flash('已退出编辑模式')}else{state.authIntent='edit';state.modal='auth';render()}});
    document.querySelector('[data-editor-guide]')?.addEventListener('click',()=>{state.modal='editor-guide';render()});
    document.querySelector('[data-auth-form]')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form)),name=String(data.name||'').trim(),previousName=savedEditorName();if(previousName&&name!==previousName&&!window.confirm(`上次填写人是${previousName}，是否确认改为${name}？`))return;try{localStorage.setItem(EDITOR_NAME_KEY,name)}catch(_){}state.cloud.session=await window.CloudSync.login(data.role,"",name);state.modal=null;flash(`已进入${state.cloud.session.role==='manager'?'店长':'部门'}编辑模式`)});
    document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.tab;render()});
    document.querySelectorAll('[data-rank]').forEach(button=>button.onclick=()=>{state.rank=button.dataset.rank;render()});
    document.querySelectorAll('[data-dept]').forEach(button=>button.onclick=()=>{flushReport();state.dept=button.dataset.dept;render()});
    document.querySelectorAll('[data-meeting-mode]').forEach(button=>button.onclick=()=>{state.meetingMode=button.dataset.meetingMode;render()});
    document.querySelector('[data-copy-undone]')?.addEventListener('click',async()=>{[0,1,2].forEach(index=>{const from=document.querySelector(`[name="undone_${index}"]`),to=document.querySelector(`[name="focus_${index}_title"]`);if(from?.value&&to&&!to.value)to.value=from.value});await saveReport('草稿')});
    document.querySelector('[data-add-review]')?.addEventListener('click',()=>{const form=document.querySelector('[data-report-form]');if(form){const draft={...(state.reports[state.dept]||{}),departmentId:state.dept,weekId:current.id};for(const [key,value] of new FormData(form).entries())draft[key]=value;state.reports[state.dept]=draft}state.reviewRows[state.dept]=Math.min(5,operationsReviewCount(state.dept)+1);render()});
    document.querySelector('[data-save-draft]')?.addEventListener('click',()=>{clearTimeout(reportAutosaveTimer);saveReport('草稿')});
    document.querySelector('[data-confirm-report]')?.addEventListener('click',()=>{clearTimeout(reportAutosaveTimer);if(window.confirm('确认将本周周报标记为已确认？确认后将作为周会正式摘要使用。'))saveReport('已确认')});
    document.querySelector('[data-reopen-report]')?.addEventListener('click',reopenReport);
    const reportForm=document.querySelector('[data-report-form]');
    if(reportForm&&state.cloud.session&&state.reports[state.dept]?.status!=="已确认"){
      const cacheDraft=()=>{const record=reportDraft("草稿");if(!record)return;state.reports[state.dept]=record;window.CloudSync.cacheReport(state.dept,record)};
      reportForm.addEventListener('input',()=>{cacheDraft();clearTimeout(reportAutosaveTimer);reportAutosaveTimer=setTimeout(()=>saveReport("草稿",{silent:true}),450)});
      reportForm.addEventListener('focusout',()=>{cacheDraft();clearTimeout(reportAutosaveTimer);reportAutosaveTimer=setTimeout(()=>saveReport("草稿",{silent:true}),0)});
    }
    document.querySelectorAll('[data-explain-note]').forEach(input=>input.oninput=()=>{const key=input.dataset.explainNote;state.explains[key]={...(state.explains[key]||{}),note:input.value};persistExplains()});
    document.querySelectorAll('[data-explain-status]').forEach(button=>button.onclick=()=>{const key=button.dataset.explainStatus;const currentExplain=state.explains[key]||{};state.explains[key]={...currentExplain,status:currentExplain.status==='已说明'?'待说明':'已说明'};persistExplains();render()});
  }
  function currentMeetingAction(key){
    const source=meetingRows().filter(x=>x.report.status==="已确认").flatMap(x=>x.focus.map(y=>({...y,department:x.dept.name,sourceId:y.id}))).find(x=>x.sourceId===key);
    const saved=(state.meeting.actions||[]).find(x=>x.sourceId===key||x.id===key);
    return {...(source||{}),...(saved||{})};
  }
  const originalBind=bindCore;
  function decorateMeetingReport(){
    if(state.page!=="meeting")return;
    const meetingTop=document.querySelector(".meeting-top"),heading=meetingTop?.querySelector("div:first-child");
    if(!meetingTop||!heading)return;
    const confirmed=meetingRows().filter(x=>x.report.status==="已确认").length;
    const completeness=document.createElement("span");
    completeness.className="meeting-completeness";
    completeness.textContent=`数据完整度：经营快照已复核 · 部门周报 ${confirmed}/3 已确认`;
    heading.append(completeness);
    if(state.meetingMode==="supervisor"){
      const agenda=document.createElement("nav");
      agenda.className="meeting-agenda";
      agenda.setAttribute("aria-label","主管会会议锚点");
      agenda.innerHTML=["经营结果","变化原因","前厅抖音","部门汇报","协调事项","本周动作"].map((item,index)=>`<span><i>${index+1}</i>${item}</span>`).join("");
      meetingTop.after(agenda);
      return;
    }
    const riskTitle=document.querySelector(".boss-insights article:last-child h2");
    const riskCount=document.querySelectorAll(".boss-insights article:last-child p").length;
    if(riskTitle)riskTitle.textContent=`本周主要问题（${riskCount}项）`;
  }
  function bind(){
    originalBind();
    bindClosureReport();
    bindFrontReport();
    decorateMeetingReport();
    if(state.page==='meeting'&&state.meetingMode==='boss'){const insights=document.querySelector('.boss-insights'),actions=document.querySelector('.action-summary');if(insights&&actions)actions.before(insights)}
    document.querySelector('[data-presentation]')?.addEventListener('click',()=>{state.presentation=!state.presentation;render()});
    document.querySelector('[data-print]')?.addEventListener('click',()=>window.print());
    document.querySelectorAll('[data-open-report]').forEach(button=>button.onclick=()=>{state.dept=button.dataset.openReport;state.page='reports';render()});
    document.querySelector('[data-add-action]')?.addEventListener('click',()=>{state.meetingEditor={id:`manual-${Date.now()}`,title:'',owner:'',due:'',criteria:''};render()});
    document.querySelector('[data-cancel-action]')?.addEventListener('click',()=>{state.meetingEditor=null;render()});
    document.querySelector('[data-meeting-action-form]')?.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const index=state.meeting.actions.findIndex(x=>(data.sourceId&&x.sourceId===data.sourceId)||x.id===data.id);const record={...data,department:data.department||'店长补充',retained:true};if(index>=0)state.meeting.actions[index]={...state.meeting.actions[index],...record};else state.meeting.actions.push(record);state.meetingEditor=null;persistMeeting();flash('重点工作已保存到共享周会')});
    document.querySelectorAll('[data-action-retain]').forEach(button=>button.onclick=()=>{const key=button.dataset.actionRetain,index=state.meeting.actions.findIndex(x=>x.sourceId===key||x.id===key);const update={...(currentMeetingAction(key)),id:`override-${key}`,sourceId:key,retained:true};if(index>=0)state.meeting.actions[index]={...state.meeting.actions[index],retained:true};else state.meeting.actions.push(update);persistMeeting();flash('重点工作已保留')});
    document.querySelectorAll('[data-action-edit]').forEach(button=>button.onclick=()=>{state.meetingEditor=currentMeetingAction(button.dataset.actionEdit);render()});
    document.querySelectorAll('[data-action-delete]').forEach(button=>button.onclick=()=>{const key=button.dataset.actionDelete,index=state.meeting.actions.findIndex(x=>x.sourceId===key||x.id===key);if(index>=0)state.meeting.actions[index]={...state.meeting.actions[index],deleted:true};else state.meeting.actions.push({id:`override-${key}`,sourceId:key,deleted:true});persistMeeting();flash('重点工作已从共享周会汇总移除')});
    document.querySelectorAll('[data-upgrade-decision]').forEach(button=>button.onclick=()=>{const source=meetingRows().flatMap(x=>x.support.map(y=>({...y,department:x.dept.name}))).find(x=>x.id===button.dataset.upgradeDecision);if(!source)return; if(!(state.meeting.decisions||[]).some(x=>x.sourceId===source.id)){state.meeting.decisions.push({id:`decision-${source.id}`,sourceId:source.id,department:source.department,title:source.title,background:`${source.department}提出支持事项：${source.title}`,suggestion:source.result||'请老板确认支持方案',resource:'待店长补充',due:source.due||'待填写'});persistMeeting()}flash('已升级为老板决策事项')});
    if(state.page==='meeting'&&state.cloud.session?.role!=="manager"){
      const askManager=()=>{state.authIntent='manager';state.modal='auth';render()};
      document.querySelectorAll('[data-add-action],[data-action-retain],[data-action-edit],[data-action-delete],[data-upgrade-decision]').forEach(button=>button.onclick=askManager);
      const form=document.querySelector('[data-meeting-action-form]');if(form){const button=form.querySelector('button.primary');if(button){button.type='button';button.onclick=askManager}}
    }
  }
  render();
  async function applyBootstrap(payload){historyReports=payload?.reports||[];state.reports=Object.fromEntries(historyReports.filter(x=>x.weekId===current?.id).map(x=>[x.departmentId,x]));state.meeting={actions:[],decisions:[],ownerSupport:[],...(payload?.meeting||{})};state.cloud.status=payload?.offline?'offline':'synced';state.cloud.source=payload?.source||'cloud';state.cloud.lastUpdated=payload?.updatedAt||payload?.meeting?.updatedAt||'';render();return true}
  async function loadCloud(){const payload=await window.CloudSync.bootstrap(weeks);await applyBootstrap(payload);if(payload?.offline&&payload?.error)flash('共享内容读取失败，当前显示本机缓存')}
  loadCloud();
  window.CloudSync.startPolling(weeks);
  window.CloudSync.on(event=>{if(event.type==='session'){state.cloud.session=event.session;render();return}if(event.type==='remote'){const editing=document.activeElement?.closest?.('[data-report-form],[data-meeting-action-form]');if(!editing)applyBootstrap(event.payload)}});
})();
