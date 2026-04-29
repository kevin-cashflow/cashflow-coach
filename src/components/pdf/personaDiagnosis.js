/**
 * 📊 8 페르소나 진단 시스템 (personaDiagnosis.js)
 *
 * Kevin Jung (정윤후) 강사님의 12년·5,000+ 세션 코칭 경험을 기반으로 설계된
 * 캐쉬플로우 게임 디브리핑용 재무 페르소나 자동 진단 알고리즘.
 *
 * 철학:
 * - 모든 선택에 옳고 그름은 없다.
 * - 정확한 진단이 경고보다 가치 있다.
 * - 학습자가 자기 위치를 알아야 다음 기회에 보완할 수 있다.
 *
 * 분류 결정 지표 10개 + 메시지 보강 지표 10개로 구성.
 *
 * 사용법:
 *   import { diagnosePersona, generatePersonaInsight } from './personaDiagnosis';
 *   const result = diagnosePersona(gameLog);
 *   const insight = generatePersonaInsight(result, gameLog, playerName);
 */

// ═══════════════════════════════════════════════════════════════
// 1. 페르소나 메타데이터
// ═══════════════════════════════════════════════════════════════

export const PERSONAS = {
  MASTER_ARCHITECT: {
    id: 1,
    key: 'MASTER_ARCHITECT',
    name: '완성형 설계자',
    nameEn: 'Master Architect',
    classification: '고성취 / 고안정 / 적극',
    icon: '👑',
    color: '#10b981', // emerald
  },
  OPTIMISTIC_EXPLORER: {
    id: 2,
    key: 'OPTIMISTIC_EXPLORER',
    name: '여유로운 탐험가',
    nameEn: 'Optimistic Explorer',
    classification: '저성취 / 고안정 / 적극',
    icon: '🧭',
    color: '#3b82f6', // blue
  },
  ANXIOUS_ACHIEVER: {
    id: 3,
    key: 'ANXIOUS_ACHIEVER',
    name: '신중한 성취자',
    nameEn: 'Anxious Achiever',
    classification: '고성취 / 저안정 / 적극',
    icon: '🛡️',
    color: '#f59e0b', // amber
  },
  SENSITIVE_CHALLENGER: {
    id: 4,
    key: 'SENSITIVE_CHALLENGER',
    name: '성장이 필요한 도전가',
    nameEn: 'Sensitive Challenger',
    classification: '저성취 / 저안정 / 적극',
    icon: '🌱',
    color: '#ef4444', // red
  },
  STRATEGIC_BUILDER: {
    id: 5,
    key: 'STRATEGIC_BUILDER',
    name: '전략적 레버리지 전문가',
    nameEn: 'Strategic Builder',
    classification: '고성취 / 고안정 / 큰 한방',
    icon: '🚀',
    color: '#8b5cf6', // violet
  },
  ACTIVE_RISK_TAKER: {
    id: 6,
    key: 'ACTIVE_RISK_TAKER',
    name: '열정적인 행동파',
    nameEn: 'Active Risk-Taker',
    classification: '고성취 / 저안정 / 매우 적극',
    icon: '🔥',
    color: '#ec4899', // pink
  },
  SAFE_HAVEN_KEEPER: {
    id: 7,
    key: 'SAFE_HAVEN_KEEPER',
    name: '안정 중심 자산가',
    nameEn: 'Safe-Haven Keeper',
    classification: '저성취 / 고안정 / 거의 안 함',
    icon: '🏦',
    color: '#06b6d4', // cyan
  },
  DILIGENT_SAVER: {
    id: 8,
    key: 'DILIGENT_SAVER',
    name: '성실한 저축가',
    nameEn: 'Diligent Saver',
    classification: '저성취 / 저안정 / 거의 안 함',
    icon: '🐷',
    color: '#f97316', // orange
  },
};

// ═══════════════════════════════════════════════════════════════
// 2. 메트릭 계산 함수 (분류 결정 지표 10개 + 메시지 보강 지표 10개)
// ═══════════════════════════════════════════════════════════════

/**
 * 핵심 메트릭을 turnLog에서 추출.
 * @param {Array} turnLog - 게임 턴 로그
 * @param {Object} gameData - 게임 메타데이터 (직업, 자산, 시작 자금 등)
 * @returns {Object} 모든 분류·메시지 지표를 포함한 객체
 */
export function calculateMetrics(turnLog, gameData = {}) {
  if (!Array.isArray(turnLog) || turnLog.length === 0) {
    return getEmptyMetrics();
  }

  // 기본 액션 분류
  const buyTurns = turnLog.filter(t => t.action === 'buy');
  const sellTurns = turnLog.filter(t => t.action === 'sell');
  const passTurns = turnLog.filter(t => t.action === 'pass');
  const rightsTurns = turnLog.filter(t => t.action === 'rights');
  const damageTurns = turnLog.filter(t => t.action === 'damage');
  const extraLoanTurns = turnLog.filter(t => t.cellType === 'EXTRA_LOAN');
  const debtRepayTurns = turnLog.filter(t => t.cellType === 'DEBT_REPAY');

  // ─────────────────────────────────────────────────────
  // 분류 결정 지표 (10개)
  // ─────────────────────────────────────────────────────

  // 1. 활용률 (직업별 차이를 정규화)
  const opportunityCount = buyTurns.length + passTurns.length + rightsTurns.length;
  const utilizationRate = opportunityCount > 0
    ? (buyTurns.length / opportunityCount)
    : 0;

  // 2. P/E Ratio
  const passiveIncome = gameData.passiveIncome || 0;
  const totalExpense = gameData.totalExpense || 1;
  const peRatio = passiveIncome / totalExpense;

  // 3. 쥐경주 탈출 여부
  const escaped = !!gameData.escaped;
  const escapeTurn = gameData.escapeTurn || null;

  // 4. 순자산 증식 배수 (시작 월급 × 12 기준)
  const startSalary = gameData.startSalary || 1;
  const totalAssets = gameData.totalAssets || 0;
  const totalDebt = gameData.totalDebt || 0;
  const netWorth = totalAssets - totalDebt;
  const wealthMultiple = netWorth / (startSalary * 12);

  // 5. 자산 다각화 (보유 클래스 수)
  const assetClasses = countAssetClasses(gameData.assets || []);

  // 6. 결정 일관성 (비슷한 카드 그룹 내 동일 결정 비율)
  const consistencyRate = calculateConsistency(turnLog);

  // 7. 충동 매매 비율 (0~1턴 내 매도, 가중치 적용)
  const impulsiveTradeScore = calculateImpulsiveTradeScore(turnLog);

  // 8. 자산 회전율
  const turnoverRate = buyTurns.length > 0
    ? (sellTurns.length / buyTurns.length)
    : 0;

  // 9. 레버리지 비율
  const leverageRatio = totalAssets > 0
    ? (totalDebt / totalAssets)
    : 0;

  // 10. 현금 비중
  const cash = gameData.cash || 0;
  const cashRatio = totalAssets > 0
    ? (cash / (totalAssets + cash))
    : 1;

  // ─────────────────────────────────────────────────────
  // 메시지 보강 지표 (10개)
  // ─────────────────────────────────────────────────────

  // M1. 주식 대담성
  const stockBoldness = calculateStockBoldness(buyTurns);

  // M2. 좋은 매물 카드 매수율
  const goodDealStats = calculateGoodDealStats(turnLog);

  // M3. 자산 클래스 매수 비중
  const assetClassRatio = calculateAssetClassRatio(buyTurns);

  // M4. 대출 활용 적극성
  const loanUsageStats = calculateLoanUsage(buyTurns);

  // M5. 평균 보유 기간
  const avgHoldingPeriod = calculateAvgHoldingPeriod(turnLog);

  // M6. 인플레이션 면역 자산 보유 (BIG DEAL #4)
  const hasInflationProof = checkInflationProofAsset(turnLog, gameData);

  // M7. 위기 카드 후 침착도
  const crisisResponse = analyzeCrisisResponse(turnLog);

  // M8. DOODAD 후 추가 대출
  const doodadLoanCount = countDoodadTriggeredLoans(turnLog);

  // M9. 매수 분포 (전반/중반/후반)
  const totalTurns = Math.max(...turnLog.map(t => t.turn || 0), 1);
  const buyDistribution = calculateBuyDistribution(buyTurns, totalTurns);

  // M10. 사업체 보유 수
  const businessCount = countBusinesses(gameData.assets || []);

  return {
    // 분류 결정 지표
    utilizationRate,
    peRatio,
    escaped,
    escapeTurn,
    wealthMultiple,
    assetClasses,
    consistencyRate,
    impulsiveTradeScore,
    turnoverRate,
    leverageRatio,
    cashRatio,

    // 메시지 보강 지표
    stockBoldness,
    goodDealStats,
    assetClassRatio,
    loanUsageStats,
    avgHoldingPeriod,
    hasInflationProof,
    crisisResponse,
    doodadLoanCount,
    buyDistribution,
    businessCount,

    // 기본 카운트
    buyCount: buyTurns.length,
    sellCount: sellTurns.length,
    passCount: passTurns.length,
    rightsCount: rightsTurns.length,
    totalTurns,
  };
}

// ─────────────────────────────────────────────────────────────
// 헬퍼 함수들
// ─────────────────────────────────────────────────────────────

function getEmptyMetrics() {
  return {
    utilizationRate: 0, peRatio: 0, escaped: false, escapeTurn: null,
    wealthMultiple: 0, assetClasses: 0, consistencyRate: 0,
    impulsiveTradeScore: 0, turnoverRate: 0, leverageRatio: 0, cashRatio: 1,
    stockBoldness: { level: 'NONE', avgShares: 0, maxShares: 0, count: 0 },
    goodDealStats: { encountered: 0, bought: 0, rate: 0 },
    assetClassRatio: { realEstate: 0, stock: 0, business: 0, land: 0 },
    loanUsageStats: { loanedBuys: 0, totalBuys: 0, rate: 0 },
    avgHoldingPeriod: 0,
    hasInflationProof: false,
    crisisResponse: { encountered: 0, calmResponse: 0 },
    doodadLoanCount: 0,
    buyDistribution: { early: 0, middle: 0, late: 0 },
    businessCount: 0,
    buyCount: 0, sellCount: 0, passCount: 0, rightsCount: 0, totalTurns: 0,
  };
}

function countAssetClasses(assets) {
  const types = new Set();
  assets.forEach(a => {
    if (!a) return;
    if (a.type === '주식') types.add('stock');
    else if (a.type === '부동산') types.add('realEstate');
    else if (a.type === '사업체' || a.type === '동업') types.add('business');
    else if (a.type === '땅') types.add('land');
  });
  return types.size;
}

function calculateConsistency(turnLog) {
  // 비슷한 카드 그룹별 (콘도/주택3-2/사업체/주식 등) 동일 결정 비율
  const groups = {};
  turnLog.forEach(t => {
    if (!t.card || !t.card.sub) return;
    if (!['buy', 'pass', 'rights'].includes(t.action)) return;

    const subKey = (t.card.sub || '').replace(/\d/g, '').trim(); // 숫자 제거 (시장가 다른 같은 카드)
    if (!groups[subKey]) groups[subKey] = [];
    groups[subKey].push(t.action);
  });

  let totalGroups = 0;
  let consistentGroups = 0;
  Object.values(groups).forEach(actions => {
    if (actions.length < 2) return; // 1번만 등장하면 일관성 측정 불가
    totalGroups++;
    const dominantAction = mostFrequent(actions);
    const consistencyInGroup = actions.filter(a => a === dominantAction).length / actions.length;
    if (consistencyInGroup >= 0.7) consistentGroups++;
  });

  return totalGroups > 0 ? (consistentGroups / totalGroups) : 0.5; // 기본값 50%
}

function mostFrequent(arr) {
  const counts = {};
  arr.forEach(v => counts[v] = (counts[v] || 0) + 1);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function calculateImpulsiveTradeScore(turnLog) {
  // 매수 → 매도 페어 추적, 0턴 가중치 ×3, 1턴 ×1, 2턴+ 충동 아님
  const buys = turnLog.filter(t => t.action === 'buy' && t.card);
  const sells = turnLog.filter(t => t.action === 'sell' && t.card);

  if (sells.length === 0) return 0; // 매도 없음 = 충동 0%

  let weightedImpulsive = 0;
  let total = 0;

  sells.forEach(sellT => {
    const matchedBuy = buys.find(b =>
      b.card?.sub === sellT.card?.sub &&
      b.turn <= sellT.turn
    );
    if (!matchedBuy) return;

    const holdTurns = sellT.turn - matchedBuy.turn;
    total++;
    if (holdTurns === 0) weightedImpulsive += 3;
    else if (holdTurns === 1) weightedImpulsive += 1;
    // 2턴 이상은 충동 아님 (가중치 0)
  });

  return total > 0 ? (weightedImpulsive / (total * 3)) : 0; // 정규화: 0~1
}

function calculateStockBoldness(buyTurns) {
  const stockBuys = buyTurns.filter(t =>
    t.card && t.shares != null && t.shares > 0
  );

  if (stockBuys.length === 0) {
    return { level: 'NONE', avgShares: 0, maxShares: 0, count: 0 };
  }

  const avgShares = stockBuys.reduce((s, t) => s + t.shares, 0) / stockBuys.length;
  const maxShares = Math.max(...stockBuys.map(t => t.shares));

  let level;
  if (avgShares >= 201) level = 'AGGRESSIVE';   // 201주+ 적극형
  else if (avgShares >= 101) level = 'BOLD';    // 101~200주 대담형
  else if (avgShares >= 11) level = 'CAUTIOUS'; // 11~100주 중간형
  else level = 'TIMID';                         // 1~10주 초보형

  return { level, avgShares: Math.round(avgShares), maxShares, count: stockBuys.length };
}

function calculateGoodDealStats(turnLog) {
  // "좋은 매물" 카드 등장 횟수와 매수 횟수
  const encountered = turnLog.filter(t =>
    t.card && t.card.special === '좋은 매물'
  ).length;

  const bought = turnLog.filter(t =>
    t.card && t.card.special === '좋은 매물' && t.action === 'buy'
  ).length;

  return {
    encountered,
    bought,
    rate: encountered > 0 ? (bought / encountered) : 0,
  };
}

function calculateAssetClassRatio(buyTurns) {
  const counts = { realEstate: 0, stock: 0, business: 0, land: 0 };
  buyTurns.forEach(t => {
    if (!t.card) return;
    const sub = t.card.sub || '';
    if (sub.includes('주식') || t.shares != null) counts.stock++;
    else if (sub.includes('사업') || sub.includes('동업') || sub.includes('PC') || sub.includes('세탁') || sub.includes('도넛') || sub.includes('피자') || sub.includes('B&B') || sub.includes('쇼핑') || sub.includes('세차') || sub.includes('문구') || sub.includes('부업')) counts.business++;
    else if (sub.includes('땅')) counts.land++;
    else counts.realEstate++;
  });
  const total = buyTurns.length || 1;
  return {
    realEstate: counts.realEstate / total,
    stock: counts.stock / total,
    business: counts.business / total,
    land: counts.land / total,
  };
}

function calculateLoanUsage(buyTurns) {
  const loanedBuys = buyTurns.filter(t => t.loan && t.loan > 0).length;
  const totalBuys = buyTurns.length;
  return {
    loanedBuys,
    totalBuys,
    rate: totalBuys > 0 ? (loanedBuys / totalBuys) : 0,
  };
}

function calculateAvgHoldingPeriod(turnLog) {
  const buys = turnLog.filter(t => t.action === 'buy' && t.card);
  const sells = turnLog.filter(t => t.action === 'sell' && t.card);

  if (sells.length === 0) return null; // 매도 없으면 측정 불가

  let totalHold = 0;
  let pairs = 0;
  sells.forEach(sellT => {
    const matchedBuy = buys.find(b =>
      b.card?.sub === sellT.card?.sub && b.turn <= sellT.turn
    );
    if (!matchedBuy) return;
    totalHold += sellT.turn - matchedBuy.turn;
    pairs++;
  });

  return pairs > 0 ? (totalHold / pairs) : null;
}

function checkInflationProofAsset(turnLog, gameData) {
  // BIG DEAL #4 (올캐시 매입 $60K 주택, inflationProof:true) 보유 여부
  // 매수 후 매도 안 했으면 보유 중
  const bought = turnLog.some(t =>
    t.action === 'buy' &&
    t.card &&
    (t.card.inflationProof === true || t.card.special === '올캐시 매입')
  );
  const sold = turnLog.some(t =>
    t.action === 'sell' &&
    t.card &&
    (t.card.inflationProof === true || t.card.special === '올캐시 매입')
  );
  return bought && !sold;
}

function analyzeCrisisResponse(turnLog) {
  // 위기 카드 (인플레이션, 국제 금융 위기) 등장 후 다음 턴의 행동 분석
  const crisisCards = turnLog.filter(t =>
    t.card && (
      /인플레이션|물가폭등/.test(t.card.desc || '') ||
      /국제 금융 위기|주식 상장 폐지/.test(t.card.desc || '')
    )
  );

  let calm = 0;
  crisisCards.forEach(crisis => {
    const nextTurn = turnLog.find(t => t.turn === crisis.turn + 1);
    if (!nextTurn) {
      calm++; // 위기 후 추가 행동 없음 = 침착
      return;
    }
    // 패닉성 매도가 아니면 침착
    if (nextTurn.action !== 'sell') calm++;
  });

  return {
    encountered: crisisCards.length,
    calmResponse: calm,
  };
}

function countDoodadTriggeredLoans(turnLog) {
  // DOODAD 직후 EXTRA_LOAN이 있으면 DOODAD가 트리거한 대출로 간주
  let count = 0;
  turnLog.forEach((t, idx) => {
    if (t.cellType === 'DOODAD') {
      const next = turnLog[idx + 1];
      if (next && next.cellType === 'EXTRA_LOAN') count++;
    }
  });
  return count;
}

function calculateBuyDistribution(buyTurns, totalTurns) {
  if (totalTurns === 0) return { early: 0, middle: 0, late: 0 };
  const early = Math.ceil(totalTurns / 3);
  const middle = Math.ceil(totalTurns * 2 / 3);

  let earlyCount = 0, middleCount = 0, lateCount = 0;
  buyTurns.forEach(t => {
    if (t.turn <= early) earlyCount++;
    else if (t.turn <= middle) middleCount++;
    else lateCount++;
  });

  const total = buyTurns.length || 1;
  return {
    early: earlyCount / total,
    middle: middleCount / total,
    late: lateCount / total,
  };
}

function countBusinesses(assets) {
  return assets.filter(a => {
    if (!a) return false;
    if (a.type === '사업체' || a.type === '동업') return true;
    const name = a.name || '';
    return /PC|세탁소|문구|빨래방|세차장|피자|도넛|B&B|쇼핑몰|동업/.test(name);
  }).length;
}

// ═══════════════════════════════════════════════════════════════
// 3. 페르소나 분류 알고리즘 (분류 결정 지표 10개 사용)
// ═══════════════════════════════════════════════════════════════

/**
 * 게임 로그를 기반으로 8 페르소나 중 하나로 진단.
 * @param {Array} turnLog - 게임 턴 로그
 * @param {Object} gameData - 게임 메타데이터
 * @returns {Object} { persona: string, metrics: Object, scores: Object }
 */
export function diagnosePersona(turnLog, gameData = {}) {
  const metrics = calculateMetrics(turnLog, gameData);

  // 3축 점수 계산
  const A = calculateAchievementScore(metrics); // 0~100
  const S = calculateStabilityScore(metrics);    // 0~100
  const C = calculateActivityScore(metrics);     // 활동성 LOW/MID/HIGH

  const isHighA = A >= 60;
  const isHighS = S >= 60;

  let activity;
  if (metrics.buyCount >= 6) activity = 'HIGH';
  else if (metrics.buyCount >= 3) activity = 'MID';
  else activity = 'LOW';

  // 페르소나 결정
  const persona = classifyPersona({
    isHighA, isHighS, activity, metrics
  });

  return {
    persona,
    personaInfo: PERSONAS[persona],
    metrics,
    scores: { A, S, C, activity, isHighA, isHighS },
  };
}

function calculateAchievementScore(m) {
  let score = 0;
  // 쥐경주 탈출: 35점
  if (m.escaped) score += 35;
  // P/E Ratio: 30점 만점
  if (m.peRatio >= 1.0) score += 30;
  else if (m.peRatio >= 0.7) score += 20;
  else if (m.peRatio >= 0.5) score += 10;
  else score += Math.min(10, m.peRatio * 20);
  // 순자산 증식 배수: 25점 만점
  if (m.wealthMultiple >= 30) score += 25;
  else if (m.wealthMultiple >= 10) score += 15;
  else score += Math.min(15, m.wealthMultiple * 1.5);
  // 자산 다각화: 10점 만점
  score += Math.min(10, m.assetClasses * 2.5);

  return Math.min(100, Math.round(score));
}

function calculateStabilityScore(m) {
  let score = 0;
  // 결정 일관성: 25점
  if (m.consistencyRate >= 0.8) score += 25;
  else if (m.consistencyRate >= 0.6) score += 15;
  else score += Math.round(m.consistencyRate * 18);

  // 충동 매매 (정규화된 비율 0~1): 25점
  // impulsiveTradeScore가 0이면 만점, 1이면 0점
  score += Math.round((1 - m.impulsiveTradeScore) * 25);

  // 위기 카드 후 침착도: 20점
  if (m.crisisResponse.encountered > 0) {
    const calmRate = m.crisisResponse.calmResponse / m.crisisResponse.encountered;
    score += Math.round(calmRate * 20);
  } else {
    score += 15; // 위기 카드 안 나옴 = 중간값
  }

  // 레버리지 비율: 15점 (적정 30~50%가 만점, 너무 낮거나 높으면 감점)
  if (m.leverageRatio >= 0.3 && m.leverageRatio <= 0.5) score += 15;
  else if (m.leverageRatio >= 0.5 && m.leverageRatio <= 0.7) score += 10;
  else if (m.leverageRatio < 0.3) score += 8;
  else score += 5; // 70%+

  // DOODAD 후 추가 대출: 15점
  if (m.doodadLoanCount === 0) score += 15;
  else if (m.doodadLoanCount === 1) score += 8;
  else score += 0;

  return Math.min(100, Math.round(score));
}

function calculateActivityScore(m) {
  // 활용률 + 매수 횟수 결합
  let score = 0;
  // 활용률
  if (m.utilizationRate >= 0.6) score += 50;
  else if (m.utilizationRate >= 0.3) score += 30;
  else score += Math.round(m.utilizationRate * 100);

  // 매수 횟수
  if (m.buyCount >= 6) score += 50;
  else if (m.buyCount >= 3) score += 30;
  else score += Math.round(m.buyCount * 10);

  return Math.min(100, score);
}

function classifyPersona({ isHighA, isHighS, activity, metrics }) {
  const m = metrics;

  // ─────────────────────────────────────────
  // 활동성 LOW (매수 0~2회) — 거의 안 함
  // ─────────────────────────────────────────
  if (activity === 'LOW') {
    // 현금만 모은 경우 = ⑧ 성실한 저축가
    if (m.cashRatio >= 0.7 && !isHighA) return 'DILIGENT_SAVER';

    // 안전하게 보유 중 = ⑦ 안정 중심 자산가
    if (m.cashRatio >= 0.5 || m.utilizationRate < 0.3) return 'SAFE_HAVEN_KEEPER';

    // 적게 했지만 큰 한 방 성공 = ⑤ 전략적 레버리지
    if (isHighA && m.leverageRatio >= 0.4) return 'STRATEGIC_BUILDER';

    // 기본값
    return isHighS ? 'SAFE_HAVEN_KEEPER' : 'DILIGENT_SAVER';
  }

  // ─────────────────────────────────────────
  // 활동성 HIGH (매수 6회+) — 매우 적극
  // ─────────────────────────────────────────
  if (activity === 'HIGH') {
    // 자주 매매했고 회전율 높음 = ⑥ 열정적 행동파
    if (m.turnoverRate >= 0.25 && isHighA) return 'ACTIVE_RISK_TAKER';

    // 주식 매수가 매우 적극적이고 안정 낮음 = ⑥ 열정적 행동파
    if (m.stockBoldness.level === 'AGGRESSIVE' && !isHighS) return 'ACTIVE_RISK_TAKER';

    // 모든 면에서 우수 = ① 완성형 설계자
    if (isHighA && isHighS) return 'MASTER_ARCHITECT';

    // 적극적이지만 성과 부족
    if (!isHighA) return isHighS ? 'OPTIMISTIC_EXPLORER' : 'SENSITIVE_CHALLENGER';

    // 성과 좋고 활동적이지만 안정 낮음 = ③ 신중한 성취자
    return 'ANXIOUS_ACHIEVER';
  }

  // ─────────────────────────────────────────
  // 활동성 MID (매수 3~5회) — 가장 흔한 분포
  // ─────────────────────────────────────────

  // ⑤ 전략적 레버리지 전문가: 성취 + 안정 + 사업체 + 레버리지 (4가지 모두 충족)
  // 안정도 HIGH 조건이 핵심 — 안정 낮으면 ③ 신중한 성취자 또는 ⑥ 열정적 행동파
  if (isHighA && isHighS && m.businessCount >= 1 && m.leverageRatio >= 0.4) {
    return 'STRATEGIC_BUILDER';
  }

  // ⑥ 열정적 행동파: 자주 사고팔며 회전 + 성과 좋음
  // 성취도 HIGH 조건 추가 — 회전율만 높고 결과 안 좋으면 ④ 도전가
  if (m.turnoverRate >= 0.25 && isHighA) return 'ACTIVE_RISK_TAKER';

  // 4사분면 기본 분류
  if (isHighA && isHighS) return 'MASTER_ARCHITECT';     // ①
  if (!isHighA && isHighS) return 'OPTIMISTIC_EXPLORER'; // ②
  if (isHighA && !isHighS) return 'ANXIOUS_ACHIEVER';    // ③
  return 'SENSITIVE_CHALLENGER';                          // ④
}

// ═══════════════════════════════════════════════════════════════
// 4. 페르소나별 메시지 템플릿 (8개)
// ═══════════════════════════════════════════════════════════════
// 메시지 보강 지표 10개를 동적으로 삽입하여 개인화된 디브리핑 생성.
// 모든 메시지는 Kevin Jung 강사님의 코칭 철학을 반영함:
// - 정확한 진단 (좋고 나쁨이 아닌 현재 위치)
// - 시야 확장 (다른 관점 제시)
// - 선택권 존중 (지시/경고 대신 제안)

const MESSAGE_TEMPLATES = {
  MASTER_ARCHITECT: {
    diagnosis: (m, name) => {
      const escapeText = m.escaped ? `${m.escapeTurn}턴째에 쥐경주를 탈출하셨네요` : `쥐경주 탈출 직전까지 가셨네요`;
      const peText = m.peRatio.toFixed(1);
      const consistency = Math.round(m.consistencyRate * 100);
      const classes = m.assetClasses;
      const goodDealText = m.goodDealStats.encountered > 0
        ? `"꼭 사시오" 카드 ${m.goodDealStats.encountered}건 중 ${m.goodDealStats.bought}건을 매수하셨고, `
        : '';

      return `${name}님은 이번 게임에서 **${escapeText}**. 캐쉬플로우 게임에서 쥐경주 탈출은 패시브 인컴이 월 지출을 넘어서는 순간을 의미하는데, 이건 단순한 게임 결과가 아니라 **현실에서도 똑같이 일어나야 할 재무적 변곡점**이에요.

게임 내내 보여주신 패턴을 살펴보면, 매수 결정 **${m.buyCount}건이 거의 일관된 기준**으로 이루어졌습니다. 즉, "이 카드는 사고, 저 카드는 패스한다"는 의사결정이 즉흥적이지 않았다는 뜻이에요. 같은 종류의 카드(예: 콘도 vs 사업체)가 여러 번 나왔을 때 **${consistency}%의 일관된 결정**을 보여주신 게 그 증거예요.

가장 인상적인 건 **위기 카드 대응**이에요. ${goodDealText}위기 카드가 떴을 때도 패닉성 매도나 즉흥적 자산 처분 없이 **차분하게 자산을 지키셨습니다**. 이런 침착함은 보통 게임을 여러 번 해본 분들에게서 나오는 패턴이에요. P/E Ratio **${peText}**로 패시브 인컴이 월 지출을 안정적으로 넘어선 상태이고, 자산도 **${classes}개 클래스**에 분산되어 있어서 한쪽이 흔들려도 다른 쪽이 받쳐주는 구조를 만드셨어요.`;
    },

    meaning: (m, name) => {
      return `이번 게임에서 보여주신 모습은 캐쉬플로우가 보여주려는 **"안정 위에 쌓는 부"**의 모범적인 흐름이에요. 부자아빠 책에서 강조하는 세 가지 — **현금흐름 창출**, **자산 클래스 다각화**, **위기 대응력** — 을 한 게임 안에서 모두 보여주셨거든요.

그런데 한 가지 꼭 짚고 넘어가고 싶은 게 있어요. **이게 "정답"이라는 뜻은 아니에요.** 시뮬레이션이라는 환경에서 잘 통한 전략이 현실의 모든 상황에 그대로 들어맞지는 않거든요. 현실에서는 카드가 무작위로 나오지 않고, 자녀 출산이 게임처럼 정해진 카드로 오지 않으며, 이자율 폭등도 항상 같은 방식으로 오지 않아요. 그래서 **이번에 잘 통한 전략을 "내 유일한 방법"으로 굳혀버리면 오히려 위험**할 수 있습니다.

다만 분명한 건, **적극성과 안정성을 동시에 갖춘 의사결정 감각**을 이번에 잘 보여주셨다는 거예요. 많은 사람들이 둘 중 하나만 갖고 있어서 적극적이면 불안하거나, 안정적이면 정체되는데, ${name}님은 그 균형을 잘 잡으셨어요. 이건 코칭 현장에서도 흔치 않은 패턴이에요.`;
    },

    nextStep: (m, name) => {
      return `이미 한 번 탈출 패턴은 검증되셨으니, 다음 게임에서는 **의도적으로 다른 길을 걸어보시는 걸** 추천드려요. 같은 패턴 안에 머물면 "내가 가진 강점이 정말 강점인지, 아니면 운이 좋았던 건지" 구분하기 어렵거든요.

몇 가지 구체적인 시도를 제안드리면:

**첫째, 다른 직업으로 시도해보세요.** 만약 이번에 비즈니스 매니저처럼 현금흐름이 큰 직업으로 게임하셨다면, 다음엔 간호사나 학교 선생님처럼 시작 자금이 적은 직업으로 한번 도전해보세요. 같은 의사결정 감각이 다른 조건에서도 작동하는지 확인할 수 있어요.

**둘째, 사업체 위주로 자산을 구성해보세요.** 이번 게임에서 부동산 비중이 컸다면, 다음엔 PC 게임방·세탁소·도넛 프랜차이즈 같은 사업체 카드를 의도적으로 매수해보세요. 부동산보다 카드 수가 적고 착수금이 높아서 매수 기회가 적지만, 한 번 잡으면 큰 현금흐름을 만들어요.

**셋째, 일부러 "꼭 사시오" 카드(132% ROI, 150% ROI)가 안 나왔을 때 어떻게 자산을 만드는지** 시도해보세요. 행운에 의존하지 않는 자산 운용 능력을 키울 수 있어요.

마지막으로 한 가지만 더. 이번 게임의 성공은 분명 박수받을 만하지만, **시간이 지나서 돌이켜보면 "아 그때 이런 결정도 한번 해볼 걸 그랬구나" 싶은 순간**도 있을 거예요. 그게 바로 다음 단계로 가는 신호예요. 캐쉬플로우는 한 번 잘 한 사람보다 **여러 번 다양하게 해본 사람**이 진짜 감각을 익히는 게임이거든요.`;
    },
  },

  OPTIMISTIC_EXPLORER: {
    diagnosis: (m, name) => {
      const utilization = Math.round(m.utilizationRate * 100);
      const peText = m.peRatio.toFixed(1);
      const stockText = m.stockBoldness.level !== 'NONE'
        ? `주식도 평균 ${m.stockBoldness.avgShares}주 정도로 매수하셨고, `
        : '주식은 매수하지 않으셨고, ';
      const goodDealText = m.goodDealStats.encountered > 0
        ? `"꼭 사시오" 카드 ${m.goodDealStats.encountered}건 중 ${m.goodDealStats.bought}건만 매수하시고 나머지는 망설이신 패턴`
        : `큰 현금흐름 카드를 만났을 때 망설이신 패턴`;

      return `${name}님은 이번 게임에서 **매수를 ${m.buyCount}건 시도**하셨고, 활용률 **${utilization}%**로 적극적으로 카드 기회를 살펴보셨어요. 그런데 흥미로운 건, 이렇게 활발하게 움직이셨는데도 **쥐경주 탈출에는 이르지 못하셨다**는 점이에요. P/E Ratio **${peText}**로, 패시브 인컴이 월 지출의 절반 수준에서 멈춰 있어요.

게임 내내 의사결정 패턴을 보면, **위기 카드가 떠도 큰 충격 없이 넘어가셨고**, 충동 매매도 거의 없으셨어요. 자산 손실 없이 안전하게 운영하셨다는 뜻이에요. ${stockText}매수 결정에 큰 흔들림 없이 차분하게 다음 턴을 이어가셨네요.

다만 자세히 보면, 매수하신 자산들이 **현금흐름이 작은 카드들 위주**였어요. 예를 들어 월 +$100~$200 정도 나오는 안전한 카드들은 매수하셨지만, **월 +$500 이상의 큰 현금흐름 카드(좋은 매물 카드, 다가구 주택 등)를 만났을 때는 ${goodDealText}**이 보여요. 그래서 자산 클래스는 **${m.assetClasses}개**로 다양했지만, 각각의 임팩트가 작아서 합쳐도 큰 흐름이 만들어지지 않은 거예요.`;
    },

    meaning: (m, name) => {
      return `이 페르소나는 캐쉬플로우 코칭 현장에서 **자주 보이는 유형**이에요. 학습 의지도 높고 게임도 즐기시는데, 결과가 잘 안 나오는 경우. 특징은 "**잘못한 게 아닌데 결과가 미흡한**" 상태라는 점이에요. 보통 위기에 약한 분들은 결과도 나쁘고 마음도 불안한데, ${name}님은 **마음은 정말 평안한 상태**예요. 그게 이 페르소나의 장점이자 동시에 **변화를 가로막는 벽**이기도 해요.

부자아빠 책에서 강조하는 "**현금흐름 = 자유**"라는 메시지를 떠올려보면, 안정적이지만 정체된 상태가 사실은 **"천천히 후퇴하는 자유"**일 수 있어요. 인플레이션이 매년 자산의 가치를 깎아먹는 현실에서, 자산이 정체되어 있다는 건 사실 줄어들고 있다는 뜻이거든요.

한 가지 위로드릴 게 있어요. **이 패턴을 이미 인지하셨다는 것 자체**가 큰 변화의 출발점이에요. 많은 사람들이 게임 결과를 보면서도 "재미있었네" 하고 넘어가는데, 이 디브리핑을 읽고 계신다는 건 이미 한 발 다른 곳을 보고 계신 거예요.`;
    },

    nextStep: (m, name) => {
      return `${name}님께 가장 효과적인 건 **"구체적인 수치 목표"**를 정하고 시작하시는 거예요. 추상적인 "잘 해야지"가 아니라, **숫자로 정의된 미션**이 안전 영역을 벗어나는 동력을 만들어줍니다.

몇 가지 구체적인 미션을 제안드리면:

**첫째, "패시브 인컴 $1,000 미션"이에요.** 이번 게임이 끝났을 때 패시브 인컴이 얼마였는지 확인해보세요. 만약 $400 정도였다면, 다음 게임의 목표는 무조건 **$1,000 이상 도달**로 잡으세요. 그러려면 작은 카드 5개보다 큰 카드 1~2개가 효율적이라는 걸 자연스럽게 깨닫게 됩니다.

**둘째, "좋은 매물 카드는 무조건 매수" 규칙이에요.** SMALL DEAL의 132% ROI, 150% ROI 카드는 이름 그대로 "꼭 사시오"라고 적혀 있어요. 현금이 부족하면 대출을 받아서라도 사야 하는 카드들이거든요. 이런 카드를 한 번이라도 매수해보시면, **"좋은 빚"이 무엇인지 직접 체감**하실 수 있어요. Kevin 강사님이 5,000번 넘는 코칭에서 가장 많이 짚으시는 깨달음의 순간이 바로 이 카드예요.

**셋째, "큰 한 방"을 한 번 시도해보세요.** 4가구·8가구 주택이나 사업체 카드는 착수금이 큰 만큼 부담스럽지만, 한 번 매수하면 월 $1,000 이상의 현금흐름을 만들어요. 이런 큰 거래를 한 번 경험하시면 작은 카드들의 한계가 명확하게 보입니다.

캐쉬플로우 게임은 **여러 번 해보면서 감각이 쌓이는 게임**이에요. 이번 게임의 안정성을 잃지 않으면서도, 다음에는 한 발 더 나아가보세요. 안전하게 정체되는 것보다 **"위험을 안고 성장하는 패턴"**을 한 번 경험해보시는 게 다음 단계로 가는 다리가 될 거예요.`;
    },
  },

  ANXIOUS_ACHIEVER: {
    diagnosis: (m, name) => {
      const peText = m.peRatio.toFixed(1);
      const wealthText = m.wealthMultiple.toFixed(1);
      const inconsistency = Math.round((1 - m.consistencyRate) * 100);
      const impulsiveCount = Math.round(m.impulsiveTradeScore * m.sellCount * 3); // 추정치
      const crisisText = m.crisisResponse.encountered > 0
        ? `${m.crisisResponse.encountered}건의 위기 카드 후 ${m.crisisResponse.encountered - m.crisisResponse.calmResponse}건은 즉각적인 자산 처분으로 대응`
        : '위기 카드는 등장하지 않았';

      return `${name}님은 이번 게임에서 결과적으로 **좋은 재무 성과**를 만드셨어요. 매수 결정 **${m.buyCount}건**으로 적극적으로 자산을 쌓으셨고, P/E Ratio **${peText}**로 쥐경주 탈출 조건에 가까이 가셨거나 이미 도달하셨네요. 순자산도 시작 시점 대비 **${wealthText}배** 성장을 이루셨어요.

그런데 게임 진행 과정을 자세히 들여다보면, 결과 뒤에 **상당한 심리적 동요**가 있었던 것 같아요. 매수 후 **${m.sellCount}건이 매도**로 이어졌는데, 그중 일부는 짧은 시간 안에 결정을 번복하셨다는 뜻이에요. 또 ${crisisText}하셨네요.

결정 일관성도 살펴봤어요. 비슷한 종류의 카드가 여러 번 나왔을 때 매번 다른 결정을 하신 비율이 **${inconsistency}%**였어요. 예를 들어 처음 콘도 카드가 떴을 때는 매수, 두 번째는 패스, 세 번째는 다시 매수 같은 패턴이요. **결과는 좋았지만 그 과정이 매끄럽지 않았던** 게임이었어요.`;
    },

    meaning: (m, name) => {
      return `이 페르소나의 가장 큰 특징은 "**성과는 나는데 과정이 힘든**" 상태예요. 캐쉬플로우 코칭 현장에서 보면, 이 유형의 분들은 보통 **결과 지향이 강하고 책임감도 높지만, 동시에 손실에 대한 두려움도 큰** 분들이에요. 그래서 매수도 매도도 빠르고, 위기가 오면 즉각 대응하시죠.

사실 캐쉬플로우 게임에서 이런 패턴은 **"좋은 결과의 함정"**이 될 수 있어요. 결과가 좋으니까 자기 패턴이 옳다고 믿게 되거든요. 그런데 실제로는 **운이 좋아서 결과가 났을 가능성**도 함께 고려해봐야 해요. 같은 패턴으로 게임을 5번 더 한다면, 이번처럼 좋은 결과가 매번 나올까요?

부자아빠가 강조하는 핵심 중 하나는 "**감정이 아니라 데이터로 결정한다**"는 점이에요. 빠른 매매와 즉각적인 위기 대응은 감정에서 나오는 결정인 경우가 많아요. 결과는 잘 나왔어도, 매번 그 결정의 순간마다 마음이 흔들리셨을 거예요. 그게 누적되면 게임이 끝났을 때 **"잘했다"는 만족감보다 "휴 다행이다"라는 안도감**이 더 큰 상태가 됩니다.`;
    },

    nextStep: (m, name) => {
      return `${name}님께 권해드리고 싶은 건 **"감정 결정"을 줄이고 "규칙 기반 결정"을 늘리는 연습**이에요. 결과의 질은 유지하되, 그 과정의 흔들림을 줄이는 거죠.

몇 가지 구체적인 규칙을 제안드리면:

**첫째, "비상금 비율 20% 규칙"이에요.** 매수하기 전에 항상 "이 매수 후에도 현금이 전체 자산의 20% 이상 남는가?"를 확인하세요. 그렇지 않으면 그 매수는 패스. 이 규칙 하나만 있어도 위기 카드가 떴을 때 패닉성 매도를 안 하셔도 돼요. **이미 비상금이 있으니까요.**

**둘째, "매수 후 3턴은 보유" 규칙이에요.** 매수하신 자산은 최소 3턴(현실 6년)은 보유해보세요. 자주 사고팔면 거래 비용(현실에서는 세금·중개수수료)이 누적되고, 자산이 진짜 가치를 발휘할 시간이 부족해요. 부동산은 특히 보유 기간이 길수록 임대 수입이 누적되거든요.

**셋째, "위기 카드 후 한 턴 관망" 규칙이에요.** 인플레이션이나 국제 금융 위기 카드가 떴을 때, 즉시 대응하지 마시고 **한 턴은 그냥 지나가보세요.** 게임 내 메커니즘을 보면, 이런 위기 카드는 정해진 영향 외에 추가 손실을 일으키지 않아요. 즉각 매도해서 손실을 키우는 경우가 더 많아요.

마지막으로 한 가지 권해드리면, **다음 게임을 시작하기 전에 "이번에는 어떤 결정 원칙을 시험해볼지" 미리 정하고 시작**하세요. 그리고 게임이 끝난 후 **그 원칙을 얼마나 지켰는지 스스로 평가**해보시면, 결과보다 의사결정의 질이 높아지는 게 보일 거예요. 좋은 결과는 좋은 의사결정의 부산물이지, 그 반대가 아니거든요.`;
    },
  },

  SENSITIVE_CHALLENGER: {
    diagnosis: (m, name) => {
      const turnover = Math.round(m.turnoverRate * 100);
      const peText = m.peRatio.toFixed(1);
      const stockText = m.stockBoldness.level === 'TIMID'
        ? `주식도 평균 ${m.stockBoldness.avgShares}주로 매우 적은 수량만 매수하셔서, 게임을 처음 해보시는 분들에게서 자주 보이는 패턴이 나타났어요`
        : '';
      const loanText = m.doodadLoanCount > 0
        ? `DOODAD 카드 때문에 추가 대출이 발생한 게 **${m.doodadLoanCount}회**였어요. 이건 현금 흐름 관리가 빡빡했다는 신호예요. 매수에 자금을 많이 쓰셔서 예비 자금이 부족했던 거죠.`
        : '';

      return `${name}님은 이번 게임에서 **매수를 ${m.buyCount}건 시도**하셨고, 그중 **${m.sellCount}건은 다시 매도**하셨어요. 자산 회전율 **${turnover}%**로 활발하게 움직이셨네요. 그런데 결과를 보면, P/E Ratio **${peText}**로 쥐경주 탈출에는 이르지 못하셨고, 순자산도 큰 성장을 이루지 못했어요. ${stockText}

게임 진행 패턴을 보면, **결정의 흐름이 일관되지 않았던 것**이 가장 두드러져요. 비슷한 종류의 카드인데 정반대 결정을 하시거나, 위기 카드 후 큰 폭의 매도 같은 패턴이 보여요. **시장 상황과 다른 사람의 행동에 따라 결정이 자주 바뀌신 것** 같아요.

${loanText} 종합하면, 활발하게 시도는 했지만 **자신만의 기준이 아직 정립되지 않은 상태**로 게임이 진행됐어요.`;
    },

    meaning: (m, name) => {
      return `이 페르소나는 **"학습의 한가운데"** 있는 상태예요. 절대 부정적인 게 아니에요. 캐쉬플로우 게임이 가르치려는 가장 중요한 메시지 중 하나가 "**어떤 결정이든 스스로 내릴 수 있는 능력**"인데, 그 능력은 처음부터 완성되지 않거든요. **여러 번 흔들려보면서 자신만의 기준이 생기는 거예요.**

사실 캐쉬플로우 게임은 **5,000번 넘는 코칭에서도 첫 번째 게임에서 좋은 결과가 나오는 경우가 드물어요**. 처음 게임을 하면 카드 의미도 헷갈리고, 보드 위치도 익숙하지 않고, 다른 사람의 결정에 휘둘리기 쉽거든요. ${name}님이 이번에 보여주신 흔들림은 사실 **"열심히 했다는 증거"**이기도 해요. 패스만 하고 가만히 있었다면 흔들리지도 않았을 테니까요.

Kevin 강사님이 늘 강조하시는 말씀이 있어요. "**우리는 늘 최선의 선택을 하려고 노력하다가 기회를 놓치기도 한다. 하지만 때론 최선의 선택이 아니었지만, 시간이 지나고 보면 그게 최선의 선택이었구나 하며 뒤돌아 볼 수 있다.**" 이번 게임의 흔들림 중에는 분명 그런 결정도 있었을 거예요. 지금은 후회되지만 시간이 지나면 그 경험 덕분에 다음 결정이 단단해지는, 그런 결정이요.`;
    },

    nextStep: (m, name) => {
      return `${name}님께 가장 효과적인 건 **"단순한 규칙 하나"**부터 시작하는 거예요. 여러 가지를 한꺼번에 잘하려고 하지 마시고, **한 가지에 집중**하는 게 다음 단계로 가는 가장 빠른 길이에요.

몇 가지 단순한 규칙을 제안드리면:

**첫째, "월 현금흐름 +$200 이상 카드만 매수" 규칙이에요.** 이 규칙 하나만 있어도 결정이 많이 단순해져요. 카드가 나오면 현금흐름만 보고 결정. +$200 이상이면 매수, 미만이면 패스. 이렇게 단순한 기준 안에서 게임을 끝까지 진행해보세요. 결과가 어떻든, **한 가지 원칙을 지키는 경험**이 다음 게임의 출발점이 됩니다.

**둘째, "다른 사람 결정 신경 쓰지 않기" 규칙이에요.** 게임 중에 다른 플레이어가 무엇을 사는지, 어떤 결정을 하는지 보지 마세요. 오로지 내 카드와 내 자금만 보고 결정하세요. 다른 사람의 성공이 내 결정의 기준이 되면 안 되거든요. **각자 처한 상황이 다르기 때문**이에요.

**셋째, "비상금 $500 유지" 규칙이에요.** ${m.doodadLoanCount > 0 ? 'DOODAD 카드 때문에 추가 대출이 났던 건 예비 자금 부족 때문이에요. ' : ''}매수할 때 항상 현금 $500 이상은 남겨두세요. 그러면 갑작스런 지출이 와도 흔들리지 않게 됩니다.

그리고 한 가지 정말 중요한 말씀을 드리고 싶어요. **캐쉬플로우 게임을 3~5번 정도 더 해보시면**, 흔들림이 자연스럽게 줄어드는 걸 직접 느끼실 거예요. 첫 게임의 흔들림은 누구에게나 있어요. 중요한 건 **이번 게임에서 무엇이 흔들렸는지 인지하셨다는 것**이고, 다음 게임에서는 그 부분을 의식하면서 진행해보실 수 있다는 거예요. **흔들림은 약점이 아니라, 자신의 성향을 알아가는 과정**이에요.`;
    },
  },

  STRATEGIC_BUILDER: {
    diagnosis: (m, name) => {
      const peText = m.peRatio.toFixed(1);
      const leverage = Math.round(m.leverageRatio * 100);
      const consistency = Math.round(m.consistencyRate * 100);
      const realEstateBuys = Math.round(m.assetClassRatio.realEstate * m.buyCount);
      const inflationProofText = m.hasInflationProof
        ? '\n\n특히 BIG DEAL #4 "대출 없는 완벽한 집"(올캐시 매입 $60K)을 보유하셨다는 점이 인상적이에요. 이 카드는 인플레이션 카드의 영향에서 면제되는 유일한 자산이거든요. 이런 안전 자산을 포트폴리오에 넣어두신 건 위기 대응까지 고려한 깊이 있는 전략이라는 신호예요.'
        : '';

      return `${name}님은 이번 게임에서 **매수는 ${m.buyCount}건으로 신중하셨지만**, 한 번 한 번이 묵직했어요. 작은 카드들을 여러 번 사기보다 큰 카드 몇 장에 집중하셨어요. 그 결과, 사업체 **${m.businessCount}건**, 부동산 **${realEstateBuys}건**을 보유하면서 P/E Ratio **${peText}**로 쥐경주 탈출 또는 그에 가까운 성과를 이루셨어요.

가장 인상적인 건 **레버리지 활용**이에요. 평균 레버리지 비율 **${leverage}%**로, 자기 자본보다 훨씬 큰 자산을 운용하셨어요. 예를 들어 8가구 주택은 가격이 $200,000인데 착수금은 $40,000(20%)만 내고 나머지는 은행 대출로 매수하는 카드인데, 이런 카드들을 적극적으로 활용하셨네요. **부자아빠가 강조하는 "좋은 빚"의 정의에 가장 가까운 플레이**였어요.

위기 대응 측면에서도 침착하셨어요. 결정 일관성도 **${consistency}%**로 높았어요. 적게 움직였지만 움직일 때마다 확신을 갖고 행동하신 거죠.${inflationProofText}`;
    },

    meaning: (m, name) => {
      return `이 페르소나는 **부자아빠 코칭에서 가장 권장하는 자산 운용 방식**에 가까워요. "**좋은 빚을 활용해서 큰 자산을 만들고, 그 자산이 더 큰 현금흐름을 만든다**"는 사이클을 직접 보여주신 거니까요. 매수 빈도가 적다는 건 **신중하다는 뜻이지 소극적이라는 뜻이 아니에요**. 한 번 결정할 때 충분히 분석하고, 그 분석에 확신이 있을 때만 움직이는 패턴이거든요.

그런데 한 가지 꼭 짚고 넘어가고 싶은 게 있어요. **이 방식의 약점도 함께 인지하셔야 해요**. 대출 비중이 높은 자산은 **인플레이션이나 이자율 폭등 같은 외부 충격에 가장 크게 흔들립니다**. 이번 게임에서 그런 카드가 안 떴거나, 떴어도 운 좋게 비켜갔을 수 있어요. 만약 인플레이션 카드가 떴는데 그때 보유하신 자산이 모두 대출로 산 3/2 주택이었다면, **순식간에 자산의 큰 부분을 잃을 수도 있었어요**.

2008년 서브프라임 모기지 사태가 정확히 이 시나리오였어요. 무리한 대출로 집을 산 사람들이 이자율이 오르자 도미노처럼 무너졌거든요. 캐쉬플로우 게임의 인플레이션 카드는 이 사태를 정확히 재현한 거예요. 한 가지 흥미로운 점은, **같은 3/2 주택이라도 "대출 없는 완벽한 집"(BIG DEAL의 올캐시 매입 카드)은 이 카드의 영향에서 면제된다는 점**이에요.${m.hasInflationProof ? ' 그래서 이 카드를 보유하신 ' + name + '님의 전략이 더 의미 있어요.' : ''}`;
    },

    nextStep: (m, name) => {
      return `${name}님의 전략은 이미 매우 효과적이지만, **외부 충격에 대한 회복탄력성**을 추가하면 더 단단한 자산 운용이 가능해져요. 큰 한 방의 매력만큼 큰 충격에 대비하는 안전장치를 같이 가져가는 거죠.

몇 가지 구체적인 시도를 제안드리면:

**첫째, "현금 보유 비중 20% 룰"이에요.** 아무리 좋은 매수 기회가 와도 전체 자산의 20%는 현금으로 남겨두세요. 인플레이션 카드가 떠서 일부 자산을 잃어도 이 현금이 있으면 다시 일어설 여력이 생깁니다. 부동산과 사업체에 모든 자금을 다 넣지 마시고, 항상 일정 비중은 유보하세요.

${m.hasInflationProof
  ? '**둘째, "올캐시 자산을 한 종류 더 추가" 시도예요.** 이미 BIG DEAL #4를 보유하고 계시지만, 다음 게임에서는 다른 자산도 일부는 올캐시로 매입해보세요. 다양한 자산 클래스에 면역력을 분산시키면 더 견고한 포트폴리오가 됩니다.'
  : '**둘째, "한 번은 올캐시 매수" 시도예요.** SMALL DEAL의 "대출 없는 완벽한 집"(BIG DEAL #4) 카드가 나오면, 다른 매수 기회를 미루더라도 이 카드를 매수해보세요. 이 카드는 인플레이션 카드의 면역력을 갖춘 유일한 자산이에요. 포트폴리오 안에 **"위기에도 흔들리지 않는 자산" 하나**를 넣어두면 전체의 안정성이 크게 올라가요.'
}

**셋째, "매수 전 최악 시나리오 한 번 떠올리기" 습관이에요.** 큰 매수 직전에 "지금 이걸 사고 나서 다음 턴에 인플레이션 카드가 뜨면?"을 한 번 생각해보세요. 그래도 감당할 수 있는 매수면 진행, 감당이 어려우면 잠시 보류. 이 한 박자가 충동적인 큰 베팅을 거르는 안전장치가 됩니다.

마지막으로 한 가지 더. ${name}님처럼 큰 한 방을 노리는 분들은 **다른 직업으로도 같은 전략이 통하는지** 시험해보시면 좋아요. 만약 이번에 비즈니스 매니저처럼 현금흐름이 큰 직업으로 게임하셨다면, 다음엔 시작 자금이 적은 직업으로 한번 도전해보세요. 자원이 제한된 상황에서도 같은 전략이 통하는지 확인하는 거예요. **진짜 강한 전략은 어떤 조건에서도 통하는 전략**이거든요.`;
    },
  },

  ACTIVE_RISK_TAKER: {
    diagnosis: (m, name) => {
      const turnover = Math.round(m.turnoverRate * 100);
      const peText = m.peRatio.toFixed(1);
      const stockText = m.stockBoldness.level === 'BOLD' || m.stockBoldness.level === 'AGGRESSIVE'
        ? `\n\n주식 매수에서도 대담함을 보여주셨네요. **평균 ${m.stockBoldness.avgShares}주, 최대 ${m.stockBoldness.maxShares}주**까지 한 번에 매수하셨어요. 이런 큰 베팅은 결과가 좋으면 자산을 빠르게 키우지만, 동시에 **잘못된 베팅 한 번이 큰 손실**로 이어질 수도 있어요.`
        : '';
      const impulsiveCount = Math.round(m.impulsiveTradeScore * m.sellCount * 3);

      return `${name}님은 이번 게임에서 **매수 ${m.buyCount}건과 매도 ${m.sellCount}건**으로 자산 회전율 **${turnover}%**의 매우 활발한 매매 패턴을 보여주셨어요. 한 자리에 머물기보다 끊임없이 움직이는 스타일이었네요. 그 결과 P/E Ratio **${peText}**로 쥐경주 탈출 조건에 가까이 가셨거나 도달하셨어요.

결과는 좋았는데, 그 과정의 패턴을 보면 **결정 속도가 매우 빠르고**, **매수 후 짧은 시간 안에 매도로 전환**하는 경우가 많았어요. 매수 후 1턴 이내 매도 같은 즉각적인 결정 변경이 있었네요.

위기 카드가 떴을 때도 즉각적으로 대응하셨어요. 위기 카드가 뜨면 바로 자산 처분, 매수 기회가 오면 바로 매수. 한 호흡 쉬는 패턴이 거의 없었어요. **분석보다 직감으로 움직이는 경향**이 강하셨고, 그래서 자산 변동 폭도 컸지만 결과적으로는 좋은 흐름을 만드셨어요.${stockText}`;
    },

    meaning: (m, name) => {
      return `이 페르소나의 가장 큰 특징은 **"행동력이 강점이자 약점"**이라는 점이에요. 빠른 의사결정과 적극적인 매매는 분명 자산을 빠르게 키우는 동력이 돼요. 캐쉬플로우 게임 같은 시뮬레이션에서는 특히 효과적이죠. 짧은 시간 안에 많은 카드를 만나니까, 빠르게 움직일수록 더 많은 기회를 잡을 수 있거든요.

그런데 **현실의 자산 시장은 게임보다 훨씬 느리게 움직여요**. 부동산을 사고 1년 만에 파는 건 거래 비용(취득세·양도세·중개수수료)이 누적되어서 수익성이 크게 떨어져요. 주식도 단기 매매를 반복하면 거래 수수료와 세금이 누적돼서 장기 보유자보다 수익이 적어지는 경우가 많아요. **게임에서 통한 빠른 회전 전략이 현실에서는 오히려 부의 누수**를 만들 수 있다는 거예요.

또 한 가지, 빠른 결정은 **"분석을 건너뛰는"** 결정이 되기 쉬워요. 이번 게임에서 결과가 좋았던 건 운이 좋아서 그 직감이 맞았을 가능성도 있어요. 같은 패턴으로 5번 더 게임을 한다면, 매번 좋은 결과가 나올까요? **반복 가능한 전략**과 **운에 의존한 전략**은 결과가 같아 보여도 본질이 다르거든요. 부자아빠가 강조하는 건 "감각이 아니라 시스템"이에요.`;
    },

    nextStep: (m, name) => {
      return `${name}님께 권해드리고 싶은 건 **"속도를 늦추는 연습"**이에요. 행동력은 그대로 유지하되, 그 행동에 한 박자의 사고를 끼워 넣는 거죠.

몇 가지 구체적인 시도를 제안드리면:

**첫째, "결정 전 3가지 질문" 습관이에요.** 매수든 매도든 결정 전에 세 가지를 자문해보세요. (1) 이 자산이 매달 얼마의 현금흐름을 만드는가? (2) 이 매수/매도 후에 내 현금이 얼마 남는가? (3) 다음 턴에 인플레이션 카드가 뜨면 이 결정이 어떻게 될까? 이 세 가지만 한번 떠올려도 충동적인 결정이 절반은 걸러져요.

**둘째, "매수 후 3턴 보유" 규칙이에요.** 매수하신 자산은 최소 3턴(현실 6년)은 보유해보세요. 자산은 시간이 지나면서 진짜 가치를 발휘해요. 부동산은 임대 수입이 누적되고, 사업체는 사업 가치가 성장하거든요. 회전 자체가 목적이 되면 안 돼요.

**셋째, "한 게임에 한 가지만" 실험이에요.** 다음 게임에서는 한 가지 자산 클래스(예: 부동산만)에 집중해보세요. 매수도 매도도 부동산 안에서만. 자산을 다양하게 회전시키는 대신 한 가지를 깊이 있게 운영해보는 거예요. 그러면 자산 회전이 어떻게 임대 수입의 누적을 방해하는지 직접 느끼실 수 있어요.

마지막으로 한 가지. ${name}님의 행동력은 **분명한 강점이에요**. 많은 사람들이 결정을 미루다가 기회를 놓치는데, ${name}님은 그 반대니까요. 다만 그 행동력이 **"빠른 회전"이 아니라 "확신 있는 큰 결정"으로 방향을 바꾸면**, 같은 에너지로 훨씬 큰 결과를 만드실 수 있어요. 빠르게 많이 사고팔기보다, **한 번에 큰 결정을 내리고 오래 보유**하는 패턴 — 이게 다음 단계예요.`;
    },
  },

  SAFE_HAVEN_KEEPER: {
    diagnosis: (m, name) => {
      const utilization = Math.round(m.utilizationRate * 100);
      const peText = m.peRatio.toFixed(1);
      const cashRatio = Math.round(m.cashRatio * 100);
      const stockCount = Math.round(m.assetClassRatio.stock * m.buyCount);
      const realEstateCount = Math.round(m.assetClassRatio.realEstate * m.buyCount);
      const goodDealText = m.goodDealStats.encountered > 0
        ? `${m.goodDealStats.encountered}건 중 ${m.goodDealStats.bought}건만 매수`
        : '카드가 등장하지 않았';

      return `${name}님은 이번 게임에서 **매수 시도가 ${m.buyCount}건**에 그치셨고, 활용률 **${utilization}%**로 대부분의 매수 기회를 패스하셨어요. 매수보다 패스가 압도적으로 많았던 게임이었네요. 그 결과 P/E Ratio **${peText}**로 패시브 인컴은 작은 수준에서 멈춰 있어요.

게임 내내 보여주신 패턴을 보면, **현금이 차곡차곡 쌓이는 동안 자산은 거의 늘지 않았어요**. 게임 종료 시 현금 보유 비중 **${cashRatio}%**로 매우 안전한 상태였습니다. 자산이 부동산 **${realEstateCount}건**, 주식 **${stockCount}건** 정도로 작은 규모였고, 사업체는 ${m.businessCount > 0 ? m.businessCount + '건 보유하셨어요' : '보유하지 않으셨네요'}.

흥미로운 건 **"좋은 매물 카드"를 만났을 때의 패턴**이에요. SMALL DEAL의 132% ROI, 150% ROI 카드 같은 명백히 매력적인 카드가 ${goodDealText}하셨어요. "꼭 사시오"라고 적혀 있는 카드도 망설이고 패스하신 거죠. 위기 카드가 떠도 영향이 없었던 건 이 보수성의 결과였지만, 그만큼 성장의 기회도 흘려보내신 거예요.`;
    },

    meaning: (m, name) => {
      return `이 페르소나의 가장 큰 특징은 **"안전함과 정체"가 동시에 있는** 상태라는 점이에요. 현금을 모으는 건 절대 잘못된 게 아니에요. 오히려 **재무의 가장 든든한 기초**거든요. 갑작스런 지출이 와도 흔들리지 않고, 위기 카드가 떠도 영향이 없어요. 그게 안정성의 가치예요.

그런데 **인플레이션이 매년 자산의 가치를 깎아먹는 현실**에서, 자산이 정체되어 있다는 건 사실 줄어들고 있다는 뜻이에요. 게임에서는 시간이 빠르게 지나가서 잘 안 보이지만, 현실에서 30년이 지나면 같은 $1,000도 가치가 절반 이하로 떨어질 수 있어요. **현금만 모으는 건 "천천히 후퇴하는 자유"**일 수 있다는 거죠.

부자아빠 책에서 가장 강조하는 메시지 중 하나가 "**자산이 일하게 하라**"예요. 현금은 지갑 안에서 가만히 있는 한 일하지 않아요. 자산으로 바꿔야 매달 현금흐름을 만들어내거든요. 이번 게임에서 매수 기회를 패스하실 때마다, 그 기회는 다른 누군가의 현금흐름이 됐어요. **기회비용**이라고 부르는 게 그거예요.

한 가지 위로드릴 게 있어요. 이 패턴은 **신중함의 또 다른 모습**이에요. 잘못된 결정으로 잃을 위험이 큰 사람일수록 보수적이 되는 건 자연스러운 반응이거든요. 다만 그 신중함이 너무 강해지면, **결정하지 않는 것이 가장 위험한 결정**이 되는 순간이 와요.`;
    },

    nextStep: (m, name) => {
      return `${name}님께 권해드리고 싶은 건 **"안전한 본진을 유지하면서 작은 도전을 분리"**하는 방식이에요. 모든 자산을 한꺼번에 적극적으로 운용하지 말고, 일부만 따로 떼어 실험해보는 거죠.

몇 가지 구체적인 시도를 제안드리면:

**첫째, "10~20% 성장 자산 분리" 규칙이에요.** 다음 게임에서는 게임 시작 시점에 "전체 자산의 10~20%는 적극적인 매수에 사용한다"고 정해두세요. 나머지 80~90%는 평소처럼 안전하게 보유하시고, 그 작은 영역 안에서만 적극적으로 행동하시는 거예요. 안전한 본진은 그대로 두니까 전체 위험은 크지 않아요. **하지만 그 작은 영역의 자산이 만들어낼 현금흐름은 분명한 차이를 만들어줍니다.**

**둘째, "좋은 매물 카드는 무조건 매수" 규칙이에요.** SMALL DEAL의 132% ROI, 150% ROI 카드는 이름 그대로 "꼭 사시오"라고 적혀 있어요. 현금이 부족하면 대출을 받아서라도 사야 하는 카드들이거든요. Kevin 강사님이 12년간 5,000번 넘게 코칭하시면서 가장 자주 짚으시는 깨달음의 순간이 바로 이 카드예요. **현금 없이 대출만으로 산 자산이 매달 현금흐름을 만들어내는 경험** — 이걸 한 번 해보시면 "좋은 빚"이 무엇인지 직접 체감하실 수 있어요.

**셋째, "낮은 착수금 카드부터" 시작 규칙이에요.** 큰 매수가 두려우시다면, SMALL DEAL의 "낮은 착수금" 카드(주택 3/2 #7, #8)부터 시작해보세요. 착수금 $3,000으로 월 $100~$120의 현금흐름을 만드는 작은 매수예요. 잃어도 큰 타격이 없는 규모니까 부담 없이 시도할 수 있어요. 하지만 그 한 번의 매수가 **노동 수입을 자본 수입으로 바꾸는 첫 경험**이 됩니다.

마지막으로 한 가지. ${name}님의 안정성은 분명한 **강점**이에요. 위기에 흔들리지 않는 마음이 있으시거든요. 다만 그 안정성이 **"행동하지 않는 핑계"**가 되지 않도록, 다음 게임에서는 한 번만 다른 시도를 해보세요. **작은 한 발이 시작이에요.** 그 작은 시도가 잘 되면 그게 다음의 더 큰 시도로 이어지고, 결국 안전과 성장이 함께 가는 패턴이 만들어집니다.`;
    },
  },

  DILIGENT_SAVER: {
    diagnosis: (m, name) => {
      const cashRatio = Math.round(m.cashRatio * 100);
      const peText = m.peRatio.toFixed(1);
      const stockText = m.stockBoldness.level === 'TIMID'
        ? `\n\n주식을 매수하실 때도 평균 **${m.stockBoldness.avgShares}주**로 매우 적은 수량만 매수하셨어요. 캐쉬플로우 게임을 처음 해보시는 분들에게서 가장 자주 보이는 패턴이에요. **"혹시 잃으면 어쩌지?" 하는 마음**이 자연스럽게 작은 수량으로 이어지거든요.`
        : (m.stockBoldness.level === 'NONE' ? '\n\n주식은 한 번도 매수하지 않으셨네요. 이것도 신중함의 한 모습이에요.' : '');
      const loanText = m.doodadLoanCount > 0
        ? `또 게임 진행 중에 DOODAD 카드 때문에 추가 대출이 발생한 것도 **${m.doodadLoanCount}회** 있었어요. 이건 보유 현금이 충분하지 않았던 순간이 있었다는 뜻이에요.`
        : '';

      return `${name}님은 이번 게임에서 **매수 시도가 ${m.buyCount}건**에 그치셨어요. 게임 내내 현금이 차곡차곡 쌓였고, 게임 종료 시 현금 보유 비중 **${cashRatio}%**로 매우 안전한 상태였습니다. 부채도 거의 없으셨고, 위기 카드가 떠도 직접적인 피해는 없었어요. **준비를 정말 단단히 하신 게임**이었어요.${stockText}

그런데 결과를 보면, P/E Ratio가 **${peText}**로 패시브 인컴이 거의 만들어지지 않은 상태예요. 자산도 매우 적게 보유하셨고, 사업체나 임대 부동산 같은 현금흐름 자산은 거의 없으셨어요. ${loanText}

종합하면, **노동 수입(월급)에서 자본 수입(자산이 만드는 현금흐름)으로 전환되는 단계에 아직 도달하지 못하신 상태**예요. 매수 결정 자체가 적었기 때문에, 자본 수입을 만들 자산이 부족한 거죠. 안전하지만 정체된, 그리고 가끔 흔들리는 패턴이었어요.`;
    },

    meaning: (m, name) => {
      return `이 페르소나는 캐쉬플로우 게임을 처음 접하시는 분들에게서 **가장 흔하게 나타나는 유형**이에요. 게임 자체가 익숙하지 않고, 카드 의미도 헷갈리고, 매수 결정의 결과가 어떻게 될지 예측하기 어려우니까 자연스럽게 보수적이 되거든요. 그래서 "**준비 중인 학습자**"라는 표현이 정확해요. 잘못된 게 아니라, **아직 시작점에 있는** 거예요.

다만 한 가지 꼭 짚고 넘어가고 싶은 게 있어요. 캐쉬플로우 게임이 가르치려는 핵심 메시지 중 하나가 "**노동 수입에서 자본 수입으로의 전환**"인데, 현금만 모으는 패턴으로는 이 전환이 일어나지 않아요. **현금은 일하지 않거든요.** 매달 월급을 받아서 모으기만 하면, 일을 그만두는 순간 수입도 멈춰요. 자산이 일하게 만들어야 일을 그만둬도 수입이 계속 들어오는 거예요. 그게 부자아빠가 말하는 "**자유**"의 본질이에요.

${m.doodadLoanCount > 0
  ? '또 하나, DOODAD 카드 때문에 추가 대출이 발생한 건 의미 있는 신호예요. **현금만 모았는데도 가끔 흔들렸다**는 뜻이거든요. 이건 현금만 가지고 있는 게 안전하지 않을 수 있다는 걸 보여줘요. 인플레이션 같은 외부 요인 외에도, 갑작스런 지출이 누적되면 현금이 부족해질 수 있다는 거죠. **현금흐름을 만들어내는 자산이 있으면 이런 순간에 더 강해져요.**'
  : '한 가지 흥미로운 점은, 현금만 모으는 패턴은 단기적으로는 안전해 보이지만, 인플레이션이 누적되면 결국 자산 가치가 줄어든다는 거예요. **현금흐름을 만들어내는 자산이 있어야 진짜 안전**해진다는 게 부자아빠의 핵심 메시지 중 하나예요.'
}

한 가지 위로드릴 게 있어요. 이 패턴을 **이미 인지하셨다는 것 자체**가 큰 변화의 출발점이에요. 디브리핑을 읽고 계신다는 건 다음 게임에서는 다르게 해보고 싶다는 뜻이거든요. 그게 가장 중요한 첫걸음이에요.`;
    },

    nextStep: (m, name) => {
      return `${name}님께 가장 효과적인 건 **"가장 작은 첫걸음"**부터 시작하는 거예요. 부담스러운 큰 결정이 아니라, 잃어도 큰 타격 없는 작은 매수 한 번. 그게 노동 수입에서 자본 수입으로 전환되는 다리가 됩니다.

몇 가지 구체적인 시도를 제안드리면:

**첫째, "낮은 착수금 카드 한 장만 매수" 미션이에요.** 다음 게임에서 SMALL DEAL의 "낮은 착수금" 카드(주택 3/2 #7, #8)가 나오면 무조건 매수해보세요. 착수금 $3,000으로 월 $100~$120의 현금흐름을 만드는 카드예요. 게임 전체 자금에서 차지하는 비중이 작아서 잃어도 큰 타격이 없어요. **하지만 그 한 번의 매수가 자본 수입을 만드는 첫 경험**이 됩니다. 매달 게임 시간이 지날 때마다 그 자산이 현금을 만들어내는 걸 직접 보시게 될 거예요.

**둘째, "좋은 매물 카드는 무조건 매수" 규칙이에요.** SMALL DEAL의 132% ROI, 150% ROI 카드는 이름 그대로 "꼭 사시오"라고 적혀 있어요. 이런 카드는 현금이 부족해도 대출을 받아서 사야 하는 카드예요. 처음에는 대출이 무서울 수 있지만, **이 카드들은 매달 현금흐름을 만들어주기 때문에 대출 이자보다 수입이 더 크거든요**. 이게 바로 "좋은 빚"이에요. 한 번 매수해보시면 직접 체감하실 수 있어요.

**셋째, "비상금 $500 유지" 규칙이에요.** 매수를 시작하시되 항상 현금 $500 이상은 남겨두세요. 그러면 DOODAD 카드 같은 갑작스런 지출이 와도 추가 대출 없이 흡수할 수 있어요. 안전과 성장의 균형을 맞추는 거죠.

마지막으로 한 가지 정말 중요한 말씀을 드리고 싶어요. **캐쉬플로우 게임은 한 번에 잘하는 게임이 아니에요.** Kevin 강사님이 12년간 5,000번 넘는 코칭을 하시면서 보신 바로는, 보통 **3~5번 정도 게임을 해보면** 카드의 의미와 의사결정의 흐름이 자연스럽게 익숙해진다고 해요. 그러면 매수가 두렵지 않게 되고, 자산이 늘어나는 흐름이 보이기 시작하거든요. 이번 게임의 신중함을 잃지 않으면서도, **다음 게임에서는 단 한 번만 다른 시도**를 해보세요. 그 한 번의 시도가 다음 게임의 자신감이 됩니다. **작은 한 발이 시작이에요.**`;
    },
  },
};

// ═══════════════════════════════════════════════════════════════
// 5. 메시지 생성 함수
// ═══════════════════════════════════════════════════════════════

/**
 * 진단 결과를 기반으로 개인화된 메시지 생성
 * @param {Object} diagnosis - diagnosePersona() 결과
 * @param {string} playerName - 플레이어 이름 (옵셔널, 기본값 "당신")
 * @returns {Object} { diagnosis, meaning, nextStep, persona, evidence }
 */
export function generatePersonaInsight(diagnosis, playerName = '당신') {
  const { persona, metrics } = diagnosis;
  const template = MESSAGE_TEMPLATES[persona];
  if (!template) {
    return {
      diagnosis: '진단 데이터가 부족합니다.',
      meaning: '게임 데이터가 충분히 모이면 더 정확한 진단이 가능해집니다.',
      nextStep: '한 게임을 끝까지 완료한 후 다시 디브리핑을 진행해보세요.',
      persona: 'UNKNOWN',
      evidence: [],
    };
  }

  return {
    diagnosis: template.diagnosis(metrics, playerName),
    meaning: template.meaning(metrics, playerName),
    nextStep: template.nextStep(metrics, playerName),
    persona,
    personaInfo: PERSONAS[persona],
    evidence: extractEvidence(metrics),
    metrics,
  };
}

/**
 * 페르소나 진단의 핵심 증거 데이터 추출 (PDF 진단 근거 박스용)
 */
function extractEvidence(m) {
  const evidence = [];

  if (m.escaped) evidence.push(`쥐경주 탈출 ${m.escapeTurn}턴`);
  evidence.push(`P/E Ratio ${m.peRatio.toFixed(1)} (탈출 기준: 1.0)`);
  evidence.push(`매수 결정 ${m.buyCount}건 / 매도 ${m.sellCount}건`);
  evidence.push(`결정 일관성 ${Math.round(m.consistencyRate * 100)}%`);

  if (m.assetClasses > 0) {
    evidence.push(`자산 다각화: ${m.assetClasses}개 클래스`);
  }
  if (m.businessCount > 0) {
    evidence.push(`사업체 보유 ${m.businessCount}건`);
  }
  if (m.stockBoldness.count > 0) {
    const levelMap = {
      TIMID: '초보형 (1~10주)',
      CAUTIOUS: '중간형 (11~100주)',
      BOLD: '대담형 (101~200주)',
      AGGRESSIVE: '적극형 (201주+)',
    };
    evidence.push(`주식 매수: ${levelMap[m.stockBoldness.level]}, 평균 ${m.stockBoldness.avgShares}주`);
  }
  if (m.goodDealStats.encountered > 0) {
    evidence.push(`"꼭 사시오" 카드 ${m.goodDealStats.encountered}건 중 ${m.goodDealStats.bought}건 매수`);
  }
  if (m.hasInflationProof) {
    evidence.push('인플레이션 면역 자산(올캐시 매입) 보유');
  }
  evidence.push(`레버리지 비율 ${Math.round(m.leverageRatio * 100)}%`);
  evidence.push(`현금 비중 ${Math.round(m.cashRatio * 100)}%`);

  return evidence;
}

// ═══════════════════════════════════════════════════════════════
// 6. 통합 진단 함수 (외부 사용 진입점)
// ═══════════════════════════════════════════════════════════════

/**
 * 게임 데이터로부터 페르소나 진단 + 메시지 생성을 한 번에 수행.
 * @param {Object} game - 게임 객체 (turnLog, assets, cash, etc.)
 * @returns {Object} 완성된 인사이트
 */
export function diagnoseAndGenerate(game) {
  const turnLog = game.turnLog || [];
  const playerName = game.playerName || '당신';

  const gameData = {
    escaped: !!game.escaped || !!game.gameEnded,
    escapeTurn: game.escapeTurn || (game.gameEnded ? turnLog.length : null),
    passiveIncome: game.totalCF || game.passiveIncome || 0,
    totalExpense: game.totalExpense || game.monthlyExpense || 1,
    startSalary: game.startSalary || game.salary || 1,
    totalAssets: game.totalAssets || (game.assets || []).reduce((s, a) => s + (a.value || a.price || 0), 0),
    totalDebt: game.totalDebt || game.bankLoan || 0,
    cash: game.cash || 0,
    assets: game.assets || [],
  };

  const diagnosis = diagnosePersona(turnLog, gameData);
  const insight = generatePersonaInsight(diagnosis, playerName);

  return insight;
}
