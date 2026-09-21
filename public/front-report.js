(function () {
  const workStatuses = ['已完成','进行中','延期','未开始','已取消'];
  const coordinateStatuses = ['待回复','处理中','已解决'];
  const issueCategories = ['销售转化','收银核销','客诉服务','会员办理','二销','娃娃弹珠区','卫生形象','排班协作','线上团购','其他'];
  const insightFields = [
    ['front_insight_highlight','本周经营亮点','本周哪些结果或动作最有效？'],
    ['front_insight_change','与上周相比最明显的变化','请描述变化，而不是重复数字。'],
    ['front_insight_gap','未达预期的指标','哪些指标没有达到预期？'],
    ['front_insight_cause','原因分析','请说明事实依据与原因判断。'],
    ['front_insight_improve','下周重点改善方向','聚焦可执行的改善方向。']
  ];
  const sections = [
    {key:'review',title:'4. 上周重点事项复盘',note:'围绕经营动作与服务动作追问上周安排；未完成事项会在下一周自动带入。',fields:[['title','上周事项'],['owner','责任人'],['due','原计划完成时间','date'],['status','当前状态',workStatuses],['progress','完成结果或当前进度'],['impact','对经营数据的影响'],['reason','未完成原因'],['next','本周继续动作'],['nextDue','新完成时间','date']]},
    {key:'issues',title:'5. 前厅本周问题与改善动作',note:'只记录真实问题及改善动作；可选关联经营指标，但不强制。',fields:[['category','问题类别',issueCategories],['title','具体问题'],['impact','影响的数据或体验'],['cause','原因判断'],['measure','改善措施'],['owner','负责人'],['due','完成时间','date'],['criteria','验收标准'],['status','当前状态',workStatuses],['metric','关联经营指标（可选）']]},
    {key:'plans',title:'6. 下周经营目标与行动计划',note:'尽量量化目标，拖动排序柄或使用上下按钮调整优先级；未完成计划下周自动进入复盘。',fields:[['title','工作事项'],['goal','关联经营目标'],['target','目标数值'],['baseline','当前基数或本周实际'],['action','具体动作'],['owner','负责人'],['partners','配合人员或部门'],['due','完成时间','date'],['criteria','验收标准'],['status','当前进度',workStatuses]]},
    {key:'coordination',title:'7. 跨部门协调 / 店长支持',note:'没有事项可以留空；写清卡点、具体配合内容和完成时间。',fields:[['target','需要配合的部门'],['title','需要协调或支持的事项'],['background','当前卡点'],['request','希望对方完成的具体内容'],['due','希望完成时间','date'],['contact','对接人'],['status','当前状态',coordinateStatuses],['progress','处理结果']]},
    {key:'decisions',title:'需要店长决策',note:'临近答复时间但未处理的事项会突出提醒。',fields:[['title','需要店长决定什么'],['suggestion','建议方案'],['impact','不处理的影响'],['due','最晚答复时间','date'],['opinion','店长处理意见'],['status','当前状态',coordinateStatuses]]},
    {key:'followups',title:'8. 下周需持续跟进事项',note:'可从本周未完成计划、未解决协调事项和未关闭风险带入，也可以手工新增。',fields:[['title','需持续跟进事项'],['status','当前状态',workStatuses],['progress','本周进展'],['next','下周动作'],['owner','责任人'],['due','下次检查时间','date']]}
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const blank = () => ({id:globalThis.crypto?.randomUUID?.() || `front-${Date.now()}-${Math.random().toString(36).slice(2)}`});
  const done = row => ['已完成','已解决','已取消'].includes(row.status);
  const filled = row => Object.entries(row).some(([key,value]) => !['id','source','sourceLabel'].includes(key) && String(value || '').trim());
  const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const legacyValue = value => ['','无','暂无','未填写','待填写'].includes(String(value ?? '').trim()) ? '' : String(value ?? '').trim();
  const sourceKey = (weekId,key,row) => row.source || `${weekId}:${key}:${row.id}`;
  function legacy(report={}) {
    const rows = Object.fromEntries(sections.map(s=>[s.key,[]]));
    for(let i=0;i<3;i++) {
      const undone=legacyValue(report[`undone_${i}`]),problem=legacyValue(report[`problems_${i}`]),plan=legacyValue(report[`focus_${i}_title`]),support=legacyValue(report[`support_${i}_title`]);
      if(undone) rows.review.push({id:`legacy-review-${i}`,title:undone,reason:legacyValue(report[`undone_${i}_reason`]),next:legacyValue(report[`undone_${i}_next`])});
      if(problem) rows.issues.push({id:`legacy-issue-${i}`,title:problem,impact:legacyValue(report[`problems_${i}_impact`])});
      if(plan) rows.plans.push({id:`legacy-plan-${i}`,title:plan,owner:legacyValue(report[`focus_${i}_owner`]),due:legacyValue(report[`focus_${i}_due`]),criteria:legacyValue(report[`focus_${i}_criteria`])});
      if(support) {
        const target=legacyValue(report[`support_${i}_target`]);
        rows[target.includes('店长')?'decisions':'coordination'].push({id:`legacy-support-${i}`,title:support,target,request:legacyValue(report[`support_${i}_result`]),due:legacyValue(report[`support_${i}_due`])});
      }
    }
    return rows;
  }
  function rowsFrom(report={}) {return report.front_template===1?Object.fromEntries(sections.map(s=>[s.key,report[`front_${s.key}`]||[]])):legacy(report)}
  function prepare(report={},prior=null) {
    if(report.front_template===1)return clone(report);
    const rows=rowsFrom(report);
    if(prior) {
      const priorRows=rowsFrom(prior);
      for(const key of ['review','issues','plans','coordination','decisions','followups']) for(const row of priorRows[key]) {
        if(!filled(row)||done(row)) continue;
        const source=sourceKey(prior.weekId,key,row);
        if(rows.review.some(x=>x.source===source))continue;
        rows.review.push({...blank(),source,sourceLabel:'上周未完成事项',title:row.title||row.request||'',owner:row.owner||row.contact||'',due:row.nextDue||row.due||'',status:row.status||'',progress:row.progress||'',impact:row.impact||'',reason:row.reason||row.cause||'',next:row.next||row.action||row.measure||row.request||'',nextDue:''});
      }
    }
    while(rows.review.length<3)rows.review.push(blank());
    for(const section of sections)if(!rows[section.key].length)rows[section.key].push(blank());
    const next={...clone(report),front_template:1,...Object.fromEntries(sections.map(s=>[`front_${s.key}`,rows[s.key]]))};
    for(const [key] of insightFields)if(!Object.hasOwn(next,key))next[key]='';
    if(!next.front_insight_change&&report.result_explanation)next.front_insight_change=report.result_explanation;
    return next;
  }
  function carryFollowups(report) {
    const next=clone(report),rows=next.front_followups||[],ignored=next.front_dismissed_sources||[];
    for(const key of ['plans','issues','coordination','decisions'])for(const row of next[`front_${key}`]||[]) {
      const source=`${key}:${row.id}`;
      if(!filled(row)||done(row)||ignored.includes(source)||rows.some(x=>x.source===source))continue;
      const carried={...blank(),source,sourceLabel:key==='plans'?'本周未完成计划':key==='issues'?'未关闭问题':key==='coordination'?'未解决协调事项':'待店长决策',title:row.title||row.request||'',status:row.status==='待回复'?'未开始':row.status==='处理中'?'进行中':row.status||'',progress:row.progress||row.measure||'',next:row.next||row.action||row.request||'',owner:row.owner||row.contact||'',due:row.due||''};
      const empty=rows.findIndex(x=>!filled(x));if(empty>=0)rows[empty]=carried;else rows.push(carried);
    }
    next.front_followups=rows;return next;
  }
  function tone(row,key,now=Date.now()) {
    if(['已完成','已解决'].includes(row.status))return {color:'green',label:row.status};
    if(row.status==='已取消')return {color:'gray',label:'已取消'};
    const due=Date.parse(`${key==='review'?(row.nextDue||row.due):row.due}T23:59:59+08:00`);
    if(row.status==='延期'||(filled(row)&&Number.isFinite(due)&&due<now))return {color:'red',label:'延期 / 风险'};
    if(key==='decisions'&&filled(row)&&Number.isFinite(due)&&due-now<=48*3600000)return {color:'orange',label:'临近答复时间'};
    if(['待回复','待协调'].includes(row.status))return {color:'orange',label:row.status};
    if(['进行中','处理中'].includes(row.status))return {color:'blue',label:row.status};
    if(key==='review'&&filled(row))return {color:'orange',label:row.status||'待追问'};
    return {color:'gray',label:row.status||'待填写'};
  }
  function renderField(row,[key,label,type]) {
    const value=row[key]||'',attr=`data-front-field="${key}" aria-label="${label}"`;
    const control=Array.isArray(type)?`<select ${attr}><option value="">请选择</option>${(!type.includes(value)&&value?[value,...type]:type).map(option=>`<option value="${escape(option)}" ${option===value?'selected':''}>${escape(option)}</option>`).join('')}</select>`:type==='date'?`<input ${attr} type="${value&&!/^\d{4}-\d{2}-\d{2}$/.test(value)?'text':'date'}" value="${escape(value)}">`:`<textarea ${attr} rows="2" placeholder="${label}">${escape(value)}</textarea>`;
    return `<label>${label}${control}</label>`;
  }
  function insightRender(report,readonly=false) {
    return `<section class="panel form-section front-analysis-module" data-front-module="analysis"><div class="panel-title"><div><h2>2. 本周经营数据解读</h2><p>自动提示只用于辅助判断；请主管补充业务结论、原因与改善方向。</p></div></div><div class="front-insight-fields">${insightFields.map(([key,label,placeholder])=>`<label>${label}<textarea name="${key}" rows="3" placeholder="${placeholder}" ${readonly?'readonly':''}>${escape(report[key]||'')}</textarea></label>`).join('')}</div></section>`;
  }
  function render(report,readonly=false) {
    const sectionsHtml=sections.map((section,index)=>`<section class="panel form-section front-item-module" data-front-module="${section.key}"><div class="panel-title"><div><h2>${section.title}</h2><p>${section.note}</p></div></div>${section.key==='followups'&&!readonly?'<button type="button" class="ghost" data-front-carry>从本周未完成事项带入</button>':''}<div class="closure-list">${(report[`front_${section.key}`]||[]).map((row,i)=>{const t=tone(row,section.key);return `<details class="closure-row" data-front-row="${escape(row.id)}" data-front-section="${section.key}" ${i<(section.key==='review'?3:1)?'open':''}><summary>${section.key==='plans'&&!readonly?'<span class="closure-drag" draggable="true" title="拖动排序">⠿</span>':''}<b data-front-title>${escape(row.title||`待填写事项 ${i+1}`)}</b><span data-front-status class="closure-status ${t.color}">${t.label}</span></summary><div class="closure-fields">${section.fields.map(definition=>renderField(row,definition)).join('')}</div>${row.sourceLabel?`<small class="closure-source">来源：${escape(row.sourceLabel)}</small>`:''}${!readonly?`<div class="closure-controls">${section.key==='plans'?`<button type="button" class="ghost" data-front-move="-1" ${i===0?'disabled':''}>上移</button><button type="button" class="ghost" data-front-move="1" ${i===(report.front_plans||[]).length-1?'disabled':''}>下移</button>`:''}<button type="button" class="ghost" data-front-delete>删除本行</button></div>`:''}</details>`}).join('')}</div>${!readonly?`<button type="button" class="ghost" data-front-add="${section.key}">＋ 新增一项</button>`:''}</section>`).join('');
    return `${insightRender(report,readonly)}${sectionsHtml}`;
  }
  function read(form,report) {
    const next=clone(report);
    for(const [key] of insightFields)next[key]=form.querySelector(`[name="${key}"]`)?.value||'';
    for(const section of sections)next[`front_${section.key}`]=[...form.querySelectorAll(`[data-front-row][data-front-section="${section.key}"]`)].map(element=>{const old=(report[`front_${section.key}`]||[]).find(row=>row.id===element.dataset.frontRow)||{};return {...old,...Object.fromEntries([...element.querySelectorAll('[data-front-field]')].map(input=>[input.dataset.frontField,input.value]))};});
    return next;
  }
  function summary(report,id) {
    const rows=key=>(report[`front_${key}`]||[]).filter(filled);
    return {key:[report.front_insight_highlight,report.front_insight_change].filter(Boolean).join('；')||rows('review').map(row=>`${row.title}：${row.progress||row.status||'待追问'}`).join('；')||'未填写',problems:[...rows('issues').filter(row=>!done(row)).map(row=>[row.title,row.impact].filter(Boolean).join('：')),...rows('review').filter(row=>!done(row)).map(row=>[row.title,row.reason].filter(Boolean).join('：'))],undone:rows('review').filter(row=>!done(row)).map(row=>[row.title,row.reason,row.next].filter(Boolean).join(' / ')),focus:rows('plans').map(row=>({...row,id:`${id}-${row.id}`})),support:[...rows('coordination').map(row=>({...row,id:`${id}-${row.id}`,result:row.request})),...rows('decisions').map(row=>({...row,id:`${id}-${row.id}`,target:'店长',result:row.suggestion||row.title}))]};
  }
  function historyHTML(entries) {
    if(!entries.length)return '<p class="closure-history-empty">暂无可读取的历史周报，可直接手工新增事项。</p>';
    return `<details class="closure-history"><summary>查看历史周报 / 已确认版本（${entries.length}份）</summary>${entries.map(({label,report})=>`<details><summary>${escape(label)} · ${escape(report.confirmedBy||report.editorName||'')} · ${escape(report.confirmedAt||report.updatedAt||'')}</summary>${report.front_template===1?`${insightFields.filter(([key])=>report[key]).map(([key,title])=>`<h4>${title}</h4><p>${escape(report[key])}</p>`).join('')}${sections.map(section=>`<h4>${section.title}</h4>${(report[`front_${section.key}`]||[]).filter(filled).map(row=>`<dl>${section.fields.filter(([key])=>row[key]).map(([key,title])=>`<dt>${title}</dt><dd>${escape(row[key])}</dd>`).join('')}</dl>`).join('')||'<p>未填写</p>'}`).join('')}`:`<dl>${Object.entries(report).filter(([key,value])=>/^(result_explanation|problems_|focus_|support_|undone_|review_|specific_|advice)/.test(key)&&typeof value==='string'&&value.trim()).map(([,value])=>`<dd>${escape(value)}</dd>`).join('')}</dl>`}</details>`).join('')}</details>`;
  }
  window.FrontReport={sections,insightFields,prepare,carryFollowups,render,read,blank,filled,done,tone,summary,historyHTML};
})();
