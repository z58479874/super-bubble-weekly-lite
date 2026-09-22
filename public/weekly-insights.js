(function () {
  const finite = input => input !== null && input !== undefined && input !== '' && Number.isFinite(Number(input));
  const number = input => finite(input) ? Number(input) : null;
  const money = input => `¥${Math.abs(Number(input)).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  const signedMoney = input => `${input >= 0 ? '+' : '-'}${money(input)}`;
  const revenue = week => finite(week?.operatingRevenue) ? Number(week.operatingRevenue) : Object.values(week?.revenue || {}).reduce((total, item) => total + (finite(item) ? Number(item) : 0), 0);
  const cards = week => ['c299', 'c599', 'c999'].reduce((total, key) => total + (finite(week?.cards?.[key]) ? Number(week.cards[key]) : 0), 0);
  const convertible = week => finite(week?.admission) && finite(week?.historical) ? Number(week.admission) - Number(week.historical) : null;
  const percent = (numerator, denominator) => finite(numerator) && finite(denominator) && Number(denominator) > 0 ? Number(numerator) / Number(denominator) * 100 : null;
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };

  function make(priority, domain, title, fact, judgement, reason, action, owner, timing, impact, basis) {
    return { priority, domain, title, fact, judgement, reason, action, owner, timing, impact, basis };
  }

  function build({ data, current, previous }) {
    if (!current) return [];
    const results = [];
    const currentRevenue = revenue(current);
    const previousRevenue = previous ? revenue(previous) : null;
    const targetRate = percent(currentRevenue, current.target);
    const currentRate = percent(cards(current), convertible(current));
    const previousRate = previous ? percent(cards(previous), convertible(previous)) : null;
    const currentTopic = data?.douyinTopic?.[current.id] || null;
    const previousTopic = previous ? data?.douyinTopic?.[previous.id] || null : null;
    const currentFact = data?.douyinFacts?.[current.id] || {};
    const previousFact = previous ? data?.douyinFacts?.[previous.id] || {} : {};

    if (finite(current.target) && finite(currentRevenue)) {
      const gap = Number(current.target) - currentRevenue;
      results.push(make(
        gap > 0 && targetRate <= 90 ? 'P0' : gap > 0 ? 'P1' : 'P2', 'store',
        gap > 0 ? '经营目标存在缺口' : '经营目标已完成，需验证可持续性',
        `本周退款后净经营营业额 ${money(currentRevenue)}；周目标 ${money(current.target)}；目标完成率 ${targetRate.toFixed(1)}%${gap > 0 ? `，距目标 ${money(gap)}` : ''}。`,
        gap > 0 ? '本周经营结果未达到目标，需从客流、会员新办与抖音核销分别确定修复抓手。' : '本周已达到目标，但不能把一次性退款减少或跨期核销释放当作长期能力。',
        previous && currentRevenue < previousRevenue ? `推测：净经营营业额较上周减少 ${money(previousRevenue - currentRevenue)}，客流、会员新办和核销均需拆开验证。` : '暂无法判断单一原因，需补充客流、会员与核销分项变化。',
        gap > 0 ? '店长在周会上明确下周第一优先级：拉回客流、提升会员新办或提升核销到店。' : '复盘达标收入中哪些可以被下周复用，并设置可验证目标。',
        '店长', gap > 0 ? '周五前' : '下周复盘',
        '目标缺口未拆解时，行动会停留在泛泛“加强经营”。', '退款后净经营营业额 ÷ 周目标'
      ));
    }

    if (previous && finite(currentRevenue) && finite(previousRevenue)) {
      const revenueChange = currentRevenue - previousRevenue;
      const admissionChange = finite(current.admission) && finite(previous.admission) ? Number(current.admission) - Number(previous.admission) : null;
      const rateChange = finite(currentRate) && finite(previousRate) ? currentRate - previousRate : null;
      const conversionJudgement = admissionChange < 0 && rateChange > 0
        ? '客流下降，但办卡转化改善；转化改善未必足以抵消客流下降。'
        : admissionChange < 0 && (!finite(rateChange) || rateChange <= 0)
          ? '客流与转化未形成抵消，门店经营承压。'
          : admissionChange >= 0 && rateChange < 0
            ? '客流未下降但转化走弱，优先检查接待与销售承接。'
            : '客流、转化与营业额应继续拆开观察，避免只看单一总额。';
      results.push(make(
        revenueChange < 0 ? 'P1' : 'P2', 'front', '客流与办卡转化需拆开复盘',
        `入园家庭 ${finite(current.admission) ? `${Number(current.admission)}户` : '未统计'}${finite(admissionChange) ? `，较上周 ${admissionChange >= 0 ? '+' : '-'}${Math.abs(admissionChange)}户` : ''}；办卡率 ${finite(currentRate) ? `${currentRate.toFixed(2)}%` : '不可计算'}${finite(rateChange) ? `，较上周 ${rateChange >= 0 ? '+' : ''}${rateChange.toFixed(2)}个百分点` : '，暂不可比'}；净经营营业额 ${revenueChange >= 0 ? '+' : '-'}${money(revenueChange)}。`,
        conversionJudgement,
        admissionChange < 0 ? '推测：客流减少可能是主要压力；需结合天气、活动、营业日和渠道流量数据核实。' : '暂无法判断原因，需补充分时段接待与员工承接数据。',
        admissionChange < 0 ? '前厅复盘高峰接待、有效家庭识别与销售承接；店长同步确认客流恢复动作。' : '抽查接待分流、销售话术和卡型推荐，形成一项可验证的转化动作。',
        '前厅', '本周内', revenueChange < 0 ? '客流与转化双重走弱会直接扩大目标缺口。' : '总额改善时仍需确认是否由真实转化改善带动。',
        '入园家庭、历史会员家庭、办卡家庭；办卡率 = 办卡家庭 ÷ 有效可转化家庭'
      ));
    }

    if (previous && finite(current?.revenue?.newMember) && finite(previous?.revenue?.newMember)) {
      const memberChange = Number(current.revenue.newMember) - Number(previous.revenue.newMember);
      const currentMidBig = percent((Number(current?.cards?.c599) || 0) + (Number(current?.cards?.c999) || 0), cards(current));
      const previousMidBig = percent((Number(previous?.cards?.c599) || 0) + (Number(previous?.cards?.c999) || 0), cards(previous));
      const midBigChange = finite(currentMidBig) && finite(previousMidBig) ? currentMidBig - previousMidBig : null;
      if (memberChange < 0 || (finite(midBigChange) && midBigChange < -3)) results.push(make(
        'P1', 'front', '会员销售金额或卡型结构走弱',
        `会员新办收入 ${money(current.revenue.newMember)}，较上周 ${signedMoney(memberChange)}；中大卡率 ${finite(currentMidBig) ? `${currentMidBig.toFixed(2)}%` : '不可计算'}${finite(midBigChange) ? `，较上周 ${midBigChange >= 0 ? '+' : ''}${midBigChange.toFixed(2)}个百分点` : ''}。`,
        '办卡结果不能只看数量；会员新办下降或中大卡占比下沉会降低本周收入与后续复购价值。',
        '暂无法判断是人员话术、客群结构还是票型偏好变化；需补充员工接待与卡型推荐过程数据。',
        '复盘599/999推荐场景与员工话术；下一周设定中大卡率和会员收入两项可验收目标。',
        '前厅', '周五前', '低价卡占比上升会限制会员收入和后续价值。', '运营报表会员新办收入；299/599/999卡数'
      ));
    }

    const currentPaid = number(currentTopic?.orders?.userPaid) ?? number(currentFact.paidAmount);
    const previousPaid = number(previousTopic?.orders?.userPaid) ?? number(previousFact.paidAmount);
    const currentRedeemed = number(currentTopic?.fulfillment?.redeemedAmount) ?? number(currentFact.redeemedOrderReceived);
    const previousRedeemed = number(previousTopic?.fulfillment?.redeemedAmount) ?? number(previousFact.redeemedOrderReceived);
    if (finite(currentPaid) || finite(currentRedeemed)) {
      const paidChange = finite(currentPaid) && finite(previousPaid) ? currentPaid - previousPaid : null;
      const redeemedChange = finite(currentRedeemed) && finite(previousRedeemed) ? currentRedeemed - previousRedeemed : null;
      const sevenDay = currentTopic?.fulfillment?.sevenDay;
      results.push(make(
        finite(paidChange) && paidChange < 0 ? 'P1' : 'P2', 'douyin', '抖音成交、核销与到店需分期判断',
        `支付金额 ${finite(currentPaid) ? money(currentPaid) : '缺少订单数据'}${finite(paidChange) ? `，较上周 ${signedMoney(paidChange)}` : ''}；核销订单实收 ${finite(currentRedeemed) ? money(currentRedeemed) : '缺少核销数据'}${finite(redeemedChange) ? `，较上周 ${signedMoney(redeemedChange)}` : ''}；${finite(sevenDay?.rate) ? `7天到店率 ${Number(sevenDay.rate).toFixed(1)}%。` : '7天到店率持续积累中。'}`,
        '支付按成交期、核销按到店发生期，属于不同时间事实；不能把两者直接相除当作同批订单转化率。',
        '推测：直播效率、商品结构或渠道来源可能变化；现有数据不能证明哪一个是唯一原因。',
        '直播/商品复盘看支付和GMV；门店复盘看核销订单实收；成熟后再追踪同批7天到店率。',
        '主播/抖音', '本周内', '混用成交期与核销期会误判渠道真实到店效率。', '订单按支付时间；核销按核销时间；7天到店率仅统计成熟同批订单'
      ));
    }

    const live = currentTopic?.live, priorLive = previousTopic?.live;
    const gmvPerHour = finite(live?.gmv) && finite(live?.hours) && Number(live.hours) > 0 ? Number(live.gmv) / Number(live.hours) : null;
    const priorGmvPerHour = finite(priorLive?.gmv) && finite(priorLive?.hours) && Number(priorLive.hours) > 0 ? Number(priorLive.gmv) / Number(priorLive.hours) : null;
    const bestSlot = currentTopic?.liveBreakdown?.best, lowestSlot = currentTopic?.liveBreakdown?.lowest;
    if (finite(gmvPerHour) && finite(priorGmvPerHour)) {
      const efficiencyChange = gmvPerHour - priorGmvPerHour;
      results.push(make(
        efficiencyChange < 0 ? 'P1' : 'P2', 'douyin', efficiencyChange < 0 ? '直播单位时长产出承压' : '直播单位时长产出改善',
        `直播每小时成交额 ${money(gmvPerHour)}，较上周 ${signedMoney(efficiencyChange)}${bestSlot ? `；高效时段 ${bestSlot.name} ${money(bestSlot.gmvPerHour)}/小时` : ''}${lowestSlot ? `；低效时段 ${lowestSlot.name} ${money(lowestSlot.gmvPerHour)}/小时` : ''}。`,
        efficiencyChange < 0 ? '加长直播时长不能替代效率；应优先调整时段、内容与主推商品。' : '高效时段与商品组合应沉淀为可复用的下周试验。',
        bestSlot && lowestSlot ? `推测：${bestSlot.name}与${lowestSlot.name}效率差异明显；需继续验证流量、商品或内容差异。` : '暂无法判断原因，需补充时段、商品与内容标签。',
        efficiencyChange < 0 ? '保留高效场，压缩或改造低效场；每场记录主推票型、时段与成交结果。' : '复制高效时段的商品组合与话术，下周以每小时成交额验证。',
        '主播/抖音', '下周复盘前', '低效场持续投入会拉低整体直播产出。', '直播成交金额 ÷ 直播时长；早/午/晚场效率矩阵'
      ));
    }

    const rows = Array.isArray(data?.receptionByWeek?.[current.id]) ? data.receptionByWeek[current.id] : [];
    const assigned = rows.reduce((total, row) => total + (!row?.aggregate && finite(row?.reception) ? Number(row.reception) : 0), 0);
    const totalConvertible = convertible(current), quality = currentTopic?.quality;
    const cardGap = finite(current?.ops?.newCardFamilies) ? Number(current.ops.newCardFamilies) - cards(current) : null;
    const qualityFacts = [];
    if (finite(totalConvertible) && assigned < totalConvertible) qualityFacts.push(`员工已归属 ${assigned}户，未归属 ${Number(totalConvertible) - assigned}户`);
    if (quality?.exactDuplicateCandidates > 0) qualityFacts.push(`核销明细有 ${quality.exactDuplicateCandidates} 条重复候选`);
    if (quality?.productRefundAnomalies > 0) qualityFacts.push(`${quality.productRefundAnomalies} 个商品退款口径需核对`);
    if (finite(cardGap) && cardGap !== 0) qualityFacts.push(`运营表办卡家庭与卡型合计相差 ${Math.abs(cardGap)}张`);
    if (qualityFacts.length) results.push(make(
      'P1', 'quality', '数据质量需先核对，不等同于经营问题', qualityFacts.join('；') + '。',
      '该类差异不自动改数，也不应被直接解读为人员或经营表现下滑。',
      '暂无法判断差异是导出重复、跨期退款、漏录还是字段口径不同，必须先核对原始事实。',
      '周会前确认源表字段与导出时间；补齐前，员工个人转化率和退款率不进入正式绩效比较。',
      '前厅 / 店长', '周会前', '口径未确认会导致错误归因和错误考核。', '销售办卡 Sheet1、运营报表、抖音订单/核销/商品质量检查'
    ));

    return results.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 6);
  }

  function headline(items) {
    const target = items.find(item => item.domain === 'store');
    const main = items.find(item => item.domain !== 'quality' && item !== target) || items[0];
    if (!target && !main) return '数据已加载；暂无足够的对比期数据生成经营诊断。';
    return [target?.fact, main?.judgement].filter(Boolean).join(' ');
  }

  window.WeeklyInsights = { build, headline };
}());
