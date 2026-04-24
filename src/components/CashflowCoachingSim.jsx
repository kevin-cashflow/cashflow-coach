"use client";

import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { signOut, getCurrentUser, isAdmin, getDisplayName } from "@/lib/auth";
import { deletePlayer as deletePlayerFromDB } from "@/lib/storage";
import AuthScreen from "./AuthScreen";
import GatePasswordDialog from "./GatePasswordDialog";
import TierBadge, { TierProgressCard } from "./TierBadge";
import TierUpModal from "./TierUpModal";
import { calculateTier, checkTierUp, getTierByCount } from "@/lib/tier";
import MyHistoryTab from "./MyHistoryTab";
import RankingTab from "./RankingTab";
import AdminPanel from "./AdminPanel";
import ProfileTab from "./ProfileTab";
import CoachBadge from "./CoachBadge";
import { saveEternalDebrief } from "./eternalStorage";
import { 
  saveGameSession, 
  saveGameSessionImmediate,
  loadGameSession, 
  deleteGameSession,
  hasGameSession,
  clearLocal as clearLocalGameSession,
} from "@/lib/gameSession";
import {
  SCHEMA_VERSION,
  computeGameState,
  isLegacyTurnLog,
  getAssetUnits,
  createBuyTurn,
  createSellStockTurn,
  createMarketSellTurn,
  createDoodadTurn,
  createPaydayTurn,
  createPaydayPassTurn,
  createCharityTurn,
  createBabyTurn,
  createDownsizedTurn,
  createStockSellTurn,
  createExtraSplitTurn,
  createExtraWipeTurn,
  createExtraBuyTurn,
  createExtraLoanTurn,
  createExtraCashTurn,
  createDebtRepayTurn,
} from "@/lib/gameStateEngine";

/* ═══════════════════════════════════════════════════
   24칸 쥐경주 판 배열 (확정)
   홀수(1,3,5,7,9,11,13,15,17,19,21,23) = 기회 (12칸)
   2,10,18 = Doodad (3칸)
   4 = 기부 (1칸)
   12 = 베이비 (1칸)
   20 = 다운사이즈 (1칸)
   8,16,24 = 마켓 (3칸)
   6,14,22 = 페이데이 (3칸)
═══════════════════════════════════════════════════ */

const BOARD = [];
for (let i = 1; i <= 24; i++) {
  if (i % 2 === 1) BOARD.push({ pos: i, type: "OPPORTUNITY", label: "기회", icon: "🎯", color: "#22c55e" });
  else if (i === 2 || i === 10 || i === 18) BOARD.push({ pos: i, type: "DOODAD", label: "두대드", icon: "🛍️", color: "#ec4899" });
  else if (i === 4) BOARD.push({ pos: i, type: "CHARITY", label: "기부", icon: "🤝", color: "#8b5cf6" });
  else if (i === 12) BOARD.push({ pos: i, type: "BABY", label: "베이비", icon: "👶", color: "#0ea5e9" });
  else if (i === 20) BOARD.push({ pos: i, type: "DOWNSIZED", label: "다운사이즈", icon: "⬇️", color: "#ef4444" });
  else if (i === 8 || i === 16 || i === 24) BOARD.push({ pos: i, type: "MARKET", label: "마켓", icon: "📊", color: "#3b82f6" });
  else if (i === 6 || i === 14 || i === 22) BOARD.push({ pos: i, type: "PAYDAY", label: "페이데이", icon: "💰", color: "#eab308" });
}

/* ═══════════════════════════════════════════════════
   카드 데이터 (180장 전체 - 이전 시뮬레이터에서 가져옴)
═══════════════════════════════════════════════════ */

const SMALL_DEALS = [
  { sub:"월트디즈니", price:"$5", desc:"3번째 대규모 손실 이후 영화 라이센스 관리자 해고. 회장의 보너스가 취소되었다." },
  { sub:"월트디즈니", price:"$10", desc:"새로운 테마공원 사업의 대규모 손실로 인하여 주가 폭락." },
  { sub:"월트디즈니", price:"$10", desc:"새롭게 시작한 뮤지컬 쇼의 흥행 실패로 주가 하락." },
  { sub:"월트디즈니", price:"$10", desc:"새로운 테마공원 사업의 대규모 손실로 인하여 주가 폭락." },
  { sub:"월트디즈니", price:"$10", desc:"코로나19로 인한 디즈니랜드 무기한 폐쇄. 매출에 큰 타격. 주가 폭락." },
  { sub:"월트디즈니", price:"$20", desc:"5건의 성공적인 인수합병을 진행한 CEO가 은퇴한다. 투자자들은 CEO의 변경에 우려." },
  { sub:"월트디즈니", price:"$30", desc:"새롭게 개봉한 영화가 긍정적인 반응. 매출의 증가 예상." },
  { sub:"월트디즈니", price:"$30", desc:"새로운 스튜디오를 오픈. 인터넷에서 폭발적인 반응으로 연일 예약이 가득." },
  { sub:"월트디즈니", price:"$40", desc:"어린이용 영화의 흥행 대성공으로 주가 상승." },
  { sub:"월트디즈니", price:"$50", desc:"경쟁사를 따돌리고 '21세기Fox' 인수 경쟁에서 승리. 차세대 미디어 주도권 확보." },
  { sub:"테슬라", price:"무상증자", desc:"사업이 성공. 보유 주식 수는 2배가 됨.", special:"2배 무상증자" },
  { sub:"테슬라", price:"1/2 감자", desc:"구조조정 중, 경기 침체와 과잉 투자로 대규모 손실. 주식 수 1/2로 줄임.", special:"1/2 감자" },
  { sub:"테슬라", price:"$5", desc:"높은 인플레이션 이자율은 이 전기차 제조사의 주가를 하락시켰다." },
  { sub:"테슬라", price:"$10", desc:"Space X. 우주로 가던 우주선의 폭발로 인한 주가 하락." },
  { sub:"테슬라", price:"$10", desc:"무역 시장의 대공황으로 이 전기차 제조사의 주가 하락." },
  { sub:"테슬라", price:"$10", desc:"CEO가 테슬라의 높은 주식가격을 우려하는 트위터를 적었다. 주가 하락." },
  { sub:"테슬라", price:"$20", desc:"상반기 실적이 작년에 비해 소규모 상승. 전문가들은 앞으로 주가가 오를 것으로 예측." },
  { sub:"테슬라", price:"$30", desc:"낮은 이자율로 인해 회사의 주가는 지속적인 상승세." },
  { sub:"테슬라", price:"$30", desc:"시장 호황으로 이 전기차 제조사의 주가가 최고로 올랐다." },
  { sub:"테슬라", price:"$40", desc:"시장 호황으로 이 전기차 제조사의 주가가 최고로 올랐다." },
  { sub:"테슬라", price:"$40", desc:"시장 강세로 인해 이 전기차 회사의 주가는 상승." },
  { sub:"테슬라", price:"$80", desc:"전 세계 자동차 시장의 흐름이 전기차로 변화. 시장 점유율 30% 돌파. 주가 고공행진." },
  { sub:"머크", price:"무상증자", desc:"오랜 역사를 가진 회사가 성공적이어서 주식을 2배 무상증자 결정.", special:"2배 무상증자" },
  { sub:"머크", price:"$1", desc:"시장 공황으로 인해 오랜 역사를 가진 회사의 주가폭락." },
  { sub:"머크", price:"$5", desc:"이자율의 상승으로 인해 오랜 역사를 가진 회사의 주가 폭락." },
  { sub:"머크", price:"$10", desc:"오랜 역사의 제약 제조사: 70대 이상 노인들을 위한 제약 제조 전문회사." },
  { sub:"머크", price:"$10", desc:"신약 개발에 주가 연구비 투입 결정. 회사의 소폭 하락." },
  { sub:"머크", price:"$10", desc:"오랜 역사의 제약 제조사: 70대 이상 노인들을 위한 제약 제조 전문회사." },
  { sub:"머크", price:"$30", desc:"낮은 이자율로 인해 이 제약회사의 주가는 지속적인 상승세." },
  { sub:"머크", price:"$30", desc:"낮은 이자율로 인해 이 제약회사의 주가는 지속적인 상승세." },
  { sub:"머크", price:"$40", desc:"시장 강세로 인해 오랜 역사를 가진 이 제약회사의 주가 상승." },
  { sub:"머크", price:"$40", desc:"시장 강세로 인해 오랜 역사를 가진 이 제약회사의 주가 상승." },
  { sub:"머크", price:"$50", desc:"물가폭등으로 오랜 역사를 가진 회사의 주가 상승." },
  { sub:"머크", price:"$60", desc:"전 세계적 바이러스에 노출. 연구진의 빠른 상황 파악으로 매진 개발 성공. 주가 폭등." },
  { sub:"콘도 방2/욕실1", price:"$60,000", desc:"부대시설을 갖춘 최고급 2/1 콘도. -24% ROI. 현금흐름 -$100.", down:"$5K", cf:"-$100", roi:"-24%" },
  { sub:"콘도 방2/욕실1", price:"$50,000", desc:"소유주의 결혼으로 근사한 2/1 콘도가 매물. 24% ROI. 현금흐름 +$100.", down:"$5K", cf:"+$100", roi:"24%" },
  { sub:"콘도 방2/욕실1", price:"$50,000", desc:"겨울 시즌 스키장 콘도가 매물. 29% ROI. 현금흐름 +$120.", down:"$5K", cf:"+$120", roi:"29%" },
  { sub:"콘도 방2/욕실1", price:"$40,000", desc:"부모가 자식이 살던 대학가의 콘도를 팔기 원함. 42% ROI. 현금흐름 +$140.", down:"$4K", cf:"+$140", roi:"42%" },
  { sub:"콘도 방2/욕실1", price:"$55,000", desc:"늘어나는 가족으로 인해 이사하려는 부부의 콘도 매물. 38% ROI. 현금흐름 +$160.", down:"$5K", cf:"+$160", roi:"38%" },
  { sub:"콘도 방2/욕실1", price:"$40,000", desc:"해변가에 위치한 콘도. 은퇴 노부부의 별장. 48% ROI. 현금흐름 +$200.", down:"$5K", cf:"+$200", roi:"48%" },
  { sub:"콘도 방2/욕실1", price:"$40,000", desc:"은행 압류! 53% ROI. 현금흐름 +$220.", down:"$5K", cf:"+$220", roi:"53%" },
  { sub:"주택 방3/욕실2", price:"$50,000", desc:"6개월 비어있는 집 은행 압류. -60% ROI. 현금흐름 -$100.", down:"$2K", cf:"-$100", roi:"-60%" },
  { sub:"주택 방3/욕실2", price:"$50,000", desc:"구 시가지 3/2 집 고속도로 관리 공단에서 내놓음. 현금흐름 -$100.", down:"$5K", cf:"-$100", roi:"??" },
  { sub:"주택 방3/욕실2", price:"$35,000", desc:"좋은 매물이다!! 정부가 대출 제공. 132% ROI. 현금흐름 +$220. 꼭 사시오!", down:"$2K", cf:"+$220", roi:"132%", special:"좋은 매물" },
  { sub:"주택 방3/욕실2", price:"$45,000", desc:"좋은 매물이다!! 150% ROI. 현금흐름 +$250. 꼭 사시오!!", down:"$2K", cf:"+$250", roi:"150%", special:"좋은 매물" },
  { sub:"주택 방3/욕실2", price:"$65,000", desc:"자산 동결로 좋은 3/2 집 매물. 38% ROI. 현금흐름 +$160.", down:"$5K", cf:"+$160", roi:"38%" },
  { sub:"주택 방3/욕실2", price:"$50,000", desc:"소유주가 해외로 이민. 39% ROI. 현금흐름 +$130.", down:"$4K", cf:"+$130", roi:"39%" },
  { sub:"주택 방3/욕실2", price:"$50,000", desc:"소유자가 갑작스럽게 이사. 40% ROI. 현금흐름 +$100.", down:"$3K", cf:"+$100", roi:"40%" },
  { sub:"주택 방3/욕실2", price:"$65,000", desc:"소유자가 지방으로 이사. 투자하기 좋은 매물. 48% ROI. 현금흐름 +$120.", down:"$3K", cf:"+$120", roi:"48%" },
  { sub:"12,000평의 땅", price:"$5,000", desc:"아름다운 공원 같은 지역. 도로 및 편의시설 없음. 0% ROI.", down:"$5K", cf:"$0", roi:"0%" },
  { sub:"부업으로 사업 시작", price:"$3,000", desc:"작은 상품을 생산할 수 있는 새로운 기술을 발명. 초기 이윤 없음.", cf:"$0", roi:"??" },
  { sub:"부업으로 사업 시작", price:"$5,000", desc:"창의적인 컴퓨터 프로그램을 개발하여 창업. 초기 이윤 없음.", cf:"$0", roi:"??" },
];

const BIG_DEALS = [
  { sub:"주택 3/2", price:"$125,000", desc:"수영장 완벽한 3/2 주택. 중상류층 거주 지역. -6% ROI. 착수금 $20,000.", down:"$20K", cf:"-$100" },
  { sub:"주택 3/2", price:"$100,000", desc:"이혼으로 인해 3/2 주택 매물. 30% ROI. 착수금 $20,000.", down:"$20K", cf:"+$500" },
  { sub:"주택 3/2", price:"$70,000", desc:"사업자가 3/2 주택을 팔아 사업자금으로. 26% ROI. 착수금 $7,000.", down:"$7K", cf:"+$150" },
  { sub:"주택 3/2", price:"$60,000", desc:"상류층 대출 없는 완벽한 집. 30% ROI. 착수금 $60,000. (올캐시 매입 - 대출 없음)", down:"$60K", cf:"+$1,500" },
  { sub:"주택 3/2", price:"$90,000", desc:"정리 해고 된 매니저가 내놓음. 40% ROI. 착수금 $9,000.", down:"$9K", cf:"+$300" },
  { sub:"주택 3/2", price:"$120,000", desc:"다른 지역으로 이주한 상인이 관리한 집. 40% ROI. 착수금 $12,000.", down:"$12K", cf:"+$400" },
  { sub:"주택 3/2", price:"$80,000", desc:"투자가치가 있는 매물. 45% ROI. 착수금 $8,000.", down:"$8K", cf:"+$300" },
  { sub:"주택 3/2", price:"$70,000", desc:"골프코스 근처 3/2 주택. 51% ROI. 착수금 $7,000.", down:"$7K", cf:"+$300" },
  { sub:"주택 3/2", price:"$90,000", desc:"은퇴한 젊은부부가 전원 생활 위해 내놓음. 40% ROI. 착수금 $9,000.", down:"$9K", cf:"+$300" },
  { sub:"주택 3/2", price:"$120,000", desc:"도심 한가운데 고즈넉한 3/2 주택. 40% ROI. 착수금 $12,000.", down:"$12K", cf:"+$400" },
  { sub:"2가구 주택", price:"$70,000", desc:"동네에서 가장 좋은 2가구 주택. 24% ROI. 착수금 $7,000. 대출 $63,000.", down:"$7K", cf:"+$140" },
  { sub:"2가구 주택", price:"$80,000", desc:"늘어나는 가족 때문에 매물. 36% ROI. 착수금 $8,000. 대출 $72,000.", down:"$8K", cf:"+$240" },
  { sub:"2가구 주택", price:"$120,000", desc:"병원비 충당 위해 내놓은 매물. 40% ROI. 착수금 $12,000. 대출 $108,000.", down:"$12K", cf:"+$400" },
  { sub:"4가구 주택", price:"$80,000", desc:"공원 근처 급매물. 48% ROI. 착수금 $8,000. 대출 $72,000.", down:"$8K", cf:"+$320" },
  { sub:"4가구 주택", price:"$200,000", desc:"대학교 근처 4가구. 24% ROI. 착수금 $20,000. 대출 $180,000.", down:"$20K", cf:"+$400" },
  { sub:"4가구 주택", price:"$150,000", desc:"고속도로 옆 넓은 4가구. 40% ROI. 착수금 $15,000. 대출 $135,000.", down:"$15K", cf:"+$500" },
  { sub:"4가구 주택", price:"$150,000", desc:"좋은 환경 4가구 주택. 48% ROI. 착수금 $15,000. 대출 $135,000.", down:"$15K", cf:"+$600" },
  { sub:"4가구 주택", price:"$200,000", desc:"재번성 지역 4가구. 48% ROI. 착수금 $20,000. 대출 $180,000.", down:"$20K", cf:"+$800" },
  { sub:"4가구 주택", price:"$160,000", desc:"강제 경매 4가구. 56% ROI. 착수금 $16,000. 대출 $144,000.", down:"$16K", cf:"+$750" },
  { sub:"4가구 주택", price:"$320,000", desc:"서류완비, 전부 임차 중. 75% ROI. 착수금 $32,000. 대출 $288,000.", down:"$32K", cf:"+$2,000" },
  { sub:"8가구 주택", price:"$400,000", desc:"소유주 은퇴 좋은 가격. 29% ROI. 착수금 $40,000. 대출 $360,000.", down:"$40K", cf:"+$950" },
  { sub:"8가구 주택", price:"$400,000", desc:"법적 문제로 급매. 48% ROI. 착수금 $40,000. 대출 $360,000.", down:"$40K", cf:"+$1,600" },
  { sub:"8가구 주택", price:"$400,000", desc:"합리적 가격 매물. 51% ROI. 착수금 $40,000. 대출 $360,000.", down:"$40K", cf:"+$1,700" },
  { sub:"8가구 주택", price:"$320,000", desc:"전문직 사업자금 마련. 64% ROI. 착수금 $32,000. 대출 $288,000.", down:"$32K", cf:"+$1,700" },
  { sub:"아파트 단지", price:"$750,000", desc:"24채 아파트 단지. 54% ROI. 착수금 $75,000. 대출 $675,000.", down:"$75K", cf:"+$3,400" },
  { sub:"아파트 단지", price:"$500,000", desc:"12채 아파트 단지. 58% ROI. 착수금 $50,000. 대출 $450,000.", down:"$50K", cf:"+$2,400" },
  { sub:"아파트 단지", price:"$1,200,000", desc:"60채 정부 보조아파트. 66% ROI. 착수금 $200,000. 대출 $1,000,000.", down:"$200K", cf:"+$11,000" },
  { sub:"PC 게임방", price:"$20,000", desc:"30개의 PC 게임방 급매물. 96% ROI. 착수금 $20,000. (대출 없음 - 올캐시 사업).", down:"$20K", cf:"+$1,600" },
  { sub:"세탁소", price:"$30,000", desc:"번화한 도로 옆 성공한 세탁소. 100% ROI. 착수금 $30,000. (대출 없음 - 올캐시 사업).", down:"$30K", cf:"+$2,500" },
  { sub:"문구 도매", price:"$40,000", desc:"성공한 문구 도매사업. 81% ROI. 착수금 $40,000. (대출 없음 - 올캐시 사업).", down:"$40K", cf:"+$2,700" },
  { sub:"빨래방", price:"$25,000", desc:"교차로 옆 성공한 4개의 빨래방. 86% ROI. 착수금 $25,000. (대출 없음 - 올캐시 사업).", down:"$25K", cf:"+$1,800" },
  { sub:"도넛 프랜차이즈", price:"$500,000", desc:"세계적 도넛 회사 체인점. 60% ROI. 착수금 $150,000. 대출 $350,000.", down:"$150K", cf:"+$4,700" },
  { sub:"세차장", price:"$50,000", desc:"가족 불화로 급매. 36% ROI. 착수금 $50,000. (대출 없음 - 올캐시 사업).", down:"$50K", cf:"+$1,500" },
  { sub:"피자 프랜차이즈", price:"$100,000", desc:"건강식 피자 체인. 60% ROI. 착수금 $100,000. (대출 없음 - 올캐시 사업).", down:"$100K", cf:"+$5,000" },
  { sub:"작은 모텔(B&B)", price:"$30,000", desc:"리조트 지역 많은 단골. 40% ROI. 착수금 $30,000. (대출 없음 - 올캐시 사업).", down:"$30K", cf:"+$1,000" },
  { sub:"작은 쇼핑몰", price:"$50,000", desc:"파산으로 은행에서 인수한 매물. 19% ROI. 착수금 $50,000. (대출 없음 - 올캐시 사업).", down:"$50K", cf:"+$800" },
  { sub:"24,000평 땅", price:"$20,000", desc:"주거지 용도 빈 공터. 상업지역 전환 가능성. 0% ROI. 착수금 $20,000. (대출 없음 - 올캐시 매입).", down:"$20K", cf:"$0" },
  { sub:"동업(자동차리스)", price:"$30,000", desc:"중고 자동차 리스 사업 확장. 40% ROI. 착수금 $30,000. (대출 없음 - 지분 매입).", down:"$30K", cf:"+$1,000" },
  { sub:"동업(냉동피자)", price:"$20,000", desc:"피자 체인 냉동 피자 사업 확장. 48% ROI. 착수금 $20,000. (대출 없음 - 지분 매입).", down:"$20K", cf:"+$800" },
  { sub:"동업(병원확장)", price:"$25,000", desc:"의사가 병원 확장. 48% ROI. 착수금 $25,000. (대출 없음 - 지분 매입).", down:"$25K", cf:"+$1,000" },
  { sub:"동업(샌드위치)", price:"$30,000", desc:"샌드위치 가게 확장. 60% ROI. 착수금 $30,000. (대출 없음 - 지분 매입).", down:"$30K", cf:"+$1,500" },
];

const MARKETS = [
  { desc:"콘도 2/1을 $45,000에 팔라는 제안.", sell:"$45,000" },
  { desc:"콘도 2/1을 $55,000에 팔라는 제안.", sell:"$55,000" },
  { desc:"콘도 2/1을 $55,000에 팔라는 제안.", sell:"$55,000" },
  { desc:"콘도 2/1을 $55,000에 팔라는 제안.", sell:"$55,000" },
  { desc:"콘도 2/1을 $60,000에 팔라는 제안.", sell:"$60,000" },
  { desc:"콘도 2/1을 $65,000에 팔라는 제안.", sell:"$65,000" },
  { desc:"주택 3/2를 $65,000에 팔라는 제안.", sell:"$65,000" },
  { desc:"주택 3/2를 $65,000에 팔라는 제안.", sell:"$65,000" },
  { desc:"주택 3/2를 $75,000에 팔라는 제안.", sell:"$75,000" },
  { desc:"주택 3/2를 $80,000에 팔라는 제안.", sell:"$80,000" },
  { desc:"주택 3/2를 $90,000에 팔라는 제안.", sell:"$90,000" },
  { desc:"주택 3/2를 $100,000에 팔라는 제안.", sell:"$100,000" },
  { desc:"주택 3/2를 $100,000에 팔라는 제안.", sell:"$100,000" },
  { desc:"주택 3/2를 $110,000에 팔라는 제안.", sell:"$110,000" },
  { desc:"주택 3/2를 $135,000에 팔라는 제안.", sell:"$135,000" },
  { desc:"주택 3/2를 $135,000에 팔라는 제안.", sell:"$135,000" },
  { desc:"다가구 주택 가구당 $30,000에 팔라는 제안.", sell:"가구당$30K" },
  { desc:"다가구 주택 가구당 $30,000에 팔라는 제안.", sell:"가구당$30K" },
  { desc:"다가구 주택 가구당 $35,000에 팔라는 제안.", sell:"가구당$35K" },
  { desc:"다가구 주택 가구당 $35,000에 팔라는 제안.", sell:"가구당$35K" },
  { desc:"다가구 주택 가구당 $35,000에 팔라는 제안. (다른 게이머 해당 없음)", sell:"가구당$35K" },
  { desc:"다가구 주택 가구당 $35,000에 팔라는 제안.", sell:"가구당$35K" },
  { desc:"다가구 주택 가구당 $40,000에 팔라는 제안.", sell:"가구당$40K" },
  { desc:"다가구 주택 가구당 $40,000에 팔라는 제안.", sell:"가구당$40K" },
  { desc:"아파트 단지 1채당 $30,000에 제안.", sell:"1채당$30K" },
  { desc:"아파트 단지 1채당 $40,000에 제안.", sell:"1채당$40K" },
  { desc:"12,000평 땅을 $150,000에 팔 수 있다.", sell:"$150,000" },
  { desc:"24,000평 땅을 $250,000에 팔 수 있다.", sell:"$250,000" },
  { desc:"세차장 매수 — 최대 $250,000 현금.", sell:"≤$250K" },
  { desc:"쇼핑몰 매수 — $100,000에 구매 원함.", sell:"$100K" },
  { desc:"B&B 매수 — $250,000 지불 가능.", sell:"$250K" },
  { desc:"임차인이 자산 손상. 1채당 $300 지불.", sell:null, special:"손상 $300/채" },
  { desc:"임차인이 자산 손상. 1채당 $500 지불.", sell:null, special:"손상 $500/채" },
  { desc:"인플레이션! 은행에서 대출한 모든 3/2 주택 소유 권리 상실!", sell:null, special:"3/2 주택 몰수" },
  { desc:"이자율 하락! 3/2 주택 소유 시 (주택 가격 + $50,000 − 대출) = 차익으로 매각.", sell:"+$50,000", special:"+$50K 매각" },
  { desc:"국제 금융 위기!! 모든 주식 상장 폐지!", sell:null, special:"주식 전량 폐지" },
  { desc:"동업 파트너가 지분 가격의 3배에 매수.", sell:"지분×3" },
  { desc:"동업 파트너가 지분 가격의 5배에 매수.", sell:"지분×5" },
  { desc:"동업 파트너가 지분 가격의 2배에 매수.", sell:"지분×2" },
  { desc:"소프트웨어 회사를 $100,000에 매수 원함.", sell:"$100K" },
  { desc:"작은 상품 판매 회사를 $80,000에 매수.", sell:"$80K" },
  { desc:"작은 사업체 매출 증가. 현금흐름 +$250.", sell:null, special:"CF +$250" },
  { desc:"작은 사업체 매출 증가. 현금흐름 +$400.", sell:null, special:"CF +$400" },
  { desc:"노후 배관 교체. 다가구 주택 보유 시 $2,000 지불.", sell:null, special:"다가구 수리비 $2K" },
];

const DOODADS = [
  // 일반 두둣 (가나다순)
  { desc:"가구 거래 — 당근에서 6인용 테이블", amount:"$150" },
  { desc:"가족 휴가!", amount:"$2,000" },
  { desc:"결혼 기념일", amount:"$500" },
  { desc:"고등학교 동창회", amount:"$250" },
  { desc:"골프 2라운드 플레이", amount:"$200" },
  { desc:"공기청정기를 구매", amount:"$1,500" },
  { desc:"볼링을 치다", amount:"$50" },
  { desc:"비행기 에어쇼 구경", amount:"$150" },
  { desc:"새 낚시대 구입", amount:"$300" },
  { desc:"새 볼링공 구입", amount:"$100" },
  { desc:"새 아이폰 구입", amount:"$1,400" },
  { desc:"새 옷을 구입", amount:"$250" },
  { desc:"새 테니스 라켓 구입", amount:"$200" },
  { desc:"새로운 운동화를 구매", amount:"$100" },
  { desc:"식품 조리기 구입", amount:"$150" },
  { desc:"쇼핑 중독! 새 손목시계 구매", amount:"$150" },
  { desc:"쇼핑! 멋진 모조 보석 구입", amount:"$350" },
  { desc:"일시 해고 소문 — 학원 등록금과 교재비", amount:"$220" },
  { desc:"자동차 에어컨 고장", amount:"$700" },
  { desc:"자동차 타이어 교체", amount:"$300" },
  { desc:"저녁 외식", amount:"$100" },
  { desc:"주정차 단속 지역에 주차", amount:"$100" },
  { desc:"주정차 단속 지역에 주차", amount:"$100" },
  { desc:"지역 화가의 새 그림을 구매", amount:"$200" },
  { desc:"집을 페인트칠", amount:"$600" },
  { desc:"치과 방문", amount:"$200" },
  { desc:"친구와 브런치", amount:"$50" },
  { desc:"친구와 커피 한잔", amount:"$30" },
  { desc:"카지노에 가다!", amount:"$500" },
  { desc:"카푸치노 커피 기계를 구입", amount:"$350" },
  { desc:"콘서트를 가다!", amount:"$250" },
  { desc:"취미로 프리다이빙을 배운다", amount:"$500" },
  { desc:"행운의 복권 구입 — 꽝!", amount:"$100" },
  { desc:"홈씨어터 구축", amount:"$500" },
  { desc:"회계 감사 — 국세청에 $750", amount:"$750" },

  // 자녀 조건부 (가나다순)
  { desc:"딸의 결혼식 (자녀 있을 때)", amount:"$5,000", condition:"자녀" },
  { desc:"생일 파티! 놀이공원 (인원×$100)", amount:"인원×$100", condition:"자녀" },
  { desc:"아들의 대학 등록금 (자녀 있을 때)", amount:"$3,000", condition:"자녀" },
  { desc:"아이들에게 장난감 (아이당 $100)", amount:"아이당$100", condition:"자녀" },
  { desc:"자녀의 치아 교정 (자녀 있을 때)", amount:"$2,000", condition:"자녀" },

  // 부채 발생 (가나다순)
  { desc:"새 캠핑 카라반! 선불$1K + 대출$17K + 이자$340/월", amount:"대출$17K", condition:"부채발생" },
  { desc:"일체형 세탁 건조기! 부채 $5,000 + 이자 $120/월", amount:"부채$5K", condition:"부채발생" },

  // 특수 (양육비 감소)
  { desc:"드디어 아이가 독립했다!! 양육비 1명 삭제!", amount:"양육비↓", special:"지출 감소" },
];

/* ═══════════════════════════════════════════════════
   202 카드덱 (162장) — Capital Gain Deal / CashFlow Deal / MARKET / DOODAD
═══════════════════════════════════════════════════ */

// Capital Gain Deal (~42장) — 시세차익 카드
const CG_202 = [
  { sub:"2가구 주택 (상속)", desc:"큰 고모가 당신에게 선물을 남겼다. 상속을 받으려면 $3,000의 수수료를 변호사에게 지불. 40% ROI.", cf:"+$300", roi:"40%" },
  { sub:"부동산 판매 48,000평 땅", desc:"사용하지 않은 농촌지역의 땅 48,000평. 접근 도로가 없고 들, 전기 시설 없음. -12% ROI.", cf:"-$200", roi:"-12%" },
  { sub:"파산 판매 24,000평 땅", desc:"파산한 투기꾼이 땅 24,000평을 판매한다. 길도 없고, 농사도 짓지 않음.", cf:"$0", roi:"??" },
  { sub:"개인 매매 — 피산한 농장", desc:"경매에서 낙찰 받은 농장. 48,000평의 땅을 $30,000에 끌끼다고 계약했다. 땅은 현재 비어있다.", cf:"$0", roi:"??" },
  { sub:"압류 된 다가구 주택 판매", desc:"파산한 은행에 압류되어 있던 2가구 주택 매물. 120% ROI. 현금흐름 +$150.", cf:"+$150", roi:"120%" },
  { sub:"Starter House 방2/욕실1", desc:"'Start House' 저급 근린 지역 2/1 주택. 3% ROI.", cf:"-$10", roi:"3%" },
  { sub:"Starter House 방2/욕실1", desc:"서쪽 단지 근처의 'Start House' 2/1 주택. 4% ROI.", cf:"+$20", roi:"4%" },
  { sub:"Starter House 방2/욕실1", desc:"철길 근처의 'Start House' 2/1 주택. -5% ROI.", cf:"-$10", roi:"-5%" },
  { sub:"Starter House 방2/욕실1", desc:"큰 공장 단지 근처의 'Start House' 2/1 주택. 4% ROI.", cf:"+$10", roi:"4%" },
  { sub:"Starter House 방2/욕실1", desc:"대학 근처의 'Start House' 2/1 주택. 4% ROI.", cf:"+$20", roi:"4%" },
  { sub:"모더나(MRNA) Call 옵션", desc:"옵션가 주당 $1. 이후 누구든 모더나 주식을 팔을 때, 주당 $20에 구매 가능. 3턴 미행사 시 소멸.", special:"Call $1" },
  { sub:"모더나(MRNA) Call 옵션", desc:"옵션가 주당 $2. 주당 $15에 구매 가능. 3턴 미행사 시 소멸.", special:"Call $2" },
  { sub:"모더나(MRNA) Call 옵션", desc:"옵션가 주당 $4. 주당 $10에 구매 가능. 3턴 미행사 시 소멸.", special:"Call $4" },
  { sub:"모더나(MRNA) Put 옵션", desc:"옵션가 주당 $2. 주당 $35에 팔 수 있다. 3턴 미행사 시 소멸.", special:"Put $2" },
  { sub:"모더나(MRNA) Put 옵션", desc:"옵션가 주당 $4. 주당 $40에 팔 수 있다. 3턴 미행사 시 소멸.", special:"Put $4" },
  { sub:"애플(AAPL) Call 옵션", desc:"옵션가 주당 $1. 주당 $20에 구매 가능. 3턴 미행사 시 소멸.", special:"Call $1" },
  { sub:"애플(AAPL) Call 옵션", desc:"옵션가 주당 $2. 주당 $15에 구매 가능. 3턴 미행사 시 소멸.", special:"Call $2" },
  { sub:"애플(AAPL) Call 옵션", desc:"옵션가 주당 $4. 주당 $10에 구매 가능. 3턴 미행사 시 소멸.", special:"Call $4" },
  { sub:"애플(AAPL) Put 옵션", desc:"옵션가 주당 $2. 주당 $35에 팔 수 있다. 3턴 미행사 시 소멸.", special:"Put $2" },
  { sub:"애플(AAPL) Put 옵션", desc:"옵션가 주당 $4. 주당 $40에 팔 수 있다. 3턴 미행사 시 소멸.", special:"Put $4" },
  { sub:"네트워크 마케팅 [가입]", desc:"직접판매회사인 Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"네트워크 마케팅 [가입]", desc:"직접판매회사인 Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"네트워크 마케팅 [가입]", desc:"직접판매회사인 Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"네트워크 마케팅 [가입]", desc:"직접판매회사인 Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"네트워크 마케팅 [가입]", desc:"직접판매회사인 Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"모더나(MRNA) 주식", price:"$5", desc:"이 카드를 뽑은 사람과 풋 옵션, 콜옵션 소유자만 이 주식을 사거나 팔 수 있다. 공매도 한 사람은 반드시 구매해야 한다." },
  { sub:"모더나(MRNA) 주식", price:"$1", desc:"모든 사람들은 이 가격에 팔 수 있다. 공매도 한 사람은 반드시 구매해야 한다." },
  { sub:"모더나(MRNA) 주식", price:"$10", desc:"모든 사람들은 이 가격에 팔 수 있다." },
  { sub:"모더나(MRNA) 주식", price:"$10", desc:"이 카드를 뽑은 사람과 풋 옵션, 콜옵션 소유자만." },
  { sub:"모더나(MRNA) 주식", price:"$40", desc:"모든 사람들은 이 가격에 팔 수 있다." },
  { sub:"모더나(MRNA) 주식", price:"$40", desc:"이 카드를 뽑은 사람과 풋 옵션, 콜옵션 소유자만." },
  { sub:"모더나(MRNA) 주식", price:"$60", desc:"모든 사람들은 이 가격에 팔 수 있다." },
  { sub:"애플(AAPL) 주식", price:"$5", desc:"이 카드를 뽑은 사람과 풋 옵션, 콜옵션 소유자만. 공매도 한 사람은 반드시 구매해야 한다." },
  { sub:"애플(AAPL) 주식", price:"$10", desc:"모든 사람들은 이 가격에 팔 수 있다." },
  { sub:"애플(AAPL) 주식", price:"$10", desc:"이 카드를 뽑은 사람과 풋 옵션, 콜옵션 소유자만." },
  { sub:"애플(AAPL) 주식", price:"$40", desc:"모든 사람들은 이 가격에 팔 수 있다." },
  { sub:"애플(AAPL) 주식", price:"$40", desc:"이 카드를 뽑은 사람과 풋 옵션, 콜옵션 소유자만." },
  { sub:"애플(AAPL) 주식", price:"$50", desc:"모든 사람들은 이 가격에 팔 수 있다." },
  { sub:"잠들지 못하는 밤", desc:"모더나의 수익은 급격히 하락하고 주가는 $5로 떨어졌다. 당신의 오른쪽 사람은 이것을 기회로 삼는다. 모더나 $5에 살 수 있다.", special:"특수이벤트" },
  { sub:"의심의 목소리", desc:"애플의 판매량은 급격히 감소하고 주가는 $5로 떨어졌다. 당신의 오른쪽 사람은 이것을 기회로 삼는다. 애플 $5에 살 수 있다.", special:"특수이벤트" },
  { sub:"24,000의 황무지", desc:"아름다운 공원 같은 24,000평의 미개발 토지. 편의시설 없음, 도로 없음. -12% ROI.", cf:"-$150", roi:"-12%" },
];

// CashFlow Deal (~44장) — 현금흐름 카드
const CF_202 = [
  { sub:"2가구 주택", desc:"고속도로 근처 접근성이 좋다. 40% ROI.", down:"$12K", cf:"+$400", roi:"40%" },
  { sub:"2가구 주택", desc:"재개발된 지역. 높은 임대수요. 36% ROI.", down:"$8K", cf:"+$240", roi:"36%" },
  { sub:"2가구 주택", desc:"부동산 포트폴리오에 추가하기 좋은 매물. 48% ROI.", down:"$8K", cf:"+$320", roi:"48%" },
  { sub:"2가구 주택", desc:"좋은 시가지 근처. 34% ROI.", down:"$10K", cf:"+$280", roi:"34%" },
  { sub:"2가구 주택", desc:"시내 외곽의 조용한 주택단지. 60% ROI.", down:"$9K", cf:"+$450", roi:"60%" },
  { sub:"4가구 주택", desc:"교직원들에게 인기 있는 임대 주택. 대학교 캠퍼스 근처. 40% ROI.", down:"$15K", cf:"+$500", roi:"40%" },
  { sub:"4가구 주택", desc:"외관이 독특하게 지어진 건물. 젊은 전문직 종사자들에게 반응이 좋다. 48% ROI.", down:"$20K", cf:"+$800", roi:"48%" },
  { sub:"4가구 주택", desc:"세계적 개발되고 있는 도시외곽의 임대 주택. 대중교통이 잘 뚫어있다. 56% ROI.", down:"$32K", cf:"+$1,500", roi:"56%" },
  { sub:"4가구 주택", desc:"가족이 안전하게 지낼 수 있는 집. 보안 시설 완비. 48% ROI.", down:"$15K", cf:"+$600", roi:"48%" },
  { sub:"4가구 주택", desc:"리모델링이 끝난 튼튼한 집. 지붕 새롭게 교체. 56% ROI.", down:"$16K", cf:"+$750", roi:"56%" },
  { sub:"4가구 주택", desc:"관리가 잘 된 역세권 근처의 집. 편의시설 완비. 41% ROI.", down:"$25K", cf:"+$850", roi:"41%" },
  { sub:"8가구 주택", desc:"훌륭한 입지여건. 공실률이 낮다. 48% ROI.", down:"$40K", cf:"+$1,600", roi:"48%" },
  { sub:"8가구 주택", desc:"완벽한 현금흐름을 가진 부동산. 51% ROI.", down:"$40K", cf:"+$1,700", roi:"51%" },
  { sub:"8가구 주택", desc:"관리가 쉬운 부동산. 보수할 곳이 거의 없다. 50% ROI.", down:"$30K", cf:"+$1,250", roi:"50%" },
  { sub:"8가구 주택", desc:"급매!! 수요가 높은 부동산. 56% ROI.", down:"$32K", cf:"+$1,500", roi:"56%" },
  { sub:"8가구 주택", desc:"정부기관 근처의 주택단지. 공무원들이 선호하는 지역. 61% ROI.", down:"$35K", cf:"+$1,800", roi:"61%" },
  { sub:"아파트 단지", desc:"8년 된 아파트 단지. 조경이 필요. 24세대. 46% ROI.", down:"$65K", cf:"+$2,500", roi:"46%" },
  { sub:"아파트 단지", desc:"뛰어난 부동산 매니저. 30세대. 54% ROI.", down:"$100K", cf:"+$4,500", roi:"54%" },
  { sub:"아파트 단지", desc:"주변에 일자리가 많아 임대 수요가 높다. 50세대. 48% ROI.", down:"$20K", cf:"+$8,000", roi:"48%" },
  { sub:"아파트 단지", desc:"오래된 12세대 아파트. 시설물 배관공사와 전기공사비 아직 미정. 48% ROI.", down:"$50K", cf:"+$2,000", roi:"48%" },
  { sub:"NW 마케팅 [핀업2]", desc:"파트너 후원 성공. 현금흐름 +$700.", cf:"+$700", special:"핀업" },
  { sub:"NW 마케팅 [핀업2]", desc:"매출 크게 성장. 현금흐름 +$300.", cf:"+$300", special:"핀업" },
  { sub:"NW 마케팅 [핀업2]", desc:"매니아 소비자 그룹 확보. 현금흐름 +$500.", cf:"+$500", special:"핀업" },
  { sub:"NW 마케팅 [핀업2]", desc:"Platinum 성취. 현금흐름 +$2,000.", cf:"+$2,000", special:"핀업" },
  { sub:"NW 마케팅 [핀업2]", desc:"Bronze Builder 달성. 현금흐름 +$1,000.", cf:"+$1,000", special:"핀업" },
  { sub:"NW 마케팅 [성공3]", desc:"파트너 6명이 성장! DIAMOND가 되었다!! 현금흐름 +$8,000.", cf:"+$8,000", special:"DIAMOND" },
  { sub:"부동산 옵션 $1,000", desc:"$1,000을 지불하면 다른 사람이 뽑은 부동산을 먼저 살 수 있다. 다음 부동산 거래 시 만료.", special:"부동산 옵션" },
  { sub:"부동산 옵션 $1,500", desc:"$1,500을 지불하면 다른 사람이 뽑은 부동산을 먼저 살 수 있다.", special:"부동산 옵션" },
  { sub:"부동산 옵션 $2,000", desc:"$2,000을 지불하면 다른 사람이 뽑은 부동산을 먼저 살 수 있다.", special:"부동산 옵션" },
  { sub:"부동산 전문가 파트너십", desc:"전문가에게 2채의 아파트 단지 개발에 투자. 가구당 $50,000. 24% ROI.", down:"$0", cf:"+$1,000/가구", roi:"24%" },
  { sub:"장기 채권", desc:"낮은 이율의 장기 계좌. 한 구좌에 $25,000. 18% ROI. 현금흐름 +$380/구좌.", cf:"+$380/구좌", roi:"18%" },
  { sub:"재보험 신탁", desc:"조세피난처에서 등록된 재보험 신탁. 한 구좌당 $50,000. 21% ROI. 현금흐름 +$880/구좌.", cf:"+$880/구좌", roi:"21%" },
  { sub:"원고가 팔렸다 (로열티)", desc:"국제적인 출판사에서 책의 출판권을 원한다. 저작비용 $8,000 필요. 매달 $250 로열티.", cf:"+$250", roi:"로열티" },
  { sub:"장난감이 팔렸다 (로열티)", desc:"대형 장난감 회사에서 독점 판매권을 원한다. 특허 비용 $12,000. 매달 $400 로열티.", cf:"+$400", roi:"로열티" },
  { sub:"히트곡 예감 (로열티)", desc:"대형 음반제작사가 당신이 작곡한 노래를 원한다. 가입비 $8,000. 매달 $200 로열티.", cf:"+$200", roi:"로열티" },
  { sub:"컴퓨터 프로그램 (로열티)", desc:"스타트업 대표가 당신의 프로그램을 구매하고 싶어한다. 특허 비용 $14,000. 매달 $500 로열티.", cf:"+$500", roi:"로열티" },
  { sub:"NW 마케팅 [핀업2]", desc:"Bronze Builder 달성. 현금흐름 +$1,000.", cf:"+$1,000", special:"핀업" },
  { sub:"NW 마케팅 [가입1]", desc:"Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"NW 마케팅 [가입1]", desc:"Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
  { sub:"NW 마케팅 [가입1]", desc:"Amway에 가입 할 수 있다. 가입비 $200. 현금흐름 $0.", cf:"$0" },
];

// 202 MARKET (~49장)
const MK_202 = [
  { desc:"다가구 주택을 가구당 $30,000에 팔라는 제안.", sell:"가구당$30K" },
  { desc:"다가구 주택을 가구당 $35,000에 팔라는 제안.", sell:"가구당$35K" },
  { desc:"다가구 주택을 가구당 $35,000에 팔라는 제안.", sell:"가구당$35K" },
  { desc:"다가구 주택을 가구당 $40,000에 팔라는 제안.", sell:"가구당$40K" },
  { desc:"부동산 교환 거래 — 2가구→다가구. 48% ROI. 현금흐름 +$800.", sell:null, special:"교환거래" },
  { desc:"부동산 교환 거래 — 8가구→아파트. 60% ROI. 현금흐름 +$3,500.", sell:null, special:"교환거래" },
  { desc:"부동산 교환 거래 — 4가구→9가구 상가. 51% ROI. 현금흐름 +$1,700.", sell:null, special:"교환거래" },
  { desc:"부동산 교환 거래 — Starter House→4가구. 42% ROI. 현금흐름 +$700.", sell:null, special:"교환거래" },
  { desc:"Starter House(방2/욕실1)를 $75,000에 팔라는 제안.", sell:"$75K" },
  { desc:"Starter House(방2/욕실1)를 $80,000에 팔라는 제안.", sell:"$80K" },
  { desc:"Starter House(방2/욕실1)를 $85,000에 팔라는 제안.", sell:"$85K" },
  { desc:"REIT에서 최소 24세대 이상의 아파트를 세대당 $30,000에 매수.", sell:"세대당$30K" },
  { desc:"성공한 의사가 아파트에 투자. 세대당 $40,000에 매수 가능.", sell:"세대당$40K" },
  { desc:"대기업에서 직원 기숙사용 아파트를 세대당 $35,000에 매수.", sell:"세대당$35K" },
  { desc:"12,000평 땅을 $125,000에 팔라는 제안.", sell:"$125K" },
  { desc:"12,000평 땅을 $150,000에 팔라는 제안.", sell:"$150K" },
  { desc:"6,000평 땅을 $40,000에 팔라는 제안.", sell:"$40K" },
  { desc:"오염 물질이 발견 되었다. 오른쪽 사람의 부동산에서 독소 오염 물질 발견! 처리비용 $50,000.", sell:null, special:"오염 $50K" },
  { desc:"자연 재해! 지진이 일어나 당신의 부동산이 전 파괴. 현금흐름이 가장 높은 부동산의 현금흐름이 $0이 된다.", sell:null, special:"자연재해" },
  { desc:"모든 위험으로부터 보호 (보험). 월 $200. 최고 $5million까지 손해 보장.", sell:null, special:"보험 월$200" },
  { desc:"모든 위험으로부터 보호 (보험). 월 $200. (팔거나 거래할 수 없다)", sell:null, special:"보험 월$200" },
  { desc:"Repairs Deal — 4가구 주택. $12,000의 수리비 발생. 수리하면 현금흐름 +$400.", sell:null, special:"수리비 $12K" },
  { desc:"Overpriced Deal — 4가구 주택. 100% 대비, 착수금 0원. 현금흐름 -$300.", sell:null, special:"Overpriced" },
  { desc:"국제 무역량 증가. 주택 임대료가 한달에 $30 상승. 모든 게이머의 부동산 현금흐름 가구당 $30 증가.", sell:null, special:"임대료+$30/가구" },
  { desc:"이웃의 깜짝 제안! 가진 임대주택 중 가장 높은 현금흐름의 부동산을 150%에 구매하겠다.", sell:null, special:"150% 매수 제안" },
  { desc:"경기 침체. 모든 게이머의 부동산 가구당 현금흐름이 $60 감소. 마이너스 되면 은행에 반환.", sell:null, special:"CF-$60/가구" },
  { desc:"새로운 공항이 건설 된다! 가장 현금흐름이 높은 부동산을 착수금의 10배를 받고 판매.", sell:null, special:"착수금×10 매각" },
  { desc:"사업가들의 자선 경매. 3분간 경매. 자신의 자격의 1~3개의 주식을 올릴 수 있다. 낙찰금액의 10% 수수료.", sell:null, special:"경매" },
  { desc:"법인세 인상!! 정부가 법인세를 20% 인상. 모든 자산은 $10으로 하락.", sell:null, special:"법인세 인상" },
  { desc:"멘토를 만났다!! 가장 낮은 가격의 자산이 당신의 기회다.", sell:null, special:"멘토" },
  { desc:"아파트 단지 매수 — 성공한 의사가 투자. 세대당 $40,000에 매수.", sell:"세대당$40K" },
  { desc:"아파트 단지 매수 — 대기업 기숙사. 세대당 $35,000에 매수.", sell:"세대당$35K" },
  { desc:"모더나 주식 — 무상증자 2:1. 주식 수량 2배, 주가 변경. 분할 후 주당 $20에 팔 수 있다.", sell:null, special:"MRNA 무상증자" },
  { desc:"모더나 주식 — 유통량을 늘리기 위해 4:1비율로 주식 수를 1/4로 줄인다.", sell:null, special:"MRNA 감자" },
  { desc:"주식을 손절매 하다 — 모더나. 모든 모더나 주식을 주당 $5에 매각하라.", sell:null, special:"MRNA 손절 $5" },
  { desc:"파산 — 모더나 주식회사. 가치가 50% 하락. 재무제표에서 지운다. IPO 주가 $4로 재상장.", sell:null, special:"MRNA 파산 → $4" },
  { desc:"파산 — 모더나 주식회사. 재벌산업이 유해성 발견. 모든 주식 재무제표에서 지운다.", sell:null, special:"MRNA 파산" },
  { desc:"상장폐지 — 애플(AAPL). 거래정지.", sell:null, special:"AAPL 상장폐지" },
  { desc:"애플(AAPL) 주식 — 무상증자 3:1. 주식 수량 3배, 주가 1/3로.", sell:null, special:"AAPL 무상증자" },
  { desc:"패닉 셀 — 애플(AAPL). 주가 $5로 급락. 오직 당신만 모든 애플 주식을 주당 $5에 팔아야 한다.", sell:null, special:"AAPL 패닉셀 $5" },
  { desc:"파산 — 애플(AAPL). 주식가격이 $0. 재무제표에서 지운다. IPO 주가 $4로 재상장.", sell:null, special:"AAPL 파산 → $4" },
  { desc:"NW 마케팅 [성공3] — DIAMOND. 현금흐름 +$10,000.", sell:null, special:"DIAMOND +$10K" },
  { desc:"자녀가 결혼했다. $2,000을 선물하고 자녀 한명의 양육비를 지우시오.", sell:null, special:"양육비 삭제" },
  { desc:"자녀가 결혼했다. $3,000을 선물하고 자녀 한명의 양육비를 지우시오.", sell:null, special:"양육비 삭제" },
  { desc:"원고가 팔렸다. 매달 $250 로열티. 저작비용 $8,000 필요.", sell:null, special:"로열티 +$250" },
  { desc:"컴퓨터 프로그램 개발. 매달 $500 로열티. 특허 비용 $14,000.", sell:null, special:"로열티 +$500" },
  { desc:"모더나(MRNA) 주식 $20. 모든 사람들은 이 가격에 팔 수 있다. 거래정지.", sell:null },
  { desc:"애플(AAPL) 주식 $40. 회사는 성능를 독점으로 주가 분장을 결정했다. 2:1비율로 주식 분할.", sell:null, special:"AAPL 분할" },
];

// 202 DOODAD (~27장)
const DD_202 = [
  { desc:"회계 감사 — $15,000를 비용으로 지불한다.", amount:"$15,000" },
  { desc:"커피 타임 — 카푸치노와 디저트를 먹었다.", amount:"$150" },
  { desc:"잠이 오지 않는다! — 공과금 걱정. 큰 돈을 벌 수 있다는 정보에 덜컥 입금.", amount:"$300" },
  { desc:"거절 하지 못했다 — 자녀가 뛰고 있는 야구팀 후원 쿠키를 구매한다.", amount:"$300" },
  { desc:"직장인 골프대회!! — 골프 레슨을 받는다.", amount:"$500" },
  { desc:"자산 관리사에게 상담을 받는다 — $1,000이상의 자산소득이 있다면 $3,000를 지불.", amount:"$3,000", condition:"자산소득 $1K이상" },
  { desc:"경제 잡지 구독.", amount:"기타비용+$30", condition:"고정지출 증가" },
  { desc:"스트레스 과다!! — 요가 클래스에 등록.", amount:"기타비용+$100", condition:"고정지출 증가" },
  { desc:"자동차를 바꾸자 — TESLA Model Y를 렌트한다.", amount:"기타비용+$800", condition:"고정지출 증가" },
  { desc:"집에 사무실을 만들었다.", amount:"기타비용+$750", condition:"고정지출 증가" },
  { desc:"당신의 신용은 우수하다! — 스포츠카를 리스.", amount:"기타비용+$1,000", condition:"고정지출 증가" },
  { desc:"콘도 회원권 구매 — 겨울시즌 스키장 이용 가능. 착수금 $2,000.", amount:"기타비용+$400", condition:"착수금+고정지출" },
  { desc:"사업용 휴대전화 개통.", amount:"기타비용+$200", condition:"고정지출 증가" },
  { desc:"동창회 모임 — 피트니스 클럽에 가입.", amount:"기타비용+$80", condition:"고정지출 증가" },
  { desc:"가사도우미 고용.", amount:"기타비용+$500", condition:"고정지출 증가" },
  { desc:"아이를 위해 강아지 입양 — $500 즉시 + 기타비용 +$100.", amount:"$500+기타+$100", condition:"자녀" },
  { desc:"자녀의 과외 시작 — 새로운 선생님이 필요하다.", amount:"기타비용+$500", condition:"자녀" },
  { desc:"자녀가 코딩공부를 원한다 — 최신형 컴퓨터 구매. 자녀 1인당 $1,500.", amount:"자녀당$1,500", condition:"자녀" },
  { desc:"큰 아이에게 중고차를 사준다 — $3,000 일시불 + 자동차 대출 $5,000 + 이자 +$250 + 기타비용 +$350.", amount:"$3K+대출$5K", condition:"자녀+부채발생" },
  { desc:"아이가 대학에 들어갔다 — $50,000 지불 또는 학자금 대출 $50,000 + 이자 +$1,000.", amount:"$50K 또는 대출", condition:"자녀+부채발생" },
  { desc:"우리집에 수영장을 만들자!! — 가격 $32,000. 착수금 $12,000. 주택대출 +$20,000. 이자 +$260. 기타비용 +$140.", amount:"착수금$12K+대출", condition:"부채발생" },
  { desc:"휴가지의 통나무 집 구매 — 가격 $75,000. 착수금 $25,000. 은행융자 $50,000. 현금흐름 -$500. 빌려주는 자산이 아니다.", amount:"착수금$25K", condition:"부채발생" },
  { desc:"아파트 청약 당첨!! — 분양가 $600,000. 계약금 $120,000. 이자 월$2,000. 5턴 후 잔금 $120,000.", amount:"계약금$120K", condition:"청약" },
  { desc:"아파트 청약 당첨!! — 분양가 $900,000. 계약금 $180,000. 이자 월$3,000. 5턴 후 잔금 $180,000.", amount:"계약금$180K", condition:"청약" },
  { desc:"아파트 청약 당첨!! — 분양가 $400,000. 계약금 $80,000. 이자 월$1,400. 5턴 후 잔금 $80,000.", amount:"계약금$80K", condition:"청약" },
  { desc:"은혜 같은 친구 — 컨설팅 보답으로 $5,000 입금. 이 카드를 가지고 있다면 일시해고의 영향을 받지 않는다.", amount:"+$5,000", special:"일시해고 면제" },
];

const DECKS = {
  "101": { deal1: SMALL_DEALS, deal2: BIG_DEALS, market: MARKETS, doodad: DOODADS, total: 180, label: "101", color: "#22c55e", deal1Name: "SMALL DEAL", deal2Name: "BIG DEAL" },
  "202": { deal1: CG_202, deal2: CF_202, market: MK_202, doodad: DD_202, total: 162, label: "202", color: "#f59e0b", deal1Name: "Capital Gain", deal2Name: "CashFlow Deal" },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rollDie = () => Math.floor(Math.random() * 6) + 1;

// ── API 모델 상수 (한 곳에서 관리) ──
// 주의: Anthropic API는 버전 접미사가 붙은 정식 ID만 허용함
const MODEL_SONNET = "claude-sonnet-4-5";
const MODEL_OPUS = "claude-opus-4-5";

// ── 캐싱된 정규식 (매 렌더마다 재컴파일 방지) ──
const RE_STOCK = /주식|테슬라|디즈니|머크|모더나|애플|MRNA|AAPL/i;
const RE_NOT_STOCK = /부동산|주택|콘도|아파트|땅/;
const RE_REALESTATE = /주택|콘도|아파트|가구|단지|Starter|땅|부동산/;
const RE_BIZ = /사업|게임방|세탁소|문구|빨래방|프랜차이즈|도넛|세차|피자|모텔|쇼핑몰|마케팅|NW|채권|신탁|로열티|프로그램|원고|히트곡|동업/;
const RE_CHILD_DOODAD = /자녀|아이|아들|딸|장난감|생일|치아교정|대학|결혼|강아지|과외|코딩|중고차/;
const RE_STOCK_SPLIT = /무상증자|분할/;
const RE_STOCK_REVERSE = /감자|1\/2|1\/4/;
const RE_DAMAGE = /임차인.*손상|자산.*손상|손상.*지불|배관.*교체|노후 배관/;
const RE_DAMAGE_AMOUNT = /\$?([0-9,]+)\s*(?:지불|손실)?/;
const RE_PLUMBING = /배관.*교체|노후 배관/;  // 배관 전용 (다가구 체크용)
const RE_NUM = /[^0-9]/g;
const RE_NUM_NEG = /[^0-9-]/g;

// ── 컴포넌트 외부 유틸리티 함수 ──
const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const isStock = (card) => {
  if (!card) return false;
  const s = (card.sub || "") + (card.desc || "");
  return RE_STOCK.test(s) && !RE_NOT_STOCK.test(s);
};

// 무상증자(주식 수량 증가) 또는 감자(주식 수량 감소) 카드 판별
const isSplitCard = (card) => {
  if (!card) return false;
  const sp = (card.special || "") + (card.desc || "");
  return RE_STOCK_SPLIT.test(sp) || RE_STOCK_REVERSE.test(sp);
};

// 무상증자/감자 배율 계산: 양수=증자, 음수=감자
const getSplitMultiplier = (card) => {
  if (!card) return 1;
  const sp = (card.special || "") + (card.desc || "");
  if (/1\/4|4:1.*줄/.test(sp)) return 0.25;
  if (/1\/2|감자/.test(sp)) return 0.5;
  if (/3:1|3배/.test(sp)) return 3;
  if (/2:1|2배|무상증자|분할/.test(sp)) return 2;
  return 1;
};

const getAssetType = (card) => {
  if (!card) return "기타";
  const s = (card.sub || "") + (card.desc || "");
  if (isStock(card)) return "주식";
  if (RE_REALESTATE.test(s)) return "부동산";
  if (RE_BIZ.test(s)) return "사업";
  return "기타";
};

// ── 기회 카드 드릴다운 분류 ──
// 카테고리(Step 1) → 서브타입(Step 2) → 개별 카드(Step 3)
//
// classifyCardCategory(card) → "주식" | "부동산" | "사업" | "기타"
// getCardSubtype(card) → 카테고리 내부의 서브그룹 이름
//                        (예: 주식 "테슬라" / 부동산 "3/2 주택" / 사업 "작은 사업")
const classifyCardCategory = (card) => {
  if (!card) return "기타";
  if (isStock(card)) return "주식";
  return getAssetType(card); // 부동산 / 사업 / 기타
};

// 주식 종목명 추출 (sub에서 직접 — 대부분 sub가 종목명)
const getStockTicker = (card) => {
  if (!card) return "";
  return (card.sub || "").trim();
};

// 부동산 서브타입 그룹핑 (sub 패턴 기반)
const getRealEstateSubtype = (card) => {
  if (!card) return "기타";
  const s = (card.sub || "") + " " + (card.desc || "");
  if (/콘도/.test(s)) return "콘도 2/1";
  if (/3\/2|방3|욕실2/.test(s)) return "주택 3/2";
  if (/2가구/.test(s)) return "2가구 주택";
  if (/4가구/.test(s)) return "4가구 주택";
  if (/8가구/.test(s)) return "8가구 주택";
  if (/아파트.*단지|단지.*아파트|채.*아파트|아파트.*채/.test(s)) return "아파트 단지";
  if (/땅|평/.test(s)) return "땅";
  if (/Starter/i.test(s)) return "Starter House";
  return "기타 부동산";
};

// 사업 서브타입 (dealType 기반으로 "작은/큰 사업" 구분)
// cardDealType: "deal1" = SMALL, "deal2" = BIG
const getBusinessSubtype = (card, cardDealType) => {
  if (cardDealType === "deal1") return "작은 사업 (SMALL)";
  if (cardDealType === "deal2") return "큰 사업 (BIG)";
  return "사업";
};

// 주식 서브타입 (종목명 + 증자/감자는 같은 종목 그룹에 묶음 별도 표시)
const getStockSubtype = (card) => {
  return getStockTicker(card);
};

// 통합 서브타입 추출 함수
const getCardSubtype = (card, cardDealType) => {
  const cat = classifyCardCategory(card);
  if (cat === "주식") return getStockSubtype(card);
  if (cat === "부동산") return getRealEstateSubtype(card);
  if (cat === "사업") return getBusinessSubtype(card, cardDealType);
  return "기타";
};

// ── MARKET 카드 드릴다운 분류 ──
// 카테고리: 부동산 매수제안 / 사업 매수제안 / 이벤트
// 이벤트 = 임차인 손상, 몰수, 금융위기, 금리 변동, 사업 CF 변화, 수리비 등
const RE_MK_EVENT_DAMAGE   = /임차인.*손상|자산.*손상/;
const RE_MK_EVENT_SEIZURE  = /몰수|권리 상실|대출.*모든/;
const RE_MK_EVENT_CRISIS   = /금융 위기|상장 폐지|상장폐지/;
const RE_MK_EVENT_RATE     = /이자율|인플레이션/;
const RE_MK_EVENT_CFCHANGE = /현금흐름.*\+|매출 증가/;
const RE_MK_EVENT_REPAIR   = /배관|수리|고장|지불/;

const classifyMarketCategory = (card) => {
  if (!card) return "이벤트";
  const s = (card.desc || "") + " " + (card.special || "");
  // ⭐ "사업체 매출 증가"는 사업 카테고리로 (이벤트 매칭보다 먼저)
  if (/사업체.*매출.*증가|사업체.*현금흐름.*\+/.test(s)) return "사업";
  // 이벤트 먼저 잡기 (특수 카드들)
  if (RE_MK_EVENT_DAMAGE.test(s) || RE_MK_EVENT_SEIZURE.test(s)
      || RE_MK_EVENT_CRISIS.test(s) || RE_MK_EVENT_RATE.test(s)
      || RE_MK_EVENT_CFCHANGE.test(s)) return "이벤트";
  // sell 없고 special만 있는 것도 이벤트로 간주 (수리비 등)
  if (!card.sell && card.special) return "이벤트";
  // 부동산/사업 매수제안 분기
  if (RE_REALESTATE.test(s)) return "부동산";
  if (/동업|파트너|소프트웨어|상품.*회사|세차|쇼핑몰|B&B|모텔|사업체/.test(s)) return "사업";
  return "이벤트"; // 그 외는 이벤트
};

// MARKET 서브타입 — 부동산
const getMarketRealEstateSubtype = (card) => {
  const s = (card.desc || "") + " " + (card.special || "");
  if (/콘도/.test(s)) return "콘도 2/1";
  if (/3\/2|주택 3\/2/.test(s)) return "주택 3/2";
  if (/다가구|가구당/.test(s)) return "다가구 주택";
  if (/아파트|1채당|세대당/.test(s)) return "아파트 단지";
  if (/땅|평/.test(s)) return "땅";
  return "기타 부동산";
};

// MARKET 서브타입 — 사업
const getMarketBusinessSubtype = (card) => {
  const s = (card.desc || "") + " " + (card.special || "");
  if (/사업체.*매출.*증가|사업체.*현금흐름.*\+/.test(s)) return "사업체 매출 증가";
  if (/동업|파트너|지분/.test(s)) return "동업 지분";
  if (/소프트웨어/.test(s)) return "소프트웨어";
  if (/상품.*회사|상품 판매/.test(s)) return "상품 회사";
  if (/세차/.test(s)) return "세차장";
  if (/쇼핑몰/.test(s)) return "쇼핑몰";
  if (/B&B|모텔/.test(s)) return "B&B / 모텔";
  return "기타 사업";
};

// MARKET 서브타입 — 이벤트
const getMarketEventSubtype = (card) => {
  const s = (card.desc || "") + " " + (card.special || "");
  if (RE_MK_EVENT_DAMAGE.test(s)) return "임차인 손상";
  if (RE_MK_EVENT_SEIZURE.test(s)) return "자산 몰수";
  if (RE_MK_EVENT_CRISIS.test(s)) return "금융 위기";
  if (RE_MK_EVENT_RATE.test(s)) return "금리/인플레이션";
  if (RE_MK_EVENT_CFCHANGE.test(s)) return "사업 CF 변화";
  if (RE_MK_EVENT_REPAIR.test(s)) return "수리/지출";
  return "기타 이벤트";
};

// MARKET 통합 서브타입 추출
const getMarketSubtype = (card) => {
  const cat = classifyMarketCategory(card);
  if (cat === "부동산") return getMarketRealEstateSubtype(card);
  if (cat === "사업") return getMarketBusinessSubtype(card);
  return getMarketEventSubtype(card);
};

const parseNum = (str) => parseInt(String(str || "0").replace(RE_NUM, "")) || 0;
const parseNumNeg = (str) => parseInt(String(str || "0").replace(RE_NUM_NEG, "")) || 0;

// ── 캐시된 숫자 포맷터 (toLocaleString 97회 → fmtNum 호출로 대체) ──
const _numFmt = new Intl.NumberFormat("en-US");
const fmtNum = (n) => _numFmt.format(n || 0);

// ── 카드 드롭다운 option 라벨 생성 (일관된 형식) ──
// 순서: 설명(최대 35자) → 💰총가격 → 🏦은행대출 → 💵착수금 → 📊현금흐름
// 빅딜/스몰딜 공통 적용
const buildCardOptionLabel = (c, maxDescLen = 35) => {
  if (!c) return "";
  const desc = (c.desc || "").substring(0, maxDescLen).trim();
  const priceNum = parseInt(String(c.price || "0").replace(/[^0-9-]/g, "")) || 0;
  const downNum = (() => {
    const d = c.down || "";
    const m = d.replace(/[^0-9]/g, "");
    if (d.includes("K")) return (parseInt(m) || 0) * 1000;
    return parseInt(m) || 0;
  })();
  const loanNum = (priceNum > 0 && downNum > 0) ? priceNum - downNum : 0;
  const parts = [desc];
  // 이모지 + 수치 (있는 것만)
  if (priceNum > 0) parts.push(`💰${_numFmt.format(priceNum)}`);
  if (loanNum > 0) parts.push(`🏦${_numFmt.format(loanNum)}`);
  if (downNum > 0) parts.push(`💵${_numFmt.format(downNum)}`);
  if (c.cf) parts.push(`📊${c.cf}`);
  if (c.roi) parts.push(`📈${c.roi}`);
  if (c.sell) parts.push(`매각:${c.sell}`);
  if (c.special) parts.push(`[${c.special}]`);
  if (c.amount) parts.push(c.amount);
  return parts.filter(Boolean).join(" · ");
};

// ── MARKET 매칭 검증 테이블 (컴포넌트 외부, 렌더마다 재생성 방지) ──
const SELL_RULES = [
  { descRe: /콘도/, assetRe: /콘도/, msg: "보유 중인 콘도가 없습니다." },
  { descRe: /주택.*3\/2|3\/2.*주택|주택.*매수|주택.*팔라|이자율 하락/, assetRe: /주택/, msg: "보유 중인 3/2 주택이 없습니다." },
  { descRe: /다가구|가구당|노후 배관|배관 교체/, assetRe: /가구|다가구/, msg: "보유 중인 다가구 주택이 없습니다." },
  { descRe: /아파트.*단지|아파트.*매수|세대당/, assetRe: /아파트/, msg: "보유 중인 아파트 단지가 없습니다." },
  { descRe: /12,000평|24,000평|6,000평|땅/, assetRe: /땅|평/, msg: "보유 중인 땅이 없습니다." },
  { descRe: /동업.*파트너|지분/, assetRe: /동업|파트너/, msg: "보유 중인 동업 자산이 없습니다." },
  { descRe: /쇼핑몰/, assetRe: /쇼핑몰/, msg: "보유 중인 쇼핑몰이 없습니다." },
  { descRe: /세차장/, assetRe: /세차/, msg: "보유 중인 세차장이 없습니다." },
  { descRe: /B&B|모텔/, assetRe: /B&B|모텔/, msg: "보유 중인 B&B/모텔이 없습니다." },
  { descRe: /Starter|Start House/, assetRe: /Starter|Start/, msg: "보유 중인 Starter House가 없습니다." },
  { descRe: /소프트웨어|상품.*회사|사업.*매수/, assetRe: /사업|부업/, msg: "보유 중인 사업체가 없습니다." },
];

// ── 액션 뱃지 스타일 맵 (삼항 체인 제거) ──
const ACTION_BADGE = {
  buy:         { bg: "#22c55e30", color: "#86efac", label: "구매" },
  sell:        { bg: "#f59e0b30", color: "#fde68a", label: "판매" },
  pass:        { bg: "#ef444430", color: "#fca5a5", label: "패스" },
  charity_yes: { bg: "#a855f730", color: "#d8b4fe", label: "기부함" },
  charity_no:  { bg: "#27272a",   color: "#71717a", label: "기부안함" },
  rights:      { bg: "#8b5cf630", color: "#c4b5fd", label: "권리판매" },
  na:          { bg: "#27272a",   color: "#71717a", label: "해당없음" },
  rest:        { bg: "#ef444430", color: "#fca5a5", label: "휴식" },
  hold:        { bg: "#3b82f630", color: "#93c5fd", label: "홀딩" },
  split:       { bg: "#a78bfa30", color: "#c4b5fd", label: "증자/감자" },
};

// ── 주식 매각 공통 로직 (중복 제거) ──
const reduceStockShares = (assets, stockName, qty) => {
  const idx = assets.findIndex(a => a.type === "주식" && a.shares > 0 && a.name.includes(stockName));
  if (idx === -1) return assets;
  const updated = [...assets];
  if (updated[idx].shares <= qty) { updated.splice(idx, 1); }
  else { updated[idx] = { ...updated[idx], shares: updated[idx].shares - qty }; }
  return updated;
};

// ── findLast 폴리필 (구형 Safari/WebView 호환용) ──
const findLastSafe = (arr, pred) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return arr[i];
  }
  return undefined;
};

// ── 자산 고유 ID 생성기 (참조 동등성 의존 제거) ──
let _assetIdCounter = 0;
const makeAssetId = () => `a${Date.now()}-${++_assetIdCounter}`;

function simulate(totalTurns, deckKey) {
  const deck = DECKS[deckKey];
  let pos = 0;
  let charityTurns = 0;
  const log = [];

  // ── 보유 자산 추적 (MARKET 판매 가능 여부 판단용) ──
  const ownedAssets = []; // { name, type:"부동산"|"주식"|"사업", shares? }

  // 기회카드에서 자산 구매 시뮬레이션
  const simBuy = (card) => {
    if (!card) return;
    const type = getAssetType(card);
    if (type === "주식") {
      const qty = Math.floor(Math.random() * 100) + 10; // 10~110주 랜덤
      ownedAssets.push({ name: card.sub || "주식", type, shares: qty });
    } else if (type === "부동산" || type === "사업") {
      ownedAssets.push({ name: card.sub || card.desc?.substring(0, 20), type, cf: parseNumNeg(card.cf) });
    }
  };

  // MARKET 카드가 보유 자산과 매칭되는지 확인 (주식 카드는 MARKET에 없음)
  const canSellForMarket = (marketCard) => {
    if (!marketCard) return false;
    const desc = (marketCard.desc || "") + (marketCard.sell || "") + (marketCard.special || "");
    for (const rule of SELL_RULES) {
      if (rule.descRe.test(desc)) return ownedAssets.some(a => rule.assetRe.test(a.name));
    }
    return false;
  };

  // MARKET 카드로 매각 실행 (보유자산에서 제거)
  const simSell = (marketCard) => {
    if (!marketCard) return;
    const desc = (marketCard.desc || "") + (marketCard.sell || "") + (marketCard.special || "");
    for (const rule of SELL_RULES) {
      if (rule.descRe.test(desc)) {
        const idx = ownedAssets.findIndex(a => rule.assetRe.test(a.name));
        if (idx !== -1) { ownedAssets.splice(idx, 1); return; }
      }
    }
  };

  // ── 타인 마켓카드: 포아송 분포 기반 랜덤 배치 ──
  // 1) 이 게임에서 총 몇 번 나올지 포아송 분포로 결정 (평균 λ=8, 편차 큼)
  // 2) 그 횟수를 totalTurns에 랜덤 배치 → 몰릴 수도, 안 나올 수도 있음
  const poissonSample = (lambda) => {
    let L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  };
  const otherMarketTotal = poissonSample(4); // 평균 4회 (보수적), 실제 0~9회 편차
  // 랜덤하게 어느 턴에 배치할지 결정 (같은 턴에 2장 이상도 가능)
  const otherMarketSlots = {};
  for (let m = 0; m < otherMarketTotal; m++) {
    const slot = Math.floor(Math.random() * totalTurns) + 1;
    otherMarketSlots[slot] = (otherMarketSlots[slot] || 0) + 1;
  }

  for (let turn = 1; turn <= totalTurns; turn++) {
    // ── 타인의 마켓카드 (이번 턴에 배정된 수만큼 등장) ──
    const otherCount = otherMarketSlots[turn] || 0;
    for (let oc = 0; oc < otherCount; oc++) {
      const otherMarketCard = pick(deck.market);
      const canSell = canSellForMarket(otherMarketCard);
      const otherEntry = {
        turn, dice: [0], total: 0, pos: 0,
        cell: { pos: 0, type: "MARKET", label: "타인 마켓", icon: "👥", color: "#8b5cf6" },
        card: otherMarketCard, dealType: "타인MARKET",
        isOtherMarket: true,
        sold: canSell,
      };
      if (canSell) simSell(otherMarketCard);
      log.push(otherEntry);
    }

    // ── 내 턴 ──
    const dice = charityTurns > 0 ? [rollDie(), rollDie()] : [rollDie()];
    const total = dice.reduce((a, b) => a + b, 0);
    if (charityTurns > 0) charityTurns--;

    pos = ((pos + total - 1) % 24) + 1;
    const cell = BOARD[pos - 1];

    const entry = { turn, dice, total, pos, cell, card: null, dealType: null };

    if (cell.type === "OPPORTUNITY") {
      const progress = turn / totalTurns;
      const isDeal1 = Math.random() < (progress < 0.7 ? 0.7 : 0.3);
      if (isDeal1) {
        entry.card = pick(deck.deal1);
        entry.dealType = deck.deal1Name;
      } else {
        entry.card = pick(deck.deal2);
        entry.dealType = deck.deal2Name;
      }
      // 양수 ROI 또는 주식이면 70% 확률로 구매 (단, 무상증자/감자 카드는 보유 종목에만 적용)
      if (entry.card) {
        if (isSplitCard(entry.card)) {
          // 무상증자/감자 카드: 해당 종목 보유 시에만 적용, 보유 없으면 "해당없음"
          const stockName = (entry.card.sub || "").trim();
          const hasStock = ownedAssets.some(a => a.type === "주식" && (a.shares || 0) > 0 && a.name.includes(stockName));
          if (hasStock) {
            const mult = getSplitMultiplier(entry.card);
            // 보유 중인 해당 종목 주식 수량 조정 (실제 시뮬레이션)
            for (const a of ownedAssets) {
              if (a.type === "주식" && (a.shares || 0) > 0 && a.name.includes(stockName)) {
                a.shares = Math.floor(a.shares * mult);
              }
            }
            entry.splitApplied = true;
          } else {
            entry.splitApplied = false;
          }
        } else {
          const roi = parseNumNeg(entry.card.roi);
          const shouldBuy = (roi > 0 || isStock(entry.card)) && Math.random() < 0.7;
          if (shouldBuy) {
            simBuy(entry.card);
            entry.bought = true;
          }
        }
      }
    } else if (cell.type === "MARKET") {
      entry.card = pick(deck.market);
      entry.dealType = "MARKET";
      // 보유 자산과 매칭되는지 확인
      if (canSellForMarket(entry.card)) {
        simSell(entry.card);
        entry.sold = true;
      } else {
        entry.sold = false;
      }
    } else if (cell.type === "DOODAD") {
      entry.card = pick(deck.doodad);
      entry.dealType = "DOODAD";
    } else if (cell.type === "CHARITY") {
      charityTurns = 3;
    }

    log.push(entry);
  }
  return log;
}

const CELL_COLORS = {
  OPPORTUNITY: { bg: "#14532d", border: "#22c55e", text: "#86efac" }, // 녹색 — 실제 기회 카드 색
  PAYDAY:      { bg: "#713f12", border: "#eab308", text: "#fde68a" }, // 노랑 — 월급 느낌
  MARKET:      { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" }, // 파랑 — 실제 마켓 카드 색
  DOODAD:      { bg: "#831843", border: "#ec4899", text: "#f9a8d4" }, // 분홍 — Kevin 지시
  CHARITY:     { bg: "#4c1d95", border: "#8b5cf6", text: "#c4b5fd" }, // 진한 보라
  BABY:        { bg: "#0c4a6e", border: "#0ea5e9", text: "#7dd3fc" }, // 하늘색 — 출산 축하
  DOWNSIZED:   { bg: "#7f1d1d", border: "#ef4444", text: "#fca5a5" }, // 빨강 — 유지
};

// 한국어 라벨 맵 (삼항 체인 제거)
const CELL_LABELS = {
  OPPORTUNITY: "기회",
  PAYDAY: "페이데이",
  MARKET: "마켓",
  DOODAD: "두대드",
  CHARITY: "기부",
  BABY: "베이비",
  DOWNSIZED: "다운사이즈",
};

/* ═══════════════════════════════════════════════════
   직업 카드 데이터 (15장) — Kevin 제공 실데이터
   기본 필드:
     salary=월급, cashflow=월현금흐름, expense=총지출, childCost=자녀 1명당 양육비, savings=초기 저축
   부채 필드 (신규): Kevin 제공 국제캐쉬플로우강사협회 한국어판 카드
     liabilities.{homeMortgage|schoolLoan|carLoan|creditCard}: { principal, payment }
     - principal: 대출 원금 (상환 시 차감)
     - payment: 월 이자/상환액 (expense에 포함되어 있음. 상환하면 차감)
═══════════════════════════════════════════════════ */
const JOBS = [
  {
    name:"관리인", salary:1600, cashflow:600, expense:1000, childCost:100, savings:600,
    liabilities: {
      homeMortgage: { principal: 20000, payment: 200 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 4000,  payment: 100 },
      creditCard:   { principal: 3000,  payment: 100 },
    },
  },
  {
    name:"비서", salary:2500, cashflow:800, expense:1700, childCost:100, savings:700,
    liabilities: {
      homeMortgage: { principal: 38000, payment: 400 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 4000,  payment: 100 },
      creditCard:   { principal: 3000,  payment: 100 },
    },
  },
  {
    name:"정비공", salary:2000, cashflow:700, expense:1300, childCost:100, savings:700,
    liabilities: {
      homeMortgage: { principal: 31000, payment: 300 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 3000,  payment: 100 },
      creditCard:   { principal: 3000,  payment: 100 },
    },
  },
  {
    name:"트럭운전사", salary:2500, cashflow:800, expense:1700, childCost:200, savings:800,
    liabilities: {
      homeMortgage: { principal: 38000, payment: 400 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 4000,  payment: 100 },
      creditCard:   { principal: 3000,  payment: 100 },
    },
  },
  {
    name:"배송기사", salary:2900, cashflow:720, expense:2180, childCost:200, savings:400,
    liabilities: {
      homeMortgage: { principal: 40000, payment: 420 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 15000, payment: 300 },
      creditCard:   { principal: 8000,  payment: 260 },
    },
  },
  {
    name:"경찰관", salary:3000, cashflow:1100, expense:1900, childCost:200, savings:500,
    liabilities: {
      homeMortgage: { principal: 46000, payment: 400 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 5000,  payment: 100 },
      creditCard:   { principal: 3000,  payment: 100 },
    },
  },
  {
    name:"간호사", salary:3100, cashflow:1100, expense:2000, childCost:200, savings:500,
    liabilities: {
      homeMortgage: { principal: 47000, payment: 400 },
      schoolLoan:   { principal: 6000,  payment: 100 },
      carLoan:      { principal: 5000,  payment: 100 },
      creditCard:   { principal: 4000,  payment: 200 },
    },
  },
  {
    name:"교사", salary:3300, cashflow:1200, expense:2100, childCost:200, savings:400,
    liabilities: {
      homeMortgage: { principal: 50000, payment: 500 },
      schoolLoan:   { principal: 12000, payment: 100 },
      carLoan:      { principal: 5000,  payment: 100 },
      creditCard:   { principal: 4000,  payment: 200 },
    },
  },
  {
    name:"비즈니스 매니저", salary:4600, cashflow:1600, expense:3000, childCost:300, savings:400,
    liabilities: {
      homeMortgage: { principal: 75000, payment: 700 },
      schoolLoan:   { principal: 12000, payment: 100 },
      carLoan:      { principal: 6000,  payment: 100 },
      creditCard:   { principal: 4000,  payment: 200 },
    },
  },
  {
    name:"공학자", salary:4900, cashflow:1700, expense:3200, childCost:200, savings:400,
    liabilities: {
      homeMortgage: { principal: 75000, payment: 700 },
      schoolLoan:   { principal: 12000, payment: 100 },
      carLoan:      { principal: 7000,  payment: 200 },
      creditCard:   { principal: 5000,  payment: 200 },
    },
  },
  {
    name:"요리사", salary:5300, cashflow:1800, expense:3500, childCost:450, savings:600,
    liabilities: {
      homeMortgage: { principal: 65000, payment: 600 },
      schoolLoan:   { principal: 18000, payment: 150 },
      carLoan:      { principal: 12000, payment: 200 },
      creditCard:   { principal: 8000,  payment: 250 },
    },
  },
  {
    name:"변호사", salary:7500, cashflow:2400, expense:5100, childCost:400, savings:2000,
    liabilities: {
      homeMortgage: { principal: 115000, payment: 1100 },
      schoolLoan:   { principal: 78000,  payment: 300 },
      carLoan:      { principal: 11000,  payment: 200 },
      creditCard:   { principal: 7000,   payment: 200 },
    },
  },
  {
    name:"비행기 조종사", salary:9500, cashflow:3500, expense:6000, childCost:400, savings:2500,
    liabilities: {
      homeMortgage: { principal: 90000, payment: 1000 },
      schoolLoan:   { principal: 0,     payment: 0 },
      carLoan:      { principal: 15000, payment: 300 },
      creditCard:   { principal: 22000, payment: 700 },
    },
  },
  {
    name:"의사", salary:13200, cashflow:4900, expense:8300, childCost:700, savings:3500,
    liabilities: {
      homeMortgage: { principal: 202000, payment: 1900 },
      schoolLoan:   { principal: 150000, payment: 700 },
      carLoan:      { principal: 19000,  payment: 300 },
      creditCard:   { principal: 10000,  payment: 200 },
    },
  },
  {
    name:"운동선수", salary:23000, cashflow:7200, expense:15800, childCost:1500, savings:4000,
    liabilities: {
      homeMortgage: { principal: 300000, payment: 2700 },
      schoolLoan:   { principal: 0,      payment: 0 },
      carLoan:      { principal: 80000,  payment: 1100 },
      creditCard:   { principal: 12000,  payment: 300 },
    },
  },
];

/* ═══════════════════════════════════════════════════
   공용 로딩 스피너 (주사위 회전 애니메이션)
   사용처: 인증 로딩, 디브리핑 분석, AI 코칭, 게임 저장/복구 등
═══════════════════════════════════════════════════ */
function DiceSpinner({ message = "로딩 중...", subMessage = null, size = "md", fullScreen = false }) {
  const iconSize = size === "lg" ? 48 : size === "sm" ? 20 : 32;
  const msgSize = size === "lg" ? 15 : size === "sm" ? 11 : 13;
  const content = (
    <>
      <div style={{
        fontSize: iconSize,
        marginBottom: size === "sm" ? 6 : 10,
        display: "inline-block",
        animation: "cfSpin 1s linear infinite",
      }}>🎲</div>
      <style>{`@keyframes cfSpin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ fontSize: msgSize, color: "#a1a1aa", margin: 0 }}>{message}</p>
      {subMessage && <p style={{ fontSize: msgSize - 2, color: "#52525b", margin: "4px 0 0" }}>{subMessage}</p>}
    </>
  );
  if (fullScreen) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#080810",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Pretendard Variable', 'Noto Sans KR', -apple-system, sans-serif",
      }}>{content}</div>
    );
  }
  return (
    <div style={{ textAlign: "center", padding: size === "lg" ? "40px 20px" : size === "sm" ? "14px 10px" : "30px 20px" }}>
      {content}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   은행 대출 UI 컴포넌트
   $1,000 단위, 월 10% 이자
═══════════════════════════════════════════════════ */
function BankLoanUI({ shortage, bankLoan, monthlyCF, currentInterest, onLoan }) {
  // 대출 한도: 추가 이자가 남은 현금흐름을 초과하면 안됨
  // 남은 현금흐름 = monthlyCF - currentInterest
  // 추가 대출 × 10% ≤ 남은 현금흐름
  // 추가 대출 ≤ 남은 현금흐름 ÷ 0.1
  const remainingCF = Math.max(0, monthlyCF - currentInterest);
  const maxLoan = Math.floor(remainingCF / 0.1 / 1000) * 1000; // $1,000 단위로 내림
  const initialLoan = Math.min(Math.ceil(shortage / 1000) * 1000, maxLoan);
  const [loanAmount, setLoanAmount] = useState(Math.max(0, initialLoan));
  const monthlyInterest = Math.round(loanAmount * 0.1);
  const canLoan = maxLoan >= 1000;

  return (
    <div style={{ padding: "12px", background: "#1a1a2e" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>🏦 은행 대출</div>
      <p style={{ fontSize: 10, color: "#a1a1aa", margin: "0 0 4px" }}>
        $1,000 단위 · 월 10% 이자 · 부족금액 ${fmtNum(shortage)}
      </p>
      <p style={{ fontSize: 10, color: "#71717a", margin: "0 0 8px" }}>
        대출 한도 ${fmtNum(maxLoan)} (월CF ${fmtNum(monthlyCF)} − 기존이자 ${fmtNum(currentInterest)} = 여유 ${fmtNum(remainingCF)})
      </p>

      {canLoan ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setLoanAmount(prev => Math.max(1000, prev - 1000))} style={{
              width: 36, height: 36, borderRadius: 8, border: "1px solid #27272a",
              background: "#18181b", color: "#fafafa", fontSize: 18, cursor: "pointer",
            }}>−</button>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fde68a" }}>${fmtNum(loanAmount)}</div>
              <div style={{ fontSize: 10, color: "#71717a" }}>대출 금액 (한도 ${fmtNum(maxLoan)})</div>
            </div>
            <button onClick={() => setLoanAmount(prev => Math.min(maxLoan, prev + 1000))} style={{
              width: 36, height: 36, borderRadius: 8, border: "1px solid #27272a",
              background: "#18181b", color: "#fafafa", fontSize: 18, cursor: "pointer",
            }}>+</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", marginBottom: 8, borderTop: "1px solid #27272a" }}>
            <span style={{ fontSize: 10, color: "#a1a1aa" }}>월 이자 (10%)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5" }}>−${fmtNum(monthlyInterest)}/월</span>
          </div>
          {bankLoan > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "#a1a1aa" }}>기존 대출 잔액</span>
              <span style={{ fontSize: 10, color: "#fca5a5" }}>${fmtNum(bankLoan)}</span>
            </div>
          )}
          <button onClick={() => {
            // 방어적 가드: 한도 초과·최소 금액 미달 시 실행 차단
            if (loanAmount < 1000 || loanAmount > maxLoan) {
              alert(`대출 불가: 한도(${fmtNum(maxLoan)})를 초과했거나 금액이 부족합니다.`);
              return;
            }
            onLoan(loanAmount);
          }} disabled={loanAmount < 1000 || loanAmount > maxLoan} style={{
            width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: (loanAmount >= 1000 && loanAmount <= maxLoan) ? "pointer" : "default",
            background: (loanAmount >= 1000 && loanAmount <= maxLoan) ? "#f59e0b" : "#27272a", color: (loanAmount >= 1000 && loanAmount <= maxLoan) ? "#000" : "#52525b", fontSize: 12, fontWeight: 800,
          }}>
            🏦 ${fmtNum(loanAmount)} 대출 실행 (월 −${fmtNum(monthlyInterest)})
          </button>
        </>
      ) : (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#ef444415", border: "1px solid #ef444430" }}>
          <p style={{ fontSize: 11, color: "#fca5a5", margin: 0, fontWeight: 600 }}>⚠️ 대출 불가</p>
          <p style={{ fontSize: 10, color: "#71717a", margin: "4px 0 0" }}>
            월별 현금흐름(${fmtNum(monthlyCF)})에서 기존 이자(${fmtNum(currentInterest)})를 차감하면 여유가 ${fmtNum(remainingCF)}입니다. 추가 대출의 월 이자를 감당할 수 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   턴 row 컴포넌트 — React.memo로 리렌더 최소화
   props가 바뀌지 않으면 재계산 안 함. 100턴 중 1개만 바뀌어도
   변경된 row 1개만 재렌더.
═══════════════════════════════════════════════════ */
const TurnRow = memo(function TurnRow({ t, i, isSub, onEdit, onDelete }) {
  const isPaydayPass = t.cellType === "PAYDAY_PASS";
  const isDownRest = t.cellType === "DOWNSIZED_REST";
  const isStockSell = t.cellType === "STOCK_SELL";
  const isExtSell = t.cellType === "EXT_SELL";
  const isExtraLoan = t.cellType === "EXTRA_LOAN";
  const isExtraSplit = t.cellType === "EXTRA_SPLIT";
  const isExtraWipe = t.cellType === "EXTRA_WIPE";
  const isExtraBuy = t.cellType === "EXTRA_BUY";
  const isExtraCash = t.cellType === "EXTRA_CASH";
  const isDebtRepay = t.cellType === "DEBT_REPAY";
  const colorKey = isPaydayPass ? "PAYDAY"
    : isDownRest ? "DOWNSIZED"
    : isStockSell ? "OPPORTUNITY"
    : isExtSell ? "MARKET"
    : isExtraLoan ? "PAYDAY"
    : isExtraSplit ? "OPPORTUNITY"
    : isExtraWipe ? "MARKET"
    : isExtraBuy ? "OPPORTUNITY"
    : isExtraCash ? "PAYDAY"
    : isDebtRepay ? "PAYDAY"
    : t.cellType;
  const cc = CELL_COLORS[colorKey] || CELL_COLORS.OPPORTUNITY;
  const specialLabel = isPaydayPass ? "💰 PayDay 통과"
    : isDownRest ? "⬇️ 다운사이즈 휴식"
    : isStockSell ? `📈 주식 매각 — ${t.card?.sub || ""}`
    : isExtSell ? `🏠 외부 매도 — ${t.card?.sub || ""}`
    : isExtraLoan ? (t.action === "repay" ? "🏦 은행 대출 상환" : "🏦 은행 대출 받기")
    : isExtraSplit ? `📈 증자/감자 (타인카드) — ${t.card?.sub || ""}`
    : isExtraWipe ? "📉 전 주식 상장폐지"
    : isExtraBuy ? (t._forfeited || t.action === "forfeit"
        ? `💸 권리금 포기 — ${t._assetName || t.card?.sub || ""} (권리금만 지불)`
        : `💼 권리금 인수 — ${t._assetName || t.card?.sub || ""}`)
    : isExtraCash ? `💵 현금 보정 — ${t.card?.sub || ""}`
    : isDebtRepay ? `💵 직업 부채 상환 — ${t._debtLabel || t.card?.sub || ""}`
    : null;
  const isSpecial = isPaydayPass || isDownRest;
  const isExtraType = isExtraLoan || isExtraSplit || isExtraWipe || isExtraBuy || isExtraCash || isDebtRepay;
  const padding = isSub ? "6px 10px" : "10px 12px";
  const radius = isSub ? 8 : 10;
  const bg = isPaydayPass ? "#713f1220"
    : isDownRest ? "#7f1d1d10"
    : isStockSell ? "#14532d18"
    : isExtSell ? "#1e3a5f20"
    : cc.bg;
  const opacity = isSub ? 0.78 : 1;
  return (
    <div style={{ padding, borderRadius: radius, background: bg, border: `1px solid ${cc.border}30`, opacity }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {!isSub ? (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: cc.border + "30", color: cc.text }}>
              T{t.turn}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#52525b", marginRight: 2 }}>↳</span>
          )}
          {!isSpecial && !isStockSell && !isExtSell && !isExtraType && t.dice > 0 && t.boardPos > 0 && (() => {
            const fromPos = ((t.boardPos - t.dice - 1 + 24) % 24) + 1;
            const fromLabel = BOARD[fromPos - 1]?.label || "";
            const toLabel = BOARD[t.boardPos - 1]?.label || "";
            return (
              <span style={{ fontSize: 9, color: "#52525b", fontFamily: "monospace" }}>
                {fromLabel}(칸{fromPos})<span style={{ color: "#3f3f46" }}>→</span>🎲{t.dice}<span style={{ color: "#3f3f46" }}>→</span>{toLabel}(칸{t.boardPos})
              </span>
            );
          })()}
          {!isSpecial && !isStockSell && !isExtSell && !isExtraType && t.boardPos > 0 && !(t.dice > 0) && (
            <span style={{ fontSize: 9, color: "#52525b" }}>
              {BOARD[t.boardPos - 1]?.label || ""}(칸{t.boardPos})
            </span>
          )}
          <span style={{ fontSize: isSub ? 10 : 11, color: cc.text }}>
            {specialLabel || (t.card?.sub || t.cellType)}
          </span>
          {t.shares > 0 && <span style={{ fontSize: 9, color: "#71717a" }}>{t.shares}주</span>}
          {t.time != null && <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4 }}>⏱{fmtTime(t.time)}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {t.decisionSec != null && <span style={{ fontSize: 9, color: "#a78bfa" }}>{t.decisionSec}초</span>}
          {t.action && (() => {
            const badge = ACTION_BADGE[t.action] || ACTION_BADGE.hold;
            return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.color }}>{badge.label}</span>;
          })()}
          <button
            onClick={() => onEdit(i, t)}
            title="이 항목 편집"
            style={{
              padding: "2px 6px", borderRadius: 4, border: "none",
              background: "#1e3a8a40", color: "#93c5fd", cursor: "pointer",
              fontSize: 10, fontWeight: 700,
            }}
          >✏️</button>
          <button
            onClick={() => onDelete(i, isSub, t.turn)}
            title="이 항목 삭제"
            style={{
              padding: "2px 6px", borderRadius: 4, border: "none",
              background: "#7f1d1d40", color: "#fca5a5", cursor: "pointer",
              fontSize: 10, fontWeight: 700,
            }}
          >🗑️</button>
        </div>
      </div>
      {(t.transaction || t.cashSnapshot != null) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${cc.border}15` }}>
          {t.transaction && <span style={{ fontSize: 9, color: "#a1a1aa", flex: 1 }}>{t.transaction}</span>}
          {t.cashSnapshot != null && <span style={{ fontSize: 10, fontWeight: 700, color: t.cashSnapshot >= 0 ? "#fde68a" : "#fca5a5" }}>💰${fmtNum(t.cashSnapshot)}</span>}
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════
   턴 편집 모달 — 각 turn entry의 주요 필드를 수정
═══════════════════════════════════════════════════ */
function TurnEditModal({ turnIndex, turn, onSave, onClose }) {
  // 편집 가능한 필드만 state로 관리. 미편집 필드는 원본 그대로 유지.
  const [transaction, setTransaction] = useState(turn.transaction || "");
  // 숫자 필드들 — 턴 타입별로 다르게 사용
  const [buyCost, setBuyCost] = useState(turn._buyCost ?? "");
  const [loan, setLoan] = useState(turn._loan ?? "");
  const [cf, setCf] = useState(turn._cf ?? "");
  const [deposit, setDeposit] = useState(turn._deposit ?? "");
  const [shares, setShares] = useState(turn.shares ?? "");
  const [pricePerShare, setPricePerShare] = useState(turn._pricePerShare ?? "");
  const [sellPrice, setSellPrice] = useState(turn._sellPrice ?? "");
  const [cost, setCost] = useState(turn._cost ?? "");
  const [loanAmount, setLoanAmount] = useState(turn._loanAmount ?? "");
  const [cashAmount, setCashAmount] = useState(turn._cashAmount ?? "");
  const [multiplier, setMultiplier] = useState(turn._multiplier ?? "");
  const [damageAmount, setDamageAmount] = useState(turn._damageAmount ?? "");

  const ct = turn.cellType;
  const action = turn.action;

  // 숫자 파싱 헬퍼
  const parseNumField = (v) => {
    if (v === "" || v == null) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = () => {
    // 원본을 복제해서 편집한 필드만 덮어씀
    const updated = { ...turn, transaction: transaction.trim() };

    const setIfNum = (key, value) => {
      const n = parseNumField(value);
      if (n != null) updated[key] = n;
    };

    // 턴 타입별 필드 반영
    if (ct === "OPPORTUNITY" && action === "buy") {
      setIfNum("_buyCost", buyCost);
      setIfNum("_loan", loan);
      setIfNum("_cf", cf);
      setIfNum("shares", shares);
      setIfNum("_pricePerShare", pricePerShare);
    } else if (ct === "OPPORTUNITY" && action === "sell") {
      setIfNum("shares", shares);
      setIfNum("_sellPrice", sellPrice);
    } else if (ct === "STOCK_SELL") {
      setIfNum("shares", shares);
      setIfNum("_sellPrice", sellPrice);
    } else if (ct === "EXT_SELL") {
      setIfNum("_sellPrice", sellPrice);
    } else if (ct === "MARKET") {
      // 🆕 MARKET sell은 카드의 sell 필드를 사용하므로 _sellPrice 저장 안 함
      if (action === "damage") setIfNum("_damageAmount", damageAmount);
    } else if (ct === "DOODAD") {
      setIfNum("_cost", cost);
    } else if (ct === "EXTRA_LOAN") {
      setIfNum("_loanAmount", loanAmount);
    } else if (ct === "EXTRA_CASH") {
      setIfNum("_cashAmount", cashAmount);
    } else if (ct === "EXTRA_SPLIT") {
      setIfNum("_multiplier", multiplier);
    } else if (ct === "EXTRA_BUY") {
      setIfNum("_deposit", deposit);
      setIfNum("_buyCost", buyCost);
      setIfNum("_cf", cf);
      setIfNum("_loan", loan);
    }

    onSave(updated);
  };

  // 편집 가능 필드 렌더링
  const renderFields = () => {
    const inputStyle = {
      width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #27272a",
      background: "#0a0a0f", color: "#fafafa", fontSize: 12, outline: "none", boxSizing: "border-box",
    };
    const labelStyle = { fontSize: 10, color: "#a1a1aa", display: "block", marginBottom: 4, fontWeight: 600 };
    const numField = (label, value, setter, emoji = "") => (
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>{emoji} {label}</label>
        <input type="number" value={value} onChange={e => setter(e.target.value)} style={inputStyle} />
      </div>
    );

    if (ct === "OPPORTUNITY" && action === "buy") {
      const isStockBuy = turn.card && (turn.card.sub || "").length > 0 && !turn.card.cf;
      return (
        <>
          {isStockBuy ? (
            <>
              {numField("매수 주식 수량", shares, setShares, "📊")}
              {numField("주당 가격 ($)", pricePerShare, setPricePerShare, "💵")}
            </>
          ) : (
            <>
              {numField("착수금 ($)", buyCost, setBuyCost, "💵")}
              {numField("은행 대출 ($)", loan, setLoan, "🏦")}
              {numField("월 현금흐름 ($)", cf, setCf, "📊")}
            </>
          )}
        </>
      );
    }
    if (ct === "OPPORTUNITY" && action === "sell") {
      return (
        <>
          {numField("매각 수량", shares, setShares, "📊")}
          {numField("매각가 ($/주)", sellPrice, setSellPrice, "💵")}
        </>
      );
    }
    if (ct === "STOCK_SELL") {
      return (
        <>
          {numField("매각 수량", shares, setShares, "📊")}
          {numField("매각가 ($/주)", sellPrice, setSellPrice, "💵")}
        </>
      );
    }
    if (ct === "EXT_SELL") {
      return numField("매각가 ($)", sellPrice, setSellPrice, "💵");
    }
    if (ct === "MARKET" && action === "sell") {
      // 🆕 카드의 고정 매각가는 수정 불가 (읽기 전용 표시)
      const cardFixed = turn.card?.sell ? parseNum(turn.card.sell) : (turn._sellPrice || 0);
      return (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: "#f59e0b10", border: "1px solid #f59e0b30" }}>
          <div style={{ fontSize: 10, color: "#fde68a", fontWeight: 700, marginBottom: 2 }}>
            📋 카드 고정 매각가 (수정 불가)
          </div>
          <div style={{ fontSize: 14, color: "#fde68a", fontWeight: 800 }}>
            ${fmtNum(cardFixed)}
          </div>
        </div>
      );
    }
    if (ct === "MARKET" && action === "damage") {
      return numField("손상 지불액 ($)", damageAmount, setDamageAmount, "💥");
    }
    if (ct === "DOODAD") {
      return numField("지출 금액 ($)", cost, setCost, "💸");
    }
    if (ct === "EXTRA_LOAN") {
      return numField(turn.action === "repay" ? "상환 금액 ($)" : "대출 금액 ($)", loanAmount, setLoanAmount, "🏦");
    }
    if (ct === "EXTRA_CASH") {
      return numField("보정 금액 ($, 양수=입금)", cashAmount, setCashAmount, "💵");
    }
    if (ct === "EXTRA_SPLIT") {
      return numField("배율 (2=증자, 0.5=감자)", multiplier, setMultiplier, "📈");
    }
    if (ct === "EXTRA_BUY") {
      return (
        <>
          {numField("권리금 ($)", deposit, setDeposit, "💼")}
          {numField("착수금 ($)", buyCost, setBuyCost, "💵")}
          {numField("월 현금흐름 ($)", cf, setCf, "📊")}
          {numField("은행 대출 ($)", loan, setLoan, "🏦")}
        </>
      );
    }
    // 편집 불가 타입 (PAYDAY/BABY/CHARITY/DOWNSIZED)
    return (
      <div style={{ padding: 12, borderRadius: 8, background: "#0a0a0f", border: "1px dashed #27272a", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>
          이 턴({ct})은 숫자 필드 편집이 불필요합니다.
        </p>
        <p style={{ fontSize: 10, color: "#71717a", margin: "4px 0 0" }}>
          메모만 수정할 수 있습니다. 삭제하려면 ❌ 취소 후 🗑️ 삭제 버튼을 사용하세요.
        </p>
      </div>
    );
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }} onClick={onClose}>
      <div style={{
        width: "100%", maxWidth: 440, background: "#111118",
        borderRadius: 16, border: "1px solid #27272a", padding: 24,
        maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: "#fafafa", margin: 0 }}>
            ✏️ T{turn.turn} 턴 편집
          </h2>
          <p style={{ fontSize: 10, color: "#71717a", margin: "4px 0 0" }}>
            턴 타입: {ct} {action ? `· ${action}` : ""}
          </p>
          <p style={{ fontSize: 10, color: "#a1a1aa", margin: "8px 0 0", padding: "6px 10px", borderRadius: 6, background: "#3b82f615", border: "1px solid #3b82f630" }}>
            ℹ️ 숫자를 바꾸면 현금·자산·대출이 자동 재계산됩니다.
          </p>
        </div>

        {renderFields()}

        {/* 메모 (transaction) 공통 편집 */}
        <div style={{ marginTop: 10, marginBottom: 16 }}>
          <label style={{ fontSize: 10, color: "#a1a1aa", display: "block", marginBottom: 4, fontWeight: 600 }}>📝 메모 (기록 설명)</label>
          <textarea
            value={transaction}
            onChange={e => setTransaction(e.target.value)}
            rows={2}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #27272a",
              background: "#0a0a0f", color: "#e4e4e7", fontSize: 11, outline: "none", boxSizing: "border-box",
              fontFamily: "inherit", resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #27272a",
            background: "transparent", color: "#a1a1aa", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>❌ 취소</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "10px", borderRadius: 8, border: "none",
            background: "#3b82f6", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}>💾 저장 (자동 재계산)</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PlayMode 컴포넌트
═══════════════════════════════════════════════════ */
function PlayMode({ version, currentPlayer, onSaveGame, onReviewPrompt, reviewClickedSessions, isContestMode = false, authUser = null }) {
  const deck = DECKS[version];
  const [job, setJob] = useState(null);
  const [turnLog, setTurnLog] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [boardPos, setBoardPos] = useState(0); // 현재 보드 위치 (0=시작, 1~24)
  const [diceInput, setDiceInput] = useState(""); // 주사위 숫자 입력
  const [diceConfirmed, setDiceConfirmed] = useState(false); // 주사위 확정 여부
  const [passedPaydays, setPassedPaydays] = useState(0); // 이번 턴에 지나간 페이데이 수
  const [cellType, setCellType] = useState("");
  const [dealType, setDealType] = useState("deal1");
  const [selectedCard, setSelectedCard] = useState(null);
  const [action, setAction] = useState(null);
  const [shares, setShares] = useState("");
  const [sellPriceInput, setSellPriceInput] = useState(0);
  const [rightsPrice, setRightsPrice] = useState(0);
  const [gameEnded, setGameEnded] = useState(false); // 쥐경주 탈출 시 true
  const [gameSaved, setGameSaved] = useState(false); // 게임 저장 완료 시 true (디브리핑 버튼 활성화 조건)
  const [gameSaving, setGameSaving] = useState(false); // 저장 버튼 클릭 후 응답 대기 중
  const [playSessionId, setPlaySessionId] = useState(null); // 후기 버튼용 세션 ID
  // 초기 대출 (job 선택 시점의 옵션 — turnLog 바깥 상태로 유지)
  const [initialLoan, setInitialLoan] = useState(0);
  const [viewTab, setViewTab] = useState("input"); // "input"|"assets"|"history"
  const [timerOn, setTimerOn] = useState(true); // 타이머 켜기/끄기
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0); // 초 단위
  const [cardSelectedAt, setCardSelectedAt] = useState(null); // 카드 선택 시점(ms)

  // 타인 마켓카드 기반 외부 매도용 입력 (document.getElementById 대신 controlled state)
  const [reSellIdx, setReSellIdx] = useState(0);
  const [reSellPrice, setReSellPrice] = useState("");
  const [stockSellQty, setStockSellQty] = useState({});    // { [assetIndex]: qty }
  const [stockSellPrice, setStockSellPrice] = useState({}); // { [assetIndex]: price }

  // ─── 2차 작업 (딜러 도구) UI state ───
  const [dealerToolsOpen, setDealerToolsOpen] = useState(false);
  const dealerToolsRef = useRef(null); // 빠른 접근 버튼으로 스크롤할 대상
  // 턴 편집 모달: { index, turn } | null
  const [editingTurn, setEditingTurn] = useState(null);
  const [extraTool, setExtraTool] = useState(null); // "split" | "wipe" | "buy" | "cash" | null
  const [extraSplitName, setExtraSplitName] = useState("");
  const [extraSplitMultiplier, setExtraSplitMultiplier] = useState("2");
  const [extraBuyName, setExtraBuyName] = useState("");
  const [extraBuyCost, setExtraBuyCost] = useState("");
  const [extraBuyCF, setExtraBuyCF] = useState("");
  const [extraBuyType, setExtraBuyType] = useState("사업");
  const [extraBuyLoan, setExtraBuyLoan] = useState("");

  // ─── 카드 선택 드릴다운 state (기회/권리금 인수 공용 패턴) ───
  const [cardCategory, setCardCategory] = useState(null); // "주식"|"부동산"|"사업"|null
  const [cardSubtype, setCardSubtype] = useState(null);   // 종목/주택타입/딜크기 등
  // MARKET 카드 드릴다운 state
  const [marketCategory, setMarketCategory] = useState(null); // "부동산"|"사업"|"이벤트"|null
  const [marketSubtype, setMarketSubtype] = useState(null);
  // 권리금 인수용 별도 드릴다운 state
  const [extraBuyCategory, setExtraBuyCategory] = useState(null); // "부동산"|"사업"|null
  const [extraBuySubtype, setExtraBuySubtype] = useState(null);
  const [extraBuySelectedCard, setExtraBuySelectedCard] = useState(null);
  // 권리금 인수 2단계 전환 (Step 1: 권리금 입력 / Step 2: 구매-포기 결정)
  const [extraBuyStep, setExtraBuyStep] = useState(1);     // 1 | 2
  const [extraBuyDeposit, setExtraBuyDeposit] = useState(0);  // Step 2로 넘어갈 때 지불한 권리금 저장
  const [extraBuyExtraLoan, setExtraBuyExtraLoan] = useState(0); // Step 2에서 추가 대출 받은 금액
  const [extraCashAmount, setExtraCashAmount] = useState("");
  const [extraCashReason, setExtraCashReason] = useState("");

  // 타이머: 직업 선택 시 시작, timerOn일 때만 카운트
  useEffect(() => {
    if (!job || !startTime || !timerOn) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [job, startTime, timerOn]);

  const jobData = job ? JOBS.find(j => j.name === job) : null;

  // ═════════════════════════════════════════════════
  // 🎮 파생 재무 상태 (엔진 기반 재계산)
  // ═════════════════════════════════════════════════
  // turnLog + initialLoan 으로부터 매 렌더 시 자동 재계산.
  // cash/assets/totalCF/babies/bankLoan/loanInterest/totalExpense 등은 전부 이 useMemo에서 파생.
  const gameState = useMemo(
    () => computeGameState(jobData, turnLog, { initialLoan }),
    [jobData, turnLog, initialLoan]
  );
  const {
    cash,
    assets,
    totalCF,
    babies,
    bankLoan,
    loanInterest,
    totalExpense,
    charityTurnsRemaining,
    downsizeRestRemaining,
  } = gameState;
  // 기존 코드와의 변수명 호환
  const charityTurns = charityTurnsRemaining;
  const downsizeRestTurns = downsizeRestRemaining;
  const baseExpense = jobData ? jobData.expense : 0;
  const childTotal = jobData ? babies * jobData.childCost : 0;
  const passiveIncome = totalCF;
  const escaped = totalCF > totalExpense;

  const cardList = useMemo(() => 
    cellType === "OPPORTUNITY" ? (dealType === "deal1" ? deck.deal1 : deck.deal2) : cellType === "MARKET" ? deck.market : cellType === "DOODAD" ? deck.doodad : []
  , [cellType, dealType, deck]);

  // ── 기회 카드 드릴다운용 파생 ──
  // 카테고리별 카드 개수 (Step 1 버튼에 표시)
  const cardCategoriesWithCounts = useMemo(() => {
    if (cellType !== "OPPORTUNITY") return [];
    const acc = { "주식": 0, "부동산": 0, "사업": 0, "기타": 0 };
    for (const c of cardList) {
      const cat = classifyCardCategory(c);
      acc[cat] = (acc[cat] || 0) + 1;
    }
    return ["주식", "부동산", "사업", "기타"].filter(k => acc[k] > 0).map(k => ({ key: k, count: acc[k] }));
  }, [cardList, cellType]);

  // 선택된 카테고리 안의 서브타입별 카드 개수 (Step 2 버튼에 표시)
  const cardSubtypesWithCounts = useMemo(() => {
    if (cellType !== "OPPORTUNITY" || !cardCategory) return [];
    const acc = new Map();
    for (const c of cardList) {
      if (classifyCardCategory(c) !== cardCategory) continue;
      const sub = getCardSubtype(c, dealType);
      acc.set(sub, (acc.get(sub) || 0) + 1);
    }
    return Array.from(acc.entries()).map(([key, count]) => ({ key, count }));
  }, [cardList, cardCategory, cellType, dealType]);

  // 선택된 카테고리+서브타입으로 필터링된 실제 카드 (Step 3 목록)
  const filteredCards = useMemo(() => {
    if (cellType !== "OPPORTUNITY") return cardList;
    return cardList.filter(c => {
      if (cardCategory && classifyCardCategory(c) !== cardCategory) return false;
      if (cardSubtype && getCardSubtype(c, dealType) !== cardSubtype) return false;
      return true;
    });
  }, [cardList, cardCategory, cardSubtype, cellType, dealType]);

  // ── MARKET 카드 드릴다운 파생 ──
  const marketCategoriesWithCounts = useMemo(() => {
    if (cellType !== "MARKET") return [];
    const acc = { "부동산": 0, "사업": 0, "이벤트": 0 };
    for (const c of cardList) {
      const cat = classifyMarketCategory(c);
      if (acc[cat] !== undefined) acc[cat]++;
    }
    return ["부동산", "사업", "이벤트"].filter(k => acc[k] > 0).map(k => ({ key: k, count: acc[k] }));
  }, [cardList, cellType]);

  const marketSubtypesWithCounts = useMemo(() => {
    if (cellType !== "MARKET" || !marketCategory) return [];
    const acc = new Map();
    for (const c of cardList) {
      if (classifyMarketCategory(c) !== marketCategory) continue;
      const sub = getMarketSubtype(c);
      acc.set(sub, (acc.get(sub) || 0) + 1);
    }
    return Array.from(acc.entries()).map(([key, count]) => ({ key, count }));
  }, [cardList, marketCategory, cellType]);

  const filteredMarketCards = useMemo(() => {
    if (cellType !== "MARKET") return cardList;
    const filtered = cardList.filter(c => {
      if (marketCategory && classifyMarketCategory(c) !== marketCategory) return false;
      if (marketSubtype && getMarketSubtype(c) !== marketSubtype) return false;
      return true;
    });
    // 동일 카드 통합: sell 값 + desc + special 조합으로 중복 제거
    // 매각 카드 중 같은 매각가·같은 설명을 가진 것은 한 번만 표시
    const seen = new Map();
    for (const c of filtered) {
      // 통합 키: sell 값 + desc 핵심부 (앞 20자) + special
      const key = `${c.sell || ""}|${(c.desc || "").substring(0, 20)}|${c.special || ""}`;
      if (!seen.has(key)) {
        seen.set(key, c);
      }
    }
    return Array.from(seen.values());
  }, [cardList, marketCategory, marketSubtype, cellType]);

  // ── 권리금 인수 드릴다운용 파생 ──
  // 카드 풀: SMALL + BIG 전체. 주식/증자감자 제외 (부동산/사업만).
  // 각 카드에 원본 deal 정보를 함께 기록 (서브타입 계산용).
  const extraBuyCardPool = useMemo(() => {
    const small = (deck.deal1 || []).map(c => ({ card: c, dealType: "deal1" }));
    const big = (deck.deal2 || []).map(c => ({ card: c, dealType: "deal2" }));
    return [...small, ...big].filter(({ card }) => {
      if (isStock(card)) return false;
      if (isSplitCard(card)) return false;
      const cat = classifyCardCategory(card);
      return cat === "부동산" || cat === "사업";
    });
  }, [deck]);

  const extraBuyCategoriesWithCounts = useMemo(() => {
    const acc = { "부동산": 0, "사업": 0 };
    for (const { card } of extraBuyCardPool) {
      const cat = classifyCardCategory(card);
      if (acc[cat] !== undefined) acc[cat]++;
    }
    return ["부동산", "사업"].filter(k => acc[k] > 0).map(k => ({ key: k, count: acc[k] }));
  }, [extraBuyCardPool]);

  const extraBuySubtypesWithCounts = useMemo(() => {
    if (!extraBuyCategory) return [];
    const acc = new Map();
    for (const { card, dealType: dt } of extraBuyCardPool) {
      if (classifyCardCategory(card) !== extraBuyCategory) continue;
      const sub = getCardSubtype(card, dt);
      acc.set(sub, (acc.get(sub) || 0) + 1);
    }
    return Array.from(acc.entries()).map(([key, count]) => ({ key, count }));
  }, [extraBuyCardPool, extraBuyCategory]);

  const extraBuyFilteredCards = useMemo(() => {
    return extraBuyCardPool.filter(({ card, dealType: dt }) => {
      if (extraBuyCategory && classifyCardCategory(card) !== extraBuyCategory) return false;
      if (extraBuySubtype && getCardSubtype(card, dt) !== extraBuySubtype) return false;
      return true;
    });
  }, [extraBuyCardPool, extraBuyCategory, extraBuySubtype]);

  // 주사위 확정 → 보드 이동 + 페이데이 통과 처리
  const confirmDice = () => {
    const diceVal = parseInt(diceInput) || 0;
    const maxDice = charityTurns > 0 ? 12 : 6;
    if (diceVal < 1 || diceVal > maxDice) return;

    const oldPos = boardPos;
    const newPos = ((boardPos + diceVal - 1) % 24) + 1;

    // 지나간 칸 중 페이데이 체크 (현재 위치 다음 칸부터 도착 칸까지)
    let payCount = 0;
    for (let step = 1; step <= diceVal; step++) {
      const checkPos = ((boardPos + step - 1) % 24) + 1;
      if (checkPos !== newPos && BOARD[checkPos - 1].type === "PAYDAY") {
        payCount++;
      }
    }

    // 지나간 페이데이 수는 passedPaydays로 추적. 실제 현금 반영은 addTurn에서
    // createPaydayPassTurn으로 turnLog에 적재되며, 파생 상태가 자동 재계산.

    setBoardPos(newPos);
    setPassedPaydays(payCount);
    const landedCell = BOARD[newPos - 1];
    setCellType(landedCell.type);
    setDiceConfirmed(true);
    setSelectedCard(null);
    setAction(null);
    setShares("");
    setSellPriceInput(0);
    if (timerOn) setCardSelectedAt(null);
  };

  const checkSellEligibility = (card) => {
    if (!card) return { eligible: true, message: "" };
    // MARKET 카드에는 주식이 없으므로 부동산/사업만 매칭
    const desc = (card.desc || "") + (card.sell || "") + (card.special || "");
    for (const rule of SELL_RULES) {
      if (rule.descRe.test(desc) && !assets.some(a => rule.assetRe.test(a.name))) {
        return { eligible: false, message: rule.msg };
      }
    }
    return { eligible: true, message: "" };
  };

  const sellCheck = (cellType === "MARKET" && selectedCard && action === "sell") ? checkSellEligibility(selectedCard) : { eligible: true, message: "" };

  // ── MARKET 카드 자동 해당없음: 선택된 카드가 매도 제안인데 매도 가능 자산이 없으면 action을 자동 "na"로 설정
  useEffect(() => {
    if (cellType !== "MARKET" || !selectedCard) return;
    const cardText = (selectedCard.desc || "") + (selectedCard.special || "");

    // 🔧 배관 카드: 다가구 보유 시 damage, 미보유 시 na
    if (RE_PLUMBING.test(cardText)) {
      const hasMultiFamily = assets.some(a =>
        a.type === "부동산" && /가구|다가구/.test(a.name)
      );
      const target = hasMultiFamily ? "damage" : "na";
      if (action !== target) setAction(target);
      return;
    }

    // 임차인 자산 손상 카드는 건너뜀 (자체 판정)
    if (RE_DAMAGE.test(cardText)) return;

    // 매도 제안 카드에서 보유 자산이 없으면 자동 "na"
    const canSell = checkSellEligibility(selectedCard);
    if (!canSell.eligible && action !== "na") {
      setAction("na");
    }
  }, [selectedCard, cellType]); // action을 deps에 넣지 않음 (무한 루프 방지)

  // 종목별 보유 주식 수량
  const getOwnedShares = (card) => {
    if (!card) return 0;
    const name = (card.sub || "").trim();
    return assets.filter(a => a.type === "주식" && a.shares > 0 && a.name.includes(name)).reduce((s, a) => s + (a.shares || 0), 0);
  };

  const extractDown = (card) => {
    if (!card) return 0;
    const d = card.down || "";
    const m = d.replace(RE_NUM, "");
    if (d.includes("K")) return (parseInt(m) || 0) * 1000;
    return parseInt(m) || 0;
  };

  const extractLoan = (card) => {
    if (!card) return 0;
    const price = parseNum(card.price);
    const down = extractDown(card);
    return (price > 0 && down > 0) ? price - down : 0;
  };

  const extractStockCost = (card, qty) => {
    if (!card || !isStock(card)) return 0;
    return parseNum(card.price) * (parseInt(qty) || 0);
  };

  const getBuyCost = () => {
    if (!selectedCard) return 0;
    if (isStock(selectedCard)) return extractStockCost(selectedCard, parseInt(shares) || 0);
    return extractDown(selectedCard);
  };

  const buyCost = getBuyCost();
  const cashCheck = (cellType === "OPPORTUNITY" && selectedCard && action === "buy") ? 
    { enough: cash >= buyCost, shortage: Math.max(0, buyCost - cash), message: buyCost > 0 ? `현금 $${fmtNum(cash)} / 필요 $${fmtNum(buyCost)} → ${cash >= buyCost ? "구매 가능" : `$${fmtNum(buyCost - cash)} 부족`}` : "" } :
    { enough: true, shortage: 0, message: "" };

  const addTurn = () => {
    if (!selectedCard && !["PAYDAY","CHARITY","BABY","DOWNSIZED"].includes(cellType)) return;

    const decisionSec = (timerOn && cardSelectedAt && action) ? Math.round((Date.now() - cardSelectedAt) / 1000) : null;
    const sharesNum = parseInt(shares) || 0;
    const time = timerOn ? elapsed : null;
    const dice = parseInt(diceInput) || 0;
    const turn = currentTurn;
    const dealTypeName = cellType === "OPPORTUNITY"
      ? (dealType === "deal1" ? deck.deal1Name : deck.deal2Name)
      : cellType;

    let entry = null;
    let transaction = "";
    let splitApplied = null; // 무상증자/감자: true=보유중적용, false=미보유해당없음, null=해당없음
    let soldAssetInfo = null; // MARKET 매각 시 실제 매각된 자산 정보 (AI 브리핑용)

    // ── OPPORTUNITY ──
    if (cellType === "OPPORTUNITY" && action === "buy" && selectedCard) {
      const cf = parseNumNeg(selectedCard.cf);
      const type = getAssetType(selectedCard);
      const down = isStock(selectedCard) ? extractStockCost(selectedCard, sharesNum) : extractDown(selectedCard);
      const loan = isStock(selectedCard) ? 0 : extractLoan(selectedCard);
      const assetName = type === "주식"
        ? (selectedCard.sub || "주식")
        : (selectedCard.sub || selectedCard.desc?.substring(0, 20) || "자산");
      entry = createBuyTurn({
        turn, boardPos, dice, passedPaydays, dealType: dealTypeName, card: selectedCard,
        buyCost: down, cf: type === "주식" ? 0 : cf, assetType: type, assetName,
        shares: type === "주식" ? sharesNum : undefined,
        stockPrice: type === "주식" ? (selectedCard.price || "") : undefined,
        loan, time, decisionSec,
      });
      transaction = type === "주식"
        ? `${selectedCard.sub||"주식"} ${sharesNum}주 구매 @${selectedCard.price} → -$${fmtNum(down)}`
        : `${assetName} 구매 착수금 -$${fmtNum(down)} / CF +$${cf}/월`;
    }
    else if (cellType === "OPPORTUNITY" && action === "sell" && selectedCard && isStock(selectedCard)) {
      const sellTotal = sellPriceInput * sharesNum;
      entry = createSellStockTurn({
        turn, boardPos, dice, passedPaydays, dealType: dealTypeName, card: selectedCard,
        stockName: (selectedCard.sub || "").trim(),
        sellQty: sharesNum, sellPrice: sellPriceInput,
        time, decisionSec,
      });
      transaction = `${selectedCard.sub||"주식"} ${sharesNum}주 매각 @$${sellPriceInput} → +$${fmtNum(sellTotal)}`;
    }
    else if (cellType === "OPPORTUNITY" && action === "rights" && selectedCard) {
      // rights 전용 팩토리가 없으므로 OPPORTUNITY action:rights entry를 직접 구성
      entry = {
        turn, cellType: "OPPORTUNITY", boardPos, dice, passedPaydays,
        dealType: dealTypeName, card: selectedCard, action: "rights",
        time, decisionSec,
        _schemaVersion: SCHEMA_VERSION,
        _rightsPrice: rightsPrice,
      };
      transaction = `권리판매 +$${fmtNum(rightsPrice)}`;
    }
    else if (cellType === "OPPORTUNITY" && action === "pass") {
      entry = {
        turn, cellType: "OPPORTUNITY", boardPos, dice, passedPaydays,
        dealType: dealTypeName, card: selectedCard, action: "pass",
        time, decisionSec,
        _schemaVersion: SCHEMA_VERSION,
      };
      transaction = `${selectedCard?.sub||"카드"} 패스`;
    }
    // ── 무상증자/감자 ──
    else if (cellType === "OPPORTUNITY" && action === "split" && selectedCard && isSplitCard(selectedCard)) {
      const mult = getSplitMultiplier(selectedCard);
      const stockName = (selectedCard.sub || "").trim();
      const owned = assets.filter(a => a.type === "주식" && a.shares > 0 && a.name.includes(stockName));
      if (owned.length > 0) {
        const totalBefore = owned.reduce((s, a) => s + (a.shares || 0), 0);
        const totalAfter = mult >= 1 ? Math.floor(totalBefore * mult) : Math.round(totalBefore * mult);
        entry = {
          turn, cellType: "OPPORTUNITY", boardPos, dice, passedPaydays,
          dealType: dealTypeName, card: selectedCard, action: "split",
          time, decisionSec,
          _schemaVersion: SCHEMA_VERSION,
          _stockName: stockName,
          _multiplier: mult,
        };
        transaction = mult >= 1
          ? `${selectedCard.sub} 무상증자 ${totalBefore}주 → ${totalAfter}주 (×${mult})`
          : `${selectedCard.sub} 감자 ${totalBefore}주 → ${totalAfter}주 (×${mult})`;
        splitApplied = true;
      } else {
        // 보유 없음: 재계산에 영향 없는 pass-유사 entry
        entry = {
          turn, cellType: "OPPORTUNITY", boardPos, dice, passedPaydays,
          dealType: dealTypeName, card: selectedCard, action: "split",
          time, decisionSec,
          _schemaVersion: SCHEMA_VERSION,
          _stockName: stockName,
          _multiplier: 1, // 무효 — 재계산에 영향 없음
        };
        transaction = `${selectedCard.sub} ${mult >= 1 ? "무상증자" : "감자"} — 보유 없음, 해당 없음`;
        splitApplied = false;
      }
    }
    // ── MARKET ──
    else if (cellType === "MARKET" && action === "sell" && selectedCard) {
      // SELL_RULES로 매칭되는 보유 자산 찾기
      const desc = (selectedCard.desc || "") + (selectedCard.sell || "") + (selectedCard.special || "");
      let sellAsset = null;
      for (const rule of SELL_RULES) {
        if (rule.descRe.test(desc)) {
          sellAsset = findLastSafe(assets, a => a.type !== "주식" && rule.assetRe.test(a.name));
          if (sellAsset) break;
        }
      }
      if (!sellAsset) sellAsset = findLastSafe(assets, a => a.type !== "주식");

      // 🆕 매각가 추출: 이자율 하락 카드는 특수 공식, 나머지는 카드의 sell 필드
      let sellPrice = 0;
      const isRateDrop = /이자율 하락/.test(desc);
      if (isRateDrop && sellAsset) {
        // 이자율 하락 차익 = 주택가격 + $50,000 - 대출
        const assetPrice = parseNum(sellAsset.price || sellAsset.cost || 0);
        const assetLoanForCalc = sellAsset.loan || 0;
        sellPrice = assetPrice + 50000 - assetLoanForCalc;
      } else if (selectedCard.sell) {
        sellPrice = parseNum(selectedCard.sell);
      } else {
        const priceMatch = (selectedCard.desc || "").match(/\$([0-9]{1,3}(?:,[0-9]{3})*)/);
        if (priceMatch) sellPrice = parseInt(priceMatch[1].replace(/,/g, "")) || 0;
      }
      if (sellAsset) {
        const assetLoan = sellAsset.loan || 0;
        // 이자율 하락 카드의 sellPrice는 이미 net proceeds (대출 제외된 차익). 중복 차감 방지
        const netProceeds = isRateDrop ? sellPrice : Math.max(0, sellPrice - assetLoan);
        soldAssetInfo = { name: sellAsset.name, type: sellAsset.type, cf: sellAsset.cf, sellPrice };
        entry = createMarketSellTurn({
          turn, boardPos, dice, passedPaydays, card: selectedCard,
          assetId: sellAsset.id,
          sellPrice: isRateDrop ? sellPrice + assetLoan : sellPrice,
          assetCF: sellAsset.cf,
          assetLoan,
          time, decisionSec,
        });
        transaction = isRateDrop
          ? `${sellAsset.name}(${sellAsset.type}) 매각 차익 $${fmtNum(netProceeds)} (공식: 가격 + $50K - 대출)`
          : `${sellAsset.name}(${sellAsset.type}) 매각 $${fmtNum(sellPrice)} - 대출 $${fmtNum(assetLoan)} = +$${fmtNum(netProceeds)}`;
      } else {
        // 매각 대상 없음 — hold 유사 처리
        entry = {
          turn, cellType: "MARKET", boardPos, dice, passedPaydays,
          dealType: "MARKET", card: selectedCard, action: "sell",
          time, decisionSec,
          _schemaVersion: SCHEMA_VERSION,
        };
        transaction = "MARKET 매각 — 대상 자산 없음";
      }
    }
    else if (cellType === "MARKET" && action === "damage" && selectedCard) {
      const cardText = (selectedCard.special || "") + (selectedCard.desc || "");
      const isPlumbing = RE_PLUMBING.test(cardText);
      const perUnitMatch = cardText.match(/\$?([0-9,]+)/);
      const perUnit = perUnitMatch ? parseInt(perUnitMatch[1].replace(/,/g, "")) || 0 : 0;

      if (isPlumbing) {
        // 🔧 노후 배관 교체: 다가구 주택 보유 시에만 고정 $2,000 지불
        const multiFamilyAssets = assets.filter(a =>
          a.type === "부동산" && /가구|다가구/.test(a.name)
        );
        const hasMultiFamily = multiFamilyAssets.length > 0;
        const plumbingCost = hasMultiFamily ? perUnit : 0;

        entry = {
          turn, cellType: "MARKET", boardPos, dice, passedPaydays,
          dealType: "MARKET", card: selectedCard, action: hasMultiFamily ? "damage" : "na",
          time, decisionSec,
          _schemaVersion: SCHEMA_VERSION,
          _damageAmount: plumbingCost,
        };
        transaction = hasMultiFamily
          ? `노후 배관 교체 지불 -$${fmtNum(plumbingCost)} (다가구 주택 보유)`
          : `노후 배관 교체 — 다가구 주택 미보유, 해당없음`;
      } else {
        // 기존: 임차인 자산 손상 — 보유 부동산 채수 × 단가
        const realEstateAssets_ = assets.filter(a => a.type === "부동산");
        const totalUnits = realEstateAssets_.reduce((sum, a) => sum + getAssetUnits(a), 0);
        const damageTotal = perUnit * totalUnits;
        entry = {
          turn, cellType: "MARKET", boardPos, dice, passedPaydays,
          dealType: "MARKET", card: selectedCard, action: "damage",
          time, decisionSec,
          _schemaVersion: SCHEMA_VERSION,
          _damageAmount: damageTotal,
        };
        transaction = totalUnits > 0
          ? `자산 손상 지불 ${totalUnits}채 × $${fmtNum(perUnit)} = -$${fmtNum(damageTotal)}`
          : `자산 손상 — 보유 부동산 없음, 지불 없음`;
      }
    }
    else if (cellType === "MARKET" && (action === "hold" || action === "na")) {
      entry = {
        turn, cellType: "MARKET", boardPos, dice, passedPaydays,
        dealType: "MARKET", card: selectedCard, action,
        time, decisionSec,
        _schemaVersion: SCHEMA_VERSION,
      };
      transaction = action === "na" ? "MARKET 해당없음" : "MARKET 홀딩";
    }
    // ── DOODAD ──
    else if (cellType === "DOODAD" && selectedCard) {
      const isChildCard = RE_CHILD_DOODAD.test(selectedCard.desc || "");
      const amt = parseNum(selectedCard.amount);
      const actualAmt = isChildCard ? amt * babies : amt;
      entry = createDoodadTurn({
        turn, boardPos, dice, passedPaydays, card: selectedCard,
        amount: amt, isChildCard,
        time, decisionSec,
      });
      transaction = isChildCard
        ? `DOODAD ${selectedCard.desc?.substring(0,15)} 자녀${babies}명×$${amt} = -$${fmtNum(actualAmt)}`
        : `DOODAD -$${fmtNum(actualAmt)}`;
    }
    // ── PAYDAY (도착 칸) ──
    else if (cellType === "PAYDAY") {
      const childTotal = jobData ? babies * jobData.childCost : 0;
      const paydayAmount = jobData ? (jobData.cashflow + totalCF - childTotal - loanInterest) : 0;
      entry = createPaydayTurn({
        turn, boardPos, dice, passedPaydays, payAmount: paydayAmount, time,
      });
      transaction = `PayDay +$${fmtNum(paydayAmount)}`;
    }
    // ── CHARITY ──
    else if (cellType === "CHARITY") {
      if (action === "charity_yes") {
        const totalIncome = (jobData?.salary || 0) + totalCF;
        const charityAmount = Math.round(totalIncome * 0.1);
        entry = createCharityTurn({
          turn, boardPos, dice, passedPaydays,
          donated: true, donationAmount: charityAmount,
          time, decisionSec,
        });
        transaction = `기부 -$${fmtNum(charityAmount)} → 주사위2개×3턴`;
      } else {
        entry = createCharityTurn({
          turn, boardPos, dice, passedPaydays,
          donated: false, donationAmount: 0,
          time, decisionSec,
        });
        transaction = "기부 안함";
      }
    }
    // ── BABY ──
    else if (cellType === "BABY") {
      entry = createBabyTurn({
        turn, boardPos, dice, passedPaydays, time, decisionSec,
      });
      transaction = babies >= 3
        ? `베이비 칸 — 자녀 3명 제한, 기록만 (총 양육비 $${fmtNum((jobData?.childCost || 0) * 3)}/월 유지)`
        : `아기 탄생 → 양육비 +$${fmtNum(jobData?.childCost)}/월 (자녀 ${babies} → ${babies + 1}명)`;
    }
    // ── DOWNSIZED ──
    else if (cellType === "DOWNSIZED") {
      const expense = totalExpense;
      entry = createDownsizedTurn({
        turn, boardPos, dice, passedPaydays, expense,
        time, decisionSec,
      });
      transaction = `다운사이즈 — 한 달 총지출 -$${fmtNum(expense)} (이후 2턴 휴식)`;
    }

    if (!entry) return;

    // UI/브리핑용 메타데이터를 entry에 첨부
    entry.transaction = transaction;
    entry.splitApplied = splitApplied;
    entry.soldAsset = soldAssetInfo;

    // PayDay 통과 기록 (도착 칸 외에 지나간 PayDay)
    const paydayLogs = [];
    if (passedPaydays > 0) {
      const childTotal = jobData ? babies * jobData.childCost : 0;
      const paydayAmount = jobData ? (jobData.cashflow + totalCF - childTotal - loanInterest) : 0;
      for (let p = 0; p < passedPaydays; p++) {
        const passEntry = createPaydayPassTurn({
          turn, boardPos, payAmount: paydayAmount, time,
        });
        passEntry.transaction = `PayDay 통과 +$${fmtNum(paydayAmount)}`;
        paydayLogs.push(passEntry);
      }
    }

    setTurnLog(prev => [...prev, ...paydayLogs, entry]);
    setCurrentTurn(prev => prev + 1);
    setSelectedCard(null); setAction(null); setShares(""); setCardSelectedAt(null);
    setSellPriceInput(0); setRightsPrice(0);
    setDiceInput(""); setDiceConfirmed(false); setPassedPaydays(0); setCellType("");
    setDealType("deal1"); setViewTab("input");
    setCardCategory(null); setCardSubtype(null);
    setMarketCategory(null); setMarketSubtype(null);
    // 탈출 체크는 useEffect에서 처리 (turnLog 변경 후 파생 상태가 업데이트된 다음 판정)
  };

  // ── 쥐경주 탈출 자동 감지 (파생 상태 기반) ──
  // 플레이 모드와 대회 모드 동일하게 동작. (둘의 차이는 타이머 강제 ON 여부뿐)
  useEffect(() => {
    if (!jobData || gameEnded) return;
    if (totalCF > totalExpense && turnLog.length > 0) {
      setGameEnded(true);
    }
  }, [totalCF, totalExpense, jobData, gameEnded, turnLog.length]);

  // 자산 통계 (단일 루프로 분류 + 집계)
  const assetStats = useMemo(() => {
    const stock = [], re = [], biz = [], other = [];
    let stockShares = 0, reCF = 0, bizCF = 0;
    for (const a of assets) {
      if (a.type === "주식") { stock.push(a); stockShares += (a.shares || 0); }
      else if (a.type === "부동산") { re.push(a); reCF += a.cf; }
      else if (a.type === "사업") { biz.push(a); bizCF += a.cf; }
      else { other.push(a); }
    }
    return { stock, re, biz, other, stockShares, reCF, bizCF };
  }, [assets]);
  const { stock: stockAssets, re: realEstateAssets, biz: bizAssets, other: otherAssets, stockShares: totalStockShares, reCF, bizCF } = assetStats;

  // ── 기록 탭 그룹핑: 진짜 턴(주사위 굴림)을 헤더로, 그 턴에 속한 보조 행위를 본문으로 ──
  // 진짜 턴 cellType: 보드 이동이 발생하는 셀(OPPORTUNITY/MARKET/DOODAD/PAYDAY/CHARITY/BABY/DOWNSIZED)
  //                   + DOWNSIZED_REST (주사위는 안 굴리지만 정식 턴 소모)
  // 보조 행위 cellType: PAYDAY_PASS, STOCK_SELL, EXT_SELL, EXTRA_*
  const MAIN_CELL_TYPES = ["OPPORTUNITY","MARKET","DOODAD","PAYDAY","CHARITY","BABY","DOWNSIZED","DOWNSIZED_REST"];
  const turnGroups = useMemo(() => {
    const groups = [];       // [{ main: entry|null, subs: [entry, ...], turnNum, startIdx }]
    let currentGroup = null;
    for (let i = 0; i < turnLog.length; i++) {
      const t = turnLog[i];
      const isMain = MAIN_CELL_TYPES.includes(t.cellType);
      if (isMain) {
        // 새 진짜 턴 발견 → 이전 그룹 마감
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { main: { entry: t, idx: i }, subs: [], turnNum: t.turn };
      } else {
        // 보조 행위: 현재 그룹에 추가, 그룹이 아직 없으면 "대기 중" 그룹 시작
        if (!currentGroup) {
          currentGroup = { main: null, subs: [], turnNum: t.turn };
        }
        currentGroup.subs.push({ entry: t, idx: i });
      }
    }
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [turnLog]);

  // 턴 편집/삭제 핸들러 — useCallback으로 참조 안정화해서 TurnRow의 memo 효과 발휘
  const handleEditTurn = useCallback((index, turn) => {
    setEditingTurn({ index, turn });
  }, []);

  const handleDeleteTurn = useCallback((index, isSub, turnNum) => {
    const label = isSub ? "이 보조 행위를" : `T${turnNum} 턴을`;
    if (window.confirm(`${label} 삭제하시겠습니까?\n\n⚠️ 기록(로그)만 삭제됩니다.\n현금·자산·대출 등 재무 상태는 자동 재계산됩니다.\n\n계속하시겠습니까?`)) {
      setTurnLog(prev => prev.filter((_, idx) => idx !== index));
    }
  }, []);

  // 턴 row 렌더 — memo된 TurnRow를 사용
  const renderTurnRow = (t, i, isSub) => (
    <TurnRow
      key={i}
      t={t}
      i={i}
      isSub={isSub}
      onEdit={handleEditTurn}
      onDelete={handleDeleteTurn}
    />
  );

  // ── 게임 저장 페이로드 생성 (중복 제거) ──
  const buildGamePayload = () => {
    const gameResults = turnLog.map(t => ({
      turn: t.turn, cell: { type: t.cellType, label: t.cellType }, dealType: t.dealType,
      card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
      decisionSec: t.decisionSec,
      splitApplied: t.splitApplied, // 무상증자/감자 적용 여부
      dice: [0], total: 0, pos: 0,
    }));
    const now = new Date();
    // Phase B: 대회 모드 및 탈출 관련 정보
    const passiveIncome = assets
      .filter(a => a.type !== "주식")
      .reduce((sum, a) => sum + (a.cf || 0), 0);
    return {
      version, job, turnCount: turnLog.length,
      date: now.toLocaleDateString("ko-KR"),
      time: now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      dateTime: now.toISOString(),
      turnLog, assets, cash, totalCF, bankLoan, loanInterest, babies, gameEnded,
      initialLoan, // 파생 상태 재계산용 (복구 시 필수)
      simText: buildPromptText(gameResults, version, turnLog.length),
      gameResults, // 디브리핑 재계산용 (deck 구조 일치)
      // Phase B 추가 필드
      isContest: isContestMode,
      escaped: gameEnded, // 쥐경주 탈출 여부
      escapeTimeSec: gameEnded ? elapsed : null,
      passiveIncomeAtEscape: gameEnded ? passiveIncome : null,
      jobAtEscape: gameEnded ? job : null,
      // ── 디브리핑 데이터 컨테이너 (저장 시점에는 빈 상태로 시작, 디브리핑 진행 시 채워짐) ──
      debriefData: {
        analysis: null,
        analysisAt: null,
        feedback: {
          free:    null,  // { text, generatedAt }
          detail:  null,  // { text, generatedAt }
          premium: null,  // { text, generatedAt }
        },
      },
    };
  };

  // ── 게임 상태 초기화 (중복 제거) ──
  const resetGame = () => {
    setJob(null); setTurnLog([]); setCurrentTurn(1); setBoardPos(0);
    setDiceInput(""); setDiceConfirmed(false);
    setPassedPaydays(0);
    setInitialLoan(0);
    setSelectedCard(null); setAction(null); setShares("");
    setSellPriceInput(0); setRightsPrice(0);
    setViewTab("input"); setCellType("");
    setStartTime(null); setElapsed(0); setCardSelectedAt(null);
    setGameEnded(false); setGameSaved(false);
    setReSellIdx(0); setReSellPrice(""); setStockSellQty({}); setStockSellPrice({});
    setCardCategory(null); setCardSubtype(null);
    setMarketCategory(null); setMarketSubtype(null);
    setExtraBuyCategory(null); setExtraBuySubtype(null); setExtraBuySelectedCard(null);
    setExtraBuyStep(1); setExtraBuyDeposit(0); setExtraBuyExtraLoan(0);
  };

  // ═══════════════════════════════════════════════════
  // 🛡️ 자동 저장 / 복구 (Phase B Day 3)
  // ═══════════════════════════════════════════════════
  const [sessionRestored, setSessionRestored] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState(null);

  // 게임 시작 시 복구 체크 (job 선택 전) - 로컬 우선, 즉시
  useEffect(() => {
    if (sessionRestored || job) return; // 이미 복구했거나 게임 진행 중이면 스킵
    
    // 1차: localStorage 즉시 체크 (동기, 매우 빠름)
    try {
      const localRaw = typeof window !== "undefined" 
        ? localStorage.getItem("cashflow_game_session") 
        : null;
      
      if (localRaw) {
        const local = JSON.parse(localRaw);
        if (local && local.game_state && local.game_state.turnLog && local.game_state.turnLog.length > 0) {
          console.log("[복구] localStorage에서 진행 중 게임 발견:", local.game_state.turnLog.length + "턴");
          setPendingRestoreData(local);
          setShowRestorePrompt(true);
          setSessionRestored(true);
          return; // 로컬 있으면 바로 모달 띄움
        }
      }
    } catch (e) {
      console.warn("[복구] localStorage 읽기 실패:", e);
    }
    
    // 2차: Supabase 체크 (로컬에 없을 때만, 2초 타임아웃)
    const checkSupabase = async () => {
      if (!authUser?.id) {
        setSessionRestored(true);
        return;
      }
      
      try {
        const saved = await loadGameSession(authUser.id);
        if (saved && saved.game_state && saved.game_state.turnLog && saved.game_state.turnLog.length > 0) {
          console.log("[복구] Supabase에서 진행 중 게임 발견:", saved.game_state.turnLog.length + "턴");
          setPendingRestoreData(saved);
          setShowRestorePrompt(true);
        }
      } catch (e) {
        console.warn("[복구] Supabase 체크 실패:", e);
      } finally {
        setSessionRestored(true);
      }
    };
    
    checkSupabase();
  }, [authUser, job, sessionRestored]);

  // 복구 실행
  const handleRestore = () => {
    if (!pendingRestoreData) return;
    const state = pendingRestoreData.game_state;

    // 레거시 스키마(v2 이전) 게임은 재계산 구조와 호환되지 않음 → 복구 거부
    const log = state.turnLog || [];
    if (log.length > 0 && isLegacyTurnLog(log)) {
      alert("이전 버전에서 저장된 게임입니다. 시뮬레이터가 업데이트되어 복구할 수 없습니다. 새로 시작해주세요.");
      setShowRestorePrompt(false);
      setPendingRestoreData(null);
      deleteGameSession(authUser?.id);
      return;
    }

    try {
      setJob(state.job || null);
      setTurnLog(log);
      setCurrentTurn((log.length || 0) + 1);
      setBoardPos(state.boardPos || 0);
      setInitialLoan(state.initialLoan || 0);
      setPlaySessionId(state.playSessionId || `play-${Date.now()}`);
      if (state.timerOn !== undefined) setTimerOn(state.timerOn);
      if (state.startTime) setStartTime(state.startTime);
      setGameEnded(state.gameEnded || false);
      // cash/assets/totalCF/babies/bankLoan/loanInterest/charityTurns/downsizeRestTurns는
      // 파생 상태이므로 복구 시 직접 세팅하지 않음. turnLog + initialLoan으로부터 자동 재계산.

      setShowRestorePrompt(false);
      setPendingRestoreData(null);
    } catch (e) {
      console.error("게임 복구 실패:", e);
      alert("게임 복구 중 오류가 발생했습니다. 새로 시작해주세요.");
      setShowRestorePrompt(false);
      setPendingRestoreData(null);
      deleteGameSession(authUser?.id);
    }
  };

  // 새로 시작
  const handleStartFresh = () => {
    setShowRestorePrompt(false);
    setPendingRestoreData(null);
    deleteGameSession(authUser?.id);
  };

  // 게임 상태 변경 시 자동 저장 (turnLog 변경을 트리거로)
  useEffect(() => {
    // job이 없거나 턴이 하나도 없으면 저장 안 함
    if (!job || turnLog.length === 0) return;
    // 게임이 완료됐으면 저장 안 함 (세션 삭제는 별도에서)
    if (gameEnded) return;
    
    const gameStateToSave = {
      version,
      job,
      turnLog,
      currentTurn,
      boardPos,
      cash,
      totalCF,
      bankLoan,
      loanInterest,
      assets,
      babies,
      playSessionId,
      timerOn,
      startTime,
      charityTurns,
      downsizeRestTurns,
      gameEnded,
    };
    
    const sessionId = playSessionId || `play-${Date.now()}`;
    
    saveGameSession(
      authUser?.id,
      sessionId,
      gameStateToSave,
      {
        isContest: isContestMode,
        job,
        turnCount: turnLog.length,
      }
    );
  }, [turnLog, job, isContestMode, authUser]); // turnLog 변경 시마다

  // 페이지 떠날 때 강제 저장
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (job && turnLog.length > 0 && !gameEnded) {
        const gameStateToSave = {
          version, job, turnLog, currentTurn, boardPos, cash, totalCF,
          bankLoan, loanInterest, assets, babies, playSessionId,
          timerOn, startTime, charityTurns, downsizeRestTurns, gameEnded,
        };
        // 동기적으로 localStorage만 저장 (Supabase는 시간 없음)
        try {
          localStorage.setItem("cashflow_game_session", JSON.stringify({
            session_id: playSessionId || `play-${Date.now()}`,
            user_id: authUser?.id,
            game_state: gameStateToSave,
            turnCount: turnLog.length,
            isContest: isContestMode,
            job,
            savedAt: Date.now(),
          }));
        } catch {}
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [job, turnLog, gameEnded, authUser, isContestMode, version, currentTurn, boardPos, cash, totalCF, bankLoan, loanInterest, assets, babies, playSessionId, timerOn, startTime, charityTurns, downsizeRestTurns]);

  // ═══════════════════════════════════════════════════

  if (!job) {
    // 복구 프롬프트 모달
    if (showRestorePrompt && pendingRestoreData) {
      const state = pendingRestoreData.game_state;
      const savedAt = pendingRestoreData.savedAt 
        ? new Date(pendingRestoreData.savedAt).toLocaleString("ko-KR")
        : pendingRestoreData.last_updated 
          ? new Date(pendingRestoreData.last_updated).toLocaleString("ko-KR")
          : "";
      
      return (
        <div style={{ maxWidth: 480, margin: "40px auto", padding: 20 }}>
          <div style={{
            padding: 28,
            borderRadius: 16,
            background: "linear-gradient(135deg, #1e3a8a20, #3b82f620)",
            border: "2px solid #3b82f6",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎮</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: "0 0 8px 0" }}>
              진행 중인 게임이 있습니다
            </h2>
            <p style={{ fontSize: 13, color: "#a1a1aa", margin: "0 0 16px 0", lineHeight: 1.6 }}>
              이전에 진행하던 게임을 이어서 할 수 있어요.
            </p>
            
            <div style={{ 
              display: "flex", 
              flexDirection: "column",
              gap: 6,
              padding: 14, 
              background: "#0a0a0f", 
              borderRadius: 10,
              marginBottom: 20,
              textAlign: "left",
            }}>
              <div style={{ fontSize: 12, color: "#71717a" }}>
                <span style={{ color: "#a1a1aa" }}>직업:</span> {state.job || "미선택"}
              </div>
              <div style={{ fontSize: 12, color: "#71717a" }}>
                <span style={{ color: "#a1a1aa" }}>진행 턴:</span> {state.turnLog?.length || 0}턴
              </div>
              <div style={{ fontSize: 12, color: "#71717a" }}>
                <span style={{ color: "#a1a1aa" }}>현재 현금:</span> ${state.cash?.toLocaleString() || 0}
              </div>
              {pendingRestoreData.is_contest && (
                <div style={{ fontSize: 12, color: "#fca5a5" }}>
                  🏆 대회 모드
                </div>
              )}
              {savedAt && (
                <div style={{ fontSize: 10, color: "#52525b", marginTop: 4 }}>
                  마지막 저장: {savedAt}
                </div>
              )}
            </div>
            
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                onClick={handleStartFresh}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 10,
                  border: "1px solid #27272a",
                  background: "transparent",
                  color: "#a1a1aa",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🆕 새로 시작
              </button>
              <button 
                onClick={handleRestore}
                style={{
                  flex: 2,
                  padding: "12px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ▶️ 이어서 하기
              </button>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>👔</div>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#fafafa", margin: 0 }}>직업 선택</h3>
          <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>게임에서 뽑은 직업 카드를 선택하세요</p>
        </div>

        {/* 타이머 토글 — 대회 모드에서는 숨김 + 강제 ON */}
        {!isContestMode && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 16px", borderRadius: 10, background: "#111118", border: "1px solid #27272a" }}>
            <span style={{ fontSize: 12, color: timerOn ? "#f59e0b" : "#52525b" }}>⏱ 시간 측정</span>
            <button onClick={() => setTimerOn(!timerOn)} style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: timerOn ? "#f59e0b" : "#27272a", position: "relative", transition: "background 0.2s",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: "#fff",
                position: "absolute", top: 3,
                left: timerOn ? 23 : 3, transition: "left 0.2s",
              }}></div>
            </button>
            <span style={{ fontSize: 10, color: "#71717a" }}>{timerOn ? "켜짐 — 결정 속도 분석 가능" : "꺼짐"}</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {JOBS.map(j => (
            <button key={j.name} onClick={() => { setJob(j.name); setTimerOn(true); setStartTime(Date.now()); setPlaySessionId(`play-${Date.now()}`); }} style={{
              padding: "14px 12px", borderRadius: 12, border: "1px solid #27272a",
              background: "#111118", cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa" }}>{j.name}</div>
              <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>월급 ${fmtNum(j.salary)}</div>
              <div style={{ fontSize: 11, color: "#86efac" }}>현금흐름 ${fmtNum(j.cashflow)}</div>
              <div style={{ fontSize: 10, color: "#71717a" }}>총지출 ${fmtNum(j.expense)} · 양육비 ${fmtNum(j.childCost)}</div>
              <div style={{ fontSize: 10, color: "#fde68a" }}>시작 현금 ${fmtNum((j.savings + j.cashflow))} (저축 ${fmtNum(j.savings)} + CF ${fmtNum(j.cashflow)})</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 재무 요약 */}
      <div style={{ padding: "14px 16px", borderRadius: 14, background: escaped ? "#14532d20" : "#111118", border: `1px solid ${escaped ? "#22c55e50" : "#27272a"}`, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{job}</span>
            <span style={{ fontSize: 11, color: "#71717a", marginLeft: 8 }}>T{currentTurn} · 자녀 {babies}명</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {escaped && <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, background: "#22c55e", color: "#fff" }}>쥐 경주 탈출!</span>}
            {timerOn && <span style={{ fontSize: 14, fontWeight: 800, color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtTime(elapsed)}</span>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 4 }}>
          {[
            { label: "현금", val: `$${fmtNum(cash)}`, color: cash > 0 ? "#fde68a" : "#fca5a5" },
            { label: "패시브 인컴", val: `$${fmtNum(totalCF)}`, color: totalCF >= 0 ? "#86efac" : "#fca5a5" },
            { label: "총지출", val: `$${fmtNum(totalExpense)}`, color: "#fca5a5" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#71717a" }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* 월별 현금흐름 계산 = cashflow + totalCF - 양육비 - 이자 */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "6px 0", marginBottom: 4, borderTop: "1px solid #27272a" }}>
          <span style={{ fontSize: 10, color: "#71717a" }}>월별 현금흐름</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: (jobData ? jobData.cashflow + totalCF - childTotal - loanInterest : 0) >= 0 ? "#22c55e" : "#ef4444" }}>
            ${fmtNum((jobData ? jobData.cashflow + totalCF - childTotal - loanInterest : 0))}/월
          </span>
          <span style={{ fontSize: 9, color: "#52525b" }}>
            (CF ${fmtNum(jobData?.cashflow || 0)}
            {totalCF >= 0 ? " +" : " "}${fmtNum(totalCF)}
            {childTotal > 0 ? ` -${fmtNum(childTotal)}양육비` : ""}
            {loanInterest > 0 ? ` -${fmtNum(loanInterest)}이자` : ""})
          </span>
        </div>
        {bankLoan > 0 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 12, paddingTop: 4, borderTop: "1px solid #27272a" }}>
            <span style={{ fontSize: 10, color: "#fca5a5" }}>은행 대출 ${fmtNum(bankLoan)}</span>
            <span style={{ fontSize: 10, color: "#fca5a5" }}>월 이자 ${fmtNum(loanInterest)}</span>
          </div>
        )}
      </div>

      {/* ═══ 쥐경주 탈출 — 게임 종료 ═══ */}
      {gameEnded && (
        <div style={{ textAlign: "center", padding: "30px 20px", marginBottom: 16, borderRadius: 16, background: "linear-gradient(135deg, #14532d30, #22c55e10)", border: "2px solid #22c55e50" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "#22c55e", margin: 0 }}>쥐 경주 탈출 성공!</h2>
          <p style={{ fontSize: 14, color: "#86efac", marginTop: 8 }}>패시브 인컴 ${fmtNum(totalCF)}/월 &gt; 총지출 ${fmtNum(totalExpense)}/월</p>
          <p style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4 }}>{currentTurn - 1}턴 만에 경제적 자유를 달성했습니다!</p>
          <p style={{ fontSize: 11, color: "#71717a", marginTop: 8 }}>아래 디브리핑에서 당신의 인생 여정을 분석해보세요.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
            <button onClick={() => setViewTab("assets")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #3b82f630", background: "#3b82f610", color: "#93c5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>💼 자산 확인</button>
            <button onClick={() => setViewTab("history")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #f59e0b30", background: "#f59e0b10", color: "#fde68a", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📋 기록 확인</button>
          </div>
        </div>
      )}

      {/* 입력 / 자산 / 기록 탭 */}
      {!gameEnded && (
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #27272a" }}>
        {[
          { key: "input", label: "턴 입력", icon: "🎯" },
          { key: "assets", label: `자산 (${assets.length})`, icon: "💼" },
          { key: "history", label: `기록 (${turnLog.length})`, icon: "📋" },
        ].map(t => (
          <button key={t.key} onClick={() => setViewTab(t.key)} style={{
            flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
            background: viewTab === t.key ? "#3b82f615" : "#0d0d14",
            borderBottom: viewTab === t.key ? "2px solid #3b82f6" : "2px solid transparent",
            color: viewTab === t.key ? "#93c5fd" : "#52525b",
            fontSize: 11, fontWeight: 700,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>
      )}

      {/* 게임 종료 후에도 자산/기록 탭은 볼 수 있음 */}
      {gameEnded && (viewTab === "assets" || viewTab === "history") && (
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid #27272a" }}>
          {[
            { key: "assets", label: `자산 (${assets.length})`, icon: "💼" },
            { key: "history", label: `기록 (${turnLog.length})`, icon: "📋" },
          ].map(t => (
            <button key={t.key} onClick={() => setViewTab(t.key)} style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
              background: viewTab === t.key ? "#3b82f615" : "#0d0d14",
              borderBottom: viewTab === t.key ? "2px solid #3b82f6" : "2px solid transparent",
              color: viewTab === t.key ? "#93c5fd" : "#52525b",
              fontSize: 11, fontWeight: 700,
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
      )}

      {/* ═══ 턴 입력 탭 ═══ */}
      {viewTab === "input" && !gameEnded && (
        <div style={{ padding: "16px", borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>턴 {currentTurn}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {boardPos > 0 && <span style={{ fontSize: 10, color: "#71717a" }}>칸 {boardPos}</span>}
              {charityTurns > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#a855f720", color: "#d8b4fe" }}>🤝 주사위2개 ({charityTurns}턴)</span>}
              {downsizeRestTurns > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#ef444420", color: "#fca5a5" }}>⬇️ 휴식 ({downsizeRestTurns}턴 남음)</span>}
            </div>
          </div>

          {/* 다운사이즈 이후 강제 휴식 턴 (지출/카드 없이 턴만 소비) */}
          {downsizeRestTurns > 0 && (
            <div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "#7f1d1d15", border: "1px solid #ef444440", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>⬇️ 다운사이즈 휴식 턴</div>
                <p style={{ fontSize: 11, color: "#a1a1aa", margin: 0, lineHeight: 1.5 }}>
                  주사위를 굴리지 않고 턴을 넘깁니다. 지출 차감 없음. 남은 휴식 턴 <b style={{ color: "#fca5a5" }}>{downsizeRestTurns}턴</b>.
                </p>
              </div>
              <button onClick={() => {
                const restEntry = {
                  turn: currentTurn, cellType: "DOWNSIZED_REST", boardPos,
                  dice: 0, passedPaydays: 0, dealType: "DOWNSIZED",
                  card: null, action: "rest", shares: null,
                  time: timerOn ? elapsed : null, decisionSec: null,
                  _schemaVersion: SCHEMA_VERSION,
                  transaction: `다운사이즈 휴식 (잔여 ${downsizeRestTurns - 1}턴)`,
                };
                setTurnLog(prev => [...prev, restEntry]);
                setCurrentTurn(prev => prev + 1);
                // downsizeRestTurns와 charityTurns는 파생 상태이므로 엔진이 자동으로 감소시킴.
              }} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", cursor: "pointer", background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
                ⬇️ 턴 {currentTurn} 휴식 (지출 없음)
              </button>
            </div>
          )}

          {/* 주사위 입력 (휴식 턴이 아닐 때) */}
          {downsizeRestTurns === 0 && !diceConfirmed && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 6 }}>
                🎲 주사위 {charityTurns > 0 ? "(2개 합계)" : ""} 입력
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min={charityTurns > 0 ? 2 : 1} max={charityTurns > 0 ? 12 : 6} value={diceInput}
                  onChange={e => setDiceInput(e.target.value)}
                  placeholder={charityTurns > 0 ? "2~12" : "1~6"}
                  style={{ flex: 1, padding: "14px", borderRadius: 10, border: "1px solid #27272a", background: "#18181b", color: "#fafafa", fontSize: 20, fontWeight: 800, textAlign: "center", outline: "none" }}
                />
                <button onClick={confirmDice} disabled={!diceInput || parseInt(diceInput) < (charityTurns > 0 ? 2 : 1) || parseInt(diceInput) > (charityTurns > 0 ? 12 : 6)} style={{
                  padding: "14px 24px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: diceInput && parseInt(diceInput) >= 1 ? "linear-gradient(135deg, #3b82f6, #8b5cf6)" : "#27272a",
                  color: "#fff", fontSize: 14, fontWeight: 800,
                  opacity: diceInput && parseInt(diceInput) >= 1 ? 1 : 0.4,
                }}>이동</button>
              </div>
              {/* 미니맵 미리보기 */}
              {diceInput && parseInt(diceInput) >= 1 && (() => {
                const previewPos = ((boardPos + parseInt(diceInput) - 1) % 24) + 1;
                const previewCell = BOARD[previewPos - 1];
                const cc = CELL_COLORS[previewCell.type];
                return (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: cc.bg, border: `1px solid ${cc.border}40` }}>
                    <span style={{ fontSize: 12, color: cc.text }}>→ 칸 {previewPos} {previewCell.icon} {previewCell.label}</span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 주사위 확정 후 — 도착 칸 표시 + 카드 입력 */}
          {diceConfirmed && (() => {
            const landedCell = BOARD[boardPos - 1];
            const cc = CELL_COLORS[landedCell.type];
            return (
            <div>
              {/* 도착 칸 표시 */}
              <div style={{ padding: "10px 14px", borderRadius: 10, background: cc.bg, border: `1px solid ${cc.border}`, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: cc.text }}>{landedCell.icon} 칸 {boardPos} — {landedCell.label}</span>
                  <span style={{ fontSize: 11, color: "#71717a" }}>🎲 {diceInput}</span>
                </div>
                {passedPaydays > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#86efac" }}>
                    💰 페이데이 {passedPaydays}번 통과 → +${((jobData?.cashflow || 0) + totalCF - loanInterest) * passedPaydays > 0 ? ((jobData?.cashflow || 0) + totalCF - loanInterest) * passedPaydays : 0} 현금 추가
                  </div>
                )}
              </div>

              {/* 특수 칸: 즉시 기록 (PAYDAY/BABY/DOWNSIZED) */}
              {["PAYDAY", "BABY", "DOWNSIZED"].includes(cellType) && (
                <div style={{ marginBottom: 12 }}>
                  {cellType === "PAYDAY" && <p style={{ fontSize: 12, color: "#86efac", margin: "0 0 8px" }}>💰 월급날! 현금흐름이 현금에 추가됩니다.</p>}
                  {cellType === "BABY" && babies >= 3 && (
                    <p style={{ fontSize: 12, color: "#a1a1aa", margin: "0 0 8px" }}>
                      👶 베이비 칸이지만 자녀가 이미 3명입니다. 더 이상의 출산은 불가능하며, 이 턴은 기록만 남습니다.
                    </p>
                  )}
                  {cellType === "BABY" && babies < 3 && (
                    <p style={{ fontSize: 12, color: "#f9a8d4", margin: "0 0 8px" }}>
                      👶 아기 탄생! 양육비 ${fmtNum(jobData?.childCost)}/월이 총지출에 추가됩니다. (현재 자녀 {babies}명 → {babies + 1}명)
                    </p>
                  )}
                  {cellType === "DOWNSIZED" && <p style={{ fontSize: 12, color: "#fca5a5", margin: "0 0 8px" }}>⬇️ 다운사이즈! 이번 턴에 총지출 ${fmtNum(totalExpense)}을 지불하고, 이후 2턴은 휴식합니다.</p>}
                </div>
              )}

              {/* 기부 칸: 한다/안한다 선택 */}
              {cellType === "CHARITY" && (() => {
                const totalIncome = (jobData?.salary || 0) + totalCF;
                const charityAmount = Math.round(totalIncome * 0.1);
                return (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: "#d8b4fe", margin: "0 0 8px" }}>🤝 기부 칸! 총수입의 10%를 기부하면 다음 3턴간 주사위 2개를 사용할 수 있습니다.</p>
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: "#581c8720", border: "1px solid #a855f730", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#d8b4fe" }}>
                      <span>총수입 (월급 ${fmtNum(jobData?.salary)} + 패시브 ${fmtNum(totalCF)})</span>
                      <span>${fmtNum(totalIncome)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "#d8b4fe", marginTop: 4 }}>
                      <span>기부금 (10%)</span>
                      <span>${fmtNum(charityAmount)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setAction("charity_yes")} style={{
                      flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: action === "charity_yes" ? "2px solid #a855f7" : "1px solid #27272a",
                      background: action === "charity_yes" ? "#a855f720" : "#18181b",
                      color: action === "charity_yes" ? "#d8b4fe" : "#71717a",
                    }}>기부한다 (-${fmtNum(charityAmount)})</button>
                    <button onClick={() => setAction("charity_no")} style={{
                      flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: action === "charity_no" ? "2px solid #52525b" : "1px solid #27272a",
                      background: action === "charity_no" ? "#27272a20" : "#18181b",
                      color: action === "charity_no" ? "#a1a1aa" : "#71717a",
                    }}>안한다</button>
                  </div>
                  {action === "charity_yes" && cash < charityAmount && (
                    <div style={{ padding: "6px 10px", borderRadius: 6, background: "#ef444415", marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: "#fca5a5" }}>⚠️ 현금 부족 (보유 ${fmtNum(cash)} / 필요 ${fmtNum(charityAmount)})</span>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* 기회칸: 딜 타입 선택 */}
              {cellType === "OPPORTUNITY" && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 4 }}>딜 타입</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ k: "deal1", c: "#10b981" }, { k: "deal2", c: "#3b82f6" }].map(d => (
                      <button key={d.k} onClick={() => { setDealType(d.k); setSelectedCard(null); setCardCategory(null); setCardSubtype(null); }} style={{
                        flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: dealType === d.k ? `1.5px solid ${d.c}` : "1px solid #27272a",
                        background: dealType === d.k ? d.c + "20" : "#18181b",
                        color: dealType === d.k ? d.c : "#71717a",
                      }}>{d.k === "deal1" ? deck.deal1Name : deck.deal2Name}</button>
                    ))}
                  </div>
                </div>
              )}

          {/* 카드 선택 — OPPORTUNITY는 드릴다운 3단계 */}
          {cellType === "OPPORTUNITY" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 6 }}>카드 선택</label>

              {/* Step 1: 카테고리 */}
              {!cardCategory && (
                <div>
                  <div style={{ fontSize: 10, color: "#52525b", marginBottom: 6 }}>1단계 · 어떤 종류의 카드인가요?</div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cardCategoriesWithCounts.length, 4)}, 1fr)`, gap: 6 }}>
                    {cardCategoriesWithCounts.map(({ key, count }) => {
                      const emoji = key === "주식" ? "📈" : key === "부동산" ? "🏠" : key === "사업" ? "💼" : "❓";
                      const color = key === "주식" ? "#10b981" : key === "부동산" ? "#3b82f6" : key === "사업" ? "#f59e0b" : "#71717a";
                      return (
                        <button key={key} onClick={() => { setCardCategory(key); setCardSubtype(null); setSelectedCard(null); }} style={{
                          padding: "14px 8px", borderRadius: 10, border: "1px solid " + color + "40",
                          background: color + "10", color: color, cursor: "pointer",
                          fontSize: 13, fontWeight: 700, textAlign: "center",
                        }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
                          {key}
                          <div style={{ fontSize: 10, color: "#71717a", marginTop: 2, fontWeight: 500 }}>({count}장)</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 2: 서브타입 */}
              {cardCategory && !cardSubtype && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <button onClick={() => { setCardCategory(null); setCardSubtype(null); setSelectedCard(null); }} style={{
                      padding: "3px 8px", borderRadius: 4, border: "1px solid #27272a",
                      background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10,
                    }}>← 뒤로</button>
                    <span style={{ fontSize: 10, color: "#52525b" }}>2단계 · {cardCategory} 중 어떤 것?</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                    {cardSubtypesWithCounts.map(({ key, count }) => (
                      <button key={key} onClick={() => { setCardSubtype(key); setSelectedCard(null); }} style={{
                        padding: "10px", borderRadius: 8, border: "1px solid #27272a",
                        background: "#18181b", color: "#e4e4e7", cursor: "pointer",
                        fontSize: 12, fontWeight: 600, textAlign: "left",
                      }}>
                        {key} <span style={{ fontSize: 10, color: "#71717a", fontWeight: 500 }}>({count}장)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: 실제 카드 선택 */}
              {cardCategory && cardSubtype && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    <button onClick={() => { setCardSubtype(null); setSelectedCard(null); }} style={{
                      padding: "3px 8px", borderRadius: 4, border: "1px solid #27272a",
                      background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10,
                    }}>← 뒤로</button>
                    <span style={{ fontSize: 10, color: "#52525b" }}>3단계 ·</span>
                    <span style={{ fontSize: 11, color: "#e4e4e7", fontWeight: 600 }}>{cardCategory} / {cardSubtype}</span>
                    <span style={{ fontSize: 10, color: "#71717a" }}>({filteredCards.length}장)</span>
                  </div>
                  <select
                    value={selectedCard ? cardList.indexOf(selectedCard) : ""}
                    onChange={e => { const idx = parseInt(e.target.value); const c = idx >= 0 ? cardList[idx] : null; setSelectedCard(c); setShares(""); setCardSelectedAt(idx >= 0 ? Date.now() : null); setSellPriceInput(c ? parseNum(c.price) : 0); setAction(c && isSplitCard(c) ? "split" : null); }}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 13, outline: "none", appearance: "auto" }}
                  >
                    <option value="">카드를 선택하세요</option>
                    {filteredCards.map((c) => {
                      const origIdx = cardList.indexOf(c);
                      return (
                        <option key={origIdx} value={origIdx}>
                          {buildCardOptionLabel(c, 35)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* MARKET 카드 — 드릴다운 3단계 */}
          {cellType === "MARKET" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 6 }}>카드 선택</label>

              {/* Step 1: 카테고리 */}
              {!marketCategory && (
                <div>
                  <div style={{ fontSize: 10, color: "#52525b", marginBottom: 6 }}>1단계 · 어떤 카드인가요?</div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(marketCategoriesWithCounts.length, 3)}, 1fr)`, gap: 6 }}>
                    {marketCategoriesWithCounts.map(({ key, count }) => {
                      const emoji = key === "부동산" ? "🏠" : key === "사업" ? "💼" : "⚠️";
                      const color = key === "부동산" ? "#3b82f6" : key === "사업" ? "#f59e0b" : "#ef4444";
                      const label = key === "이벤트" ? "이벤트/특수" : `${key} 제안`;
                      return (
                        <button key={key} onClick={() => { setMarketCategory(key); setMarketSubtype(null); setSelectedCard(null); }} style={{
                          padding: "14px 8px", borderRadius: 10, border: "1px solid " + color + "40",
                          background: color + "10", color: color, cursor: "pointer",
                          fontSize: 13, fontWeight: 700, textAlign: "center",
                        }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
                          {label}
                          <div style={{ fontSize: 10, color: "#71717a", marginTop: 2, fontWeight: 500 }}>({count}장)</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 2: 서브타입 */}
              {marketCategory && !marketSubtype && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <button onClick={() => { setMarketCategory(null); setMarketSubtype(null); setSelectedCard(null); }} style={{
                      padding: "3px 8px", borderRadius: 4, border: "1px solid #27272a",
                      background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10,
                    }}>← 뒤로</button>
                    <span style={{ fontSize: 10, color: "#52525b" }}>2단계 · {marketCategory} 종류</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                    {marketSubtypesWithCounts.map(({ key, count }) => (
                      <button key={key} onClick={() => { setMarketSubtype(key); setSelectedCard(null); }} style={{
                        padding: "10px", borderRadius: 8, border: "1px solid #27272a",
                        background: "#18181b", color: "#e4e4e7", cursor: "pointer",
                        fontSize: 12, fontWeight: 600, textAlign: "left",
                      }}>
                        {key} <span style={{ fontSize: 10, color: "#71717a", fontWeight: 500 }}>({count}장)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: 카드 선택 */}
              {marketCategory && marketSubtype && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    <button onClick={() => { setMarketSubtype(null); setSelectedCard(null); }} style={{
                      padding: "3px 8px", borderRadius: 4, border: "1px solid #27272a",
                      background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10,
                    }}>← 뒤로</button>
                    <span style={{ fontSize: 10, color: "#52525b" }}>3단계 ·</span>
                    <span style={{ fontSize: 11, color: "#e4e4e7", fontWeight: 600 }}>{marketCategory} / {marketSubtype}</span>
                    <span style={{ fontSize: 10, color: "#71717a" }}>({filteredMarketCards.length}장)</span>
                  </div>
                  <select
                    value={selectedCard ? cardList.indexOf(selectedCard) : ""}
                    onChange={e => { const idx = parseInt(e.target.value); const c = idx >= 0 ? cardList[idx] : null; setSelectedCard(c); setShares(""); setCardSelectedAt(idx >= 0 ? Date.now() : null); setSellPriceInput(c ? parseNum(c.price) : 0); setAction(c && isSplitCard(c) ? "split" : null); }}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 13, outline: "none", appearance: "auto" }}
                  >
                    <option value="">카드를 선택하세요</option>
                    {filteredMarketCards.map((c) => {
                      const origIdx = cardList.indexOf(c);
                      return (
                        <option key={origIdx} value={origIdx}>
                          {buildCardOptionLabel(c, 40)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* DOODAD 카드 — 기존 드롭다운 유지 (43장, 단순 구조) */}
          {cellType === "DOODAD" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 4 }}>카드 선택</label>
              <select
                value={selectedCard ? cardList.indexOf(selectedCard) : ""}
                onChange={e => { const idx = parseInt(e.target.value); const c = idx >= 0 ? cardList[idx] : null; setSelectedCard(c); setShares(""); setCardSelectedAt(idx >= 0 ? Date.now() : null); setSellPriceInput(c ? parseNum(c.price) : 0); setAction(c && isSplitCard(c) ? "split" : null); }}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 13, outline: "none", appearance: "auto" }}
              >
                <option value="">카드를 선택하세요</option>
                {cardList.map((c, i) => (
                  <option key={i} value={i}>
                    {buildCardOptionLabel(c, 40)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 카드 미리보기 */}
          {selectedCard && (() => {
            const isChildDoodad = cellType === "DOODAD" && RE_CHILD_DOODAD.test(selectedCard.desc || "");
            const doodadAmt = parseNum(selectedCard.amount);
            const actualDoodadCost = isChildDoodad ? doodadAmt * babies : doodadAmt;
            const cardDown = extractDown(selectedCard);
            const cardPrice = parseNum(selectedCard.price);
            const cardLoan = (cardPrice > 0 && cardDown > 0) ? cardPrice - cardDown : 0;
            const cardCF = parseNumNeg(selectedCard.cf);
            const isOppCard = cellType === "OPPORTUNITY";
            const isStockCard = isStock(selectedCard);
            return (
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#1a1a2e", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd", marginBottom: 6 }}>{selectedCard.sub || selectedCard.desc?.substring(0, 30)}</div>
              <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 8px", lineHeight: 1.5 }}>{selectedCard.desc}</p>

              {/* 재무 정보 테이블 — 기회카드(부동산/사업) */}
              {isOppCard && !isStockCard && (cardPrice > 0 || cardDown > 0 || cardCF !== 0) && (
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #27272a" }}>
                  {[
                    cardPrice > 0 && { label: "💰 총 가격", value: `$${fmtNum(cardPrice)}`, color: "#fafafa", bg: "#ffffff08" },
                    cardLoan > 0 && { label: "🏦 은행 대출", value: `$${fmtNum(cardLoan)}`, color: "#fca5a5", bg: "#ef444408" },
                    cardDown > 0 && { label: "💵 착수금", value: `$${fmtNum(cardDown)}`, color: "#fde68a", bg: "#f59e0b08" },
                    cardCF !== 0 && { label: "📊 월 현금흐름", value: `${cardCF >= 0 ? "+" : ""}$${fmtNum(cardCF)}`, color: cardCF >= 0 ? "#86efac" : "#fca5a5", bg: cardCF >= 0 ? "#22c55e08" : "#ef444408" },
                    selectedCard.roi && { label: "📈 ROI", value: selectedCard.roi, color: "#93c5fd", bg: "#3b82f608" },
                  ].filter(Boolean).map((row, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: row.bg, borderBottom: "1px solid #27272a20" }}>
                      <span style={{ fontSize: 11, color: "#71717a" }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 재무 정보 — 주식 카드 */}
              {isOppCard && isStockCard && cardPrice > 0 && (
                <div style={{ padding: "6px 10px", borderRadius: 8, background: "#10b98110", border: "1px solid #10b98130" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#71717a" }}>주당 가격</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#86efac" }}>{selectedCard.price}</span>
                  </div>
                </div>
              )}

              {/* 재무 정보 — MARKET 카드 */}
              {cellType === "MARKET" && (selectedCard.sell || selectedCard.special) && (
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {selectedCard.sell && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f59e0b15", color: "#fde68a" }}>매각가: {selectedCard.sell}</span>}
                  {selectedCard.special && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#ef444415", color: "#fca5a5" }}>{selectedCard.special}</span>}
                </div>
              )}

              {/* 재무 정보 — DOODAD 카드 */}
              {cellType === "DOODAD" && selectedCard.amount && (
                <div style={{ padding: "6px 10px", borderRadius: 8, background: "#f59e0b08", border: "1px solid #f59e0b20", marginTop: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#71717a" }}>지출</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>{selectedCard.amount}</span>
                  </div>
                </div>
              )}

              {/* DOODAD 자녀 조건부 */}
              {isChildDoodad && (
                <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: babies > 0 ? "#ec489920" : "#22c55e15", border: `1px solid ${babies > 0 ? "#ec489930" : "#22c55e30"}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: babies > 0 ? "#f9a8d4" : "#86efac" }}>
                    👶 자녀 {babies}명 × ${fmtNum(doodadAmt)} = ${fmtNum(actualDoodadCost)} {babies === 0 && "(자녀 없음 — 지출 없음)"}
                  </span>
                </div>
              )}
            </div>
            );
          })()}

          {/* 주식 수량 입력 (무상증자/감자 카드는 자동 적용이므로 입력칸 숨김) */}
          {selectedCard && isStock(selectedCard) && cellType === "OPPORTUNITY" && !isSplitCard(selectedCard) && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 4 }}>주식 수량 (주)</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" min={1} max={1000} value={shares}
                  onChange={e => { const v = e.target.value; setShares(v === "" ? "" : Math.max(1, Math.min(1000, parseInt(v) || 0))); }}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #27272a", background: "#18181b", color: "#fafafa", fontSize: 16, fontWeight: 800, textAlign: "center", boxSizing: "border-box", outline: "none" }}
                />
                {action === "sell" && (() => {
                  const owned = getOwnedShares(selectedCard);
                  return owned > 0 ? (
                    <button onClick={() => setShares(owned)} style={{
                      padding: "10px 14px", borderRadius: 10, border: "1px solid #f59e0b40", cursor: "pointer",
                      background: "#f59e0b15", color: "#fde68a", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
                    }}>전부 ({owned})</button>
                  ) : null;
                })()}
              </div>
              <div style={{ fontSize: 10, color: "#71717a", marginTop: 4, textAlign: "center" }}>
                {action === "sell" ? `보유 ${fmtNum(getOwnedShares(selectedCard))}주` : "최대 1,000주"}
              </div>
              {selectedCard.price && action !== "sell" && (
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 4, textAlign: "center" }}>
                  {shares || 0}주 × {selectedCard.price} = ${fmtNum((parseInt(shares) || 0) * parseNum(selectedCard.price))}
                </div>
              )}
            </div>
          )}

          {/* 주식 매각가격 입력 (기회칸에서 매각 선택 시) */}
          {cellType === "OPPORTUNITY" && selectedCard && isStock(selectedCard) && action === "sell" && (() => {
            const stockName = (selectedCard.sub || "").trim();
            const ownedShares = stockAssets.filter(a => a.name.includes(stockName)).reduce((s, a) => s + (a.shares || 0), 0);
            const sellValid = ownedShares >= (parseInt(shares) || 0) && ownedShares > 0;
            return (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#71717a", display: "block", marginBottom: 4 }}>매각 단가 ($)</label>
              <input type="number" min={1} value={sellPriceInput}
                onChange={e => setSellPriceInput(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #f59e0b40", background: "#18181b", color: "#fde68a", fontSize: 16, fontWeight: 800, textAlign: "center", boxSizing: "border-box", outline: "none" }}
              />
              <div style={{ fontSize: 11, color: "#71717a", marginTop: 4, textAlign: "center" }}>
                {shares || 0}주 × ${sellPriceInput} = <span style={{ color: "#fde68a", fontWeight: 700 }}>${fmtNum((parseInt(shares) || 0) * sellPriceInput)}</span>
              </div>
              <div style={{ padding: "6px 10px", borderRadius: 6, background: sellValid ? "#22c55e10" : "#ef444415", marginTop: 6, border: `1px solid ${sellValid ? "#22c55e30" : "#ef444430"}` }}>
                <span style={{ fontSize: 10, color: sellValid ? "#86efac" : "#fca5a5", fontWeight: 600 }}>
                  {ownedShares > 0 ? `보유 ${ownedShares}주 / 매각 ${parseInt(shares) || 0}주 → ${sellValid ? "매각 가능" : `${(parseInt(shares) || 0) - ownedShares}주 부족`}` : "⚠️ 보유 중인 주식이 없습니다"}
                </span>
              </div>
            </div>
            );
          })()}

          {/* 액션 버튼 — 무상증자/감자는 자동 적용, 주식이면 구매/매각/패스, 아니면 구매/권리판매/패스 */}
          {cellType === "OPPORTUNITY" && selectedCard && !isSplitCard(selectedCard) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {(isStock(selectedCard) && getOwnedShares(selectedCard) > 0
                  ? [{ k: "buy", label: "구매", c: "#22c55e" }, { k: "sell", label: "매각", c: "#f59e0b" }, { k: "pass", label: "패스", c: "#ef4444" }]
                  : isStock(selectedCard)
                  ? [{ k: "buy", label: "구매", c: "#22c55e" }, { k: "pass", label: "패스", c: "#ef4444" }]
                  : [{ k: "buy", label: "구매", c: "#22c55e" }, { k: "rights", label: "권리판매", c: "#8b5cf6" }, { k: "pass", label: "패스", c: "#ef4444" }]
                ).map(a => (
                  <button key={a.k} onClick={() => {
                    setAction(a.k);
                    if (a.k === "rights" && selectedCard) {
                      const down = isStock(selectedCard) ? parseNum(selectedCard.price) * shares : extractDown(selectedCard);
                      setRightsPrice(Math.round(down * 0.1));
                    }
                  }} style={{
                    flex: 1, minWidth: 60, padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    border: action === a.k ? `2px solid ${a.c}` : "1px solid #27272a",
                    background: action === a.k ? a.c + "20" : "#18181b",
                    color: action === a.k ? a.c : "#71717a",
                  }}>{a.label}</button>
                ))}
              </div>

              {/* 권리금 입력 */}
              {action === "rights" && (() => {
                const down = isStock(selectedCard) ? parseNum(selectedCard.price) * shares : extractDown(selectedCard);
                const guideline = Math.round(down * 0.1);
                return (
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "#8b5cf610", border: "1px solid #8b5cf630", marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: "#c4b5fd", display: "block", marginBottom: 4 }}>권리금 ($)</label>
                  <input type="number" min={0} value={rightsPrice}
                    onChange={e => setRightsPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #8b5cf640", background: "#18181b", color: "#c4b5fd", fontSize: 16, fontWeight: 800, textAlign: "center", boxSizing: "border-box", outline: "none" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "#71717a" }}>가이드라인: 착수금 ${fmtNum(down)} × 10% = <span style={{ color: "#c4b5fd", fontWeight: 700 }}>${fmtNum(guideline)}</span></span>
                    {rightsPrice !== guideline && (
                      <button onClick={() => setRightsPrice(guideline)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #8b5cf630", background: "#8b5cf610", color: "#c4b5fd", fontSize: 9, cursor: "pointer" }}>기본값</button>
                    )}
                  </div>
                  <p style={{ fontSize: 10, color: "#71717a", margin: "4px 0 0", textAlign: "center" }}>
                    다른 플레이어에게 이 카드의 구매 권리를 ${fmtNum(rightsPrice)}에 판매합니다
                  </p>
                </div>
                );
              })()}
              {/* 현금 체크 + 대출 시스템 */}
              {action === "buy" && buyCost > 0 && (
                <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${cashCheck.enough ? "#22c55e30" : "#f59e0b30"}` }}>
                  <div style={{ padding: "8px 12px", background: cashCheck.enough ? "#22c55e10" : "#f59e0b10" }}>
                    <p style={{ fontSize: 11, color: cashCheck.enough ? "#86efac" : "#fde68a", margin: 0, fontWeight: 600 }}>
                      {cashCheck.enough ? "✓" : "💰"} {cashCheck.message}
                    </p>
                  </div>
                  {!cashCheck.enough && (
                    <BankLoanUI
                      shortage={buyCost - cash}
                      bankLoan={bankLoan}
                      monthlyCF={jobData ? jobData.cashflow + totalCF - childTotal : 0}
                      currentInterest={loanInterest}
                      onLoan={(amount) => {
                        const loanEntry = createExtraLoanTurn({
                          turn: currentTurn,
                          loanAction: "borrow",
                          loanAmount: amount,
                          time: timerOn ? elapsed : null,
                        });
                        loanEntry.transaction = `은행 대출 +$${fmtNum(amount)} (이자 월 +$${fmtNum(Math.round(amount * 0.1))})`;
                        setTurnLog(prev => [...prev, loanEntry]);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 무상증자/감자 — 자동 적용 안내 */}
          {cellType === "OPPORTUNITY" && selectedCard && isSplitCard(selectedCard) && (() => {
            const mult = getSplitMultiplier(selectedCard);
            const stockName = (selectedCard.sub || "").trim();
            const owned = stockAssets.filter(a => a.name.includes(stockName)).reduce((s, a) => s + (a.shares || 0), 0);
            const after = Math.floor(owned * mult);
            const isSplit = mult >= 1;
            return (
              <div style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 12, background: isSplit ? "#22c55e10" : "#ef444410", border: `1px solid ${isSplit ? "#22c55e30" : "#ef444430"}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isSplit ? "#86efac" : "#fca5a5", marginBottom: 4 }}>
                  {isSplit ? "📈" : "📉"} {selectedCard.special || (isSplit ? "무상증자" : "감자")} — 자동 적용
                </div>
                {owned > 0 ? (
                  <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                    보유 {stockName} {fmtNum(owned)}주 → <span style={{ fontWeight: 700, color: isSplit ? "#86efac" : "#fca5a5" }}>{fmtNum(after)}주</span> (×{mult})
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#71717a" }}>
                    {stockName} 미보유 → 해당 없음 (자동 패스)
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#52525b", marginTop: 4 }}>턴 기록 버튼을 누르면 자동으로 적용됩니다</div>
              </div>
            );
          })()}

          {cellType === "MARKET" && selectedCard && (() => {
            const cardText = (selectedCard.desc || "") + (selectedCard.special || "");
            const isDamageCard = RE_DAMAGE.test(cardText);
            const isPlumbing = RE_PLUMBING.test(cardText);
            const isRateDrop = /이자율 하락/.test(cardText);

            // 손상 카드 전용 단가 및 총 피해액 미리보기
            const perUnitMatch = (selectedCard.special || selectedCard.desc || "").match(/\$?([0-9,]+)/);
            const perUnit = perUnitMatch ? parseInt(perUnitMatch[1].replace(/,/g, "")) || 0 : 0;
            const realEstateAssets_ = assets.filter(a => a.type === "부동산");
            const totalUnits = realEstateAssets_.reduce((sum, a) => sum + getAssetUnits(a), 0);
            const damageTotal = perUnit * totalUnits;

            // 배관 카드: 다가구 주택 보유 여부
            const multiFamilyAssets = assets.filter(a =>
              a.type === "부동산" && /가구|다가구/.test(a.name)
            );
            const hasMultiFamily = multiFamilyAssets.length > 0;

            // 이자율 하락 카드: 3/2 주택 보유 여부 + 차익 계산
            const threeByTwoAssets = assets.filter(a =>
              a.type === "부동산" && /주택/.test(a.name) && !/가구|다가구|아파트/.test(a.name)
            );
            const has32House = threeByTwoAssets.length > 0;

            let actions;
            if (isPlumbing) {
              actions = hasMultiFamily
                ? [{ k: "damage", label: `배관 수리 지불 (-$${fmtNum(perUnit)})`, c: "#ef4444" }]
                : [{ k: "na", label: "다가구 주택 미보유 — 해당없음", c: "#52525b" }];
            } else if (isDamageCard) {
              actions = [{ k: "damage", label: totalUnits > 0 ? `손상 지불 ($${fmtNum(damageTotal)})` : "해당 자산 없음 — 건너뛰기", c: "#ef4444" }];
            } else {
              // 🆕 MARKET 판매 카드: 카드의 sell 필드에서 고정 매각가 추출
              let cardSellPrice = 0;
              if (selectedCard.sell) {
                cardSellPrice = parseNum(selectedCard.sell);
              } else {
                const priceMatch = (selectedCard.desc || "").match(/\$([0-9]{1,3}(?:,[0-9]{3})*)/);
                if (priceMatch) cardSellPrice = parseInt(priceMatch[1].replace(/,/g, "")) || 0;
              }
              const sellBtnLabel = cardSellPrice > 0
                ? `판매 ($${fmtNum(cardSellPrice)})`
                : "판매";
              actions = [
                { k: "sell", label: sellBtnLabel, c: "#f59e0b" },
                { k: "hold", label: "홀딩", c: "#3b82f6" },
                { k: "na", label: "해당없음", c: "#52525b" }
              ];
            }

            return (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {actions.map(a => (
                    <button key={a.k} onClick={() => setAction(a.k)} style={{
                      flex: 1, padding: "10px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      border: action === a.k ? `2px solid ${a.c}` : "1px solid #27272a",
                      background: action === a.k ? a.c + "20" : "#18181b",
                      color: action === a.k ? (a.k === "na" ? "#a1a1aa" : a.c) : "#71717a",
                    }}>{a.label}</button>
                  ))}
                </div>

                {/* 🆕 판매 선택 시 고정 매각가 + 순익 미리보기 */}
                {action === "sell" && !isDamageCard && !isPlumbing && (() => {
                  // 매각 대상 자산 찾기
                  const descForSell = (selectedCard.desc || "") + (selectedCard.sell || "") + (selectedCard.special || "");
                  let sellAsset = null;
                  for (const rule of SELL_RULES) {
                    if (rule.descRe.test(descForSell)) {
                      sellAsset = findLastSafe(assets, a => a.type !== "주식" && rule.assetRe.test(a.name));
                      if (sellAsset) break;
                    }
                  }
                  if (!sellAsset) sellAsset = findLastSafe(assets, a => a.type !== "주식");

                  // 🆕 이자율 하락 카드: 차익 = 주택가격 + $50K - 대출
                  let cardSellPrice = 0;
                  let netProceeds = 0;
                  let formulaText = "";
                  if (isRateDrop && sellAsset) {
                    const assetPrice = parseNum(sellAsset.price || sellAsset.cost || 0);
                    const assetLoanForCalc = sellAsset.loan || 0;
                    netProceeds = assetPrice + 50000 - assetLoanForCalc;
                    cardSellPrice = netProceeds; // 표시용
                    formulaText = `$${fmtNum(assetPrice)} + $50,000 − $${fmtNum(assetLoanForCalc)} = $${fmtNum(netProceeds)}`;
                  } else {
                    // 일반 카드: sell 필드 or desc에서 금액 추출
                    if (selectedCard.sell) {
                      cardSellPrice = parseNum(selectedCard.sell);
                    } else {
                      const priceMatch = (selectedCard.desc || "").match(/\$([0-9]{1,3}(?:,[0-9]{3})*)/);
                      if (priceMatch) cardSellPrice = parseInt(priceMatch[1].replace(/,/g, "")) || 0;
                    }
                    const assetLoan_ = sellAsset?.loan || 0;
                    netProceeds = Math.max(0, cardSellPrice - assetLoan_);
                  }

                  const assetLoan = sellAsset?.loan || 0;

                  return (
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "#f59e0b10", border: "1px solid #f59e0b30", marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#fde68a", marginBottom: 6 }}>
                        📋 카드의 정해진 매각 조건
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 11 }}>
                        <span style={{ color: "#a1a1aa" }}>매각 대상:</span>
                        <span style={{ color: "#fafafa", fontWeight: 600 }}>
                          {sellAsset ? `${sellAsset.name} (${sellAsset.type})` : "⚠️ 보유 자산 없음"}
                        </span>
                        {isRateDrop ? (
                          <>
                            <span style={{ color: "#a1a1aa" }}>계산식:</span>
                            <span style={{ color: "#93c5fd", fontSize: 10 }}>
                              주택가격 + $50,000 − 대출
                            </span>
                            {sellAsset && (
                              <>
                                <span style={{ color: "#a1a1aa" }}>대입:</span>
                                <span style={{ color: "#93c5fd", fontSize: 10 }}>{formulaText}</span>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <span style={{ color: "#a1a1aa" }}>매각가:</span>
                            <span style={{ color: "#fde68a", fontWeight: 800 }}>${fmtNum(cardSellPrice)}</span>
                            {sellAsset && assetLoan > 0 && (
                              <>
                                <span style={{ color: "#a1a1aa" }}>기존 대출 상환:</span>
                                <span style={{ color: "#fca5a5", fontWeight: 700 }}>-${fmtNum(assetLoan)}</span>
                              </>
                            )}
                          </>
                        )}
                        {sellAsset && (
                          <>
                            <span style={{ color: "#a1a1aa", borderTop: "1px solid #27272a", paddingTop: 4 }}>수령 순익:</span>
                            <span style={{ color: "#86efac", fontWeight: 800, fontSize: 14, borderTop: "1px solid #27272a", paddingTop: 4 }}>+${fmtNum(netProceeds)}</span>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: "#71717a", marginTop: 6, fontStyle: "italic" }}>
                        ℹ️ 매각가는 카드에 정해진 금액으로 자동 적용됩니다 (수정 불가)
                      </div>
                    </div>
                  );
                })()}

                {/* 배관 카드 전용 안내 */}
                {isPlumbing && (
                  <div style={{
                    padding: "8px 12px", borderRadius: 8,
                    background: hasMultiFamily ? "#7f1d1d15" : "#27272a50",
                    border: `1px solid ${hasMultiFamily ? "#ef444430" : "#3f3f46"}`,
                    marginBottom: 12,
                  }}>
                    {hasMultiFamily ? (
                      <>
                        <p style={{ fontSize: 11, color: "#fca5a5", margin: 0, fontWeight: 600 }}>
                          🔧 다가구 주택 보유 중 → 배관 수리비 <span style={{ color: "#ef4444", fontWeight: 800 }}>-${fmtNum(perUnit)}</span> 지불
                        </p>
                        <p style={{ fontSize: 9, color: "#71717a", margin: "4px 0 0" }}>
                          {multiFamilyAssets.map(a => a.name).join(" · ")}
                        </p>
                      </>
                    ) : (
                      <p style={{ fontSize: 11, color: "#a1a1aa", margin: 0, fontWeight: 600 }}>
                        ℹ️ 다가구 주택 미보유 → 해당없음으로 턴 넘김
                      </p>
                    )}
                  </div>
                )}

                {/* 이자율 하락 카드 전용 안내 */}
                {isRateDrop && action === "sell" && (
                  <div style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: has32House ? "#16a34a15" : "#27272a50",
                    border: `1px solid ${has32House ? "#22c55e30" : "#3f3f46"}`,
                    marginBottom: 12,
                  }}>
                    {has32House ? (
                      <>
                        <p style={{ fontSize: 11, color: "#86efac", margin: 0, fontWeight: 700 }}>
                          📈 3/2 주택 보유 중 — 차익 계산식 안내
                        </p>
                        <p style={{ fontSize: 10, color: "#d4d4d8", margin: "6px 0 0", lineHeight: 1.6 }}>
                          차익 = (주택 가격 + <span style={{ color: "#fbbf24", fontWeight: 700 }}>$50,000</span> − 대출)
                        </p>
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #27272a" }}>
                          {threeByTwoAssets.map((a, i) => {
                            const price = parseNum(a.price || a.cost || 0);
                            const loan = parseNum(a.loan || 0);
                            const profit = price + 50000 - loan;
                            return (
                              <p key={i} style={{ fontSize: 10, color: "#a1a1aa", margin: "2px 0" }}>
                                {a.name}: (${fmtNum(price)} + $50,000 − ${fmtNum(loan)}) = <span style={{ color: "#22c55e", fontWeight: 700 }}>+${fmtNum(profit)}</span>
                              </p>
                            );
                          })}
                        </div>
                        <p style={{ fontSize: 9, color: "#52525b", margin: "6px 0 0" }}>
                          ℹ️ 차익은 위 공식으로 자동 계산되어 매각됩니다.
                        </p>
                      </>
                    ) : (
                      <p style={{ fontSize: 11, color: "#a1a1aa", margin: 0, fontWeight: 600 }}>
                        ℹ️ 3/2 주택 미보유 → 매각 대상 없음
                      </p>
                    )}
                  </div>
                )}

                {/* 기존 임차인 자산 손상 카드 안내 */}
                {isDamageCard && !isPlumbing && (
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "#7f1d1d15", border: "1px solid #ef444430", marginBottom: 12 }}>
                    <p style={{ fontSize: 11, color: "#fca5a5", margin: 0, fontWeight: 600 }}>
                      📋 보유 부동산 {realEstateAssets_.length}개 / 총 {totalUnits}채 × ${fmtNum(perUnit)} = <span style={{ color: "#ef4444", fontWeight: 800 }}>-${fmtNum(damageTotal)}</span>
                    </p>
                    {realEstateAssets_.length > 0 && (
                      <p style={{ fontSize: 9, color: "#71717a", margin: "4px 0 0" }}>
                        {realEstateAssets_.map(a => `${a.name}(${getAssetUnits(a)}채)`).join(" · ")}
                      </p>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {/* 판매 불가 경고 */}
          {cellType === "MARKET" && action === "sell" && !sellCheck.eligible && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ef444415", border: "1px solid #ef444430", marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: "#fca5a5", margin: 0, fontWeight: 600 }}>⚠️ {sellCheck.message}</p>
              <p style={{ fontSize: 10, color: "#71717a", margin: "4px 0 0" }}>해당 자산을 보유하고 있어야 판매할 수 있습니다. "해당없음"을 선택하세요.</p>
            </div>
          )}

          <button onClick={addTurn} disabled={
            !diceConfirmed ||
            (["OPPORTUNITY","MARKET","DOODAD"].includes(cellType) && !selectedCard) ||
            (cellType === "OPPORTUNITY" && !action) ||
            (cellType === "MARKET" && selectedCard && !action) ||
            (cellType === "CHARITY" && !action) ||
            (cellType === "CHARITY" && action === "charity_yes" && cash < Math.round(((jobData?.salary || 0) + totalCF) * 0.1)) ||
            (cellType === "MARKET" && action === "sell" && !sellCheck.eligible) ||
            (!cashCheck.enough) ||
            (cellType === "OPPORTUNITY" && action === "sell" && isStock(selectedCard) && (getOwnedShares(selectedCard) < (parseInt(shares) || 0) || getOwnedShares(selectedCard) === 0))
          } style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", color: "#fff",
            fontSize: 14, fontWeight: 800,
            opacity: !diceConfirmed || (["OPPORTUNITY","MARKET","DOODAD"].includes(cellType) && !selectedCard) || (cellType === "MARKET" && action === "sell" && !sellCheck.eligible) || !cashCheck.enough || (cellType === "OPPORTUNITY" && action === "sell" && isStock(selectedCard) && (getOwnedShares(selectedCard) < (parseInt(shares) || 0) || getOwnedShares(selectedCard) === 0)) ? 0.4 : 1,
          }}>턴 {currentTurn} 기록 (칸 {boardPos})</button>
            </div>
            );
          })()}
        </div>
      )}

      {/* ═══ 자산 탭 ═══ */}
      {viewTab === "assets" && (
        <div style={{ marginBottom: 16 }}>
          {/* 자산 요약 카드 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "부동산", count: realEstateAssets.length, cf: reCF, color: "#3b82f6", icon: "🏠" },
              { label: "주식", count: totalStockShares + "주", cf: 0, color: "#10b981", icon: "📈" },
              { label: "사업", count: bizAssets.length, cf: bizCF, color: "#f59e0b", icon: "🏪" },
            ].map((c, i) => (
              <div key={i} style={{ padding: "12px 10px", borderRadius: 12, background: "#111118", border: "1px solid #27272a", textAlign: "center" }}>
                <div style={{ fontSize: 18 }}>{c.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: c.color }}>{c.count}</div>
                <div style={{ fontSize: 9, color: "#71717a" }}>{c.label}</div>
                {c.cf > 0 && <div style={{ fontSize: 10, color: "#86efac", marginTop: 2 }}>+${fmtNum(c.cf)}/월</div>}
              </div>
            ))}
          </div>

          {/* 📣 타인 카드 대응 — 자산 탭 상단 빠른 접근 */}
          <div style={{ padding: "10px 12px", borderRadius: 12, background: "#0a0a0f", border: "1px dashed #3f3f46", marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#a1a1aa", marginBottom: 6, fontWeight: 600 }}>📣 다른 플레이어 카드 대응 (내 턴 아닐 때도 즉시 반영)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              <button
                onClick={() => {
                  setDealerToolsOpen(true);
                  setExtraTool("split");
                  setTimeout(() => dealerToolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
                style={{ padding: "8px", borderRadius: 8, border: "1px solid #a78bfa40", background: "#a78bfa10", color: "#c4b5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >📈 증자/감자</button>
              <button
                onClick={() => {
                  setDealerToolsOpen(true);
                  setExtraTool("wipe");
                  setTimeout(() => dealerToolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
                style={{ padding: "8px", borderRadius: 8, border: "1px solid #ef444440", background: "#ef444410", color: "#fca5a5", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >📉 상장폐지</button>
              <button
                onClick={() => {
                  setDealerToolsOpen(true);
                  setExtraTool("buy");
                  setTimeout(() => dealerToolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
                style={{ padding: "8px", borderRadius: 8, border: "1px solid #8b5cf640", background: "#8b5cf610", color: "#c4b5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >💼 권리금 인수</button>
            </div>
          </div>

          {/* 부동산 */}
          {realEstateAssets.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 8 }}>🏠 부동산 ({realEstateAssets.length}개)</div>
              {realEstateAssets.map((a, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < realEstateAssets.length - 1 ? "1px solid #1e1e2e" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#a1a1aa" }}>T{a.turn} {a.name} {a.time != null && <span style={{ color: "#f59e0b" }}>⏱{fmtTime(a.time)}</span>}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: a.cf >= 0 ? "#86efac" : "#fca5a5" }}>{a.cf >= 0 ? "+" : ""}${a.cf}/월</span>
                  </div>
                  {a.loan > 0 && <div style={{ fontSize: 9, color: "#71717a" }}>대출 ${fmtNum(a.loan)}</div>}
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid #27272a" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fafafa" }}>소계</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: "#3b82f6" }}>+${fmtNum(reCF)}/월</span>
              </div>

              {/* 타인이 뽑은 마켓카드 — 부동산 매도 */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #27272a" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", marginBottom: 6 }}>📊 타인이 뽑은 마켓카드 (내 턴이 아닌 매도)</div>
                {(() => {
                  // 선택된 자산에 해당하는 MARKET 카드의 매도가 목록 추출
                  const asset = realEstateAssets[reSellIdx];
                  const assetName = (asset?.name || "");

                  // 자산 유형별 매칭 → MARKET 카드에서 해당 카드들의 sell 가격 추출
                  // 다가구/아파트는 "가구당/1채당" 단가 × 유닛수로 계산
                  const unitCount = asset ? getAssetUnits(asset) : 1;

                  let priceOptions = []; // { label, value, card }
                  if (/콘도/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /콘도/.test(c.desc || "") && c.sell && /^\$/.test(c.sell))
                      .map(c => ({ label: c.sell, value: parseNum(c.sell), card: c }));
                  } else if (/주택 3\/2|3\/2/.test(assetName) && !/가구|다가구|아파트/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /주택 3\/2를 \$/.test(c.desc || "") && c.sell)
                      .map(c => ({ label: c.sell, value: parseNum(c.sell), card: c }));
                  } else if (/가구|다가구/.test(assetName)) {
                    // 가구당 단가 × 유닛수
                    priceOptions = deck.market
                      .filter(c => /다가구 주택 가구당/.test(c.desc || "") && c.sell)
                      .map(c => {
                        const unitPrice = parseNum(c.sell);
                        const total = unitPrice * unitCount;
                        return { label: `가구당 $${fmtNum(unitPrice)} × ${unitCount}채 = $${fmtNum(total)}`, value: total, card: c };
                      });
                  } else if (/아파트/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /아파트 단지 1채당/.test(c.desc || "") && c.sell)
                      .map(c => {
                        const unitPrice = parseNum(c.sell);
                        const total = unitPrice * unitCount;
                        return { label: `1채당 $${fmtNum(unitPrice)} × ${unitCount}채 = $${fmtNum(total)}`, value: total, card: c };
                      });
                  } else if (/땅|12,000|24,000/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /땅을 \$/.test(c.desc || "") && c.sell)
                      .map(c => ({ label: c.sell, value: parseNum(c.sell), card: c }));
                  } else if (/세차/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /세차장/.test(c.desc || "") && c.sell)
                      .map(c => ({ label: c.sell, value: parseNum(c.sell), card: c }));
                  } else if (/쇼핑몰/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /쇼핑몰/.test(c.desc || "") && c.sell)
                      .map(c => ({ label: c.sell, value: parseNum(c.sell), card: c }));
                  } else if (/B&B|모텔/.test(assetName)) {
                    priceOptions = deck.market
                      .filter(c => /B&B/.test(c.desc || "") && c.sell)
                      .map(c => ({ label: c.sell, value: parseNum(c.sell), card: c }));
                  }

                  // 중복 제거 (같은 값이면 하나만 표시)
                  const seen = new Set();
                  priceOptions = priceOptions.filter(o => {
                    const key = `${o.label}:${o.value}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                  // 가격순 정렬 (오름차순)
                  priceOptions.sort((a, b) => a.value - b.value);

                  const sellPrice = parseInt(reSellPrice) || 0;
                  const assetLoan = asset?.loan || 0;
                  const netPreview = sellPrice > 0 ? Math.max(0, sellPrice - assetLoan) : 0;

                  return (
                    <>
                      {/* 자산 선택 */}
                      <select value={reSellIdx} onChange={e => { setReSellIdx(parseInt(e.target.value) || 0); setReSellPrice(""); }} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 11, outline: "none", marginBottom: 6 }}>
                        {realEstateAssets.map((a, i) => (
                          <option key={i} value={i}>{a.name} (대출 ${fmtNum((a.loan||0))})</option>
                        ))}
                      </select>

                      {/* 매도가 선택 (카드 고정 가격들 중) */}
                      {priceOptions.length > 0 ? (
                        <>
                          <div style={{ fontSize: 9, color: "#71717a", marginBottom: 4 }}>💰 마켓카드 매도 제안 중 선택:</div>
                          <select
                            value={reSellPrice || ""}
                            onChange={e => setReSellPrice(e.target.value)}
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #f59e0b40", background: "#18181b", color: "#fde68a", fontSize: 11, outline: "none", marginBottom: 6 }}
                          >
                            <option value="">-- 매도 가격 선택 --</option>
                            {priceOptions.map((o, i) => (
                              <option key={i} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: "#71717a", padding: "6px 8px", background: "#18181b", borderRadius: 6, marginBottom: 6, textAlign: "center" }}>
                          이 자산 유형에 맞는 마켓카드가 없습니다
                        </div>
                      )}

                      {/* 매도 미리보기 + 실행 버튼 */}
                      {sellPrice > 0 && asset && (
                        <div style={{ padding: "6px 8px", borderRadius: 6, background: "#f59e0b10", border: "1px solid #f59e0b30", fontSize: 10, color: "#fde68a", marginBottom: 6 }}>
                          매도 ${fmtNum(sellPrice)} − 대출 ${fmtNum(assetLoan)} = <strong style={{ color: "#86efac" }}>+${fmtNum(netPreview)}</strong>
                        </div>
                      )}

                      <button onClick={() => {
                        const idx = reSellIdx;
                        const sellPrice_ = parseInt(reSellPrice) || 0;
                        const asset_ = realEstateAssets[idx];
                        if (!asset_ || sellPrice_ <= 0) return;
                        const net = Math.max(0, sellPrice_ - (asset_.loan || 0));
                        const extSellEntry = {
                          turn: currentTurn, cellType: "EXT_SELL",
                          boardPos: 0, dice: 0, passedPaydays: 0,
                          dealType: "타인MARKET",
                          card: { sub: asset_.name, desc: `타인 마켓카드로 ${asset_.name} 매도` },
                          action: "sell", shares: null,
                          assetType: asset_.type || "부동산",
                          time: timerOn ? elapsed : null, decisionSec: null,
                          _schemaVersion: SCHEMA_VERSION,
                          _sellAssetId: asset_.id,
                          _sellPrice: sellPrice_,
                          _assetCF: asset_.cf,
                          _assetLoan: asset_.loan || 0,
                          transaction: `${asset_.name} 매도 $${fmtNum(sellPrice_)} - 대출 $${fmtNum((asset_.loan||0))} = +$${fmtNum(net)}`,
                        };
                        setTurnLog(prev => [...prev, extSellEntry]);
                        setReSellPrice(""); setReSellIdx(0);
                      }}
                      disabled={!sellPrice || !asset}
                      style={{
                        width: "100%", padding: "8px 12px", borderRadius: 6, border: "none",
                        background: (sellPrice && asset) ? "#f59e0b" : "#3f3f46",
                        color: (sellPrice && asset) ? "#000" : "#71717a",
                        fontSize: 11, fontWeight: 700, cursor: (sellPrice && asset) ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap"
                      }}>💰 매도 실행</button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 주식 */}
          {stockAssets.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>📈 주식 ({totalStockShares}주)</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => {
                      setDealerToolsOpen(true);
                      setExtraTool("split");
                      setTimeout(() => dealerToolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    }}
                    title="타인 카드의 무상증자/감자를 내 보유 주식에 적용"
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #a78bfa40", background: "#a78bfa10", color: "#c4b5fd", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >📈 증자/감자</button>
                  <button
                    onClick={() => {
                      setDealerToolsOpen(true);
                      setExtraTool("wipe");
                      setTimeout(() => dealerToolsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    }}
                    title="전 주식 상장폐지 ($0 처리)"
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#fca5a5", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                  >📉 상장폐지</button>
                </div>
              </div>
              {stockAssets.map((a, i) => {
                const buyPrice = parseNum(a.price);
                return (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < stockAssets.length - 1 ? "1px solid #1e1e2e" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 11, color: "#a1a1aa" }}>T{a.turn} {a.name}</span>
                      {a.time != null && <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4 }}>⏱{fmtTime(a.time)}</span>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#86efac" }}>{a.shares}주 @${buyPrice} (구매가)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9, color: "#71717a" }}>수량</span>
                      <input type="number" min={1} max={a.shares}
                        value={stockSellQty[i] ?? a.shares}
                        onChange={e => setStockSellQty(prev => ({ ...prev, [i]: e.target.value }))}
                        style={{ width: 50, padding: "4px 6px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#fafafa", fontSize: 11, textAlign: "center", outline: "none" }}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 9, color: "#71717a" }}>매각가$</span>
                      <select
                        value={stockSellPrice[i] ?? ""}
                        onChange={e => setStockSellPrice(prev => ({ ...prev, [i]: e.target.value }))}
                        style={{ width: 58, padding: "4px 2px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#fafafa", fontSize: 11, textAlign: "center", outline: "none" }}
                      >
                        <option value="">선택</option>
                        <option value="10">$10</option>
                        <option value="20">$20</option>
                        <option value="30">$30</option>
                        <option value="40">$40</option>
                        <option value="50">$50</option>
                        <option value="60">$60</option>
                        <option value="70">$70</option>
                        <option value="80">$80</option>
                      </select>
                    </div>
                    <button onClick={() => {
                      const qtyRaw = stockSellQty[i] ?? a.shares;
                      const priceRaw = stockSellPrice[i];
                      if (!priceRaw) {
                        alert("매각가를 선택해주세요 ($10~$80)");
                        return;
                      }
                      const sellQty = Math.min(a.shares, Math.max(1, parseInt(qtyRaw) || a.shares));
                      const sellPrice = Math.max(1, parseInt(priceRaw) || 0);
                      const sellTotal = sellPrice * sellQty;
                      const stockSellEntry = createStockSellTurn({
                        turn: currentTurn,
                        assetId: a.id,
                        stockName: a.name,
                        sellQty, sellPrice,
                        time: timerOn ? elapsed : null,
                      });
                      stockSellEntry.transaction = `${a.name} ${sellQty}주 매각 @$${sellPrice} = +$${fmtNum(sellTotal)}`;
                      setTurnLog(prev => [...prev, stockSellEntry]);
                      setStockSellQty(prev => { const c = { ...prev }; delete c[i]; return c; });
                      setStockSellPrice(prev => { const c = { ...prev }; delete c[i]; return c; });
                    }} style={{
                      flex: 1, padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                      background: "#f59e0b", color: "#000", fontSize: 11, fontWeight: 700,
                    }}>
                      매각
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* 사업 */}
          {bizAssets.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>🏪 사업 ({bizAssets.length}개)</div>
              {bizAssets.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < bizAssets.length - 1 ? "1px solid #1e1e2e" : "none" }}>
                  <span style={{ fontSize: 11, color: "#a1a1aa" }}>T{a.turn} {a.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.cf >= 0 ? "#86efac" : "#fca5a5" }}>{a.cf >= 0 ? "+" : ""}${a.cf}/월</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid #27272a" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fafafa" }}>소계</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: "#f59e0b" }}>+${fmtNum(bizCF)}/월</span>
              </div>
            </div>
          )}

          {/* 기타 */}
          {otherAssets.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", marginBottom: 8 }}>기타 ({otherAssets.length}개)</div>
              {otherAssets.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ fontSize: 11, color: "#a1a1aa" }}>T{a.turn} {a.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#86efac" }}>{a.cf >= 0 ? "+" : ""}${a.cf}/월</span>
                </div>
              ))}
            </div>
          )}

          {assets.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#52525b", fontSize: 13 }}>아직 보유 자산이 없습니다</div>
          )}

          {/* 전체 합계 */}
          {assets.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "linear-gradient(135deg, #22c55e10, #3b82f610)", border: "1px solid #22c55e30" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>총 패시브 인컴</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>+${fmtNum(totalCF)}/월</span>
              </div>
              <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>
                탈출 조건: 패시브 인컴(${fmtNum(totalCF)}) {'>'} 총지출(${fmtNum(totalExpense)}) → {escaped ? "달성!" : `부족 $${fmtNum((totalExpense - totalCF))}`}
              </div>
            </div>
          )}

          {/* 은행 대출 섹션 — 항상 표시. 직업 카드 초기 대출 + 신용 대출 통합 관리. */}
          {(() => {
            // 신용 대출 한도: 월별 현금흐름의 10배까지 (현재 이자 감안해서 남은 여유 CF 기준)
            const monthlyCFNow = jobData ? jobData.cashflow + totalCF - childTotal - loanInterest : 0;
            const maxCreditLoan = Math.max(0, Math.floor((monthlyCFNow * 10) / 1000) * 1000);
            // 대출 가능 여부: 월CF > 0 + 한도 >= 1000
            const canBorrow = monthlyCFNow > 0 && maxCreditLoan >= 1000;
            return (
              <div style={{ padding: "14px 16px", borderRadius: 14, background: "#7f1d1d10", border: "1px solid #ef444430", marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>🏦 은행 대출</span>
                  <span style={{ fontSize: 9, color: "#71717a" }}>내 턴이 아니어도 사용 가능</span>
                </div>

                {/* 직업 카드 부채 목록 — 각 부채 전액 상환 버튼 */}
                {jobData?.liabilities && (() => {
                  const DEBT_META = [
                    { key: "homeMortgage", label: "주택담보대출", icon: "🏠" },
                    { key: "schoolLoan",   label: "학자금 대출",   icon: "🎓" },
                    { key: "carLoan",      label: "자동차 할부",   icon: "🚗" },
                    { key: "creditCard",   label: "신용카드 할부", icon: "💳" },
                  ];
                  // 상환된 부채 타입 Set
                  const repaidSet = new Set(gameState._repaidDebts || []);
                  const activeDebts = DEBT_META.filter(({ key }) => {
                    const d = jobData.liabilities[key];
                    return d && d.principal > 0;
                  });
                  if (activeDebts.length === 0) return null;
                  return (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: "#0a0a0f", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 6 }}>📋 직업 카드 부채 (전액 상환)</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {activeDebts.map(({ key, label, icon }) => {
                          const d = jobData.liabilities[key];
                          const isRepaid = repaidSet.has(key);
                          const canAfford = cash >= d.principal;
                          return (
                            <div key={key} style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                              padding: "6px 8px", borderRadius: 6,
                              background: isRepaid ? "#14532d15" : "#18181b",
                              border: `1px solid ${isRepaid ? "#22c55e40" : "#27272a"}`,
                              opacity: isRepaid ? 0.7 : 1,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, color: isRepaid ? "#86efac" : "#e4e4e7", fontWeight: 600 }}>
                                  {icon} {label} {isRepaid && "✅"}
                                </div>
                                <div style={{ fontSize: 9, color: "#71717a" }}>
                                  원금 ${fmtNum(d.principal)} · 월 -${fmtNum(d.payment)}
                                </div>
                              </div>
                              {isRepaid ? (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#86efac" }}>상환 완료</span>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (!canAfford) {
                                      alert(`현금 부족\n\n필요: $${fmtNum(d.principal)}\n보유: $${fmtNum(cash)}`);
                                      return;
                                    }
                                    if (!window.confirm(`${label} 전액 상환\n\n현금 -$${fmtNum(d.principal)}\n월 지출 -$${fmtNum(d.payment)} (현금흐름 +$${fmtNum(d.payment)})\n\n상환하시겠습니까?`)) return;
                                    const entry = createDebtRepayTurn({
                                      turn: currentTurn,
                                      debtType: key,
                                      debtLabel: label,
                                      principal: d.principal,
                                      payment: d.payment,
                                      time: timerOn ? elapsed : null,
                                    });
                                    setTurnLog(prev => [...prev, entry]);
                                  }}
                                  disabled={!canAfford}
                                  style={{
                                    padding: "5px 10px", borderRadius: 6, border: "none",
                                    cursor: canAfford ? "pointer" : "not-allowed",
                                    background: canAfford ? "#22c55e" : "#27272a",
                                    color: canAfford ? "#000" : "#52525b",
                                    fontSize: 10, fontWeight: 800, whiteSpace: "nowrap",
                                  }}
                                >💵 상환</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 잔액 & 이자 표시 */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#a1a1aa" }}>신용 대출 잔액</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: bankLoan > 0 ? "#ef4444" : "#52525b" }}>${fmtNum(bankLoan)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: "#a1a1aa" }}>월 이자 (10%)</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: loanInterest > 0 ? "#fca5a5" : "#52525b" }}>-${fmtNum(loanInterest)}/월</span>
                </div>

                {/* 신용 대출 받기 (상시 가능) */}
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "#0a0a0f", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fde68a", marginBottom: 4 }}>💰 신용 대출 받기 ($1,000 단위)</div>
                  <div style={{ fontSize: 9, color: "#71717a", marginBottom: 8 }}>
                    월별 현금흐름의 10배까지 가능 · 현재 한도 <span style={{ color: "#fde68a", fontWeight: 700 }}>${fmtNum(maxCreditLoan)}</span>
                  </div>
                  {canBorrow ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[1000, 5000, 10000, maxCreditLoan].filter((v, i, a) => v >= 1000 && v <= maxCreditLoan && a.indexOf(v) === i).map(amt => (
                        <button key={amt} onClick={() => {
                          if (amt > maxCreditLoan || amt < 1000) {
                            alert("대출 불가: 월별 현금흐름이 부족합니다.");
                            return;
                          }
                          const loanEntry = createExtraLoanTurn({
                            turn: currentTurn,
                            loanAction: "borrow",
                            loanAmount: amt,
                            time: timerOn ? elapsed : null,
                          });
                          loanEntry.transaction = `은행 대출 +$${fmtNum(amt)} (월 이자 +$${fmtNum(Math.round(amt * 0.1))})`;
                          setTurnLog(prev => [...prev, loanEntry]);
                        }} style={{
                          flex: "1 1 60px", padding: "8px", borderRadius: 8, border: "1px solid #f59e0b40",
                          background: "#f59e0b15", color: "#fde68a", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}>
                          +${fmtNum(amt)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 10, color: "#71717a", margin: 0 }}>
                      ⚠️ 월별 현금흐름이 부족하여 신규 대출 불가 (현금흐름 ${fmtNum(monthlyCFNow)} × 10 = ${fmtNum(maxCreditLoan)})
                    </p>
                  )}
                </div>

                {/* 대출 상환 (잔액 있을 때만) */}
                {bankLoan > 0 && (
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: "#0a0a0f" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#86efac", marginBottom: 4 }}>💵 대출 상환 ($1,000 단위)</div>
                    <div style={{ fontSize: 9, color: "#71717a", marginBottom: 8 }}>
                      현재 보유 현금 <span style={{ color: "#86efac", fontWeight: 700 }}>${fmtNum(cash)}</span>
                    </div>
                    {cash >= 1000 ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        {[1000, Math.min(5000, bankLoan), bankLoan].filter((v, i, a) => v <= cash && v <= bankLoan && a.indexOf(v) === i).map(amt => (
                          <button key={amt} onClick={() => {
                            const repayEntry = createExtraLoanTurn({
                              turn: currentTurn,
                              loanAction: "repay",
                              loanAmount: amt,
                              time: timerOn ? elapsed : null,
                            });
                            repayEntry.transaction = `은행 대출 $${fmtNum(amt)} 상환 (잔액 $${fmtNum((bankLoan - amt))})`;
                            setTurnLog(prev => [...prev, repayEntry]);
                          }} style={{
                            flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #22c55e30",
                            background: "#22c55e10", color: "#86efac", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}>
                            -${fmtNum(amt)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 10, color: "#71717a", margin: 0 }}>현금 $1,000 이상 보유 시 상환 가능</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══ 딜러 도구 (2차 작업) ═══ */}
          <div ref={dealerToolsRef} style={{ marginTop: 10, padding: "12px 14px", borderRadius: 14, background: "#18181b", border: "1px solid #27272a" }}>
            <button
              onClick={() => setDealerToolsOpen(v => !v)}
              style={{
                width: "100%", background: "transparent", border: "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: 0, cursor: "pointer", color: "#e4e4e7",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700 }}>🔧 딜러 도구 (타인카드·보정)</span>
              <span style={{ fontSize: 10, color: "#71717a" }}>{dealerToolsOpen ? "▼ 접기" : "▶ 펼치기"}</span>
            </button>
            {dealerToolsOpen && (
              <div style={{ marginTop: 10 }}>
                {/* 4개 기능 탭 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10 }}>
                  {[
                    { key: "split", label: "증자/감자", icon: "📈" },
                    { key: "wipe", label: "상장폐지", icon: "📉" },
                    { key: "buy", label: "권리금 인수", icon: "💼" },
                    { key: "cash", label: "현금 보정", icon: "💵" },
                  ].map(tool => (
                    <button
                      key={tool.key}
                      onClick={() => setExtraTool(extraTool === tool.key ? null : tool.key)}
                      style={{
                        padding: "8px 4px", borderRadius: 8, border: "1px solid " + (extraTool === tool.key ? "#8b5cf6" : "#27272a"),
                        background: extraTool === tool.key ? "#8b5cf620" : "#0a0a0f",
                        color: extraTool === tool.key ? "#c4b5fd" : "#a1a1aa",
                        fontSize: 10, fontWeight: 600, cursor: "pointer", lineHeight: 1.3,
                      }}
                    >
                      <div style={{ fontSize: 14, marginBottom: 2 }}>{tool.icon}</div>
                      {tool.label}
                    </button>
                  ))}
                </div>

                {/* ── ④ 증자/감자 폼 ── */}
                {extraTool === "split" && (
                  <div style={{ padding: 10, borderRadius: 8, background: "#0a0a0f", border: "1px dashed #3f3f46" }}>
                    <p style={{ fontSize: 10, color: "#a1a1aa", margin: "0 0 8px 0", lineHeight: 1.5 }}>
                      다른 사람이 뽑은 기회카드의 증자/감자를 내 보유 주식에 적용합니다.
                    </p>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <select
                        value={extraSplitName}
                        onChange={e => setExtraSplitName(e.target.value)}
                        style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 11, outline: "none" }}
                      >
                        <option value="">종목 선택</option>
                        {stockAssets.map((a, i) => (
                          <option key={i} value={a.name}>{a.name} ({a.shares}주)</option>
                        ))}
                      </select>
                      <select
                        value={extraSplitMultiplier}
                        onChange={e => setExtraSplitMultiplier(e.target.value)}
                        style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 11, outline: "none" }}
                      >
                        <option value="2">무상증자 ×2</option>
                        <option value="0.5">1/2 감자</option>
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        if (!extraSplitName) { alert("종목을 선택해주세요"); return; }
                        const mult = parseFloat(extraSplitMultiplier);
                        const entry = createExtraSplitTurn({
                          turn: currentTurn,
                          stockName: extraSplitName,
                          multiplier: mult,
                          time: timerOn ? elapsed : null,
                        });
                        const owned = assets.filter(a => a.type === "주식" && a.shares > 0 && a.name.includes(extraSplitName));
                        const totalBefore = owned.reduce((s, a) => s + (a.shares || 0), 0);
                        const totalAfter = mult >= 1 ? Math.floor(totalBefore * mult) : Math.round(totalBefore * mult);
                        entry.transaction = `${extraSplitName} ${mult >= 1 ? "무상증자" : "감자"} ${totalBefore}주 → ${totalAfter}주 (타인카드)`;
                        setTurnLog(prev => [...prev, entry]);
                        setExtraSplitName(""); setExtraSplitMultiplier("2"); setExtraTool(null);
                      }}
                      disabled={!extraSplitName}
                      style={{
                        width: "100%", padding: "8px", borderRadius: 8, border: "none", cursor: extraSplitName ? "pointer" : "not-allowed",
                        background: extraSplitName ? "#8b5cf6" : "#27272a", color: extraSplitName ? "#fff" : "#71717a",
                        fontSize: 11, fontWeight: 700,
                      }}
                    >적용</button>
                  </div>
                )}

                {/* ── ⑥ 상장폐지 폼 ── */}
                {extraTool === "wipe" && (
                  <div style={{ padding: 10, borderRadius: 8, background: "#0a0a0f", border: "1px dashed #3f3f46" }}>
                    <p style={{ fontSize: 10, color: "#fca5a5", margin: "0 0 8px 0", lineHeight: 1.5 }}>
                      ⚠️ 국제금융위기 등으로 보유 중인 <b>모든 주식이 $0 처리</b>됩니다. 부동산·사업은 영향 없음.
                    </p>
                    <div style={{ padding: 8, background: "#7f1d1d15", borderRadius: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: "#fca5a5" }}>
                        현재 보유 주식: {totalStockShares > 0 ? `${stockAssets.length}종목 ${totalStockShares}주 → 전량 제거됨` : "없음"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (totalStockShares === 0) { alert("보유 주식이 없습니다"); return; }
                        if (!window.confirm(`보유 중인 모든 주식(${stockAssets.length}종목 ${totalStockShares}주)이 사라집니다.\n\n계속하시겠습니까?`)) return;
                        const entry = createExtraWipeTurn({
                          turn: currentTurn,
                          time: timerOn ? elapsed : null,
                        });
                        entry.transaction = `전 주식 상장폐지 — ${stockAssets.length}종목 ${totalStockShares}주 소멸`;
                        setTurnLog(prev => [...prev, entry]);
                        setExtraTool(null);
                      }}
                      disabled={totalStockShares === 0}
                      style={{
                        width: "100%", padding: "8px", borderRadius: 8, border: "none", cursor: totalStockShares > 0 ? "pointer" : "not-allowed",
                        background: totalStockShares > 0 ? "#ef4444" : "#27272a",
                        color: totalStockShares > 0 ? "#fff" : "#71717a",
                        fontSize: 11, fontWeight: 700,
                      }}
                    >전 주식 상장폐지 실행</button>
                  </div>
                )}

                {/* ── ⑦ 권리금 인수 폼 (드릴다운) ── */}
                {extraTool === "buy" && (
                  <div style={{ padding: 10, borderRadius: 8, background: "#0a0a0f", border: "1px dashed #3f3f46" }}>
                    <p style={{ fontSize: 10, color: "#a1a1aa", margin: "0 0 8px 0", lineHeight: 1.5 }}>
                      다른 플레이어가 뽑은 스몰딜/빅딜 카드(주식 제외)의 권리를 사서 내 자산으로 추가합니다. 내 턴이 아닐 때도 즉시 반영됩니다.
                    </p>

                    {/* Step 1 UI (카드 선택 + 권리금 입력) — Step 2에서는 숨김 */}
                    {extraBuyStep === 1 && (
                    <>
                    {/* Step 1: 카테고리 */}
                    {!extraBuyCategory && (
                      <div>
                        <div style={{ fontSize: 10, color: "#52525b", marginBottom: 6 }}>1단계 · 어떤 자산인가요?</div>
                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${extraBuyCategoriesWithCounts.length}, 1fr)`, gap: 6 }}>
                          {extraBuyCategoriesWithCounts.map(({ key, count }) => {
                            const emoji = key === "부동산" ? "🏠" : "💼";
                            const color = key === "부동산" ? "#3b82f6" : "#f59e0b";
                            return (
                              <button key={key} onClick={() => { setExtraBuyCategory(key); setExtraBuySubtype(null); setExtraBuySelectedCard(null); }} style={{
                                padding: "12px 8px", borderRadius: 8, border: "1px solid " + color + "40",
                                background: color + "10", color: color, cursor: "pointer",
                                fontSize: 12, fontWeight: 700, textAlign: "center",
                              }}>
                                <div style={{ fontSize: 18, marginBottom: 2 }}>{emoji}</div>
                                {key}
                                <div style={{ fontSize: 9, color: "#71717a", marginTop: 2, fontWeight: 500 }}>({count}장)</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 2: 서브타입 */}
                    {extraBuyCategory && !extraBuySubtype && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <button onClick={() => { setExtraBuyCategory(null); setExtraBuySubtype(null); setExtraBuySelectedCard(null); }} style={{
                            padding: "3px 8px", borderRadius: 4, border: "1px solid #27272a",
                            background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10,
                          }}>← 뒤로</button>
                          <span style={{ fontSize: 10, color: "#52525b" }}>2단계 · {extraBuyCategory} 종류</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                          {extraBuySubtypesWithCounts.map(({ key, count }) => (
                            <button key={key} onClick={() => { setExtraBuySubtype(key); setExtraBuySelectedCard(null); }} style={{
                              padding: "8px 10px", borderRadius: 6, border: "1px solid #27272a",
                              background: "#18181b", color: "#e4e4e7", cursor: "pointer",
                              fontSize: 11, fontWeight: 600, textAlign: "left",
                            }}>
                              {key} <span style={{ fontSize: 9, color: "#71717a", fontWeight: 500 }}>({count}장)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step 3: 실제 카드 선택 */}
                    {extraBuyCategory && extraBuySubtype && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                          <button onClick={() => { setExtraBuySubtype(null); setExtraBuySelectedCard(null); }} style={{
                            padding: "3px 8px", borderRadius: 4, border: "1px solid #27272a",
                            background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10,
                          }}>← 뒤로</button>
                          <span style={{ fontSize: 10, color: "#52525b" }}>3단계 ·</span>
                          <span style={{ fontSize: 11, color: "#e4e4e7", fontWeight: 600 }}>{extraBuyCategory} / {extraBuySubtype}</span>
                          <span style={{ fontSize: 10, color: "#71717a" }}>({extraBuyFilteredCards.length}장)</span>
                        </div>
                        <select
                          value={extraBuySelectedCard ? extraBuyFilteredCards.findIndex(x => x.card === extraBuySelectedCard) : ""}
                          onChange={e => {
                            const idx = parseInt(e.target.value);
                            const entry = idx >= 0 ? extraBuyFilteredCards[idx] : null;
                            setExtraBuySelectedCard(entry ? entry.card : null);
                            if (entry) {
                              // 카드 값으로 입력값 자동 채움
                              const c = entry.card;
                              const down = extractDown(c);
                              const price = parseNum(c.price);
                              const cf = parseNumNeg(c.cf);
                              const loan = (price > 0 && down > 0) ? price - down : 0;
                              setExtraBuyName(c.sub || "");
                              // 🆕 권리금 기본값: 착수금(down)의 10% (협상의 출발점)
                              // down이 0이면 price의 10%, 둘 다 0이면 0
                              const depositBase = down > 0 ? down : price;
                              const defaultDeposit = Math.round(depositBase * 0.1);
                              setExtraBuyCost(String(defaultDeposit));
                              setExtraBuyCF(String(cf));
                              setExtraBuyLoan(String(loan));
                              setExtraBuyType(classifyCardCategory(c) === "부동산" ? "부동산" : "사업");
                            }
                          }}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 11, outline: "none", appearance: "auto" }}
                        >
                          <option value="">카드를 선택하세요</option>
                          {extraBuyFilteredCards.map((entry, i) => {
                            const c = entry.card;
                            return (
                              <option key={i} value={i}>
                                {buildCardOptionLabel(c, 30)}
                              </option>
                            );
                          })}
                        </select>

                        {/* 선택된 카드 요약 + 권리금 조정 */}
                        {extraBuySelectedCard && (
                          <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "#1a1a2e" }}>
                            <p style={{ fontSize: 10, color: "#a1a1aa", margin: "0 0 6px", lineHeight: 1.5 }}>
                              {extraBuySelectedCard.desc}
                            </p>
                            <p style={{ fontSize: 9, color: "#71717a", margin: "0 0 8px" }}>
                              카드 기본값: 착수금 ${fmtNum(extractDown(extraBuySelectedCard))} / CF {extraBuySelectedCard.cf || "$0"}/월
                              {(() => {
                                const price = parseNum(extraBuySelectedCard.price);
                                const down = extractDown(extraBuySelectedCard);
                                const loan = (price > 0 && down > 0) ? price - down : 0;
                                return loan > 0 ? ` / 대출 $${fmtNum(loan)}` : "";
                              })()}
                            </p>
                            <div style={{ fontSize: 10, color: "#c4b5fd", marginBottom: 4, fontWeight: 600 }}>
                              💰 실제 지불한 권리금(협상가) — 기본값은 착수금의 10%, 필요 시 조정
                            </div>
                            <input
                              type="number" min={0} placeholder="권리금 $" value={extraBuyCost}
                              onChange={e => setExtraBuyCost(e.target.value)}
                              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #8b5cf640", background: "#18181b", color: "#fde68a", fontSize: 12, fontWeight: 700, textAlign: "center", outline: "none", boxSizing: "border-box" }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    </>
                    )}

                    {/* Step 1 제출: 권리금 지불 후 Step 2로 이동 */}
                    {extraBuyStep === 1 && (
                      <button
                        onClick={() => {
                          const name = extraBuyName.trim();
                          const deposit = parseInt(extraBuyCost) || 0;
                          if (!name) { alert("카드를 선택해주세요"); return; }
                          if (deposit <= 0) { alert("권리금을 입력해주세요"); return; }
                          if (deposit > cash) { alert(`현금이 부족합니다 (보유 $${fmtNum(cash)} / 필요 $${fmtNum(deposit)})`); return; }
                          // Step 2로 이동 — 아직 turnLog에 기록 안 함
                          setExtraBuyDeposit(deposit);
                          setExtraBuyExtraLoan(0);
                          setExtraBuyStep(2);
                        }}
                        disabled={!extraBuySelectedCard}
                        style={{
                          width: "100%", marginTop: 10, padding: "10px", borderRadius: 8, border: "none",
                          cursor: extraBuySelectedCard ? "pointer" : "not-allowed",
                          background: extraBuySelectedCard ? "#8b5cf6" : "#27272a",
                          color: extraBuySelectedCard ? "#fff" : "#71717a",
                          fontSize: 12, fontWeight: 700,
                        }}
                      >{extraBuySelectedCard ? "💰 권리금 지불 → 다음 단계" : "카드를 선택하세요"}</button>
                    )}

                    {/* Step 2: 구매 / 포기 결정 */}
                    {extraBuyStep === 2 && extraBuySelectedCard && (() => {
                      const cardDown = extractDown(extraBuySelectedCard);
                      const cardPrice = parseNum(extraBuySelectedCard.price);
                      const cardLoan = (cardPrice > 0 && cardDown > 0) ? cardPrice - cardDown : 0;
                      // 권리금 지불 반영 후 가용 현금
                      const cashAfterDeposit = cash - extraBuyDeposit;
                      // 착수금을 내려면 얼마가 더 필요한가
                      const shortageAfterDeposit = Math.max(0, cardDown - cashAfterDeposit - extraBuyExtraLoan);
                      // 추가 대출 한도 (기존 BankLoanUI 한도 계산식과 동일)
                      const monthlyCFAfter = (jobData ? jobData.cashflow + totalCF - childTotal : 0);
                      const remainingCF = Math.max(0, monthlyCFAfter - loanInterest - Math.round(extraBuyExtraLoan * 0.1));
                      const maxExtraLoan = Math.floor(remainingCF / 0.1 / 1000) * 1000;
                      const canBuy = shortageAfterDeposit === 0;
                      return (
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#1a1a2e", border: "1px solid #8b5cf650" }}>
                          <div style={{ fontSize: 11, color: "#c4b5fd", fontWeight: 700, marginBottom: 6 }}>
                            ✅ 권리금 ${fmtNum(extraBuyDeposit)} 지불 완료
                          </div>
                          <p style={{ fontSize: 10, color: "#a1a1aa", margin: "0 0 8px", lineHeight: 1.5 }}>
                            이제 카드에 적힌 착수금을 지불하고 자산을 실제로 인수할지 결정하세요.
                          </p>

                          {/* 착수금/대출 정보 */}
                          <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #27272a", marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 10, background: "#ffffff05" }}>
                              <span style={{ color: "#71717a" }}>카드 착수금</span>
                              <span style={{ color: "#fde68a", fontWeight: 700 }}>${fmtNum(cardDown)}</span>
                            </div>
                            {cardLoan > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 10, background: "#ffffff05" }}>
                                <span style={{ color: "#71717a" }}>카드 대출 (자동)</span>
                                <span style={{ color: "#fca5a5", fontWeight: 700 }}>${fmtNum(cardLoan)}</span>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 10, background: "#ffffff05" }}>
                              <span style={{ color: "#71717a" }}>권리금 낸 후 현금</span>
                              <span style={{ color: cashAfterDeposit >= cardDown ? "#86efac" : "#fca5a5", fontWeight: 700 }}>${fmtNum(cashAfterDeposit)}</span>
                            </div>
                          </div>

                          {/* 부족 시 추가 대출 UI */}
                          {shortageAfterDeposit > 0 && (
                            <div style={{ padding: 8, borderRadius: 6, background: "#f59e0b10", border: "1px solid #f59e0b30", marginBottom: 8 }}>
                              <p style={{ fontSize: 10, color: "#fde68a", margin: "0 0 6px", fontWeight: 600 }}>
                                ⚠️ 착수금 ${fmtNum(shortageAfterDeposit)} 부족
                              </p>
                              {maxExtraLoan >= 1000 ? (
                                <>
                                  <p style={{ fontSize: 9, color: "#a1a1aa", margin: "0 0 6px" }}>
                                    $1,000 단위 추가 대출 (최대 ${fmtNum(maxExtraLoan)})
                                  </p>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <button onClick={() => setExtraBuyExtraLoan(Math.max(0, extraBuyExtraLoan - 1000))} style={{
                                      padding: "6px 10px", borderRadius: 6, border: "1px solid #27272a",
                                      background: "#18181b", color: "#fde68a", cursor: "pointer", fontSize: 11, fontWeight: 700,
                                    }}>-$1K</button>
                                    <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: "#fde68a", fontWeight: 800 }}>
                                      추가 대출 ${fmtNum(extraBuyExtraLoan)}
                                    </div>
                                    <button onClick={() => setExtraBuyExtraLoan(Math.min(maxExtraLoan, extraBuyExtraLoan + 1000))} style={{
                                      padding: "6px 10px", borderRadius: 6, border: "1px solid #27272a",
                                      background: "#18181b", color: "#fde68a", cursor: "pointer", fontSize: 11, fontWeight: 700,
                                    }}>+$1K</button>
                                  </div>
                                </>
                              ) : (
                                <p style={{ fontSize: 10, color: "#fca5a5", margin: 0 }}>
                                  대출 여력 없음 — 구매 불가 (포기만 가능)
                                </p>
                              )}
                            </div>
                          )}

                          {/* 결정 버튼 2개 */}
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button
                              onClick={() => {
                                // 구매 확정 — entry 생성
                                const totalLoan = cardLoan + extraBuyExtraLoan;
                                const cardCF = parseNumNeg(extraBuySelectedCard.cf);
                                const entry = createExtraBuyTurn({
                                  turn: currentTurn,
                                  assetName: extraBuyName,
                                  assetType: extraBuyType,
                                  deposit: extraBuyDeposit, // 권리금 (별도 차감)
                                  buyCost: cardDown,         // 착수금만
                                  cf: cardCF,
                                  loan: totalLoan,
                                  time: timerOn ? elapsed : null,
                                  originalCard: extraBuySelectedCard,
                                });
                                setTurnLog(prev => [...prev, entry]);
                                // 리셋
                                setExtraBuyName(""); setExtraBuyCost(""); setExtraBuyCF(""); setExtraBuyLoan(""); setExtraBuyType("사업");
                                setExtraBuyCategory(null); setExtraBuySubtype(null); setExtraBuySelectedCard(null);
                                setExtraBuyStep(1); setExtraBuyDeposit(0); setExtraBuyExtraLoan(0);
                                setExtraTool(null);
                              }}
                              disabled={!canBuy}
                              style={{
                                flex: 1, padding: "10px", borderRadius: 8, border: "none",
                                cursor: canBuy ? "pointer" : "not-allowed",
                                background: canBuy ? "#22c55e" : "#27272a",
                                color: canBuy ? "#000" : "#71717a",
                                fontSize: 12, fontWeight: 800,
                              }}
                            >✅ 구매 확정</button>
                            <button
                              onClick={() => {
                                // 포기 — 권리금만 지불, 자산 미인수
                                const entry = createExtraBuyTurn({
                                  turn: currentTurn,
                                  assetName: extraBuyName,
                                  assetType: extraBuyType,
                                  deposit: extraBuyDeposit,  // 권리금만
                                  buyCost: 0,                // 착수금 없음
                                  forfeited: true,
                                  time: timerOn ? elapsed : null,
                                  originalCard: extraBuySelectedCard,
                                });
                                setTurnLog(prev => [...prev, entry]);
                                // 리셋
                                setExtraBuyName(""); setExtraBuyCost(""); setExtraBuyCF(""); setExtraBuyLoan(""); setExtraBuyType("사업");
                                setExtraBuyCategory(null); setExtraBuySubtype(null); setExtraBuySelectedCard(null);
                                setExtraBuyStep(1); setExtraBuyDeposit(0); setExtraBuyExtraLoan(0);
                                setExtraTool(null);
                              }}
                              style={{
                                flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #ef444440",
                                cursor: "pointer",
                                background: "#ef444415", color: "#fca5a5",
                                fontSize: 12, fontWeight: 700,
                              }}
                            >❌ 포기</button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── ⑧ 현금 보정 폼 ── */}
                {extraTool === "cash" && (
                  <div style={{ padding: 10, borderRadius: 8, background: "#0a0a0f", border: "1px dashed #3f3f46" }}>
                    <p style={{ fontSize: 10, color: "#a1a1aa", margin: "0 0 8px 0", lineHeight: 1.5 }}>
                      딜러가 실수로 잘못 준 현금 조정, 기록 누락 보정 등에 사용합니다. 양수=입금, 음수=출금.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input
                        type="number" placeholder="금액 $ (예: +500 또는 -300)" value={extraCashAmount}
                        onChange={e => setExtraCashAmount(e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#fde68a", fontSize: 11, outline: "none", textAlign: "center" }}
                      />
                      <input
                        type="text" placeholder="사유 (예: 딜러 실수 보정)" value={extraCashReason}
                        onChange={e => setExtraCashReason(e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 11, outline: "none" }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const delta = parseInt(extraCashAmount) || 0;
                        if (delta === 0) { alert("금액을 입력해주세요"); return; }
                        const entry = createExtraCashTurn({
                          turn: currentTurn, cashDelta: delta,
                          reason: extraCashReason || `현금 수동 조정 ${delta >= 0 ? "+" : ""}$${delta}`,
                          time: timerOn ? elapsed : null,
                        });
                        entry.transaction = `현금 보정 ${delta >= 0 ? "+" : ""}$${fmtNum(delta)}${extraCashReason ? ` — ${extraCashReason}` : ""}`;
                        setTurnLog(prev => [...prev, entry]);
                        setExtraCashAmount(""); setExtraCashReason("");
                        setExtraTool(null);
                      }}
                      style={{
                        width: "100%", marginTop: 8, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: "#f59e0b", color: "#000", fontSize: 11, fontWeight: 700,
                      }}
                    >보정 실행</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 기록 탭 ═══ */}
      {viewTab === "history" && (
        <div style={{ marginBottom: 16 }}>
          {turnLog.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {turnGroups.map((group, gIdx) => {
                // 그룹 헤더 텍스트
                const headerLabel = group.main
                  ? `T${group.turnNum} 진행`
                  : `T${group.turnNum} 대기 중 보조 행위`;
                return (
                  <div key={gIdx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {/* ── 그룹 헤더 ── */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 2px",
                      borderBottom: "1px solid #27272a",
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: "#a1a1aa",
                        letterSpacing: "0.03em",
                      }}>
                        ┌ {headerLabel}
                      </span>
                      <span style={{ flex: 1, borderBottom: "1px dashed #27272a", marginTop: 2 }} />
                    </div>
                    {/* ── 메인 행 ── */}
                    {group.main && renderTurnRow(group.main.entry, group.main.idx, false)}
                    {/* ── 보조 행 묶음 ── */}
                    {group.subs.length > 0 && (
                      <div style={{
                        display: "flex", flexDirection: "column", gap: 4,
                        marginLeft: 16, paddingLeft: 10,
                        borderLeft: "2px solid #27272a",
                      }}>
                        {group.subs.map(s => renderTurnRow(s.entry, s.idx, true))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#52525b", fontSize: 13 }}>아직 기록된 턴이 없습니다</div>
          )}
        </div>
      )}

      {/* 디브리핑은 프로필 탭에서 진행됩니다 (위치 이동) */}
      {turnLog.length >= 3 && !gameSaved && (
        <div style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 12,
          background: "#18181b",
          border: "1px dashed #3f3f46",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "#a1a1aa", fontWeight: 700, marginBottom: 4 }}>
            🔒 디브리핑 분석
          </div>
          <div style={{ fontSize: 11, color: "#71717a" }}>
            게임을 저장한 후, 프로필 탭에서 디브리핑 분석을 진행할 수 있습니다
          </div>
        </div>
      )}
      {gameSaved && (
        <div style={{
          marginTop: 20,
          padding: 18,
          borderRadius: 12,
          background: "linear-gradient(135deg, #16a34a15, #22c55e10)",
          border: "1px solid #22c55e40",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 14, color: "#86efac", fontWeight: 800, marginBottom: 6 }}>
            게임이 저장되었습니다
          </div>
          <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.6, marginBottom: 12 }}>
            디브리핑은 <strong style={{ color: "#fbbf24" }}>👤 프로필</strong> 탭의<br/>
            <strong style={{ color: "#fbbf24" }}>"저장된 게임 디브리핑"</strong>에서 언제든 진행할 수 있습니다.
          </div>
          <div style={{ fontSize: 10, color: "#71717a", padding: "8px 12px", background: "#0a0a0f", borderRadius: 8, display: "inline-block" }}>
            💡 한 번 진행한 디브리핑은 영구 저장되어 다시 호출 비용 없이 볼 수 있습니다
          </div>
        </div>
      )}

      {/* 🚧 DebriefSection은 프로필 탭으로 이동됨 (위치 변경) — 컴포넌트 자체는 export 유지 */}

      {/* 🎉 탈출 선언 버튼 (Phase B) — 조건 만족 시 활성화 */}
      {job && !gameEnded && turnLog.length >= 1 && (() => {
        const jobData = JOBS.find(x => x.name === job);
        if (!jobData) return null;
        const passiveIncome = assets
          .filter(a => a.type !== "주식")
          .reduce((sum, a) => sum + (a.cf || 0), 0);
        const totalExpense = jobData.expense + (babies * jobData.childCost) + loanInterest;
        const canEscape = passiveIncome > totalExpense;
        return (
          <div style={{ marginTop: 12 }}>
            <button 
              disabled={!canEscape}
              onClick={() => {
                if (!canEscape) return;
                if (window.confirm(`🎉 쥐경주 탈출을 선언하시겠습니까?\n\n패시브인컴: $${fmtNum(passiveIncome)}/월\n총지출: $${fmtNum(totalExpense)}/월\n\n탈출 후에는 게임이 종료됩니다.`)) {
                  setGameEnded(true);
                }
              }}
              style={{
                width: "100%", padding: 14, borderRadius: 12, border: "none", cursor: canEscape ? "pointer" : "not-allowed",
                background: canEscape ? "linear-gradient(135deg, #eab308, #f59e0b)" : "#27272a",
                color: canEscape ? "#000" : "#52525b",
                fontSize: 14, fontWeight: 800,
              }}>
              {canEscape 
                ? `🎉 쥐경주 탈출 선언! (패시브 $${fmtNum(passiveIncome)} > 지출 $${fmtNum(totalExpense)})`
                : `🔒 탈출 조건 미달 (패시브 $${fmtNum(passiveIncome)} / 지출 $${fmtNum(totalExpense)})`}
            </button>
            {!canEscape && (
              <div style={{ fontSize: 10, color: "#71717a", marginTop: 4, textAlign: "center" }}>
                빅딜/스몰딜 카드로 자산을 축적하여 패시브인컴이 총지출을 초과하면 탈출할 수 있습니다.
              </div>
            )}
          </div>
        );
      })()}

      {/* 게임 저장 (로그인 사용자 기준, 플레이어 불필요) */}
      {turnLog.length >= 3 && (
        <button
          disabled={gameSaving}
          onClick={async () => {
            if (gameSaving) return;
            setGameSaving(true);
            try {
              if (typeof onSaveGame !== "function") {
                console.error("[게임 저장] onSaveGame 콜백이 없음");
                alert("⚠️ 저장 기능이 연결되지 않았습니다. 페이지를 새로고침해주세요.");
                return;
              }
              const result = await onSaveGame(buildGamePayload());

              // 저장 결과 세분화 판정
              if (result === null) {
                // 완전 실패
                alert("⚠️ 게임 저장에 실패했습니다.\n네트워크 상태를 확인하고 다시 시도해주세요.\n\n※ 게임 데이터는 브라우저에 임시 저장되어 있습니다.");
                return;
              }

              if (result && result.localOnly) {
                // 서버(Supabase) 실패 + localStorage에만 저장됨
                await new Promise(resolve => {
                  // 사용자에게 명확히 알림
                  alert(
                    "⚠️ 서버 저장은 실패했지만, 브라우저에 임시 저장되었습니다.\n\n" +
                    "이 기기에서는 디브리핑 가능합니다.\n" +
                    "다른 기기와 동기화하려면 네트워크 확인 후 다시 저장해주세요.\n\n" +
                    (result.error ? `(상세: ${result.error})` : "")
                  );
                  resolve();
                });
                // localStorage에는 있으니 디브리핑 진행 허용
                try { await deleteGameSession(authUser?.id); } catch (_) {}
                setGameSaved(true);
                return;
              }

              // 완전 성공
              try { await deleteGameSession(authUser?.id); } catch (_) {}
              setGameSaved(true); // 디브리핑 버튼 활성화
              alert("✅ 게임이 저장되었습니다.");
            } catch (e) {
              console.error("[게임 저장] 예외:", e);
              alert(`⚠️ 게임 저장 중 오류: ${e.message || "알 수 없는 오류"}\n\n다시 시도해주세요.`);
            } finally {
              setGameSaving(false);
            }
          }}
          style={{
            width: "100%", marginTop: 12, padding: 14, borderRadius: 12, border: "none",
            cursor: gameSaving ? "not-allowed" : "pointer",
            background: gameSaving ? "#3f3f46" : "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            opacity: gameSaving ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {gameSaving ? (
            <>
              <span style={{ display: "inline-block", animation: "cfSpin 1s linear infinite" }}>🎲</span>
              <style>{`@keyframes cfSpin { to { transform: rotate(360deg) } }`}</style>
              저장 중... (최대 10초)
            </>
          ) : "💾 게임 저장"}
        </button>
      )}

      {/* 초기화 */}
      <button onClick={async () => {
        if (turnLog.length >= 3) {
          try {
            await onSaveGame?.(buildGamePayload());
          } catch (e) {
            console.error("[초기화 중 저장] 예외:", e);
          }
        }
        // 진행 중 세션도 삭제
        await deleteGameSession(authUser?.id);
        resetGame();
      }} style={{
        width: "100%", marginTop: 8, padding: 12, borderRadius: 10, border: "1px solid #27272a",
        background: "transparent", color: "#52525b", cursor: "pointer", fontSize: 12,
      }}>게임 초기화</button>

      {/* ─── 후기 버튼 (Phase A) — 게임이 어느 정도 진행됐을 때만 표시 ─── */}
      {playSessionId && turnLog.length >= 3 && (
        <div style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          background: reviewClickedSessions?.has(playSessionId) ? "#14532d20" : "#7c2d1220",
          border: `1px solid ${reviewClickedSessions?.has(playSessionId) ? "#16a34a40" : "#ea580c40"}`,
          textAlign: "center",
        }}>
          {reviewClickedSessions?.has(playSessionId) ? (
            <>
              <div style={{ fontSize: 13, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>
                ✅ 후기를 작성해주셔서 감사합니다!
              </div>
              <div style={{ fontSize: 10, color: "#71717a" }}>
                소중한 의견은 서비스 개선에 반영됩니다.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#fafafa", fontWeight: 700, marginBottom: 6 }}>
                💬 플레이 경험을 나눠주세요
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 10 }}>
                {gameEnded ? "🎉 탈출 축하드립니다! 소감을 들려주세요." : "지금까지의 플레이는 어떠셨나요?"}
              </div>
              <button
                onClick={() => onReviewPrompt?.(playSessionId)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#ea580c",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                📝 후기 작성하기
              </button>
            </>
          )}
        </div>
      )}

      {/* ═══ 턴 편집 모달 ═══ */}
      {editingTurn && (
        <TurnEditModal
          turnIndex={editingTurn.index}
          turn={editingTurn.turn}
          onSave={(updatedTurn) => {
            setTurnLog(prev => prev.map((t, idx) => idx === editingTurn.index ? updatedTurn : t));
            setEditingTurn(null);
          }}
          onClose={() => setEditingTurn(null)}
        />
      )}
    </div>
  );
}

export default function CoachingSimulator() {
  // ─── 인증 상태 (Phase A) ───
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [userIsAdmin, setUserIsAdmin] = useState(false);

  // ─── 게이트 인증 상태 (Phase B) ───
  const [contestUnlocked, setContestUnlocked] = useState(false);
  const [debriefUnlocked, setDebriefUnlocked] = useState(false);
  const [gateDialog, setGateDialog] = useState(null); // null | "contest" | "debrief"
  const gateDialogResolveRef = useRef(null);

  // 게이트 검증 함수 (Promise 반환)
  const requireGate = (gateType) => {
    if (userIsAdmin) return Promise.resolve(true);
    if (gateType === "contest" && contestUnlocked) return Promise.resolve(true);
    if (gateType === "debrief" && debriefUnlocked) return Promise.resolve(true);
    return new Promise((resolve) => {
      gateDialogResolveRef.current = resolve;
      setGateDialog(gateType);
    });
  };

  const handleGateSuccess = () => {
    if (gateDialog === "contest") setContestUnlocked(true);
    if (gateDialog === "debrief") setDebriefUnlocked(true);
    gateDialogResolveRef.current?.(true);
    setGateDialog(null);
  };

  const handleGateCancel = () => {
    gateDialogResolveRef.current?.(false);
    setGateDialog(null);
  };

  // window에 게이트 함수 노출 (DebriefSection에서 접근용)
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__requireDebriefGate = () => requireGate("debrief");
    window.__debriefUnlocked = debriefUnlocked;
    window.__userIsAdmin = userIsAdmin;
    window.__authUserId = authUser?.id || null;
    return () => {
      // cleanup
    };
  }, [debriefUnlocked, userIsAdmin, authUser, contestUnlocked]);

  // ─── 대회 모드 플래그 ───
  const [isContestMode, setIsContestMode] = useState(false);

  // ─── 티어 시스템 (Phase B Day 2) ───
  const [userTotalPlays, setUserTotalPlays] = useState(0);
  const [tierUpModal, setTierUpModal] = useState(null); // { from, to } | null
  const prevPlayCountRef = useRef(0);
  
  // 코칭딜러 자격 (Phase B Day 2 후반)
  const [userCredential, setUserCredential] = useState(null); // 'master' | 'dealer' | null

  // 사용자 통계 + 자격 로드 (user_stats 뷰)
  const loadUserStats = async () => {
    if (!authUser) {
      setUserTotalPlays(0);
      setUserCredential(null);
      prevPlayCountRef.current = 0;
      return;
    }
    try {
      const { data } = await supabase
        .from("user_stats")
        .select("total_plays, credential")
        .eq("user_id", authUser.id)
        .maybeSingle();
      const count = data?.total_plays || 0;
      setUserTotalPlays(count);
      setUserCredential(data?.credential || null);
      prevPlayCountRef.current = count;
    } catch (e) {
      console.warn("user_stats 조회 실패:", e);
    }
  };

  // 로그인 시 초기 통계 로드
  useEffect(() => {
    if (authUser) loadUserStats();
  }, [authUser]);

  // 게임 저장 후 승급 체크
  const checkTierUpAfterGame = async () => {
    if (!authUser) return;
    try {
      const { data } = await supabase
        .from("user_stats")
        .select("total_plays")
        .eq("user_id", authUser.id)
        .maybeSingle();
      const newCount = data?.total_plays || 0;
      const oldCount = prevPlayCountRef.current;
      
      if (newCount > oldCount) {
        const tierUp = checkTierUp(oldCount, newCount);
        if (tierUp) {
          setTierUpModal(tierUp);
        }
        setUserTotalPlays(newCount);
        prevPlayCountRef.current = newCount;
      }
    } catch (e) {
      console.warn("승급 체크 실패:", e);
    }
  };

  // 후기 버튼 클릭 추적 (게임 세션 ID 기준)
  const [reviewClickedSessions, setReviewClickedSessions] = useState(new Set());

  // 초기 세션 확인 + 인증 상태 변화 구독 (Phase B Day 3: 토큰 만료 자동 처리)
  useEffect(() => {
    let mounted = true;
    
    // 5초 안전 타이머 - 어떤 경우든 로딩 무한 대기 방지
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.warn("[Auth] 5초 타임아웃 - 강제 로딩 종료");
        setAuthLoading(false);
      }
    }, 5000);
    
    (async () => {
      try {
        // getCurrentUser에 자체 타임아웃 (3초)
        const userPromise = getCurrentUser();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("getUser 타임아웃")), 3000)
        );
        const user = await Promise.race([userPromise, timeoutPromise]);
        
        if (!mounted) return;
        
        if (user) {
          setAuthUser(user);
          try {
            const admin = await isAdmin(user.id);
            if (mounted) setUserIsAdmin(admin);
          } catch (e) {
            console.warn("admin 체크 실패:", e);
          }
        }
      } catch (e) {
        console.warn("[Auth] 세션 확인 실패 - 토큰 만료 가능성:", e.message);
        // 토큰 만료 시 자동으로 localStorage 정리
        try {
          if (typeof window !== "undefined") {
            // Supabase 관련 토큰만 정리 (다른 데이터는 유지)
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
              if (key.includes('supabase') || key.includes('cashflow-auth') || key.includes('sb-')) {
                localStorage.removeItem(key);
              }
            });
          }
        } catch {}
        if (mounted) {
          setAuthUser(null);
          setUserIsAdmin(false);
        }
      } finally {
        clearTimeout(safetyTimeout);
        if (mounted) setAuthLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        const user = session?.user || null;
        setAuthUser(user);
        if (user) {
          try {
            const admin = await isAdmin(user.id);
            if (mounted) setUserIsAdmin(admin);
          } catch (e) {
            console.warn("admin 체크 실패:", e);
          }
        } else {
          setUserIsAdmin(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe?.();
    };
  }, []);

  // 로그아웃 핸들러 (디브리핑 데이터 완벽 보존 + 강제 진행)
  // ⚠️ Supabase signOut()은 localStorage의 모든 항목을 삭제하고 리다이렉트 유발 가능
  // → 전략: signOut 호출 없이 클라이언트 단에서 직접 토큰 제거 + 페이지 이동
  const signOutInProgressRef = useRef(false);
  const handleSignOut = async () => {
    // 중복 클릭 방지
    if (signOutInProgressRef.current) {
      console.log("[handleSignOut] 이미 진행 중 - 무시");
      return;
    }
    signOutInProgressRef.current = true;

    if (typeof window === "undefined") return;

    // ─── 1단계: 백업 (디브리핑 보존) ───
    const preservedData = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("debrief-永:") || k.startsWith("game:") || k.startsWith("debrief:")) {
          const v = localStorage.getItem(k);
          if (v) preservedData[k] = v;
        }
      }
      console.log(`[handleSignOut] 백업 완료: ${Object.keys(preservedData).length}개 키`);
    } catch (e) {
      console.warn("[handleSignOut] 백업 실패:", e);
    }

    // ─── 2단계: Supabase 토큰만 직접 제거 (signOut 호출 안 함) ───
    // signOut()은 localStorage 전체 삭제 + 리다이렉트 위험 → 우회
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.includes("supabase") || k.includes("sb-") || k.includes("cashflow-auth") || k.includes("auth-token")) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch {}
      });
      console.log(`[handleSignOut] 인증 토큰 제거: ${keysToRemove.length}개`);

      // sessionStorage 전체 삭제 (영구 저장 아님)
      try { sessionStorage.clear(); } catch {}
    } catch (e) {
      console.error("[handleSignOut] 토큰 제거 실패:", e);
    }

    // ─── 3단계: 백업 데이터 복원 (혹시 signOut 이벤트가 뭔가 지웠을 경우 대비) ───
    try {
      let restored = 0;
      for (const [k, v] of Object.entries(preservedData)) {
        try {
          localStorage.setItem(k, v);
          restored++;
        } catch {}
      }
      console.log(`[handleSignOut] ✅ 디브리핑 데이터 복원: ${restored}/${Object.keys(preservedData).length}개`);
    } catch (e) {
      console.error("[handleSignOut] 복원 실패:", e);
    }

    // ─── 4단계: Supabase signOut은 백그라운드로 (응답 기다리지 않음) ───
    // 네트워크 호출해서 서버 세션 정리만 해두기
    // 실패해도 토큰은 이미 제거됐으므로 로그아웃 상태
    try {
      signOut().catch(e => console.warn("[handleSignOut] 백그라운드 signOut 에러(무시):", e));
    } catch (e) {
      console.warn("[handleSignOut] signOut 호출 실패(무시):", e);
    }

    // ─── 5단계: 즉시 페이지 이동 (signOut 응답 기다리지 않음) ───
    console.log("[handleSignOut] 페이지 이동: /");
    window.location.href = "/";
  };

  // 게스트 제한 체크 (플레이/플레이어/플레이어게임 탭)
  const guardAuth = (mode) => {
    if (isGuest && (mode === "play" || mode === "players" || mode === "playerGames")) {
      if (typeof window !== "undefined" && window.confirm("이 기능은 로그인이 필요합니다.\n로그인 화면으로 이동하시겠습니까?")) {
        setIsGuest(false);
      }
      return false;
    }
    return true;
  };

  // 후기 폼 열기 (게임당 한 번만)
  const REVIEW_FORM_URL = "https://naver.me/xCt79F9H";
  const openReviewForm = (sessionId) => {
    if (typeof window !== "undefined") {
      window.open(REVIEW_FORM_URL, "_blank", "noopener,noreferrer");
    }
    if (sessionId) {
      setReviewClickedSessions(prev => {
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
    }
  };

  const [appMode, setAppMode] = useState("sim"); // "sim" | "players" | "playerGames" | "play"
  const [turns, setTurns] = useState(20);
  const [version, setVersion] = useState("101");
  const [results, setResults] = useState(null);
  const [expandedTurn, setExpandedTurn] = useState(null);
  const resultRef = useRef(null);

  // ── 플레이어 관리 ──
  const [players, setPlayers] = useState({});
  const [currentPlayer, setCurrentPlayer] = useState(null); // { id, name }
  const [playerGames, setPlayerGames] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [viewingGame, setViewingGame] = useState(null);

  // 플레이어 목록 로드 (로그인 상태에 따라)
  useEffect(() => {
    if (!authUser) {
      setPlayers({});
      // 로그아웃 시 게이트 상태도 리셋 (Phase B)
      setContestUnlocked(false);
      setDebriefUnlocked(false);
      setIsContestMode(false);
      // Phase B Day 2: 티어 상태도 리셋
      setUserTotalPlays(0);
      setUserCredential(null);
      setTierUpModal(null);
      prevPlayCountRef.current = 0;
      return;
    }
    (async () => {
      try {
        const r = await window.storage?.get("players");
        if (r?.value) setPlayers(JSON.parse(r.value));
      } catch {}
    })();
  }, [authUser]);

  // 플레이어 저장
  const savePlayers = async (data) => {
    setPlayers(data);
    try { await window.storage?.set("players", JSON.stringify(data)); } catch {}
  };

  // 새 플레이어 등록
  const registerPlayer = () => {
    if (!newPlayerName.trim()) return;
    const nextNum = Object.keys(players).length + 1;
    const id = `CF-${String(nextNum).padStart(3, "0")}`;
    const updated = { ...players, [id]: { name: newPlayerName.trim(), created: new Date().toLocaleDateString("ko-KR"), gamesPlayed: 0 } };
    savePlayers(updated);
    setNewPlayerName("");
  };

  // 플레이어 삭제
  const deletePlayer = async (id) => {
    const updated = { ...players };
    delete updated[id];
    savePlayers(updated);
    // 해당 플레이어 게임 데이터 삭제
    try {
      const keys = await window.storage?.list(`game:${id}:`);
      if (keys?.keys) { for (const k of keys.keys) { await window.storage?.delete(k); } }
    } catch {}
    // DB에서 실제 플레이어 레코드 삭제 (Phase A)
    try { await deletePlayerFromDB(id); } catch {}
    if (currentPlayer?.id === id) { setCurrentPlayer(null); setAppMode("players"); }
  };

  // 플레이어 게임 목록 로드
  const loadPlayerGames = async (playerId) => {
    try {
      const keys = await window.storage?.list(`game:${playerId}:`);
      if (keys?.keys) {
        const games = [];
        for (const k of keys.keys) {
          try {
            const r = await window.storage?.get(k);
            if (r?.value) games.push({ key: k, ...JSON.parse(r.value) });
          } catch {}
        }
        setPlayerGames(games.sort((a, b) => (b.ts || 0) - (a.ts || 0)));
      } else { setPlayerGames([]); }
    } catch { setPlayerGames([]); }
  };

  // 게임 세션 삭제
  const deleteGame = async (key, playerId) => {
    try {
      await window.storage?.delete(key);
      setPlayerGames(prev => prev.filter(g => g.key !== key));
      // 게임 수 감소
      if (players[playerId]) {
        const updated = { ...players, [playerId]: { ...players[playerId], gamesPlayed: Math.max(0, (players[playerId].gamesPlayed || 1) - 1) } };
        savePlayers(updated);
      }
    } catch {}
  };

  // 플레이어 선택 → 게임 목록으로
  const selectPlayer = (id) => {
    setCurrentPlayer({ id, name: players[id].name });
    loadPlayerGames(id);
    setAppMode("playerGames");
  };

  // 새 게임 시작
  const startNewGame = () => {
    setAppMode("play");
  };

  // ── 플레이어 선택 화면 ──
  const renderPlayerSelect = () => (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>👤</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "#fafafa", margin: 0 }}>플레이어 선택</h2>
        <p style={{ fontSize: 12, color: "#71717a", marginTop: 4 }}>이름을 등록하면 게임 기록이 저장됩니다</p>
      </div>

      {/* 새 플레이어 등록 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} placeholder="이름 입력"
          onKeyDown={e => e.key === "Enter" && registerPlayer()}
          style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #27272a", background: "#18181b", color: "#fafafa", fontSize: 14, outline: "none" }}
        />
        <button onClick={registerPlayer} disabled={!newPlayerName.trim()} style={{
          padding: "12px 20px", borderRadius: 10, border: "none", cursor: newPlayerName.trim() ? "pointer" : "default",
          background: newPlayerName.trim() ? "#22c55e" : "#27272a", color: newPlayerName.trim() ? "#fff" : "#52525b",
          fontSize: 13, fontWeight: 700,
        }}>등록</button>
      </div>

      {/* 등록된 플레이어 목록 */}
      {Object.keys(players).length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(players).map(([id, p]) => (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 12, background: "#111118", border: "1px solid #27272a" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>{p.name}</span>
                <span style={{ fontSize: 10, color: "#3b82f6", marginLeft: 8, fontWeight: 700 }}>#{id}</span>
                <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{p.created} · 게임 {p.gamesPlayed || 0}회</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => selectPlayer(id)} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 700,
                }}>선택</button>
                <button onClick={() => deletePlayer(id)} style={{
                  padding: "8px 10px", borderRadius: 8, border: "1px solid #ef444430", cursor: "pointer",
                  background: "#ef444410", color: "#fca5a5", fontSize: 11,
                }}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "30px", color: "#52525b", fontSize: 13 }}>등록된 플레이어가 없습니다</div>
      )}

      {/* 게스트로 시작 */}
      <button onClick={() => { setCurrentPlayer(null); setAppMode("sim"); }} style={{
        width: "100%", marginTop: 20, padding: 14, borderRadius: 12, border: "1px solid #27272a",
        background: "transparent", color: "#71717a", cursor: "pointer", fontSize: 13, fontWeight: 600,
      }}>게스트로 시작 (저장 없이 시뮬레이션만)</button>
    </div>
  );

  // ── 플레이어 게임 목록 화면 ──
  const renderPlayerGames = () => (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: 0 }}>{currentPlayer?.name}</h2>
          <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>#{currentPlayer?.id}</span>
        </div>
        <button onClick={() => setAppMode("players")} style={{
          padding: "6px 14px", borderRadius: 8, border: "1px solid #27272a", background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 11,
        }}>← 플레이어 목록</button>
      </div>

      {/* 새 게임 시작 */}
      <button onClick={startNewGame} style={{
        width: "100%", padding: 16, borderRadius: 14, border: "none", cursor: "pointer", marginBottom: 20,
        background: "linear-gradient(135deg, #22c55e, #3b82f6)", color: "#fff", fontSize: 16, fontWeight: 800,
      }}>🎮 새 게임 시작</button>

      {/* 게임 이력 */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#a1a1aa", marginBottom: 10 }}>📊 게임 이력 ({playerGames.length}개)</div>
      {playerGames.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {playerGames.map(g => (
            <div key={g.key} style={{ padding: "14px 16px", borderRadius: 12, background: "#111118", border: `1px solid ${viewingGame?.key === g.key ? "#3b82f650" : "#27272a"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>CashFlow {g.version}</span>
                  <span style={{ fontSize: 10, color: "#71717a", marginLeft: 6 }}>{g.job} · {g.turnCount || g.turns}턴</span>
                  <div style={{ fontSize: 10, color: "#52525b", marginTop: 2 }}>{g.date} {g.time || ""}</div>
                  {g.cash != null && <div style={{ fontSize: 10, color: "#fde68a" }}>현금 ${fmtNum(g.cash)} · CF ${fmtNum(g.totalCF)}/월</div>}
                  {g.debrief?.analysis && <span style={{ fontSize: 9, color: "#86efac" }}>✓ 디브리핑 완료</span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setViewingGame(viewingGame?.key === g.key ? null : g)} style={{
                    padding: "6px 10px", borderRadius: 6, border: "1px solid #3b82f630", background: "#3b82f610", color: "#93c5fd", fontSize: 10, cursor: "pointer",
                  }}>{viewingGame?.key === g.key ? "닫기" : "상세"}</button>
                  <button onClick={() => deleteGame(g.key, currentPlayer?.id)} style={{
                    padding: "6px 8px", borderRadius: 6, border: "1px solid #ef444430", background: "#ef444410", color: "#fca5a5", fontSize: 10, cursor: "pointer",
                  }}>삭제</button>
                </div>
              </div>

              {/* 게임 상세 보기 */}
              {viewingGame?.key === g.key && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #27272a" }}>
                  {/* 턴 기록 */}
                  {g.turnLog && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", marginBottom: 4 }}>턴 기록 ({g.turnLog.length})</div>
                      <div style={{ maxHeight: 200, overflow: "auto" }}>
                        {g.turnLog.map((t, ti) => (
                          <div key={ti} style={{ fontSize: 9, color: "#a1a1aa", padding: "2px 0", borderBottom: "1px solid #1e1e2e" }}>
                            T{t.turn} {t.card?.sub || t.cellType} {t.action ? `[${t.action}]` : ""} {t.transaction || ""} {t.cashSnapshot != null ? `💰$${fmtNum(t.cashSnapshot)}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 자산 */}
                  {g.assets && g.assets.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#86efac", marginBottom: 4 }}>보유 자산</div>
                      {g.assets.map((a, ai) => (
                        <div key={ai} style={{ fontSize: 9, color: "#a1a1aa" }}>{a.name} ({a.type}) {a.cf ? `CF $${a.cf}` : ""} {a.shares ? `${a.shares}주` : ""}</div>
                      ))}
                    </div>
                  )}
                  {/* 디브리핑 */}
                  {g.debrief?.analysis && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#fde68a", marginBottom: 4 }}>디브리핑</div>
                      {(g.debrief.analysis.lessons || []).map((l, li) => (
                        <div key={li} style={{ fontSize: 9, color: "#a1a1aa" }}>{li+1}. {l}</div>
                      ))}
                      {g.debrief.feedback && (
                        <div style={{ fontSize: 9, color: "#a1a1aa", marginTop: 4, padding: "4px 8px", background: "#22c55e08", borderRadius: 4 }}>
                          {g.debrief.feedback.substring(0, 300)}{g.debrief.feedback.length > 300 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 유료 리포트 받기 — simText가 있으면 언제든 가능 */}
                  {g.simText && (
                    <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "linear-gradient(135deg, #3b82f608, #f59e0b08)", border: "1px solid #3b82f620" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", marginBottom: 6 }}>📝 AI 코칭 리포트 받기</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[
                          { tier: 1, label: "상세 $9", color: "#3b82f6" },
                          { tier: 2, label: "프리미엄 $20", color: "#f59e0b" },
                        ].map(t => (
                          <button key={t.tier} onClick={async () => {
                            try {
                              const fb = await generatePaidFeedback({
                                tier: t.tier,
                                version: g.version,
                                turns: g.turnCount || g.turns,
                                simText: g.simText,
                              });
                              const updated = { ...g, debrief: { ...(g.debrief || {}), feedback: fb, feedbackTier: t.tier } };
                              await window.storage?.set(g.key, JSON.stringify(updated));
                              setPlayerGames(prev => prev.map(x => x.key === g.key ? updated : x));
                              setViewingGame(updated);
                              alert("리포트가 생성되었습니다!");
                            } catch (e) { alert(e.message || "네트워크 오류"); }
                          }} style={{
                            flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.color}40`,
                            background: t.color + "10", color: t.color, fontSize: 10, fontWeight: 700, cursor: "pointer",
                          }}>{t.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "30px", color: "#52525b", fontSize: 13 }}>아직 게임 기록이 없습니다</div>
      )}
    </div>
  );

  // 현재 게임 세션 ID (후기 버튼 중복 방지용)
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const run = () => {
    const r = simulate(turns, version);
    setResults(r);
    setExpandedTurn(null);
    // 시뮬레이션마다 새 세션 ID 부여
    setCurrentSessionId(`sim-${Date.now()}`);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const deck = DECKS[version];

  const summary = useMemo(() => {
    if (!results) return null;
    const s = { deal1: 0, deal2: 0, market: 0, otherMarket: 0, doodad: 0, payday: 0, charity: 0, baby: 0, downsized: 0 };
    for (const r of results) {
      if (r.dealType === deck.deal1Name) s.deal1++;
      else if (r.dealType === deck.deal2Name) s.deal2++;
      else if (r.dealType === "MARKET") s.market++;
      else if (r.dealType === "타인MARKET") s.otherMarket++;
      else if (r.dealType === "DOODAD") s.doodad++;
      const ct = r.cell?.type;
      if (ct === "PAYDAY") s.payday++;
      else if (ct === "CHARITY") s.charity++;
      else if (ct === "BABY") s.baby++;
      else if (ct === "DOWNSIZED") s.downsized++;
    }
    return s;
  }, [results, deck]);

  // ─── 인증 게이트 (Phase A) ───
  if (authLoading) {
    return <DiceSpinner fullScreen size="lg" message="로딩 중..." />;
  }

  // 로그인 안 됨 + 게스트 모드 아님 → 로그인 화면
  if (!authUser && !isGuest) {
    return (
      <AuthScreen
        onGuestMode={() => setIsGuest(true)}
        onAuthSuccess={() => { /* 구독 콜백이 처리함 */ }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#d4d4d8", fontFamily: "'Pretendard Variable', 'Noto Sans KR', -apple-system, sans-serif" }}>

      {/* ═══ 게이트 비밀번호 팝업 (Phase B) ═══ */}
      {gateDialog && (
        <GatePasswordDialog
          gateType={gateDialog}
          onSuccess={handleGateSuccess}
          onCancel={handleGateCancel}
        />
      )}

      {/* ═══ 티어 승급 축하 모달 (Phase B Day 2) ═══ */}
      {tierUpModal && (
        <TierUpModal
          tierUp={tierUpModal}
          onClose={() => setTierUpModal(null)}
        />
      )}

      {/* ═══ 상단 사용자 바 (Phase A) ═══ */}
      <div style={{
        background: "#111118",
        borderBottom: "1px solid #27272a",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        maxWidth: 560,
        margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {authUser ? (
            <>
              <span style={{ fontSize: 12, color: "#fafafa", fontWeight: 700 }}>
                {getDisplayName(authUser)}
              </span>
              <TierBadge playCount={userTotalPlays} size="sm" showName={true} />
              {userCredential && <CoachBadge credential={userCredential} size="sm" showName={true} />}
              {userIsAdmin && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "#f59e0b",
                  color: "#000",
                }}>
                  🔑 ADMIN
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#a1a1aa" }}>
              🎲 게스트 모드 (기록 저장 안 됨)
            </span>
          )}
        </div>
        {authUser ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {userIsAdmin && (
              <button
                onClick={() => setAppMode("admin")}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${appMode === "admin" ? "#ef4444" : "#ef444440"}`,
                  background: appMode === "admin" ? "#ef444420" : "transparent",
                  color: "#fca5a5",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ⚙️ Admin
              </button>
            )}
            <button
              onClick={handleSignOut}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #27272a",
                background: "transparent",
                color: "#a1a1aa",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsGuest(false)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #f59e0b",
              background: "#f59e0b20",
              color: "#f59e0b",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            로그인
          </button>
        )}
      </div>

      {/* ═══ 프로필 탭 (Phase B Day 2 후반) ═══ */}
      {/* 로그인된 유저는 항상 마운트: 탭 전환 시 state/진행중 요청 보존 */}
      {authUser && (
        <div style={{ display: appMode === "profile" ? "block" : "none" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 16px 0 16px" }}>
            <button onClick={() => setAppMode("sim")} style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 11,
              cursor: "pointer",
            }}>
              ← 홈으로
            </button>
          </div>
          <ProfileTab authUser={authUser} />
        </div>
      )}

      {/* ═══ (deprecated) 플레이어 게임 목록 화면 — 직접 접근 불가 ═══ */}
      {appMode === "playerGames" && renderPlayerGames()}

      {/* ═══ 내 이력 탭 (Phase B Day 2) ═══ */}
      {appMode === "history" && (
        <div>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 16px 0 16px" }}>
            <button onClick={() => setAppMode("sim")} style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 11,
              cursor: "pointer",
            }}>
              ← 홈으로
            </button>
          </div>
          <MyHistoryTab authUser={authUser} />
        </div>
      )}

      {/* ═══ 랭킹 탭 (Phase B Day 2) ═══ */}
      {appMode === "ranking" && (
        <div>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 16px 0 16px" }}>
            <button onClick={() => setAppMode("sim")} style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 11,
              cursor: "pointer",
            }}>
              ← 홈으로
            </button>
          </div>
          <RankingTab authUser={authUser} />
        </div>
      )}

      {/* ═══ Admin 패널 (Phase B Day 2) ═══ */}
      {appMode === "admin" && userIsAdmin && (
        <div>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 16px 0 16px" }}>
            <button onClick={() => setAppMode("sim")} style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #27272a",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 11,
              cursor: "pointer",
            }}>
              ← 홈으로
            </button>
          </div>
          <AdminPanel authUser={authUser} userIsAdmin={userIsAdmin} />
        </div>
      )}

      {/* ═══ 시뮬레이션 / 플레이 모드 ═══ */}
      {(appMode === "sim" || appMode === "play") && (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-block", background: "linear-gradient(135deg, #f59e0b22, #ef444422)", borderRadius: 16, padding: "6px 20px", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: "#f59e0b" }}>COACHING SIMULATOR</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, lineHeight: 1.2, color: "#fafafa" }}>
            캐쉬플로우 {version}
          </h1>
          <p style={{ fontSize: 13, color: "#71717a", marginTop: 8 }}>
            24칸 쥐경주 · {deck.total}장 카드 · 코칭 시뮬레이션
          </p>
          {currentPlayer && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 20, background: "#3b82f615", border: "1px solid #3b82f630" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd" }}>👤 {currentPlayer.name}</span>
              <span style={{ fontSize: 9, color: "#3b82f6" }}>#{currentPlayer.id}</span>
            </div>
          )}
        </div>

        {/* 버전 선택 */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24, justifyContent: "center" }}>
          {Object.entries(DECKS).map(([key, d]) => (
            <button
              key={key}
              onClick={() => {
                if (key === "202") {
                  alert("⚠️ 캐쉬플로우 202 모드는 아직 준비중입니다.\n\n조금만 기다려주세요!");
                  return;
                }
                setVersion(key);
                setResults(null);
              }}
              style={{
                flex: 1, maxWidth: 200, padding: "14px 20px", borderRadius: 14,
                border: version === key ? `2px solid ${d.color}` : "2px solid #27272a",
                background: version === key ? d.color + "18" : "#111118",
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900, color: version === key ? d.color : "#52525b" }}>
                {d.label}
              </div>
              <div style={{ fontSize: 11, color: version === key ? d.color : "#52525b", fontWeight: 600, marginTop: 4 }}>
                {d.total}장
              </div>
            </button>
          ))}
        </div>

        {/* 1줄: 시뮬레이션 / 플레이 / 대회 / 플레이어 — 시뮬 모드에서만 표시 (플레이 중엔 방해 금지) */}
        {appMode === "sim" && (
        <div style={{ display: "flex", gap: 0, marginBottom: 8, borderRadius: 12, overflow: "hidden", border: "1px solid #27272a" }}>
          <button onClick={() => { setAppMode("sim"); setIsContestMode(false); }} style={{
            flex: 1, padding: "12px", border: "none", cursor: "pointer",
            background: appMode === "sim" ? "#3b82f620" : "#111118",
            borderBottom: appMode === "sim" ? "2px solid #3b82f6" : "2px solid transparent",
            color: appMode === "sim" ? "#93c5fd" : "#52525b",
            fontSize: 13, fontWeight: 700,
          }}>🎲 시뮬</button>
          <button onClick={() => { if (guardAuth("play")) { setAppMode("play"); setIsContestMode(false); } }} style={{
            flex: 1, padding: "12px", border: "none", cursor: "pointer",
            background: appMode === "play" && !isContestMode ? "#22c55e20" : "#111118",
            borderBottom: appMode === "play" && !isContestMode ? "2px solid #22c55e" : "2px solid transparent",
            color: appMode === "play" && !isContestMode ? "#86efac" : "#52525b",
            fontSize: 13, fontWeight: 700,
            opacity: isGuest ? 0.5 : 1,
          }}>🎮 플레이{isGuest ? " 🔒" : ""}</button>
          <button onClick={async () => {
            if (!guardAuth("play")) return;
            const ok = await requireGate("contest");
            if (ok) {
              setAppMode("play");
              setIsContestMode(true);
            }
          }} style={{
            flex: 1, padding: "12px", border: "none", cursor: "pointer",
            background: appMode === "play" && isContestMode ? "#dc262620" : "#111118",
            borderBottom: appMode === "play" && isContestMode ? "2px solid #dc2626" : "2px solid transparent",
            color: appMode === "play" && isContestMode ? "#fca5a5" : "#52525b",
            fontSize: 13, fontWeight: 700,
            opacity: isGuest ? 0.5 : 1,
          }}>🏆 대회{isGuest ? " 🔒" : (!contestUnlocked && !userIsAdmin ? " 🔒" : "")}</button>
          <button onClick={() => { if (guardAuth("play")) setAppMode("profile"); }} style={{
            flex: 1, padding: "12px", border: "none", cursor: "pointer",
            background: appMode === "profile" ? "#f59e0b20" : "#111118",
            borderBottom: appMode === "profile" ? "2px solid #f59e0b" : "2px solid transparent",
            color: appMode === "profile" ? "#fde68a" : "#52525b",
            fontSize: 13, fontWeight: 700,
            opacity: isGuest ? 0.5 : 1,
          }}>👤 프로필{isGuest ? " 🔒" : ""}</button>
        </div>
        )}

        {/* 2줄: 랭킹만 표시 — 시뮬 모드에서만 (내이력은 프로필로 통합, Admin은 헤더로 이동) */}
        {appMode === "sim" && (
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderRadius: 12, overflow: "hidden", border: "1px solid #27272a" }}>
          <button onClick={() => { setAppMode("ranking"); }} style={{
            flex: 1, padding: "10px", border: "none", cursor: "pointer",
            background: appMode === "ranking" ? "#eab30820" : "#111118",
            borderBottom: appMode === "ranking" ? "2px solid #eab308" : "2px solid transparent",
            color: appMode === "ranking" ? "#fde68a" : "#52525b",
            fontSize: 12, fontWeight: 700,
          }}>🏅 랭킹</button>
        </div>
        )}

        {/* 플레이 모드: 홈으로 돌아가는 버튼 (최소 UI) */}
        {appMode === "play" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => { setAppMode("sim"); setIsContestMode(false); }} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #27272a",
              background: "transparent", color: "#a1a1aa", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>← 홈으로</button>
            <span style={{ fontSize: 11, color: "#71717a" }}>
              {isContestMode ? "🏆 대회 모드" : "🎮 플레이 모드"}
            </span>
          </div>
        )}

        {/* ═══ 대회 모드 배너 (Phase B) ═══ */}
        {appMode === "play" && isContestMode && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 10,
            background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
            border: "1px solid #f87171",
            textAlign: "center",
            color: "#fff",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, marginBottom: 2 }}>
              🏆 CONTEST MODE
            </div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              대회 진행 중 · 기록이 랭킹에 반영됩니다
            </div>
          </div>
        )}

        {/* ═══ 플레이 모드 (항상 렌더링, 숨김 처리로 상태 보존) ═══ */}
        <div style={{ display: appMode === "play" ? "block" : "none" }}>
          <PlayMode version={version} currentPlayer={currentPlayer} 
            authUser={authUser}
            isContestMode={isContestMode}
            onReviewPrompt={openReviewForm}
            reviewClickedSessions={reviewClickedSessions}
            onSaveGame={async (gameData) => {
            try {
              const ts = Date.now();
              // 플레이어 있으면 사용, 없으면 "solo" 사용 (user_id 기반으로 저장)
              const playerId = currentPlayer?.id || "solo";
              const playerName = currentPlayer?.name || "개인플레이";
              const key = `game:${playerId}:${ts}`;

              // 🆕 저장자 정보 로그 — 누가 / 언제 / 어떤 세션으로 저장했는지
              const saveLog = {
                savedByUserId: authUser?.id || null,
                savedByEmail: authUser?.email || null,
                savedByNickname: authUser?.user_metadata?.nickname || null,
                savedAt: new Date().toISOString(),
                savedAtTs: ts,
                clientUrl: typeof window !== "undefined" ? window.location.hostname : null,
                userAgent: typeof navigator !== "undefined" ? (navigator.userAgent || "").substring(0, 200) : null,
              };
              console.log("[onSaveGame] 📝 저장자 로그:", saveLog);

              const payload = JSON.stringify({
                ...gameData,
                ts,
                playerId,
                playerName,
                // 🔒 보안 필드: 최상위에 user_id 명시 (본인 검증용)
                // MyHistoryTab에서 다른 사용자 데이터 섞임 방지에 사용
                user_id: authUser?.id || null,
                saveLog,  // 🆕 payload 안에 저장자 정보 심음
                saveHistory: [  // 🆕 수정 이력 배열 (추후 Admin 수정 시에도 append 가능)
                  { ...saveLog, action: "create" }
                ],
              });

              // 🛡️ 즉시 localStorage에 먼저 저장 (데이터 유실 방지)
              // 이러면 Supabase storage가 실패해도 최소한 로컬에는 남음
              try {
                localStorage.setItem(key, payload);
                console.log("[onSaveGame] localStorage 저장 완료 (1차 안전망)");
              } catch (e) {
                console.warn("[onSaveGame] localStorage 저장 실패:", e);
              }

              if (!window.storage || typeof window.storage.set !== "function") {
                console.error("[onSaveGame] window.storage가 없거나 set 함수가 없음 → localStorage만 저장");
                // 그래도 사용자에게는 저장 성공 알림 (localStorage에 저장됨)
                return { key, localOnly: true };
              }

              // 🛡️ 타임아웃 보호 (30초)
              // 첫 저장 시 Supabase가 RLS 정책 검증 + 새 row 생성에 시간이 걸릴 수 있음
              // 여러 기기 동시 접속 시 UPSERT 락으로 무한 대기 방지
              const SAVE_TIMEOUT_MS = 30000;
              console.log(`[onSaveGame] 🔄 Supabase storage.set 호출 (timeout ${SAVE_TIMEOUT_MS/1000}초)...`);
              const saveStartTime = Date.now();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`저장 타임아웃 (${SAVE_TIMEOUT_MS/1000}초)`)), SAVE_TIMEOUT_MS)
              );

              let result;
              try {
                result = await Promise.race([
                  window.storage.set(key, payload),
                  timeoutPromise,
                ]);
                const elapsed = Date.now() - saveStartTime;
                console.log(`[onSaveGame] ✅ Supabase 저장 완료 (${elapsed}ms)`);
              } catch (storageErr) {
                const elapsed = Date.now() - saveStartTime;
                console.error(`[onSaveGame] ❌ storage.set 실패/타임아웃 (${elapsed}ms):`, storageErr.message);
                console.warn("[onSaveGame] ℹ️ localStorage에는 정상 저장됨. 다음 로그인 시 Supabase에 재시도 가능");
                // localStorage에는 이미 저장되어 있음 → 사용자에게 부분 성공 알림
                return { key, localOnly: true, error: storageErr.message };
              }

              // 저장 실패 시 (storage.js v3에서 null 반환)
              if (!result) {
                console.warn("[onSaveGame] storage.set null 반환 → localStorage 폴백");
                return { key, localOnly: true };
              }

              if (currentPlayer && players[currentPlayer.id]) {
                const updated = { ...players, [currentPlayer.id]: { ...players[currentPlayer.id], gamesPlayed: (players[currentPlayer.id].gamesPlayed || 0) + 1 } };
                savePlayers(updated);
              }
              // Phase B Day 2: 게임 저장 후 승급 체크 + 티어 재조회
              setTimeout(() => {
                checkTierUpAfterGame();
                loadUserStats();  // 프로필 탭 통계도 즉시 반영
              }, 1000);
              
              return result;
            } catch (e) {
              console.error("게임 저장 실패:", e);
              return null;
            }
          }} />
        </div>

        {/* ═══ 시뮬레이션 모드 ═══ */}
        {appMode === "sim" && (<>

        {/* 24칸 게임판 미니맵 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, marginBottom: 28, padding: 12, background: "#111118", borderRadius: 16, border: "1px solid #27272a" }}>
          {BOARD.map(cell => {
            const cc = CELL_COLORS[cell.type];
            const highlighted = results && results.some(r => r.pos === cell.pos);
            return (
              <div key={cell.pos} style={{
                background: highlighted ? cc.bg : "#18181b",
                border: `1.5px solid ${highlighted ? cc.border : "#27272a"}`,
                borderRadius: 8, padding: "6px 2px", textAlign: "center",
                opacity: highlighted ? 1 : 0.4, transition: "all 0.3s",
              }}>
                <div style={{ fontSize: 14 }}>{cell.icon}</div>
                <div style={{ fontSize: 8, color: cc.text, fontWeight: 700, marginTop: 2 }}>{cell.pos}</div>
              </div>
            );
          })}
        </div>

        {/* 턴 입력 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, alignItems: "stretch" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#71717a", fontWeight: 700, display: "block", marginBottom: 6 }}>시뮬레이션 턴 수</label>
            <input
              type="number" min={1} max={100} value={turns}
              onChange={e => setTurns(Math.max(1, Math.min(100, +e.target.value)))}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #27272a",
                background: "#18181b", color: "#fafafa", fontSize: 18, fontWeight: 800,
                textAlign: "center", boxSizing: "border-box", outline: "none",
              }}
            />
          </div>
          <button onClick={run} style={{
            padding: "14px 28px", borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#fff",
            fontSize: 16, fontWeight: 800, letterSpacing: 1, whiteSpace: "nowrap",
            alignSelf: "flex-end",
          }}>
            🎲 {version} 시작
          </button>
        </div>

        {/* 결과 요약 */}
        {results && summary && (
          <div ref={resultRef}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 24,
              padding: 16, background: "#111118", borderRadius: 16, border: "1px solid #27272a",
            }}>
              {[
                { label: deck.deal1Name, val: summary.deal1, color: "#10b981" },
                { label: deck.deal2Name, val: summary.deal2, color: "#3b82f6" },
                { label: "MARKET", val: summary.market, color: "#8b5cf6" },
                { label: "타인MKT", val: summary.otherMarket, color: "#a78bfa" },
                { label: "DOODAD", val: summary.doodad, color: "#f59e0b" },
                { label: "월급", val: summary.payday, color: "#22c55e" },
                { label: "기부", val: summary.charity, color: "#a855f7" },
                { label: "베이비", val: summary.baby, color: "#ec4899" },
                { label: "다운사이즈", val: summary.downsized, color: "#ef4444" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 9, color: "#71717a", fontWeight: 700, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* 턴별 결과 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r, i) => {
                const isOther = r.isOtherMarket;
                const cc = CELL_COLORS[r.cell.type] || CELL_COLORS.MARKET;
                const isExpanded = expandedTurn === i;
                return (
                  <div
                    key={i}
                    onClick={() => setExpandedTurn(isExpanded ? null : i)}
                    style={{
                      background: isOther ? "#3b076415" : cc.bg, border: `1.5px solid ${isOther ? "#8b5cf640" : cc.border + "40"}`,
                      borderRadius: 14, padding: isOther ? "10px 16px" : "14px 16px", cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {/* 헤더 */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          background: isOther ? "#8b5cf630" : cc.border + "30", color: isOther ? "#c4b5fd" : cc.text, borderRadius: 8,
                          padding: "4px 10px", fontSize: 12, fontWeight: 800,
                        }}>
                          {isOther ? `T${r.turn}` : `T${r.turn}`}
                        </span>
                        <span style={{ fontSize: isOther ? 16 : 20 }}>{isOther ? "👥" : r.cell.icon}</span>
                        <span style={{ fontSize: isOther ? 12 : 14, fontWeight: 700, color: isOther ? "#a78bfa" : cc.text }}>{isOther ? "타인 마켓카드" : r.cell.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {!isOther && <span style={{ fontSize: 12, color: "#71717a" }}>
                          🎲 {r.dice.join("+")}={r.total} → 칸{r.pos}
                        </span>}
                        {r.dealType && (
                          <span style={{
                            background: r.dealType === deck.deal1Name ? "#10b981" : r.dealType === deck.deal2Name ? "#3b82f6" : r.dealType === "MARKET" || r.dealType === "타인MARKET" ? "#8b5cf6" : "#f59e0b",
                            color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 800,
                          }}>
                            {r.dealType === "타인MARKET" ? "타인MARKET" : r.dealType}
                          </span>
                        )}
                        {/* 구매/판매 뱃지 */}
                        {r.bought && <span style={{ background: "#22c55e30", color: "#86efac", borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 800 }}>구매</span>}
                        {r.sold === true && <span style={{ background: "#f59e0b30", color: "#fde68a", borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 800 }}>판매</span>}
                        {r.sold === false && r.dealType && (r.dealType === "MARKET" || r.dealType === "타인MARKET") && <span style={{ background: "#27272a", color: "#71717a", borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 800 }}>해당없음</span>}
                      </div>
                    </div>

                    {/* 카드 내용 */}
                    {r.card && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cc.border}25` }}>
                        {r.card.sub && (
                          <div style={{ fontSize: 11, color: cc.border, fontWeight: 700, marginBottom: 4 }}>
                            {r.card.sub} {r.card.price || ""} {r.card.sell ? `매각: ${r.card.sell}` : ""} {r.card.amount || ""}
                          </div>
                        )}
                        {r.card.special && (
                          <span style={{ background: "#ef4444", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, marginBottom: 6, display: "inline-block" }}>
                            ⚡ {r.card.special}
                          </span>
                        )}
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: cc.text, margin: "6px 0 0", opacity: 0.9 }}>
                          {r.card.desc}
                        </p>
                        {isExpanded && (r.card.cf || r.card.roi || r.card.down || r.card.condition) && (
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            {r.card.cf && <span style={{ background: "#ffffff10", padding: "4px 10px", borderRadius: 6, fontSize: 11, color: r.card.cf.includes("-") ? "#fca5a5" : "#86efac" }}>CF: {r.card.cf}</span>}
                            {r.card.roi && <span style={{ background: "#ffffff10", padding: "4px 10px", borderRadius: 6, fontSize: 11, color: "#93c5fd" }}>ROI: {r.card.roi}</span>}
                            {r.card.down && <span style={{ background: "#ffffff10", padding: "4px 10px", borderRadius: 6, fontSize: 11, color: "#fde68a" }}>착수금: {r.card.down}</span>}
                            {r.card.condition && <span style={{ background: "#ffffff10", padding: "4px 10px", borderRadius: 6, fontSize: 11, color: "#f9a8d4" }}>{r.card.condition}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 특수 칸 메시지 */}
                    {r.cell.type === "PAYDAY" && (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#86efac", fontWeight: 700 }}>
                        💰 월급날! 월급을 받으세요.
                      </div>
                    )}
                    {r.cell.type === "CHARITY" && (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#d8b4fe", fontWeight: 700 }}>
                        🤝 기부 칸! 기부하면 다음 3턴 동안 주사위 2개 사용 가능.
                      </div>
                    )}
                    {r.cell.type === "BABY" && (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#f9a8d4", fontWeight: 700 }}>
                        👶 아기가 태어났습니다! 양육비가 총지출에 추가됩니다.
                      </div>
                    )}
                    {r.cell.type === "DOWNSIZED" && (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#fca5a5", fontWeight: 700 }}>
                        ⬇️ 다운사이즈! 한 달 총지출을 지불하고 2턴 쉽니다.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 재실행 */}
            <button onClick={run} style={{
              width: "100%", marginTop: 24, padding: 16, borderRadius: 12, border: "1px solid #27272a",
              background: "#18181b", color: "#a1a1aa", cursor: "pointer", fontSize: 14, fontWeight: 700,
            }}>
              🔄 같은 설정으로 다시 시뮬레이션 ({version} · {turns}턴)
            </button>

            {/* 디브리핑 섹션 — 시뮬레이션 모드에서는 제외 (플레이/대회 모드에서만 제공) */}

            {/* ─── 후기 버튼 (Phase A) ─── */}
            {currentSessionId && (
              <div style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 12,
                background: reviewClickedSessions.has(currentSessionId) ? "#14532d20" : "#7c2d1220",
                border: `1px solid ${reviewClickedSessions.has(currentSessionId) ? "#16a34a40" : "#ea580c40"}`,
                textAlign: "center",
              }}>
                {reviewClickedSessions.has(currentSessionId) ? (
                  <>
                    <div style={{ fontSize: 13, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>
                      ✅ 후기를 작성해주셔서 감사합니다!
                    </div>
                    <div style={{ fontSize: 10, color: "#71717a" }}>
                      소중한 의견은 서비스 개선에 반영됩니다.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "#fafafa", fontWeight: 700, marginBottom: 6 }}>
                      💬 시뮬레이션은 어떠셨나요?
                    </div>
                    <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 10 }}>
                      짧은 후기로 더 나은 서비스를 만들어주세요!
                    </div>
                    <button
                      onClick={() => openReviewForm(currentSessionId)}
                      style={{
                        padding: "10px 20px",
                        borderRadius: 8,
                        border: "none",
                        background: "#ea580c",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      📝 후기 작성하기
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        </>)}
      </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   디브리핑 섹션 — 규칙 기반(무료) + Claude API(유료)
═══════════════════════════════════════════════════ */

export function buildPromptText(results, version, turns) {
  const yearPerTurn = Math.round(40 / turns * 10) / 10;
  return results.filter(r => !r.isOtherMarket).map(r => {
    const a = 20 + (r.turn - 1) * Math.floor(40 / turns);
    const t = r.cell?.type;
    if (t === "PAYDAY" || t === "PAYDAY_PASS") return `T${r.turn}(${a}세) 월급`;
    if (t === "CHARITY") return `T${r.turn}(${a}세) 기부→주사위2개×3턴`;
    if (t === "BABY") return `T${r.turn}(${a}세) 베이비`;
    if (t === "DOWNSIZED") return `T${r.turn}(${a}세) 다운사이즈`;
    if (t === "DOWNSIZED_REST") return `T${r.turn}(${a}세) 다운사이즈 휴식(지출없음)`;
    // 자산 탭에서 직접 매각한 케이스 (주식/외부 부동산) - MARKET 카드 매각과 구분
    if (t === "STOCK_SELL") {
      const c = r.card || {};
      const qty = r._shares || c._shares || r.shares || "";
      return `T${r.turn}(${a}세)[주식매각] ${c.sub||""} ${qty}주 ${c.price||""} [자산탭직접매각]`;
    }
    if (t === "EXT_SELL") {
      const c = r.card || {};
      const atype = r.assetType || "부동산";
      return `T${r.turn}(${a}세)[타인마켓매도] ${c.sub||""}(${atype}) [자산탭직접매각]`;
    }
    const c = r.card;
    if (!c) return `T${r.turn}(${a}세) ${r.cell?.label || t}`;

    // 무상증자/감자 카드는 보유 종목에만 적용되는 이벤트 카드임을 명시
    // (AI가 "카드 등장" = "종목 보유"로 오해하지 않도록)
    if (isSplitCard(c)) {
      const label = /감자|1\/2|1\/4/.test((c.special || "") + (c.desc || "")) ? "감자" : "무상증자";
      const applied = r.splitApplied === true;
      const notApplied = r.splitApplied === false || c._action === "na";
      const statusTag = applied ? "[보유중→적용됨]" : notApplied ? "[미보유→해당없음]" : "[이벤트카드]";
      return `T${r.turn}(${a}세)[이벤트] ${c.sub||""} ${label} ${statusTag}`;
    }

    let s = `T${r.turn}(${a}세)[${r.dealType}]${c.sub||""}`;
    if (c.price) s += ` ${c.price}`;
    if (c.cf) s += ` CF${c.cf}`;
    if (c.roi) s += ` ROI${c.roi}`;
    if (c.down) s += ` 착${c.down}`;
    if (c.amount) s += ` ${c.amount}`;
    if (c.special) s += ` !${c.special}`;
    if (c.sell) s += ` 매각${c.sell}`;
    if (c._action) s += ` [${c._action}]`;
    if (c._shares) s += ` ${c._shares}주`;
    if (r.decisionSec != null) s += ` (${r.decisionSec}초결정)`;
    if (r.bought) s += ` [구매]`;
    if (r.sold === true) s += ` [판매]`;
    if (r.sold === false && (r.dealType === "MARKET")) s += ` [해당없음]`;
    // MARKET 매각 시 실제 매각된 자산 정보 명시 (AI 혼동 방지)
    if (r.soldAsset) s += ` ⟨실제매각:${r.soldAsset.name}(${r.soldAsset.type})⟩`;
    return s;
  }).join("\n");
}

function buildCompactSummary(analysis) {
  if (!analysis) return "";
  const ph = (analysis.phases||[]).map(p => `${p.title}(${p.turns}):${p.verdict}`).join("|");
  const ls = (analysis.lessons||[]).map((l,i) => `${i+1}.${l}`).join("|");
  return `[분석요약]${ph}\n[교훈]${ls}\n[질문]${analysis.finalQuestion}`;
}

export const computeBestWorstPaths = (turnLogData, totalTurns) => {
  if (!turnLogData || turnLogData.length === 0) {
    return {
      bestPath: [{ turn: 1, age: 20, cf: 0, asset: 0, note: "기록 없음" }],
      worstPath: [{ turn: 1, age: 20, cf: 0, asset: 0, note: "기록 없음" }],
    };
  }

  // 🔧 results(gameResults) 구조를 turnLog 구조로 변환 (어댑터)
  // results: { turn, cell:{type}, card:{...,_action,_shares}, decisionSec, ... }
  // turnLog: { turn, cellType, card:{...}, action, shares, transaction, ... }
  const normalized = turnLogData.map(t => {
    // 이미 turnLog 구조면 그대로 사용
    if (t.cellType && !t.cell) return t;
    // results 구조면 변환
    return {
      turn: t.turn,
      cellType: t.cell?.type || t.cellType,
      dealType: t.dealType,
      card: t.card ? { ...t.card } : null,
      action: t.card?._action || t.action,
      shares: t.card?._shares || t.shares,
      transaction: t.transaction,
      decisionSec: t.decisionSec,
    };
  });

  const yearsPerTurn = Math.round(40 / Math.max(totalTurns, 1) * 10) / 10;
  const ageAtTurn = (t) => Math.round(20 + (t - 0.5) * yearsPerTurn);

  // 게임 구간 정의 (초반 1/3 / 중반 1/3 / 후반 1/3)
  const earlyThreshold = Math.max(Math.floor(totalTurns / 3), 3);
  const lateThreshold = Math.floor(totalTurns * 2 / 3);
  const isEarly = (turn) => turn <= earlyThreshold;
  const isLate = (turn) => turn >= lateThreshold;

  // 단기 매도 판단을 위해: 매수/매도 매칭
  // cardName → { buyTurn, sold, sellTurn } 매핑
  const assetLifecycle = {};
  normalized.forEach(t => {
    const cardName = t.card?.sub || t.card?.desc || "";
    if (!cardName) return;
    
    if ((t.cellType === "DEAL1" || t.cellType === "DEAL2" || t.cellType === "BIG_DEAL" || t.cellType === "SMALL_DEAL" || t.cellType === "MARKET" || t.cellType === "OPPORTUNITY") && t.action === "buy") {
      if (!assetLifecycle[cardName]) {
        assetLifecycle[cardName] = { buyTurn: t.turn, sold: false, sellTurn: null };
      }
    }
    if (t.action === "sell" || t.cellType === "EXT_SELL" || t.cellType === "STOCK_SELL") {
      if (assetLifecycle[cardName]) {
        assetLifecycle[cardName].sold = true;
        assetLifecycle[cardName].sellTurn = t.turn;
      }
    }
  });

  // 단기 매도 판단 (매수 후 3턴 이내)
  const isShortTermSale = (cardName, sellTurn) => {
    const info = assetLifecycle[cardName];
    if (!info) return false;
    return (sellTurn - info.buyTurn) <= 3;
  };

  // 사업체 판단
  const isBusinessCard = (card) => {
    if (!card) return false;
    const type = card.type || "";
    const sub = (card.sub || "").toLowerCase();
    const desc = (card.desc || "").toLowerCase();
    return (
      type.includes("사업") ||
      type.includes("business") ||
      sub.includes("사업") ||
      sub.includes("business") ||
      sub.includes("startup") ||
      desc.includes("사업") ||
      desc.includes("프랜차이즈") ||
      desc.includes("franchise")
    );
  };

  // 매도 여부를 기준으로 CF 마이너스 자산이 "부채"였는지 판단
  const wasSoldLater = (cardName, buyTurn) => {
    const info = assetLifecycle[cardName];
    return info && info.sold && info.sellTurn > buyTurn;
  };

  // 나이를 턴으로 변환 (40세 기준)
  const isBeforeFortyTurn = (turn) => {
    const age = ageAtTurn(turn);
    return age < 40;
  };

  // 각 턴을 분류
  const classifyTurn = (t, idx) => {
    const action = t.action;
    const cellType = t.cellType;
    const card = t.card || {};
    const cashFlowChange = card.cashflow || 0;
    const roi = card.roi || 0;
    const cardName = card.sub || card.desc || "";

    // ─── DEAL / MARKET 카드 매수 ───
    const isBuyable = ["DEAL1", "DEAL2", "BIG_DEAL", "SMALL_DEAL", "MARKET", "OPPORTUNITY"].includes(cellType);
    
    if (isBuyable && action === "buy") {
      // 사업체 매수 - 항상 최상의 선택 (+ 가중치)
      if (isBusinessCard(card)) {
        return {
          category: "best",
          cfChange: cashFlowChange,
          assetChange: card.cost || card.price || 0,
          reason: `💼 사업체 ${cardName} 매수 (+$${cashFlowChange}/월) — B사분면 진입`,
          weight: 1.5,
        };
      }
      // CF 증가 자산 - 최상의 선택
      if (cashFlowChange > 0) {
        return {
          category: "best",
          cfChange: cashFlowChange,
          assetChange: card.cost || card.price || 0,
          reason: `🏠 ${cardName} 매수 (+$${cashFlowChange}/월)`,
        };
      }
      // CF 마이너스 자산 - 매각 여부로 판단 (Kevin님 철학)
      if (cashFlowChange < 0 || roi < 0) {
        // 초반이면 현금 확보 전략
        if (isEarly(t.turn)) {
          return {
            category: "best",
            cfChange: cashFlowChange,
            assetChange: card.cost || card.price || 0,
            reason: `💡 초반 ${cardName} 매수 — 현금 확보 전략 (CF ${cashFlowChange}/월이지만 OK)`,
          };
        }
        // 나중에 매각했으면 OK (차익 실현 가능)
        if (wasSoldLater(cardName, t.turn)) {
          return {
            category: "best",
            cfChange: cashFlowChange,
            assetChange: card.cost || card.price || 0,
            reason: `✅ ${cardName} 매수 (CF ${cashFlowChange}) — 이후 매각으로 차익 확보`,
          };
        }
        // 끝까지 보유했다면 진짜 부채
        const info = assetLifecycle[cardName];
        const heldToEnd = info && !info.sold;
        if (heldToEnd) {
          return {
            category: "missed",
            cfChange: cashFlowChange,
            assetChange: card.cost || card.price || 0,
            reason: `⚠️ ${cardName} (CF ${cashFlowChange}/월) 끝까지 보유 — 부채를 자산으로 착각`,
          };
        }
        return {
          category: "neutral",
          cfChange: 0,
          assetChange: 0,
          reason: `${cardName} 매수`,
        };
      }
      // 주식 매수 (CF 변화 없음)
      if ((card.type || "").includes("주식") || cardName.toLowerCase().includes("stock")) {
        // 후반부(40세 이후) 주식 투자 - 최악의 선택
        if (isLate(t.turn) || !isBeforeFortyTurn(t.turn)) {
          return {
            category: "missed",
            cfChange: 0,
            assetChange: (card.cost || card.price || 0) * (t.shares || 1),
            reason: `📉 ${cardName} 주식 매수 — 현금흐름 형성 시기에 차익 추구`,
          };
        }
        return {
          category: "neutral",
          cfChange: 0,
          assetChange: (card.cost || card.price || 0) * (t.shares || 1),
          reason: `주식 ${cardName} 매수`,
        };
      }
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: `${cardName} 매수` };
    }

    // ─── 주식/자산 매도 ───
    if (action === "sell" || cellType === "EXT_SELL" || cellType === "STOCK_SELL") {
      const transaction = t.transaction || "";
      const profitMatch = transaction.match(/\+\$?([\d,]+)/);
      const lossMatch = transaction.match(/-\$?([\d,]+)/);
      
      // 40세 이전 매각은 차익 여부 무관하게 긍정적 (Kevin님 철학)
      if (isBeforeFortyTurn(t.turn)) {
        if (profitMatch) {
          const profit = parseInt(profitMatch[1].replace(/,/g, ""), 10);
          return {
            category: "best",
            cfChange: 0,
            assetChange: profit,
            reason: `💰 ${cardName} 매각 +$${profit} — 40세 이전 차익 실현 (더 큰 CF 만들 원금)`,
          };
        }
        if (lossMatch) {
          const loss = parseInt(lossMatch[1].replace(/,/g, ""), 10);
          return {
            category: "best",
            cfChange: 0,
            assetChange: -loss,
            reason: `⚡ ${cardName} 매각 -$${loss} — 빠른 손절, 다음 기회로`,
          };
        }
        return { category: "best", cfChange: 0, assetChange: 0, reason: `${cardName} 매각 — 유연한 의사결정` };
      }
      
      // 단기 매도 (매수 후 3턴 이내) - 차익/손절 무관하게 좋은 선택
      if (isShortTermSale(cardName, t.turn)) {
        if (profitMatch) {
          const profit = parseInt(profitMatch[1].replace(/,/g, ""), 10);
          return {
            category: "best",
            cfChange: 0,
            assetChange: profit,
            reason: `⚡ ${cardName} 단기 매도 +$${profit} — 빠른 차익실현`,
          };
        }
        if (lossMatch) {
          const loss = parseInt(lossMatch[1].replace(/,/g, ""), 10);
          return {
            category: "best",
            cfChange: 0,
            assetChange: -loss,
            reason: `⚡ ${cardName} 단기 정리 -$${loss} — 빠른 의사결정`,
          };
        }
      }
      
      // 40세 이후 일반 매도
      if (profitMatch) {
        const profit = parseInt(profitMatch[1].replace(/,/g, ""), 10);
        return {
          category: "best",
          cfChange: 0,
          assetChange: profit,
          reason: `💰 ${cardName} 매각 +$${profit} 차익`,
        };
      }
      if (lossMatch) {
        const loss = parseInt(lossMatch[1].replace(/,/g, ""), 10);
        return {
          category: "missed",
          cfChange: 0,
          assetChange: -loss,
          reason: `${cardName} 매각 -$${loss} 손실`,
        };
      }
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: `매도` };
    }

    // ─── DOODAD (과소비) - 확실히 나쁜 선택 ───
    if (cellType === "DOODAD") {
      const amount = card.amount || 0;
      // amount는 일회성 지출이지만 시각화 목적으로 작게 cf에도 반영
      // (반복적 소비 패턴의 누적 효과 표현)
      return {
        category: "worst",
        cfChange: -Math.min(50, Math.round(amount / 20)),  // 🆕 amount의 5% 또는 -$50 중 작은 값
        assetChange: -amount,
        reason: `🛒 ${card.desc || "지출"} -$${amount} — 과소비`,
      };
    }

    // ─── CHARITY (기부) - 최상의 선택 ───
    if (cellType === "CHARITY") {
      if (action === "charity_yes") {
        return {
          category: "best",
          cfChange: 0,
          assetChange: -(card.cost || 160),
          reason: `❤️ 기부 선택 — 부자 마인드셋 (주사위 2개 × 3턴)`,
        };
      }
      if (action === "charity_no" || action === "na") {
        return {
          category: "missed",
          cfChange: 0,
          assetChange: 0,
          reason: `기부 기회 패스 — 투자 현금 확보 기회 놓침`,
        };
      }
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: "CHARITY" };
    }

    // ─── DOWNSIZED ───
    if (cellType === "DOWNSIZED" || cellType === "DOWNSIZED_REST") {
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: "다운사이즈 (운)" };
    }

    // ─── BABY ───
    if (cellType === "BABY") {
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: "자녀 (선택 영역 아님)" };
    }

    // ─── PAYDAY (월급) - Kevin님 철학: 저축은 자산 형성의 전 단계 ───
    if (cellType === "PAYDAY") {
      // 초반(20대)의 PAYDAY는 저축 기회로 긍정적 평가
      if (isEarly(t.turn)) {
        return {
          category: "best",
          cfChange: 50,  // 🆕 작은 저축 효과 (시각화용)
          assetChange: 500, // 저축 효과 상징적 표현
          reason: `💵 월급 수령 — 20대 저축은 자산 형성의 씨앗 (과소평가된 습관)`,
        };
      }
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: "PAYDAY" };
    }

    // ─── 기회 패스 ───
    if (isBuyable && (action === "pass" || action === "na" || !action)) {
      const weight = isBusinessCard(card) ? 1.5 : 1.0;
      if (isBusinessCard(card)) {
        return {
          category: "missed",
          cfChange: 0,
          assetChange: 0,
          reason: `💼 ${cardName} 사업체 기회 패스 — B사분면 입장권 포기`,
          weight,
        };
      }
      if (cashFlowChange > 0 || roi > 10) {
        return {
          category: "missed",
          cfChange: 0,
          assetChange: 0,
          reason: `${cardName} 기회 패스 — 좋은 조건이었음`,
          weight,
        };
      }
      // 20대의 기회 패스는 현실적 (돈 없어서) - 저축 단계
      if (isEarly(t.turn)) {
        return {
          category: "neutral",
          cfChange: 0,
          assetChange: 0,
          reason: `${cardName} 패스 — 20대는 저축 단계`,
        };
      }
      return { category: "neutral", cfChange: 0, assetChange: 0, reason: "패스" };
    }

    return { category: "neutral", cfChange: 0, assetChange: 0, reason: "" };
  };

  // 모든 턴 분류
  const classifiedTurns = normalized.map((t, idx) => ({ ...t, ...classifyTurn(t, idx) }));

  // 🆕 Kevin 철학: 연속 무행동 구간 탐지 (기회를 놓치고 시간 흘려보냄)
  // CF+ 자산을 만드는 행동 없이 PAYDAY/DOODAD/패스만 반복된 구간 = 최악
  const detectStagnantPhases = () => {
    const stagnantPhases = [];
    let currentPhaseStart = null;
    let currentPhaseEnd = null;
    let phaseLength = 0;

    classifiedTurns.forEach((t, idx) => {
      const isAction = t.category === "best" && (t.cfChange > 0 || (t.reason || "").includes("사업체") || (t.reason || "").includes("매각"));
      if (isAction) {
        // 기존 구간 종료
        if (phaseLength >= 3) {
          stagnantPhases.push({ start: currentPhaseStart, end: currentPhaseEnd, length: phaseLength });
        }
        currentPhaseStart = null;
        currentPhaseEnd = null;
        phaseLength = 0;
      } else {
        if (currentPhaseStart === null) currentPhaseStart = t.turn;
        currentPhaseEnd = t.turn;
        phaseLength++;
      }
    });
    // 마지막 구간
    if (phaseLength >= 3) {
      stagnantPhases.push({ start: currentPhaseStart, end: currentPhaseEnd, length: phaseLength });
    }
    return stagnantPhases;
  };
  const stagnantPhases = detectStagnantPhases();

  // 🆕 대출 증가 감지 (bankLoan 필드 추적)
  // turnLog에 bankLoan이 있으면 변화 추적
  const loanGrowthTurns = [];
  let prevLoan = 0;
  normalized.forEach(t => {
    const curLoan = t.bankLoan || t.loanAfter || 0;
    if (curLoan > prevLoan + 500) { // 500 이상 증가
      loanGrowthTurns.push({
        turn: t.turn,
        age: ageAtTurn(t.turn),
        loanDelta: curLoan - prevLoan,
        hasCFAsset: t.category === "best" && t.cfChange > 0,
      });
    }
    prevLoan = curLoan;
  });

  // Best Path: "최상의 선택"만 누적 (+ 가중치 반영)
  // Worst Path: "최악의 선택" + "나쁜 선택" 누적
  let bestCF = 0, bestAsset = 0;
  let worstCF = 0, worstAsset = 0;

  const bestPath = [];
  const worstPath = [];

  classifiedTurns.forEach((t) => {
    const weight = t.weight || 1.0;
    
    if (t.category === "best") {
      bestCF += t.cfChange * weight;
      bestAsset += t.assetChange * weight;
      bestPath.push({
        turn: t.turn,
        age: ageAtTurn(t.turn),
        cf: Math.round(bestCF),
        asset: Math.round(bestAsset),
        note: t.reason,
      });
    } else if (t.category === "missed" || t.category === "worst") {
      worstCF += t.cfChange * weight;
      worstAsset += t.assetChange * weight;
      worstPath.push({
        turn: t.turn,
        age: ageAtTurn(t.turn),
        cf: Math.round(worstCF),
        asset: Math.round(worstAsset),
        note: t.reason,
      });
    }
  });

  // 🆕 정체 구간을 worstPath에 추가 (가장 긴 정체만 대표로)
  if (stagnantPhases.length > 0) {
    const longest = stagnantPhases.reduce((a, b) => (b.length > a.length ? b : a));
    if (longest.length >= 3) {
      const midTurn = Math.floor((longest.start + longest.end) / 2);
      worstPath.push({
        turn: midTurn,
        age: ageAtTurn(midTurn),
        cf: Math.round(worstCF),
        asset: Math.round(worstAsset),
        note: `⏳ T${longest.start}~T${longest.end} (${longest.length}턴) 무행동 — 월급만 받고 자산 매수 0건`,
      });
    }
  }

  // 🆕 부채 증가 + CF 자산 없는 경우 worstPath에 추가
  loanGrowthTurns.filter(l => !l.hasCFAsset).forEach(l => {
    worstPath.push({
      turn: l.turn,
      age: l.age,
      cf: Math.round(worstCF),
      asset: Math.round(worstAsset - l.loanDelta),
      note: `💳 대출 $${l.loanDelta.toLocaleString()} 증가 — CF 자산 없는 대출은 부채`,
    });
  });

  // 🆕 worstPath는 turn 순서로 재정렬 (정체/대출을 중간에 삽입했기 때문)
  worstPath.sort((a, b) => a.turn - b.turn);

  // 경로가 없으면 기본값 (시작점 추가)
  const addStartPoint = (path) => {
    if (path.length === 0 || path[0].turn > 1) {
      path.unshift({ turn: 1, age: 20, cf: 0, asset: 0, note: "출발 (20세)" });
    }
    return path;
  };

  // 종료점 추가 (마지막 턴까지 이어지도록)
  const addEndPoint = (path, lastCF, lastAsset) => {
    if (path.length > 0 && path[path.length - 1].turn < totalTurns) {
      path.push({
        turn: totalTurns,
        age: ageAtTurn(totalTurns),
        cf: Math.round(lastCF),
        asset: Math.round(lastAsset),
        note: `${ageAtTurn(totalTurns)}세 — 누적 결과`,
      });
    }
    return path;
  };

  addStartPoint(bestPath);
  addStartPoint(worstPath);
  addEndPoint(bestPath, bestCF, bestAsset);
  addEndPoint(worstPath, worstCF, worstAsset);

  // 모두 중립이면 기본 값 (교육적 메시지)
  if (bestPath.length <= 2 && worstPath.length <= 2 && bestCF === 0 && worstCF === 0 && bestAsset === 0 && worstAsset === 0) {
    return {
      bestPath: [
        { turn: 1, age: 20, cf: 0, asset: 0, note: "출발 (20세)" },
        { turn: Math.floor(totalTurns / 3), age: ageAtTurn(Math.floor(totalTurns / 3)), cf: 100, asset: 5000, note: "저축 + 첫 자산 매수" },
        { turn: Math.floor(totalTurns / 2), age: ageAtTurn(Math.floor(totalTurns / 2)), cf: 300, asset: 15000, note: "현금흐름 자산 확장" },
        { turn: Math.floor(totalTurns * 2 / 3), age: ageAtTurn(Math.floor(totalTurns * 2 / 3)), cf: 600, asset: 35000, note: "사업체 매수 (B사분면)" },
        { turn: totalTurns, age: ageAtTurn(totalTurns), cf: 1000, asset: 60000, note: "다양한 행동이 있었다면" },
      ],
      worstPath: [
        { turn: 1, age: 20, cf: 0, asset: 0, note: "출발 (20세)" },
        { turn: Math.floor(totalTurns / 3), age: ageAtTurn(Math.floor(totalTurns / 3)), cf: 0, asset: 0, note: "저축도 투자도 없음" },
        { turn: Math.floor(totalTurns / 2), age: ageAtTurn(Math.floor(totalTurns / 2)), cf: 0, asset: 0, note: "기회 계속 패스" },
        { turn: totalTurns, age: ageAtTurn(totalTurns), cf: 0, asset: 0, note: "행동 없이 시간만 흘렀다면" },
      ],
    };
  }

  // 경로 압축: 의미있는 turning points 유지하며 6-7개로
  const compressPath = (path) => {
    if (path.length <= 7) return path;
    
    // 첫 점, 마지막 점은 보존
    const first = path[0];
    const last = path[path.length - 1];
    const middle = path.slice(1, -1);
    
    // 중간 점 중 "변화량이 큰" 순으로 5개 선택
    const withDelta = middle.map((p, i) => {
      const prev = i === 0 ? first : middle[i - 1];
      const delta = Math.abs((p.cf - prev.cf) * 100) + Math.abs(p.asset - prev.asset);
      return { ...p, _delta: delta };
    });
    
    // 변화량 top 5 선택 후 턴 순서로 재정렬
    const topChanges = withDelta
      .sort((a, b) => b._delta - a._delta)
      .slice(0, 5)
      .sort((a, b) => a.turn - b.turn);
    
    return [first, ...topChanges.map(({ _delta, ...p }) => p), last];
  };

  return {
    bestPath: compressPath(bestPath),
    worstPath: compressPath(worstPath),
  };
};


// ═══════════════════════════════════════════════════
// 🎯 runFullAnalysis: 디브리핑 풀 분석 (export, 컴포넌트 외부에서 호출 가능)
// ═══════════════════════════════════════════════════
// 입력: simText (buildPromptText 결과), version, turns, results (turnLog)
// 출력: analysis 객체 (phases, lessons, bestPath, worstPath, finalQuestion, timeAnalysis)
// 에러 시 throw
//
// 사용처:
// - DebriefSection.runAnalysis() 내부 (기존)
// - MyHistoryTab.handleDebrief() 외부 (신규)
export async function runFullAnalysis({ simText, version, turns, results }) {
  if (!simText || !version || !turns || !results) {
    throw new Error("runFullAnalysis: 필수 인자 누락");
  }
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    throw new Error("브라우저 환경에서만 호출 가능합니다.");
  }

  // 🆕 60초 timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  console.log(`[runFullAnalysis] API 호출 시작 — simText 길이=${(simText || "").length}`);

  let response;
  try {
      response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL_SONNET,
          max_tokens: 8192,
          system: `You are a CashFlow board game coaching expert (13 years, 5000+ sessions), deeply grounded in Robert Kiyosaki's teachings and Kevin's Korean educational experience. Respond with ONLY valid JSON. No markdown, no code blocks, no text before or after. Start with { end with }. No trailing commas. Korean content.

CRITICAL INTERPRETATION RULES:
- [이벤트] tag = event card (stock split/reverse split). Card appearance does NOT mean asset ownership.
- [미보유→해당없음] = player did NOT own the stock, so event did NOT apply. Do NOT count as asset.
- [보유중→적용됨] = player DID own the stock, so share count changed.
- Asset ownership is determined ONLY by [구매] tag on deal cards (SMALL DEAL/BIG DEAL/Capital Gain/CashFlow Deal).

═══════════════════════════════════════════════════
🎓 KIYOSAKI PHILOSOPHY (내재화하여 분석에 자연스럽게 녹일 것):

이것은 프롬프트에 인용하거나 "기요사키가 말했다"라고 표현하는 것이 아닙니다.
이 철학을 "당신의 관점"으로 완전히 내재화하여, 모든 분석과 조언에 자연스럽게 배어들게 하세요.

### 기본 10대 철학

1. **ESBI 사분면**
   - E(직장인): 안정 추구, 돈을 위해 일함 → "월급의 함정"
   - S(자영업): 독립적이나 여전히 시간을 팔고 있음
   - B(사업체 소유): 시스템을 가짐, 돈이 일하게 함 → 진정한 자유의 시작
   - I(투자자): 돈이 돈을 낳게 함 → 부의 완성
   → 사업체 카드는 단순한 게임 요소가 아니라 "B사분면으로 건너가는 다리"

2. **자산 vs 부채의 정의**
   - 자산 = 주머니에 돈을 넣어주는 것 (CF +)
   - 부채 = 주머니에서 돈을 빼가는 것 (CF -)
   - 많은 사람이 "자산"이라 믿는 집/차가 실은 부채
   → CF 증가 매수 = 진짜 자산 획득의 순간

3. **현금흐름이 왕**
   - 자본이익(시세차익)은 일회성, 현금흐름은 지속
   - 진짜 부 = passive income이 지출을 넘어서는 순간
   - 주식 매매 차익보다 부동산/사업체의 월 현금흐름이 우선
   → 후반부 주식 매수는 "현금흐름 구축 기회"를 놓친 것

4. **부자는 덜 일하고 더 번다** — 돈의 방향을 바꾸는 것이 핵심

5. **기부의 역설**
   - "주면 돌아온다"는 단순 미덕이 아닌 부의 기술
   - 기부는 현금흐름을 막지 않음 → 오히려 기회를 확장
   - 움츠러드는 사고방식 vs 풍요의 사고방식
   → 기부 선택 = 부자 마인드셋의 증거

6. **실수는 교육** — 빠른 실패 > 느린 성공

7. **두려움과 기회** — 두려움 때문에 기회를 놓친다 → 패스는 굴복

8. **좋은 빚 vs 나쁜 빚**
   - 나쁜 빚: 소비(DOODAD)를 위한 빚
   - 좋은 빚: 자산 매수를 위한 빚 → 다른 사람이 내 빚을 갚아줌

9. **금융 교육의 부재** — 캐쉬플로우 게임 = 자기 자신을 가르치는 가장 좋은 도구

10. **행동이 전부** — "다음 게임에서 어떻게 다르게 할 것인가"가 진짜 학습

═══════════════════════════════════════════════════
💼 핵심 영역 1: 사업가 정신 / 기업가 사고

### 사업 vs 직업의 근본적 차이
- 직업: 내가 없으면 돈이 안 들어옴 (시간-돈 교환)
- 사업: 내가 없어도 돈이 들어옴 (시스템이 일함)
- 캐쉬플로우 게임의 사업체 카드 = "시스템 소유"의 시작

### 기업가의 핵심 사고방식
- **문제 = 기회**: 남들이 불평할 때, 기업가는 해결책을 만든다
- **실패 = 데이터**: 실패는 끝이 아니라 배움의 시작
- **리스크는 계산되는 것**: 무모함이 아닌 계산된 도전
- **다른 사람의 돈(OPM)**: 내 돈이 아닌, 시스템과 레버리지
- **다른 사람의 시간(OPT)**: 고용과 협업의 힘

### 사업체를 평가하는 기준
- 현금흐름 크기보다 "시스템이 얼마나 자동화되어 있는가"
- ROI도 중요하지만 "내 시간이 얼마나 필요한가"가 더 중요
- 시장의 방향성 vs 반짝 트렌드 구분

### 게임에서의 적용
- 사업체 매수 = B사분면 입장권 = 가장 가치 있는 선택
- 사업체 패스 = "나는 아직 준비 안 됐어"의 두려움 표현
- 첫 번째 사업체 = 가장 큰 심리적 장벽

═══════════════════════════════════════════════════
🎮 핵심 영역 2: 보드게임과 인생의 연결

### 캐쉬플로우 게임의 진짜 목적
- 이기기 위함이 아니라 "자신의 금융 사고방식을 발견하기 위함"
- 게임판 위에서의 선택 = 실제 삶의 선택 패턴의 거울
- 승리보다 "왜 그 선택을 했는가"가 중요

### 매 게임이 "인생 예행연습"
- 20대의 선택을 60대에 복기할 수는 없다
- 하지만 게임에서는 40년을 2시간에 압축해서 살아볼 수 있음
- 한 판 = 한 번의 인생 시뮬레이션

### 실패해도 안전한 배움
- 실제 돈 잃지 않고 금융 근육 훈련
- 실수할수록 더 가치 있는 게임
- "진짜 돈"을 잃기 전에 "게임 돈"으로 배우기

### 반복의 힘
- 한 번 하면 재미, 열 번 하면 통찰, 백 번 하면 체득
- 매번 다른 카드 조합 → 매번 새로운 교훈
- 반복할수록 나오는 "나만의 패턴" 인식

### 디브리핑의 가치
- 게임 자체보다 게임 후 성찰이 더 큰 배움
- "내가 왜 그 순간 패스했지?" 같은 질문
- 무의식적 패턴의 의식화

═══════════════════════════════════════════════════
🤝 핵심 영역 3: 공동체 / 팀 / 네트워크

### 혼자 vs 함께의 차이
- 혼자 공부 = 지식
- 함께 공부 = 변화 + 지식
- 부자들은 반드시 네트워크 안에서 자란다

### 부자들의 인맥 특성
- 같은 방향으로 성장하려는 사람들
- 서로 기회를 공유하는 관계
- "끌어올리는" 관계 vs "끌어내리는" 관계

### 코칭딜러/모임의 가치
- 혼자 게임해도 배움이 있지만, 함께하면 10배
- 다른 사람의 선택을 보며 배우기
- 자신의 사각지대 발견
- 가르치면서 배우는 원리 (가장 깊은 학습)

### 한국적 맥락
- 한국인은 공동체 학습에 강함
- 단 "비교"가 아닌 "동행"이 되어야 함
- Kevin의 캐쉬플로우 모임 = 금융 공동체 선언

### 왜 혼자 하면 안 되는가
- 자기 관점에 갇힘
- 지속성 떨어짐
- 동기 부여 한계
→ 진짜 변화는 공동체 안에서

═══════════════════════════════════════════════════
💰 핵심 영역 4: 패시브 인컴 구축 단계

### 쥐 레이스 탈출의 수학
- 단순 공식: **패시브 인컴 > 총 지출**
- 하지만 실행은 복잡: 자산 구축 + 지출 관리 + 시간

### 패시브 인컴 구축 단계 (0 → 10)
**0단계**: 월급 의존 (대부분의 직장인)
**1단계**: 지출 < 수입 (저축 시작)
**2단계**: 첫 자산 매수 (소액 부동산/주식)
**3단계**: 다수 자산 확보 (분산)
**4단계**: 월 $100 패시브 인컴
**5단계**: 월 $500 패시브 인컴
**6단계**: 월 $1,000 패시브 인컴 (의미있는 전환점)
**7단계**: 패시브 인컴이 지출의 50% (쥐 레이스 중반 탈출)
**8단계**: 패시브 인컴 = 지출 (쥐 레이스 탈출!)
**9단계**: 패시브 인컴 > 지출 (자유 + 저축)
**10단계**: 패시브 인컴이 지출의 10배 (완전한 자유)

### 각 단계의 핵심 과제
- 0→1: 지출 통제 (DOODAD 피하기)
- 1→2: 첫 투자의 두려움 극복
- 2→4: 반복 + 확장 (매월 저축 → 매년 자산)
- 4→6: 레버리지 사용 (부동산/대출)
- 6→8: 사업체 매수 (B사분면 진입)
- 8→10: 투자가로 전환 (I사분면)

### 게임에서의 매핑
- 초반 몇 턴: 0→2단계 (기초 쌓기)
- 중반: 3→5단계 (자산 확대)
- 후반: 6→8단계 (쥐 레이스 탈출 시도)
- 쥐 레이스 탈출 = 8단계 완성

### 시간의 중요성
- 단계 건너뛰기 불가능
- 하지만 단계 밟는 속도는 선택 가능
- 평균 수십 년 → 전략적으로 10~15년 가능

═══════════════════════════════════════════════════
🏠 기타 영역: 부동산 투자 원칙
- 현금흐름이 주, 시세차익은 보너스
- 레버리지의 현명한 사용 (본인 자본 적게, 은행 자본 많이)
- 입지 + 임대 수요 평가
- 한국: "전세 신화"의 함정 — 진짜 자산은 월세가 꾸준히 들어오는 것

📈 기타 영역: 주식 투자 원칙
- 트레이딩(단기) vs 인베스팅(장기)
- 차익 실현 매도 = 단기 자본이익
- 배당주 = 소액 패시브 인컴
- 주식은 "자산"이 되기 어려움 — 현금흐름이 약함
- 후반부 주식 투자 = 현금흐름 구축 기회 상실

💸 기타 영역: 세금과 법인
- 개인 소득세 vs 법인세
- 부자들의 "합법적 절세" 전략
- 한국: 종합소득세와 양도세 이해
- 법인 설립 타이밍

🙏 기타 영역: 멘토링 / 교육자
- 혼자 배우기의 한계
- 좋은 멘토는 10년 단축
- 가르치면서 배우는 원리 (강사가 더 배움)
- Kevin의 13년 코칭 경험 반영

⏰ 기타 영역: 시간 vs 돈의 관계
- 시간은 유한, 돈은 무한
- 복리의 힘 (일찍 시작 > 많이 투자)
- 40년이라는 프레임: 20세 시작 vs 30세 시작의 차이
- 시간을 줄이는 것 = 집중 + 레버리지

📊 기타 영역: 인플레이션과 통화
- 현금 보유의 숨은 비용 (매년 가치 감소)
- 인플레이션 방어: 부동산, 금, 우량 주식
- 한국의 부동산 집중 = 인플레이션 직관적 대응

═══════════════════════════════════════════════════
🇰🇷 한국 맥락 (Kevin의 13년 교육 경험):

### Kevin의 핵심 통찰 (13년, 5,000회 강의)
- 한국 직장인의 금융 사각지대
- 부동산 과신 vs 현금흐름 무지
- "월급 = 안정"이라는 신화
- 창업 두려움이 강한 문화적 배경
- 평범한 사람도 가능한 현실적 전략

### 한국인 특유의 함정
- 강남 아파트 신화 (자본이익 중독)
- "공무원이 최고" 사고방식
- 금융 = 어렵고 위험하다는 선입견
- 돈 이야기의 터부시 (가정/친구 사이에서)
- 빠른 결과 기대 (복리 이해 부족)

### 공동체 학습의 힘
- Kevin의 5,000회 강의 = 공동체 기반
- 혼자 가면 빨리, 함께 가면 멀리
- 서로의 선택을 보며 배우기
- 비교가 아닌 동행

### 행동 우선 철학
- "완벽한 계획 세우다 평생 간다"
- "먼저 시작하고 배워라"
- 작은 실행이 모든 변화의 시작

═══════════════════════════════════════════════════
🎯 SELECTION EVALUATION GUIDE (국제캐쉬플로우강사협회 13년):

### Kevin의 핵심 교육 원칙 (13년 현장에서 정립)

1. **20대 초반의 저축은 자산 형성의 씨앗**
   - 20대에는 좋은 기회가 와도 현금이 없어 잡을 수 없음
   - 저축은 과소평가되지만 자산 축적의 직전 단계
   - 20대의 PAYDAY/월급 = "씨앗 모으는 시간"
   - 기회를 패스하는 것도 돈 없으면 어쩔 수 없는 선택 (자책 X)

2. **40대 이전 매각은 CF 감소여도 최상의 선택**
   - 젊을 때는 시세차익으로 원금 확보가 더 중요
   - 차익으로 더 큰 CF 자산을 살 수 있기 때문
   - "현금흐름만이 답"은 아님 — 시기별 전략 다름
   - 차익 실현 = 다음 도약을 위한 발판

3. **CF 마이너스 자산의 재평가**
   - CF 마이너스 = 항상 나쁜 것이 아님
   - 매각 가능성이 있다면 투자 기회
   - 끝까지 보유만 "진짜 부채" (20년 CF-$100 = -$24,000)
   - 매각 타이밍이 핵심

### 분류 기준

1. 최상의 선택 (encourage, celebrate):
   - 사업체(Business/Startup/프랜차이즈) 매수 → B사분면 진입 (가중치 ↑)
   - 기부 선택 → 부자 마인드셋
   - CF 증가 자산 매수 → 진짜 자산 획득
   - 40세 이전 자산 매각 → 차익 실현 (더 큰 CF 만들 원금)
   - CF 마이너스 자산 매수 후 나중에 매각 → 유연한 전략
   - 초반 CF 마이너스 자산 매수 → 현금 확보 전략
   - 매수 후 단기 매도 (3턴 이내) → 빠른 의사결정
   - 20대 PAYDAY = 저축 (자산 형성의 씨앗)

2. 최악의 선택 ("최악"이라는 단어 사용 가능 - 직설적 피드백):
   ⚠️ 최악의 선택의 핵심 2가지 유형:
   
   A) **기회를 잡지 않고 시간을 흘려보내는 선택** (가장 치명적):
      - 좋은 기회(CF+ 자산)를 패스 → "가만히 있기"가 가장 큰 손실
      - 사업체 기회 놓침 → B사분면 입장권 포기 (가중치 ↑)
      - 기부 기회 패스 → 부자 마인드셋 학습 기회 상실
      - 여러 턴 동안 아무 자산도 매수하지 않음 → "월급만 기다리는 삶"
      - 후반부(40세+) 주식 매매만 → 현금흐름 파이프라인 구축 실패
   
   B) **부채를 계속 늘리는 선택**:
      - DOODAD 과소비 → 주머니에서 돈이 빠져나감
      - CF 마이너스 자산을 "끝까지" 보유 → 부채를 자산으로 착각
      - 대출을 늘려도 그 돈으로 CF 자산을 만들지 않음
      - 소비성 대출 (차, 집 등 CF 없는 자산)

3. 중립:
   - 자녀 추가 (BABY) → 선택 영역 아님
   - 다운사이즈 (DOWNSIZED) → 운의 영역
   - 20대 기회 패스 (자금 부족) → 현실적 한계 (저축 단계)

TONE: 따뜻하지만 직설적. 기요사키식 명확한 피드백. "최악의 선택"을 부드럽게 포장하지 말 것. 기회를 놓친 것과 부채를 늘린 것은 분명히 지적. 단, 자책으로 이어지지 않게 "다음엔 어떻게"로 연결.

교육 목적: 
- 구체적 행동 변화 제안
- 기요사키 철학 자연스럽게 녹이기
- 20대의 저축도 인정
- 유연한 전략 (CF vs 차익)
- 시기별 다른 관점

WRITING STYLE:
- 기요사키 철학을 "당신의 시선"으로 녹여내세요 (인용 표현 금지)
- "기요사키가 말했다" / "책에서 배웠듯" 같은 표현 사용 X
- 대신 그 철학이 분석 자체에 배어있게
- 한국 맥락과 Kevin의 교육 관점을 자연스럽게 반영
- 구체적 게임 데이터와 철학을 연결
- Kevin의 강의장에서 수강생에게 직접 들려주는 것처럼

예시:
  ❌ "기요사키는 B사분면이 부의 시작이라 말했다"
  ✅ "35세, 당신은 월급이라는 파이프를 타던 시기에서 
      직접 파이프를 만드는 사람으로 건너간 순간입니다"
  ✅ "20대의 저축은 눈에 띄지 않지만, 
      30대에 첫 자산을 살 수 있게 해주는 씨앗입니다"
  ✅ "32세에 매각하며 CF+$130을 놓친 것처럼 보이지만,
      그 차익으로 더 큰 기회를 노릴 수 있다면 좋은 선택입니다"
═══════════════════════════════════════════════════`,
          messages: [{
            role: "user",
            content: `Analyze this CashFlow ${version} game (${turns} turns). 
CRITICAL: Map ALL ${turns} turns proportionally to a 40-year life (age 20~60). 1 turn = ${Math.round(40/turns*10)/10} years.
${turns <= 10 ? `This is a SHORT game (${turns} turns). Even with few turns, map the full 40-year life journey. Fewer actions = more untapped potential. The coaching insight is: "What could you have done differently? What opportunities did you miss? The real game — and real life — rewards those who ACT, explore diverse strategies, and broaden their perspective."` : ""}

SIMULATION DATA:
${simText}

Return EXACTLY this JSON:
{
  "phases": [
${turns <= 8 ? `    {"title": "출발과 탐색", "age": "20~30세", "turns": "T1~T${Math.ceil(turns*0.3)}", "cards": "what happened", "verdict": "insight"},
    {"title": "선택의 갈림길", "age": "30~40세", "turns": "T${Math.ceil(turns*0.3)+1}~T${Math.ceil(turns*0.6)}", "cards": "what happened", "verdict": "insight"},
    {"title": "결과와 교훈", "age": "40~60세", "turns": "T${Math.ceil(turns*0.6)+1}~T${turns}", "cards": "what happened and what was missed", "verdict": "insight about unexplored opportunities"}`
  : turns <= 12 ? `    {"title": "사회 초년생", "age": "20~30세", "turns": "T1~T${Math.ceil(turns*0.25)}", "cards": "summary", "verdict": "insight"},
    {"title": "자산 형성기", "age": "30~38세", "turns": "T${Math.ceil(turns*0.25)+1}~T${Math.ceil(turns*0.5)}", "cards": "summary", "verdict": "insight"},
    {"title": "성장과 전환", "age": "38~46세", "turns": "T${Math.ceil(turns*0.5)+1}~T${Math.ceil(turns*0.75)}", "cards": "summary", "verdict": "insight"},
    {"title": "수확과 정리", "age": "46~60세", "turns": "T${Math.ceil(turns*0.75)+1}~T${turns}", "cards": "summary", "verdict": "insight"}`
  : `    {"title": "사회 초년생", "age": "20~28세", "turns": "T1~T${Math.ceil(turns*0.2)}", "cards": "summary", "verdict": "insight"},
    {"title": "자산 형성기", "age": "28~36세", "turns": "T${Math.ceil(turns*0.2)+1}~T${Math.ceil(turns*0.4)}", "cards": "summary", "verdict": "insight"},
    {"title": "성장과 위기", "age": "36~44세", "turns": "T${Math.ceil(turns*0.4)+1}~T${Math.ceil(turns*0.6)}", "cards": "summary", "verdict": "insight"},
    {"title": "성숙과 전환", "age": "44~52세", "turns": "T${Math.ceil(turns*0.6)+1}~T${Math.ceil(turns*0.8)}", "cards": "summary", "verdict": "insight"},
    {"title": "수확과 정리", "age": "52~60세", "turns": "T${Math.ceil(turns*0.8)+1}~T${turns}", "cards": "summary", "verdict": "insight"}`}
  ],
  "bestPath": [{"turn":1,"age":20,"cf":0,"asset":0,"note":"최선"}],
  "worstPath": [{"turn":1,"age":20,"cf":0,"asset":0,"note":"최악"}],
  "lessons": ["lesson1", "lesson2", "lesson3", "lesson4", "lesson5"],
  "finalQuestion": "debriefing question",
  "timeAnalysis": {
    "holdingPeriods": [{"asset":"name","buyTurn":1,"buyAge":20,"holdTurns":5,"holdYears":10,"totalCF":0,"insight":"analysis"}],
    "decisionSpeed": [],
    "opportunityCost": "one sentence",
    "timeMessage": "core message about time and assets"
  }
}

RULES:
- phases: distribute ALL turns across phases proportionally. Empty phases should note "이 시기에는 행동이 없었다 — 기회를 놓치고 있었다" as verdict
- bestPath/worstPath: 간단히 placeholder만 넣으세요 (코드에서 실제 데이터로 대체됨). 3~4개 entry로 충분.
- lessons: 5 insights. For short games, emphasize: "다양한 전략 탐색", "행동의 중요성", "관점을 넓히는 것이 진짜 게임의 시작"
- finalQuestion: thought-provoking, encourage action and broader perspective
- timeAnalysis.timeMessage: emphasize that assets need TIME, and that the real wealth comes from taking action and exploring diverse approaches`
          }]
        })
      });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === "AbortError") {
      throw new Error("분석 응답 시간 초과 (60초). 네트워크를 확인하거나 다시 시도해주세요.");
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);
  console.log(`[runFullAnalysis] API 응답 수신 — status=${response.status}`);

  try {
      // HTTP 에러 체크
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.error("API HTTP error:", response.status, errBody.substring(0, 300));
        throw new Error(`API 오류 (${response.status}). 잠시 후 다시 시도해주세요.`);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.error("Response JSON parse failed:", jsonErr);
        throw new Error("API 응답 형식 오류. 재시도해주세요.");
      }

      if (data.content && data.content.length > 0) {
        const raw = data.content.filter(c => c.type === "text").map(c => c.text).join("");
        let jsonStr = raw;
        // 코드블록 제거
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        // JSON 시작/끝 위치 찾기
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        // trailing comma 제거
        jsonStr = jsonStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");

        // 잘린 JSON 보정
        let openBrackets = 0, openBraces = 0;
        for (const c of jsonStr) {
          if (c === '{') openBraces++;
          else if (c === '}') openBraces--;
          else if (c === '[') openBrackets++;
          else if (c === ']') openBrackets--;
        }
        if (openBrackets > 0 || openBraces > 0) {
          const lastValid = Math.max(jsonStr.lastIndexOf('"'), jsonStr.lastIndexOf('}'), jsonStr.lastIndexOf(']'));
          if (lastValid > 0) jsonStr = jsonStr.substring(0, lastValid + 1);
          jsonStr = jsonStr.replace(/,\s*$/, "");
          for (let b = 0; b < openBrackets; b++) jsonStr += "]";
          for (let b = 0; b < openBraces; b++) jsonStr += "}";
        }

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.phases && parsed.lessons) {
            // 🎯 Best/Worst 경로를 코드 계산값으로 덮어쓰기 (외부 export 함수 사용)
            const computed = computeBestWorstPaths(results, turns);
            parsed.bestPath = computed.bestPath;
            parsed.worstPath = computed.worstPath;
            console.log("[runFullAnalysis] Best/Worst 경로 재계산 완료");
            return parsed;  // ✅ 성공: analysis 객체 반환
          } else {
            throw new Error("분석 구조가 올바르지 않습니다. 재시도해주세요.");
          }
        } catch (parseErr) {
          if (parseErr.message.includes("분석 구조")) throw parseErr;
          console.error("JSON parse error:", parseErr);
          console.error("Raw (first 300):", raw.substring(0, 300));
          throw new Error(`AI 응답 파싱 실패 (${raw.length}자). 재시도해주세요.`);
        }
      } else if (data.error) {
        console.error("API error:", data.error);
        throw new Error(data.error.message || "API 오류가 발생했습니다.");
      } else {
        console.error("Unexpected response:", JSON.stringify(data).substring(0, 300));
        throw new Error("예상치 못한 응답 형식입니다. 재시도해주세요.");
      }
  } catch (processErr) {
    // fetch 성공 후 처리 단계 에러 재throw
    throw processErr;
  }
}


// ═══════════════════════════════════════════════════
// 🎨 AnalysisReport: 디브리핑 풀 분석 렌더링 (export, 재사용 가능)
// ═══════════════════════════════════════════════════
// 사용처: DebriefSection 내부 + MyHistoryTab의 모달
export function AnalysisReport({ analysis, turns }) {
const [bestWorstTab, setBestWorstTab] = useState("cf");
const phaseColors = ["#10b981","#3b82f6","#8b5cf6","#f59e0b","#ef4444"];
if (!analysis) return null;
  const bp = analysis.bestPath || [];
  const wp = analysis.worstPath || [];
  const hasPaths = bp.length > 0 && wp.length > 0;

  // 🔧 턴 시간축 기반으로 bp/wp 정합성 맞추기
  const allTurns = Array.from(new Set([
    ...bp.map(b => b.turn),
    ...wp.map(w => w.turn),
  ])).sort((a, b) => a - b);

  // ageAtTurn 공식: 40년을 totalTurns로 나누기 (computeBestWorstPaths와 동일)
  const yearsPerTurn = Math.round(40 / Math.max(turns, 1) * 10) / 10;
  const ageAtTurnUI = (t) => Math.round(20 + (t - 0.5) * yearsPerTurn);

  // 각 턴에서 가장 최근(이전까지 누적된) 값 추출 헬퍼
  const getValueAtTurn = (path, turn) => {
    // 누적값만 반환 (age는 턴 기반으로 다시 계산)
    let cf = 0, asset = 0, note = "";
    for (const p of path) {
      if (p.turn <= turn) {
        cf = p.cf || 0;
        asset = p.asset || 0;
        note = p.note || "";
      } else break;
    }
    return { cf, asset, note };
  };

  // 통합 시간축 데이터
  const unifiedRows = allTurns.map(turn => {
    const b = getValueAtTurn(bp, turn);
    const w = getValueAtTurn(wp, turn);
    const bEvent = bp.find(p => p.turn === turn);
    const wEvent = wp.find(p => p.turn === turn);
    return {
      turn,
      age: ageAtTurnUI(turn),  // 🔧 올바른 공식으로 계산
      bCF: b.cf,
      bAsset: b.asset,
      wCF: w.cf,
      wAsset: w.asset,
      bNote: bEvent?.note || "",
      wNote: wEvent?.note || "",
    };
  });

  // 🔍 진단: bp/wp 데이터 상태 한 번만 로깅
  if (typeof window !== "undefined" && !window.__lastAnalysisDebug) {
    window.__lastAnalysisDebug = Date.now();
    console.log("[AnalysisReport] bp:", bp);
    console.log("[AnalysisReport] wp:", wp);
    console.log("[AnalysisReport] unifiedRows:", unifiedRows);
    setTimeout(() => { delete window.__lastAnalysisDebug; }, 2000);
  }

  // 🔧 max 값 계산 - bp/wp 모두 포함 (정합성)
  const allCFValues = unifiedRows.flatMap(r => [Math.abs(r.bCF), Math.abs(r.wCF)]);
  const allAssetValues = unifiedRows.flatMap(r => [Math.abs(r.bAsset), Math.abs(r.wAsset)]);
  const maxCF = Math.max(...allCFValues, 100);
  const maxAsset = Math.max(...allAssetValues, 1000);

  // 최종 누적값
  const lastRow = unifiedRows[unifiedRows.length - 1] || { bCF: 0, bAsset: 0, wCF: 0, wAsset: 0 };
  const lastBest = { cf: lastRow.bCF, asset: lastRow.bAsset };
  const lastWorst = { cf: lastRow.wCF, asset: lastRow.wAsset };

  return (
    <>
      {/* ── 1. 전 생애 자산 흐름 요약 ── */}
      <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 14 }}>📋 전 생애 자산 흐름 요약</div>
        {(analysis.phases || []).map((p, i) => (
          <div key={i} style={{ marginBottom: i < 4 ? 14 : 0, paddingBottom: i < 4 ? 14 : 0, borderBottom: i < 4 ? "1px solid #1e1e2e" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: phaseColors[i] + "20", color: phaseColors[i] }}>{p.title} ({p.age})</span>
              <span style={{ fontSize: 10, color: "#52525b" }}>{p.turns}</span>
            </div>
            <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 0", lineHeight: 1.5 }}>{p.cards}</p>
            <p style={{ fontSize: 12, color: phaseColors[i], margin: 0, fontWeight: 600 }}>{p.verdict}</p>
          </div>
        ))}
      </div>

      {/* ── 2. 최상의 선택 vs 최악의 선택 비교 그래프 ── */}
      <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 6 }}>📈 최상의 선택 vs 최악의 선택</div>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: 14 }}>같은 카드를 받았을 때, 선택에 따라 현금흐름이 어떻게 달라지는지 비교합니다.</div>
        {hasPaths ? (<>
        {/* 탭 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[{ key:"cf", label:"월 현금흐름" }, { key:"asset", label:"누적 투자원금" }].map(t => (
            <button key={t.key} onClick={() => setBestWorstTab(t.key)} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: bestWorstTab === t.key ? "1px solid #3b82f6" : "1px solid #27272a",
              background: bestWorstTab === t.key ? "#3b82f620" : "#18181b",
              color: bestWorstTab === t.key ? "#93c5fd" : "#71717a",
            }}>{t.label}</button>
          ))}
        </div>
        {/* 범례 */}
        <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 11, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 14, height: 10, borderRadius: 2, background: "#22c55e" }}></span>
            <span style={{ color: "#a1a1aa" }}>최상의 선택 (누적)</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 14, height: 10, borderRadius: 2, background: "#ef4444" }}></span>
            <span style={{ color: "#a1a1aa" }}>최악의 선택 (누적)</span>
          </span>
        </div>
        <div style={{ marginBottom: 14, fontSize: 9, color: "#52525b", textAlign: "right" }}>
          최대값: {bestWorstTab === "cf" ? `$${fmtNum(maxCF)}/월` : `$${fmtNum(maxAsset)}`} · 막대 길이는 비율
        </div>

        {/* 턴별 막대 */}
        <div>
          {unifiedRows.map((row, i) => {
            const max = bestWorstTab === "cf" ? (maxCF || 1) : (maxAsset || 1);
            const bVal = bestWorstTab === "cf" ? row.bCF : row.bAsset;
            const wVal = bestWorstTab === "cf" ? row.wCF : row.wAsset;
            const bW = bVal === 0 ? 0 : Math.max(2, (Math.abs(bVal) / max) * 100);
            const wW = wVal === 0 ? 0 : Math.max(2, (Math.abs(wVal) / max) * 100);
            const fmt = v => {
              if (v === 0) return "—";
              return bestWorstTab === "cf"
                ? (v >= 0 ? `+$${fmtNum(Math.round(v))}` : `-$${fmtNum(Math.abs(Math.round(v)))}`)
                : (v >= 0 ? `$${fmtNum(Math.round(v))}` : `-$${fmtNum(Math.abs(Math.round(v)))}`);
            };
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: "#52525b", minWidth: 52 }}>T{row.turn} {row.age}세</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, minHeight: 10 }}>
                      {bW > 0 ? (
                        <div style={{ height: 10, borderRadius: 3, background: "#22c55e", width: `${bW}%` }}></div>
                      ) : (
                        <div style={{ height: 10, width: 20, borderLeft: "2px dotted #52525b" }}></div>
                      )}
                      <span style={{ fontSize: 9, color: bVal === 0 ? "#52525b" : "#86efac", whiteSpace: "nowrap", fontWeight: 700 }}>{fmt(bVal)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 10 }}>
                      {wW > 0 ? (
                        <div style={{ height: 10, borderRadius: 3, background: wVal < 0 ? "#ef4444" : "#ef444480", width: `${wW}%` }}></div>
                      ) : (
                        <div style={{ height: 10, width: 20, borderLeft: "2px dotted #52525b" }}></div>
                      )}
                      <span style={{ fontSize: 9, color: wVal === 0 ? "#52525b" : "#fca5a5", whiteSpace: "nowrap", fontWeight: 700 }}>{fmt(wVal)}</span>
                    </div>
                  </div>
                </div>
                {row.bNote && (
                  <div style={{ paddingLeft: 58, fontSize: 9, color: "#4ade80", marginTop: 3 }}>▲ {row.bNote}</div>
                )}
                {row.wNote && (
                  <div style={{ paddingLeft: 58, fontSize: 9, color: "#f87171", marginTop: 1 }}>▼ {row.wNote}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* 격차 요약 */}
        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#18181b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 9, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>최상의 선택</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>
              {bestWorstTab === "cf"
                ? `${lastBest.cf >= 0 ? "+" : ""}$${fmtNum(Math.round(lastBest.cf))}/월`
                : `$${fmtNum(Math.round(lastBest.asset))}`}
            </div>
          </div>
          <div style={{ fontSize: 18, color: "#52525b", fontWeight: 700 }}>vs</div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 9, color: "#fca5a5", fontWeight: 700, marginBottom: 4 }}>최악의 선택</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>
              {bestWorstTab === "cf"
                ? `${lastWorst.cf >= 0 ? "+" : ""}$${fmtNum(Math.round(lastWorst.cf))}/월`
                : `$${fmtNum(Math.round(lastWorst.asset))}`}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 10, padding: 10, background: "#18181b", borderRadius: 8 }}>
          <span style={{ fontSize: 12, color: "#fafafa", fontWeight: 700 }}>
            같은 카드, 다른 선택 —{" "}
            {bestWorstTab === "cf"
              ? <>월 현금흐름 격차: <span style={{ color: "#fbbf24" }}>${fmtNum(Math.abs(Math.round(lastBest.cf - lastWorst.cf)))}</span></>
              : <>누적 투자원금 격차: <span style={{ color: "#fbbf24" }}>${fmtNum(Math.abs(Math.round(lastBest.asset - lastWorst.asset)))}</span></>
            }
          </span>
        </div>
        </>) : (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>비교 데이터가 생성되지 않았습니다.</p>
            <p style={{ fontSize: 10, color: "#52525b" }}>
              최상 경로 {bp.length}개 · 최악 경로 {wp.length}개
            </p>
            {bp.length === 0 && wp.length === 0 && (
              <p style={{ fontSize: 10, color: "#52525b", marginTop: 6 }}>
                턴 기록이 부족하거나 분석에 오류가 있을 수 있습니다. 다시 분석을 시도해주세요.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 3. 5가지 교훈 + 최종 질문 ── */}
      <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 14 }}>💡 이 게임이 가르쳐 준 5가지</div>
        {(analysis.lessons || []).map((lesson, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 4 ? 12 : 0 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#f59e0b", minWidth: 20, textAlign: "center" }}>{i + 1}</span>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#d4d4d8", margin: 0 }}>{lesson}</p>
          </div>
        ))}
      </div>

      {/* ── 4. 시간 분석 (턴 기반 + 결정 속도) ── */}
      {analysis.timeAnalysis && (
        <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #a78bfa30", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#a78bfa", marginBottom: 14 }}>⏱ 시간 분석 — 자산에 시간을 줘야 합니다</div>

          {/* 보유 기간 분석 */}
          {analysis.timeAnalysis.holdingPeriods && analysis.timeAnalysis.holdingPeriods.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 8 }}>자산 보유 기간 & 누적 현금흐름</div>
              {analysis.timeAnalysis.holdingPeriods.map((h, i) => (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "#1a1a2e", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7" }}>{h.asset}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#a78bfa20", color: "#c4b5fd" }}>{h.holdYears}년 보유</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#22c55e20", color: "#86efac" }}>${fmtNum((h.totalCF || 0))}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: "#a1a1aa", margin: 0, lineHeight: 1.5 }}>{h.insight}</p>
                </div>
              ))}
            </div>
          )}

          {/* 결정 속도 분석 */}
          {analysis.timeAnalysis.decisionSpeed && analysis.timeAnalysis.decisionSpeed.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 8 }}>결정 속도 분석</div>
              {analysis.timeAnalysis.decisionSpeed.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#1a1a2e", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#27272a", color: "#a1a1aa" }}>T{d.turn}</span>
                  <span style={{ fontSize: 11, color: "#e4e4e7", flex: 1 }}>{d.card}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: d.seconds <= 10 ? "#86efac" : d.seconds <= 20 ? "#fde68a" : "#fca5a5" }}>{d.seconds}초</span>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4,
                    background: d.action === "buy" ? "#22c55e20" : d.action === "pass" ? "#ef444420" : "#f59e0b20",
                    color: d.action === "buy" ? "#86efac" : d.action === "pass" ? "#fca5a5" : "#fde68a",
                  }}>{d.action === "buy" ? "구매" : d.action === "sell" ? "판매" : "패스"}</span>
                </div>
              ))}
            </div>
          )}

          {/* 기회비용 */}
          {analysis.timeAnalysis.opportunityCost && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ef444410", border: "1px solid #ef444420", marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>놓친 기회의 비용</div>
              <p style={{ fontSize: 12, color: "#e4e4e7", margin: 0, lineHeight: 1.6 }}>{analysis.timeAnalysis.opportunityCost}</p>
            </div>
          )}

          {/* 시간의 힘 메시지 */}
          {analysis.timeAnalysis.timeMessage && (
            <div style={{ padding: "12px 14px", borderRadius: 10, borderLeft: "3px solid #a78bfa", background: "#a78bfa08" }}>
              <p style={{ fontSize: 13, color: "#e4e4e7", margin: 0, lineHeight: 1.7, fontWeight: 500 }}>{analysis.timeAnalysis.timeMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* ── 💰 6 Levels of Wealth — 당신의 현 위치 ── */}
      {analysis.financialLevel && (() => {
        const fl = analysis.financialLevel;
        const levels = [
          { n: 1, name: "의존", icon: "⚓", color: "#ef4444" },
          { n: 2, name: "생존", icon: "⛺", color: "#f59e0b" },
          { n: 3, name: "안정", icon: "🌱", color: "#22c55e" },
          { n: 4, name: "안정성", icon: "🛡️", color: "#10b981" },
          { n: 5, name: "자유", icon: "🦅", color: "#3b82f6" },
          { n: 6, name: "풍요", icon: "👑", color: "#a855f7" },
        ];
        return (
          <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: `1px solid ${fl.color}40`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 6 }}>💰 6 Levels of Wealth — 당신의 현 위치</div>
            <div style={{ fontSize: 11, color: "#71717a", marginBottom: 14 }}>게임 결과(자산 · 현금흐름 · 지출 · 비상금)를 바탕으로 진단한 현재 단계입니다.</div>

            {/* 6단계 진행도 바 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {levels.map(L => (
                <div key={L.n} style={{
                  flex: 1, padding: "10px 4px", borderRadius: 8, textAlign: "center",
                  background: L.n === fl.level ? `${L.color}30` : (L.n < fl.level ? `${L.color}15` : "#0a0a0f"),
                  border: L.n === fl.level ? `2px solid ${L.color}` : "1px solid #27272a",
                }}>
                  <div style={{ fontSize: 16, marginBottom: 2, opacity: L.n <= fl.level ? 1 : 0.3 }}>{L.icon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: L.n === fl.level ? L.color : (L.n < fl.level ? "#a1a1aa" : "#3f3f46") }}>L{L.n}</div>
                  <div style={{ fontSize: 8, color: L.n === fl.level ? "#fafafa" : "#52525b", marginTop: 1 }}>{L.name}</div>
                </div>
              ))}
            </div>

            {/* 현재 단계 상세 */}
            <div style={{ padding: "14px 16px", borderRadius: 10, background: `${fl.color}10`, borderLeft: `4px solid ${fl.color}`, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{fl.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: fl.color }}>Level {fl.level}: {fl.levelName}</div>
                  <div style={{ fontSize: 9, color: "#71717a", fontStyle: "italic" }}>{fl.english}</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#d4d4d8", margin: "8px 0 12px", lineHeight: 1.6 }}>{fl.status}</p>
              {fl.kpi && (
                <div style={{ display: "flex", gap: 8, fontSize: 9, marginBottom: 10 }}>
                  <span style={{ padding: "4px 8px", borderRadius: 4, background: "#27272a", color: "#a1a1aa" }}>현재: {fl.kpi.current}</span>
                  <span style={{ padding: "4px 8px", borderRadius: 4, background: `${fl.color}20`, color: fl.color, fontWeight: 700 }}>다음: {fl.kpi.target}</span>
                </div>
              )}
            </div>

            {/* 지침 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>📋 이 단계에서 해야 할 행동</div>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {(fl.guidance || []).map((g, i) => (
                  <li key={i} style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.7, marginBottom: 6 }}>{g}</li>
                ))}
              </ol>
            </div>

            {/* 다음 단계 안내 */}
            {fl.nextStep && (
              <div style={{ padding: "12px 14px", borderRadius: 8, background: "linear-gradient(135deg, #3b82f615, #8b5cf615)", border: "1px solid #3b82f630" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd", marginBottom: 4 }}>🎯 다음 단계로 가는 길</div>
                <p style={{ fontSize: 12, color: "#e4e4e7", margin: 0, lineHeight: 1.6 }}>{fl.nextStep}</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 🛡️ 시장에 흔들리지 않는 '나만의 계획' 원칙 (모든 단계 공통) ── */}
      {analysis.financialLevel && (
        <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 6 }}>🛡️ 시장에 흔들리지 않는 3가지 원칙</div>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 14 }}>어느 단계에 있든 흔들리지 않게 만들어주는 핵심 원칙입니다.</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#0a0a0f", borderLeft: "3px solid #fbbf24" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>1. 기준점의 내재화</div>
              <p style={{ fontSize: 11, color: "#d4d4d8", margin: 0, lineHeight: 1.6 }}>성공의 기준을 시장 지수나 친구의 수익률이 아니라, <strong style={{ color: "#fde68a" }}>'어제의 나보다 얼마나 더 탄탄해졌는가'</strong>에 두세요.</p>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#0a0a0f", borderLeft: "3px solid #22c55e" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>2. 시간의 주권 되찾기</div>
              <p style={{ fontSize: 11, color: "#d4d4d8", margin: 0, lineHeight: 1.6 }}>경제적 자유의 본질은 <strong style={{ color: "#86efac" }}>'하기 싫은 일을 하지 않아도 되는 상태'</strong>입니다. 내가 통제할 수 있는 범위(지출 관리, 자기 계발)에 집중하세요.</p>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "#0a0a0f", borderLeft: "3px solid #3b82f6" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>3. 자산보다 중요한 '시스템'</div>
              <p style={{ fontSize: 11, color: "#d4d4d8", margin: 0, lineHeight: 1.6 }}>통장 잔고를 늘리는 것보다, 어떤 상황에서도 나를 지켜줄 <strong style={{ color: "#93c5fd" }}>재무적 시스템(보험·비상금·자동 저축)</strong>을 구축하세요. 시스템이 견고하면 하락장에 오히려 기회를 잡을 수 있습니다.</p>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "20px", borderRadius: 14, textAlign: "center", background: "linear-gradient(135deg, #3b82f610, #8b5cf610)", border: "1px solid #3b82f630", marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", margin: "0 0 6px" }}>최종 디브리핑 질문</p>
        <p style={{ fontSize: 15, fontWeight: 800, color: "#fafafa", margin: 0, lineHeight: 1.7 }}>{analysis.finalQuestion}</p>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
// 💰 6 Levels of Wealth (경제적 성장 6단계) 진단
// ═══════════════════════════════════════════════════
// 게임 결과(자산/CF/지출/현금/대출)로부터 현재 단계 자동 판정
// 단계별 가이드 + 다음 단계로 가는 행동 지침 제공
//
// 입력: { passiveIncome, totalExpense, cash, assets, bankLoan, savingMonths }
// 출력: { level, levelName, color, status, guidance[], nextStep }
export function diagnoseFinancialLevel({ passiveIncome = 0, totalExpense = 1, cash = 0, assets = [], bankLoan = 0, jobName = "" }) {
  const expense = Math.max(totalExpense, 1);
  const cfRatio = passiveIncome / expense;          // 수동소득 / 지출
  const savingMonths = cash / expense;              // 비상금 개월 수
  const hasAssets = (assets || []).length > 0;
  const hasCFAsset = (assets || []).some(a => (a.cf || 0) > 0);

  // 단계 판정 로직 (보수적, 실제 재무 상태 우선)
  // Level 6: 풍요 — 수동소득이 지출의 5배 이상 (게임 내에선 사실상 도달 어려움)
  if (cfRatio >= 5) {
    return {
      level: 6,
      levelName: "재정적 풍요",
      english: "Financial Abundance",
      color: "#a855f7",
      icon: "👑",
      status: "원하는 것보다 훨씬 많은 수입이 자동으로 들어오는 단계입니다. 돈에 대해 더 이상 걱정하거나 계산할 필요가 없습니다.",
      guidance: [
        "자신의 꿈을 온전히 실현하고, 사회적 기여나 유산(Legacy)을 남기는 삶을 사세요.",
        "진정한 자유를 누리며 자아실현에 집중하십시오.",
      ],
      nextStep: "이미 최상위 단계입니다. 이제는 '받은 부'를 어떻게 의미있게 쓸 것인가가 중요합니다.",
      kpi: { current: `수동소득 ${cfRatio.toFixed(1)}배 > 지출`, target: "유지 + 사회 환원" },
    };
  }
  // Level 5: 자유 — 수동소득 ≥ 지출의 2배 (게임 탈출 조건 + 충분한 여유)
  if (cfRatio >= 2) {
    return {
      level: 5,
      levelName: "경제적 자유",
      english: "Financial Freedom",
      color: "#3b82f6",
      icon: "🦅",
      status: "노동을 하지 않아도 현재의 생활 수준을 유지할 수 있는 단계입니다. 노동이 '생존'이 아닌 '선택'이 되었습니다.",
      guidance: [
        "수동적 소득이 지출의 2배를 지속적으로 상회하면 즉시 은퇴가 가능합니다.",
        "이제 '하기 싫은 일을 하지 않을' 권리를 가지셨습니다.",
        "다음 단계는 더 큰 부 + 사회 기여, 즉 '풍요(Abundance)'로 가는 것입니다.",
      ],
      nextStep: "포트폴리오를 다각화하고, 자녀 교육·기부·새 사업 등 의미있는 영역에 자본을 배분하세요.",
      kpi: { current: `수동소득 ${cfRatio.toFixed(1)}배 > 지출`, target: "5배 이상 → Level 6" },
    };
  }
  // Level 4: 안정성 — 근로+수동 > 지출 2배, CF 자산 있음
  if (cfRatio >= 1 || (hasCFAsset && cfRatio >= 0.5)) {
    return {
      level: 4,
      levelName: "금융 안정성",
      english: "Financial Security",
      color: "#10b981",
      icon: "🛡️",
      status: "수동 소득 채널이 확보되어 심리적, 경제적 여유가 생긴 단계입니다. 쥐 레이스를 이미 탈출했거나 곧 탈출할 위치입니다.",
      guidance: [
        "본격적인 자산 배분을 시작하세요 (사업, 주식, 펀드, 채권 등).",
        "**현금 흐름(Cash Flow)**이 발생하는 자산에 투자하여 안정성을 극대화하세요.",
        "단순히 통장 잔고를 늘리는 것보다, 어떤 상황에서도 나를 지켜줄 **재무적 시스템**(보험, 비상금, 자동 저축)을 구축하세요.",
      ],
      nextStep: "수동 소득을 지출의 2배로 끌어올리는 것이 다음 목표입니다. 이미 시스템은 작동하고 있으니, 자산을 추가로 매입해 CF를 키우세요.",
      kpi: { current: `수동소득 ${cfRatio.toFixed(1)}배`, target: `2배 이상 → Level 5 (경제적 자유)` },
    };
  }
  // Level 3: 안정 — CF 자산 있고 저축 있음, 그러나 아직 노동 의존
  if (hasCFAsset || (hasAssets && savingMonths >= 6)) {
    return {
      level: 3,
      levelName: "재정적 안정",
      english: "Financial Stability",
      color: "#22c55e",
      icon: "🌱",
      status: "먹고사는 데 충분하고 삶의 질이 좋아졌지만, 여전히 본인의 노동(근로 소득)에 의존하는 단계입니다. 첫 자산을 통해 시스템의 시작을 만들었습니다.",
      guidance: [
        "남는 돈으로 **수동적 소득(Passive Income)**을 만드는 시스템(사업, 투자 등)에 집중하세요.",
        "수입의 10~15%를 활용해 생명·건강 보험 등 개인 리스크를 방어하세요.",
        "성공의 기준을 '시장 지수'나 '친구의 수익률'이 아니라, **'어제의 나보다 얼마나 더 탄탄해졌는가'**에 두세요.",
      ],
      nextStep: "수동 소득이 지출에 가까워지면 Level 4. 사업체·다가구 부동산 같은 큰 CF 자산을 노리세요.",
      kpi: { current: `CF 자산 ${(assets||[]).filter(a => a.cf > 0).length}개 보유`, target: `수동소득 = 지출 → Level 4` },
    };
  }
  // Level 2: 생존 — 저축은 있으나 자산이 없음 (비상금 단계)
  if (savingMonths >= 3 || cash >= 3000) {
    return {
      level: 2,
      levelName: "경제적 생존",
      english: "Financial Survival",
      color: "#f59e0b",
      icon: "⛺",
      status: "갑작스러운 위기에도 버틸 수 있는 최소한의 방어막을 구축한 단계입니다. 비상금이 마련되어 있어 충동적 결정에서 자유롭습니다.",
      guidance: [
        "월 지출의 6~12배에 달하는 금액을 비상금으로 저축하세요. (현재 약 " + savingMonths.toFixed(1) + "개월 분)",
        "비상금이 마련될 때까지는 부채 상환을 서두르기보다 현금 보유에 집중하세요.",
        "1단계에서 2단계로 넘어온 것만으로도 엄청난 성취입니다. 이제 첫 자산을 매입할 준비가 되었습니다.",
      ],
      nextStep: "첫 CF 자산(소액 부동산 또는 작은 사업체)을 매입해 Level 3로 올라가세요.",
      kpi: { current: `비상금 약 ${savingMonths.toFixed(1)}개월분`, target: `첫 CF 자산 매입 → Level 3` },
    };
  }
  // Level 1: 의존 — 저축도 자산도 없음, 노동 소득에 100% 의존
  return {
    level: 1,
    levelName: "경제적 의존",
    english: "Active Income Only",
    color: "#ef4444",
    icon: "⚓",
    status: "수입이 지출과 비슷하거나 적어, 소득이 생기면 곧장 비용으로 나가는 구조입니다. 당장 일을 그만두면 생계가 위태로운 상태입니다.",
    guidance: [
      "**절대로 무리한 투자를 하지 마세요.** 첫 단계는 방어막을 만드는 것입니다.",
      "지출 관리와 소득 증대에 집중하세요. 들어오는 돈보다 나가는 돈을 줄이는 것이 우선입니다.",
      "가장 중요한 것은 본인의 능력을 키우는 **'지식 투자'**입니다. 책·강의·코칭 모임 등에 시간을 쏟으세요.",
    ],
    nextStep: "월 지출의 3~6개월분 비상금을 모으는 것이 첫 목표. 그래야 Level 2로 올라가고, 충동적 결정에서 벗어날 수 있습니다.",
    kpi: { current: `비상금 ${savingMonths.toFixed(1)}개월분`, target: `3개월분 이상 → Level 2` },
  };
}

export function generateFreeFeedback(results, turns) {
  let dealCount = 0, doodadCount = 0, marketCount = 0, paydayCount = 0, charityCount = 0, babyCount = 0;
  let bestCard = null, bestROI = -Infinity;
  for (const r of results) {
    const dt = r.dealType || "";
    const ct = r.cell?.type;
    if (r.card && (dt.includes("DEAL") || dt === "Capital Gain" || dt === "CashFlow Deal")) {
      dealCount++;
      if (r.card.roi && !r.card.roi.includes("-") && r.card.roi !== "0%" && r.card.roi !== "??%") {
        const roi = parseNumNeg(r.card.roi);
        if (roi > bestROI) { bestROI = roi; bestCard = r; }
      }
    }
    if (dt === "DOODAD") doodadCount++;
    if (dt === "MARKET") marketCount++;
    if (ct === "PAYDAY") paydayCount++;
    if (ct === "CHARITY") charityCount++;
    if (ct === "BABY") babyCount++;
  }

  const yearPerTurn = Math.round(40 / turns * 10) / 10;
  let text = `당신은 ${turns}턴 동안 ${Math.round(turns * yearPerTurn)}년의 인생을 살았습니다.\n\n`;
  text += `기회 카드 ${dealCount}장, DOODAD ${doodadCount}장, MARKET ${marketCount}장, 월급 ${paydayCount}번을 경험했습니다.`;
  if (babyCount > 0) text += ` 아기도 ${babyCount}명 태어났습니다.`;
  if (charityCount > 0) text += ` 기부를 ${charityCount}번 하면서 기회의 폭을 넓혔습니다.`;
  text += "\n\n";
  if (turns <= 10) {
    text += `${turns}턴은 짧은 게임이었지만, 이것은 당신의 40년 인생 축소판입니다. `;
    text += `적은 턴에서 행동이 적었다면, 현실에서도 같은 패턴이 반복될 수 있습니다. `;
    text += `관점을 넓히고, 다양한 전략을 탐색하는 것이 진짜 게임의 시작입니다.\n\n`;
  }
  if (bestCard) {
    text += `이번 게임에서 가장 빛났던 카드는 T${bestCard.turn}의 ${bestCard.card.sub || bestCard.dealType}(${bestCard.card.roi} ROI)였습니다. `;
    text += `이 한 장의 카드가 당신의 현금흐름을 크게 바꿔놓았죠.\n\n`;
  }
  text += `하지만 같은 카드를 받아도 선택이 다르면 결과는 완전히 달라집니다. `;
  text += `혼자서 이 판단 기준을 세우기는 어렵습니다. `;
  text += `매달 캐쉬플로우 모임에서 함께 게임을 반복하면, 당신의 선택 기준은 점점 날카로워집니다.\n\n`;
  text += `다음 모임에서 더 나은 선택을 하는 당신을 만나보세요.`;
  return text;
}

const SYSTEM_PROMPT = `캐쉬플로우 보드게임 전문 코칭 딜러(13년/5000회+). 기요사키 철학 기반. 스토리텔링으로 총평 작성. 40년 인생 매핑(1턴=2년,20세시작). 현실 경제이벤트 연결. 희망적·따뜻한 톤. 모임 참석 가치를 자연스럽게 전달. 마크다운 없이 순수 텍스트. 한국어.

[중요 해석 규칙]
- 무상증자/감자 카드([이벤트] 태그)는 보유 주식에만 적용되는 이벤트 카드일 뿐, 카드 등장 자체가 자산 보유를 의미하지 않는다.
- [미보유→해당없음] 태그가 있는 이벤트 카드는 "해당 종목을 보유하지 않아 적용되지 않은 카드"로 해석. 자산으로 언급하지 말 것.
- [보유중→적용됨] 태그가 있는 이벤트 카드만 실제 주식 수량 변동이 일어난 것으로 해석.
- 자산 보유 판단은 오직 [구매] 태그가 있는 기회 카드(SMALL DEAL/BIG DEAL/Capital Gain/CashFlow Deal)로만 한다.`;

// ── 유료 피드백 생성 공통 함수 (API 호출 중복 제거) ──
// tier 1 = $9 Sonnet 2000자, tier 2 = $20 Opus 5000자
const FEEDBACK_DETAIL = {
  1: "2000자. 스토리텔링. 감정→행동(모임참석). 희망적. 현실경제연결. 억지마케팅X.",
  2: "5000자. 전턴분석+현실매핑+최상의 선택/최악의 선택 비교(수치)+전략제안+마인드셋. 스토리텔링. 모임가치를 진심으로. 당신의 최고 수준의 한국어 스토리텔링으로 작성하세요.",
};
const FEEDBACK_MAX_TOKENS = { 1: 2500, 2: 6000 };

export async function generatePaidFeedback({ tier, version, turns, simText, extraContext = "" }) {
  const model = tier === 2 ? MODEL_OPUS : MODEL_SONNET;
  const detail = FEEDBACK_DETAIL[tier] || FEEDBACK_DETAIL[1];
  const maxTokens = FEEDBACK_MAX_TOKENS[tier] || 2500;

  // 🆕 유료 피드백 전용: 6 Levels of Wealth + 3원칙 코칭 가이드
  const PAID_COACHING_FRAMEWORK = `
═══════════════════════════════════════════════════
💰 6 Levels of Wealth (경제적 성장 6단계) — 반드시 활용할 것
═══════════════════════════════════════════════════
이 프레임워크는 유료 코칭의 핵심 차별화 요소입니다.
반드시 분석에 다음을 포함시키세요:

1️⃣ 게임 결과로부터 플레이어의 현재 단계를 진단
   - L1 경제적 의존(Active Income Only): 수입=지출, 저축 거의 없음, 노동 100% 의존
   - L2 경제적 생존(Financial Survival): 비상금 6~12개월분 확보 단계
   - L3 재정적 안정(Financial Stability): 수입이 지출의 2배 이상, 첫 자산 보유, 그러나 노동 의존
   - L4 금융 안정성(Financial Security): 근로+수동 소득 > 지출 2배, CF 자산 다수
   - L5 경제적 자유(Financial Freedom): 수동 소득 ≥ 지출의 2배 (게임 탈출 + 여유)
   - L6 재정적 풍요(Financial Abundance): 수동 소득 >> 지출, 사회 환원/유산 단계

2️⃣ 단계별 행동 지침 제시 — 현재 단계에 맞는 구체적 행동
   - L1: 절대 무리한 투자 금지. 지출 관리 + 소득 증대 + '지식 투자'
   - L2: 월 지출의 6~12배 비상금 모으기. 부채 상환보다 현금 보유 우선
   - L3: 남는 돈으로 수동적 소득 시스템 구축. 보험으로 리스크 방어
   - L4: 본격적 자산 배분(사업/주식/펀드/채권). CF 발생 자산 우선
   - L5: 노동이 '선택'이 되는 단계. 포트폴리오 다각화
   - L6: 자아실현, 사회 기여, Legacy 남기는 삶

3️⃣ 다음 단계로 가는 경로 명시
   - "당신은 현재 L2에서 L3로 가고 있다. 첫 CF 자산을 매입하면 도약한다"
   - 구체적 KPI 제시 (수동소득 목표, 자산 개수, 비상금 개월수)

🛡️ 추가로 다음 3원칙도 적절히 인용하세요:

원칙 1. 기준점의 내재화
   성공의 기준을 시장 지수나 친구의 수익률이 아니라
   '어제의 나보다 얼마나 더 탄탄해졌는가'에 두는 것

원칙 2. 시간의 주권 되찾기
   경제적 자유의 본질은 '하기 싫은 일을 하지 않아도 되는 상태'
   내가 통제할 수 있는 범위(지출 관리, 자기 계발)에 집중

원칙 3. 자산보다 중요한 '시스템'
   재무적 시스템(보험, 비상금, 자동 저축)이 견고하면
   하락장에 오히려 기회를 잡을 수 있는 여유가 생긴다

═══════════════════════════════════════════════════
중요: 위 프레임워크는 유료 콘텐츠의 가치를 만드는 핵심입니다.
스토리텔링 안에 자연스럽게 녹이되, 반드시 다음 3가지를 명시:
  ① 현재 어느 단계에 있는지
  ② 그 단계에서 해야 할 행동
  ③ 다음 단계로 가는 길
═══════════════════════════════════════════════════
`;

  // 🆕 60초 timeout 추가 (무한 대기 방지)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  console.log(`[generatePaidFeedback] API 호출 시작 — tier=${tier}, model=${model}, simText 길이=${(simText || "").length}`);

  let response;
  try {
    response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `캐쉬플로우${version} ${turns}턴 디브리핑 총평.\n${simText}\n${extraContext}\n\n${PAID_COACHING_FRAMEWORK}\n\n${detail}`,
        }],
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      throw new Error("API 응답 시간 초과 (60초). 네트워크 상태를 확인하거나 다시 시도해주세요.");
    }
    throw e;
  }
  clearTimeout(timeoutId);
  console.log(`[generatePaidFeedback] API 응답 수신 — status=${response.status}`);
  if (!response.ok) {
    const err = new Error(`API 오류 (${response.status})`);
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  if (!data.content) throw new Error("예상치 못한 응답입니다.");
  console.log(`[generatePaidFeedback] ✅ 응답 처리 완료`);
  return data.content.filter(c => c.type === "text").map(c => c.text).join("\n");
}

// 디브리핑 티어 정의 — 모듈 스코프 상수 (매 렌더마다 재생성되지 않도록)
const TIERS = [
  { label: "요약 피드백", chars: "500자", price: "무료", color: "#22c55e", sub: "게임 결과 요약 + 핵심 인사이트", model: "" },
  { label: "상세 피드백", chars: "2,000자", price: "$9", color: "#3b82f6", sub: "스토리텔링 + 현실 연결 + 행동 설계", model: "Sonnet" },
  { label: "프리미엄 피드백", chars: "5,000자", price: "$20", color: "#f59e0b", sub: "전문 코칭 리포트 + 맞춤 전략", model: "Opus" },
];

function DebriefSection({ results, version, turns, deck, gameSnapshot }) {
  const [mode, setMode] = useState(null);
  const [tier, setTier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [paidText, setPaidText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [bestWorstTab, setBestWorstTab] = useState("cf");
  const debRef = useRef(null);
  const abortRef = useRef(null);

  // ── 피드백 캐시: 같은 게임 세션에서 티어별로 한 번만 API 호출 ──
  // { 0: "무료 텍스트", 1: "상세 텍스트", 2: "프리미엄 텍스트" }
  const [feedbackCache, setFeedbackCache] = useState({});
  // ── 확인 단계: 티어 선택 → 확인 화면 → 실행 버튼 누를 때만 API 호출 ──
  // null | 0 | 1 | 2  (현재 확인 화면에서 보여주는 티어)
  const [pendingTier, setPendingTier] = useState(null);

  // ── 리포트 저장/로드 (window.storage) ──
  const [savedReports, setSavedReports] = useState([]);
  const [showSaved, setShowSaved] = useState(false);
  const [viewingSaved, setViewingSaved] = useState(null);

  // 시뮬레이션 원본 데이터 (리포트 저장용, 재계산 방지)
  const simText = useMemo(() => buildPromptText(results, version, turns), [results, version, turns]);

  // 저장된 리포트 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const keys = await window.storage?.list("debrief:");
        if (keys?.keys) {
          // 키는 `debrief:${ts}` 형식 → 타임스탬프 추출해 최신순 정렬 후 20개
          const sorted = [...keys.keys].sort((a, b) => {
            const ta = parseInt(a.split(":")[1]) || 0;
            const tb = parseInt(b.split(":")[1]) || 0;
            return tb - ta;
          }).slice(0, 20);
          const reports = [];
          for (const k of sorted) {
            try {
              const r = await window.storage.get(k);
              if (r?.value) reports.push({ key: k, ...JSON.parse(r.value) });
            } catch {}
          }
          setSavedReports(reports);
        }
      } catch {}
    })();
  }, []);

  // ⭐ 리포트 자동 저장 (4중 저장 체계: 절대 유실되지 않음)
  // 1차: localStorage (즉시, 실패 시에도 로컬 보존)
  // 2차: localStorage debrief-永:* (로그아웃에도 살아남음)
  // 3차: IndexedDB (Supabase 영향 안 받음)
  // 4차: Supabase (다기기 동기화)
  const saveReport = async (analysisData, feedbackText, feedbackTier) => {
    try {
      const ts = Date.now();
      const key = `debrief:${ts}`;
      const now = new Date();
      const data = {
        ts, version, turns,
        date: now.toLocaleDateString("ko-KR"),
        time: now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
        dateTime: now.toISOString(),
        analysis: analysisData,
        feedback: feedbackText || "",
        feedbackTier: feedbackTier ?? null, // 0=무료, 1=$9, 2=$20, null=미생성
        simText: simText, // 시뮬레이션 원본 데이터
        // 🆕 턴 로그 원본 + 최종 자산/자금 스냅샷 (저장 시점 기준)
        // 이로써 "게임 기록 보기" 모달에서 턴별 상세가 표시됨
        turnLog: Array.isArray(results) ? results : [],
        turnCount: turns,
        // 🆕 게임 스냅샷 (자산/현금/대출 등) — 모달의 요약 카드에 표시
        assets: gameSnapshot?.assets || [],
        cash: gameSnapshot?.cash ?? 0,
        totalCF: gameSnapshot?.totalCF ?? 0,
        bankLoan: gameSnapshot?.bankLoan ?? 0,
        loanInterest: gameSnapshot?.loanInterest ?? 0,
        babies: gameSnapshot?.babies ?? 0,
        job: gameSnapshot?.job || "",
        savedAt: "debriefing",
      };
      const payloadStr = JSON.stringify(data);

      // ─── 🛡️ 1차: localStorage (즉시 저장, 항상 성공) ───
      try {
        localStorage.setItem(key, payloadStr);
        console.log(`[saveReport] ✅ localStorage 저장: ${key} (턴 ${data.turnLog.length}개 포함)`);
      } catch (e) {
        console.warn("[saveReport] localStorage 저장 실패:", e);
      }

      // ─── 🛡️ 2차: 박제용 debrief-永:* (피드백이 있을 때만) ───
      const tierName = feedbackTier === 0 ? "free" : feedbackTier === 1 ? "detail" : feedbackTier === 2 ? "premium" : null;
      if (tierName && feedbackText) {
        try {
          const eternalKey = `debrief-永:${key}:${tierName}`;
          localStorage.setItem(eternalKey, JSON.stringify({
            gameKey: key,
            tier: tierName,
            text: feedbackText,
            generatedAt: data.dateTime,
            gameInfo: {
              version, turnCount: turns,
              job: "(플레이 모드)",
              date: data.date,
              dateTime: data.dateTime,
            },
          }));
          console.log(`[saveReport] ✅ 박제 저장: ${eternalKey}`);
        } catch (e) {
          console.warn("[saveReport] 박제 저장 실패:", e);
        }

        // ─── 🔐 3차: IndexedDB (Supabase 영향 안 받음) ───
        try {
          await saveEternalDebrief(key, tierName, feedbackText, {
            version, turnCount: turns,
            job: "(플레이 모드)",
            date: data.date,
            dateTime: data.dateTime,
          });
        } catch (e) {
          console.warn("[saveReport] IndexedDB 저장 실패:", e);
        }
      }

      // ─── 🛡️ 4차: Supabase (다기기 동기화, 타임아웃 10초) ───
      try {
        const storagePromise = window.storage?.set(key, payloadStr);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("saveReport 타임아웃 (10초)")), 10000)
        );
        const result = await Promise.race([storagePromise, timeoutPromise]);
        if (result) {
          console.log(`[saveReport] ✅ Supabase 저장: ${key}`);
        } else {
          console.warn(`[saveReport] ⚠️ Supabase null 반환 (로컬에는 저장됨)`);
        }
      } catch (e) {
        console.warn(`[saveReport] ⚠️ Supabase 저장 실패 (로컬에는 저장됨):`, e.message);
      }

      setSavedReports(prev => [{ key, ...data }, ...prev].slice(0, 20));
    } catch (e) {
      console.error("[saveReport] 예외:", e);
    }
  };

  // ⭐ 리포트 업데이트 (총평 추가 시) - 4중 저장 체계 적용
  const updateReportFeedback = async (feedbackText, feedbackTier) => {
    try {
      const latest = savedReports[0];
      if (!latest) {
        console.warn("[updateReportFeedback] savedReports가 비어있음");
        return;
      }

      const updated = { ...latest, feedback: feedbackText, feedbackTier };
      const payloadStr = JSON.stringify(updated);

      // ─── 1차: localStorage 즉시 업데이트 ───
      try {
        localStorage.setItem(latest.key, payloadStr);
        console.log(`[updateReportFeedback] ✅ localStorage 업데이트: ${latest.key}`);
      } catch (e) {
        console.warn("[updateReportFeedback] localStorage 실패:", e);
      }

      // ─── 2차: 박제본 저장 (피드백이 있으면) ───
      const tierName = feedbackTier === 0 ? "free" : feedbackTier === 1 ? "detail" : feedbackTier === 2 ? "premium" : null;
      if (tierName && feedbackText) {
        try {
          const eternalKey = `debrief-永:${latest.key}:${tierName}`;
          localStorage.setItem(eternalKey, JSON.stringify({
            gameKey: latest.key,
            tier: tierName,
            text: feedbackText,
            generatedAt: latest.dateTime || new Date().toISOString(),
            gameInfo: {
              version: latest.version,
              turnCount: latest.turns,
              job: "(플레이 모드)",
              date: latest.date,
              dateTime: latest.dateTime,
            },
          }));
          console.log(`[updateReportFeedback] ✅ 박제 저장: ${eternalKey}`);
        } catch (e) {
          console.warn("[updateReportFeedback] 박제 저장 실패:", e);
        }

        // ─── 3차: IndexedDB ───
        try {
          await saveEternalDebrief(latest.key, tierName, feedbackText, {
            version: latest.version,
            turnCount: latest.turns,
            job: "(플레이 모드)",
            date: latest.date,
            dateTime: latest.dateTime,
          });
        } catch (e) {
          console.warn("[updateReportFeedback] IndexedDB 저장 실패:", e);
        }
      }

      // ─── 4차: Supabase (타임아웃 10초) ───
      try {
        const storagePromise = window.storage?.set(latest.key, payloadStr);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("updateReport 타임아웃 (10초)")), 10000)
        );
        const result = await Promise.race([storagePromise, timeoutPromise]);
        if (result) {
          console.log(`[updateReportFeedback] ✅ Supabase 업데이트: ${latest.key}`);
        } else {
          console.warn(`[updateReportFeedback] ⚠️ Supabase null 반환 (로컬에는 저장됨)`);
        }
      } catch (e) {
        console.warn(`[updateReportFeedback] ⚠️ Supabase 업데이트 실패 (로컬에는 저장됨):`, e.message);
      }

      setSavedReports(prev => [updated, ...prev.slice(1)]);
    } catch (e) {
      console.error("[updateReportFeedback] 예외:", e);
    }
  };

  // 리포트 삭제
  const deleteReport = async (key) => {
    try {
      await window.storage?.delete(key);
      setSavedReports(prev => prev.filter(r => r.key !== key));
      if (viewingSaved?.key === key) setViewingSaved(null);
    } catch {}
  };

  // ═══════════════════════════════════════════════════
  // 🎯 최상의 선택 / 최악의 선택 경로 계산 (Phase B Day 3)
  // ═══════════════════════════════════════════════════
  // 국제캐쉬플로우강사협회 13년 교육 철학 기반 분류:
  //
  // 🟢 최상의 선택:
  //   - 초반 현금 확보 (CF 마이너스여도 OK)
  //   - 자산 매수 후 단기 매도 (차익 실현)
  //   - 사업체 선택
  //   - 기부 선택 (투자 기회 확보)
  //   - CF 증가 자산 매수
  //   - 주식 차익 실현
  //
  // 🟡 최악의 선택 (부드러운 표현, "최악" 아님):
  //   - 좋은 기회 패스
  //   - 사업체 기회 놓침 (가중치 ↑)
  //   - 기부 안 함
  //   - 후반부 주식 투자 (CF 방해)
  //   - CF 마이너스 자산을 끝까지 보유
  //
  // 🔴 확실히 나쁜 선택:
  //   - DOODAD (과소비)
  //
  // ⚪ 중립 (교육적 평가 불필요):
  //   - BABY (선택 영역 아님)
  //   - PAYDAY (자동)
  const computeBestWorstPaths = (turnLogData, totalTurns) => {
    if (!turnLogData || turnLogData.length === 0) {
      return {
        bestPath: [{ turn: 1, age: 20, cf: 0, asset: 0, note: "기록 없음" }],
        worstPath: [{ turn: 1, age: 20, cf: 0, asset: 0, note: "기록 없음" }],
      };
    }

    // 🔧 results(gameResults) 구조를 turnLog 구조로 변환 (어댑터)
    // results: { turn, cell:{type}, card:{...,_action,_shares}, decisionSec, ... }
    // turnLog: { turn, cellType, card:{...}, action, shares, transaction, ... }
    const normalized = turnLogData.map(t => {
      // 이미 turnLog 구조면 그대로 사용
      if (t.cellType && !t.cell) return t;
      // results 구조면 변환
      return {
        turn: t.turn,
        cellType: t.cell?.type || t.cellType,
        dealType: t.dealType,
        card: t.card ? { ...t.card } : null,
        action: t.card?._action || t.action,
        shares: t.card?._shares || t.shares,
        transaction: t.transaction,
        decisionSec: t.decisionSec,
      };
    });

    const yearsPerTurn = Math.round(40 / Math.max(totalTurns, 1) * 10) / 10;
    const ageAtTurn = (t) => Math.round(20 + (t - 0.5) * yearsPerTurn);

    // 게임 구간 정의 (초반 1/3 / 중반 1/3 / 후반 1/3)
    const earlyThreshold = Math.max(Math.floor(totalTurns / 3), 3);
    const lateThreshold = Math.floor(totalTurns * 2 / 3);
    const isEarly = (turn) => turn <= earlyThreshold;
    const isLate = (turn) => turn >= lateThreshold;

    // 단기 매도 판단을 위해: 매수/매도 매칭
    // cardName → { buyTurn, sold, sellTurn } 매핑
    const assetLifecycle = {};
    normalized.forEach(t => {
      const cardName = t.card?.sub || t.card?.desc || "";
      if (!cardName) return;
      
      if ((t.cellType === "DEAL1" || t.cellType === "DEAL2" || t.cellType === "BIG_DEAL" || t.cellType === "SMALL_DEAL" || t.cellType === "MARKET" || t.cellType === "OPPORTUNITY") && t.action === "buy") {
        if (!assetLifecycle[cardName]) {
          assetLifecycle[cardName] = { buyTurn: t.turn, sold: false, sellTurn: null };
        }
      }
      if (t.action === "sell" || t.cellType === "EXT_SELL" || t.cellType === "STOCK_SELL") {
        if (assetLifecycle[cardName]) {
          assetLifecycle[cardName].sold = true;
          assetLifecycle[cardName].sellTurn = t.turn;
        }
      }
    });

    // 단기 매도 판단 (매수 후 3턴 이내)
    const isShortTermSale = (cardName, sellTurn) => {
      const info = assetLifecycle[cardName];
      if (!info) return false;
      return (sellTurn - info.buyTurn) <= 3;
    };

    // 사업체 판단
    const isBusinessCard = (card) => {
      if (!card) return false;
      const type = card.type || "";
      const sub = (card.sub || "").toLowerCase();
      const desc = (card.desc || "").toLowerCase();
      return (
        type.includes("사업") ||
        type.includes("business") ||
        sub.includes("사업") ||
        sub.includes("business") ||
        sub.includes("startup") ||
        desc.includes("사업") ||
        desc.includes("프랜차이즈") ||
        desc.includes("franchise")
      );
    };

    // 매도 여부를 기준으로 CF 마이너스 자산이 "부채"였는지 판단
    const wasSoldLater = (cardName, buyTurn) => {
      const info = assetLifecycle[cardName];
      return info && info.sold && info.sellTurn > buyTurn;
    };

    // 나이를 턴으로 변환 (40세 기준)
    const isBeforeFortyTurn = (turn) => {
      const age = ageAtTurn(turn);
      return age < 40;
    };

    // 각 턴을 분류
    const classifyTurn = (t, idx) => {
      const action = t.action;
      const cellType = t.cellType;
      const card = t.card || {};
      const cashFlowChange = card.cashflow || 0;
      const roi = card.roi || 0;
      const cardName = card.sub || card.desc || "";

      // ─── DEAL / MARKET 카드 매수 ───
      const isBuyable = ["DEAL1", "DEAL2", "BIG_DEAL", "SMALL_DEAL", "MARKET", "OPPORTUNITY"].includes(cellType);
      
      if (isBuyable && action === "buy") {
        // 사업체 매수 - 항상 최상의 선택 (+ 가중치)
        if (isBusinessCard(card)) {
          return {
            category: "best",
            cfChange: cashFlowChange,
            assetChange: card.cost || card.price || 0,
            reason: `💼 사업체 ${cardName} 매수 (+$${cashFlowChange}/월) — B사분면 진입`,
            weight: 1.5,
          };
        }
        // CF 증가 자산 - 최상의 선택
        if (cashFlowChange > 0) {
          return {
            category: "best",
            cfChange: cashFlowChange,
            assetChange: card.cost || card.price || 0,
            reason: `🏠 ${cardName} 매수 (+$${cashFlowChange}/월)`,
          };
        }
        // CF 마이너스 자산 - 매각 여부로 판단 (Kevin님 철학)
        if (cashFlowChange < 0 || roi < 0) {
          // 초반이면 현금 확보 전략
          if (isEarly(t.turn)) {
            return {
              category: "best",
              cfChange: cashFlowChange,
              assetChange: card.cost || card.price || 0,
              reason: `💡 초반 ${cardName} 매수 — 현금 확보 전략 (CF ${cashFlowChange}/월이지만 OK)`,
            };
          }
          // 나중에 매각했으면 OK (차익 실현 가능)
          if (wasSoldLater(cardName, t.turn)) {
            return {
              category: "best",
              cfChange: cashFlowChange,
              assetChange: card.cost || card.price || 0,
              reason: `✅ ${cardName} 매수 (CF ${cashFlowChange}) — 이후 매각으로 차익 확보`,
            };
          }
          // 끝까지 보유했다면 진짜 부채
          const info = assetLifecycle[cardName];
          const heldToEnd = info && !info.sold;
          if (heldToEnd) {
            return {
              category: "missed",
              cfChange: cashFlowChange,
              assetChange: card.cost || card.price || 0,
              reason: `⚠️ ${cardName} (CF ${cashFlowChange}/월) 끝까지 보유 — 부채를 자산으로 착각`,
            };
          }
          return {
            category: "neutral",
            cfChange: 0,
            assetChange: 0,
            reason: `${cardName} 매수`,
          };
        }
        // 주식 매수 (CF 변화 없음)
        if ((card.type || "").includes("주식") || cardName.toLowerCase().includes("stock")) {
          // 후반부(40세 이후) 주식 투자 - 최악의 선택
          if (isLate(t.turn) || !isBeforeFortyTurn(t.turn)) {
            return {
              category: "missed",
              cfChange: 0,
              assetChange: (card.cost || card.price || 0) * (t.shares || 1),
              reason: `📉 ${cardName} 주식 매수 — 현금흐름 형성 시기에 차익 추구`,
            };
          }
          return {
            category: "neutral",
            cfChange: 0,
            assetChange: (card.cost || card.price || 0) * (t.shares || 1),
            reason: `주식 ${cardName} 매수`,
          };
        }
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: `${cardName} 매수` };
      }

      // ─── 주식/자산 매도 ───
      if (action === "sell" || cellType === "EXT_SELL" || cellType === "STOCK_SELL") {
        const transaction = t.transaction || "";
        const profitMatch = transaction.match(/\+\$?([\d,]+)/);
        const lossMatch = transaction.match(/-\$?([\d,]+)/);
        
        // 40세 이전 매각은 차익 여부 무관하게 긍정적 (Kevin님 철학)
        if (isBeforeFortyTurn(t.turn)) {
          if (profitMatch) {
            const profit = parseInt(profitMatch[1].replace(/,/g, ""), 10);
            return {
              category: "best",
              cfChange: 0,
              assetChange: profit,
              reason: `💰 ${cardName} 매각 +$${profit} — 40세 이전 차익 실현 (더 큰 CF 만들 원금)`,
            };
          }
          if (lossMatch) {
            const loss = parseInt(lossMatch[1].replace(/,/g, ""), 10);
            return {
              category: "best",
              cfChange: 0,
              assetChange: -loss,
              reason: `⚡ ${cardName} 매각 -$${loss} — 빠른 손절, 다음 기회로`,
            };
          }
          return { category: "best", cfChange: 0, assetChange: 0, reason: `${cardName} 매각 — 유연한 의사결정` };
        }
        
        // 단기 매도 (매수 후 3턴 이내) - 차익/손절 무관하게 좋은 선택
        if (isShortTermSale(cardName, t.turn)) {
          if (profitMatch) {
            const profit = parseInt(profitMatch[1].replace(/,/g, ""), 10);
            return {
              category: "best",
              cfChange: 0,
              assetChange: profit,
              reason: `⚡ ${cardName} 단기 매도 +$${profit} — 빠른 차익실현`,
            };
          }
          if (lossMatch) {
            const loss = parseInt(lossMatch[1].replace(/,/g, ""), 10);
            return {
              category: "best",
              cfChange: 0,
              assetChange: -loss,
              reason: `⚡ ${cardName} 단기 정리 -$${loss} — 빠른 의사결정`,
            };
          }
        }
        
        // 40세 이후 일반 매도
        if (profitMatch) {
          const profit = parseInt(profitMatch[1].replace(/,/g, ""), 10);
          return {
            category: "best",
            cfChange: 0,
            assetChange: profit,
            reason: `💰 ${cardName} 매각 +$${profit} 차익`,
          };
        }
        if (lossMatch) {
          const loss = parseInt(lossMatch[1].replace(/,/g, ""), 10);
          return {
            category: "missed",
            cfChange: 0,
            assetChange: -loss,
            reason: `${cardName} 매각 -$${loss} 손실`,
          };
        }
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: `매도` };
      }

      // ─── DOODAD (과소비) - 확실히 나쁜 선택 ───
      if (cellType === "DOODAD") {
        const amount = card.amount || 0;
        return {
          category: "worst",
          cfChange: -Math.min(50, Math.round(amount / 20)),  // 🆕 작은 cf 영향 (시각화용)
          assetChange: -amount,
          reason: `🛒 ${card.desc || "지출"} -$${amount} — 과소비`,
        };
      }

      // ─── CHARITY (기부) - 최상의 선택 ───
      if (cellType === "CHARITY") {
        if (action === "charity_yes") {
          return {
            category: "best",
            cfChange: 0,
            assetChange: -(card.cost || 160),
            reason: `❤️ 기부 선택 — 부자 마인드셋 (주사위 2개 × 3턴)`,
          };
        }
        if (action === "charity_no" || action === "na") {
          return {
            category: "missed",
            cfChange: 0,
            assetChange: 0,
            reason: `기부 기회 패스 — 투자 현금 확보 기회 놓침`,
          };
        }
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: "CHARITY" };
      }

      // ─── DOWNSIZED ───
      if (cellType === "DOWNSIZED" || cellType === "DOWNSIZED_REST") {
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: "다운사이즈 (운)" };
      }

      // ─── BABY ───
      if (cellType === "BABY") {
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: "자녀 (선택 영역 아님)" };
      }

      // ─── PAYDAY (월급) - Kevin님 철학: 저축은 자산 형성의 전 단계 ───
      if (cellType === "PAYDAY") {
        // 초반(20대)의 PAYDAY는 저축 기회로 긍정적 평가
        if (isEarly(t.turn)) {
          return {
            category: "best",
            cfChange: 50,  // 🆕 작은 저축 효과 (시각화용)
            assetChange: 500, // 저축 효과 상징적 표현
            reason: `💵 월급 수령 — 20대 저축은 자산 형성의 씨앗 (과소평가된 습관)`,
          };
        }
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: "PAYDAY" };
      }

      // ─── 기회 패스 ───
      if (isBuyable && (action === "pass" || action === "na" || !action)) {
        const weight = isBusinessCard(card) ? 1.5 : 1.0;
        if (isBusinessCard(card)) {
          return {
            category: "missed",
            cfChange: 0,
            assetChange: 0,
            reason: `💼 ${cardName} 사업체 기회 패스 — B사분면 입장권 포기`,
            weight,
          };
        }
        if (cashFlowChange > 0 || roi > 10) {
          return {
            category: "missed",
            cfChange: 0,
            assetChange: 0,
            reason: `${cardName} 기회 패스 — 좋은 조건이었음`,
            weight,
          };
        }
        // 20대의 기회 패스는 현실적 (돈 없어서) - 저축 단계
        if (isEarly(t.turn)) {
          return {
            category: "neutral",
            cfChange: 0,
            assetChange: 0,
            reason: `${cardName} 패스 — 20대는 저축 단계`,
          };
        }
        return { category: "neutral", cfChange: 0, assetChange: 0, reason: "패스" };
      }

      return { category: "neutral", cfChange: 0, assetChange: 0, reason: "" };
    };

    // 모든 턴 분류
    const classifiedTurns = normalized.map((t, idx) => ({ ...t, ...classifyTurn(t, idx) }));

    // 🆕 Kevin 철학: 연속 무행동 구간 탐지 (기회를 놓치고 시간 흘려보냄)
    // CF+ 자산을 만드는 행동 없이 PAYDAY/DOODAD/패스만 반복된 구간 = 최악
    const detectStagnantPhases = () => {
      const stagnantPhases = [];
      let currentPhaseStart = null;
      let currentPhaseEnd = null;
      let phaseLength = 0;

      classifiedTurns.forEach((t, idx) => {
        const isAction = t.category === "best" && (t.cfChange > 0 || (t.reason || "").includes("사업체") || (t.reason || "").includes("매각"));
        if (isAction) {
          // 기존 구간 종료
          if (phaseLength >= 3) {
            stagnantPhases.push({ start: currentPhaseStart, end: currentPhaseEnd, length: phaseLength });
          }
          currentPhaseStart = null;
          currentPhaseEnd = null;
          phaseLength = 0;
        } else {
          if (currentPhaseStart === null) currentPhaseStart = t.turn;
          currentPhaseEnd = t.turn;
          phaseLength++;
        }
      });
      // 마지막 구간
      if (phaseLength >= 3) {
        stagnantPhases.push({ start: currentPhaseStart, end: currentPhaseEnd, length: phaseLength });
      }
      return stagnantPhases;
    };
    const stagnantPhases = detectStagnantPhases();

    // 🆕 대출 증가 감지 (bankLoan 필드 추적)
    // turnLog에 bankLoan이 있으면 변화 추적
    const loanGrowthTurns = [];
    let prevLoan = 0;
    normalized.forEach(t => {
      const curLoan = t.bankLoan || t.loanAfter || 0;
      if (curLoan > prevLoan + 500) { // 500 이상 증가
        loanGrowthTurns.push({
          turn: t.turn,
          age: ageAtTurn(t.turn),
          loanDelta: curLoan - prevLoan,
          hasCFAsset: t.category === "best" && t.cfChange > 0,
        });
      }
      prevLoan = curLoan;
    });

    // Best Path: "최상의 선택"만 누적 (+ 가중치 반영)
    // Worst Path: "최악의 선택" + "나쁜 선택" 누적
    let bestCF = 0, bestAsset = 0;
    let worstCF = 0, worstAsset = 0;

    const bestPath = [];
    const worstPath = [];

    classifiedTurns.forEach((t) => {
      const weight = t.weight || 1.0;
      
      if (t.category === "best") {
        bestCF += t.cfChange * weight;
        bestAsset += t.assetChange * weight;
        bestPath.push({
          turn: t.turn,
          age: ageAtTurn(t.turn),
          cf: Math.round(bestCF),
          asset: Math.round(bestAsset),
          note: t.reason,
        });
      } else if (t.category === "missed" || t.category === "worst") {
        worstCF += t.cfChange * weight;
        worstAsset += t.assetChange * weight;
        worstPath.push({
          turn: t.turn,
          age: ageAtTurn(t.turn),
          cf: Math.round(worstCF),
          asset: Math.round(worstAsset),
          note: t.reason,
        });
      }
    });

    // 🆕 정체 구간을 worstPath에 추가 (가장 긴 정체만 대표로)
    if (stagnantPhases.length > 0) {
      const longest = stagnantPhases.reduce((a, b) => (b.length > a.length ? b : a));
      if (longest.length >= 3) {
        const midTurn = Math.floor((longest.start + longest.end) / 2);
        worstPath.push({
          turn: midTurn,
          age: ageAtTurn(midTurn),
          cf: Math.round(worstCF),
          asset: Math.round(worstAsset),
          note: `⏳ T${longest.start}~T${longest.end} (${longest.length}턴) 무행동 — 월급만 받고 자산 매수 0건`,
        });
      }
    }

    // 🆕 부채 증가 + CF 자산 없는 경우 worstPath에 추가
    loanGrowthTurns.filter(l => !l.hasCFAsset).forEach(l => {
      worstPath.push({
        turn: l.turn,
        age: l.age,
        cf: Math.round(worstCF),
        asset: Math.round(worstAsset - l.loanDelta),
        note: `💳 대출 $${l.loanDelta.toLocaleString()} 증가 — CF 자산 없는 대출은 부채`,
      });
    });

    // 🆕 worstPath는 turn 순서로 재정렬 (정체/대출을 중간에 삽입했기 때문)
    worstPath.sort((a, b) => a.turn - b.turn);

    // 경로가 없으면 기본값 (시작점 추가)
    const addStartPoint = (path) => {
      if (path.length === 0 || path[0].turn > 1) {
        path.unshift({ turn: 1, age: 20, cf: 0, asset: 0, note: "출발 (20세)" });
      }
      return path;
    };

    // 종료점 추가 (마지막 턴까지 이어지도록)
    const addEndPoint = (path, lastCF, lastAsset) => {
      if (path.length > 0 && path[path.length - 1].turn < totalTurns) {
        path.push({
          turn: totalTurns,
          age: ageAtTurn(totalTurns),
          cf: Math.round(lastCF),
          asset: Math.round(lastAsset),
          note: `${ageAtTurn(totalTurns)}세 — 누적 결과`,
        });
      }
      return path;
    };

    addStartPoint(bestPath);
    addStartPoint(worstPath);
    addEndPoint(bestPath, bestCF, bestAsset);
    addEndPoint(worstPath, worstCF, worstAsset);

    // 모두 중립이면 기본 값 (교육적 메시지)
    if (bestPath.length <= 2 && worstPath.length <= 2 && bestCF === 0 && worstCF === 0 && bestAsset === 0 && worstAsset === 0) {
      return {
        bestPath: [
          { turn: 1, age: 20, cf: 0, asset: 0, note: "출발 (20세)" },
          { turn: Math.floor(totalTurns / 3), age: ageAtTurn(Math.floor(totalTurns / 3)), cf: 100, asset: 5000, note: "저축 + 첫 자산 매수" },
          { turn: Math.floor(totalTurns / 2), age: ageAtTurn(Math.floor(totalTurns / 2)), cf: 300, asset: 15000, note: "현금흐름 자산 확장" },
          { turn: Math.floor(totalTurns * 2 / 3), age: ageAtTurn(Math.floor(totalTurns * 2 / 3)), cf: 600, asset: 35000, note: "사업체 매수 (B사분면)" },
          { turn: totalTurns, age: ageAtTurn(totalTurns), cf: 1000, asset: 60000, note: "다양한 행동이 있었다면" },
        ],
        worstPath: [
          { turn: 1, age: 20, cf: 0, asset: 0, note: "출발 (20세)" },
          { turn: Math.floor(totalTurns / 3), age: ageAtTurn(Math.floor(totalTurns / 3)), cf: 0, asset: 0, note: "저축도 투자도 없음" },
          { turn: Math.floor(totalTurns / 2), age: ageAtTurn(Math.floor(totalTurns / 2)), cf: 0, asset: 0, note: "기회 계속 패스" },
          { turn: totalTurns, age: ageAtTurn(totalTurns), cf: 0, asset: 0, note: "행동 없이 시간만 흘렀다면" },
        ],
      };
    }

    // 경로 압축: 의미있는 turning points 유지하며 6-7개로
    const compressPath = (path) => {
      if (path.length <= 7) return path;
      
      // 첫 점, 마지막 점은 보존
      const first = path[0];
      const last = path[path.length - 1];
      const middle = path.slice(1, -1);
      
      // 중간 점 중 "변화량이 큰" 순으로 5개 선택
      const withDelta = middle.map((p, i) => {
        const prev = i === 0 ? first : middle[i - 1];
        const delta = Math.abs((p.cf - prev.cf) * 100) + Math.abs(p.asset - prev.asset);
        return { ...p, _delta: delta };
      });
      
      // 변화량 top 5 선택 후 턴 순서로 재정렬
      const topChanges = withDelta
        .sort((a, b) => b._delta - a._delta)
        .slice(0, 5)
        .sort((a, b) => a.turn - b.turn);
      
      return [first, ...topChanges.map(({ _delta, ...p }) => p), last];
    };

    return {
      bestPath: compressPath(bestPath),
      worstPath: compressPath(worstPath),
    };
  };

  // ─── 1단계: 디브리핑 분석 (Claude API → JSON) ───
  const runAnalysis = async () => {
    // Phase B: 디브리핑 게이트 체크 (Admin은 자동 통과)
    if (typeof window !== "undefined" && window.__requireDebriefGate && !window.__debriefUnlocked && !window.__userIsAdmin) {
      const ok = await window.__requireDebriefGate();
      if (!ok) return;
    }
    setMode("analysis");
    setLoadingAnalysis(true);
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    setTimeout(() => debRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_SONNET,
          max_tokens: 8192,
          system: `You are a CashFlow board game coaching expert (13 years, 5000+ sessions), deeply grounded in Robert Kiyosaki's teachings and Kevin's Korean educational experience. Respond with ONLY valid JSON. No markdown, no code blocks, no text before or after. Start with { end with }. No trailing commas. Korean content.

CRITICAL INTERPRETATION RULES:
- [이벤트] tag = event card (stock split/reverse split). Card appearance does NOT mean asset ownership.
- [미보유→해당없음] = player did NOT own the stock, so event did NOT apply. Do NOT count as asset.
- [보유중→적용됨] = player DID own the stock, so share count changed.
- Asset ownership is determined ONLY by [구매] tag on deal cards (SMALL DEAL/BIG DEAL/Capital Gain/CashFlow Deal).

═══════════════════════════════════════════════════
🎓 KIYOSAKI PHILOSOPHY (내재화하여 분석에 자연스럽게 녹일 것):

이것은 프롬프트에 인용하거나 "기요사키가 말했다"라고 표현하는 것이 아닙니다.
이 철학을 "당신의 관점"으로 완전히 내재화하여, 모든 분석과 조언에 자연스럽게 배어들게 하세요.

### 기본 10대 철학

1. **ESBI 사분면**
   - E(직장인): 안정 추구, 돈을 위해 일함 → "월급의 함정"
   - S(자영업): 독립적이나 여전히 시간을 팔고 있음
   - B(사업체 소유): 시스템을 가짐, 돈이 일하게 함 → 진정한 자유의 시작
   - I(투자자): 돈이 돈을 낳게 함 → 부의 완성
   → 사업체 카드는 단순한 게임 요소가 아니라 "B사분면으로 건너가는 다리"

2. **자산 vs 부채의 정의**
   - 자산 = 주머니에 돈을 넣어주는 것 (CF +)
   - 부채 = 주머니에서 돈을 빼가는 것 (CF -)
   - 많은 사람이 "자산"이라 믿는 집/차가 실은 부채
   → CF 증가 매수 = 진짜 자산 획득의 순간

3. **현금흐름이 왕**
   - 자본이익(시세차익)은 일회성, 현금흐름은 지속
   - 진짜 부 = passive income이 지출을 넘어서는 순간
   - 주식 매매 차익보다 부동산/사업체의 월 현금흐름이 우선
   → 후반부 주식 매수는 "현금흐름 구축 기회"를 놓친 것

4. **부자는 덜 일하고 더 번다** — 돈의 방향을 바꾸는 것이 핵심

5. **기부의 역설**
   - "주면 돌아온다"는 단순 미덕이 아닌 부의 기술
   - 기부는 현금흐름을 막지 않음 → 오히려 기회를 확장
   - 움츠러드는 사고방식 vs 풍요의 사고방식
   → 기부 선택 = 부자 마인드셋의 증거

6. **실수는 교육** — 빠른 실패 > 느린 성공

7. **두려움과 기회** — 두려움 때문에 기회를 놓친다 → 패스는 굴복

8. **좋은 빚 vs 나쁜 빚**
   - 나쁜 빚: 소비(DOODAD)를 위한 빚
   - 좋은 빚: 자산 매수를 위한 빚 → 다른 사람이 내 빚을 갚아줌

9. **금융 교육의 부재** — 캐쉬플로우 게임 = 자기 자신을 가르치는 가장 좋은 도구

10. **행동이 전부** — "다음 게임에서 어떻게 다르게 할 것인가"가 진짜 학습

═══════════════════════════════════════════════════
💼 핵심 영역 1: 사업가 정신 / 기업가 사고

### 사업 vs 직업의 근본적 차이
- 직업: 내가 없으면 돈이 안 들어옴 (시간-돈 교환)
- 사업: 내가 없어도 돈이 들어옴 (시스템이 일함)
- 캐쉬플로우 게임의 사업체 카드 = "시스템 소유"의 시작

### 기업가의 핵심 사고방식
- **문제 = 기회**: 남들이 불평할 때, 기업가는 해결책을 만든다
- **실패 = 데이터**: 실패는 끝이 아니라 배움의 시작
- **리스크는 계산되는 것**: 무모함이 아닌 계산된 도전
- **다른 사람의 돈(OPM)**: 내 돈이 아닌, 시스템과 레버리지
- **다른 사람의 시간(OPT)**: 고용과 협업의 힘

### 사업체를 평가하는 기준
- 현금흐름 크기보다 "시스템이 얼마나 자동화되어 있는가"
- ROI도 중요하지만 "내 시간이 얼마나 필요한가"가 더 중요
- 시장의 방향성 vs 반짝 트렌드 구분

### 게임에서의 적용
- 사업체 매수 = B사분면 입장권 = 가장 가치 있는 선택
- 사업체 패스 = "나는 아직 준비 안 됐어"의 두려움 표현
- 첫 번째 사업체 = 가장 큰 심리적 장벽

═══════════════════════════════════════════════════
🎮 핵심 영역 2: 보드게임과 인생의 연결

### 캐쉬플로우 게임의 진짜 목적
- 이기기 위함이 아니라 "자신의 금융 사고방식을 발견하기 위함"
- 게임판 위에서의 선택 = 실제 삶의 선택 패턴의 거울
- 승리보다 "왜 그 선택을 했는가"가 중요

### 매 게임이 "인생 예행연습"
- 20대의 선택을 60대에 복기할 수는 없다
- 하지만 게임에서는 40년을 2시간에 압축해서 살아볼 수 있음
- 한 판 = 한 번의 인생 시뮬레이션

### 실패해도 안전한 배움
- 실제 돈 잃지 않고 금융 근육 훈련
- 실수할수록 더 가치 있는 게임
- "진짜 돈"을 잃기 전에 "게임 돈"으로 배우기

### 반복의 힘
- 한 번 하면 재미, 열 번 하면 통찰, 백 번 하면 체득
- 매번 다른 카드 조합 → 매번 새로운 교훈
- 반복할수록 나오는 "나만의 패턴" 인식

### 디브리핑의 가치
- 게임 자체보다 게임 후 성찰이 더 큰 배움
- "내가 왜 그 순간 패스했지?" 같은 질문
- 무의식적 패턴의 의식화

═══════════════════════════════════════════════════
🤝 핵심 영역 3: 공동체 / 팀 / 네트워크

### 혼자 vs 함께의 차이
- 혼자 공부 = 지식
- 함께 공부 = 변화 + 지식
- 부자들은 반드시 네트워크 안에서 자란다

### 부자들의 인맥 특성
- 같은 방향으로 성장하려는 사람들
- 서로 기회를 공유하는 관계
- "끌어올리는" 관계 vs "끌어내리는" 관계

### 코칭딜러/모임의 가치
- 혼자 게임해도 배움이 있지만, 함께하면 10배
- 다른 사람의 선택을 보며 배우기
- 자신의 사각지대 발견
- 가르치면서 배우는 원리 (가장 깊은 학습)

### 한국적 맥락
- 한국인은 공동체 학습에 강함
- 단 "비교"가 아닌 "동행"이 되어야 함
- Kevin의 캐쉬플로우 모임 = 금융 공동체 선언

### 왜 혼자 하면 안 되는가
- 자기 관점에 갇힘
- 지속성 떨어짐
- 동기 부여 한계
→ 진짜 변화는 공동체 안에서

═══════════════════════════════════════════════════
💰 핵심 영역 4: 패시브 인컴 구축 단계

### 쥐 레이스 탈출의 수학
- 단순 공식: **패시브 인컴 > 총 지출**
- 하지만 실행은 복잡: 자산 구축 + 지출 관리 + 시간

### 패시브 인컴 구축 단계 (0 → 10)
**0단계**: 월급 의존 (대부분의 직장인)
**1단계**: 지출 < 수입 (저축 시작)
**2단계**: 첫 자산 매수 (소액 부동산/주식)
**3단계**: 다수 자산 확보 (분산)
**4단계**: 월 $100 패시브 인컴
**5단계**: 월 $500 패시브 인컴
**6단계**: 월 $1,000 패시브 인컴 (의미있는 전환점)
**7단계**: 패시브 인컴이 지출의 50% (쥐 레이스 중반 탈출)
**8단계**: 패시브 인컴 = 지출 (쥐 레이스 탈출!)
**9단계**: 패시브 인컴 > 지출 (자유 + 저축)
**10단계**: 패시브 인컴이 지출의 10배 (완전한 자유)

### 각 단계의 핵심 과제
- 0→1: 지출 통제 (DOODAD 피하기)
- 1→2: 첫 투자의 두려움 극복
- 2→4: 반복 + 확장 (매월 저축 → 매년 자산)
- 4→6: 레버리지 사용 (부동산/대출)
- 6→8: 사업체 매수 (B사분면 진입)
- 8→10: 투자가로 전환 (I사분면)

### 게임에서의 매핑
- 초반 몇 턴: 0→2단계 (기초 쌓기)
- 중반: 3→5단계 (자산 확대)
- 후반: 6→8단계 (쥐 레이스 탈출 시도)
- 쥐 레이스 탈출 = 8단계 완성

### 시간의 중요성
- 단계 건너뛰기 불가능
- 하지만 단계 밟는 속도는 선택 가능
- 평균 수십 년 → 전략적으로 10~15년 가능

═══════════════════════════════════════════════════
🏠 기타 영역: 부동산 투자 원칙
- 현금흐름이 주, 시세차익은 보너스
- 레버리지의 현명한 사용 (본인 자본 적게, 은행 자본 많이)
- 입지 + 임대 수요 평가
- 한국: "전세 신화"의 함정 — 진짜 자산은 월세가 꾸준히 들어오는 것

📈 기타 영역: 주식 투자 원칙
- 트레이딩(단기) vs 인베스팅(장기)
- 차익 실현 매도 = 단기 자본이익
- 배당주 = 소액 패시브 인컴
- 주식은 "자산"이 되기 어려움 — 현금흐름이 약함
- 후반부 주식 투자 = 현금흐름 구축 기회 상실

💸 기타 영역: 세금과 법인
- 개인 소득세 vs 법인세
- 부자들의 "합법적 절세" 전략
- 한국: 종합소득세와 양도세 이해
- 법인 설립 타이밍

🙏 기타 영역: 멘토링 / 교육자
- 혼자 배우기의 한계
- 좋은 멘토는 10년 단축
- 가르치면서 배우는 원리 (강사가 더 배움)
- Kevin의 13년 코칭 경험 반영

⏰ 기타 영역: 시간 vs 돈의 관계
- 시간은 유한, 돈은 무한
- 복리의 힘 (일찍 시작 > 많이 투자)
- 40년이라는 프레임: 20세 시작 vs 30세 시작의 차이
- 시간을 줄이는 것 = 집중 + 레버리지

📊 기타 영역: 인플레이션과 통화
- 현금 보유의 숨은 비용 (매년 가치 감소)
- 인플레이션 방어: 부동산, 금, 우량 주식
- 한국의 부동산 집중 = 인플레이션 직관적 대응

═══════════════════════════════════════════════════
🇰🇷 한국 맥락 (Kevin의 13년 교육 경험):

### Kevin의 핵심 통찰 (13년, 5,000회 강의)
- 한국 직장인의 금융 사각지대
- 부동산 과신 vs 현금흐름 무지
- "월급 = 안정"이라는 신화
- 창업 두려움이 강한 문화적 배경
- 평범한 사람도 가능한 현실적 전략

### 한국인 특유의 함정
- 강남 아파트 신화 (자본이익 중독)
- "공무원이 최고" 사고방식
- 금융 = 어렵고 위험하다는 선입견
- 돈 이야기의 터부시 (가정/친구 사이에서)
- 빠른 결과 기대 (복리 이해 부족)

### 공동체 학습의 힘
- Kevin의 5,000회 강의 = 공동체 기반
- 혼자 가면 빨리, 함께 가면 멀리
- 서로의 선택을 보며 배우기
- 비교가 아닌 동행

### 행동 우선 철학
- "완벽한 계획 세우다 평생 간다"
- "먼저 시작하고 배워라"
- 작은 실행이 모든 변화의 시작

═══════════════════════════════════════════════════
🎯 SELECTION EVALUATION GUIDE (국제캐쉬플로우강사협회 13년):

### Kevin의 핵심 교육 원칙 (13년 현장에서 정립)

1. **20대 초반의 저축은 자산 형성의 씨앗**
   - 20대에는 좋은 기회가 와도 현금이 없어 잡을 수 없음
   - 저축은 과소평가되지만 자산 축적의 직전 단계
   - 20대의 PAYDAY/월급 = "씨앗 모으는 시간"
   - 기회를 패스하는 것도 돈 없으면 어쩔 수 없는 선택 (자책 X)

2. **40대 이전 매각은 CF 감소여도 최상의 선택**
   - 젊을 때는 시세차익으로 원금 확보가 더 중요
   - 차익으로 더 큰 CF 자산을 살 수 있기 때문
   - "현금흐름만이 답"은 아님 — 시기별 전략 다름
   - 차익 실현 = 다음 도약을 위한 발판

3. **CF 마이너스 자산의 재평가**
   - CF 마이너스 = 항상 나쁜 것이 아님
   - 매각 가능성이 있다면 투자 기회
   - 끝까지 보유만 "진짜 부채" (20년 CF-$100 = -$24,000)
   - 매각 타이밍이 핵심

### 분류 기준

1. 최상의 선택 (encourage, celebrate):
   - 사업체(Business/Startup/프랜차이즈) 매수 → B사분면 진입 (가중치 ↑)
   - 기부 선택 → 부자 마인드셋
   - CF 증가 자산 매수 → 진짜 자산 획득
   - 40세 이전 자산 매각 → 차익 실현 (더 큰 CF 만들 원금)
   - CF 마이너스 자산 매수 후 나중에 매각 → 유연한 전략
   - 초반 CF 마이너스 자산 매수 → 현금 확보 전략
   - 매수 후 단기 매도 (3턴 이내) → 빠른 의사결정
   - 20대 PAYDAY = 저축 (자산 형성의 씨앗)

2. 최악의 선택 ("최악"이라는 단어 사용 가능 - 직설적 피드백):
   ⚠️ 최악의 선택의 핵심 2가지 유형:
   
   A) **기회를 잡지 않고 시간을 흘려보내는 선택** (가장 치명적):
      - 좋은 기회(CF+ 자산)를 패스 → "가만히 있기"가 가장 큰 손실
      - 사업체 기회 놓침 → B사분면 입장권 포기 (가중치 ↑)
      - 기부 기회 패스 → 부자 마인드셋 학습 기회 상실
      - 여러 턴 동안 아무 자산도 매수하지 않음 → "월급만 기다리는 삶"
      - 후반부(40세+) 주식 매매만 → 현금흐름 파이프라인 구축 실패
   
   B) **부채를 계속 늘리는 선택**:
      - DOODAD 과소비 → 주머니에서 돈이 빠져나감
      - CF 마이너스 자산을 "끝까지" 보유 → 부채를 자산으로 착각
      - 대출을 늘려도 그 돈으로 CF 자산을 만들지 않음
      - 소비성 대출 (차, 집 등 CF 없는 자산)

3. 중립:
   - 자녀 추가 (BABY) → 선택 영역 아님
   - 다운사이즈 (DOWNSIZED) → 운의 영역
   - 20대 기회 패스 (자금 부족) → 현실적 한계 (저축 단계)

TONE: 따뜻하지만 직설적. 기요사키식 명확한 피드백. "최악의 선택"을 부드럽게 포장하지 말 것. 기회를 놓친 것과 부채를 늘린 것은 분명히 지적. 단, 자책으로 이어지지 않게 "다음엔 어떻게"로 연결.

교육 목적: 
- 구체적 행동 변화 제안
- 기요사키 철학 자연스럽게 녹이기
- 20대의 저축도 인정
- 유연한 전략 (CF vs 차익)
- 시기별 다른 관점

WRITING STYLE:
- 기요사키 철학을 "당신의 시선"으로 녹여내세요 (인용 표현 금지)
- "기요사키가 말했다" / "책에서 배웠듯" 같은 표현 사용 X
- 대신 그 철학이 분석 자체에 배어있게
- 한국 맥락과 Kevin의 교육 관점을 자연스럽게 반영
- 구체적 게임 데이터와 철학을 연결
- Kevin의 강의장에서 수강생에게 직접 들려주는 것처럼

예시:
  ❌ "기요사키는 B사분면이 부의 시작이라 말했다"
  ✅ "35세, 당신은 월급이라는 파이프를 타던 시기에서 
      직접 파이프를 만드는 사람으로 건너간 순간입니다"
  ✅ "20대의 저축은 눈에 띄지 않지만, 
      30대에 첫 자산을 살 수 있게 해주는 씨앗입니다"
  ✅ "32세에 매각하며 CF+$130을 놓친 것처럼 보이지만,
      그 차익으로 더 큰 기회를 노릴 수 있다면 좋은 선택입니다"
═══════════════════════════════════════════════════`,
          messages: [{
            role: "user",
            content: `Analyze this CashFlow ${version} game (${turns} turns). 
CRITICAL: Map ALL ${turns} turns proportionally to a 40-year life (age 20~60). 1 turn = ${Math.round(40/turns*10)/10} years.
${turns <= 10 ? `This is a SHORT game (${turns} turns). Even with few turns, map the full 40-year life journey. Fewer actions = more untapped potential. The coaching insight is: "What could you have done differently? What opportunities did you miss? The real game — and real life — rewards those who ACT, explore diverse strategies, and broaden their perspective."` : ""}

SIMULATION DATA:
${simText}

Return EXACTLY this JSON:
{
  "phases": [
${turns <= 8 ? `    {"title": "출발과 탐색", "age": "20~30세", "turns": "T1~T${Math.ceil(turns*0.3)}", "cards": "what happened", "verdict": "insight"},
    {"title": "선택의 갈림길", "age": "30~40세", "turns": "T${Math.ceil(turns*0.3)+1}~T${Math.ceil(turns*0.6)}", "cards": "what happened", "verdict": "insight"},
    {"title": "결과와 교훈", "age": "40~60세", "turns": "T${Math.ceil(turns*0.6)+1}~T${turns}", "cards": "what happened and what was missed", "verdict": "insight about unexplored opportunities"}`
  : turns <= 12 ? `    {"title": "사회 초년생", "age": "20~30세", "turns": "T1~T${Math.ceil(turns*0.25)}", "cards": "summary", "verdict": "insight"},
    {"title": "자산 형성기", "age": "30~38세", "turns": "T${Math.ceil(turns*0.25)+1}~T${Math.ceil(turns*0.5)}", "cards": "summary", "verdict": "insight"},
    {"title": "성장과 전환", "age": "38~46세", "turns": "T${Math.ceil(turns*0.5)+1}~T${Math.ceil(turns*0.75)}", "cards": "summary", "verdict": "insight"},
    {"title": "수확과 정리", "age": "46~60세", "turns": "T${Math.ceil(turns*0.75)+1}~T${turns}", "cards": "summary", "verdict": "insight"}`
  : `    {"title": "사회 초년생", "age": "20~28세", "turns": "T1~T${Math.ceil(turns*0.2)}", "cards": "summary", "verdict": "insight"},
    {"title": "자산 형성기", "age": "28~36세", "turns": "T${Math.ceil(turns*0.2)+1}~T${Math.ceil(turns*0.4)}", "cards": "summary", "verdict": "insight"},
    {"title": "성장과 위기", "age": "36~44세", "turns": "T${Math.ceil(turns*0.4)+1}~T${Math.ceil(turns*0.6)}", "cards": "summary", "verdict": "insight"},
    {"title": "성숙과 전환", "age": "44~52세", "turns": "T${Math.ceil(turns*0.6)+1}~T${Math.ceil(turns*0.8)}", "cards": "summary", "verdict": "insight"},
    {"title": "수확과 정리", "age": "52~60세", "turns": "T${Math.ceil(turns*0.8)+1}~T${turns}", "cards": "summary", "verdict": "insight"}`}
  ],
  "bestPath": [{"turn":1,"age":20,"cf":0,"asset":0,"note":"최선"}],
  "worstPath": [{"turn":1,"age":20,"cf":0,"asset":0,"note":"최악"}],
  "lessons": ["lesson1", "lesson2", "lesson3", "lesson4", "lesson5"],
  "finalQuestion": "debriefing question",
  "timeAnalysis": {
    "holdingPeriods": [{"asset":"name","buyTurn":1,"buyAge":20,"holdTurns":5,"holdYears":10,"totalCF":0,"insight":"analysis"}],
    "decisionSpeed": [],
    "opportunityCost": "one sentence",
    "timeMessage": "core message about time and assets"
  }
}

RULES:
- phases: distribute ALL turns across phases proportionally. Empty phases should note "이 시기에는 행동이 없었다 — 기회를 놓치고 있었다" as verdict
- bestPath/worstPath: 간단히 placeholder만 넣으세요 (코드에서 실제 데이터로 대체됨). 3~4개 entry로 충분.
- lessons: 5 insights. For short games, emphasize: "다양한 전략 탐색", "행동의 중요성", "관점을 넓히는 것이 진짜 게임의 시작"
- finalQuestion: thought-provoking, encourage action and broader perspective
- timeAnalysis.timeMessage: emphasize that assets need TIME, and that the real wealth comes from taking action and exploring diverse approaches`
          }]
        })
      });

      // HTTP 에러 체크
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.error("API HTTP error:", response.status, errBody.substring(0, 300));
        setError(`API 오류 (${response.status}). 잠시 후 다시 시도해주세요.`);
        setMode(null);
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.error("Response JSON parse failed:", jsonErr);
        setError("API 응답 형식 오류. 재시도해주세요.");
        setMode(null);
        return;
      }

      if (data.content && data.content.length > 0) {
        const raw = data.content.filter(c => c.type === "text").map(c => c.text).join("");
        let jsonStr = raw;
        // 코드블록 제거
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        // JSON 시작/끝 위치 찾기
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        // trailing comma 제거
        jsonStr = jsonStr.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
        jsonStr = jsonStr.trim();
        
        // 잘린 JSON 복구
        let openBraces = 0, openBrackets = 0;
        for (const ch of jsonStr) {
          if (ch === "{") openBraces++;
          else if (ch === "}") openBraces--;
          else if (ch === "[") openBrackets++;
          else if (ch === "]") openBrackets--;
        }
        if (openBrackets > 0 || openBraces > 0) {
          const lastValid = Math.max(jsonStr.lastIndexOf('"'), jsonStr.lastIndexOf('}'), jsonStr.lastIndexOf(']'));
          if (lastValid > 0) jsonStr = jsonStr.substring(0, lastValid + 1);
          jsonStr = jsonStr.replace(/,\s*$/, "");
          for (let b = 0; b < openBrackets; b++) jsonStr += "]";
          for (let b = 0; b < openBraces; b++) jsonStr += "}";
        }

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.phases && parsed.lessons) {
            // 🎯 Best/Worst 경로를 코드 계산값으로 덮어쓰기 (AI 추측 대신 실제 데이터)
            const computed = computeBestWorstPaths(results, turns);
            parsed.bestPath = computed.bestPath;
            parsed.worstPath = computed.worstPath;
            console.log("[디브리핑] Best/Worst 경로 재계산 완료:", {
              bestFinal: computed.bestPath[computed.bestPath.length - 1],
              worstFinal: computed.worstPath[computed.worstPath.length - 1],
            });
            
            setAnalysis(parsed);
            setMode("analysis-done");
            saveReport(parsed, "", null);
          } else {
            setError("분석 구조가 올바르지 않습니다. 재시도해주세요.");
            setMode(null);
          }
        } catch (parseErr) {
          console.error("JSON parse error:", parseErr);
          console.error("Raw (first 300):", raw.substring(0, 300));
          setError(`AI 응답 파싱 실패 (${raw.length}자). 재시도해주세요.`);
          setMode(null);
        }
      } else if (data.error) {
        console.error("API error:", data.error);
        setError(data.error.message || "API 오류가 발생했습니다.");
        setMode(null);
      } else {
        console.error("Unexpected response:", JSON.stringify(data).substring(0, 300));
        setError("예상치 못한 응답 형식입니다. 재시도해주세요.");
        setMode(null);
      }
    } catch (e) {
      console.error("Fetch error:", e);
      setError("네트워크 오류: " + (e.message || "API에 연결할 수 없습니다. 인터넷 연결을 확인해주세요."));
      setMode(null);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // ─── 2단계: 총평 리포트 ───
  const startFeedback = () => setMode("select");

  const runFree = () => {
    setTier(0);
    // 캐시 있으면 재사용
    if (feedbackCache[0]) {
      setFreeText(feedbackCache[0]);
      setMode("feedback");
      return;
    }
    const text = generateFreeFeedback(results, turns);
    setFreeText(text);
    setFeedbackCache(prev => ({ ...prev, 0: text }));
    setMode("feedback");
    updateReportFeedback(text, 0);
  };

  const runPaid = async (selectedTier) => {
    setTier(selectedTier);
    // 캐시 있으면 재사용 — API 호출 안 함
    if (feedbackCache[selectedTier]) {
      setPaidText(feedbackCache[selectedTier]);
      setError("");
      setLoading(false);
      setMode("feedback");
      return;
    }

    setLoading(true);
    setError("");
    setPaidText("");
    setMode("feedback");

    const context = analysis ? buildCompactSummary(analysis) : "";

    try {
      const pText = await generatePaidFeedback({
        tier: selectedTier, version, turns, simText, extraContext: context,
      });
      setPaidText(pText);
      setFeedbackCache(prev => ({ ...prev, [selectedTier]: pText }));
      updateReportFeedback(pText, selectedTier);
    } catch (e) {
      setError(e.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 티어 버튼 클릭 → 확인 화면으로 (즉시 실행하지 않음)
  const selectTierForConfirm = (selectedTier) => {
    setPendingTier(selectedTier);
    setError("");
  };

  // 확인 화면에서 "실행" 버튼 클릭 시
  const executeTier = () => {
    if (pendingTier === null) return;
    const t = pendingTier;
    setPendingTier(null);
    if (t === 0) runFree();
    else runPaid(t);
  };

  // ─── 리포트 텍스트 생성 (복사/저장용) ───
  const [showReport, setShowReport] = useState(false);

  const buildReportText = () => {
    if (!analysis) return "";
    const feedbackText = paidText || freeText;
    const bp = analysis.bestPath || [];
    const wp = analysis.worstPath || [];
    const ta = analysis.timeAnalysis;
    const dateStr = new Date().toLocaleDateString("ko-KR");
    const line = "━".repeat(40);

    let r = "";
    r += `${line}\n`;
    r += `  CASHFLOW DEBRIEFING REPORT\n`;
    r += `  CashFlow ${version} | ${turns} Turns | ${dateStr}\n`;
    r += `  Powered by CASHFLOW KOREA\n`;
    r += `${line}\n\n`;

    r += `■ 1. 전 생애 자산 흐름 요약\n\n`;
    (analysis.phases || []).forEach(p => {
      r += `  【${p.title}】 ${p.age} (${p.turns})\n`;
      r += `  ${p.cards}\n`;
      r += `  → ${p.verdict}\n\n`;
    });

    r += `${line}\n\n`;
    r += `■ 2. 최상의 선택 vs 최악의 선택\n\n`;
    if (bp.length > 0) {
      r += `  ▲ 최상의 선택 경로\n`;
      bp.forEach(b => r += `    T${b.turn}(${b.age}세) CF:$${b.cf} 투자:$${b.asset} — ${b.note}\n`);
      r += `\n`;
    }
    if (wp.length > 0) {
      r += `  ▼ 최악의 선택 경로\n`;
      wp.forEach(w => r += `    T${w.turn}(${w.age}세) CF:$${w.cf} 투자:$${w.asset} — ${w.note}\n`);
      r += `\n`;
    }

    r += `${line}\n\n`;
    r += `■ 3. 이 게임이 가르쳐 준 5가지\n\n`;
    (analysis.lessons || []).forEach((l, i) => r += `  ${i+1}. ${l}\n`);
    r += `\n`;

    if (ta) {
      r += `${line}\n\n`;
      r += `■ 4. 시간 분석\n\n`;
      (ta.holdingPeriods || []).forEach(h => {
        r += `  📦 ${h.asset} — ${h.holdYears}년 보유, 누적 CF $${fmtNum((h.totalCF||0))}\n`;
        r += `     ${h.insight}\n\n`;
      });
      if (ta.timeMessage) r += `  💡 ${ta.timeMessage}\n\n`;
    }

    r += `${line}\n\n`;
    r += `■ 최종 디브리핑 질문\n\n`;
    r += `  "${analysis.finalQuestion}"\n\n`;

    if (feedbackText) {
      r += `${line}\n\n`;
      r += `■ 코칭 총평\n\n`;
      r += `${feedbackText}\n\n`;
    }

    r += `${line}\n`;
    r += `CASHFLOW KOREA | www.cashflowkorea.com | ${dateStr}\n`;
    return r;
  };

  const copyReport = () => {
    const text = buildReportText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => alert("리포트가 클립보드에 복사되었습니다.\n메모장이나 문서에 붙여넣기 하세요."));
    } else {
      // 폴백: textarea 선택
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("리포트가 클립보드에 복사되었습니다.");
    }
  };

  const downloadReport = () => {
    const text = buildReportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CashFlow_Debrief_${version}_${turns}T_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const phaseColors = ["#10b981","#3b82f6","#8b5cf6","#f59e0b","#ef4444"];

  // ─── 렌더: 초기 상태 ───
  if (!mode && !error) {
    return (
      <div ref={debRef} style={{ marginTop: 24 }}>
        <button onClick={runAnalysis} style={{
          width: "100%", padding: 18, borderRadius: 14, border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#fff",
          fontSize: 18, fontWeight: 800, letterSpacing: 1,
        }}>
          📊 디브리핑 분석 시작
        </button>
      </div>
    );
  }

  // ─── 렌더: 분석 로딩 ───
  if (loadingAnalysis) {
    return (
      <div ref={debRef} style={{ marginTop: 24 }}>
        <DiceSpinner
          size="lg"
          message={`AI가 ${turns}턴의 인생을 분석하고 있습니다...`}
          subMessage="5단계 자산흐름 + 최상의 선택/최악의 선택 비교 + 5가지 교훈 생성 중"
        />
        <div style={{ textAlign: "center" }}>
          <button onClick={() => {
            if (abortRef.current) abortRef.current.abort();
            setLoadingAnalysis(false);
            setMode(null);
            setError("");
          }} style={{
            marginTop: 4, padding: "10px 30px", borderRadius: 10, border: "1px solid #ef444440",
            background: "#ef444415", color: "#fca5a5", cursor: "pointer", fontSize: 13, fontWeight: 700,
          }}>⏹ 멈추고 게임으로 돌아가기</button>
        </div>
      </div>
    );
  }

  // ─── 렌더: 에러 (분석 실패 시) ───
  if (error && !analysis) {
    return (
      <div ref={debRef} style={{ marginTop: 24 }}>
        <div style={{ padding: 16, borderRadius: 12, background: "#7f1d1d20", border: "1px solid #ef444430", marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: "#fca5a5", margin: "0 0 4px" }}>오류: {error}</p>
          <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>AI 응답이 올바른 JSON 형식이 아니었습니다. 재시도하면 대부분 해결됩니다.</p>
        </div>
        <button onClick={() => { setError(""); runAnalysis(); }} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>🔄 다시 분석하기</button>
      </div>
    );
  }

  // ─── 렌더: 분석 완료 + 총평 선택/결과 ───
  const renderAnalysis = () => {
    if (!analysis) return null;
    const bp = analysis.bestPath || [];
    const wp = analysis.worstPath || [];
    const hasPaths = bp.length > 0 && wp.length > 0;

    // 🔧 턴 시간축 기반으로 bp/wp 정합성 맞추기
    const allTurns = Array.from(new Set([
      ...bp.map(b => b.turn),
      ...wp.map(w => w.turn),
    ])).sort((a, b) => a - b);

    // ageAtTurn 공식: 40년을 totalTurns로 나누기 (computeBestWorstPaths와 동일)
    const yearsPerTurn = Math.round(40 / Math.max(turns, 1) * 10) / 10;
    const ageAtTurnUI = (t) => Math.round(20 + (t - 0.5) * yearsPerTurn);

    // 각 턴에서 가장 최근(이전까지 누적된) 값 추출 헬퍼
    const getValueAtTurn = (path, turn) => {
      // 누적값만 반환 (age는 턴 기반으로 다시 계산)
      let cf = 0, asset = 0, note = "";
      for (const p of path) {
        if (p.turn <= turn) {
          cf = p.cf || 0;
          asset = p.asset || 0;
          note = p.note || "";
        } else break;
      }
      return { cf, asset, note };
    };

    // 통합 시간축 데이터
    const unifiedRows = allTurns.map(turn => {
      const b = getValueAtTurn(bp, turn);
      const w = getValueAtTurn(wp, turn);
      const bEvent = bp.find(p => p.turn === turn);
      const wEvent = wp.find(p => p.turn === turn);
      return {
        turn,
        age: ageAtTurnUI(turn),  // 🔧 올바른 공식으로 계산
        bCF: b.cf,
        bAsset: b.asset,
        wCF: w.cf,
        wAsset: w.asset,
        bNote: bEvent?.note || "",
        wNote: wEvent?.note || "",
      };
    });

    // 🔧 max 값 계산 - bp/wp 모두 포함 (정합성)
    const allCFValues = unifiedRows.flatMap(r => [Math.abs(r.bCF), Math.abs(r.wCF)]);
    const allAssetValues = unifiedRows.flatMap(r => [Math.abs(r.bAsset), Math.abs(r.wAsset)]);
    const maxCF = Math.max(...allCFValues, 100);
    const maxAsset = Math.max(...allAssetValues, 1000);

    // 최종 누적값
    const lastRow = unifiedRows[unifiedRows.length - 1] || { bCF: 0, bAsset: 0, wCF: 0, wAsset: 0 };
    const lastBest = { cf: lastRow.bCF, asset: lastRow.bAsset };
    const lastWorst = { cf: lastRow.wCF, asset: lastRow.wAsset };

    return (
      <>
        {/* ── 1. 전 생애 자산 흐름 요약 ── */}
        <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 14 }}>📋 전 생애 자산 흐름 요약</div>
          {(analysis.phases || []).map((p, i) => (
            <div key={i} style={{ marginBottom: i < 4 ? 14 : 0, paddingBottom: i < 4 ? 14 : 0, borderBottom: i < 4 ? "1px solid #1e1e2e" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: phaseColors[i] + "20", color: phaseColors[i] }}>{p.title} ({p.age})</span>
                <span style={{ fontSize: 10, color: "#52525b" }}>{p.turns}</span>
              </div>
              <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 0", lineHeight: 1.5 }}>{p.cards}</p>
              <p style={{ fontSize: 12, color: phaseColors[i], margin: 0, fontWeight: 600 }}>{p.verdict}</p>
            </div>
          ))}
        </div>

        {/* ── 2. 최상의 선택 vs 최악의 선택 비교 그래프 ── */}
        <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 6 }}>📈 최상의 선택 vs 최악의 선택</div>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 14 }}>같은 카드를 받았을 때, 선택에 따라 현금흐름이 어떻게 달라지는지 비교합니다.</div>
          {hasPaths ? (<>
          {/* 탭 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[{ key:"cf", label:"월 현금흐름" }, { key:"asset", label:"누적 투자원금" }].map(t => (
              <button key={t.key} onClick={() => setBestWorstTab(t.key)} style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: bestWorstTab === t.key ? "1px solid #3b82f6" : "1px solid #27272a",
                background: bestWorstTab === t.key ? "#3b82f620" : "#18181b",
                color: bestWorstTab === t.key ? "#93c5fd" : "#71717a",
              }}>{t.label}</button>
            ))}
          </div>
          {/* 범례 */}
          <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 11, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 14, height: 10, borderRadius: 2, background: "#22c55e" }}></span>
              <span style={{ color: "#a1a1aa" }}>최상의 선택 (누적)</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 14, height: 10, borderRadius: 2, background: "#ef4444" }}></span>
              <span style={{ color: "#a1a1aa" }}>최악의 선택 (누적)</span>
            </span>
          </div>
          <div style={{ marginBottom: 14, fontSize: 9, color: "#52525b", textAlign: "right" }}>
            최대값: {bestWorstTab === "cf" ? `$${fmtNum(maxCF)}/월` : `$${fmtNum(maxAsset)}`} · 막대 길이는 비율
          </div>

          {/* 턴별 막대 */}
          <div>
            {unifiedRows.map((row, i) => {
              const max = bestWorstTab === "cf" ? (maxCF || 1) : (maxAsset || 1);
              const bVal = bestWorstTab === "cf" ? row.bCF : row.bAsset;
              const wVal = bestWorstTab === "cf" ? row.wCF : row.wAsset;
              const bW = bVal === 0 ? 0 : Math.max(2, (Math.abs(bVal) / max) * 100);
              const wW = wVal === 0 ? 0 : Math.max(2, (Math.abs(wVal) / max) * 100);
              const fmt = v => {
                if (v === 0) return "—";
                return bestWorstTab === "cf"
                  ? (v >= 0 ? `+$${fmtNum(Math.round(v))}` : `-$${fmtNum(Math.abs(Math.round(v)))}`)
                  : (v >= 0 ? `$${fmtNum(Math.round(v))}` : `-$${fmtNum(Math.abs(Math.round(v)))}`);
              };
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "#52525b", minWidth: 52 }}>T{row.turn} {row.age}세</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, minHeight: 10 }}>
                        {bW > 0 ? (
                          <div style={{ height: 10, borderRadius: 3, background: "#22c55e", width: `${bW}%` }}></div>
                        ) : (
                          <div style={{ height: 10, width: 20, borderLeft: "2px dotted #52525b" }}></div>
                        )}
                        <span style={{ fontSize: 9, color: bVal === 0 ? "#52525b" : "#86efac", whiteSpace: "nowrap", fontWeight: 700 }}>{fmt(bVal)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 10 }}>
                        {wW > 0 ? (
                          <div style={{ height: 10, borderRadius: 3, background: wVal < 0 ? "#ef4444" : "#ef444480", width: `${wW}%` }}></div>
                        ) : (
                          <div style={{ height: 10, width: 20, borderLeft: "2px dotted #52525b" }}></div>
                        )}
                        <span style={{ fontSize: 9, color: wVal === 0 ? "#52525b" : "#fca5a5", whiteSpace: "nowrap", fontWeight: 700 }}>{fmt(wVal)}</span>
                      </div>
                    </div>
                  </div>
                  {row.bNote && (
                    <div style={{ paddingLeft: 58, fontSize: 9, color: "#4ade80", marginTop: 3 }}>▲ {row.bNote}</div>
                  )}
                  {row.wNote && (
                    <div style={{ paddingLeft: 58, fontSize: 9, color: "#f87171", marginTop: 1 }}>▼ {row.wNote}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 격차 요약 */}
          <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#18181b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 9, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>최상의 선택</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>
                {bestWorstTab === "cf"
                  ? `${lastBest.cf >= 0 ? "+" : ""}$${fmtNum(Math.round(lastBest.cf))}/월`
                  : `$${fmtNum(Math.round(lastBest.asset))}`}
              </div>
            </div>
            <div style={{ fontSize: 18, color: "#52525b", fontWeight: 700 }}>vs</div>
            <div style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 9, color: "#fca5a5", fontWeight: 700, marginBottom: 4 }}>최악의 선택</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>
                {bestWorstTab === "cf"
                  ? `${lastWorst.cf >= 0 ? "+" : ""}$${fmtNum(Math.round(lastWorst.cf))}/월`
                  : `$${fmtNum(Math.round(lastWorst.asset))}`}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 10, padding: 10, background: "#18181b", borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: "#fafafa", fontWeight: 700 }}>
              같은 카드, 다른 선택 —{" "}
              {bestWorstTab === "cf"
                ? <>월 현금흐름 격차: <span style={{ color: "#fbbf24" }}>${fmtNum(Math.abs(Math.round(lastBest.cf - lastWorst.cf)))}</span></>
                : <>누적 투자원금 격차: <span style={{ color: "#fbbf24" }}>${fmtNum(Math.abs(Math.round(lastBest.asset - lastWorst.asset)))}</span></>
              }
            </span>
          </div>
          </>) : (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>비교 데이터가 생성되지 않았습니다.</p>
              <p style={{ fontSize: 10, color: "#52525b" }}>
                최상 경로 {bp.length}개 · 최악 경로 {wp.length}개
              </p>
              {bp.length === 0 && wp.length === 0 && (
                <p style={{ fontSize: 10, color: "#52525b", marginTop: 6 }}>
                  턴 기록이 부족하거나 분석에 오류가 있을 수 있습니다. 다시 분석을 시도해주세요.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── 3. 5가지 교훈 + 최종 질문 ── */}
        <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 14 }}>💡 이 게임이 가르쳐 준 5가지</div>
          {(analysis.lessons || []).map((lesson, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 4 ? 12 : 0 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: "#f59e0b", minWidth: 20, textAlign: "center" }}>{i + 1}</span>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: "#d4d4d8", margin: 0 }}>{lesson}</p>
            </div>
          ))}
        </div>

        {/* ── 4. 시간 분석 (턴 기반 + 결정 속도) ── */}
        {analysis.timeAnalysis && (
          <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #a78bfa30", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#a78bfa", marginBottom: 14 }}>⏱ 시간 분석 — 자산에 시간을 줘야 합니다</div>

            {/* 보유 기간 분석 */}
            {analysis.timeAnalysis.holdingPeriods && analysis.timeAnalysis.holdingPeriods.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 8 }}>자산 보유 기간 & 누적 현금흐름</div>
                {analysis.timeAnalysis.holdingPeriods.map((h, i) => (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "#1a1a2e", marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7" }}>{h.asset}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#a78bfa20", color: "#c4b5fd" }}>{h.holdYears}년 보유</span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#22c55e20", color: "#86efac" }}>${fmtNum((h.totalCF || 0))}</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: "#a1a1aa", margin: 0, lineHeight: 1.5 }}>{h.insight}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 결정 속도 분석 */}
            {analysis.timeAnalysis.decisionSpeed && analysis.timeAnalysis.decisionSpeed.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 8 }}>결정 속도 분석</div>
                {analysis.timeAnalysis.decisionSpeed.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "#1a1a2e", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#27272a", color: "#a1a1aa" }}>T{d.turn}</span>
                    <span style={{ fontSize: 11, color: "#e4e4e7", flex: 1 }}>{d.card}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: d.seconds <= 10 ? "#86efac" : d.seconds <= 20 ? "#fde68a" : "#fca5a5" }}>{d.seconds}초</span>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: d.action === "buy" ? "#22c55e20" : d.action === "pass" ? "#ef444420" : "#f59e0b20",
                      color: d.action === "buy" ? "#86efac" : d.action === "pass" ? "#fca5a5" : "#fde68a",
                    }}>{d.action === "buy" ? "구매" : d.action === "sell" ? "판매" : "패스"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 기회비용 */}
            {analysis.timeAnalysis.opportunityCost && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ef444410", border: "1px solid #ef444420", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>놓친 기회의 비용</div>
                <p style={{ fontSize: 12, color: "#e4e4e7", margin: 0, lineHeight: 1.6 }}>{analysis.timeAnalysis.opportunityCost}</p>
              </div>
            )}

            {/* 시간의 힘 메시지 */}
            {analysis.timeAnalysis.timeMessage && (
              <div style={{ padding: "12px 14px", borderRadius: 10, borderLeft: "3px solid #a78bfa", background: "#a78bfa08" }}>
                <p style={{ fontSize: 13, color: "#e4e4e7", margin: 0, lineHeight: 1.7, fontWeight: 500 }}>{analysis.timeAnalysis.timeMessage}</p>
              </div>
            )}
          </div>
        )}

        <div style={{ padding: "20px", borderRadius: 14, textAlign: "center", background: "linear-gradient(135deg, #3b82f610, #8b5cf610)", border: "1px solid #3b82f630", marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", margin: "0 0 6px" }}>최종 디브리핑 질문</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: "#fafafa", margin: 0, lineHeight: 1.7 }}>{analysis.finalQuestion}</p>
        </div>
      </>
    );
  };

  // ─── 렌더: 총평 선택 화면 ───
  const renderFeedbackSelect = () => {
    // 확인 단계: 티어를 하나 골랐으면 확인 화면만 표시
    if (pendingTier !== null) {
      const t = TIERS[pendingTier];
      const isCached = !!feedbackCache[pendingTier];
      return (
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: "16px 18px", borderRadius: 14, border: `2px solid ${t.color}`, background: t.color + "08", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: t.color }}>{t.label}</span>
                {t.model && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.model === "Opus" ? "#f59e0b20" : "#3b82f620", color: t.model === "Opus" ? "#f59e0b" : "#93c5fd" }}>{t.model}</span>}
                {isCached && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#22c55e20", color: "#86efac" }}>✓ 저장됨</span>}
              </div>
              <span style={{ fontSize: 20, fontWeight: 900, color: t.color }}>{t.price}</span>
            </div>
            <p style={{ fontSize: 12, color: "#a1a1aa", margin: "0 0 6px", lineHeight: 1.6 }}>{t.sub}</p>
            <p style={{ fontSize: 11, color: "#71717a", margin: 0 }}>{t.chars} 분량</p>
            {isCached && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "#22c55e10", border: "1px solid #22c55e30" }}>
                <p style={{ fontSize: 11, color: "#86efac", margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                  ✅ 이전에 받은 피드백이 저장되어 있습니다. 다시 보기를 누르면 API 호출 없이 바로 표시됩니다 (추가 비용 없음).
                </p>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setPendingTier(null); }}
              style={{
                flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #27272a",
                background: "transparent", color: "#a1a1aa", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >← 뒤로</button>
            <button
              onClick={executeTier}
              style={{
                flex: 2, padding: "12px", borderRadius: 10, border: "none",
                background: t.color, color: pendingTier === 0 ? "#000" : "#fff",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
              }}
            >
              {isCached ? "📖 저장된 피드백 보기" : pendingTier === 0 ? "▶ 피드백 실행" : "▶ 결제하고 피드백 받기"}
            </button>
          </div>
        </div>
      );
    }

    // 기본: 티어 목록 표시
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>📝</div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: "#fafafa", margin: 0 }}>총평 리포트</h3>
          <p style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>스토리텔링 기반 코칭 피드백</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TIERS.map((t, i) => {
            const isCached = !!feedbackCache[i];
            return (
              <button key={i} onClick={() => selectTierForConfirm(i)} style={{
                padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                border: `1px solid ${t.color}40`, background: "#0d0d14", transition: "all 0.2s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: t.color }}>{t.label}</span>
                    {t.model && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.model === "Opus" ? "#f59e0b20" : "#3b82f620", color: t.model === "Opus" ? "#f59e0b" : "#93c5fd" }}>{t.model}</span>}
                    {isCached && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#22c55e20", color: "#86efac" }}>✓ 저장됨</span>}
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 900, color: t.color }}>{t.price}</span>
                </div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>{t.sub}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── 렌더: 총평 결과 ───
  const renderFeedbackResult = () => {
    const currentTier = TIERS[tier];
    const displayText = tier === 0 ? freeText : paidText;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: currentTier.color + "15", border: `1px solid ${currentTier.color}30` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: currentTier.color }}>{currentTier.label}</span>
          <button onClick={() => { setMode("analysis-done"); setTier(null); setPaidText(""); setFreeText(""); setError(""); }} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#71717a", cursor: "pointer", fontSize: 10 }}>다른 피드백</button>
        </div>
        {loading ? (
          <DiceSpinner message="AI 코칭 피드백 생성 중..." />
        ) : error && !displayText ? (
          <div style={{ padding: 14, borderRadius: 10, background: "#7f1d1d20", border: "1px solid #ef444430" }}>
            <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }}>{error}</p>
            <button onClick={() => runPaid(tier)} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>다시 시도</button>
          </div>
        ) : displayText ? (
          <>
            <div style={{ padding: "20px 18px", borderRadius: 12, background: "#111118", border: "1px solid #27272a" }}>
              <div style={{ fontSize: 13, lineHeight: 2, color: "#d4d4d8", whiteSpace: "pre-wrap" }}>{displayText}</div>
            </div>
            {tier < 2 && (
              <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, textAlign: "center", background: TIERS[tier + 1].color + "10", border: `1px solid ${TIERS[tier + 1].color}30` }}>
                <p style={{ fontSize: 11, color: "#a1a1aa", margin: "0 0 6px" }}>더 깊은 분석이 필요하시다면</p>
                <button onClick={() => { setMode("analysis-done"); setTier(null); setPaidText(""); setFreeText(""); setError(""); setPendingTier(tier + 1); }} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: TIERS[tier + 1].color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {TIERS[tier + 1].label} ({TIERS[tier + 1].price})
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    );
  };

  // ─── 메인 렌더 ───
  return (
    <div ref={debRef} style={{ marginTop: 24 }}>
      {/* 분석 결과가 있으면 항상 표시 */}
      {analysis && renderAnalysis()}

      {/* 리포트 내보내기 버튼 */}
      {analysis && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={copyReport} style={{
            flex: 1, padding: "12px 8px", borderRadius: 10, border: "1px solid #3b82f630", cursor: "pointer",
            background: "#3b82f610", color: "#93c5fd", fontSize: 12, fontWeight: 700,
          }}>📋 복사</button>
          <button onClick={downloadReport} style={{
            flex: 1, padding: "12px 8px", borderRadius: 10, border: "1px solid #22c55e30", cursor: "pointer",
            background: "#22c55e10", color: "#86efac", fontSize: 12, fontWeight: 700,
          }}>📥 다운로드</button>
          <button onClick={() => setShowReport(!showReport)} style={{
            flex: 1, padding: "12px 8px", borderRadius: 10, border: "1px solid #f59e0b30", cursor: "pointer",
            background: "#f59e0b10", color: "#fde68a", fontSize: 12, fontWeight: 700,
          }}>{showReport ? "접기 ▲" : "전체보기 ▼"}</button>
        </div>
      )}

      {/* 리포트 전체 보기 */}
      {showReport && analysis && (
        <div style={{ padding: "16px", borderRadius: 12, background: "#111118", border: "1px solid #27272a", marginBottom: 16, maxHeight: 400, overflow: "auto" }}>
          <pre style={{ fontSize: 11, lineHeight: 1.8, color: "#d4d4d8", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "'Pretendard Variable','Noto Sans KR',monospace" }}>{buildReportText()}</pre>
        </div>
      )}

      {/* 분석 완료 후 총평 영역 */}
      {analysis && (mode === "analysis-done" || mode === "select") && renderFeedbackSelect()}
      {analysis && mode === "feedback" && renderFeedbackResult()}

      {/* ── 지난 리포트 ── */}
      {savedReports.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => setShowSaved(!showSaved)} style={{
            width: "100%", padding: 12, borderRadius: 10, border: "1px solid #27272a", cursor: "pointer",
            background: "#111118", color: "#71717a", fontSize: 12, fontWeight: 700,
          }}>
            📂 지난 리포트 ({savedReports.length}개) {showSaved ? "▲" : "▼"}
          </button>

          {showSaved && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {savedReports.map(r => {
                const tierLabel = r.feedbackTier === 0 ? "무료" : r.feedbackTier === 1 ? "$9 상세" : r.feedbackTier === 2 ? "$20 프리미엄" : null;
                return (
                <div key={r.key} style={{ padding: "10px 14px", borderRadius: 10, background: "#111118", border: `1px solid ${viewingSaved?.key === r.key ? "#3b82f650" : "#27272a"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#fafafa" }}>CashFlow {r.version} · {r.turns}턴</span>
                      <div style={{ fontSize: 9, color: "#52525b", marginTop: 1 }}>{r.date} {r.time || ""}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                        {tierLabel && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: r.feedbackTier === 0 ? "#22c55e15" : r.feedbackTier === 1 ? "#3b82f615" : "#f59e0b15", color: r.feedbackTier === 0 ? "#86efac" : r.feedbackTier === 1 ? "#93c5fd" : "#fde68a" }}>{tierLabel} 총평</span>}
                        {!r.feedback && <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "#f59e0b10", color: "#f59e0b" }}>총평 미생성</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setViewingSaved(viewingSaved?.key === r.key ? null : r)} style={{
                        padding: "3px 10px", borderRadius: 6, border: "1px solid #3b82f630", background: "#3b82f610", color: "#93c5fd", fontSize: 10, cursor: "pointer",
                      }}>{viewingSaved?.key === r.key ? "닫기" : "보기"}</button>
                      <button onClick={() => deleteReport(r.key)} style={{
                        padding: "3px 8px", borderRadius: 6, border: "1px solid #ef444430", background: "#ef444410", color: "#fca5a5", fontSize: 10, cursor: "pointer",
                      }}>삭제</button>
                    </div>
                  </div>

                  {/* 저장된 리포트 상세 보기 */}
                  {viewingSaved?.key === r.key && r.analysis && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #27272a" }}>
                      {(r.analysis.phases || []).map((p, pi) => (
                        <div key={pi} style={{ marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#93c5fd" }}>{p.title} ({p.age})</span>
                          <p style={{ fontSize: 10, color: "#a1a1aa", margin: "2px 0" }}>{p.cards}</p>
                          <p style={{ fontSize: 10, color: "#86efac", margin: 0 }}>{p.verdict}</p>
                        </div>
                      ))}
                      {(r.analysis.lessons || []).length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e1e2e" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#fde68a" }}>5가지 교훈:</span>
                          {r.analysis.lessons.map((l, li) => (
                            <p key={li} style={{ fontSize: 10, color: "#a1a1aa", margin: "2px 0" }}>{li+1}. {l}</p>
                          ))}
                        </div>
                      )}
                      {r.analysis.finalQuestion && (
                        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "#3b82f610" }}>
                          <p style={{ fontSize: 10, color: "#93c5fd", margin: 0 }}>질문: {r.analysis.finalQuestion}</p>
                        </div>
                      )}
                      {r.feedback && (
                        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "#22c55e08", border: "1px solid #22c55e20" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#86efac" }}>총평 ({tierLabel}):</span>
                          <p style={{ fontSize: 10, color: "#a1a1aa", margin: "4px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{r.feedback.substring(0, 500)}{r.feedback.length > 500 ? "..." : ""}</p>
                        </div>
                      )}

                      {/* 유료 리포트 업그레이드 버튼 */}
                      {r.simText && (r.feedbackTier === null || r.feedbackTier === 0) && (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "linear-gradient(135deg, #3b82f608, #f59e0b08)", border: "1px solid #3b82f620" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", marginBottom: 6 }}>📝 더 깊은 분석을 받아보세요</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {[
                              { tier: 1, label: "상세 $9", color: "#3b82f6" },
                              { tier: 2, label: "프리미엄 $20", color: "#f59e0b" },
                            ].filter(t => (r.feedbackTier ?? -1) < t.tier).map(t => (
                              <button key={t.tier} onClick={async () => {
                                try {
                                  const fb = await generatePaidFeedback({
                                    tier: t.tier,
                                    version: r.version,
                                    turns: r.turns,
                                    simText: r.simText,
                                    extraContext: r.analysis ? buildCompactSummary(r.analysis) : "",
                                  });
                                  const updated = { ...r, feedback: fb, feedbackTier: t.tier };
                                  await window.storage?.set(r.key, JSON.stringify(updated));
                                  setSavedReports(prev => prev.map(x => x.key === r.key ? updated : x));
                                  setViewingSaved(updated);
                                  alert("총평이 생성되었습니다!");
                                } catch (e) { alert(e.message || "네트워크 오류"); }
                              }} style={{
                                flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.color}40`,
                                background: t.color + "10", color: t.color, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              }}>{t.label}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {r.feedbackTier === 1 && r.simText && (
                        <div style={{ marginTop: 8, textAlign: "center" }}>
                          <button onClick={async () => {
                            try {
                              const fb = await generatePaidFeedback({
                                tier: 2,
                                version: r.version,
                                turns: r.turns,
                                simText: r.simText,
                                extraContext: r.analysis ? buildCompactSummary(r.analysis) : "",
                              });
                              const updated = { ...r, feedback: fb, feedbackTier: 2 };
                              await window.storage?.set(r.key, JSON.stringify(updated));
                              setSavedReports(prev => prev.map(x => x.key === r.key ? updated : x));
                              setViewingSaved(updated);
                              alert("프리미엄 총평이 생성되었습니다!");
                            } catch (e) { alert(e.message || "네트워크 오류"); }
                          }} style={{
                            padding: "6px 16px", borderRadius: 6, border: "1px solid #f59e0b40",
                            background: "#f59e0b10", color: "#fde68a", fontSize: 10, fontWeight: 700, cursor: "pointer",
                          }}>⬆ 프리미엄 $20으로 업그레이드</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
