// debriefDataAdapter.js
// 기존 디브리핑 데이터를 스토리북 PDF 형식으로 변환
//
// CashflowCoachingSim.jsx의 turnLog, debrief 데이터를
// DebriefStorybookPDF.jsx가 기대하는 형식으로 매핑한다.

import { diagnosePersona, generatePersonaInsight } from './personaDiagnosis';

// ─────────────────────────────────────────────────────────────
// Phase 정의 (5단계 인생 매핑, 1턴=2년) — 금융 전문 톤
// ─────────────────────────────────────────────────────────────
const PHASE_DEFINITIONS = [
  {
    title: '기반 구축기 (Foundation)',
    ageRange: '25-32세',
    turnRange: 'T-01 ~ T-04',
    turnStart: 1,
    turnEnd: 4,
    headline: '자산 형성의 출발점 — 첫 의사결정의 누적 효과',
    epigraph: {
      quote: '복리(複利)의 효과는 시간의 함수다. 일찍 시작한 자가 가장 큰 보상을 받는다.',
      source: 'Charlie Munger, Berkshire Hathaway',
    },
  },
  {
    title: '자산 확장기 (Expansion)',
    ageRange: '33-40세',
    turnRange: 'T-05 ~ T-08',
    turnStart: 5,
    turnEnd: 8,
    headline: '자산 운용 시스템의 본격적 가동',
    epigraph: {
      quote: '부자는 자산을 매수하고, 빈자는 부채를 자산으로 오인하여 매수한다.',
      source: 'Robert Kiyosaki, 「Rich Dad Poor Dad」',
    },
  },
  {
    title: '변곡점 (Inflection Point)',
    ageRange: '41-48세',
    turnRange: 'T-09 ~ T-12',
    turnStart: 9,
    turnEnd: 12,
    headline: '시장 변동성 하의 의사결정 — 위기와 기회의 분기점',
    epigraph: {
      quote: '다른 사람이 두려워할 때 욕심을 내고, 다른 사람이 욕심을 낼 때 두려워하라.',
      source: 'Warren Buffett, Berkshire Hathaway 2004 주주서한',
    },
  },
  {
    title: '가속 구간 (Compounding)',
    ageRange: '49-56세',
    turnRange: 'T-13 ~ T-16',
    turnStart: 13,
    turnEnd: 16,
    headline: '복리 효과의 가시화 — 누적 자산의 비선형 성장',
    epigraph: {
      quote: '시간은 우수한 사업의 친구이고, 평범한 사업의 적이다.',
      source: 'Warren Buffett',
    },
  },
  {
    title: '탈출 임박 (Pre-Exit)',
    ageRange: '57-65세',
    turnRange: 'T-17 ~ T-20',
    turnStart: 17,
    turnEnd: 20,
    headline: '쥐경주 탈출 임계 구간 — Fast Track 진입 준비',
    epigraph: {
      quote: '진정한 부는 더 이상 돈을 벌 필요가 없을 때 측정된다.',
      source: '재무 코칭 원칙',
    },
  },
];

// ─────────────────────────────────────────────────────────────
// turnLog → phase 이벤트 변환
// ─────────────────────────────────────────────────────────────
const summarizeEventsForPhase = (turnLog, phaseDef) => {
  const events = (turnLog || [])
    .filter((t) => t.turn >= phaseDef.turnStart && t.turn <= phaseDef.turnEnd)
    .filter((t) => {
      // 의미있는 이벤트만 (구매, 매도, 큰 DOODAD, 인생사건)
      const type = t.cardType || t.type;
      return ['SMALL_DEAL', 'BIG_DEAL', 'MARKET', 'OPPORTUNITY', 'BABY', 'DOWNSIZED', 'CHARITY'].includes(type)
        || (type === 'DOODAD' && (t.amount || 0) >= 1000);
    })
    .slice(0, 5) // 최대 5개
    .map((t) => ({
      turn: t.turn,
      text: t.summary || t.description || `${t.cardType} - ${t.cardName || ''}`,
    }));

  return events;
};

// ─────────────────────────────────────────────────────────────
// 자산 시계열 (실제/최선/최악 시뮬레이션)
// ─────────────────────────────────────────────────────────────
const buildComparison = (turnLog, finalAsset) => {
  const turns = turnLog?.length || 20;
  const actual = [];
  const best = [];
  const worst = [];

  let cumActual = 0;
  let cumBest = 0;
  let cumWorst = 0;

  for (let i = 0; i < turns; i++) {
    const t = turnLog?.[i];
    const delta = t?.assetDelta || (finalAsset / turns); // 폴백

    cumActual += delta;
    // 최선: 모든 좋은 카드 잡았다고 가정 (1.5배 가속)
    cumBest += delta > 0 ? delta * 1.5 : delta * 0.3;
    // 최악: 좋은 카드 다 놓침 (모든 자산 매수 거부)
    cumWorst += delta > 0 ? 0 : delta * 1.5;

    actual.push(Math.max(0, cumActual));
    best.push(Math.max(0, cumBest));
    worst.push(Math.max(0, cumWorst));
  }

  return { actual, best, worst };
};

// ─────────────────────────────────────────────────────────────
// 메인 어댑터: game 객체 → storybook data
// ─────────────────────────────────────────────────────────────
export const adaptGameToStorybook = (game) => {
  const playerName = game.playerName || game.nickname || game.player_id || '플레이어';
  const job = game.job || game.job_at_escape || '직업';
  const turnCount = game.turn_count || game.turnCount || (game.turn_log?.length ?? 20);
  const date = new Date(game.date_time || game.savedAt || Date.now())
    .toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  const turnLog = game.turn_log || game.turnLog || [];
  const finalAsset = game.assets ?
    Object.values(game.assets).reduce((sum, list) => {
      if (!Array.isArray(list)) return sum;
      return sum + list.reduce((s, a) => s + (a.value || a.price || 0), 0);
    }, 0) : 0;

  const cash = game.cash || 0;
  const totalCF = game.total_cf || game.totalCF || 0;
  const passiveIncome = game.passive_income_at_escape || game.passiveIncome || 0;
  const expense = game.expense || game.totalExpense || 3000; // 폴백

  const metrics = {
    totalAsset: finalAsset + cash,
    monthlyCF: totalCF,
    passiveIncome,
    expense,
    escaped: !!game.escaped,
  };

  const phases = PHASE_DEFINITIONS.map((def) => ({
    title: def.title,
    ageRange: def.ageRange,
    turnRange: def.turnRange,
    headline: def.headline,
    epigraph: def.epigraph,
    narrative: buildNarrative(def, turnLog, playerName),
    events: summarizeEventsForPhase(turnLog, def),
    insight: buildInsight(def, turnLog),
  }));

  const comparison = buildComparison(turnLog, metrics.totalAsset);

  // 8 페르소나 진단
  let persona = null;
  try {
    // game 객체에서 페르소나 진단에 필요한 데이터 구성
    const allAssets = game.assets ?
      Object.values(game.assets).flat().filter(Boolean) : [];
    const totalDebt = (game.bank_loan || game.bankLoan || 0) +
      allAssets.reduce((sum, a) => sum + (a?.loan || 0), 0);
    const startSalary = game.start_salary || game.startSalary || game.salary || 3000;

    const gameDataForPersona = {
      escaped: !!game.escaped,
      escapeTurn: game.escape_turn || game.escapeTurn || (game.escaped ? turnCount : null),
      passiveIncome,
      totalExpense: expense,
      startSalary,
      totalAssets: finalAsset,
      totalDebt,
      cash,
      assets: allAssets,
    };

    const diagnosis = diagnosePersona(turnLog, gameDataForPersona);
    persona = generatePersonaInsight(diagnosis, playerName);
  } catch (err) {
    console.error('[debriefDataAdapter] 페르소나 진단 실패:', err);
    // 진단 실패해도 PDF 생성은 계속 진행 (PersonaPage가 fallback 처리)
  }

  return {
    playerName,
    job,
    turnCount,
    date,
    metrics,
    phases,
    comparison,
    persona,  // 8 페르소나 진단 결과 (null 허용)
  };
};

// 챕터 본문 생성 (실제 사건 기반)
const buildNarrative = (phaseDef, turnLog, playerName) => {
  const events = summarizeEventsForPhase(turnLog, phaseDef);
  if (events.length === 0) {
    return `${phaseDef.ageRange} 구간에는 별다른 자산 결정이 없으셨네요. ` +
      `이 시기의 흐름은 다음 구간에서 자산을 모으는 속도에 영향을 줘요. ` +
      `결정을 하지 않는 것도 결국 하나의 선택이고, 그만큼 기회비용이 따라온다는 점을 기억하시면 좋겠어요.`;
  }

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  return `${phaseDef.ageRange} 구간은 ${firstEvent.turn}턴째 ${firstEvent.text}로 시작하셨어요. ` +
    `이 구간 동안 총 ${events.length}번의 주요 결정이 있었고, 마지막 ${lastEvent.turn}턴째의 ${lastEvent.text}가 다음 구간 진입 시점의 자산 위치를 만들었네요. ` +
    `게임에서 한 턴은 현실의 2년에 해당해요. 지금 내린 결정들이 시간이 지나면서 어떻게 쌓이는지, 다음 구간에서 직접 확인하실 수 있을 거예요.`;
};

// 챕터 통찰 (자동 생성)
const buildInsight = (phaseDef, turnLog) => {
  const events = summarizeEventsForPhase(turnLog, phaseDef);
  const buys = events.filter((e) => /매수|구매|deal/i.test(e.text)).length;
  const passes = events.filter((e) => /pass|패스/i.test(e.text)).length;

  // ─────────────────────────────────────────────────────
  // 특수 카드 감지 — 우선순위: 시스템적 위기 > 시장 사이클 > 운영 리스크 > 자산 매각
  // ─────────────────────────────────────────────────────

  // 1순위: 인플레이션(물가폭등)
  const inflationEvents = events.filter((e) => /인플레이션|물가폭등/i.test(e.text));
  if (inflationEvents.length > 0) {
    return detectInflationLesson(inflationEvents[0], turnLog);
  }

  // 2순위: 국제 금융 위기
  const crisisEvents = events.filter((e) => /국제 금융 위기|주식 상장 폐지|주식 전량 폐지/i.test(e.text));
  if (crisisEvents.length > 0) {
    return detectFinancialCrisisLesson(crisisEvents[0], turnLog);
  }

  // 3순위: 이자율 하락
  const rateDropEvents = events.filter((e) => /이자율 하락/i.test(e.text));
  if (rateDropEvents.length > 0) {
    return detectRateDropLesson(rateDropEvents[0], turnLog);
  }

  // 4순위: 임차인 손상
  const damageEvents = events.filter((e) => /임차인.*손상|자산을 손상/i.test(e.text));
  if (damageEvents.length > 0) {
    return detectTenantDamageLesson(damageEvents[0], turnLog);
  }

  // 5순위: 자산 매각 기회 (다른 플레이어가 인수)
  const sellEvents = events.filter((e) =>
    /팔라는 제안|매수.*제안|에 팔 수 있다|에 매수.*원함/i.test(e.text)
  );
  if (sellEvents.length >= 2) {
    return detectAssetSaleLesson(sellEvents, turnLog);
  }

  // 6순위: 좋은 매물 카드 (좋은 빚 vs 나쁜 빚 깨달음의 결정적 순간)
  const goodDealEvents = events.filter((e) =>
    /좋은 매물|꼭 사시오|132%|150%/i.test(e.text)
  );
  if (goodDealEvents.length > 0) {
    return detectGoodDealLesson(goodDealEvents, turnLog);
  }

  // ─────────────────────────────────────────────────────
  // 일반 패턴 분석
  // ─────────────────────────────────────────────────────
  if (buys >= 2) {
    return '이 구간에서는 자산을 적극적으로 사들이셨네요. 한 번의 결정이 아니라 여러 번의 매수가 쌓이면서, 다음 구간의 자산 흐름이 빨라지는 기반이 만들어졌어요. 이런 일관된 행동이 결국 큰 차이를 만듭니다.';
  }
  if (passes >= 2) {
    return '이 구간은 패스가 많았네요. 신중한 선택이긴 하지만, 그만큼 흘려보낸 기회도 있었다는 뜻이에요. 무엇이 망설이게 만들었는지 한번 돌아보면 좋겠습니다. 가끔은 패스보다 작은 시도가 더 큰 배움이 되거든요.';
  }
  if (events.length === 0) {
    return '이 구간에는 별다른 결정이 없으셨네요. 가만히 있는 것도 결국 하나의 선택이에요. 그 시간 동안 자산은 그대로였고, 기회는 다른 곳에서 흘러갔죠. 다음에는 작더라도 한 발 내딛어보시는 건 어떨까요?';
  }
  return '이 구간에서는 몇 가지 결정을 내리셨네요. 하나하나는 작아 보여도, 쌓이면 구간 끝의 자산 위치를 만듭니다. 그 결정들이 어떤 패턴을 만들고 있는지 살펴보세요.';
};

// ─────────────────────────────────────────────────────────────
// 특수 카드 분석 — 인플레이션(물가폭등) 카드
// ─────────────────────────────────────────────────────────────
// 이 카드는 단순 게임 메카닉이 아니라 2008년 서브프라임 모기지 사태의
// 본질을 가르치는 교육적 디자인. 플레이어가 이 카드를 만났을 때
// 디브리핑에서 자동으로 의미를 해설한다.
const detectInflationLesson = (inflationEvent, turnLog) => {
  // 플레이어가 게임 종료 시점에 보유한 3/2 주택 분석
  const allEvents = turnLog || [];

  // 올캐시 매입 자산 보유 여부 확인 (BIG DEAL #4: $60K 가격 = $60K 착수금)
  const hasInflationProofAsset = allEvents.some((e) =>
    /상류층 지역의 호화로운 주택|대출이 없는 완벽한 집|올캐시 매입/.test(e.text || '')
  );

  // 대출이 있는 3/2 주택 매수 이력
  const hasLeveraged32 = allEvents.some((e) =>
    /3\/2 주택|주택 3\/2|주택 방3\/욕실2/.test(e.text || '') &&
    /매수|구매|매입/.test(e.text || '') &&
    !/올캐시|대출 없음/.test(e.text || '')
  );

  let lesson = '';

  if (hasInflationProofAsset && hasLeveraged32) {
    lesson = `${inflationEvent.turn}턴째에 인플레이션 카드를 뽑으셨네요. ` +
      '이자율이 갑자기 20%까지 폭등하면서, 대출로 산 3/2 주택은 은행에 다시 빼앗겼습니다. ' +
      '그런데 흥미로운 건 — 같은 종류의 주택이라도 대출 없이 현금으로 산 집은 그대로 남았다는 거예요. ' +
      '이게 바로 2008년 서브프라임 모기지 사태 때 실제로 벌어진 일이었습니다. 사람들이 무리한 대출로 집을 사다가, 이자율이 오르자 도미노처럼 무너졌죠. ' +
      '반면 대출 없이 자기 돈으로 산 집은 그 폭풍 속에서도 살아남았습니다. ' +
      '같은 자산이라도 어떻게 사느냐에 따라 운명이 달라진다는 걸 직접 경험하신 순간이에요.';
  } else if (hasInflationProofAsset) {
    lesson = `${inflationEvent.turn}턴째에 인플레이션 카드가 떴는데, 다행히 현금으로 사신 집은 멀쩡했어요. ` +
      '이 카드는 대출로 산 3/2 주택을 모두 은행에 빼앗기는 카드거든요. ' +
      '"대출 없는 자산은 어떤 폭풍에서도 살아남는다" — 부자아빠가 늘 강조하던 그 원리를 게임에서 직접 보신 셈이죠. ' +
      '2008년 서브프라임 모기지 사태 때도 똑같은 일이 있었어요. 무리하게 대출받아 집 산 사람들은 이자가 오르면서 다 잃었지만, ' +
      '자기 돈으로 산 사람들은 멀쩡했습니다. 이자율이 오를 때 부동산 시장이 어떻게 흔들리는지, 그 와중에도 누가 살아남는지를 보여주는 결정적 카드였어요.';
  } else if (hasLeveraged32) {
    lesson = `${inflationEvent.turn}턴째에 인플레이션 카드가 뜨면서 대출로 사신 3/2 주택을 은행에 빼앗기셨네요. 아쉬운 순간이에요. ` +
      '그런데 이 카드는 단순한 운의 문제가 아니라, 2008년 서브프라임 모기지 사태를 그대로 게임에 옮겨놓은 디자인입니다. ' +
      '당시에도 무리한 대출로 집을 산 사람들이 이자율 폭등에 무너졌거든요. ' +
      '재미있는 건, 같은 3/2 주택이라도 "대출 없는 완벽한 집"(올캐시 매입)은 이 카드의 영향을 받지 않는다는 점이에요. ' +
      '대출은 수익을 키워주지만, 동시에 외부 충격에 자산을 그대로 노출시킨다는 양면성을 이번에 직접 느끼셨을 거예요. ' +
      '레버리지를 어떻게 다룰지, 한 번 더 고민해볼 만한 순간입니다.';
  } else {
    lesson = `${inflationEvent.turn}턴째에 인플레이션 카드가 떴어요. 다행히 대출로 산 3/2 주택이 없어서 직접적인 피해는 없으셨네요. ` +
      '이 카드는 2008년 서브프라임 모기지 사태가 모티브예요. 무리한 주택 대출이 시스템 전체를 어떻게 흔드는지를 게임으로 풀어낸 거죠. ' +
      '이번엔 비켜갔지만, 앞으로 부동산을 살 때 한 가지는 꼭 기억해두시면 좋을 것 같아요. ' +
      '"대출 비중이 너무 높은 자산은 외부 충격 한 번에 무너질 수 있다"는 점이요. 회복탄력성을 함께 고려하는 습관이 결국 자산을 지킵니다.';
  }

  return lesson;
};

// ─────────────────────────────────────────────────────────────
// 특수 카드 분석 — 국제 금융 위기 (모든 주식 상장 폐지)
// ─────────────────────────────────────────────────────────────
// 동일 자산 클래스의 시스템적 위기를 게임으로 재현. 자산 클래스 다각화의
// 중요성을 학습시키는 카드.
const detectFinancialCrisisLesson = (crisisEvent, turnLog) => {
  const allEvents = turnLog || [];

  // 주식 매수 이력
  const stockBuys = allEvents.filter((e) =>
    /월트디즈니|테슬라|머크|주식.*매수|주식.*구매/i.test(e.text || '')
  );

  // 부동산 보유 여부
  const hasRealEstate = allEvents.some((e) =>
    /(콘도|주택 3\/2|주택 방3|2가구|4가구|8가구|아파트 단지)/i.test(e.text || '') &&
    /(매수|구매|매입)/i.test(e.text || '')
  );

  // 사업체 보유 여부
  const hasBusiness = allEvents.some((e) =>
    /(PC 게임방|세탁소|문구 도매|빨래방|도넛|세차장|피자|모텔|쇼핑몰|동업)/i.test(e.text || '') &&
    /(매수|구매|매입)/i.test(e.text || '')
  );

  let lesson = '';

  if (stockBuys.length >= 3 && !hasRealEstate && !hasBusiness) {
    lesson = `${crisisEvent.turn}턴째에 국제 금융 위기 카드가 떴어요. 그동안 ${stockBuys.length}번이나 주식을 사들이셨는데, 한순간에 모두 종이가 됐네요. 부동산이나 사업체가 없어서 충격을 그대로 받으신 상황이에요. ` +
      '이게 바로 한 가지 자산에만 몰빵했을 때 벌어지는 일입니다. 위기가 오면 같은 종류의 자산은 동시에 무너지거든요. ' +
      '주식, 부동산, 사업체는 각각 다른 경기 흐름을 타요. 어떤 위기가 와도 셋 중 하나는 살아남을 가능성이 있죠. ' +
      '"계란을 한 바구니에 담지 마라"는 말, 이번에 뼈저리게 느끼셨을 것 같아요.';
  } else if (stockBuys.length >= 2) {
    lesson = `${crisisEvent.turn}턴째에 국제 금융 위기가 터졌네요. ${stockBuys.length}번 사신 주식은 모두 자산에서 사라졌지만, 다행히 부동산이나 사업체가 충격을 흡수해줬어요. ` +
      '이게 바로 자산 분산의 힘입니다. 한 곳이 무너져도 다른 곳이 버텨주는 거죠. ' +
      '부자아빠가 강조하던 핵심 원리예요 — 어떤 위기가 와도 모든 자산이 동시에 무너지지 않도록 포트폴리오를 짜는 것. ' +
      '이번 위기에서 그 원리가 어떻게 작동하는지 직접 보셨네요.';
  } else if (stockBuys.length === 1) {
    lesson = `${crisisEvent.turn}턴째에 국제 금융 위기 카드가 떴어요. 보유하신 주식이 사라졌지만, 비중이 크지 않아서 전체적인 충격은 크지 않았네요. ` +
      '이 카드는 2008년 글로벌 금융위기나 2020년 코로나 초기 폭락 같은 실제 사건을 게임으로 옮겨놓은 거예요. ' +
      '같은 종류의 자산은 위기가 오면 한꺼번에 흔들린다는 점, 기억해두시면 좋을 거예요.';
  } else {
    lesson = `${crisisEvent.turn}턴째에 국제 금융 위기 카드가 떴는데, 주식이 없어서 다행히 비켜가셨네요. ` +
      '이 카드의 핵심은 "같은 종류의 자산은 위기가 오면 동시에 무너진다"는 거예요. ' +
      '주식만 가지고 있는 사람은 이런 카드 한 장에 모든 걸 잃을 수 있죠. ' +
      '주식·부동산·사업체를 골고루 갖추는 게 결국 자산을 지키는 가장 확실한 방법입니다. 이번 카드가 그 메시지를 보여준 셈이에요.';
  }

  return lesson;
};

// ─────────────────────────────────────────────────────────────
// 특수 카드 분석 — 이자율 하락 (3/2 주택 +$50K 매각)
// ─────────────────────────────────────────────────────────────
// 시장 사이클 인식과 매도 타이밍의 중요성을 가르치는 카드.
// 카드를 뽑은 사람만 해당하므로 기회 활용 여부가 핵심.
const detectRateDropLesson = (rateDropEvent, turnLog) => {
  const allEvents = turnLog || [];

  // 3/2 주택 보유 여부 (BIG DEAL 또는 SMALL DEAL)
  const has32 = allEvents.some((e) =>
    /(주택 3\/2|주택 방3\/욕실2)/i.test(e.text || '') &&
    /(매수|구매|매입)/i.test(e.text || '')
  );

  // 이 카드 등장 후 매각 의사결정이 있었는지
  const rateDropTurn = rateDropEvent.turn;
  const subsequentSales = allEvents.filter((e) =>
    e.turn > rateDropTurn &&
    /(매각|매도|판매)/i.test(e.text || '') &&
    /(주택 3\/2|주택 방3\/욕실2)/i.test(e.text || '')
  );

  let lesson = '';

  if (has32 && subsequentSales.length > 0) {
    lesson = `${rateDropTurn}턴째에 이자율 하락 카드가 떴어요. 3/2 주택을 시장가보다 $50,000이나 더 받고 팔 수 있는 기회 카드였죠. ` +
      '그리고 그 기회를 놓치지 않고 매각하셨네요! 정말 좋은 판단이었습니다. ' +
      '시장이 보내는 신호를 알아채고 행동으로 옮긴다는 건 생각보다 어려운 일이에요. 대부분은 "조금만 더 가지고 있어 볼까" 하다가 기회를 놓치거든요. ' +
      '이자율이 떨어지면 부동산 가격이 오르는 건 현실에서도 똑같이 벌어지는 일입니다. 이런 거시 경제 흐름을 자산 운용에 활용하는 감각, 이번에 잘 보여주셨어요.';
  } else if (has32 && subsequentSales.length === 0) {
    lesson = `${rateDropTurn}턴째에 이자율 하락 카드가 떴는데, 3/2 주택을 보유하셨으면서도 매각하지 않으셨네요. ` +
      '이 카드는 카드를 뽑은 사람만 누릴 수 있는 일회성 기회였어요. 시장가에 $50,000이나 더 얹어서 팔 수 있었거든요. ' +
      '"계속 가지고 있는 게 좋지 않나?" 싶은 마음, 충분히 이해돼요. 하지만 보유가 항상 정답은 아닙니다. ' +
      '시장이 좋은 가격을 제시할 때 매각하고 그 자금으로 더 좋은 자산을 사는 것 — 이것도 자산 운용의 중요한 한 축이에요. ' +
      '다음에 비슷한 기회가 오면 한번 더 진지하게 고민해보세요.';
  } else {
    lesson = `${rateDropTurn}턴째에 이자율 하락 카드가 떴는데, 3/2 주택이 없어서 이 기회는 활용할 수 없었네요. ` +
      '이 카드는 이자율이 떨어지면 부동산 가치가 오른다는 현실 경제 원리를 게임으로 보여준 거예요. ' +
      '거시 경제 흐름이 내 자산에 어떤 영향을 주는지 — 이런 시야를 갖추는 게 결국 자산을 키우는 사람들의 공통점이거든요.';
  }

  return lesson;
};

// ─────────────────────────────────────────────────────────────
// 특수 카드 분석 — 임차인 손상 ($300/$500/채)
// ─────────────────────────────────────────────────────────────
// 임대 부동산의 운영 리스크를 보여주는 카드. 자산이 많을수록 비례 손실.
const detectTenantDamageLesson = (damageEvent, turnLog) => {
  const allEvents = turnLog || [];

  // 임대 부동산 보유 수 추정 (매수 기록 기반)
  const rentalBuys = allEvents.filter((e) =>
    /(콘도|주택 3\/2|주택 방3|2가구|4가구|8가구|아파트 단지)/i.test(e.text || '') &&
    /(매수|구매|매입)/i.test(e.text || '')
  );

  // 임대 부동산 매각 기록
  const rentalSales = allEvents.filter((e) =>
    /(콘도|주택 3\/2|주택 방3|2가구|4가구|8가구|아파트 단지)/i.test(e.text || '') &&
    /(매각|매도|판매)/i.test(e.text || '')
  );

  const estimatedHoldings = Math.max(0, rentalBuys.length - rentalSales.length);

  // 손상 금액 추출
  const damageAmount = /500/.test(damageEvent.text) ? 500 : 300;
  const totalDamage = estimatedHoldings * damageAmount;

  let lesson = '';

  if (estimatedHoldings >= 3) {
    lesson = `${damageEvent.turn}턴째에 임차인 손상 카드가 떴어요. 1채당 $${damageAmount}을 보상해야 하는 카드인데, 보유하신 임대 부동산이 약 ${estimatedHoldings}채라 최대 $${totalDamage.toLocaleString()}의 손실이 발생할 수 있는 상황이었네요. ` +
      '임대 부동산은 매달 들어오는 현금흐름이 매력적이지만, 동시에 이런 운영 리스크를 떠안아야 해요. ' +
      '집이 많아질수록 좋기만 한 게 아니라, 외부 충격에 노출되는 규모도 함께 커지거든요. ' +
      '그래서 보험에 가입하거나 예비 자금을 따로 마련해두는 게 결국 자산을 지키는 핵심이에요. 이번 카드가 그걸 직접 보여줬네요.';
  } else if (estimatedHoldings >= 1) {
    lesson = `${damageEvent.turn}턴째에 임차인 손상 카드가 떴어요. 1채당 $${damageAmount}을 보상해야 했는데, 보유하신 임대 부동산 ${estimatedHoldings}채에 대한 손실이 발생했네요. ` +
      '임대 부동산은 패시브 인컴의 좋은 원천이지만, 이런 운영 리스크가 늘 따라다녀요. ' +
      '게임에서는 카드를 뽑은 사람만 해당하지만, 현실에서는 모든 임대 부동산 주인이 한 번쯤 겪는 일이에요. ' +
      '예비 자금을 미리 준비해두는 습관, 이번 기회에 한 번 더 챙겨보시면 좋겠어요.';
  } else {
    lesson = `${damageEvent.turn}턴째에 임차인 손상 카드가 떴어요. 임대 부동산이 없어서 직접적인 피해는 없으셨네요. ` +
      '이 카드는 임대 부동산이 매달 현금흐름을 만들어주는 만큼, 그 이면에 운영 리스크도 있다는 걸 보여줘요. ' +
      '나중에 부동산을 늘려갈 때, 보험과 예비 자금을 함께 챙기는 습관을 들이시면 좋겠어요. 그게 결국 자산을 오래 지키는 비결이거든요.';
  }

  return lesson;
};

// ─────────────────────────────────────────────────────────────
// 특수 카드 분석 — 자산 매각 기회 (다른 플레이어가 레버리지로 인수)
// ─────────────────────────────────────────────────────────────
// 매각 카드의 핵심 메시지: 다른 게이머가 은행대출을 받아 인수한다는 점.
// 이는 현실의 자산 시장 — 대출이 가능한 시장에서는 다른 사람의 레버리지가
// 당신의 매도 가격을 결정한다 — 를 보여준다.
const detectAssetSaleLesson = (sellEvents, turnLog) => {
  const allEvents = turnLog || [];

  // 매각 기회를 활용한 횟수
  const actualSales = allEvents.filter((e) =>
    /(매각|매도|판매)/i.test(e.text || '')
  );

  // 보유 자산 추정
  const buys = allEvents.filter((e) =>
    /(매수|구매|매입)/i.test(e.text || '')
  );

  let lesson = '';

  if (sellEvents.length >= 3 && actualSales.length === 0) {
    lesson = `이 구간에서 자산 매각 기회 카드가 ${sellEvents.length}번이나 떴는데, 한 번도 파시지 않으셨네요. ` +
      '매각 카드의 진짜 의미는 단순히 "팔 기회"가 아니에요. 다른 플레이어가 은행 대출을 받아서 내 자산을 사간다는 거거든요. ' +
      '이게 바로 현실의 자산 시장에서 벌어지는 일이에요. 누군가 대출을 받아 내 자산을 시장가보다 비싸게 사주는 거죠. ' +
      '항상 "사서 보유"하는 게 정답은 아니에요. 좋은 가격을 제시할 때 매각하고, 그 자금으로 더 좋은 자산을 사는 것 — 이것도 자산을 키우는 중요한 방법입니다. ' +
      '다음에 매각 카드가 뜨면, 한 번쯤 진지하게 고민해보세요.';
  } else if (sellEvents.length >= 3 && actualSales.length >= 1) {
    lesson = `이 구간에서 자산 매각 기회가 ${sellEvents.length}번 왔고, ${actualSales.length}번 매각하셨네요. 좋은 흐름이에요. ` +
      '매각 카드의 본질은 다른 플레이어가 은행 대출로 내 자산을 사간다는 거예요. 이게 바로 현실의 자산 시장에서 일어나는 일이거든요. ' +
      '매수자의 대출 능력이 곧 내 매도 가격을 만들어주는 거죠. ' +
      '자산을 잘 회전시키며 자본 이득을 쌓아가는 것 — 매달 들어오는 현금흐름과 함께, 부를 쌓는 두 가지 중요한 축 중 하나예요.';
  } else {
    lesson = `이 구간에서 자산 매각 기회 카드가 ${sellEvents.length}번 떴어요. ` +
      '매각 카드를 만났을 때 꼭 기억해두실 게 하나 있어요. 다른 플레이어가 은행 대출을 받아서 내 자산을 사간다는 점이에요. ' +
      '이게 무슨 뜻이냐면 — 다른 사람의 대출 능력이 내가 받을 수 있는 매각 가격을 만들어주는 거예요. 현실의 부동산 시장과 똑같죠. ' +
      '자산을 회전시키며 차익을 쌓아가는 것도 부자아빠가 강조하는 핵심 전략 중 하나입니다.';
  }

  return lesson;
};

// ─────────────────────────────────────────────────────────────
// 특수 카드 분석 — 좋은 매물 카드 (Q8: 깨달음의 결정적 순간)
// ─────────────────────────────────────────────────────────────
// Kevin 강사님 코칭 인사이트: "좋은 매물 3/2 주택은 현금이 없어도 대출로
// 구매하면 +현금흐름이 발생. 좋은 빚과 나쁜 빚을 설명할 때 좋은 빚에 해당.
// 이 계산 이후로 자산에서 나오는 현금흐름과 대출의 상관관계를 파악하기 시작."
const detectGoodDealLesson = (goodDealEvents, turnLog) => {
  const allEvents = turnLog || [];

  // 좋은 매물 카드 등장 횟수
  const encountered = goodDealEvents.length;

  // 좋은 매물 카드 매수 여부 (이 구간 내)
  const boughtInPhase = goodDealEvents.filter((e) =>
    /매수|구매/i.test(e.text || '')
  ).length;

  // 좋은 매물 카드 패스 여부
  const passedInPhase = goodDealEvents.filter((e) =>
    /패스|pass/i.test(e.text || '')
  ).length;

  // 전체 게임에서 좋은 매물 카드 매수 이력
  const totalGoodDealBuys = allEvents.filter((e) =>
    /(좋은 매물|꼭 사시오|132%|150%)/i.test(e.text || '') &&
    /(매수|구매)/i.test(e.text || '')
  ).length;

  const firstEvent = goodDealEvents[0];
  const turnNumber = firstEvent?.turn || '?';

  let lesson = '';

  // ─────────────────────────────────────────
  // 시나리오 1: 매수 + 좋은 매물 (가장 깨달음 큰 케이스)
  // ─────────────────────────────────────────
  if (boughtInPhase > 0) {
    lesson = `${turnNumber}턴째에 "꼭 사시오" 좋은 매물 카드를 매수하셨네요. 이 카드는 캐쉬플로우 게임에서 가장 중요한 깨달음의 순간을 만드는 카드예요. ` +
      '주택 3/2를 132% 또는 150% ROI로 매수할 수 있는 카드인데, 핵심은 **착수금이 $2,000밖에 안 되면서 나머지는 대출로 구매**할 수 있다는 점이에요. ' +
      '이게 바로 부자아빠가 강조하는 **"좋은 빚"의 정의**입니다. 일반적으로 빚은 무서운 거지만, **그 빚으로 산 자산이 매달 대출 이자보다 더 큰 현금흐름을 만들어내면**, 그 빚은 나를 부자로 만들어주는 도구가 돼요. ' +
      '예를 들어 이 카드의 경우 대출 이자가 월 $200~$300 수준인데, 자산이 만드는 현금흐름은 월 $220~$250이에요. 즉, 내 돈 $2,000만 들이고 대출 $33,000~$43,000을 일하게 만든 거죠. ' +
      '이 한 번의 매수가 단순한 게임 결정이 아니라 **"자산에서 나오는 현금흐름과 대출의 상관관계"를 직접 체감하는 순간**이에요. Kevin 강사님이 12년간 5,000번 넘는 코칭에서 가장 자주 짚으시는 깨달음의 순간이 바로 이 카드입니다.';
  }
  // ─────────────────────────────────────────
  // 시나리오 2: 패스 + 좋은 매물 카드 (기회 흘려보냄)
  // ─────────────────────────────────────────
  else if (passedInPhase > 0 && totalGoodDealBuys === 0) {
    lesson = `${turnNumber}턴째에 "꼭 사시오" 좋은 매물 카드가 등장했는데, 패스하셨네요. 아쉬운 순간이에요. ` +
      '이 카드는 캐쉬플로우 게임에서 가장 매력적인 매수 기회예요. 주택 3/2를 132% 또는 150% ROI로 매수할 수 있고, 핵심은 **착수금이 $2,000만 있으면 나머지는 대출로 구매**할 수 있다는 점이에요. ' +
      '아마 "대출이 무서워서" 패스하셨을 가능성이 커요. 그런데 이게 바로 부자아빠가 강조하는 **"좋은 빚 vs 나쁜 빚"의 차이**입니다. ' +
      '일반적으로 빚은 무서운 거지만, **그 빚으로 산 자산이 매달 대출 이자보다 더 큰 현금흐름을 만들어내면**, 그 빚은 오히려 나를 부자로 만들어주는 도구예요. ' +
      '이 카드의 경우, 대출 이자보다 자산이 만드는 현금흐름이 더 크기 때문에 매수하면 즉시 매달 +$220~$250의 패시브 인컴이 생겨요. ' +
      '다음 게임에서 같은 카드를 만나시면, **그때는 한번 매수해보세요**. 한 번만 경험하시면 "좋은 빚"이 무엇인지 직접 체감하실 수 있어요.';
  }
  // ─────────────────────────────────────────
  // 시나리오 3: 카드 등장했지만 패스도 매수도 아닌 상태 (예: 권리 양도)
  // ─────────────────────────────────────────
  else if (totalGoodDealBuys > 0) {
    // 다른 페이즈에서 매수한 적 있음 — 인지하고 있다는 뜻
    lesson = `${turnNumber}턴째에 좋은 매물 카드가 등장했어요. 이번 페이즈에서는 직접 매수하지 않으셨지만, 다른 시점에서 비슷한 카드를 매수하신 경험이 있으셨네요. ` +
      '좋은 매물 카드는 부자아빠 코칭의 "좋은 빚" 개념을 직접 체감하는 결정적 카드예요. ' +
      '대출로 산 자산이 매달 대출 이자보다 더 큰 현금흐름을 만들어내는 — 그래서 빚이 오히려 나를 부자로 만들어주는 — 그 매커니즘을 이미 한 번 경험하셨다는 거죠. ' +
      '이 감각이 점점 익숙해지면, 다음에는 더 큰 자산도 같은 방식으로 다룰 수 있게 됩니다.';
  }
  // ─────────────────────────────────────────
  // 시나리오 4: 그 외 (매수도 패스도 명확하지 않음)
  // ─────────────────────────────────────────
  else {
    lesson = `${turnNumber}턴째에 좋은 매물 카드가 등장했어요. 이 카드는 캐쉬플로우 게임에서 가장 중요한 깨달음의 순간을 만들어주는 카드예요. ` +
      '주택 3/2를 132% 또는 150% ROI로 매수할 수 있는데, 핵심은 **현금이 없어도 대출로 구매하면 즉시 +현금흐름이 발생**한다는 점이에요. ' +
      '이게 바로 부자아빠가 말하는 "**좋은 빚**"의 정의입니다. 다음에 이 카드를 만나시면, 한번 더 진지하게 고민해보세요. ' +
      '한 번의 매수 경험이 "자산에서 나오는 현금흐름과 대출의 상관관계"를 직접 체감하는 순간이 되어줄 거예요.';
  }

  return lesson;
};

// ─────────────────────────────────────────────────────────────
// 통합 가이드 (주석)
// ─────────────────────────────────────────────────────────────
/*
사용 예시:

import { adaptGameToStorybook } from './debriefDataAdapter';
import { downloadStorybookPDF } from './DebriefStorybookPDF';

// MyHistoryTab.jsx 또는 InlineDebriefSection.jsx 에서:
const handleDownloadStorybook = async (game) => {
  try {
    const storybookData = adaptGameToStorybook(game);
    await downloadStorybookPDF(storybookData, {
      coachingUrl: 'https://cashflow-coach.vercel.app/coaching',
      nextGameUrl: 'https://cashflow-coach.vercel.app/play',
    });
  } catch (err) {
    console.error('PDF 생성 실패:', err);
    alert('PDF 생성에 실패했습니다. 다시 시도해주세요.');
  }
};

// 버튼 추가:
<button onClick={() => handleDownloadStorybook(game)}>
  📖 스토리북 PDF 다운로드
</button>
*/
