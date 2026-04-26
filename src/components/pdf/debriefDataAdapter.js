// debriefDataAdapter.js
// 기존 디브리핑 데이터를 스토리북 PDF 형식으로 변환
//
// CashflowCoachingSim.jsx의 turnLog, debrief 데이터를
// DebriefStorybookPDF.jsx가 기대하는 형식으로 매핑한다.

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

  return {
    playerName,
    job,
    turnCount,
    date,
    metrics,
    phases,
    comparison,
  };
};

// 챕터 본문 생성 (실제 사건 기반)
const buildNarrative = (phaseDef, turnLog, playerName) => {
  const events = summarizeEventsForPhase(turnLog, phaseDef);
  if (events.length === 0) {
    return `${phaseDef.ageRange} 구간에서는 유의미한 자산 의사결정이 관측되지 않았다. ` +
      `해당 구간의 패시브 상태는 다음 구간 진입 시 자산 확보 속도에 영향을 미친다. ` +
      `구간 내 의사결정 부재는 기회비용으로 환산될 수 있는 사항이다.`;
  }

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  return `${phaseDef.ageRange} 구간 시작 시점인 T-${String(firstEvent.turn).padStart(2, '0')}에 ${firstEvent.text} 의사결정이 있었다. ` +
    `해당 구간 내 ${events.length}건의 주요 의사결정이 관측되었으며, 마지막 T-${String(lastEvent.turn).padStart(2, '0')}의 ${lastEvent.text}이(가) 다음 구간 진입 시점의 자산 포지션을 결정하였다. ` +
    `각 턴은 2개년 기준으로 환산되며, 의사결정의 누적 효과는 후속 구간에서 비선형적으로 작용한다.`;
};

// 챕터 통찰 (자동 생성)
const buildInsight = (phaseDef, turnLog) => {
  const events = summarizeEventsForPhase(turnLog, phaseDef);
  const buys = events.filter((e) => /매수|구매|deal/i.test(e.text)).length;
  const passes = events.filter((e) => /pass|패스/i.test(e.text)).length;

  if (buys >= 2) {
    return '본 구간에서 적극적인 자산 매수 패턴이 관측되었다. 의사결정의 빈도와 일관성이 후속 구간의 자산 가속에 기여하였다.';
  }
  if (passes >= 2) {
    return '보수적 의사결정이 우세하였다. 리스크 회피는 단기 안정성을 제공하나, 기회비용 측면의 검토가 필요하다.';
  }
  if (events.length === 0) {
    return '구간 내 자산 의사결정이 부재하였다. 의도된 관망과 미실행은 결과적으로 동일한 영향을 미친다.';
  }
  return '구간 내 의사결정의 분포가 관측되었다. 단일 결정의 누적이 구간 종료 시점의 자산 포지션을 결정한다.';
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
