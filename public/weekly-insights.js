(function () {
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const value = input => finite(input) ? Number(input) : null;
  const revenue = week => finite(week?.operatingRevenue)
    ? Number(week.operatingRevenue)
    : Object.values(week?.revenue || {}).reduce((total, item) => total + (finite(item) ? Number(item) : 0), 0);
  const cardCount = week => ['c299', 'c599', 'c999'].reduce((total, key) => total + (finite(week?.cards?.[key]) ? Number(week.cards[key]) : 0), 0);
  const convertibleFamilies = week => finite(week?.admission) && finite(week?.historical) ? Number(week.admission) - Number(week.historical) : null;
  const percent = (numerator, denominator) => finite(numerator) && finite(denominator) && Number(denominator) > 0 ? Number(numerator) / Number(denominator) * 100 : null;
  const money = number => `¥${Math.abs(Number(number)).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  const signedMoney = number => `${number >= 0 ? '+' : '-'}${money(number)}`;
  const signedPercent = number => `${number >= 0 ? '+' : ''}${number.toFixed(1)}%`;
  const signedPoints = number => `${number >= 0 ? '+' : ''}${number.toFixed(2)} 个百分点`;
  const changeRate = (current, previous) => finite(current) && finite(previous) && Number(previous) !== 0
    ? (Number(current) - Number(previous)) / Math.abs(Number(previous)) * 100
    : null;
  const douyinFact = (data, week) => data?.douyinFacts?.[week?.id] || {};
  const douyinTopic = (data, week) => data?.douyinTopic?.[week?.id] || null;
  const priorityOrder = { P1: 1, P2: 2, P3: 3 };

  function insight(priority, domain, title, fact, judgement, impact, action, basis) {
    return { priority, domain, title, fact, judgement, impact, action, basis };
  }

  function build({ data, current, previous }) {
    if (!current) return [];
    const items = [];
    const currentRevenue = revenue(current);
    const previousRevenue = previous ? revenue(previous) : null;
    const targetRate = percent(currentRevenue, current.target);

    if (finite(current.target) && finite(currentRevenue)) {
      const gap = Number(current.target) - currentRevenue;
      if (gap > 0) {
        items.push(insight(
          'P1', 'store', '经营目标尚未完成',
          `退款后净经营营业额 ${money(currentRevenue)}，目标完成率 ${targetRate?.toFixed(1)}%，距目标 ${money(gap)}。`,
          '本周经营结果未达到既定目标，需要在周会上明确优先补足的收入来源。',
          '目标缺口仍在，若不拆解客流、会员销售与核销三项差异，下一周难以形成可执行修复动作。',
          '建议店长确认：客流、会员新办、抖音核销三项中，哪一项是下周第一优先级。',
          '退款后净营业额 ÷ 周目标'
        ));
      } else {
        items.push(insight(
          'P3', 'store', '经营目标已完成',
          `退款后净经营营业额 ${money(currentRevenue)}，目标完成率 ${targetRate?.toFixed(1)}%。`,
          '本周已达到目标，应继续核实增长是否来自可持续的客流、转化或收入结构改善。',
          '避免把一次性退款减少、跨期核销释放误当作长期经营能力提升。',
          '建议复盘增长项是否可在下周复用，并保留可验证的动作。',
          '退款后净营业额 ÷ 周目标'
        ));
      }
    }

    if (previous && finite(currentRevenue) && finite(previousRevenue)) {
      const revenueChange = currentRevenue - previousRevenue;
      const admissionChange = finite(current.admission) && finite(previous.admission) ? Number(current.admission) - Number(previous.admission) : null;
      const currentRate = percent(cardCount(current), convertibleFamilies(current));
      const previousRate = percent(cardCount(previous), convertibleFamilies(previous));
      const rateChange = finite(currentRate) && finite(previousRate) ? currentRate - previousRate : null;
      let judgement = `净经营营业额较上周${revenueChange >= 0 ? '增加' : '减少'} ${money(Math.abs(revenueChange))}（${signedPercent(changeRate(currentRevenue, previousRevenue) || 0)}）。`;
      let action = '建议主管分别说明客流、办卡转化和收入结构变化，避免仅用总营业额解释结果。';
      if (finite(admissionChange) && admissionChange < 0 && finite(rateChange) && rateChange > 0) {
        judgement += ` 入园家庭减少 ${Math.abs(admissionChange)} 户，但办卡率提升 ${Math.abs(rateChange).toFixed(2)} 个百分点；转化改善未必足以抵消客流下降。`;
        action = '建议前厅同时复盘高峰接待、有效家庭识别及销售转化，店长确认客流恢复动作。';
      } else if (finite(admissionChange) && admissionChange < 0 && (!finite(rateChange) || rateChange <= 0)) {
        judgement += ` 入园家庭减少 ${Math.abs(admissionChange)} 户，办卡转化未形成抵消。`;
        action = '建议优先核实客流下滑来源，再明确前厅转化与现场承接的补救动作。';
      } else if (finite(admissionChange) && admissionChange >= 0 && finite(rateChange) && rateChange < 0) {
        judgement += ` 入园家庭未下降，但办卡率下降 ${Math.abs(rateChange).toFixed(2)} 个百分点，问题更可能出现在转化环节。`;
        action = '建议前厅主管抽查接待分流、话术执行和卡型推荐，而非只追加流量。';
      }
      items.push(insight(
        revenueChange < 0 ? 'P1' : 'P2', 'front', '客流与转化需要拆开复盘',
        `入园家庭 ${finite(current.admission) ? `${Number(current.admission)} 户` : '未统计'}；办卡率 ${finite(currentRate) ? `${currentRate.toFixed(2)}%` : '不可计算'}${finite(rateChange) ? `，较上周 ${signedPoints(rateChange)}` : '，上周暂不可比'}。`,
        judgement,
        revenueChange < 0 ? '客流与转化双重走弱会直接扩大目标缺口。' : '总额改善时仍需确认是否由真实转化提升带动。',
        action,
        '入园家庭、历史会员家庭、办卡家庭；办卡率 = 办卡家庭 ÷ 有效可转化家庭'
      ));
    }

    if (previous && finite(current?.revenue?.newMember) && finite(previous?.revenue?.newMember)) {
      const memberChange = Number(current.revenue.newMember) - Number(previous.revenue.newMember);
      const currentMidBig = percent((Number(current?.cards?.c599) || 0) + (Number(current?.cards?.c999) || 0), cardCount(current));
      const previousMidBig = percent((Number(previous?.cards?.c599) || 0) + (Number(previous?.cards?.c999) || 0), cardCount(previous));
      const midBigChange = finite(currentMidBig) && finite(previousMidBig) ? currentMidBig - previousMidBig : null;
      if (memberChange < 0 || (finite(midBigChange) && midBigChange < -3)) {
        items.push(insight(
          'P2', 'front', '会员销售结构走弱',
          `会员新办收入 ${money(current.revenue.newMember)}，较上周 ${signedMoney(memberChange)}；中大卡率 ${finite(currentMidBig) ? `${currentMidBig.toFixed(2)}%` : '不可计算'}${finite(midBigChange) ? `，较上周 ${signedPoints(midBigChange)}` : ''}。`,
          '会员收入或中大卡结构下降，说明销售结果不仅要看办卡数，也要看卡型结构是否下沉。',
          '低价卡占比上升会限制会员收入和后续复购价值。',
          '建议前厅主管检查599/999推荐场景、员工话术与高峰时段的成交结构。',
          '运营报表会员新办收入；299/599/999卡数'
        ));
      }
    }

    const currentFact = douyinFact(data, current);
    const previousFact = douyinFact(data, previous);
    const currentTopic = douyinTopic(data, current);
    const previousTopic = douyinTopic(data, previous);
    const currentPaid = value(currentTopic?.orders?.userPaid) ?? value(currentFact.paidAmount);
    const previousPaid = value(previousTopic?.orders?.userPaid) ?? value(previousFact.paidAmount);
    const currentRedeemed = value(currentTopic?.fulfillment?.redeemedAmount) ?? value(currentFact.redeemedOrderReceived);
    const previousRedeemed = value(previousTopic?.fulfillment?.redeemedAmount) ?? value(previousFact.redeemedOrderReceived);
    if (finite(currentPaid) || finite(currentRedeemed)) {
      const paidChange = finite(currentPaid) && finite(previousPaid) ? currentPaid - previousPaid : null;
      const redeemedChange = finite(currentRedeemed) && finite(previousRedeemed) ? currentRedeemed - previousRedeemed : null;
      const sevenDay = currentTopic?.fulfillment?.sevenDay;
      const maturity = finite(sevenDay?.rate) ? `7天到店率 ${Number(sevenDay.rate).toFixed(1)}%。` : '本期订单的7天到店率尚未成熟，仍在持续积累中。';
      const direction = finite(paidChange) && paidChange < 0 && finite(redeemedChange) && redeemedChange < 0
        ? '成交期支付与核销发生期属于不同时间事实；两者均较上周减少，需要分别看成交效率与履约释放。'
        : '成交期支付与核销发生期属于不同时间事实，不能直接相除判断严格转化。';
      items.push(insight(
        finite(paidChange) && paidChange < 0 ? 'P2' : 'P3', 'douyin', '抖音成交与到店需分期判断',
        `本期支付金额 ${finite(currentPaid) ? money(currentPaid) : '未统计'}${finite(paidChange) ? `，较上周 ${signedMoney(paidChange)}` : ''}；本期核销订单实收 ${finite(currentRedeemed) ? money(currentRedeemed) : '未统计'}${finite(redeemedChange) ? `，较上周 ${signedMoney(redeemedChange)}` : ''}。`,
        `${direction}${maturity}`,
        '若把当周支付和当周核销强行视作同一批订单，会误判抖音渠道的真实到店效率。',
        '建议直播/商品复盘看支付与GMV；门店经营复盘看核销订单实收；成熟后再看同批7天到店率。',
        '订单按支付时间；核销按核销时间；7天到店率仅统计成熟同批订单'
      ));
    }

    const quality = currentTopic?.quality;
    const cardGap = finite(current?.ops?.newCardFamilies) ? Number(current.ops.newCardFamilies) - cardCount(current) : null;
    const qualityReasons = [];
    if (quality?.exactDuplicateCandidates > 0) qualityReasons.push(`核销明细存在 ${quality.exactDuplicateCandidates} 条完全重复候选记录`);
    if (quality?.productRefundAnomalies > 0) qualityReasons.push(`${quality.productRefundAnomalies} 个商品退款口径需核对`);
    if (finite(cardGap) && cardGap !== 0) qualityReasons.push(`运营报表办卡家庭与卡型合计相差 ${Math.abs(cardGap)} 张`);
    if (qualityReasons.length) {
      items.push(insight(
        'P2', 'quality', '数据质量提示，结论需保留边界',
        qualityReasons.join('；') + '。',
        '该问题不自动改数，也不等同于经营异常；相关比例和排名应以“需核对”方式使用。',
        '数据口径未确认时，容易把退款、重复券码或缺失卡型误判为真实经营波动。',
        '建议在周会前核对源表字段与导出时间，确认后再用于绩效或人员横向比较。',
        '抖音订单/核销/商品质量检查；运营报表与卡型明细对账'
      ));
    }

    return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 5);
  }

  function headline(items) {
    const target = items.find(item => item.title.includes('经营目标'));
    const key = items.find(item => item.priority !== 'P3' && item !== target) || items[0];
    if (!target && !key) return '数据已加载；暂无足够的对比期数据生成经营诊断。';
    return [target?.fact, key?.judgement].filter(Boolean).join(' ');
  }

  window.WeeklyInsights = { build, headline };
}());
