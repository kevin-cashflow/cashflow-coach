/**
 * ═══════════════════════════════════════════════════════════════
 * 🎮 Cashflow Game State Engine
 * ═══════════════════════════════════════════════════════════════
 * 
 * 순수 함수 기반 게임 상태 재계산 엔진.
 * job + turnLog 입력 → 재무 상태 출력.
 * React 의존성 없음, 단위 테스트 가능.
 * 
 * @version 2 (schema)
 * @see REFACTOR_DESIGN.md
 */

// ─────────────────────────────────────────────────────────
// 스키마 버전 (레거시 호환용)
// ─────────────────────────────────────────────────────────
export const SCHEMA_VERSION = 2;

// ─────────────────────────────────────────────────────────
// 초기 상태
// ─────────────────────────────────────────────────────────
const EMPTY_STATE = {
  cash: 0,
  assets: [],
  totalCF: 0,
  babies: 0,
  bankLoan: 0,
  loanInterest: 0,
};

/**
 * 게임 상태를 turnLog로부터 재계산 (순수 함수)
 * 
 * @param {Object} job - JOBS 배열의 직업 객체 {name, salary, expense, cashflow, savings, childCost}
 * @param {Array} turnLog - 턴 로그 배열
 * @param {Object} options - { initialLoan?: number }
 * @returns {Object} GameState { cash, assets, totalCF, babies, bankLoan, loanInterest, totalExpense, charityTurnsRemaining, downsizeRestRemaining }
 */
export function computeGameState(job, turnLog = [], options = {}) {
  if (!job) return { ...EMPTY_STATE, totalExpense: 0, charityTurnsRemaining: 0, downsizeRestRemaining: 0 };
  
  const { initialLoan = 0 } = options;
  
  // 초기 상태: 직업의 초기 현금 + 월 CF + 초기 대출
  let state = {
    cash: (job.savings || 0) + (job.cashflow || 0) + initialLoan,
    assets: [],
    totalCF: 0,
    babies: 0,
    bankLoan: initialLoan,
    loanInterest: Math.round(initialLoan * 0.1),
    // 파생 카운터 (UI 표시용)
    charityTurnsRemaining: 0,
    downsizeRestRemaining: 0,
    // 상환된 직업 부채 타입 목록
    _repaidDebts: [],
  };
  
  // 진짜 턴(주사위를 굴려 이동하거나 휴식 처리된 턴)만 카운터 감소 트리거.
  // 보조 행위(PAYDAY_PASS, STOCK_SELL, EXT_SELL, EXTRA_*)는 감소시키지 않음.
  const MAIN_TURN_TYPES = new Set([
    "OPPORTUNITY", "MARKET", "DOODAD", "PAYDAY",
    "CHARITY", "BABY", "DOWNSIZED", "DOWNSIZED_REST",
  ]);

  // 턴 로그를 순서대로 적용
  for (let i = 0; i < turnLog.length; i++) {
    const t = turnLog[i];
    state = applyTurn(state, t, job);

    const isMainTurn = MAIN_TURN_TYPES.has(t.cellType);

    // CHARITY 설정 턴(= 이번 턴에 기부함)에서는 감소 안 함. 그 이후 진짜 턴부터만 감소.
    if (isMainTurn && t.cellType !== "CHARITY" && state.charityTurnsRemaining > 0) {
      state = { ...state, charityTurnsRemaining: state.charityTurnsRemaining - 1 };
    }
    // DOWNSIZED_REST는 자체 타입에서만 감소 (이미 isMainTurn ⊂ MAIN_TURN_TYPES).
    if (t.cellType === "DOWNSIZED_REST" && state.downsizeRestRemaining > 0) {
      state = { ...state, downsizeRestRemaining: state.downsizeRestRemaining - 1 };
    }
  }
  
  // 상환된 직업 부채의 월 payment는 expense에서 제외
  let repaidDebtSavings = 0;
  if (job.liabilities && state._repaidDebts?.length) {
    for (const debtType of state._repaidDebts) {
      const d = job.liabilities[debtType];
      if (d) repaidDebtSavings += (d.payment || 0);
    }
  }
  const totalExpense = (job.expense || 0) + (state.babies * (job.childCost || 0)) + state.loanInterest - repaidDebtSavings;
  
  return { ...state, totalExpense };
}

/**
 * 개별 턴을 상태에 적용 (순수 함수, 불변성 유지)
 */
function applyTurn(state, t, job) {
  const s = { ...state, assets: [...state.assets] };
  
  switch (t.cellType) {
    case "OPPORTUNITY": return applyOpportunity(s, t);
    case "MARKET":      return applyMarket(s, t);
    case "DOODAD":      return applyDoodad(s, t, job);
    case "PAYDAY":      return applyPayday(s, t, job);
    case "PAYDAY_PASS": return applyPaydayPass(s, t, job);
    case "CHARITY":     return applyCharity(s, t, job);
    case "BABY":        return applyBaby(s);
    case "DOWNSIZED":   return applyDownsized(s, t, job);
    case "DOWNSIZED_REST": return s;
    case "STOCK_SELL":  return applyStockSell(s, t);
    case "EXT_SELL":    return applyExtSell(s, t);
    // 2차 작업 신규 타입
    case "EXTRA_SPLIT": return applyExtraSplit(s, t);
    case "EXTRA_WIPE":  return applyExtraWipe(s);
    case "EXTRA_BUY":   return applyExtraBuy(s, t);
    case "EXTRA_LOAN":  return applyExtraLoan(s, t);
    case "EXTRA_CASH":  return applyExtraCash(s, t);
    case "DEBT_REPAY":  return applyDebtRepay(s, t);
    default: return s;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🎯 액션별 적용 함수
// ═══════════════════════════════════════════════════════════════

/**
 * OPPORTUNITY: 기회 카드 (buy/sell/split/rights/pass)
 * 
 * 필요 필드:
 *   buy:  _buyCost, _cf, _assetType, _assetName, _assetId, _shares?, _stockPrice?, _loan?, _card?
 *   sell: _stockName, _sellQty, _sellPrice
 *   split: _stockName, _multiplier
 *   rights: _rightsPrice
 *   pass: (없음)
 */
function applyOpportunity(s, t) {
  if (t.action === "buy") {
    const buyCost = t._buyCost || 0;
    const cf = t._cf || 0;
    const newAsset = {
      id: t._assetId,
      turn: t.turn,
      name: t._assetName || "",
      cf,
      type: t._assetType,
      shares: t._shares,
      price: t._stockPrice,
      downPay: buyCost,
      loan: t._loan || 0,
      card: t._card || t.card,
      time: t.time,
    };
    return {
      ...s,
      cash: s.cash - buyCost,
      assets: [...s.assets, newAsset],
      totalCF: s.totalCF + cf,
    };
  }
  
  if (t.action === "sell") {
    // 주식 매각 (OPPORTUNITY에서 직접) — 종목명 매칭으로 수량 감소
    const sName = (t._stockName || "").trim();
    const qty = t._sellQty || 0;
    const price = t._sellPrice || 0;
    return {
      ...s,
      cash: s.cash + price * qty,
      assets: reduceStockShares(s.assets, sName, qty),
    };
  }
  
  if (t.action === "split") {
    const sName = (t._stockName || "").trim();
    const mult = t._multiplier || 1;
    return {
      ...s,
      assets: s.assets.map(a => {
        if (a.type === "주식" && a.shares > 0 && a.name.includes(sName)) {
          // 증자: ×2 (floor), 감자: ×0.5 (반올림 - 홀수 처리)
          const newShares = mult >= 1 
            ? Math.floor(a.shares * mult)
            : Math.round(a.shares * mult);
          return { ...a, shares: newShares };
        }
        return a;
      }),
    };
  }
  
  if (t.action === "rights") {
    return { ...s, cash: s.cash + (t._rightsPrice || 0) };
  }
  
  // pass, hold 등: 변화 없음
  return s;
}

/**
 * MARKET: 마켓 카드 (sell/hold/na/damage)
 * 필요 필드: 
 *   sell:   _sellAssetId, _sellPrice, _assetCF, _assetLoan
 *   damage: _damageAmount (이미 채수 곱해진 총액)
 */
function applyMarket(s, t) {
  if (t.action === "sell") {
    const targetId = t._sellAssetId;
    const sellPrice = t._sellPrice || 0;
    const loan = t._assetLoan || 0;
    const cf = t._assetCF || 0;
    const net = Math.max(0, sellPrice - loan);
    return {
      ...s,
      cash: s.cash + net,
      assets: s.assets.filter(a => a.id !== targetId),
      totalCF: s.totalCF - cf,
    };
  }
  if (t.action === "damage") {
    const amount = t._damageAmount || 0;
    return { ...s, cash: s.cash - amount };
  }
  return s;
}

/**
 * DOODAD: 두댓 카드
 * 필요 필드: _amount, _isChildCard
 */
function applyDoodad(s, t) {
  const amt = t._amount || 0;
  const multiplier = t._isChildCard ? s.babies : 1;
  return { ...s, cash: s.cash - amt * multiplier };
}

/**
 * PAYDAY: 도착 칸 (일반) or 대출 서브케이스
 * 필요 필드:
 *   일반: _payAmount?  (저장된 값 OR 재계산)
 *   대출받기: _loanAction:"borrow", _loanAmount
 *   대출상환: _loanAction:"repay", _loanAmount
 */
function applyPayday(s, t, job) {
  if (t._loanAction === "borrow") {
    const amount = t._loanAmount || 0;
    const newLoan = s.bankLoan + amount;
    return {
      ...s,
      cash: s.cash + amount,
      bankLoan: newLoan,
      loanInterest: Math.round(newLoan * 0.1),
    };
  }
  if (t._loanAction === "repay") {
    const amount = t._loanAmount || 0;
    const newLoan = Math.max(0, s.bankLoan - amount);
    return {
      ...s,
      cash: s.cash - amount,
      bankLoan: newLoan,
      loanInterest: Math.round(newLoan * 0.1),
    };
  }
  // 일반 PayDay: 저장된 값 우선, 없으면 재계산
  const pay = (t._payAmount != null) 
    ? t._payAmount 
    : calcPayday(s, job);
  return { ...s, cash: s.cash + pay };
}

/**
 * PAYDAY_PASS: 지나간 페이데이
 */
function applyPaydayPass(s, t, job) {
  const pay = (t._payAmount != null) 
    ? t._payAmount 
    : calcPayday(s, job);
  return { ...s, cash: s.cash + pay };
}

/**
 * CHARITY: 기부 카드
 * 필요 필드: _donated, _donationAmount? (저장된 값)
 */
function applyCharity(s, t, job) {
  if (!t._donated) return s;
  const donation = (t._donationAmount != null)
    ? t._donationAmount
    : Math.round(((job?.salary || 0) + s.totalCF) * 0.1);
  return {
    ...s,
    cash: s.cash - donation,
    charityTurnsRemaining: 3, // 다음 3턴 주사위 2개
  };
}

/**
 * BABY: 아기 카드
 */
function applyBaby(s) {
  return { ...s, babies: Math.min(s.babies + 1, 3) };
}

/**
 * DOWNSIZED: 다운사이즈
 * 필요 필드: _expense? (당시 지출, 저장된 값)
 */
function applyDownsized(s, t, job) {
  const expense = (t._expense != null)
    ? t._expense
    : (job?.expense || 0) + (s.babies * (job?.childCost || 0)) + s.loanInterest;
  return {
    ...s,
    cash: s.cash - expense,
    downsizeRestRemaining: 2, // 다음 2턴 휴식
  };
}

/**
 * STOCK_SELL (자산 탭에서 직접 매각)
 * 필요 필드: _sellAssetId, _sellQty, _sellPrice
 */
function applyStockSell(s, t) {
  const targetId = t._sellAssetId;
  const qty = t._sellQty || 0;
  const price = t._sellPrice || 0;
  return {
    ...s,
    cash: s.cash + qty * price,
    assets: s.assets.flatMap(x => {
      if (x.id !== targetId) return [x];
      if (x.shares <= qty) return []; // 전량 매각
      return [{ ...x, shares: x.shares - qty }];
    }),
  };
}

/**
 * EXT_SELL: 타인 MARKET 카드로 자산 매도
 * 필요 필드: _sellAssetId, _sellPrice, _assetCF, _assetLoan
 */
function applyExtSell(s, t) {
  const targetId = t._sellAssetId;
  const sellPrice = t._sellPrice || 0;
  const loan = t._assetLoan || 0;
  const cf = t._assetCF || 0;
  const net = Math.max(0, sellPrice - loan);
  return {
    ...s,
    cash: s.cash + net,
    assets: s.assets.filter(a => a.id !== targetId),
    totalCF: s.totalCF - cf,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🆕 2차 작업용 신규 턴 타입
// ═══════════════════════════════════════════════════════════════

/**
 * EXTRA_SPLIT: 타인 기회카드의 증자/감자를 내 주식에 수동 적용
 * 필요 필드: _stockName, _multiplier (2 | 0.5)
 */
function applyExtraSplit(s, t) {
  const sName = (t._stockName || "").trim();
  const mult = t._multiplier || 1;
  return {
    ...s,
    assets: s.assets.map(a => {
      if (a.type === "주식" && a.shares > 0 && a.name.includes(sName)) {
        const newShares = mult >= 1 
          ? Math.floor(a.shares * mult)
          : Math.round(a.shares * mult);
        return { ...a, shares: newShares };
      }
      return a;
    }),
  };
}

/**
 * EXTRA_WIPE: 전 주식 상장폐지 (모든 주식 자산 제거)
 */
function applyExtraWipe(s) {
  return {
    ...s,
    assets: s.assets.filter(a => a.type !== "주식"),
  };
}

/**
 * EXTRA_BUY: 권리금 인수 (2차 작업) — 타인 카드 권리 구매로 자산 추가
 * 필요 필드: _buyCost(착수금), _cf, _assetType, _assetName, _assetId, _loan?, _deposit?(권리금), _forfeited?
 * _deposit: 권리금 (다른 플레이어에게 지불한 협상 금액). 착수금과 별도로 현금에서 추가 차감.
 * _forfeited=true: 권리금만 냈고 자산 구매는 포기 — 자산 추가 안 함, cash는 _deposit만 차감.
 * _loan이 있으면 은행 대출로 누적되어 매월 이자 차감.
 */
function applyExtraBuy(s, t) {
  const buyCost = t._buyCost || 0;
  const deposit = t._deposit || 0;
  // 포기: 권리금만 차감하고 끝
  if (t._forfeited) {
    return { ...s, cash: s.cash - deposit };
  }
  const cf = t._cf || 0;
  const loan = t._loan || 0;  // 카드의 자체 부채 (정보용, 신용대출에 합산 안 함)
  const newAsset = {
    id: t._assetId,
    turn: t.turn,
    name: t._assetName || "",
    cf,
    type: t._assetType || "사업",
    downPay: buyCost,
    loan,
    card: t._card || t.card,
    time: t.time,
  };
  // 카드의 대출(loan)은 이미 카드의 현금흐름(cf)에 이자가 차감되어 반영되어 있으므로
  // 신용대출(bankLoan)에 추가하지 않음. 자산의 일부로만 기록.
  return {
    ...s,
    cash: s.cash - buyCost - deposit,  // 권리금 + 착수금 모두 차감
    assets: [...s.assets, newAsset],
    totalCF: s.totalCF + cf,
    // bankLoan 변동 없음 (카드 자체 부채는 신용대출과 별개)
  };
}

/**
 * EXTRA_LOAN: 상시 은행 대출 (자산 탭)
 * 필요 필드: _loanAction ("borrow"|"repay"), _loanAmount
 */
function applyExtraLoan(s, t) {
  const amount = t._loanAmount || 0;
  if (t._loanAction === "borrow") {
    const newLoan = s.bankLoan + amount;
    return {
      ...s,
      cash: s.cash + amount,
      bankLoan: newLoan,
      loanInterest: Math.round(newLoan * 0.1),
    };
  }
  if (t._loanAction === "repay") {
    const newLoan = Math.max(0, s.bankLoan - amount);
    return {
      ...s,
      cash: s.cash - amount,
      bankLoan: newLoan,
      loanInterest: Math.round(newLoan * 0.1),
    };
  }
  return s;
}

/**
 * EXTRA_CASH: 현금 수동 보정 (턴 삭제 복원, 딜러 조정 등)
 * 필요 필드: _cashDelta (양수=입금, 음수=출금)
 */
function applyExtraCash(s, t) {
  return { ...s, cash: s.cash + (t._cashDelta || 0) };
}

/**
 * DEBT_REPAY: 직업 카드 부채 전액 상환
 * 필요 필드:
 *   _debtType: "homeMortgage" | "schoolLoan" | "carLoan" | "creditCard"
 *   _principal: 원금 (cash에서 차감)
 *   _payment: 월 상환액 (이후 expense 계산에서 제외되어야 함 — 파생 처리)
 *
 * 상환된 부채는 _repaidDebts Set에 누적되어 totalExpense 계산 시 반영됨.
 * 엔진 자체는 단순히 cash만 차감하고, expense 재계산은 computeGameState에서 처리.
 */
function applyDebtRepay(s, t) {
  const principal = t._principal || 0;
  const debtType = t._debtType;
  if (!debtType) return s;
  // _repaidDebts: 지금까지 상환된 부채 타입 Set (불변성 유지)
  const existing = s._repaidDebts || [];
  if (existing.includes(debtType)) return s; // 이미 상환됨
  return {
    ...s,
    cash: s.cash - principal,
    _repaidDebts: [...existing, debtType],
  };
}

// ═══════════════════════════════════════════════════════════════
// 🔧 유틸리티 함수
// ═══════════════════════════════════════════════════════════════

/**
 * 주식 수량 감소 (종목명 기반 매칭)
 * 수량이 0 이하가 되면 자산 제거
 */
function reduceStockShares(assets, stockName, qty) {
  let remaining = qty;
  return assets.flatMap(a => {
    if (remaining <= 0) return [a];
    if (a.type !== "주식" || !a.name.includes(stockName)) return [a];
    if (a.shares <= remaining) {
      remaining -= a.shares;
      return []; // 전량 매각
    }
    const newShares = a.shares - remaining;
    remaining = 0;
    return [{ ...a, shares: newShares }];
  });
}

/**
 * 현재 상태 기반 PayDay 금액 계산
 * = (월급 + 패시브인컴) - 총지출
 * = cashflow + totalCF - babies×childCost - loanInterest
 * (cashflow는 이미 salary - expense로 계산된 기본 순현금흐름)
 */
function calcPayday(s, job) {
  const childTotal = (s.babies || 0) * (job?.childCost || 0);
  // 상환된 직업 부채의 월 payment는 더 이상 지출되지 않으므로 현금흐름에 더해짐
  let repaidDebtSavings = 0;
  if (job?.liabilities && s._repaidDebts?.length) {
    for (const debtType of s._repaidDebts) {
      const d = job.liabilities[debtType];
      if (d) repaidDebtSavings += (d.payment || 0);
    }
  }
  return (job?.cashflow || 0) + s.totalCF - childTotal - s.loanInterest + repaidDebtSavings;
}

/**
 * 부동산 자산 1개의 유닛(채수) 추출
 * - 주택 3/2, 콘도, Starter → 1채
 * - N가구 주택 → N채
 * - 아파트 단지: desc나 name에서 "N채" / "N세대" 패턴 추출 (없으면 기본 1)
 * @param {Object} asset
 * @returns {number}
 */
export function getAssetUnits(asset) {
  if (!asset || asset.type !== "부동산") return 0;
  const hay = ((asset.name || "") + " " + (asset.card?.desc || "") + " " + (asset.card?.sub || ""));

  // N가구 주택 — 숫자 우선
  const multiMatch = hay.match(/(\d+)\s*가구/);
  if (multiMatch) return parseInt(multiMatch[1]) || 1;

  // N채 (아파트 단지 desc에 "12채", "24채", "60채")
  const unitMatch = hay.match(/(\d+)\s*채/);
  if (unitMatch) return parseInt(unitMatch[1]) || 1;

  // N세대 (아파트 단지 descriptions에 "세대" 쓰는 경우)
  const secMatch = hay.match(/(\d+)\s*세대/);
  if (secMatch) return parseInt(secMatch[1]) || 1;

  // 그 외 부동산(3/2 주택, 콘도, Starter House 등) → 1채
  return 1;
}

// ═══════════════════════════════════════════════════════════════
// 🏭 턴 팩토리 함수 (PlayMode에서 턴 entry 생성 시 사용)
// ═══════════════════════════════════════════════════════════════

/**
 * 고정 자산 ID 생성 (재계산에도 안정적)
 * 호출 시점의 타임스탬프 기반 — 턴 entry에 저장되면 영구적
 */
let _assetIdCounter = 0;
export function generateAssetId() {
  return `a${Date.now()}-${++_assetIdCounter}`;
}

/**
 * OPPORTUNITY buy 턴 entry 생성
 */
export function createBuyTurn(params) {
  const {
    turn, boardPos, dice, passedPaydays, dealType, card,
    buyCost, cf, assetType, assetName, shares, stockPrice, loan,
    time, decisionSec,
  } = params;
  return {
    turn, cellType: "OPPORTUNITY", boardPos, dice, passedPaydays,
    dealType, card, action: "buy",
    shares: assetType === "주식" ? shares : null,
    time, decisionSec,
    // 재계산용 필드
    _schemaVersion: SCHEMA_VERSION,
    _buyCost: buyCost,
    _cf: cf,
    _assetType: assetType,
    _assetName: assetName,
    _assetId: generateAssetId(),
    _shares: shares,
    _stockPrice: stockPrice,
    _loan: loan || 0,
    _card: card,
  };
}

/**
 * 주식 매각 턴 (OPPORTUNITY)
 */
export function createSellStockTurn(params) {
  const {
    turn, boardPos, dice, passedPaydays, dealType, card,
    stockName, sellQty, sellPrice,
    time, decisionSec,
  } = params;
  return {
    turn, cellType: "OPPORTUNITY", boardPos, dice, passedPaydays,
    dealType, card, action: "sell", shares: sellQty,
    time, decisionSec,
    _schemaVersion: SCHEMA_VERSION,
    _stockName: stockName,
    _sellQty: sellQty,
    _sellPrice: sellPrice,
  };
}

/**
 * 자산탭 주식 매각 턴 (STOCK_SELL)
 */
export function createStockSellTurn(params) {
  const { turn, assetId, stockName, sellQty, sellPrice, time } = params;
  return {
    turn, cellType: "STOCK_SELL", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "STOCK_SELL",
    card: { sub: stockName, price: `$${sellPrice}`, desc: `${stockName} ${sellQty}주 매각 @$${sellPrice}` },
    action: "sell", shares: sellQty, assetType: "주식",
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _sellAssetId: assetId,
    _sellQty: sellQty,
    _sellPrice: sellPrice,
  };
}

/**
 * MARKET 매각 턴
 */
export function createMarketSellTurn(params) {
  const {
    turn, boardPos, dice, passedPaydays, card,
    assetId, sellPrice, assetCF, assetLoan,
    time, decisionSec,
  } = params;
  return {
    turn, cellType: "MARKET", boardPos, dice, passedPaydays,
    dealType: "MARKET", card, action: "sell",
    time, decisionSec,
    _schemaVersion: SCHEMA_VERSION,
    _sellAssetId: assetId,
    _sellPrice: sellPrice,
    _assetCF: assetCF,
    _assetLoan: assetLoan,
  };
}

/**
 * DOODAD 턴
 */
export function createDoodadTurn(params) {
  const { turn, boardPos, dice, passedPaydays, card, amount, isChildCard, time, decisionSec } = params;
  return {
    turn, cellType: "DOODAD", boardPos, dice, passedPaydays,
    dealType: "DOODAD", card, action: null,
    time, decisionSec,
    _schemaVersion: SCHEMA_VERSION,
    _amount: amount,
    _isChildCard: isChildCard,
  };
}

/**
 * PAYDAY 턴 (일반)
 */
export function createPaydayTurn(params) {
  const { turn, boardPos, dice, passedPaydays, payAmount, time } = params;
  return {
    turn, cellType: "PAYDAY", boardPos, dice, passedPaydays,
    dealType: "PAYDAY", card: null, action: null,
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _payAmount: payAmount,
  };
}

/**
 * PAYDAY_PASS (지나간 페이데이)
 */
export function createPaydayPassTurn(params) {
  const { turn, boardPos, payAmount, time } = params;
  return {
    turn, cellType: "PAYDAY_PASS", boardPos, dice: 0, passedPaydays: 0,
    dealType: "PAYDAY", card: null, action: null,
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _payAmount: payAmount,
  };
}

/**
 * BABY 턴
 */
export function createBabyTurn(params) {
  const { turn, boardPos, dice, passedPaydays, time, decisionSec } = params;
  return {
    turn, cellType: "BABY", boardPos, dice, passedPaydays,
    dealType: "BABY", card: null, action: null,
    time, decisionSec,
    _schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * CHARITY 턴
 */
export function createCharityTurn(params) {
  const { turn, boardPos, dice, passedPaydays, donated, donationAmount, time, decisionSec } = params;
  return {
    turn, cellType: "CHARITY", boardPos, dice, passedPaydays,
    dealType: "CHARITY", card: null,
    action: donated ? "charity_yes" : "charity_no",
    time, decisionSec,
    _schemaVersion: SCHEMA_VERSION,
    _donated: donated,
    _donationAmount: donationAmount,
  };
}

/**
 * DOWNSIZED 턴
 */
export function createDownsizedTurn(params) {
  const { turn, boardPos, dice, passedPaydays, expense, time, decisionSec } = params;
  return {
    turn, cellType: "DOWNSIZED", boardPos, dice, passedPaydays,
    dealType: "DOWNSIZED", card: null, action: null,
    time, decisionSec,
    _schemaVersion: SCHEMA_VERSION,
    _expense: expense,
  };
}

// ── 2차 작업용 팩토리 ──

export function createExtraSplitTurn(params) {
  const { turn, stockName, multiplier, time } = params;
  return {
    turn, cellType: "EXTRA_SPLIT", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "EXTRA_SPLIT",
    card: { sub: stockName, desc: `${stockName} ${multiplier >= 1 ? "무상증자 ×2" : "1/2 감자"} (타인카드 적용)` },
    action: "split", time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _stockName: stockName,
    _multiplier: multiplier,
  };
}

export function createExtraWipeTurn(params = {}) {
  return {
    turn: params.turn || 0, cellType: "EXTRA_WIPE", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "EXTRA_WIPE",
    card: { sub: "전 주식 상장폐지", desc: "모든 주식 자산 $0 처리 (타인카드 적용)" },
    action: null, time: params.time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
  };
}

export function createExtraBuyTurn(params) {
  const {
    turn,
    assetName,
    assetType,
    deposit = 0,      // 권리금 (협상 금액, 다른 플레이어에게 지불)
    buyCost = 0,      // 착수금 (포기 시 0)
    cf = 0,
    loan = 0,
    time,
    forfeited = false,
    originalCard,
  } = params;
  const isForfeited = !!forfeited;
  const total = deposit + buyCost;
  const desc = isForfeited
    ? `권리금 $${deposit} 지불 후 ${assetName} 구매 포기 (자산 미인수, 권리금만 차감)`
    : deposit > 0
      ? `${assetName} 권리금 $${deposit} + 착수금 $${buyCost} = 총 $${total} 지불, 자산 인수 (CF +$${cf}/월${loan > 0 ? `, 대출 $${loan}` : ""})`
      : `${assetName} 착수금 $${buyCost} 지불, 자산 인수 (CF +$${cf}/월${loan > 0 ? `, 대출 $${loan}` : ""})`;
  return {
    turn, cellType: "EXTRA_BUY", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "EXTRA_BUY",
    card: originalCard ? { ...originalCard, _extraBuyMeta: true } : { sub: assetName, desc },
    action: isForfeited ? "forfeit" : "buy",
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _assetId: generateAssetId(),
    _buyCost: isForfeited ? 0 : buyCost,  // 착수금만. 포기 시 0.
    _deposit: deposit,                     // 권리금 (항상 저장)
    _cf: isForfeited ? 0 : cf,
    _assetType: assetType || "사업",
    _assetName: assetName,
    _loan: isForfeited ? 0 : loan,
    _forfeited: isForfeited,
    transaction: desc,
  };
}

export function createExtraLoanTurn(params) {
  const { turn, loanAction, loanAmount, time } = params;
  return {
    turn, cellType: "EXTRA_LOAN", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "EXTRA_LOAN",
    card: null,
    action: loanAction,
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _loanAction: loanAction,
    _loanAmount: loanAmount,
  };
}

export function createExtraCashTurn(params) {
  const { turn, cashDelta, reason, time } = params;
  return {
    turn, cellType: "EXTRA_CASH", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "EXTRA_CASH",
    card: { sub: "현금 보정", desc: reason || `현금 수동 조정 ${cashDelta >= 0 ? "+" : ""}$${cashDelta}` },
    action: null,
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _cashDelta: cashDelta,
  };
}

/**
 * 직업 카드 부채 전액 상환 턴 생성
 * @param {Object} params
 * @param {number} params.turn - 현재 턴 번호
 * @param {string} params.debtType - "homeMortgage" | "schoolLoan" | "carLoan" | "creditCard"
 * @param {string} params.debtLabel - 한국어 라벨 (UI 표시용)
 * @param {number} params.principal - 상환 원금
 * @param {number} params.payment - 월 상환액 (이후 현금흐름에 반영)
 * @param {number} [params.time] - 게임 경과 시간(초)
 */
export function createDebtRepayTurn(params) {
  const { turn, debtType, debtLabel, principal, payment, time } = params;
  return {
    turn, cellType: "DEBT_REPAY", boardPos: 0, dice: 0, passedPaydays: 0,
    dealType: "DEBT_REPAY",
    card: { sub: debtLabel || debtType, desc: `직업 부채 ${debtLabel || debtType} 전액 상환` },
    action: "repay",
    time, decisionSec: null,
    _schemaVersion: SCHEMA_VERSION,
    _debtType: debtType,
    _debtLabel: debtLabel || debtType,
    _principal: principal,
    _payment: payment,
    transaction: `💵 ${debtLabel || debtType} 전액 상환: -$${principal} (월 지출 -$${payment} 감소)`,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🔍 레거시 호환
// ═══════════════════════════════════════════════════════════════

/**
 * 턴 로그가 신규 스키마(v2)인지 체크
 * 레거시: _schemaVersion 없음 → 저장된 cash/assets 그대로 사용
 * 신규:   _schemaVersion 있음 → computeGameState로 재계산
 */
export function isLegacyTurnLog(turnLog) {
  if (!turnLog || turnLog.length === 0) return false;
  // 첫 번째 의미있는 턴(직업 선택 이후)을 체크
  return !turnLog.some(t => t._schemaVersion === SCHEMA_VERSION);
}

// ═══════════════════════════════════════════════════════════════
// 🧪 단위 테스트용 헬퍼 (개발 환경에서만)
// ═══════════════════════════════════════════════════════════════

/**
 * 수동 검증용: 주어진 상태와 예상값을 비교
 */
export function assertState(actual, expected, label = "") {
  const issues = [];
  for (const key of Object.keys(expected)) {
    if (key === "assets") {
      if (actual.assets.length !== expected.assets.length) {
        issues.push(`[${label}] assets.length: expected ${expected.assets.length}, got ${actual.assets.length}`);
      }
    } else if (actual[key] !== expected[key]) {
      issues.push(`[${label}] ${key}: expected ${expected[key]}, got ${actual[key]}`);
    }
  }
  return issues;
}
