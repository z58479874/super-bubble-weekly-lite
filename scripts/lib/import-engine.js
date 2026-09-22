(function(root){
  "use strict";

  const TYPES={
    operations:{label:"超级泡泡运营报表",required:["日期","总业绩","指标","入园家庭数","当日办卡家庭数","历史会员家庭数"]},
    sales:{label:"销售办卡数据/Sheet1原始明细",required:["日期","姓名","办卡数","299","599","999"]},
    live:{label:"新版直播数据",required:["直播ID","开播日期","直播时长","直播间成交金额"]},
    product:{label:"新版商品数据",required:["天","商品ID","商品名称","商品成交金额"]},
    orders:{label:"订单成交明细",required:["订单编号","下单时间","用户实付","商品名称"]},
    redemptions:{label:"核销明细",required:["订单编号","券码（已撤销核销加密）","核销状态","核销时间"]},
    aftersales:{label:"售后明细",required:["售后编号","发起申请时间","售后状态","退款金额"]},
    video:{label:"短视频数据",required:["天","视频ID","视频标题"]},
    transactionReference:{label:"抖音经营数据（交易，对账）",required:[]},
    oldLive:{label:"旧全部场次列表（停用）",required:[]},
    oldDouyin:{label:"旧抖音后台数据（停用）",required:[]}
  };
  const DEPARTMENTS={
    ops:{name:"现场运营部",groups:["高空项目","淘气堡/游乐","VR/电玩","公共区域","其他现场运营"]},
    front:{name:"前厅部"},
    admin:{name:"综合管理部"}
  };
  const n=value=>{
    if(value===null||value===undefined||value===""||value==="-"||value==="--")return null;
    if(typeof value==="number")return Number.isFinite(value)?value:null;
    const parsed=Number(String(value).replaceAll(",","").replace(/[¥￥%]/g,"").trim());
    return Number.isFinite(parsed)?parsed:null;
  };
  const add=(a,b)=>(Number.isFinite(a)?a:0)+(Number.isFinite(b)?b:0);
  const text=value=>value===null||value===undefined?"":String(value).trim();
  const near=(a,b,tolerance=0.01)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<tolerance;
  const iso=value=>{
    if(value===null||value===undefined||value==="")return null;
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
    if(typeof value==="number"){
      if(value>=20200101&&value<=20991231){const raw=String(Math.trunc(value));return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`}
      const d=XLSX.SSF.parse_date_code(value);return d?`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`:null;
    }
    const raw=text(value);
    if(/^20\d{6}$/.test(raw))return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
    const match=raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    return match?`${match[1]}-${String(match[2]).padStart(2,"0")}-${String(match[3]).padStart(2,"0")}`:null;
  };
  const durationHours=value=>{
    if(value===null||value===undefined||value==="")return null;
    if(typeof value==="number")return value<=1?value*24:value;
    const raw=text(value),h=raw.match(/(\d+)小时/),m=raw.match(/(\d+)分/),s=raw.match(/(\d+)秒/);
    return (h?+h[1]:0)+(m?+m[1]/60:0)+(s?+s[1]/3600:0);
  };
  const localIso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monday=isoDay=>{const d=new Date(`${isoDay}T12:00:00`),offset=(d.getDay()+6)%7;d.setDate(d.getDate()-offset);return localIso(d)};
  const plusDays=(isoDay,count)=>{const d=new Date(`${isoDay}T12:00:00`);d.setDate(d.getDate()+count);return localIso(d)};
  const displayDate=isoDay=>{const [,m,d]=isoDay.split("-");return `${+m}月${+d}日`};
  const weekNumber=isoDay=>{
    const d=new Date(`${isoDay}T00:00:00Z`),thursday=new Date(d);thursday.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7));
    const first=new Date(Date.UTC(thursday.getUTCFullYear(),0,4));return 1+Math.round(((thursday-first)/86400000-3+((first.getUTCDay()+6)%7))/7);
  };
  const rowsOf=(book,sheetName)=>XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,defval:null,raw:true,blankrows:false});
  const rowObjects=(rows,headerIndex=0)=>{
    const headers=rows[headerIndex].map((x,i)=>text(x)||`__${i}`);
    return rows.slice(headerIndex+1).filter(row=>row.some(value=>value!==null&&value!==undefined&&value!=="")).map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]??null])));
  };
  const headerSet=rows=>new Set((rows[0]||[]).map(text).filter(Boolean));
  function recognize(fileName,book){
    const name=fileName.toLowerCase();
    if(name.includes("全部场次"))return {type:"oldLive",sheet:book.SheetNames[0],headerIndex:0};
    if(name.includes("抖音后台数据"))return {type:"oldDouyin",sheet:book.SheetNames[0],headerIndex:0};
    const candidates=[];
    for(const sheet of book.SheetNames){
      const rows=rowsOf(book,sheet).slice(0,8);
      for(let i=0;i<rows.length;i++){
        const set=new Set((rows[i]||[]).map(text));
        let type=null;
        if(set.has("总业绩")&&set.has("入园家庭数"))type="operations";
        else if(set.has("日期")&&(set.has("办卡数")||set.has("合计办卡数"))&&(set.has("姓名")||set.has("员工")))type="sales";
        else if(set.has("直播ID")&&set.has("直播间成交金额"))type="live";
        else if(set.has("商品ID")&&set.has("商品成交金额")&&set.has("投放渠道"))type="product";
        else if(set.has("订单编号")&&set.has("下单时间")&&set.has("用户实付")&&set.has("订单状态"))type="orders";
        else if(set.has("券码（已撤销核销加密）")&&set.has("核销状态"))type="redemptions";
        else if(set.has("售后编号")&&set.has("发起申请时间"))type="aftersales";
        else if(set.has("视频ID")&&set.has("视频标题"))type="video";
        if(type)candidates.push({type,sheet,headerIndex:i,score:TYPES[type].required.filter(x=>set.has(x)).length});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(candidates.length)return candidates[0];
    if(name.includes("交易"))return {type:"transactionReference",sheet:book.SheetNames[0],headerIndex:0};
    return {type:"unknown",sheet:book.SheetNames[0],headerIndex:0};
  }
  function sheetDate(raw,sheetName){
    const month=(sheetName||"").match(/(20\d{2})[./年-]?(\d{1,2})月?/);
    const small=raw instanceof Date&&raw.getFullYear()<2000?raw.getDate():n(raw);
    if(month&&small>=1&&small<=31)return `${month[1]}-${String(month[2]).padStart(2,"0")}-${String(small).padStart(2,"0")}`;
    return iso(raw);
  }
  function sourceInfo(file,book,recognized,records,dates,errors=[],warnings=[]){
    const required=TYPES[recognized.type]?.required||[],available=new Set(Object.keys(records[0]||{})),missing=required.filter(x=>!available.has(x));
    const successful=records.filter(row=>Object.values(row).some(value=>value!==null&&value!==undefined&&value!=="")).length;
    const validDates=dates.filter(Boolean).sort();
    return {id:`${recognized.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,fileName:file.name,type:recognized.type,typeLabel:TYPES[recognized.type]?.label||"无法识别",sheet:recognized.sheet,dateStart:validDates[0]||null,dateEnd:validDates.at(-1)||null,records:records.length,success:successful,errors:errors.length,missingFields:missing,coverage:records.length?successful/records.length:null,warnings:[...warnings,...errors]};
  }
  function makePeriods(operationRows){
    const dates=operationRows.map(x=>x.__date).filter(Boolean).sort();
    const groups={};
    dates.forEach(d=>{const key=monday(d);(groups[key]||=[]).push(d)});
    // Only a full Monday–Sunday period can become the current weekly report.
    // An in-progress Monday onwards must never displace the last completed week.
    return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([weekStart,days])=>{
      const start=days[0],end=days.at(-1),naturalEnd=plusDays(weekStart,6),daySet=new Set(days),partial=start!==weekStart||end!==naturalEnd||[0,1,2,3,4,5,6].some(offset=>!daySet.has(plusDays(weekStart,offset)));
      return {id:`period-${start}_${end}`,weekStart,startDate:start,endDate:end,label:`第${weekNumber(weekStart)}周`,range:`${displayDate(start)}—${displayDate(end)}`,isPartialWeek:partial,note:partial?"首期数据 / 非完整自然周":"完整自然周"};
    }).filter(period=>!period.isPartialWeek).slice(-4);
  }
  const inPeriod=(d,p)=>d&&d>=p.startDate&&d<=p.endDate;
  function sumField(rows,key){let present=false,total=0;for(const row of rows){const value=n(row[key]);if(value!==null){present=true;total+=value}}return present?total:null}
  function sumFieldAny(rows,keys){for(const key of keys){const value=sumField(rows,key);if(value!==null)return value}return null}
  function opsAdapter(item){
    const normalized=[];const usedSheets=[];
    for(const sheet of item.book.SheetNames){
      const rows=rowsOf(item.book,sheet);const header=rows.findIndex(row=>new Set((row||[]).map(text)).has("总业绩")&&new Set((row||[]).map(text)).has("入园家庭数"));
      if(header<0)continue;
      const main=rows[header]||[],next=rows[header+1]||[];
      const dateColumn=main.findIndex(value=>text(value)==="日期");
      // Some monthly sheets have a second header row for grouped fields, while
      // others begin with data immediately below the header. Treat a day/date
      // in the next row as data; otherwise merge it as the secondary header.
      const nextIsData=dateColumn>=0&&(next[dateColumn] instanceof Date||(n(next[dateColumn])!==null&&n(next[dateColumn])>=1&&n(next[dateColumn])<=31));
      const headers=nextIsData?main.map((value,i)=>text(value)||`__${i}`):main.map((value,i)=>text(value)||(i?text(main[i-1]):"")).map((value,i)=>text(next[i])&&text(next[i])!==value?`${value}/${text(next[i])}`:value);
      const records=rows.slice(header+(nextIsData?1:2)).filter(row=>row.some(value=>value!==null&&value!=="")).map(row=>Object.fromEntries(headers.map((key,i)=>[key||`__${i}`,row[i]??null])));
      records.map(row=>({...row,__date:sheetDate(row["日期"],sheet),__sourceSheet:sheet})).filter(row=>row.__date&&n(row["总业绩"])!==null&&text(row["天气"])).forEach(row=>normalized.push(row));
      usedSheets.push(sheet);
    }
    // A workbook can contain several months. One date is one store-day fact;
    // keep the later sheet's record if a workbook accidentally repeats it.
    const byDate=new Map();normalized.forEach(row=>byDate.set(row.__date,row));
    const records=[...byDate.values()].sort((a,b)=>a.__date.localeCompare(b.__date));
    item.info=sourceInfo(item.file,item.book,{...item.rec,sheet:usedSheets.join("、")},records,records.map(x=>x.__date));
    return records;
  }
  function standardAdapter(item,dateField){
    const records=rowObjects(rowsOf(item.book,item.rec.sheet),item.rec.headerIndex),normalized=records.map(row=>({...row,__date:iso(row[dateField])})),valid=normalized.filter(row=>row.__date);
    item.info=sourceInfo(item.file,item.book,item.rec,records,valid.map(x=>x.__date),records.length>valid.length?[`${records.length-valid.length}行缺少或无法识别日期，未进入事实层`]:[]);item.info.success=valid.length;item.info.errors=records.length-valid.length;item.info.coverage=records.length?valid.length/records.length:null;return valid;
  }
  function buildWeek(period,opsRows){
    const rows=opsRows.filter(row=>inPeriod(row.__date,period));
    const originalReportTotal=sumField(rows,"总业绩"),target=sumField(rows,"指标"),offline=sumField(rows,"线下合计收入"),legacyOnlineReference=sumField(rows,"线上核销金额"),member=sumField(rows,"办卡金额"),secondary=sumField(rows,"二销合计");
    const refundRaw=add(sumField(rows,"退费（会员卡）"),sumField(rows,"其他退款"));
    const ticket=Number.isFinite(offline)&&Number.isFinite(member)&&Number.isFinite(secondary)?offline-member-secondary:null;
    const revenue={ticket,newMember:member,renewal:null,online:null,secondary,other:null,refund:Number.isFinite(refundRaw)?-refundRaw:null};
    return {...period,target,originalReportTotal,operatingRevenue:null,admission:sumField(rows,"入园家庭数"),historical:sumField(rows,"历史会员家庭数"),traffic:sumField(rows,"内场总客流"),staff:sumField(rows,"人员合计"),revenue,cards:{c299:sumFieldAny(rows,["299元卡/数量","299元卡"]),c599:sumFieldAny(rows,["599元卡/数量","599元卡"]),c999:sumFieldAny(rows,["999元卡/数量","999元卡"])},ops:{days:rows.length,offline,legacyOnlineReference,legacyPlatformFee:sumField(rows,"抖音官方服务费"),legacyThirdPartyFee:sumField(rows,"第三方服务费"),legacyCompanyReceived:sumField(rows,"公司抖音实际到账"),onlineRedeemCount:sumField(rows,"抖音核销线上汇总/数量"),onlineTransfer:sumField(rows,"抖音线上转卡数"),newCardFamilies:sumField(rows,"当日办卡家庭数"),douyinApproxFamilies:sumField(rows,"抖音散客家庭数"),refundRaw}};
  }
  function salesAdapter(rows,periods){
    const byWeek={},warnings=[];
    periods.forEach(p=>{
      const selected=rows.filter(row=>inPeriod(row.__date,p)&&text(row["姓名"])!=="合计");
      const employees={};
      selected.forEach(row=>{
        const name=text(row["姓名"])||"未明确归属",x=employees[name]||(employees[name]={name,reception:0,receptionKnown:true,historical:null,enrolled:0,amount:0,amountKnown:true,c299:0,c599:0,c999:0,legacy:0,renewal:null,online:null});
        const family=n(row["家庭数"]??row["散客家庭数"]),amount=n(row["办卡总金额"]??row["办卡金额"]);if(family===null)x.receptionKnown=false;else x.reception+=family;if(amount===null)x.amountKnown=false;else x.amount+=amount;
        x.enrolled+=n(row["合计办卡数"]??row["办卡数"])||0;x.c299+=n(row["299"])||0;x.c599+=n(row["599"])||0;x.c999+=n(row["999"])||0;x.legacy+=add(n(row["500"]),n(row["800"]));
      });
      byWeek[p.id]=Object.values(employees);if(selected.some(row=>n(row["家庭数"])===null))warnings.push(`${p.range}员工家庭数覆盖不完整`);if(selected.some(row=>add(n(row["500"]),n(row["800"]))>0))warnings.push(`${p.range}存在500/800历史卡型，已归入legacy_or_other_card`);
    });
    return {byWeek,warnings};
  }
  function liveAdapter(rows,period){
    const seen=new Set(),live=[];
    rows.filter(row=>inPeriod(row.__date,period)).forEach(row=>{const id=text(row["直播ID"]);if(!id||seen.has(id))return;seen.add(id);live.push({id,date:displayDate(row.__date),host:text(row["抖音号昵称"])||text(row["直播间名称"])||"未标注主播",hours:durationHours(row["直播时长"]),viewers:n(row["直播间观看人数"]),exposure:n(row["直播间曝光人数"]),gmv:n(row["直播间成交金额"]),orders:n(row["直播间成交券数"]),redeemed:n(row["直播间核销券数"]),redeemedAmount:n(row["直播间核销金额"]),refundOrders:n(row["直播间退款券数"]),refundAmount:n(row["直播间退款金额"])});});return live;
  }
  function productAdapter(rows,period){
    const map=new Map(),seen=new Set();
    rows.filter(row=>inPeriod(row.__date,period)).forEach(row=>{const unique=`${row.__date}|${text(row["商品ID"])}|${text(row["投放渠道"])}`;if(seen.has(unique))return;seen.add(unique);const id=text(row["商品ID"]),x=map.get(id)||(map.set(id,{id,name:text(row["商品名称"]),gmv:0,orders:0,paidAmount:0,refundOrders:0,refundAmount:0,redeemed:0,redeemedAmount:0,exposure:0,visits:0,tracked:null,enrolled:null}),map.get(id));
      x.gmv+=n(row["商品成交金额"])||0;x.orders+=n(row["商品成交券数"])||0;x.paidAmount+=n(row["商品成交金额"])||0;x.refundOrders+=n(row["商品退款券数"])||0;x.refundAmount+=n(row["商品退款金额"])||0;x.redeemed+=n(row["商品核销券数"])||0;x.redeemedAmount+=n(row["商品核销金额"])||0;x.exposure+=n(row["商品曝光人数"])||0;x.visits+=n(row["商品访问人数"])||0;
    });return [...map.values()];
  }
  function orderAdapter(rows,period){
    const seen=new Set();let orders=0,quantity=0,paidAmount=0,receivedAmount=0;
    rows.filter(row=>inPeriod(row.__date,period)).forEach(row=>{const id=text(row["订单编号"]);if(!id||seen.has(id))return;seen.add(id);orders++;quantity+=n(row["购买数量"])||0;paidAmount+=n(row["用户实付"])||0;receivedAmount+=n(row["订单实收"])||0;});return {orders,quantity,paidAmount,receivedAmount};
  }
  const exactRowKey=row=>Object.keys(row).filter(key=>key!=="__date").sort().map(key=>`${key}:${text(row[key])}`).join("\u001f");
  const compositeRedemptionKey=row=>[row["订单编号"],row["券码（已撤销核销加密）"],row["核销时间"],row["核销状态"]].map(text).join("|");
  const sumRows=(rows,key)=>rows.reduce((total,row)=>total+(n(row[key])||0),0);
  const sumRowFields=(rows,fields)=>rows.reduce((total,row)=>total+fields.reduce((rowTotal,key)=>rowTotal+(n(row[key])||0),0),0);
  function redemptionAdapter(rows,period,productControlAmount){
    const selected=rows.filter(row=>inPeriod(row.__date,period)),valid=selected.filter(row=>text(row["核销状态"])==="已核销"&&!text(row["撤销核销时间"]));
    const fullSeen=new Set(),deduped=[];let exactDuplicateCandidates=0;
    valid.forEach(row=>{const key=exactRowKey(row);if(fullSeen.has(key)){exactDuplicateCandidates++;return}fullSeen.add(key);deduped.push(row)});
    const allAmount=sumRows(valid,"订单实收"),dedupedAmount=sumRows(deduped,"订单实收");
    const productSupportsAll=near(allAmount,productControlAmount),productSupportsDeduped=near(dedupedAmount,productControlAmount);
    const useDeduped=exactDuplicateCandidates>0&&productSupportsDeduped&&!productSupportsAll;
    const effective=useDeduped?deduped:valid,orders=new Set(),legacySeen=new Set();let legacyCompositeCollisions=0;
    valid.forEach(row=>{const key=compositeRedemptionKey(row);if(legacySeen.has(key))legacyCompositeCollisions++;else legacySeen.add(key)});
    effective.forEach(row=>orders.add(text(row["订单编号"])));
    const platformFee=sumRowFields(effective,["软件服务费","出单宝托管服务费","AIGC 服务费"]);
    const thirdPartyServiceFee=sumRowFields(effective,["达人服务费","团长服务费","服务商服务费"]);
    const otherAdjustments=sumRowFields(effective,["职人激励金","店员激励金","月付贴息","增量宝"]);
    return {rawRows:selected.length,duplicatesRemoved:useDeduped?exactDuplicateCandidates:0,exactDuplicateCandidates,reversed:selected.length-valid.length,vouchers:effective.length,orders:orders.size,orderReceived:sumRows(effective,"订单实收"),userPaid:sumRows(effective,"用户实付"),expectedIncome:sumRows(effective,"预计收入"),platformFee,thirdPartyServiceFee,otherAdjustments,amount:sumRows(effective,"订单实收"),legacyCompositeCollisions,restoredRows:legacyCompositeCollisions-(useDeduped?exactDuplicateCandidates:0),dedupeDecision:useDeduped?"已删除经商品汇总验证的完全重复导出记录":exactDuplicateCandidates?"存在完全相同行，但商品汇总支持全部保留，按多券/分摊记录处理":"未发现完全重复导出记录",productControlAmount,productReconciled:near(sumRows(effective,"订单实收"),productControlAmount)};
  }
  function aftersalesAdapter(rows,period){
    const seen=new Set();let applications=0,amount=0,vouchers=0;rows.filter(row=>inPeriod(row.__date,period)&&(text(row["售后状态"])==="已退款"||!text(row["售后状态"]))).forEach(row=>{const id=text(row["售后编号"]);if(!id||seen.has(id))return;seen.add(id);applications++;amount+=n(row["退款金额"])||0;vouchers+=n(row["退款券数"])||0});return {applications,amount,vouchers,periodBasis:"售后完成时间"};
  }
  function sumItems(rows,key){let found=false,total=0;rows.forEach(row=>{if(Number.isFinite(row[key])){found=true;total+=row[key]}});return found?total:null}
  function buildDouyin(period,week,data){
    const live=liveAdapter(data.live||[],period),products=productAdapter(data.product||[],period),orders=orderAdapter(data.orders||[],period),productRedeemedAmount=sumItems(products,"redeemedAmount"),redemptions=redemptionAdapter(data.redemptions||[],period,productRedeemedAmount),aftersales=aftersalesAdapter(data.aftersales||[],period);
    return {live,products,liveHours:sumItems(live,"hours"),gmv:sumItems(products,"gmv"),paidOrders:data.orders?orders.orders:null,paidAmount:data.orders?orders.paidAmount:null,refundOrders:data.aftersales?aftersales.applications:null,refundAmount:data.aftersales?aftersales.amount:null,redeemedOrders:data.redemptions?redemptions.orders:null,redeemedVouchers:data.redemptions?redemptions.vouchers:null,redeemedOrderReceived:data.redemptions?redemptions.orderReceived:null,redeemedUserPaid:data.redemptions?redemptions.userPaid:null,expectedIncome:data.redemptions?redemptions.expectedIncome:null,platformServiceFee:data.redemptions?redemptions.platformFee:null,thirdPartyServiceFee:data.redemptions?redemptions.thirdPartyServiceFee:null,otherFeeAdjustments:data.redemptions?redemptions.otherAdjustments:null,actualReceived:null,productRedeemedAmount,exposure:sumItems(products,"exposure"),viewers:sumItems(live,"viewers"),clicks:sumItems(products,"visits"),tracked:week.ops.onlineRedeemCount,enrolled:week.ops.onlineTransfer,orderFacts:orders,redemptionFacts:redemptions,aftersalesFacts:aftersales,attribution:"抖音主渠道近似口径"};
  }
  function applyRevenuePolicy(week,douyin){
    const authoritativeOnline=douyin?.redeemedOrderReceived,refundRaw=week.ops.refundRaw,legacyOnline=week.ops.legacyOnlineReference;
    week.revenue.online=Number.isFinite(authoritativeOnline)?authoritativeOnline:null;
    const structureTotal=Object.values(week.revenue).filter(Number.isFinite).reduce((total,value)=>total+value,0);
    const reportNetBeforeOnlineAdjustment=Number.isFinite(week.originalReportTotal)?week.originalReportTotal-refundRaw:null;
    const onlineBasisAdjustment=Number.isFinite(authoritativeOnline)&&Number.isFinite(legacyOnline)?authoritativeOnline-legacyOnline:null;
    const bridgeExpected=Number.isFinite(reportNetBeforeOnlineAdjustment)&&Number.isFinite(onlineBasisAdjustment)?reportNetBeforeOnlineAdjustment+onlineBasisAdjustment:null;
    week.operatingRevenue=structureTotal;
    week.ops.structureTotal=structureTotal;
    week.ops.reportNetBeforeOnlineAdjustment=reportNetBeforeOnlineAdjustment;
    week.ops.onlineBasisAdjustment=onlineBasisAdjustment;
    week.ops.reportToLiteDifference=Number.isFinite(week.originalReportTotal)?structureTotal-week.originalReportTotal:null;
    week.ops.reconciliationDifference=Number.isFinite(bridgeExpected)?structureTotal-bridgeExpected:null;
    week.ops.refundOnlyConsistent=near(reportNetBeforeOnlineAdjustment,week.originalReportTotal-refundRaw);
    week.ops.reconciled=near(structureTotal,bridgeExpected);
    week.ops.incomeStatus=week.ops.reconciled?(near(onlineBasisAdjustment,0)?"口径一致：原报表为退款前，Lite为退款后净营业额":"口径已解释：退款后净额 + 抖音核销权威来源调整"):"收入结构存在未解释差异";
    return week;
  }
  function reconcile(weeks,douyinFacts){
    return weeks.flatMap(week=>{const d=douyinFacts[week.id],rows=[];const addRow=(metric,source,lite,reference,reason,status)=>rows.push({weekId:week.id,metric,source,lite,reference,difference:Number.isFinite(lite)&&Number.isFinite(reference)?lite-reference:null,status:status||(near(lite,reference)?"一致":"有差异"),reason});
      addRow("Lite净经营营业额","收入结构/退款后净额",week.operatingRevenue,week.ops.reportNetBeforeOnlineAdjustment+week.ops.onlineBasisAdjustment,week.ops.incomeStatus,week.ops.reconciled?"口径已解释":"有差异");addRow("原报表总业绩","运营报表/总业绩",week.originalReportTotal,week.originalReportTotal,"保留为退款前历史参考值","原始参考");addRow("已确认退款","运营报表/会员卡退款+其他退款",week.ops.refundRaw,week.originalReportTotal-week.ops.reportNetBeforeOnlineAdjustment,"退款从Lite净经营营业额中冲减","口径一致");addRow("营业目标","运营报表/指标",week.target,week.target,"权威来源直接汇总");addRow("入园家庭","运营报表/入园家庭数",week.admission,week.admission,"权威来源直接汇总");addRow("办卡家庭","运营报表/当日办卡家庭数",week.ops.newCardFamilies,week.cards.c299+week.cards.c599+week.cards.c999,"卡型合计与家庭数对账");addRow("抖音核销数量","核销明细/有效核销券码",d.redemptionFacts.vouchers,week.ops.onlineRedeemCount,"运营报表按到店家庭近似，核销明细按券码，口径不同","口径不同");addRow("抖音核销订单实收","核销明细/订单实收",d.redeemedOrderReceived,d.productRedeemedAmount,"与新版商品表商品核销金额对账",d.redemptionFacts.productReconciled?"核销金额已对平":"有差异");addRow("运营报表旧线上金额","运营报表/原线上核销金额",week.ops.legacyOnlineReference,d.redeemedOrderReceived,"旧字段混合到账与正向营收，仅作历史参考","旧报表口径不同");return rows;});
  }
  async function parseFiles(files){
    if(!root.XLSX)throw new Error("Excel解析组件未加载");
    const items=[];
    for(const file of files){const buffer=await file.arrayBuffer(),book=XLSX.read(buffer,{type:"array",cellDates:true,dense:false});const rec=recognize(file.name,book);items.push({file,book,rec});}
    const duplicateTypes=items.filter(x=>!["unknown","oldLive","oldDouyin","transactionReference"].includes(x.rec.type)).reduce((map,x)=>(map[x.rec.type]=(map[x.rec.type]||[]).concat(x),map),{});
    const errors=[];Object.entries(duplicateTypes).forEach(([type,list])=>{if(list.length>1)errors.push(`${TYPES[type].label}识别到${list.length}份，禁止同时写入，请只保留权威文件。`)});
    if(items.some(x=>x.rec.type==="oldLive")&&items.some(x=>x.rec.type==="live"))errors.push("检测到旧‘全部场次列表’与新版直播数据；旧文件已阻止写入。");
    if(items.some(x=>x.rec.type==="oldDouyin"))errors.push("检测到旧‘抖音后台数据’；该文件不参与主事实累计。");
    const data={};
    for(const item of items){if(["oldLive","oldDouyin","transactionReference","unknown"].includes(item.rec.type)){const records=rowObjects(rowsOf(item.book,item.rec.sheet),item.rec.headerIndex);item.info=sourceInfo(item.file,item.book,item.rec,records,[]);continue}if(item.rec.type==="operations")data.operations=opsAdapter(item);else {const dates={sales:"日期",live:"开播日期",product:"天",orders:"支付时间",redemptions:"核销时间",aftersales:"售后完成时间",video:"天"};data[item.rec.type]=standardAdapter(item,dates[item.rec.type]);}}
    if(!data.operations)errors.push("缺少超级泡泡运营报表，无法建立权威经营周快照。");
    const missingCore=["sales","live","product","orders","redemptions"].filter(type=>!data[type]);if(missingCore.length)errors.push(`缺少核心文件：${missingCore.map(x=>TYPES[x].label).join("、")}`);
    const missingEnhanced=["aftersales"].filter(type=>!data[type]);
    if(data.operations){const externalDates=[...(data.sales||[]),...(data.live||[]),...(data.product||[]),...(data.orders||[]),...(data.redemptions||[])].map(x=>x.__date).filter(Boolean).sort();const maxExternal=externalDates.at(-1);if(maxExternal){const before=data.operations.length;data.operations=data.operations.filter(x=>x.__date<=maxExternal);const op=items.find(x=>x.rec.type==="operations");if(op?.info&&before!==data.operations.length){op.info.records=data.operations.length;op.info.success=data.operations.length;op.info.dateEnd=maxExternal;op.info.warnings.push(`运营报表晚于其他核心文件的${before-data.operations.length}个日期未纳入本次快照`)}}}
    const periods=data.operations?makePeriods(data.operations):[],weeks=periods.map(p=>buildWeek(p,data.operations));
    const sales=salesAdapter(data.sales||[],periods),douyinFacts={};weeks.forEach(week=>douyinFacts[week.id]=buildDouyin(week,week,data));
    weeks.forEach(week=>applyRevenuePolicy(week,douyinFacts[week.id]));
    const receptionByWeek=sales.byWeek,reception=weeks.length?receptionByWeek[weeks.at(-1).id]||[]:[];
    const importWarnings=items.flatMap(item=>item.info?.warnings||[]);
    const enhancedWarnings=missingEnhanced.length?[`缺少增强数据：${missingEnhanced.map(x=>TYPES[x].label).join("、")}；实际退款指标将显示数据不足。`]:[];
    const result={schemaVersion:"lite-real-v2-net-revenue",generatedAt:new Date().toISOString(),weeks,reception,receptionByWeek,douyinFacts,departments:DEPARTMENTS,quality:{errors,warnings:[...sales.warnings,...importWarnings,...enhancedWarnings],imports:items.map(x=>x.info),reconciliation:reconcile(weeks,douyinFacts),sourcePolicy:{operations:"运营报表（总业绩与旧线上金额仅作历史对账）",sales:"销售办卡数据/Sheet1",live:"新版直播数据",product:"新版商品数据（商品核销对账）",orders:"订单成交明细（按支付时间归属）",redemptions:"核销明细/有效记录订单实收（经营权威）",aftersales:"售后明细（按售后完成时间归属，增强）",video:"短视频数据（增强）",revenuePolicy:"退款后净经营营业额",douyinPolicy:"GMV、支付、核销订单实收、预计收入、渠道费用、实际到账分别保存"}}};
    return result;
  }
  root.LiteImportEngine={parseFiles,recognize,TYPES};
})(typeof window!=="undefined"?window:globalThis);
