"use client";

import { useState, useRef, useEffect, useMemo } from "react";
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
import { 
  saveGameSession, 
  saveGameSessionImmediate,
  loadGameSession, 
  deleteGameSession,
  hasGameSession,
  clearLocal as clearLocalGameSession,
} from "@/lib/gameSession";

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
  if (i % 2 === 1) BOARD.push({ pos: i, type: "OPPORTUNITY", label: "기회", icon: "🎯", color: "#3b82f6" });
  else if (i === 2 || i === 10 || i === 18) BOARD.push({ pos: i, type: "DOODAD", label: "두대드", icon: "🛍️", color: "#f59e0b" });
  else if (i === 4) BOARD.push({ pos: i, type: "CHARITY", label: "기부", icon: "🤝", color: "#a855f7" });
  else if (i === 12) BOARD.push({ pos: i, type: "BABY", label: "베이비", icon: "👶", color: "#ec4899" });
  else if (i === 20) BOARD.push({ pos: i, type: "DOWNSIZED", label: "다운사이즈", icon: "⬇️", color: "#ef4444" });
  else if (i === 8 || i === 16 || i === 24) BOARD.push({ pos: i, type: "MARKET", label: "마켓", icon: "📊", color: "#8b5cf6" });
  else if (i === 6 || i === 14 || i === 22) BOARD.push({ pos: i, type: "PAYDAY", label: "페이데이", icon: "💰", color: "#22c55e" });
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
  { sub:"주택 3/2", desc:"수영장 완벽한 3/2 주택. 중상류층 거주 지역. -6% ROI. 착수금 $20,000.", down:"$20K", cf:"-$100" },
  { sub:"주택 3/2", desc:"이혼으로 인해 3/2 주택 매물. 30% ROI. 착수금 $20,000.", down:"$20K", cf:"+$500" },
  { sub:"주택 3/2", desc:"사업자가 3/2 주택을 팔아 사업자금으로. 26% ROI. 착수금 $7,000.", down:"$7K", cf:"+$150" },
  { sub:"주택 3/2", desc:"상류층 대출 없는 완벽한 집. 30% ROI. 착수금 $60,000.", down:"$60K", cf:"+$1,500" },
  { sub:"주택 3/2", desc:"정리 해고 된 매니저가 내놓음. 40% ROI. 착수금 $9,000.", down:"$9K", cf:"+$300" },
  { sub:"주택 3/2", desc:"다른 지역으로 이주한 상인이 관리한 집. 40% ROI. 착수금 $12,000.", down:"$12K", cf:"+$400" },
  { sub:"주택 3/2", desc:"투자가치가 있는 매물. 45% ROI. 착수금 $8,000.", down:"$8K", cf:"+$300" },
  { sub:"주택 3/2", desc:"골프코스 근처 3/2 주택. 51% ROI. 착수금 $7,000.", down:"$7K", cf:"+$300" },
  { sub:"주택 3/2", desc:"은퇴한 젊은부부가 전원 생활 위해 내놓음. 40% ROI. 착수금 $9,000.", down:"$9K", cf:"+$300" },
  { sub:"주택 3/2", desc:"도심 한가운데 고즈넉한 3/2 주택. 40% ROI. 착수금 $12,000.", down:"$12K", cf:"+$400" },
  { sub:"2가구 주택", desc:"동네에서 가장 좋은 2가구 주택. 24% ROI. 착수금 $7,000.", down:"$7K", cf:"+$140" },
  { sub:"2가구 주택", desc:"늘어나는 가족 때문에 매물. 36% ROI. 착수금 $8,000.", down:"$8K", cf:"+$240" },
  { sub:"2가구 주택", desc:"병원비 충당 위해 내놓은 매물. 40% ROI. 착수금 $12,000.", down:"$12K", cf:"+$400" },
  { sub:"4가구 주택", desc:"공원 근처 급매물. 48% ROI. 착수금 $8,000.", down:"$8K", cf:"+$320" },
  { sub:"4가구 주택", desc:"대학교 근처 4가구. 24% ROI. 착수금 $20,000.", down:"$20K", cf:"+$400" },
  { sub:"4가구 주택", desc:"고속도로 옆 넓은 4가구. 40% ROI. 착수금 $15,000.", down:"$15K", cf:"+$500" },
  { sub:"4가구 주택", desc:"좋은 환경 4가구 주택. 48% ROI. 착수금 $15,000.", down:"$15K", cf:"+$600" },
  { sub:"4가구 주택", desc:"재번성 지역 4가구. 48% ROI. 착수금 $20,000.", down:"$20K", cf:"+$800" },
  { sub:"4가구 주택", desc:"강제 경매 4가구. 56% ROI. 착수금 $16,000.", down:"$16K", cf:"+$750" },
  { sub:"4가구 주택", desc:"서류완비, 전부 임차 중. 75% ROI. 착수금 $32,000.", down:"$32K", cf:"+$2,000" },
  { sub:"8가구 주택", desc:"소유주 은퇴 좋은 가격. 29% ROI. 착수금 $40,000.", down:"$40K", cf:"+$950" },
  { sub:"8가구 주택", desc:"법적 문제로 급매. 48% ROI. 착수금 $40,000.", down:"$40K", cf:"+$1,600" },
  { sub:"8가구 주택", desc:"합리적 가격 매물. 51% ROI. 착수금 $40,000.", down:"$40K", cf:"+$1,700" },
  { sub:"8가구 주택", desc:"전문직 사업자금 마련. 64% ROI. 착수금 $32,000.", down:"$32K", cf:"+$1,700" },
  { sub:"아파트 단지", desc:"24채 아파트 단지. 54% ROI. 착수금 $75,000.", down:"$75K", cf:"+$3,400" },
  { sub:"아파트 단지", desc:"12채 아파트 단지. 58% ROI. 착수금 $50,000.", down:"$50K", cf:"+$2,400" },
  { sub:"아파트 단지", desc:"60채 정부 보조아파트. 66% ROI. 착수금 $100,000.", down:"$100K", cf:"+$11,000" },
  { sub:"PC 게임방", desc:"30개의 PC 게임방 급매물. 96% ROI. 착수금 $20,000.", down:"$20K", cf:"+$1,600" },
  { sub:"세탁소", desc:"번화한 도로 옆 성공한 세탁소. 100% ROI. 착수금 $30,000.", down:"$30K", cf:"+$2,500" },
  { sub:"문구 도매", desc:"성공한 문구 도매사업. 81% ROI. 착수금 $40,000.", down:"$40K", cf:"+$2,700" },
  { sub:"빨래방", desc:"교차로 옆 성공한 4개의 빨래방. 86% ROI. 착수금 $25,000.", down:"$25K", cf:"+$1,800" },
  { sub:"도넛 프랜차이즈", desc:"세계적 도넛 회사 체인점. 60% ROI. 착수금 $150,000.", down:"$150K", cf:"+$4,700" },
  { sub:"세차장", desc:"가족 불화로 급매. 36% ROI. 착수금 $50,000.", down:"$50K", cf:"+$1,500" },
  { sub:"피자 프랜차이즈", desc:"건강식 피자 체인. 60% ROI. 착수금 $100,000.", down:"$100K", cf:"+$5,000" },
  { sub:"작은 모텔(B&B)", desc:"리조트 지역 많은 단골. 40% ROI. 착수금 $30,000.", down:"$30K", cf:"+$1,000" },
  { sub:"작은 쇼핑몰", desc:"파산으로 은행에서 인수한 매물. 19% ROI. 착수금 $50,000.", down:"$50K", cf:"+$800" },
  { sub:"24,000평 땅", desc:"주거지 용도 빈 공터. 상업지역 전환 가능성. 0% ROI.", down:"$20K", cf:"$0" },
  { sub:"동업(자동차리스)", desc:"중고 자동차 리스 사업 확장. 40% ROI. 착수금 $30,000.", down:"$30K", cf:"+$1,000" },
  { sub:"동업(냉동피자)", desc:"피자 체인 냉동 피자 사업 확장. 48% ROI. 착수금 $20,000.", down:"$20K", cf:"+$800" },
  { sub:"동업(병원확장)", desc:"의사가 병원 확장. 48% ROI. 착수금 $25,000.", down:"$25K", cf:"+$1,000" },
  { sub:"동업(샌드위치)", desc:"샌드위치 가게 확장. 60% ROI. 착수금 $30,000.", down:"$30K", cf:"+$1,500" },
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
  { desc:"이자율 하락! 3/2 주택 소유 시 총 비용 +$50,000에 매각 가능.", sell:"$50,000", special:"+$50K 매각" },
  { desc:"국제 금융 위기!! 모든 주식 상장 폐지!", sell:null, special:"주식 전량 폐지" },
  { desc:"동업 파트너가 지분 가격의 3배에 매수.", sell:"지분×3" },
  { desc:"동업 파트너가 지분 가격의 5배에 매수.", sell:"지분×5" },
  { desc:"동업 파트너가 지분 가격의 2배에 매수.", sell:"지분×2" },
  { desc:"소프트웨어 회사를 $100,000에 매수 원함.", sell:"$100K" },
  { desc:"작은 상품 판매 회사를 $80,000에 매수.", sell:"$80K" },
  { desc:"작은 사업체 매출 증가. 현금흐름 +$250.", sell:null, special:"CF +$250" },
  { desc:"작은 사업체 매출 증가. 현금흐름 +$400.", sell:null, special:"CF +$400" },
  { desc:"노후 배관 교체. $2,000 지불.", sell:null, special:"수리비 $2K" },
];

const DOODADS = [
  { desc:"주정차 단속 지역에 주차", amount:"$100" },
  { desc:"식품 조리기 구입", amount:"$150" },
  { desc:"쇼핑 중독! 새 손목시계 구매", amount:"$150" },
  { desc:"회계 감사 — 국세청에 $750", amount:"$750" },
  { desc:"가족 휴가!", amount:"$2,000" },
  { desc:"골프 2라운드 플레이", amount:"$200" },
  { desc:"친구와 커피 한잔", amount:"$30" },
  { desc:"일시 해고 소문 — 학원 등록금과 교재비", amount:"$220" },
  { desc:"행운의 복권 구입 — 꽝!", amount:"$100" },
  { desc:"쇼핑! 멋진 모조 보석 구입", amount:"$350" },
  { desc:"주정차 단속 지역에 주차", amount:"$100" },
  { desc:"가구 거래 — 당근에서 6인용 테이블", amount:"$150" },
  { desc:"자동차 타이어 교체", amount:"$300" },
  { desc:"저녁 외식", amount:"$100" },
  { desc:"자동차 에어컨 고장", amount:"$700" },
  { desc:"비행기 에어쇼 구경", amount:"$150" },
  { desc:"취미로 프리다이빙을 배운다", amount:"$500" },
  { desc:"볼링을 치다", amount:"$50" },
  { desc:"새로운 운동화를 구매", amount:"$100" },
  { desc:"새 테니스 라켓 구입", amount:"$200" },
  { desc:"콘서트를 가다!", amount:"$250" },
  { desc:"카푸치노 커피 기계를 구입", amount:"$350" },
  { desc:"결혼 기념일", amount:"$500" },
  { desc:"고등학교 동창회", amount:"$250" },
  { desc:"새 아이폰 구입", amount:"$1,400" },
  { desc:"친구와 함께 브런치", amount:"$50" },
  { desc:"카지노에 가다!", amount:"$500" },
  { desc:"치과 방문", amount:"$200" },
  { desc:"홈씨어터 구축", amount:"$500" },
  { desc:"새 옷을 구입", amount:"$250" },
  { desc:"집을 페인트칠", amount:"$600" },
  { desc:"지역 화가의 새 그림을 구매", amount:"$200" },
  { desc:"공기청정기를 구매", amount:"$1,500" },
  { desc:"새 볼링공 구입", amount:"$100" },
  { desc:"자녀의 치아 교정 (자녀 있을 때)", amount:"$2,000", condition:"자녀" },
  { desc:"아들의 대학 등록금 (자녀 있을 때)", amount:"$3,000", condition:"자녀" },
  { desc:"딸의 결혼식 (자녀 있을 때)", amount:"$5,000", condition:"자녀" },
  { desc:"아이들에게 장난감 (아이당 $100)", amount:"아이당$100", condition:"자녀" },
  { desc:"생일 파티! 놀이공원 (인원×$100)", amount:"인원×$100", condition:"자녀" },
  { desc:"일체형 세탁 건조기! 부채 $5,000 + 이자 $120/월", amount:"부채$5K", condition:"부채발생" },
  { desc:"새 캠핑 카라반! 선불$1K + 대출$17K + 이자$340/월", amount:"대출$17K", condition:"부채발생" },
  { desc:"새 낚시대 구입", amount:"$300" },
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
const RE_BIZ = /사업|게임방|세탁소|문구|빨래방|프랜차이즈|도넛|세차|피자|모텔|쇼핑몰|마케팅|NW|채권|신탁|로열티|프로그램|원고|히트곡/;
const RE_CHILD_DOODAD = /자녀|아이|아들|딸|장난감|생일|치아교정|대학|결혼|강아지|과외|코딩|중고차/;
const RE_STOCK_SPLIT = /무상증자|분할/;
const RE_STOCK_REVERSE = /감자|1\/2|1\/4/;
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

const parseNum = (str) => parseInt(String(str || "0").replace(RE_NUM, "")) || 0;
const parseNumNeg = (str) => parseInt(String(str || "0").replace(RE_NUM_NEG, "")) || 0;

// ── 캐시된 숫자 포맷터 (toLocaleString 97회 → fmtNum 호출로 대체) ──
const _numFmt = new Intl.NumberFormat("en-US");
const fmtNum = (n) => _numFmt.format(n || 0);

// ── MARKET 매칭 검증 테이블 (컴포넌트 외부, 렌더마다 재생성 방지) ──
const SELL_RULES = [
  { descRe: /콘도/, assetRe: /콘도/, msg: "보유 중인 콘도가 없습니다." },
  { descRe: /주택.*3\/2|3\/2.*주택|주택.*매수|주택.*팔라/, assetRe: /주택/, msg: "보유 중인 3/2 주택이 없습니다." },
  { descRe: /다가구|가구당/, assetRe: /가구|다가구/, msg: "보유 중인 다가구 주택이 없습니다." },
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
  OPPORTUNITY: { bg: "#1e3a5f", border: "#3b82f6", text: "#93c5fd" },
  PAYDAY: { bg: "#14532d", border: "#22c55e", text: "#86efac" },
  MARKET: { bg: "#3b0764", border: "#8b5cf6", text: "#c4b5fd" },
  DOODAD: { bg: "#451a03", border: "#f59e0b", text: "#fde68a" },
  CHARITY: { bg: "#581c87", border: "#a855f7", text: "#d8b4fe" },
  BABY: { bg: "#831843", border: "#ec4899", text: "#f9a8d4" },
  DOWNSIZED: { bg: "#7f1d1d", border: "#ef4444", text: "#fca5a5" },
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
   salary=월급, cashflow=월현금흐름, expense=총지출, childCost=아이1명당양육비
═══════════════════════════════════════════════════ */
const JOBS = [
  { name:"관리인", salary:1600, cashflow:600, expense:1000, childCost:100, savings:600 },
  { name:"비서", salary:2500, cashflow:800, expense:1700, childCost:100, savings:700 },
  { name:"정비공", salary:2000, cashflow:700, expense:1300, childCost:100, savings:700 },
  { name:"트럭운전사", salary:2500, cashflow:800, expense:1700, childCost:200, savings:800 },
  { name:"배송기사", salary:2900, cashflow:720, expense:2180, childCost:200, savings:400 },
  { name:"경찰관", salary:3000, cashflow:1100, expense:1900, childCost:200, savings:500 },
  { name:"간호사", salary:3100, cashflow:1100, expense:2000, childCost:200, savings:500 },
  { name:"교사", salary:3300, cashflow:1200, expense:2100, childCost:200, savings:1200 },
  { name:"비즈니스 매니저", salary:4600, cashflow:1600, expense:3000, childCost:300, savings:400 },
  { name:"공학자", salary:4900, cashflow:1700, expense:3200, childCost:200, savings:400 },
  { name:"요리사", salary:5300, cashflow:1800, expense:3500, childCost:450, savings:600 },
  { name:"변호사", salary:7500, cashflow:2400, expense:5100, childCost:400, savings:2000 },
  { name:"비행기 조종사", salary:9500, cashflow:3500, expense:6000, childCost:400, savings:2500 },
  { name:"의사", salary:13200, cashflow:4900, expense:8300, childCost:700, savings:3500 },
  { name:"운동선수", salary:23000, cashflow:7200, expense:15800, childCost:1500, savings:4000 },
];

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
          <button onClick={() => onLoan(loanAmount)} disabled={loanAmount < 1000} style={{
            width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: loanAmount >= 1000 ? "pointer" : "default",
            background: loanAmount >= 1000 ? "#f59e0b" : "#27272a", color: loanAmount >= 1000 ? "#000" : "#52525b", fontSize: 12, fontWeight: 800,
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
  const [charityTurns, setCharityTurns] = useState(0); // 기부 후 남은 주사위2개 턴
  const [passedPaydays, setPassedPaydays] = useState(0); // 이번 턴에 지나간 페이데이 수
  const [cellType, setCellType] = useState("");
  const [dealType, setDealType] = useState("deal1");
  const [selectedCard, setSelectedCard] = useState(null);
  const [action, setAction] = useState(null);
  const [shares, setShares] = useState("");
  const [sellPriceInput, setSellPriceInput] = useState(0);
  const [rightsPrice, setRightsPrice] = useState(0);
  const [downsizeRestTurns, setDownsizeRestTurns] = useState(0); // 다운사이즈 이후 남은 휴식 턴 수 (0~2)
  const [gameEnded, setGameEnded] = useState(false); // 쥐경주 탈출 시 true
  const [playSessionId, setPlaySessionId] = useState(null); // 후기 버튼용 세션 ID
  const [totalCF, setTotalCF] = useState(0);
  const [cash, setCash] = useState(0); // 보유 현금
  const [bankLoan, setBankLoan] = useState(0); // 은행 대출 잔액 ($1,000 단위)
  const [loanInterest, setLoanInterest] = useState(0); // 월 이자 지출 (대출 × 10%)
  const [assets, setAssets] = useState([]); // {turn,name,cf,type,shares?,price?,loan?,downPay?,card,time}
  const [babies, setBabies] = useState(0);
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

  // 타이머: 직업 선택 시 시작, timerOn일 때만 카운트
  useEffect(() => {
    if (!job || !startTime || !timerOn) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [job, startTime, timerOn]);

  const jobData = job ? JOBS.find(j => j.name === job) : null;
  const { baseExpense, childTotal, totalExpense, passiveIncome, escaped } = useMemo(() => {
    const be = jobData ? jobData.expense : 0;
    const ct = jobData ? babies * jobData.childCost : 0;
    const te = be + ct + loanInterest;
    return { baseExpense: be, childTotal: ct, totalExpense: te, passiveIncome: totalCF, escaped: totalCF > te };
  }, [jobData, babies, loanInterest, totalCF]);

  const cardList = useMemo(() => 
    cellType === "OPPORTUNITY" ? (dealType === "deal1" ? deck.deal1 : deck.deal2) : cellType === "MARKET" ? deck.market : cellType === "DOODAD" ? deck.doodad : []
  , [cellType, dealType, deck]);

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

    // 지나간 페이데이만큼 현금 추가 (도착 칸이 페이데이면 나중에 턴 기록 시 처리)
    if (payCount > 0 && jobData) {
      const paydayAmount = jobData.cashflow + totalCF - loanInterest;
      setCash(prev => prev + paydayAmount * payCount);
    }

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
    let transaction = "";
    let cashDelta = 0;

    // ── 현금 변동 계산 ──
    if (cellType === "OPPORTUNITY" && action === "buy" && selectedCard) {
      const cf = parseNumNeg(selectedCard.cf);
      const type = getAssetType(selectedCard);
      const down = isStock(selectedCard) ? extractStockCost(selectedCard, sharesNum) : extractDown(selectedCard);
      const loan = isStock(selectedCard) ? 0 : extractLoan(selectedCard);
      cashDelta = -down;
      if (type === "주식") {
        transaction = `${selectedCard.sub||"주식"} ${sharesNum}주 구매 @${selectedCard.price} → -$${fmtNum(down)}`;
        setAssets(prev => [...prev, { id: makeAssetId(), turn: currentTurn, name: selectedCard.sub || "주식", cf: 0, type, shares: sharesNum, price: selectedCard.price || "", downPay: down, loan: 0, card: selectedCard, time: timerOn ? elapsed : null }]);
      } else {
        transaction = `${selectedCard.sub||"자산"} 구매 착수금 -$${fmtNum(down)} / CF +$${cf}/월`;
        setTotalCF(prev => prev + cf);
        setAssets(prev => [...prev, { id: makeAssetId(), turn: currentTurn, name: selectedCard.sub || selectedCard.desc?.substring(0, 20), cf, type, downPay: down, loan, card: selectedCard, time: timerOn ? elapsed : null }]);
      }
    }
    if (cellType === "OPPORTUNITY" && action === "sell" && selectedCard && isStock(selectedCard)) {
      const sellTotal = sellPriceInput * sharesNum;
      cashDelta = sellTotal;
      const sName = (selectedCard.sub || "").trim();
      transaction = `${selectedCard.sub||"주식"} ${sharesNum}주 매각 @$${sellPriceInput} → +$${fmtNum(sellTotal)}`;
      setAssets(prev => reduceStockShares(prev, sName, sharesNum));
    }
    if (cellType === "OPPORTUNITY" && action === "rights" && selectedCard) {
      cashDelta = rightsPrice;
      transaction = `권리판매 +$${fmtNum(rightsPrice)}`;
    }
    if (cellType === "OPPORTUNITY" && action === "pass") {
      transaction = `${selectedCard?.sub||"카드"} 패스`;
    }
    // ── 무상증자/감자 자동 적용 ──
    let splitApplied = null; // 무상증자/감자 카드: true=보유중적용, false=미보유해당없음
    if (cellType === "OPPORTUNITY" && action === "split" && selectedCard && isSplitCard(selectedCard)) {
      const mult = getSplitMultiplier(selectedCard);
      const stockName = (selectedCard.sub || "").trim();
      const owned = assets.filter(a => a.type === "주식" && a.shares > 0 && a.name.includes(stockName));
      if (owned.length > 0) {
        const totalBefore = owned.reduce((s, a) => s + (a.shares || 0), 0);
        const totalAfter = Math.floor(totalBefore * mult);
        setAssets(prev => prev.map(a => {
          if (a.type === "주식" && a.shares > 0 && a.name.includes(stockName)) {
            return { ...a, shares: Math.floor(a.shares * mult) };
          }
          return a;
        }));
        transaction = mult >= 1
          ? `${selectedCard.sub} 무상증자 ${totalBefore}주 → ${totalAfter}주 (×${mult})`
          : `${selectedCard.sub} 감자 ${totalBefore}주 → ${totalAfter}주 (×${mult})`;
        splitApplied = true;
      } else {
        transaction = `${selectedCard.sub} ${mult >= 1 ? "무상증자" : "감자"} — 보유 없음, 해당 없음`;
        splitApplied = false;
      }
    }
    // 매각된 자산 정보 (entry 기록용, AI 브리핑 정확성 확보)
    let soldAssetInfo = null;

    if (cellType === "MARKET" && action === "sell" && selectedCard) {
      // MARKET 카드는 부동산/사업 매각만 존재 (주식 카드 없음)
      // 매각가 추출: sell 필드 우선, 없으면 desc에서 $금액 패턴 추출
      let sellPrice = 0;
      if (selectedCard.sell) {
        sellPrice = parseNum(selectedCard.sell);
      } else {
        // desc에서 매각가 패턴 추출: "$숫자,숫자" 형태만 (3/2 같은 숫자 혼동 방지)
        const priceMatch = (selectedCard.desc || "").match(/\$([0-9]{1,3}(?:,[0-9]{3})*)/);
        if (priceMatch) sellPrice = parseInt(priceMatch[1].replace(/,/g, "")) || 0;
      }
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
      if (sellAsset) {
        const assetLoan = sellAsset.loan || 0;
        const netProceeds = sellPrice > 0 ? sellPrice - assetLoan : 0;
        cashDelta = Math.max(0, netProceeds);
        transaction = `${sellAsset.name}(${sellAsset.type}) 매각 $${fmtNum(sellPrice)} - 대출 $${fmtNum(assetLoan)} = +$${fmtNum(cashDelta)}`;
        // AI 브리핑과 기록 표시용: 실제 매각된 자산 정보 보존
        soldAssetInfo = { name: sellAsset.name, type: sellAsset.type, cf: sellAsset.cf, sellPrice };
        const targetId = sellAsset.id;
        setTotalCF(prev => prev - sellAsset.cf);
        // ID 기반으로 자산 제거 — 참조 동등성 의존 제거 (CF 이중 차감 방지)
        setAssets(prev => prev.filter(a => a.id !== targetId));
      }
    }
    if (cellType === "MARKET" && (action === "hold" || action === "na")) {
      transaction = action === "na" ? "MARKET 해당없음" : "MARKET 홀딩";
    }
    if (cellType === "DOODAD" && selectedCard) {
      const isChildCard = RE_CHILD_DOODAD.test(selectedCard.desc || "");
      const amt = parseNum(selectedCard.amount);
      const actualAmt = isChildCard ? amt * babies : amt;
      cashDelta = -actualAmt;
      transaction = isChildCard ? `DOODAD ${selectedCard.desc?.substring(0,15)} 자녀${babies}명×$${amt} = -$${fmtNum(actualAmt)}` : `DOODAD -$${fmtNum(actualAmt)}`;
    }
    if (cellType === "PAYDAY") {
      const paydayAmount = jobData ? (jobData.cashflow + totalCF - loanInterest) : 0;
      cashDelta = paydayAmount;
      transaction = `PayDay +$${fmtNum(paydayAmount)}`;
    }
    if (cellType === "CHARITY") {
      if (action === "charity_yes") {
        const totalIncome = (jobData?.salary || 0) + totalCF;
        const charityAmount = Math.round(totalIncome * 0.1);
        cashDelta = -charityAmount;
        transaction = `기부 -$${fmtNum(charityAmount)} → 주사위2개×3턴`;
        setCharityTurns(3);
      } else {
        transaction = "기부 안함";
      }
    }
    if (cellType === "BABY") {
      setBabies(prev => Math.min(prev + 1, 3));
      transaction = `아기 탄생 → 양육비 +$${fmtNum(jobData?.childCost)}/월`;
    }
    if (cellType === "DOWNSIZED") {
      cashDelta = -totalExpense;
      transaction = `다운사이즈 — 한 달 총지출 -$${fmtNum(totalExpense)} (이후 2턴 휴식)`;
      setDownsizeRestTurns(2); // 이 턴은 지출 차감, 다음 2턴은 주사위 없이 휴식
    }

    // 현금 적용
    if (cashDelta !== 0) setCash(prev => prev + cashDelta);

    // PayDay 통과 기록 (도착 칸 외에 지나간 PayDay)
    const paydayLogs = [];
    if (passedPaydays > 0) {
      const paydayAmount = jobData ? (jobData.cashflow + totalCF - loanInterest) : 0;
      for (let p = 0; p < passedPaydays; p++) {
        paydayLogs.push({ turn: currentTurn, cellType: "PAYDAY_PASS", boardPos, dice: 0, passedPaydays: 0, dealType: "PAYDAY", card: null, action: null, shares: null, time: timerOn ? elapsed : null, decisionSec: null, cashSnapshot: cash + cashDelta + paydayAmount * (p + 1), transaction: `PayDay 통과 +$${fmtNum(paydayAmount)}` });
      }
    }

    const entry = {
      turn: currentTurn, cellType, boardPos,
      dice: parseInt(diceInput) || 0, passedPaydays,
      dealType: cellType === "OPPORTUNITY" ? (dealType === "deal1" ? deck.deal1Name : deck.deal2Name) : cellType,
      card: selectedCard, action, shares: isStock(selectedCard) ? sharesNum : null,
      time: timerOn ? elapsed : null, decisionSec,
      cashSnapshot: cash + cashDelta, transaction,
      splitApplied, // 무상증자/감자: true=보유중적용, false=미보유해당없음, null=해당없음
      soldAsset: soldAssetInfo, // MARKET 매각 시 실제 매각된 자산 정보 (AI 브리핑용)
    };

    setTurnLog(prev => [...prev, ...paydayLogs, entry]);
    setCurrentTurn(prev => prev + 1);
    setSelectedCard(null); setAction(null); setShares(""); setCardSelectedAt(null); setSellPriceInput(0); setRightsPrice(0);
    setDiceInput(""); setDiceConfirmed(false); setPassedPaydays(0); setCellType("");
    setDealType("deal1"); setViewTab("input");
    if (charityTurns > 0 && cellType !== "CHARITY") setCharityTurns(prev => prev - 1);

    // 쥐경주 탈출 체크: 패시브인컴 > 총지출 (이번 턴 변경분 반영)
    let cfDelta = 0;
    if (cellType === "OPPORTUNITY" && action === "buy" && selectedCard && !isStock(selectedCard)) {
      cfDelta = parseNumNeg(selectedCard.cf);
    } else if (cellType === "MARKET" && action === "sell" && selectedCard) {
      // MARKET 매각 시 자산 CF가 제거됨 → sellAsset.cf 만큼 감소
      // (위에서 setTotalCF(prev => prev - sellAsset.cf) 이미 호출됨)
      // 탈출 체크용 newTotalCF는 그 변경을 미리 반영해야 함
      const desc = (selectedCard.desc || "") + (selectedCard.sell || "") + (selectedCard.special || "");
      let soldAsset = null;
      for (const rule of SELL_RULES) {
        if (rule.descRe.test(desc)) {
          soldAsset = findLastSafe(assets, a => a.type !== "주식" && rule.assetRe.test(a.name));
          if (soldAsset) break;
        }
      }
      if (!soldAsset) soldAsset = findLastSafe(assets, a => a.type !== "주식");
      cfDelta = soldAsset ? -soldAsset.cf : 0;
    }
    const newTotalCF = totalCF + cfDelta;
    // 이번 턴에 BABY라면 양육비가 늘어나 총지출이 증가함
    const babiesAfter = cellType === "BABY" ? Math.min(babies + 1, 3) : babies;
    const newExpense = (jobData ? jobData.expense : 0) + (jobData ? babiesAfter * jobData.childCost : 0) + loanInterest;
    // 대회 모드에서는 자동 탈출 금지 (수동 "탈출 선언" 버튼으로만 탈출)
    if (newTotalCF > newExpense && !gameEnded && !isContestMode) {
      setGameEnded(true);
    }
  };

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
      simText: buildPromptText(gameResults, version, turnLog.length),
      // Phase B 추가 필드
      isContest: isContestMode,
      escaped: gameEnded, // 쥐경주 탈출 여부
      escapeTimeSec: gameEnded ? elapsed : null,
      passiveIncomeAtEscape: gameEnded ? passiveIncome : null,
      jobAtEscape: gameEnded ? job : null,
    };
  };

  // ── 게임 상태 초기화 (중복 제거) ──
  const resetGame = () => {
    setJob(null); setTurnLog([]); setCurrentTurn(1); setBoardPos(0);
    setDiceInput(""); setDiceConfirmed(false);
    setCharityTurns(0); setPassedPaydays(0);
    setTotalCF(0); setCash(0); setBankLoan(0); setLoanInterest(0);
    setAssets([]); setBabies(0);
    setSelectedCard(null); setAction(null); setShares("");
    setSellPriceInput(0); setRightsPrice(0);
    setViewTab("input"); setCellType("");
    setStartTime(null); setElapsed(0); setCardSelectedAt(null);
    setGameEnded(false); setDownsizeRestTurns(0);
    setReSellIdx(0); setReSellPrice(""); setStockSellQty({}); setStockSellPrice({});
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
    
    try {
      setJob(state.job || null);
      setTurnLog(state.turnLog || []);
      setCurrentTurn((state.turnLog?.length || 0) + 1);
      setBoardPos(state.boardPos || 0);
      setCash(state.cash || 0);
      setTotalCF(state.totalCF || 0);
      setBankLoan(state.bankLoan || 0);
      setLoanInterest(state.loanInterest || 0);
      setAssets(state.assets || []);
      setBabies(state.babies || 0);
      setPlaySessionId(state.playSessionId || `play-${Date.now()}`);
      if (state.timerOn !== undefined) setTimerOn(state.timerOn);
      if (state.startTime) setStartTime(state.startTime);
      setCharityTurns(state.charityTurns || 0);
      setDownsizeRestTurns(state.downsizeRestTurns || 0);
      setGameEnded(state.gameEnded || false);
      
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
            <button key={j.name} onClick={() => { setJob(j.name); setTimerOn(true); setStartTime(Date.now()); setCash(j.savings + j.cashflow); setPlaySessionId(`play-${Date.now()}`); }} style={{
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
        {/* 월별 현금흐름 계산 */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, padding: "6px 0", marginBottom: 4, borderTop: "1px solid #27272a" }}>
          <span style={{ fontSize: 10, color: "#71717a" }}>월별 현금흐름</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: (jobData ? jobData.cashflow + totalCF - loanInterest : 0) >= 0 ? "#22c55e" : "#ef4444" }}>
            ${fmtNum((jobData ? jobData.cashflow + totalCF - loanInterest : 0))}/월
          </span>
          <span style={{ fontSize: 9, color: "#52525b" }}>(CF ${fmtNum(jobData?.cashflow || 0)} {totalCF >= 0 ? "+" : ""}${fmtNum(totalCF)}{loanInterest > 0 ? ` -${fmtNum(loanInterest)}이자` : ""})</span>
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
                setTurnLog(prev => [...prev, { turn: currentTurn, cellType: "DOWNSIZED_REST", boardPos, dice: 0, passedPaydays: 0, dealType: "DOWNSIZED", card: null, action: "rest", shares: null, time: timerOn ? elapsed : null, decisionSec: null, cashSnapshot: cash, transaction: `다운사이즈 휴식 (잔여 ${downsizeRestTurns - 1}턴)` }]);
                setCurrentTurn(prev => prev + 1);
                setDownsizeRestTurns(prev => prev - 1);
                if (charityTurns > 0) setCharityTurns(prev => prev - 1);
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
                  {cellType === "BABY" && <p style={{ fontSize: 12, color: "#f9a8d4", margin: "0 0 8px" }}>👶 아기 탄생! 양육비 ${fmtNum(jobData?.childCost)}/월이 총지출에 추가됩니다.</p>}
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
                      <button key={d.k} onClick={() => { setDealType(d.k); setSelectedCard(null); }} style={{
                        flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: dealType === d.k ? `1.5px solid ${d.c}` : "1px solid #27272a",
                        background: dealType === d.k ? d.c + "20" : "#18181b",
                        color: dealType === d.k ? d.c : "#71717a",
                      }}>{d.k === "deal1" ? deck.deal1Name : deck.deal2Name}</button>
                    ))}
                  </div>
                </div>
              )}

          {/* 카드 드롭다운 */}
          {["OPPORTUNITY", "MARKET", "DOODAD"].includes(cellType) && (
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
                    {c.sub || ""} {c.price || ""} {c.cf ? `CF:${c.cf}` : ""} {c.roi ? `ROI:${c.roi}` : ""} {c.amount || ""} {c.sell ? `매각:${c.sell}` : ""} {c.special ? `[${c.special}]` : ""} — {(c.desc || "").substring(0, 40)}
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
                    cardPrice > 0 && { label: "가격", value: `$${fmtNum(cardPrice)}`, color: "#fafafa", bg: "#ffffff08" },
                    cardDown > 0 && { label: "착수금", value: `$${fmtNum(cardDown)}`, color: "#fde68a", bg: "#f59e0b08" },
                    cardLoan > 0 && { label: "은행대출", value: `$${fmtNum(cardLoan)}`, color: "#fca5a5", bg: "#ef444408" },
                    cardCF !== 0 && { label: "월 현금흐름", value: `${cardCF >= 0 ? "+" : ""}$${fmtNum(cardCF)}`, color: cardCF >= 0 ? "#86efac" : "#fca5a5", bg: cardCF >= 0 ? "#22c55e08" : "#ef444408" },
                    selectedCard.roi && { label: "ROI", value: selectedCard.roi, color: "#93c5fd", bg: "#3b82f608" },
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

          {/* 주식 수량 입력 */}
          {selectedCard && isStock(selectedCard) && cellType === "OPPORTUNITY" && (
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
                      monthlyCF={jobData ? jobData.cashflow + totalCF : 0}
                      currentInterest={loanInterest}
                      onLoan={(amount) => {
                        setBankLoan(prev => prev + amount);
                        setLoanInterest(prev => prev + Math.round(amount * 0.1));
                        setCash(prev => prev + amount);
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

          {cellType === "MARKET" && selectedCard && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[{ k: "sell", label: "판매", c: "#f59e0b" }, { k: "hold", label: "홀딩", c: "#3b82f6" }, { k: "na", label: "해당없음", c: "#52525b" }].map(a => (
                <button key={a.k} onClick={() => setAction(a.k)} style={{
                  flex: 1, padding: "10px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: action === a.k ? `2px solid ${a.c}` : "1px solid #27272a",
                  background: action === a.k ? a.c + "20" : "#18181b",
                  color: action === a.k ? (a.k === "na" ? "#a1a1aa" : a.c) : "#71717a",
                }}>{a.label}</button>
              ))}
            </div>
          )}

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
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <select value={reSellIdx} onChange={e => setReSellIdx(parseInt(e.target.value) || 0)} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#e4e4e7", fontSize: 11, outline: "none" }}>
                    {realEstateAssets.map((a, i) => (
                      <option key={i} value={i}>{a.name} (대출 ${fmtNum((a.loan||0))})</option>
                    ))}
                  </select>
                  <input type="number" min={0} placeholder="매도가" value={reSellPrice} onChange={e => setReSellPrice(e.target.value)} style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#fde68a", fontSize: 11, textAlign: "center", outline: "none" }} />
                  <button onClick={() => {
                    const idx = reSellIdx;
                    const sellPrice = parseInt(reSellPrice) || 0;
                    const asset = realEstateAssets[idx];
                    if (!asset || sellPrice <= 0) return;
                    const net = Math.max(0, sellPrice - (asset.loan || 0));
                    const targetId = asset.id;
                    setCash(prev => prev + net);
                    setTotalCF(prev => prev - asset.cf);
                    // ID 기반 제거 — 중복 차감/누락 방지
                    setAssets(prev => prev.filter(a => a.id !== targetId));
                    setTurnLog(prev => [...prev, { turn: currentTurn, cellType: "EXT_SELL", boardPos: 0, dice: 0, passedPaydays: 0, dealType: "타인MARKET", card: { sub: asset.name, desc: `타인 마켓카드로 ${asset.name} 매도` }, action: "sell", shares: null, assetType: asset.type || "부동산", time: timerOn ? elapsed : null, decisionSec: null, cashSnapshot: cash + net, transaction: `${asset.name} 매도 $${fmtNum(sellPrice)} - 대출 $${fmtNum((asset.loan||0))} = +$${fmtNum(net)}` }]);
                    setReSellPrice(""); setReSellIdx(0);
                  }} style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "#f59e0b", color: "#000", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>매도</button>
                </div>
              </div>
            </div>
          )}

          {/* 주식 */}
          {stockAssets.length > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", marginBottom: 8 }}>📈 주식 ({totalStockShares}주)</div>
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
                      <input type="number" min={1}
                        value={stockSellPrice[i] ?? buyPrice}
                        onChange={e => setStockSellPrice(prev => ({ ...prev, [i]: e.target.value }))}
                        style={{ width: 50, padding: "4px 6px", borderRadius: 6, border: "1px solid #27272a", background: "#18181b", color: "#fafafa", fontSize: 11, textAlign: "center", outline: "none" }}
                      />
                    </div>
                    <button onClick={() => {
                      const qtyRaw = stockSellQty[i] ?? a.shares;
                      const priceRaw = stockSellPrice[i] ?? buyPrice;
                      const sellQty = Math.min(a.shares, Math.max(1, parseInt(qtyRaw) || a.shares));
                      const sellPrice = Math.max(1, parseInt(priceRaw) || buyPrice);
                      const sellTotal = sellPrice * sellQty;
                      const targetId = a.id;
                      setCash(prev => prev + sellTotal);
                      // ID 기반 주식 수량 감소/제거 (참조 동등성 의존 제거)
                      setAssets(prev => prev.flatMap(x => {
                        if (x.id !== targetId) return [x];
                        if (x.shares <= sellQty) return []; // 전량 매각
                        return [{ ...x, shares: x.shares - sellQty }];
                      }));
                      setTurnLog(prev => [...prev, {
                        turn: currentTurn, cellType: "STOCK_SELL", dealType: "STOCK_SELL",
                        card: { sub: a.name, price: `$${sellPrice}`, desc: `${a.name} ${sellQty}주 매각 @$${sellPrice}` },
                        action: "sell", shares: sellQty, assetType: "주식",
                        time: timerOn ? elapsed : null, decisionSec: null,
                        transaction: `${a.name} ${sellQty}주 매각 @$${sellPrice} = +$${fmtNum(sellTotal)}`,
                        cashSnapshot: cash + sellTotal,
                      }]);
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

          {/* 은행 대출 현황 & 상환 (언제든 가능) */}
          {bankLoan > 0 && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#7f1d1d10", border: "1px solid #ef444430", marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>🏦 은행 대출</span>
                <span style={{ fontSize: 9, color: "#71717a" }}>내 턴이 아니어도 상환 가능</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#a1a1aa" }}>대출 잔액</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#ef4444" }}>${fmtNum(bankLoan)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#a1a1aa" }}>월 이자 (10%)</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5" }}>-${fmtNum(loanInterest)}/월</span>
              </div>
              {cash >= 1000 && (
                <div>
                  <div style={{ fontSize: 10, color: "#71717a", marginBottom: 6 }}>$1,000 단위 상환 (보유 ${fmtNum(cash)})</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[1000, Math.min(5000, bankLoan), bankLoan].filter((v, i, a) => v <= cash && v <= bankLoan && a.indexOf(v) === i).map(amt => (
                      <button key={amt} onClick={() => {
                        setCash(prev => prev - amt);
                        setBankLoan(prev => prev - amt);
                        setLoanInterest(Math.round((bankLoan - amt) * 0.1));
                        setTurnLog(prev => [...prev, { turn: currentTurn, cellType: "PAYDAY", boardPos: 0, dice: 0, passedPaydays: 0, dealType: "대출상환", card: null, action: null, shares: null, time: timerOn ? elapsed : null, decisionSec: null, cashSnapshot: cash - amt, transaction: `은행 대출 $${fmtNum(amt)} 상환 (잔액 $${fmtNum((bankLoan - amt))})` }]);
                      }} style={{
                        flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #22c55e30",
                        background: "#22c55e10", color: "#86efac", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}>
                        ${fmtNum(amt)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cash < 1000 && (
                <p style={{ fontSize: 10, color: "#71717a", margin: 0 }}>현금 $1,000 이상 보유 시 상환 가능</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ 기록 탭 ═══ */}
      {viewTab === "history" && (
        <div style={{ marginBottom: 16 }}>
          {turnLog.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {turnLog.map((t, i) => {
                const isPaydayPass = t.cellType === "PAYDAY_PASS";
                const isDownRest = t.cellType === "DOWNSIZED_REST";
                const isStockSell = t.cellType === "STOCK_SELL";
                const isExtSell = t.cellType === "EXT_SELL";
                const colorKey = isPaydayPass ? "PAYDAY"
                  : isDownRest ? "DOWNSIZED"
                  : isStockSell ? "OPPORTUNITY"  // 주식 매각은 녹색 계열 (기회카드와 같은 계열)
                  : isExtSell ? "MARKET"
                  : t.cellType;
                const cc = CELL_COLORS[colorKey] || CELL_COLORS.OPPORTUNITY;
                const specialLabel = isPaydayPass ? "💰 PayDay 통과"
                  : isDownRest ? "⬇️ 다운사이즈 휴식"
                  : isStockSell ? `📈 주식 매각 — ${t.card?.sub || ""}`
                  : isExtSell ? `🏠 외부 매도 — ${t.card?.sub || ""}`
                  : null;
                const isSpecial = isPaydayPass || isDownRest;
                return (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: isPaydayPass ? "#14532d15" : isDownRest ? "#7f1d1d10" : isStockSell ? "#10b98110" : isExtSell ? "#8b5cf610" : cc.bg, border: `1px solid ${cc.border}30` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: cc.border + "30", color: cc.text }}>
                          T{t.turn}
                        </span>
                        {!isSpecial && !isStockSell && !isExtSell && t.boardPos > 0 && <span style={{ fontSize: 9, color: "#52525b" }}>칸{t.boardPos}</span>}
                        {!isSpecial && !isStockSell && !isExtSell && t.dice > 0 && <span style={{ fontSize: 9, color: "#52525b" }}>🎲{t.dice}</span>}
                        <span style={{ fontSize: 11, color: cc.text }}>
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
                      </div>
                    </div>
                    {/* 거래 내역 + 보유 현금 */}
                    {(t.transaction || t.cashSnapshot != null) && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${cc.border}15` }}>
                        {t.transaction && <span style={{ fontSize: 9, color: "#a1a1aa", flex: 1 }}>{t.transaction}</span>}
                        {t.cashSnapshot != null && <span style={{ fontSize: 10, fontWeight: 700, color: t.cashSnapshot >= 0 ? "#fde68a" : "#fca5a5" }}>💰${fmtNum(t.cashSnapshot)}</span>}
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

      {/* 디브리핑 */}
      {turnLog.length >= 3 && (
        <DebriefSection
          results={turnLog.map(t => ({
            turn: t.turn,
            cell: { type: t.cellType, label: CELL_LABELS[t.cellType] || t.cellType },
            dealType: t.dealType, card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
            decisionSec: t.decisionSec,
            splitApplied: t.splitApplied, // 무상증자/감자 적용 여부
            soldAsset: t.soldAsset,       // MARKET 매각 시 실제 매각된 자산 (name/type/cf/sellPrice)
            assetType: t.assetType,        // STOCK_SELL/EXT_SELL 용 (주식/부동산/사업)
            shares: t.shares,              // 주식 매각 수량
            dice: [0], total: 0, pos: 0,
          }))}
          version={version} turns={turnLog.length} deck={deck}
        />
      )}

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
        <button onClick={async () => {
          try {
            const result = await onSaveGame?.(buildGamePayload());
            if (result !== null && result !== undefined) {
              // 성공 시 진행 중 세션 삭제 (게임 완료된 것으로 간주)
              await deleteGameSession(authUser?.id);
              alert("✅ 게임이 저장되었습니다.");
            }
          } catch (e) {
            console.error("[게임 저장] 예외:", e);
            alert(`⚠️ 게임 저장 중 오류: ${e.message || "알 수 없는 오류"}`);
          }
        }} style={{
          width: "100%", marginTop: 12, padding: 14, borderRadius: 12, border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", color: "#fff", fontSize: 13, fontWeight: 700,
        }}>💾 게임 저장</button>
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

  // 로그아웃 핸들러 (확실한 초기화)
  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.warn("signOut 에러(무시):", e); }
    if (typeof window !== "undefined") {
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      window.location.href = "/";
    }
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
    return (
      <div style={{
        minHeight: "100vh",
        background: "#080810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#71717a",
        fontSize: 14,
        fontFamily: "'Pretendard Variable', 'Noto Sans KR', -apple-system, sans-serif",
      }}>
        로딩 중...
      </div>
    );
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
      {appMode === "profile" && (
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
              onClick={() => { setVersion(key); setResults(null); }}
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

        {/* 1줄: 시뮬레이션 / 플레이 / 대회 / 플레이어 (게임 모드) */}
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

        {/* 2줄: 내 이력 / 랭킹 / Admin (Phase B Day 2) */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderRadius: 12, overflow: "hidden", border: "1px solid #27272a" }}>
          <button onClick={() => { if (guardAuth("play")) setAppMode("history"); }} style={{
            flex: 1, padding: "10px", border: "none", cursor: "pointer",
            background: appMode === "history" ? "#a855f720" : "#111118",
            borderBottom: appMode === "history" ? "2px solid #a855f7" : "2px solid transparent",
            color: appMode === "history" ? "#c4b5fd" : "#52525b",
            fontSize: 12, fontWeight: 700,
            opacity: isGuest ? 0.5 : 1,
          }}>📊 내이력{isGuest ? " 🔒" : ""}</button>
          <button onClick={() => { setAppMode("ranking"); }} style={{
            flex: 1, padding: "10px", border: "none", cursor: "pointer",
            background: appMode === "ranking" ? "#eab30820" : "#111118",
            borderBottom: appMode === "ranking" ? "2px solid #eab308" : "2px solid transparent",
            color: appMode === "ranking" ? "#fde68a" : "#52525b",
            fontSize: 12, fontWeight: 700,
          }}>🏅 랭킹</button>
          {userIsAdmin && (
            <button onClick={() => setAppMode("admin")} style={{
              flex: 1, padding: "10px", border: "none", cursor: "pointer",
              background: appMode === "admin" ? "#ef444420" : "#111118",
              borderBottom: appMode === "admin" ? "2px solid #ef4444" : "2px solid transparent",
              color: appMode === "admin" ? "#fca5a5" : "#52525b",
              fontSize: 12, fontWeight: 700,
            }}>⚙️ Admin</button>
          )}
        </div>

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
              const result = await window.storage?.set(key, JSON.stringify({ ...gameData, ts, playerId, playerName }));
              
              // 저장 실패 시 (storage.js v3에서 null 반환)
              if (!result) {
                console.warn("[CashflowCoachingSim] 게임 저장 실패 (storage.set returned null)");
                return null;
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

            {/* 디브리핑 섹션 */}
            <DebriefSection results={results} version={version} turns={turns} deck={deck} />

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

function buildPromptText(results, version, turns) {
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

function generateFreeFeedback(results, turns) {
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
  2: "5000자. 전턴분석+현실매핑+잘한/아쉬운 선택 비교(수치)+전략제안+마인드셋. 스토리텔링. 모임가치를 진심으로. 당신의 최고 수준의 한국어 스토리텔링으로 작성하세요.",
};
const FEEDBACK_MAX_TOKENS = { 1: 2500, 2: 6000 };

async function generatePaidFeedback({ tier, version, turns, simText, extraContext = "" }) {
  const model = tier === 2 ? MODEL_OPUS : MODEL_SONNET;
  const detail = FEEDBACK_DETAIL[tier] || FEEDBACK_DETAIL[1];
  const maxTokens = FEEDBACK_MAX_TOKENS[tier] || 2500;
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `캐쉬플로우${version} ${turns}턴 디브리핑 총평.\n${simText}\n${extraContext}\n${detail}`,
      }],
    }),
  });
  if (!response.ok) {
    const err = new Error(`API 오류 (${response.status})`);
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  if (!data.content) throw new Error("예상치 못한 응답입니다.");
  return data.content.filter(c => c.type === "text").map(c => c.text).join("\n");
}

function DebriefSection({ results, version, turns, deck }) {
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

  // 리포트 자동 저장 (시뮬레이션 원본 데이터 포함)
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
        simText: simText, // 시뮬레이션 원본 데이터 (나중에 유료 리포트 생성용)
      };
      await window.storage?.set(key, JSON.stringify(data));
      setSavedReports(prev => [{ key, ...data }, ...prev].slice(0, 20));
    } catch (e) { console.error("리포트 저장 실패:", e); }
  };

  // 리포트 업데이트 (총평 추가 시)
  const updateReportFeedback = async (feedbackText, feedbackTier) => {
    try {
      const latest = savedReports[0];
      if (latest) {
        const updated = { ...latest, feedback: feedbackText, feedbackTier };
        await window.storage?.set(latest.key, JSON.stringify(updated));
        setSavedReports(prev => [updated, ...prev.slice(1)]);
      }
    } catch {}
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
  // 🎯 잘한 선택 / 아쉬운 선택 경로 계산 (Phase B Day 3)
  // ═══════════════════════════════════════════════════
  // 국제캐쉬플로우강사협회 13년 교육 철학 기반 분류:
  //
  // 🟢 잘한 선택:
  //   - 초반 현금 확보 (CF 마이너스여도 OK)
  //   - 자산 매수 후 단기 매도 (차익 실현)
  //   - 사업체 선택
  //   - 기부 선택 (투자 기회 확보)
  //   - CF 증가 자산 매수
  //   - 주식 차익 실현
  //
  // 🟡 아쉬운 선택 (부드러운 표현, "최악" 아님):
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
      
      if ((t.cellType === "DEAL1" || t.cellType === "DEAL2" || t.cellType === "BIG_DEAL" || t.cellType === "SMALL_DEAL" || t.cellType === "MARKET") && t.action === "buy") {
        if (!assetLifecycle[cardName]) {
          assetLifecycle[cardName] = { buyTurn: t.turn, sold: false, sellTurn: null };
        }
      }
      if (t.action === "sell" || t.cellType === "EXT_SELL") {
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
      const isBuyable = ["DEAL1", "DEAL2", "BIG_DEAL", "SMALL_DEAL", "MARKET"].includes(cellType);
      
      if (isBuyable && action === "buy") {
        // 사업체 매수 - 항상 잘한 선택 (+ 가중치)
        if (isBusinessCard(card)) {
          return {
            category: "best",
            cfChange: cashFlowChange,
            assetChange: card.cost || card.price || 0,
            reason: `💼 사업체 ${cardName} 매수 (+$${cashFlowChange}/월) — B사분면 진입`,
            weight: 1.5,
          };
        }
        // CF 증가 자산 - 잘한 선택
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
          // 후반부(40세 이후) 주식 투자 - 아쉬운 선택
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
      if (action === "sell" || cellType === "EXT_SELL") {
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
          cfChange: 0,
          assetChange: -amount,
          reason: `🛒 ${card.desc || "지출"} -$${amount} — 과소비`,
        };
      }

      // ─── CHARITY (기부) - 잘한 선택 ───
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
            cfChange: 0,
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

    // Best Path: "잘한 선택"만 누적 (+ 가중치 반영)
    // Worst Path: "아쉬운 선택" + "나쁜 선택" 누적
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

2. **40대 이전 매각은 CF 감소여도 잘한 선택**
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

1. 잘한 선택 (encourage, celebrate):
   - 사업체(Business/Startup/프랜차이즈) 매수 → B사분면 진입 (가중치 ↑)
   - 기부 선택 → 부자 마인드셋
   - CF 증가 자산 매수 → 진짜 자산 획득
   - 🆕 40세 이전 자산 매각 → 차익 실현 (더 큰 CF 만들 원금)
   - 🆕 CF 마이너스 자산 매수 후 나중에 매각 → 유연한 전략
   - 초반 CF 마이너스 자산 매수 → 현금 확보 전략
   - 매수 후 단기 매도 (3턴 이내) → 빠른 의사결정
   - 🆕 20대 PAYDAY = 저축 (자산 형성의 씨앗)

2. 아쉬운 선택 (gentle, educational — "최악" 사용 금지):
   - 좋은 기회를 패스 → 두려움에 굴복
   - 사업체 기회 놓침 (가중치 ↑)
   - 기부 기회 패스
   - 후반부(40세+) 주식 투자 → 현금흐름 구축 기회 상실
   - 🆕 CF 마이너스 자산을 "끝까지" 보유 → 부채를 자산으로 착각

3. 확실히 나쁜 선택:
   - DOODAD 과소비 → "나쁜 빚"의 씨앗

4. 중립:
   - 자녀 추가 (BABY) → 선택 영역 아님
   - 다운사이즈 (DOWNSIZED) → 운의 영역
   - 🆕 20대 기회 패스 → 현실적 한계 (저축 단계)

TONE: 따뜻하고 격려하는. "최악" 금지. "아쉬운 선택", "놓친 기회" 사용.

교육 목적: 
- 자책이 아닌 "다음엔 어떻게 할까"
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
    const text = generateFreeFeedback(results, turns);
    setFreeText(text);
    setMode("feedback");
    updateReportFeedback(text, 0);
  };

  const runPaid = async (selectedTier) => {
    setTier(selectedTier);
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
      updateReportFeedback(pText, selectedTier);
    } catch (e) {
      setError(e.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const TIERS = [
    { label: "요약 피드백", chars: "500자", price: "무료", color: "#22c55e", sub: "게임 결과 요약 + 핵심 인사이트", model: "" },
    { label: "상세 피드백", chars: "2,000자", price: "$9", color: "#3b82f6", sub: "스토리텔링 + 현실 연결 + 행동 설계", model: "Sonnet" },
    { label: "프리미엄 피드백", chars: "5,000자", price: "$20", color: "#f59e0b", sub: "전문 코칭 리포트 + 맞춤 전략", model: "Opus" },
  ];

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
    r += `■ 2. 잘한 선택 vs 아쉬운 선택\n\n`;
    if (bp.length > 0) {
      r += `  ▲ 잘한 선택 경로\n`;
      bp.forEach(b => r += `    T${b.turn}(${b.age}세) CF:$${b.cf} 투자:$${b.asset} — ${b.note}\n`);
      r += `\n`;
    }
    if (wp.length > 0) {
      r += `  ▼ 아쉬운 선택 경로\n`;
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
      <div ref={debRef} style={{ marginTop: 24, textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 32, marginBottom: 12, animation: "spin 1s linear infinite" }}>🎲</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ fontSize: 14, color: "#a1a1aa" }}>AI가 {turns}턴의 인생을 분석하고 있습니다...</p>
        <p style={{ fontSize: 12, color: "#52525b" }}>5단계 자산흐름 + 잘한/아쉬운 선택 비교 + 5가지 교훈 생성 중</p>
        <button onClick={() => {
          if (abortRef.current) abortRef.current.abort();
          setLoadingAnalysis(false);
          setMode(null);
          setError("");
        }} style={{
          marginTop: 16, padding: "10px 30px", borderRadius: 10, border: "1px solid #ef444440",
          background: "#ef444415", color: "#fca5a5", cursor: "pointer", fontSize: 13, fontWeight: 700,
        }}>⏹ 멈추고 게임으로 돌아가기</button>
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
    const maxCF = hasPaths ? Math.max(...bp.map(b => Math.abs(b.cf || 0)), 100) : 100;
    const maxAsset = hasPaths ? Math.max(...bp.map(b => Math.abs(b.asset || 0)), 1000) : 1000;
    const lastBest = bp[bp.length - 1] || { cf: 0, asset: 0 };
    const lastWorst = wp[wp.length - 1] || { cf: 0, asset: 0 };

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

        {/* ── 2. 잘한 선택 vs 아쉬운 선택 비교 그래프 ── */}
        <div style={{ padding: 20, borderRadius: 14, background: "#111118", border: "1px solid #27272a", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fafafa", marginBottom: 14 }}>📈 잘한 선택 vs 아쉬운 선택</div>
          {hasPaths ? (<>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 12, fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "#22c55e" }}></span><span style={{ color: "#a1a1aa" }}>잘한 선택</span></span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "#ef4444" }}></span><span style={{ color: "#a1a1aa" }}>아쉬운 선택</span></span>
          </div>
          <div>
            {bp.map((b, i) => {
              const w = wp[i] || { cf: 0, asset: 0, note: "" };
              const max = bestWorstTab === "cf" ? (maxCF || 1) : (maxAsset || 1);
              const bVal = bestWorstTab === "cf" ? b.cf : b.asset;
              const wVal = bestWorstTab === "cf" ? w.cf : w.asset;
              const bW = Math.max(2, (Math.abs(bVal) / max) * 100);
              const wW = Math.max(2, (Math.abs(wVal) / max) * 100);
              const fmt = v => bestWorstTab === "cf" ? (v >= 0 ? `+$${fmtNum(Math.round(v))}` : `-$${fmtNum(Math.abs(Math.round(v)))}`) : `$${fmtNum(Math.round(v))}`;
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9, color: "#52525b", minWidth: 44 }}>T{b.turn} {b.age}세</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                        <div style={{ height: 8, borderRadius: 3, background: "#22c55e", width: `${bW}%`, minWidth: 2 }}></div>
                        <span style={{ fontSize: 9, color: "#86efac", whiteSpace: "nowrap" }}>{fmt(bVal)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ height: 8, borderRadius: 3, background: wVal < 0 ? "#ef4444" : "#ef444480", width: `${wW}%`, minWidth: 2 }}></div>
                        <span style={{ fontSize: 9, color: "#fca5a5", whiteSpace: "nowrap" }}>{fmt(wVal)}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ paddingLeft: 50, fontSize: 9, color: "#4ade80" }}>{b.note}</div>
                  <div style={{ paddingLeft: 50, fontSize: 9, color: "#f87171" }}>{w.note}</div>
                </div>
              );
            })}
          </div>
          {/* 격차 요약 */}
          <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "#18181b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#86efac", fontWeight: 700 }}>잘한 선택</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>
                {bestWorstTab === "cf" ? `+$${fmtNum(Math.round(lastBest.cf))}/월` : `$${fmtNum(Math.round(lastBest.asset))}`}
              </div>
            </div>
            <div style={{ fontSize: 20, color: "#52525b" }}>vs</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#fca5a5", fontWeight: 700 }}>아쉬운 선택</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>
                {bestWorstTab === "cf" ? `${lastWorst.cf >= 0 ? "+" : ""}$${fmtNum(Math.round(lastWorst.cf))}/월` : `$${fmtNum(Math.round(lastWorst.asset))}`}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "#fafafa", fontWeight: 700 }}>
              같은 카드, 다른 선택, {bestWorstTab === "cf" ? `월 $${fmtNum(Math.round(lastBest.cf - lastWorst.cf))} 격차` : `투자원금 $${fmtNum(Math.round(lastBest.asset - lastWorst.asset))} 격차`}
            </span>
          </div>
          </>) : (
            <p style={{ fontSize: 13, color: "#71717a", textAlign: "center", padding: "20px 0" }}>비교 데이터가 생성되지 않았습니다. 다시 분석을 시도해주세요.</p>
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
  const renderFeedbackSelect = () => (
    <div style={{ marginTop: 8 }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>📝</div>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "#fafafa", margin: 0 }}>총평 리포트</h3>
        <p style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>스토리텔링 기반 코칭 피드백</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TIERS.map((t, i) => (
          <button key={i} onClick={() => i === 0 ? runFree() : runPaid(i)} style={{
            padding: "14px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
            border: `1px solid ${t.color}40`, background: "#0d0d14", transition: "all 0.2s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: t.color }}>{t.label}</span>
                {t.model && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.model === "Opus" ? "#f59e0b20" : "#3b82f620", color: t.model === "Opus" ? "#f59e0b" : "#93c5fd" }}>{t.model}</span>}
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: t.color }}>{t.price}</span>
            </div>
            <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>{t.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );

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
          <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <div style={{ fontSize: 28, marginBottom: 10, animation: "spin 1s linear infinite" }}>🎲</div>
            <p style={{ fontSize: 13, color: "#a1a1aa" }}>AI 코칭 피드백 생성 중...</p>
          </div>
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
                <button onClick={() => runPaid(tier + 1)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: TIERS[tier + 1].color, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
