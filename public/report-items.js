(function () {
  const statuses = ['已完成','进行中','未开始','延期','已取消'];
  const categories = ['安全设备','现场秩序','卫生服务','人员培训','排班考勤','采购库管','行政人事','其他'];
  const sections = [
    {key:'review',title:'1. 上周待办事项复盘',note:'追问上周安排；可查看历史记录，继续补充实际进度。',fields:[['title','事项名称'],['owner','原责任人'],['due','原计划完成时间','date'],['status','当前状态',statuses],['progress','实际结果或当前进度'],['reason','未完成原因'],['next','下一步动作'],['nextDue','新计划完成时间','date']]},
    {key:'plans',title:'2. 本周工作计划',note:'按需要新增；拖动行标题前的排序柄调整顺序，也可用上移、下移。',fields:[['title','本周工作事项'],['category','工作类别',categories],['owner','负责人'],['partners','配合人员或部门'],['due','计划完成时间','date'],['criteria','验收标准'],['status','当前进度',statuses],['note','备注']]},
    {key:'coordination',title:'3. 需要跨部门协调的事项',note:'没有事项可以留空；说明卡点和希望对方配合的具体内容。',fields:[['target','需配合部门'],['title','需协调事项'],['background','当前卡点或背景'],['request','希望对方配合的具体内容'],['due','希望完成时间','date'],['contact','对接人'],['status','当前状态',['待回复','处理中','已解决']],['progress','处理结果 / 跟进记录']]},
    {key:'decisions',title:'4. 需要店长决策或支持的事项',note:'明确需要决定什么；临近答复时间和逾期未处理事项会提示。',fields:[['title','事项'],['request','需要店长决定或支持什么'],['impact','不处理的影响'],['suggestion','建议方案'],['due','最晚需要答复时间','date'],['status','当前状态',['待回复','处理中','已解决']],['opinion','店长处理意见']]},
    {key:'followups',title:'5. 下周需持续跟进事项',note:'可从本周未完成计划、未解决协调事项带入，也可以手工新增。',fields:[['title','需持续跟进事项'],['status','当前状态',statuses],['progress','本周进展'],['next','下周动作'],['owner','责任人'],['due','下次检查时间','date']]}
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const done = row => ['已完成','已解决','已取消'].includes(row.status);
  const filled = row => Object.entries(row).some(([key,value]) => !['id','source','sourceLabel'].includes(key) && String(value || '').trim());
  const blank = () => ({id:globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`});
  const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  function legacy(report) {
    const rows = Object.fromEntries(sections.map(s=>[s.key,[]]));
    for(let i=0;i<3;i++) {
      if(report[`focus_${i}_title`]) rows.plans.push({id:`legacy-plan-${i}`,title:report[`focus_${i}_title`],owner:report[`focus_${i}_owner`]||'',due:report[`focus_${i}_due`]||'',criteria:report[`focus_${i}_criteria`]||''});
      if(report[`undone_${i}`]) rows.review.push({id:`legacy-undone-${i}`,title:report[`undone_${i}`],reason:report[`undone_${i}_reason`]||'',next:report[`undone_${i}_next`]||''});
      if(report[`support_${i}_title`]) {
        const target=report[`support_${i}_target`]||'',manager=target.includes('店长');
        rows[manager?'decisions':'coordination'].push({id:`legacy-support-${i}`,title:report[`support_${i}_title`],target,request:report[`support_${i}_result`]||'',due:report[`support_${i}_due`]||''});
      }
    }
    return rows;
  }
  function prepare(report={},prior=null) {
    if(report.closure_template===1)return clone(report);
    const rows=legacy(report);
    if(prior) {
      const old=prior.closure_template===1?Object.fromEntries(sections.map(s=>[s.key,prior[`closure_${s.key}`]||[]])):legacy(prior);
      for(const section of ['review','plans','coordination','followups']) for(const row of old[section]) {
        if(!filled(row)||done(row))continue;
        const source=row.source?(row.source.startsWith('plans:')||row.source.startsWith('coordination:')?`${prior.weekId}:${row.source}`:row.source):`${prior.weekId}:${section}:${row.id}`;
        if(rows.review.some(x=>x.source===source))continue;
        rows.review.push({...blank(),source,sourceLabel:'上周未完成事项',title:row.title||row.request||'',owner:row.owner||row.contact||'',due:row.nextDue||row.due||'',status:row.status||'',progress:row.progress||'',reason:row.reason||'',next:row.next||'',nextDue:''});
      }
    }
    while(rows.review.length<3)rows.review.push(blank());
    for(const s of sections)if(!rows[s.key].length)rows[s.key].push(blank());
    return {...clone(report),closure_template:1,...Object.fromEntries(sections.map(s=>[`closure_${s.key}`,rows[s.key]]))};
  }
  function carryFollowups(report) {
    const next=clone(report),rows=next.closure_followups||[],ignored=next.closure_dismissed_sources||[];
    for(const section of ['plans','coordination'])for(const row of next[`closure_${section}`]||[]) {
      const source=`${section}:${row.id}`;
      if(!filled(row)||done(row)||ignored.includes(source)||rows.some(x=>x.source===source))continue;
      const carried={...blank(),source,sourceLabel:section==='plans'?'本周未完成计划':'未解决协调事项',title:row.title||row.request||'',status:row.status==='待回复'?'未开始':row.status==='处理中'?'进行中':row.status||'',progress:row.progress||row.note||'',next:row.request||'',owner:row.owner||row.contact||'',due:row.due||''};
      const empty=rows.findIndex(x=>!filled(x));if(empty>=0)rows[empty]=carried;else rows.push(carried);
    }
    next.closure_followups=rows;return next;
  }
  function tone(row,section,now=Date.now()) {
    if(['已完成','已解决'].includes(row.status))return {color:'green',label:row.status};
    if(row.status==='已取消')return {color:'gray',label:'已取消'};
    const due=Date.parse(`${section==='review'?(row.nextDue||row.due):row.due}T23:59:59+08:00`);
    if(row.status==='延期'||(filled(row)&&Number.isFinite(due)&&due<now))return {color:'red',label:'延期 / 风险'};
    if(section==='decisions'&&filled(row)&&Number.isFinite(due)&&due-now<=48*3600000)return {color:'orange',label:'临近答复时间'};
    if(['待回复','待协调'].includes(row.status))return {color:'orange',label:row.status};
    if(['进行中','处理中'].includes(row.status))return {color:'blue',label:row.status};
    if(section==='review'&&filled(row))return {color:'orange',label:row.status||'待追问'};
    return {color:'gray',label:row.status||'待填写'};
  }
  function field(section,row,[key,label,type]) {
    const attr=`data-closure-field="${key}" aria-label="${label}"`,value=row[key]||'';
    const control=Array.isArray(type)?`<select ${attr}><option value="">请选择</option>${(!type.includes(value)&&value?[value,...type]:type).map(v=>`<option ${v===value?'selected':''} value="${escape(v)}">${escape(v)}</option>`).join('')}</select>`:type==='date'?`<input ${attr} type="${value&&!/^\d{4}-\d{2}-\d{2}$/.test(value)?'text':'date'}" value="${escape(value)}">`:`<textarea ${attr} rows="2" placeholder="${label}">${escape(value)}</textarea>`;
    return `<label>${label}${control}</label>`;
  }
  function render(report,readonly=false) {
    return sections.map((s,index)=>`<section class="panel form-section closure-module" data-closure-module="${s.key}"><div class="panel-title"><div><h2>${s.title}</h2><p>${s.note}</p></div></div>${s.key==='followups'&&!readonly?'<button type="button" class="ghost" data-carry-followups>从本周未完成事项带入</button>':''}<div class="closure-list">${(report[`closure_${s.key}`]||[]).map((row,i)=>{const t=tone(row,s.key);return `<details class="closure-row" data-closure-row="${escape(row.id)}" data-section="${s.key}" ${i<(index===0?3:1)?'open':''}><summary>${s.key==='plans'&&!readonly?'<span class="closure-drag" draggable="true" title="拖动排序">⠿</span>':''}<b data-row-title>${escape(row.title||`待填写事项 ${i+1}`)}</b><span data-row-status class="closure-status ${t.color}">${t.label}</span></summary><div class="closure-fields">${s.fields.map(f=>field(s.key,row,f)).join('')}</div>${row.sourceLabel?`<small class="closure-source">来源：${escape(row.sourceLabel)}</small>`:''}${!readonly?`<div class="closure-controls">${s.key==='plans'?`<button type="button" class="ghost" data-move-row="-1" ${i===0?'disabled':''}>上移</button><button type="button" class="ghost" data-move-row="1" ${i===(report.closure_plans||[]).length-1?'disabled':''}>下移</button>`:''}<button type="button" class="ghost" data-delete-row>删除本行</button></div>`:''}</details>`}).join('')}</div>${!readonly?`<button type="button" class="ghost" data-add-closure="${s.key}">＋ 新增一项</button>`:''}</section>`).join('');
  }
  function read(form,report) {
    const next=clone(report);
    for(const s of sections)next[`closure_${s.key}`]=[...form.querySelectorAll(`[data-closure-row][data-section="${s.key}"]`)].map(el=>{const old=(report[`closure_${s.key}`]||[]).find(r=>r.id===el.dataset.closureRow)||{};return {...old,...Object.fromEntries([...el.querySelectorAll('[data-closure-field]')].map(input=>[input.dataset.closureField,input.value]))}});
    return next;
  }
  function summary(report,id) {
    const rows=s=>(report[`closure_${s}`]||[]).filter(filled);
    return {key:rows('review').map(x=>`${x.title}：${x.progress||x.status||'待追问'}`).join('；')||'未填写',problems:[...rows('review').filter(x=>!done(x)).map(x=>[x.title,x.reason].filter(Boolean).join('：')),...rows('decisions').filter(x=>!done(x)).map(x=>[x.title,x.impact].filter(Boolean).join('：'))],undone:rows('review').filter(x=>!done(x)).map(x=>[x.title,x.reason,x.next].filter(Boolean).join(' / ')),focus:rows('plans').map(x=>({...x,id:`${id}-${x.id}`})),support:[...rows('coordination').map(x=>({...x,id:`${id}-${x.id}`,result:x.request})),...rows('decisions').map(x=>({...x,id:`${id}-${x.id}`,target:'店长',result:x.suggestion||x.request}))]};
  }
  function historyHTML(reports) {
    if(!reports.length)return '<p class="closure-history-empty">暂无可读取的历史周报，可直接手工新增事项。</p>';
    return `<details class="closure-history"><summary>查看历史周报 / 已确认版本（${reports.length}份）</summary>${reports.map(({label,report})=>`<details><summary>${escape(label)} · ${escape(report.confirmedBy||report.editorName||'')} · ${escape(report.confirmedAt||report.updatedAt||'')}</summary>${report.closure_template===1?sections.map(s=>`<h4>${s.title}</h4>${(report[`closure_${s.key}`]||[]).filter(filled).map(row=>`<dl>${s.fields.filter(([key])=>row[key]).map(([key,label])=>`<dt>${label}</dt><dd>${escape(row[key])}</dd>`).join('')}</dl>`).join('')||'<p>未填写</p>'}`).join(''):`<dl>${Object.entries(report).filter(([key,val])=>/^(result_explanation|problems_|focus_|support_|undone_|review_|specific_|advice)/.test(key)&&typeof val==='string'&&val.trim()).map(([key,val])=>`<dd>${escape(val)}</dd>`).join('')}</dl>`}</details>`).join('')}</details>`;
  }
  window.ReportItems={sections,prepare,carryFollowups,render,read,blank,filled,done,tone,summary,historyHTML};
})();
