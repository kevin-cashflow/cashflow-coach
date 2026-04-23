"use client";

/**
 * 🎯 기본 디브리핑 자료 생성 (API 호출 없음, 순수 JS)
 * 
 * 1. 전 생애 자산 흐름 요약 (Life Story)
 * 2. 이 게임이 가르쳐 준 5가지 교훈 (5 Lessons)
 * 
 * 입력: turnLog, 게임 결과 데이터
 * 출력: 구조화된 텍스트 (마크다운 친화적)
 */

// ─── 유틸 ───
const formatDollar = (n) => {
  if (n == null) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${abs.toLocaleString()}`;
};

const turnToAge = (turn) => {
  // 1턴 = 2년, 20세부터 시작 → 턴 1 = 20-22세
  const startAge = 20 + (turn - 1) * 2;
  const endAge = startAge + 2;
  return { startAge, endAge };
};

// 턴을 4개 생애구간으로 나눔
const getLifePhase = (turn) => {
  const { startAge } = turnToAge(turn);
  if (startAge < 30) return { key: "youth", name: "사회 초년생", range: "20~30세" };
  if (startAge < 40) return { key: "build", name: "자산 형성기", range: "30~40세" };
  if (startAge < 50) return { key: "transition", name: "성장과 전환", range: "40~50세" };
  return { key: "harvest", name: "수확과 정리", range: "50~60세" };
};

// 턴의 주요 의사결정 요약 (한 줄)
const summarizeTurn = (turn) => {
  const t = turn;
  const cellType = t.cellType || t.dealType || "기타";
  const action = t.action || "";
  const card = t.card || {};
  const desc = card.desc || card.sub || "";

  // 셀 타입별 한 줄 요약
  switch (cellType) {
    case "OPPORTUNITY": {
      if (action === "매수" || action === "buy") {
        const price = card.cost || card.buyPrice || card.price || 0;
        const cf = card.cf || card.cashflow || 0;
        return `${desc.substring(0, 30)} 매수 (CF ${formatDollar(cf)}${price ? `, ${formatDollar(price).replace("-","")}` : ""})`;
      }
      if (action === "패스" || action === "pass") return `기회 거절: ${desc.substring(0, 30)}`;
      return `기회 카드: ${desc.substring(0, 30)}`;
    }
    case "MARKET": {
      if (action === "매도" || action === "sell") {
        const price = card.sell || card.sellPrice || 0;
        return `${desc.substring(0, 20)} 매도 (${formatDollar(price)})`;
      }
      return `마켓: ${desc.substring(0, 30)}`;
    }
    case "DOODAD": {
      const price = card.cost || card.price || 0;
      return `두둣 ${formatDollar(-Math.abs(price))}: ${desc.substring(0, 25)}`;
    }
    case "PAYDAY": return "월급 수령";
    case "CHARITY": return "기부 (주사위 2개)";
    case "BABY": return "👶 베이비 추가";
    case "DOWNSIZED": return "⚠️ 정리해고";
    default: return `${cellType}${desc ? `: ${desc.substring(0, 25)}` : ""}`;
  }
};

// 턴이 "의미있는지" 판단 (월급, 일반 두둣은 생략 가능)
const isSignificantTurn = (turn) => {
  const cellType = turn.cellType || turn.dealType;
  if (cellType === "PAYDAY") return false;
  if (cellType === "DOODAD") {
    const price = turn.card?.cost || turn.card?.price || 0;
    return price >= 500; // 큰 지출만
  }
  return true;
};

// ═══════════════════════════════════════════════════════
// 1. 전 생애 자산 흐름 요약
// ═══════════════════════════════════════════════════════
export function generateLifeStory(game) {
  const turnLog = game.turnLog || [];
  if (turnLog.length === 0) {
    return "이 게임에는 저장된 턴 기록이 없습니다.";
  }

  // 생애 단계별 그룹화
  const phases = {
    youth: { name: "사회 초년생", range: "20~30세", turns: [], turnRange: "" },
    build: { name: "자산 형성기", range: "30~40세", turns: [], turnRange: "" },
    transition: { name: "성장과 전환", range: "40~50세", turns: [], turnRange: "" },
    harvest: { name: "수확과 정리", range: "50~60세", turns: [], turnRange: "" },
  };

  for (const t of turnLog) {
    const phase = getLifePhase(t.turn);
    if (phases[phase.key]) phases[phase.key].turns.push(t);
  }

  // 각 단계의 턴 범위 계산
  Object.keys(phases).forEach(key => {
    const p = phases[key];
    if (p.turns.length > 0) {
      const first = p.turns[0].turn;
      const last = p.turns[p.turns.length - 1].turn;
      p.turnRange = first === last ? `T${first}` : `T${first}~T${last}`;
    }
  });

  // 섹션 생성
  let output = "# 📊 전 생애 자산 흐름 요약\n\n";

  const phaseOrder = ["youth", "build", "transition", "harvest"];
  for (const key of phaseOrder) {
    const p = phases[key];
    output += `## 🏷️ ${p.name} (${p.range})\n`;
    output += `${p.turnRange}\n\n`;

    if (p.turns.length === 0) {
      const { startAge, endAge } = key === "youth" ? { startAge: 20, endAge: 30 }
        : key === "build" ? { startAge: 30, endAge: 40 }
        : key === "transition" ? { startAge: 40, endAge: 50 }
        : { startAge: 50, endAge: 60 };
      output += `이 시기 데이터 없음\n\n`;
      output += `**${startAge}세부터 ${endAge}세까지, 당신의 게임판에는 아무 일도 일어나지 않았습니다. `;
      output += `인생의 ${endAge - startAge}년을 백지로 남긴 셈입니다. 이 시기는 수확의 시간이어야 했습니다. `;
      output += `사업체를 만들고, CF 자산을 쌓아 쥐 레이스를 탈출할 마지막 기회였습니다. `;
      output += `하지만 행동이 없었습니다. 게임은 끝났지만, 질문은 남습니다 — 당신은 ${startAge}세에 `;
      output += `무엇을 하고 있을까요? 아직도 월급을 기다리고 있을까요?**\n\n`;
      continue;
    }

    // 주요 턴만 뽑아서 "화살표 흐름" 으로 표현
    const significantTurns = p.turns.filter(isSignificantTurn);
    const flow = significantTurns.slice(0, 5).map(t => {
      const { startAge } = turnToAge(t.turn);
      return `${startAge}세에 ${summarizeTurn(t)}`;
    }).join(" → ");

    if (flow) {
      output += `${flow}\n\n`;
    }

    // 생애 구간별 해설 (규칙 기반)
    output += generatePhaseNarrative(key, p.turns, game) + "\n\n";
  }

  // 마지막 요약 질문
  const escaped = game.escaped;
  const finalCF = game.totalCF || 0;
  const finalExpenses = game.totalExpenses || 0;

  output += `## 🎯 이 게임에서 당신의 위치\n\n`;
  if (escaped) {
    output += `${turnLog[turnLog.length - 1]?.turn || 0}턴, 당신은 쥐 레이스를 탈출했습니다. `;
    output += `수동소득이 지출을 넘어섰고, 당신은 진짜 부자의 길에 들어섰습니다. `;
    output += `이제 중요한 것은 '탈출 후 무엇을 할 것인가' 입니다.\n`;
  } else {
    output += `${turnLog[turnLog.length - 1]?.turn || 0}턴, 당신은 여전히 쥐 레이스 안에 있습니다. `;
    if (finalCF < finalExpenses) {
      output += `월 현금흐름 ${formatDollar(finalCF)} 이 지출 ${formatDollar(finalExpenses)} 보다 작아서 탈출하지 못했습니다. `;
    }
    output += `하지만 이 게임은 실패가 아닙니다. 이것은 당신의 의사결정 패턴을 보여주는 거울입니다.\n`;
  }

  output += `\n**로버트 기요사키가 이 게임을 만든 이유는 단 하나입니다 — 당신의 판단을 훈련시키기 위해서. `;
  output += `실제 인생에서는 되돌릴 수 없는 결정들을, 이 게임판 위에서는 몇 번이고 다시 할 수 있습니다.**\n`;

  return output;
}

// 생애 구간별 해설 (규칙 기반)
function generatePhaseNarrative(phaseKey, turns, game) {
  const narratives = {
    youth: () => {
      const buys = turns.filter(t => t.action === "매수" || t.action === "buy");
      const fastDecisions = turns.filter(t => t.decisionSec != null && t.decisionSec < 10);

      let text = `20대의 첫 도전은 용감했습니다. `;
      if (buys.length > 0) {
        text += `${buys.length}건의 매수 결정을 내린 것은 '행동하는 투자자'의 시작입니다. `;
      }
      if (fastDecisions.length >= 2) {
        text += `${fastDecisions.length}번의 빠른 의사결정은 기회를 놓치지 않는 힘을 보여줍니다. `;
      }
      text += `젊을 때의 경험은 다음 단계의 씨앗이 됩니다.`;
      return text;
    },
    build: () => {
      const buys = turns.filter(t => t.action === "매수" || t.action === "buy");
      const babies = turns.filter(t => t.cellType === "BABY");

      let text = `30대는 인생에서 자산 파이프라인을 구축할 가장 중요한 시기입니다. `;
      if (buys.length > 0) {
        text += `${buys.length}건의 자산 매수는 월급이 아닌 '자산이 일하는' 전환점을 만들었습니다. `;
      }
      if (babies.length > 0) {
        text += `${babies.length}명의 베이비는 삶의 선물이지만, 동시에 지출 증가의 시작이기도 합니다. `;
      }
      text += `이 시기에 만든 현금흐름 파이프라인은 평생 갑니다.`;
      return text;
    },
    transition: () => {
      const sells = turns.filter(t => t.action === "매도" || t.action === "sell");

      let text = `40대부터 분위기가 바뀝니다. 두둣 카드의 지출이 커지고, 부동산 투자로 만든 현금흐름이 예상치 못한 지출로 새어나가기 시작합니다. `;
      if (sells.length > 0) {
        text += `${sells.length}건의 매도는 갈림길의 결정이었습니다. 차익은 단 한 번이지만, 현금흐름은 매달이기 때문입니다. `;
        text += `이 차익을 더 큰 CF 자산으로 바꾸지 않는다면, 당신은 '진짜 부'가 아닌 '일시적 현금'을 선택한 것입니다.`;
      } else {
        text += `이 시기의 선택은 모두 '유지 vs 확장'의 싸움입니다.`;
      }
      return text;
    },
    harvest: () => {
      if (turns.length === 0) return "";
      let text = `50대는 이미 축적한 자산이 말을 하는 시기입니다. `;
      text += `이 시기에 새로운 자산을 만드는 것은 어렵지만, 만들어둔 자산이 제대로 일하게 만드는 것은 가능합니다. `;
      text += `쥐 레이스 탈출 조건은 '수동소득 > 총 지출'입니다. 여기까지 왔다면 당신은 인생의 대부분을 성실하게 산 것입니다.`;
      return text;
    },
  };

  return (narratives[phaseKey] || (() => ""))();
}

// ═══════════════════════════════════════════════════════
// 2. 이 게임이 가르쳐 준 5가지 교훈
// ═══════════════════════════════════════════════════════
export function generateFiveLessons(game) {
  const turnLog = game.turnLog || [];
  const assets = game.assets || [];
  const totalTurns = turnLog.length;

  // 데이터 분석
  const buys = turnLog.filter(t => t.action === "매수" || t.action === "buy");
  const sells = turnLog.filter(t => t.action === "매도" || t.action === "sell");
  const passes = turnLog.filter(t => t.action === "패스" || t.action === "pass");
  const fastDecisions = turnLog.filter(t => t.decisionSec != null && t.decisionSec < 10);
  const avgDecisionSec = turnLog
    .filter(t => t.decisionSec != null)
    .reduce((sum, t, _, arr) => sum + t.decisionSec / arr.length, 0);

  // 거래 다양성
  const realEstates = assets.filter(a => a.type === "부동산").length;
  const businesses = assets.filter(a => a.type === "사업").length;
  const stocks = assets.filter(a => a.type === "주식").length;
  const diversityScore = [realEstates > 0, businesses > 0, stocks > 0].filter(Boolean).length;

  // 기부/대출 여부
  const hasCharity = turnLog.some(t => t.cellType === "CHARITY");
  const hasLoan = (game.bankLoan || 0) > 0;

  const lessons = [];

  // 교훈 1: 의사결정 속도
  if (fastDecisions.length >= 3) {
    lessons.push({
      title: "빠른 결정이 기회를 잡습니다",
      text: `당신은 ${fastDecisions.length}번을 10초 이내에 결정했습니다. 이 속도는 두려움이 아닌 '행동'을 보여줍니다. 하지만 기요사키는 말했습니다 — "행동 이후가 더 중요하다."`
    });
  } else if (avgDecisionSec > 30) {
    lessons.push({
      title: "때로는 빠른 결정이 필요합니다",
      text: `당신의 평균 의사결정 시간은 ${Math.round(avgDecisionSec)}초였습니다. 신중함은 좋지만, 좋은 기회는 오래 기다려주지 않습니다. 분석과 행동의 균형이 부자의 리듬입니다.`
    });
  } else {
    lessons.push({
      title: "판단의 균형이 있었습니다",
      text: `당신은 평균 ${Math.round(avgDecisionSec)}초로 결정했습니다. 너무 빠르지도 너무 느리지도 않은 이 리듬이, 실제 투자에서도 가장 중요한 템포입니다.`
    });
  }

  // 교훈 2: 매도에 대한 경고 또는 현금흐름 강화
  if (sells.length >= 2) {
    lessons.push({
      title: "자산 매도는 신중해야 합니다",
      text: `당신은 ${sells.length}번의 매도를 했습니다. 젊을 때 차익은 원금 확보의 수단이지만, 40대 이후 현금흐름 자산의 매각은 '미래를 파는 것'입니다. 월 $220은 20년이면 $52,800입니다.`
    });
  } else {
    lessons.push({
      title: "현금흐름은 복리로 일합니다",
      text: `당신은 자산을 거의 매각하지 않았습니다. 현금흐름은 매달 복리로 쌓입니다. 월 $100의 자산도 30년이면 $36,000입니다. 팔지 않고 쌓아두는 자가 결국 이깁니다.`
    });
  }

  // 교훈 3: 턴 수와 인생
  const lifeYears = totalTurns * 2;
  const lifePercent = Math.round((lifeYears / 40) * 100);
  lessons.push({
    title: `${totalTurns}턴, 당신은 인생의 ${lifePercent}%를 살았습니다`,
    text: `이 짧은 게임이 보여주는 것은 '얼마나 많은 시간을 아무것도 하지 않고 보냈는가' 입니다. 기회는 매 턴마다 왔지만, 잡지 않은 순간은 빈 칸으로 남습니다. 현실의 20년도 똑같이 흘러갑니다.`
  });

  // 교훈 4: 다양성
  const triedStrategies = [];
  if (realEstates > 0) triedStrategies.push("부동산");
  if (businesses > 0) triedStrategies.push("사업체");
  if (stocks > 0) triedStrategies.push("주식");
  if (hasLoan) triedStrategies.push("대출 활용");
  if (hasCharity) triedStrategies.push("기부");

  if (diversityScore >= 3) {
    lessons.push({
      title: "다양한 전략을 탐색했습니다",
      text: `${triedStrategies.join(", ")} 까지 — 당신은 게임의 여러 도구를 경험했습니다. 진짜 게임은 '모든 도구를 경험해보는 데서' 시작합니다. 한 가지에만 의존하지 않는 것, 이것이 진짜 부자의 포트폴리오입니다.`
    });
  } else {
    const missing = [];
    if (realEstates === 0) missing.push("부동산");
    if (businesses === 0) missing.push("사업체");
    if (stocks === 0) missing.push("주식");
    lessons.push({
      title: "다양한 전략을 탐색하지 못했습니다",
      text: `당신은 ${triedStrategies.join(", ") || "제한된 범위"}만 시도했습니다. ${missing.join(", ")}은 단 한 번도 시도하지 않았습니다. 진짜 게임은 '모든 도구'를 경험해보는 데서 시작합니다.`
    });
  }

  // 교훈 5: 관점 확장 (마무리)
  if (game.escaped) {
    lessons.push({
      title: "탈출은 시작일 뿐입니다",
      text: `당신은 쥐 레이스를 탈출했습니다. 하지만 기요사키의 말에 따르면, 탈출 후 '무엇을 할 것인가'가 진짜 부의 시작입니다. 꿈을 사고, 큰 거래를 하고, 다른 사람을 돕는 것 — 부의 진짜 의미는 그것입니다.`
    });
  } else {
    lessons.push({
      title: "관점을 넓히세요",
      text: `이 게임에서 당신은 '매수-매도'만 경험했습니다. 하지만 캐쉬플로우 게임의 진짜 교훈은 '현금흐름 파이프 구축'입니다. 다음 게임에서는 사업체를 사보세요. CF 자산을 끝까지 보유해보세요. 레버리지를 써보세요. 그 경험이 당신의 금융 근육을 키웁니다.`
    });
  }

  // 출력
  let output = "# 💡 이 게임이 가르쳐 준 5가지\n\n";
  lessons.slice(0, 5).forEach((lesson, i) => {
    output += `## ${i + 1}. ${lesson.title}\n\n${lesson.text}\n\n`;
  });

  return output;
}

// ═══════════════════════════════════════════════════════
// 통합 함수 (둘 다 생성)
// ═══════════════════════════════════════════════════════
export function generateBasicDebrief(game) {
  return {
    lifeStory: generateLifeStory(game),
    fiveLessons: generateFiveLessons(game),
    generatedAt: new Date().toISOString(),
  };
}
