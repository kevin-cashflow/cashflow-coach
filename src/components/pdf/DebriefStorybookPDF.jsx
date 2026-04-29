// DebriefStorybookPDF.jsx
// 캐쉬플로우 디브리핑 리포트 (금융 전문 톤)
// 의존성: @react-pdf/renderer, qrcode

import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Font,
  Svg, Path, Circle, Rect, Line, Polyline, Polygon, G,
  pdf, Image,
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { LOGO_ASSOCIATION, LOGO_CLUBS_KOREA, KIYOSAKI } from './assets';

// ─────────────────────────────────────────────────────────────
// 폰트 등록 — Pretendard (모던 산세리프, 금융권 표준)
// ─────────────────────────────────────────────────────────────
Font.register({
  family: 'Pretendard',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Light.otf', fontWeight: 300 },
    { src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-SemiBold.otf', fontWeight: 600 },
    { src: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf', fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

// ─────────────────────────────────────────────────────────────
// 디자인 토큰 — 금융 전문 톤
// ─────────────────────────────────────────────────────────────
const C = {
  paper: '#FFFFFF',
  surface: '#F8FAFB',
  panel: '#F5F7FA',
  ink: '#0F1E3D',
  inkSoft: '#1A2A4F',
  navy: '#1E3A5F',
  navySoft: '#2D5A7D',
  text: '#4A5468',
  textMuted: '#6B7585',
  textFaint: '#8B95A5',
  border: '#C5CAD3',
  borderLight: '#E1E5EB',
  borderDark: '#0F1E3D',
  // 액센트: 차콜 골드 → 앰버 (Modern Fintech 톤)
  gold: '#B45309',          // 앰버 다크 (텍스트/경계용 — 가독성 확보)
  goldBg: '#FFF7E6',        // 앰버 배경 (현재 위치 강조)
  goldStroke: '#F59E0B',    // 앰버 (외곽선·화살표·강조)
  green: '#059669',         // 정보 그린 (Tailwind emerald-600 톤)
  red: '#9F1239',           // 경고 와인 로즈
  // 6 Levels — Modern Fintech 팔레트 (인디고 → 바이올렛 → 로즈)
  // 6 Levels — Bloomberg Terminal 팔레트 (청록 → 앰버 → 레드, 금융 단말기 톤)
  l6: '#005A8B',            // 딥 블루
  l5: '#0288A0',            // 티얼
  l4: '#3DA5A5',            // 민트 그린
  l3: '#C99417',            // 머스타드
  l2: '#D97706',            // 앰버
  l1: '#B91C1C',            // 크림슨
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.paper,
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontFamily: 'Pretendard',
    color: C.ink,
    fontSize: 10.5,
    lineHeight: 1.7,
  },
  pageTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 24,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  pageTopBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandSquare: {
    width: 14,
    height: 14,
    backgroundColor: C.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandSquareText: {
    color: C.paper,
    fontSize: 7,
    fontWeight: 700,
  },
  pageTopBarLabel: {
    fontSize: 8,
    color: C.textMuted,
    letterSpacing: 1,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 32,
    left: 56,
    right: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    fontSize: 8,
    color: C.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    paddingBottom: 8,
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: C.navy,
  },
  sectionNumber: {
    fontSize: 9,
    color: C.gold,
    letterSpacing: 2,
    fontWeight: 600,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: C.ink,
  },
  body: {
    fontSize: 10.5,
    lineHeight: 1.8,
    color: C.inkSoft,
    marginBottom: 10,
  },
  bodySmall: {
    fontSize: 10,
    lineHeight: 1.7,
    color: C.text,
    marginBottom: 8,
  },
  caption: {
    fontSize: 9,
    color: C.gold,
    letterSpacing: 2,
    fontWeight: 600,
  },
  noteBox: {
    backgroundColor: C.panel,
    borderLeftWidth: 2,
    borderLeftColor: C.navy,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 14,
  },
  noteText: {
    fontSize: 10,
    color: C.text,
    lineHeight: 1.7,
  },
  noteSource: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 4,
  },
  diagnosisBox: {
    backgroundColor: C.goldBg,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  diagnosisLabel: {
    fontSize: 9,
    color: C.gold,
    letterSpacing: 2,
    fontWeight: 700,
    marginBottom: 4,
  },
  diagnosisText: {
    fontSize: 10.5,
    color: C.ink,
    lineHeight: 1.8,
  },
  kpiCell: {
    backgroundColor: C.paper,
    padding: 12,
    flex: 1,
  },
  kpiLabel: {
    fontSize: 8,
    color: C.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: 500,
  },
  kpiValue: {
    fontSize: 18,
    color: C.ink,
    fontWeight: 600,
  },
  kpiUnit: {
    fontSize: 8.5,
    color: C.textMuted,
    marginTop: 2,
  },
  indexLine: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  indexNum: {
    fontSize: 9,
    color: C.navy,
    fontWeight: 700,
    width: 20,
  },
  indexText: {
    flex: 1,
    fontSize: 10,
    color: C.ink,
    lineHeight: 1.7,
  },
  writeLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    height: 24,
    marginBottom: 4,
  },
});

// ─────────────────────────────────────────────────────────────
// 6 Levels of Wealth (공식 명칭 + 금융 톤 컬러)
// ─────────────────────────────────────────────────────────────
const LEVELS = [
  { idx: 0, en: 'Struggle', ko: '재정난', desc: '지출이 수입을 초과하여 부채가 누적되는 단계', threshold: '자산 미보유', fill: C.l1 },
  { idx: 1, en: 'Survival', ko: '재정적 생존', desc: '근로소득으로 지출을 충당하나 자산 형성은 미진', threshold: '자산 보유', fill: C.l2 },
  { idx: 2, en: 'Comfort', ko: '경제적 안정', desc: '자산 형성이 시작되어 일정한 잉여가 발생', threshold: 'P/E ≥ 0.25', fill: C.l3 },
  { idx: 3, en: 'Security', ko: '경제적 보안', desc: '패시브 인컴이 월 지출의 절반 이상을 커버', threshold: 'P/E ≥ 0.50', fill: C.l4 },
  { idx: 4, en: 'Freedom', ko: '경제적 자유', desc: '패시브 인컴이 월 지출을 완전히 충당', threshold: 'P/E ≥ 1.00', fill: C.l5 },
  { idx: 5, en: 'Abundance', ko: '경제적 풍요', desc: '잉여 자본으로 사회적 환원 및 유산 설계 가능', threshold: 'P/E ≥ 3.00', fill: C.l6 },
];

const diagnoseLevel = (passive, expense, asset) => {
  const ratio = expense > 0 ? passive / expense : 0;
  if (ratio >= 3) return LEVELS[5];
  if (ratio >= 1) return LEVELS[4];
  if (ratio >= 0.5) return LEVELS[3];
  if (ratio >= 0.25) return LEVELS[2];
  if (asset > 0) return LEVELS[1];
  return LEVELS[0];
};

const nextStepGuidance = (level) => {
  switch (level.idx) {
    case 5: return '필요를 초과한 자산 단계에 도달하였다. 자산 보전 및 사회적 환원 전략으로 전환할 시점이다.';
    case 4: return '월 지출 전부를 패시브 인컴으로 충당하는 단계다. 자산의 다각화와 인플레이션 헤지 전략이 다음 과제다.';
    case 3: return '패시브 인컴이 지출의 절반을 상회한다. 추가 자산 확보 시 L5 Freedom 단계 진입이 가능하다.';
    case 2: return '자산 형성 초기 단계로, 일관된 자산 매수와 지출 통제가 다음 단계로의 전환을 결정한다.';
    case 1: return '근로소득 의존도가 높은 단계다. 첫 부동산 또는 사업 자산 확보가 우선 과제다.';
    default: return '자산 형성 시작점이다. 첫 자산 매수가 캐쉬플로우 곡선을 결정한다.';
  }
};

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
};

const fmtCF = (n) => {
  if (n == null) return '$0';
  const sign = n >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
};

const fmtPct = (n) => `${Math.round(n * 100)}%`;

const generateQRDataUrl = async (text) => {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 200,
      color: { dark: C.ink, light: C.paper },
    });
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// 페이지 프레임
// ─────────────────────────────────────────────────────────────
const PageFrame = ({ children, label, pageNumber, totalPages, playerName }) => (
  <Page size="A4" style={styles.page}>
    <View style={styles.pageTopBar} fixed>
      <View style={styles.pageTopBarLeft}>
        <Image src={LOGO_ASSOCIATION} style={{ width: 18, height: 18 }} />
        <Text style={styles.pageTopBarLabel}>국제캐쉬플로우강사협회 · CASHFLOW DEBRIEFING REPORT</Text>
      </View>
      {label && (
        <Text style={[styles.pageTopBarLabel, { color: C.gold, fontWeight: 600 }]}>{label}</Text>
      )}
    </View>

    {children}

    <View style={styles.pageFooter} fixed>
      <Text>{playerName} · CONFIDENTIAL</Text>
      <Text>Page {String(pageNumber).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}</Text>
    </View>
  </Page>
);

// ─────────────────────────────────────────────────────────────
// 1. 표지
// ─────────────────────────────────────────────────────────────
const CoverPage = ({ playerName, job, turnCount, date, level, reportNo }) => (
  <Page size="A4" style={[styles.page, { paddingHorizontal: 64, paddingTop: 64 }]}>
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: C.navy,
        marginBottom: 48,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image src={LOGO_ASSOCIATION} style={{ width: 28, height: 28 }} />
        <Text style={{ fontSize: 9, color: C.text, letterSpacing: 1 }}>
          국제캐쉬플로우강사협회 · INTERNATIONAL CASHFLOW INSTRUCTOR ASSOCIATION
        </Text>
      </View>
      <Text style={{ fontSize: 8, color: C.textMuted }}>{reportNo}</Text>
    </View>

    <Text style={{ fontSize: 9, color: C.gold, letterSpacing: 4, marginBottom: 4, fontWeight: 600 }}>
      CASHFLOW SIMULATION · DEBRIEFING REPORT
    </Text>
    <View style={{ width: 32, height: 2, backgroundColor: C.gold, marginBottom: 32 }} />

    <Text style={{ fontSize: 30, fontWeight: 700, color: C.ink, lineHeight: 1.3, letterSpacing: -0.5 }}>
      캐쉬플로우 시뮬레이션
    </Text>
    <Text style={{ fontSize: 30, fontWeight: 700, color: C.ink, lineHeight: 1.3, letterSpacing: -0.5, marginBottom: 16 }}>
      디브리핑 리포트
    </Text>

    <Text style={{ fontSize: 12, color: C.text, lineHeight: 1.7, marginBottom: 32 }}>
      개인 재무 의사결정 패턴 분석 및{'\n'}
      6단계의 부의 단계 진단
    </Text>

    {/* 공식 파트너십 표기 (Robert Kiyosaki + Cashflow Clubs Korea) */}
    <View
      style={{
        flexDirection: 'row',
        gap: 16,
        padding: 14,
        backgroundColor: C.surface,
        borderLeftWidth: 2,
        borderLeftColor: C.gold,
        marginBottom: 32,
      }}
    >
      <Image
        src={KIYOSAKI}
        style={{ width: 48, height: 64, objectFit: 'cover' }}
      />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: 8, color: C.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>
          OFFICIAL PARTNERSHIP · 공식 파트너십
        </Text>
        <Text style={{ fontSize: 10, color: C.ink, fontWeight: 600, marginBottom: 2 }}>
          Robert T. Kiyosaki · 「부자아빠 가난한아빠」 저자
        </Text>
        <Text style={{ fontSize: 9, color: C.text, lineHeight: 1.5 }}>
          한국·일본 공식 파트너 · CASHFLOW® 보드게임 정식 한국 보급
        </Text>
      </View>
      <Image
        src={LOGO_CLUBS_KOREA}
        style={{ width: 70, height: 48, objectFit: 'contain' }}
      />
    </View>

    <View style={{ marginBottom: 48 }}>
      {[
        ['대상자', playerName],
        ['시뮬레이션 직군', job],
        ['시뮬레이션 기간', `${turnCount}턴 · 40개년 환산`],
        ['진단 단계', `L${level.idx + 1} — Financial ${level.en}`],
        ['발행일', date],
      ].map(([k, v], i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            paddingVertical: 9,
            borderBottomWidth: 0.5,
            borderBottomColor: i === 4 ? 'transparent' : C.borderLight,
          }}
        >
          <Text style={{ width: '32%', fontSize: 10, color: C.textMuted }}>{k}</Text>
          <Text
            style={{
              fontSize: 11,
              color: k === '진단 단계' ? C.navy : C.ink,
              fontWeight: k === '진단 단계' ? 700 : 500,
            }}
          >
            {v}
          </Text>
        </View>
      ))}
    </View>

    <View
      style={{
        position: 'absolute',
        bottom: 48,
        left: 64,
        right: 64,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 12,
        borderTopWidth: 0.5,
        borderTopColor: C.border,
      }}
    >
      <Text style={{ fontSize: 8, color: C.textMuted, letterSpacing: 1 }}>
        CONFIDENTIAL · 개인 진단용 자료
      </Text>
      <Text style={{ fontSize: 8, color: C.textMuted }}>Page 01</Text>
    </View>
  </Page>
);

// ─────────────────────────────────────────────────────────────
// 2. Executive Letter
// ─────────────────────────────────────────────────────────────
const ExecutiveLetterPage = ({ playerName, pageNum, total }) => (
  <PageFrame label="EXECUTIVE LETTER" pageNumber={pageNum} totalPages={total} playerName={playerName}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionNumber}>PROLOGUE</Text>
      <Text style={styles.sectionTitle}>리포트 안내</Text>
    </View>

    <Text style={[styles.body, { fontSize: 12, color: C.ink, fontWeight: 500, marginBottom: 16 }]}>
      {playerName} 님께
    </Text>

    <Text style={styles.body}>
      본 리포트는 캐쉬플로우 시뮬레이션을 통해 도출된 귀하의 재무 의사결정 패턴 분석 결과입니다.
      40개년에 걸친 가상의 자산 운용 시나리오에서 내린 결정들을 정량적·정성적으로 분석하여,
      현재의 부의 단계와 향후 개선 방향을 제시하였습니다.
    </Text>

    <Text style={styles.body}>
      리포트는 핵심 지표 요약, 6단계의 부의 단계 진단, 5개 인생 단계별 의사결정 분석,
      대안 시나리오 비교, 그리고 실행 권고로 구성됩니다. 각 섹션의 데이터는 실제 게임 로그를
      기반으로 산출되었으며, 시뮬레이션의 한계 내에서 해석되어야 합니다.
    </Text>

    <Text style={styles.body}>
      재무 의사결정의 패턴은 게임판 위에서뿐 아니라 실제 자산 운용에서도 반복되는 경향이 있습니다.
      본 리포트가 귀하의 재무 전략 수립과 자기 점검에 의미 있는 출발점이 되기를 바랍니다.
    </Text>

    <Text
      style={[
        styles.body,
        { textAlign: 'right', marginTop: 32, color: C.text, fontSize: 10 },
      ]}
    >
      국제캐쉬플로우강사협회{'\n'}
      코칭 디렉터
    </Text>

    {/* 기요사키 인용 + 사진 (공식 파트너십 강조) */}
    <View
      style={{
        flexDirection: 'row',
        gap: 14,
        marginTop: 14,
        padding: 14,
        backgroundColor: C.panel,
        borderLeftWidth: 2,
        borderLeftColor: C.navy,
      }}
    >
      <Image
        src={KIYOSAKI}
        style={{ width: 64, height: 86, objectFit: 'cover' }}
      />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          style={{
            fontSize: 10.5,
            color: C.text,
            lineHeight: 1.7,
            marginBottom: 8,
          }}
        >
          "부자는 자산을 매수하고, 빈자는 부채를 자산으로 오인하여 매수한다.
          중산층은 지출을 자산이라 여기는 부채를 매수한다."
        </Text>
        <Text style={{ fontSize: 9, color: C.ink, fontWeight: 600 }}>
          — Robert T. Kiyosaki
        </Text>
        <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 2 }}>
          「Rich Dad Poor Dad」 저자 · 본 협회 한국·일본 공식 파트너
        </Text>
      </View>
    </View>
  </PageFrame>
);

// ─────────────────────────────────────────────────────────────
// 3. Executive Summary
// ─────────────────────────────────────────────────────────────
const ExecutiveSummaryPage = ({ playerName, metrics, level, pageNum, total }) => {
  const { totalAsset, monthlyCF, passiveIncome, expense, escaped } = metrics;
  const coverage = expense > 0 ? passiveIncome / expense : 0;

  return (
    <PageFrame label="EXECUTIVE SUMMARY" pageNumber={pageNum} totalPages={total} playerName={playerName}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionNumber}>SECTION 01</Text>
        <Text style={styles.sectionTitle}>핵심 지표 요약</Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: 0.5,
          backgroundColor: C.border,
          borderWidth: 0.5,
          borderColor: C.border,
          marginBottom: 24,
        }}
      >
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>TOTAL ASSET</Text>
          <Text style={styles.kpiValue}>{fmt(totalAsset)}</Text>
          <Text style={styles.kpiUnit}>총자산</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>MONTHLY CF</Text>
          <Text style={[styles.kpiValue, { color: monthlyCF >= 0 ? C.green : C.red }]}>
            {fmtCF(monthlyCF)}
          </Text>
          <Text style={styles.kpiUnit}>월 캐쉬플로우</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>PASSIVE INC.</Text>
          <Text style={styles.kpiValue}>{fmt(passiveIncome)}</Text>
          <Text style={styles.kpiUnit}>패시브 인컴</Text>
        </View>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>COVERAGE</Text>
          <Text style={[styles.kpiValue, { color: C.navy }]}>{fmtPct(coverage)}</Text>
          <Text style={styles.kpiUnit}>지출 커버리지</Text>
        </View>
      </View>

      <Text style={[styles.caption, { marginBottom: 12 }]}>KEY FINDINGS · 핵심 발견</Text>

      <View style={styles.indexLine}>
        <Text style={styles.indexNum}>01</Text>
        <Text style={styles.indexText}>
          현재 패시브 인컴이 월 지출의 {fmtPct(coverage)}를 커버하는 단계로,
          L{level.idx + 1} Financial {level.en}에 위치한다.
        </Text>
      </View>
      <View style={styles.indexLine}>
        <Text style={styles.indexNum}>02</Text>
        <Text style={styles.indexText}>
          {escaped
            ? '시뮬레이션 기간 내 쥐경주 탈출에 성공하여 Fast Track 단계에 진입하였다.'
            : '시뮬레이션 기간 내 쥐경주 탈출에는 도달하지 못하였으나, 다음 단계로의 전환 임계 구간에 위치한다.'}
        </Text>
      </View>
      <View style={styles.indexLine}>
        <Text style={styles.indexNum}>03</Text>
        <Text style={styles.indexText}>{nextStepGuidance(level)}</Text>
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          "투자에 있어 가장 중요한 것은 잃지 않는 것이다. 두 번째로 중요한 것은 첫 번째 원칙을 잊지 않는 것이다."
        </Text>
        <Text style={styles.noteSource}>— Warren Buffett, Berkshire Hathaway 1985 주주서한</Text>
      </View>
    </PageFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 4. 6단계의 부의 단계 (Six Levels of Wealth)
// ─────────────────────────────────────────────────────────────
const SixLevelsPage = ({ playerName, level, metrics, pageNum, total }) => {
  const coverage = metrics.expense > 0 ? metrics.passiveIncome / metrics.expense : 0;
  const tiers = [
    { idx: 5, points: '110,15 122,42 98,42' },
    { idx: 4, points: '98,42 122,42 134,72 86,72' },
    { idx: 3, points: '86,72 134,72 146,108 74,108' },
    { idx: 2, points: '74,108 146,108 158,148 62,148' },
    { idx: 1, points: '62,148 158,148 170,194 50,194' },
    { idx: 0, points: '50,194 170,194 184,250 36,250' },
  ];
  const labelY = { 5: 34, 4: 60, 3: 92, 2: 130, 1: 173, 0: 225 };
  const currentLabelY = labelY[level.idx];

  return (
    <PageFrame label="LEVELS OF WEALTH" pageNumber={pageNum} totalPages={total} playerName={playerName}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionNumber}>SECTION 02</Text>
        <Text style={styles.sectionTitle}>6단계의 부의 단계 진단</Text>
      </View>

      <Text style={[styles.body, { fontSize: 10.5 }]}>
        패시브 인컴 대비 월 지출 비율(P/E Ratio: Passive Income to Expense)을 기준으로
        6단계의 부의 단계를 산출하였다. 각 단계의 정의와 진단 임계값은 다음과 같다.
      </Text>

      <View style={{ flexDirection: 'row', gap: 24, marginTop: 16, marginBottom: 16 }}>
        <View style={{ width: 220, alignItems: 'center' }}>
          <Svg viewBox="0 0 220 280" width={220} height={280}>
            {tiers.map((tier) => {
              const lv = LEVELS[tier.idx];
              const isCurrent = tier.idx === level.idx;
              return (
                <G key={tier.idx}>
                  <Polygon
                    points={tier.points}
                    fill={lv.fill}
                    stroke={C.borderDark}
                    strokeWidth={0.5}
                  />
                  <Text
                    x={110}
                    y={labelY[tier.idx]}
                    style={{
                      fontSize: isCurrent ? 10 : 8,
                      fill: C.paper,
                      fontWeight: isCurrent ? 700 : 500,
                    }}
                    textAnchor="middle"
                  >
                    L{tier.idx + 1}
                  </Text>
                </G>
              );
            })}

            {tiers
              .filter((t) => t.idx === level.idx)
              .map((tier) => (
                <Polygon
                  key={`hl-${tier.idx}`}
                  points={tier.points}
                  fill="none"
                  stroke={C.goldStroke}
                  strokeWidth={2.2}
                />
              ))}

            <Line
              x1={148}
              y1={currentLabelY - 3}
              x2={188}
              y2={currentLabelY - 3}
              stroke={C.goldStroke}
              strokeWidth={1}
            />
            <Polygon
              points={`148,${currentLabelY - 3} 154,${currentLabelY - 6} 154,${currentLabelY}`}
              fill={C.goldStroke}
            />
          </Svg>
          <Text
            style={{
              fontSize: 8,
              color: C.gold,
              fontWeight: 700,
              letterSpacing: 1,
              marginTop: 4,
            }}
          >
            CURRENT POSITION · 현재 진단
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              paddingBottom: 6,
              borderBottomWidth: 1,
              borderBottomColor: C.navy,
            }}
          >
            <Text style={{ width: 26, fontSize: 8, color: C.textMuted, letterSpacing: 1, fontWeight: 500 }}>LV</Text>
            <Text style={{ flex: 1, fontSize: 8, color: C.textMuted, letterSpacing: 1, fontWeight: 500 }}>단계</Text>
            <Text style={{ width: 70, textAlign: 'right', fontSize: 8, color: C.textMuted, letterSpacing: 1, fontWeight: 500 }}>P/E 비율</Text>
          </View>

          {[...LEVELS].reverse().map((lv) => {
            const isCurrent = lv.idx === level.idx;
            return (
              <View
                key={lv.idx}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: isCurrent ? 9 : 7,
                  paddingHorizontal: isCurrent ? 8 : 0,
                  backgroundColor: isCurrent ? C.goldBg : 'transparent',
                  borderWidth: isCurrent ? 1.2 : 0,
                  borderColor: isCurrent ? C.goldStroke : 'transparent',
                  borderBottomWidth: isCurrent ? 1.2 : 0.5,
                  borderBottomColor: isCurrent ? C.goldStroke : C.borderLight,
                }}
              >
                <Text
                  style={{
                    width: 26,
                    fontSize: isCurrent ? 10 : 9,
                    color: isCurrent ? C.gold : C.navy,
                    fontWeight: 700,
                  }}
                >
                  L{lv.idx + 1}{isCurrent ? ' ◄' : ''}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: isCurrent ? 10.5 : 10,
                      color: C.ink,
                      fontWeight: isCurrent ? 700 : 600,
                      marginBottom: 1,
                    }}
                  >
                    {lv.en} · {lv.ko}
                  </Text>
                  <Text style={{ fontSize: 8.5, color: C.textMuted, lineHeight: 1.5 }}>
                    {lv.desc}
                  </Text>
                </View>
                <Text
                  style={{
                    width: 70,
                    textAlign: 'right',
                    fontSize: isCurrent ? 10 : 9,
                    color: isCurrent ? C.gold : C.text,
                    fontWeight: isCurrent ? 700 : 500,
                  }}
                >
                  {lv.threshold}
                </Text>
              </View>
            );
          })}

          <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 10 }}>
            * P/E 비율: Passive Income / Monthly Expense
          </Text>
        </View>
      </View>

      <View style={styles.diagnosisBox}>
        <Text style={styles.diagnosisLabel}>DIAGNOSIS · 진단 요약</Text>
        <Text style={styles.diagnosisText}>
          현재 P/E 비율 <Text style={{ fontWeight: 700 }}>{coverage.toFixed(2)}</Text>로
          L{level.idx + 1} {level.en} 단계에 위치한다. {nextStepGuidance(level)}
        </Text>
      </View>
    </PageFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 5. 챕터 페이지 (Phase 1~5)
// ─────────────────────────────────────────────────────────────
const ChapterPage = ({ phase, playerName, sectionNum, pageNum, total }) => (
  <PageFrame label={`PHASE ${phase.num}`} pageNumber={pageNum} totalPages={total} playerName={playerName}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionNumber}>SECTION {String(sectionNum).padStart(2, '0')}</Text>
      <Text style={styles.sectionTitle}>{phase.title}</Text>
    </View>

    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: C.borderLight,
      }}
    >
      <Text style={{ fontSize: 10, color: C.text }}>
        구간: {phase.turnRange} · 환산 연령: {phase.ageRange}
      </Text>
      <Text style={{ fontSize: 10, color: C.gold, fontWeight: 600 }}>
        Phase {phase.num} of 5
      </Text>
    </View>

    <Text style={[styles.body, { fontSize: 13, fontWeight: 500, color: C.ink, marginBottom: 14 }]}>
      {phase.headline}
    </Text>

    {phase.epigraph && (
      <View style={styles.noteBox}>
        <Text style={styles.noteText}>"{phase.epigraph.quote}"</Text>
        <Text style={styles.noteSource}>— {phase.epigraph.source}</Text>
      </View>
    )}

    <Text style={[styles.caption, { marginTop: 12, marginBottom: 8 }]}>NARRATIVE · 구간 분석</Text>
    <Text style={styles.bodySmall}>{phase.narrative}</Text>

    {phase.events && phase.events.length > 0 && (
      <View style={{ marginTop: 16 }}>
        <Text style={[styles.caption, { marginBottom: 8 }]}>KEY EVENTS · 주요 의사결정</Text>
        <View style={{ borderTopWidth: 0.5, borderTopColor: C.navy }}>
          {phase.events.map((ev, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                paddingVertical: 8,
                borderBottomWidth: 0.5,
                borderBottomColor: C.borderLight,
              }}
            >
              <Text style={{ width: 50, fontSize: 10, color: C.navy, fontWeight: 600 }}>
                T-{String(ev.turn).padStart(2, '0')}
              </Text>
              <Text style={{ flex: 1, fontSize: 10, color: C.ink, lineHeight: 1.6 }}>
                {ev.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    )}

    {phase.insight && (
      <View style={[styles.diagnosisBox, { marginTop: 20 }]}>
        <Text style={styles.diagnosisLabel}>INSIGHT · 구간 통찰</Text>
        <Text style={styles.diagnosisText}>{phase.insight}</Text>
      </View>
    )}
  </PageFrame>
);

// ─────────────────────────────────────────────────────────────
// 6. PersonaPage — 8 페르소나 진단 (Section 06)
// ─────────────────────────────────────────────────────────────
// Kevin Jung 강사님의 12년·5,000+ 세션 코칭 경험을 기반으로 설계된 페르소나
// 진단 결과를 시각적으로 표현. 진단 + 의미 + 다음 시도 3원 구조.
const PersonaPage = ({ playerName, persona, sectionNum, pageNum, total }) => {
  if (!persona || !persona.personaInfo) {
    // 페르소나 데이터가 없을 때 fallback 페이지
    return (
      <Page size="A4" style={styles.page}>
        <PageFrame label="FINANCIAL PERSONA" pageNumber={pageNum} totalPages={total} playerName={playerName}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNumber}>SECTION 0{sectionNum}</Text>
            <Text style={styles.sectionTitle}>당신의 재무 페르소나</Text>
          </View>
          <Text style={styles.body}>
            페르소나 진단을 위한 데이터가 충분하지 않습니다. 게임을 끝까지 완료한 후 다시 디브리핑을 진행하시면 정확한 진단을 받으실 수 있어요.
          </Text>
        </PageFrame>
      </Page>
    );
  }

  const { personaInfo, evidence = [], diagnosis, meaning, nextStep, metrics } = persona;
  const { name, nameEn, classification, icon, color } = personaInfo;

  // 마크다운 ** 강조를 분리해 React 노드로 변환
  const renderRichText = (text, baseStyle) => {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text key={i} style={[baseStyle, { fontWeight: 700, color: C.text }]}>{part.slice(2, -2)}</Text>;
      }
      return <Text key={i} style={baseStyle}>{part}</Text>;
    });
  };

  return (
    <Page size="A4" style={styles.page}>
      <PageFrame label="FINANCIAL PERSONA" pageNumber={pageNum} totalPages={total} playerName={playerName}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionNumber}>SECTION 0{sectionNum}</Text>
          <Text style={styles.sectionTitle}>당신의 재무 페르소나</Text>
        </View>

        {/* 페르소나 카드 (아이콘 + 이름 + 분류) */}
        <View style={{
          marginTop: 16,
          marginBottom: 20,
          padding: 20,
          borderRadius: 8,
          borderLeft: `4px solid ${color}`,
          backgroundColor: '#f8fafc',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 36 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, marginBottom: 2 }}>
                {nameEn.toUpperCase()}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                {name}
              </Text>
              <Text style={{ fontSize: 10, color: color, fontWeight: 600, letterSpacing: 1 }}>
                {classification}
              </Text>
            </View>
          </View>
        </View>

        {/* 진단 근거 박스 */}
        {evidence.length > 0 && (
          <View style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            backgroundColor: '#f1f5f9',
            borderLeft: `3px solid ${C.textMuted}`,
          }}>
            <Text style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
              DIAGNOSIS EVIDENCE · 진단 근거
            </Text>
            {evidence.slice(0, 8).map((e, i) => (
              <Text key={i} style={{ fontSize: 9.5, color: C.text, lineHeight: 1.6, marginBottom: 2 }}>
                · {e}
              </Text>
            ))}
          </View>
        )}

        {/* 📊 진단 */}
        {diagnosis && (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: color, letterSpacing: 1, marginBottom: 6 }}>
              📊 진단
            </Text>
            <Text style={{ fontSize: 10, color: C.text, lineHeight: 1.7 }}>
              {renderRichText(diagnosis, { fontSize: 10, color: C.text, lineHeight: 1.7 })}
            </Text>
          </View>
        )}

        {/* 💡 의미 */}
        {meaning && (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: color, letterSpacing: 1, marginBottom: 6 }}>
              💡 이 페르소나의 의미
            </Text>
            <Text style={{ fontSize: 10, color: C.text, lineHeight: 1.7 }}>
              {renderRichText(meaning, { fontSize: 10, color: C.text, lineHeight: 1.7 })}
            </Text>
          </View>
        )}

        {/* 🌱 다음 시도 */}
        {nextStep && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: 700, color: color, letterSpacing: 1, marginBottom: 6 }}>
              🌱 다음 게임에서 시도해볼 것
            </Text>
            <Text style={{ fontSize: 10, color: C.text, lineHeight: 1.7 }}>
              {renderRichText(nextStep, { fontSize: 10, color: C.text, lineHeight: 1.7 })}
            </Text>
          </View>
        )}

        {/* Footer note */}
        <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 16 }}>
          * 페르소나 진단은 12년·5,000+ 세션 데이터 기반 알고리즘이며, 절대적 평가가 아닌 현재 위치 진단입니다. 캐쉬플로우 게임은 반복적으로 하면서 감각을 익히는 과정이며, 어떤 결정이든 스스로 내릴 수 있는 능력이 가장 중요합니다.
        </Text>
      </PageFrame>
    </Page>
  );
};

// ─────────────────────────────────────────────────────────────
// 7. Crossroads — 시나리오 비교 분석
// ─────────────────────────────────────────────────────────────
const CrossroadsPage = ({ playerName, comparison, sectionNum, pageNum, total }) => {
  const { best = [], actual = [], worst = [] } = comparison;
  const maxVal = Math.max(...best, ...actual, ...worst, 1);
  const W = 480, H = 220, padX = 50, padY = 30;
  const len = Math.max(actual.length - 1, 1);
  const xStep = (W - padX * 2) / len;
  const toY = (v) => H - padY - ((v / maxVal) * (H - padY * 2));
  const toX = (i) => padX + i * xStep;
  const toPoints = (arr) => arr.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((p) => H - padY - p * (H - padY * 2));

  return (
    <PageFrame label="SCENARIO ANALYSIS" pageNumber={pageNum} totalPages={total} playerName={playerName}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionNumber}>SECTION {String(sectionNum).padStart(2, '0')}</Text>
        <Text style={styles.sectionTitle}>대안 시나리오 비교 분석</Text>
      </View>

      <Text style={styles.body}>
        실제 시뮬레이션에서 도출된 자산 추이(Actual)를 기준으로, 동일 카드 시퀀스에서 최적 의사결정을
        수행했을 경우(Best Case)와 보수적 의사결정만을 수행했을 경우(Worst Case)의 자산 추이를
        비교 산출하였다. 각 시나리오는 동일한 카드 시퀀스를 전제로 한다.
      </Text>

      <View
        style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: C.surface,
          borderWidth: 0.5,
          borderColor: C.borderLight,
        }}
      >
        <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={240}>
          {gridY.map((y, i) => (
            <Line
              key={i}
              x1={padX}
              y1={y}
              x2={W - padX}
              y2={y}
              stroke={C.borderLight}
              strokeWidth={0.3}
            />
          ))}
          <Line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke={C.text} strokeWidth={0.5} />
          <Line x1={padX} y1={padY} x2={padX} y2={H - padY} stroke={C.text} strokeWidth={0.5} />

          <Polyline points={toPoints(worst)} fill="none" stroke={C.red} strokeWidth={1.2} />
          <Polyline points={toPoints(actual)} fill="none" stroke={C.navy} strokeWidth={1.5} />
          <Polyline points={toPoints(best)} fill="none" stroke={C.green} strokeWidth={1.2} />

          <Text x={padX} y={H - padY + 14} style={{ fontSize: 8, fill: C.textMuted }}>T-01</Text>
          <Text x={W / 2} y={H - padY + 14} style={{ fontSize: 8, fill: C.textMuted }} textAnchor="middle">
            T-{String(Math.round(actual.length / 2)).padStart(2, '0')}
          </Text>
          <Text x={W - padX} y={H - padY + 14} style={{ fontSize: 8, fill: C.textMuted }} textAnchor="end">
            T-{String(actual.length).padStart(2, '0')} · 40Y
          </Text>

          <Text x={padX - 6} y={padY + 4} style={{ fontSize: 8, fill: C.textMuted }} textAnchor="end">
            {fmt(maxVal * 1000)}
          </Text>
          <Text x={padX - 6} y={H - padY} style={{ fontSize: 8, fill: C.textMuted }} textAnchor="end">$0</Text>
        </Svg>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 1.5, backgroundColor: C.green }} />
            <Text style={{ fontSize: 9, color: C.text }}>Best Case · {fmt((best[best.length - 1] || 0) * 1000)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 1.5, backgroundColor: C.navy }} />
            <Text style={{ fontSize: 9, color: C.text }}>Actual · {fmt((actual[actual.length - 1] || 0) * 1000)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 1.5, backgroundColor: C.red }} />
            <Text style={{ fontSize: 9, color: C.text }}>Worst Case · {fmt((worst[worst.length - 1] || 0) * 1000)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>
          "복리는 세계 8대 불가사의이다. 이를 이해하는 자는 벌고, 이해하지 못하는 자는 지불한다."
        </Text>
        <Text style={styles.noteSource}>— Albert Einstein (귀속)</Text>
      </View>
    </PageFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 7. 재무 의사결정 원칙
// ─────────────────────────────────────────────────────────────
const PrinciplesPage = ({ playerName, sectionNum, pageNum, total }) => {
  const principles = [
    {
      num: '01',
      title: '기준점의 내재화 (Internalization of Standards)',
      body: '외부 시장 기준이 아닌 자신만의 자산-부채 정의와 캐쉬플로우 목표를 수립한다. 의사결정의 일관성은 명확한 내부 기준에서 비롯된다.',
    },
    {
      num: '02',
      title: '시간의 주권 (Sovereignty over Time)',
      body: '근로소득은 시간의 매도이며, 패시브 인컴은 시간의 매수다. 1턴(2년)마다의 의사결정은 시간 자산의 순포지션을 결정한다.',
    },
    {
      num: '03',
      title: '시스템의 우위 (Primacy of System over Asset)',
      body: '단일 자산은 손실 가능성이 있으나 자산 운용 시스템은 재구축 가능하다. 자산 자체보다 자산을 생성하는 의사결정 프로세스에 투자한다.',
    },
  ];

  return (
    <PageFrame label="FINANCIAL PRINCIPLES" pageNumber={pageNum} totalPages={total} playerName={playerName}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionNumber}>SECTION {String(sectionNum).padStart(2, '0')}</Text>
        <Text style={styles.sectionTitle}>재무 의사결정 원칙</Text>
      </View>

      <Text style={styles.body}>
        본 코칭 프로그램에서 권장하는 세 가지 핵심 원칙은 모든 부의 단계에서 공통으로 적용된다.
        시뮬레이션 결과의 해석과 향후 실제 자산 운용 의사결정 시 참조 기준으로 활용할 수 있다.
      </Text>

      <View style={{ marginTop: 16 }}>
        {principles.map((p, i) => (
          <View
            key={i}
            style={{
              marginBottom: 18,
              paddingTop: 12,
              borderTopWidth: i === 0 ? 1 : 0.5,
              borderTopColor: i === 0 ? C.navy : C.borderLight,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: 300,
                  color: C.gold,
                  width: 36,
                  lineHeight: 1,
                }}
              >
                {p.num}
              </Text>
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.ink,
                  lineHeight: 1.4,
                }}
              >
                {p.title}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 10.5,
                color: C.text,
                lineHeight: 1.8,
                paddingLeft: 52,
              }}
            >
              {p.body}
            </Text>
          </View>
        ))}
      </View>
    </PageFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 8. 자기 진단 노트
// ─────────────────────────────────────────────────────────────
const WorkbookPage = ({ playerName, sectionNum, pageNum, total }) => {
  const questions = [
    '시뮬레이션에서 가장 큰 비용을 발생시킨 의사결정과, 실제 자산 운용에서 유사한 패턴이 발견되는지 점검한다.',
    '소비 의사결정(DOODAD) 대응 패턴이 실제 월간 지출 구조와 어떻게 연관되는지 분석한다.',
    '향후 12개월 내 실행 가능한 단일 재무 행동 한 가지를 정의한다.',
  ];

  return (
    <PageFrame label="SELF-ASSESSMENT" pageNumber={pageNum} totalPages={total} playerName={playerName}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionNumber}>SECTION {String(sectionNum).padStart(2, '0')}</Text>
        <Text style={styles.sectionTitle}>자기 진단 노트</Text>
      </View>

      <Text style={styles.body}>
        본 섹션은 시뮬레이션 결과를 실제 재무 의사결정으로 연결하기 위한 자기 점검 문항이다.
        각 항목에 대한 답변은 코칭 세션의 기초 자료로 활용될 수 있다.
      </Text>

      <View style={{ marginTop: 16 }}>
        {questions.map((q, i) => (
          <View key={i} style={{ marginBottom: 22 }}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: C.gold,
                  fontWeight: 700,
                  width: 32,
                  letterSpacing: 1,
                }}
              >
                Q{String(i + 1).padStart(2, '0')}
              </Text>
              <Text style={{ flex: 1, fontSize: 11, color: C.ink, fontWeight: 500, lineHeight: 1.6 }}>
                {q}
              </Text>
            </View>
            <View style={{ paddingLeft: 42 }}>
              {[0, 1, 2, 3].map((j) => (
                <View key={j} style={styles.writeLine} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </PageFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 9. 권고 사항
// ─────────────────────────────────────────────────────────────
const RecommendationsPage = ({ playerName, qrCoaching, qrNextGame, sectionNum, pageNum, total }) => {
  const actions = [
    {
      num: '01',
      title: '재시뮬레이션 수행',
      body: '동일 인물의 다른 직군 시나리오로 1회 재시뮬레이션을 수행하여 의사결정 패턴의 일관성을 검증한다.',
    },
    {
      num: '02',
      title: '실제 재무 현황 점검표 작성',
      body: '실제 패시브 인컴 / 월 지출 비율을 산출하고 6단계의 부의 단계상 위치를 확인한다.',
    },
    {
      num: '03',
      title: '1:1 코칭 세션 신청',
      body: '본 리포트를 기반으로 코칭 디렉터와의 1:1 세션에서 12개월 단위 실행 계획을 수립한다.',
    },
  ];

  return (
    <PageFrame label="RECOMMENDATIONS" pageNumber={pageNum} totalPages={total} playerName={playerName}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionNumber}>SECTION {String(sectionNum).padStart(2, '0')}</Text>
        <Text style={styles.sectionTitle}>실행 권고</Text>
      </View>

      <Text style={styles.body}>
        본 리포트의 진단 결과를 실제 재무 의사결정으로 전환하기 위한 권고 사항은 다음과 같다.
        각 권고는 시뮬레이션 결과의 신뢰성을 확보하고, 실행 가능한 행동 단위로 구체화하는 데 목적이 있다.
      </Text>

      <View style={{ marginTop: 18 }}>
        {actions.map((a, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              gap: 14,
              marginBottom: 14,
              paddingBottom: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: C.borderLight,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                backgroundColor: C.navy,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: C.paper, fontSize: 11, fontWeight: 700 }}>
                {a.num}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                {a.title}
              </Text>
              <Text style={{ fontSize: 10, color: C.text, lineHeight: 1.7 }}>{a.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View
        style={{
          marginTop: 24,
          padding: 16,
          backgroundColor: C.surface,
          borderTopWidth: 2,
          borderTopColor: C.navy,
        }}
      >
        <Text style={[styles.caption, { marginBottom: 12, color: C.navy }]}>
          CONTACT · 코칭 신청 및 후속 시뮬레이션
        </Text>

        <View style={{ flexDirection: 'row', gap: 16 }}>
          {qrCoaching && (
            <View style={{ flex: 1, alignItems: 'center', padding: 12, backgroundColor: C.paper, borderWidth: 0.5, borderColor: C.borderLight }}>
              <Image src={qrCoaching} style={{ width: 76, height: 76, marginBottom: 6 }} />
              <Text style={{ fontSize: 9, color: C.navy, fontWeight: 600, letterSpacing: 1 }}>COACHING</Text>
              <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 2 }}>1:1 코칭 신청</Text>
            </View>
          )}
          {qrNextGame && (
            <View style={{ flex: 1, alignItems: 'center', padding: 12, backgroundColor: C.paper, borderWidth: 0.5, borderColor: C.borderLight }}>
              <Image src={qrNextGame} style={{ width: 76, height: 76, marginBottom: 6 }} />
              <Text style={{ fontSize: 9, color: C.navy, fontWeight: 600, letterSpacing: 1 }}>RE-SIMULATION</Text>
              <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 2 }}>재시뮬레이션 예약</Text>
            </View>
          )}
        </View>

        <View
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTopWidth: 0.5,
            borderTopColor: C.borderLight,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image src={LOGO_ASSOCIATION} style={{ width: 22, height: 22 }} />
            <View>
              <Text style={{ fontSize: 9, color: C.ink, fontWeight: 600 }}>국제캐쉬플로우강사협회</Text>
              <Text style={{ fontSize: 7, color: C.textMuted, letterSpacing: 0.5 }}>FINANCE COACH ASSOCIATION</Text>
            </View>
          </View>
          <Image src={LOGO_CLUBS_KOREA} style={{ width: 60, height: 40, objectFit: 'contain' }} />
        </View>
        <Text style={{ fontSize: 8, color: C.textMuted, marginTop: 8, textAlign: 'right' }}>
          cashflow-coach.vercel.app
        </Text>
      </View>

      <View style={[styles.noteBox, { marginTop: 16 }]}>
        <Text style={styles.noteText}>
          "계획 없는 목표는 단지 소망일 뿐이다."
        </Text>
        <Text style={styles.noteSource}>— Antoine de Saint-Exupéry</Text>
      </View>
    </PageFrame>
  );
};

// ─────────────────────────────────────────────────────────────
// 메인 Document
// ─────────────────────────────────────────────────────────────
export const StorybookDocument = ({ data, qrCoaching, qrNextGame }) => {
  const {
    playerName = '플레이어',
    job = '직업',
    turnCount = 20,
    date = new Date().toLocaleDateString('ko-KR'),
    metrics = { totalAsset: 0, monthlyCF: 0, passiveIncome: 0, expense: 3000, escaped: false },
    phases = [],
    comparison = { best: [], actual: [], worst: [] },
    persona = null,  // 8 페르소나 진단 결과 (personaDiagnosis.js의 generatePersonaInsight() 출력)
  } = data;

  const level = diagnoseLevel(metrics.passiveIncome, metrics.expense, metrics.totalAsset);
  const reportNo = `RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`;

  // 표지 + 서두 + 요약 + 6Levels + 챕터 N개 + 페르소나 + 시나리오 + 원칙 + 워크북 + 권고
  const totalPages = 1 + 1 + 1 + 1 + phases.length + 1 + 1 + 1 + 1 + 1;

  let pn = 1;
  let sn = 1;

  return (
    <Document title={`${playerName}_캐쉬플로우_디브리핑_리포트`} author="국제캐쉬플로우강사협회">
      <CoverPage
        playerName={playerName}
        job={job}
        turnCount={turnCount}
        date={date}
        level={level}
        reportNo={reportNo}
      />
      {(() => { pn++; return null; })()}
      <ExecutiveLetterPage playerName={playerName} pageNum={++pn} total={totalPages} />
      <ExecutiveSummaryPage playerName={playerName} metrics={metrics} level={level} pageNum={++pn} total={totalPages} />
      {(() => { sn++; return null; })()}
      <SixLevelsPage playerName={playerName} level={level} metrics={metrics} pageNum={++pn} total={totalPages} />
      {phases.map((phase, i) => {
        sn++;
        return (
          <ChapterPage
            key={i}
            phase={{ ...phase, num: i + 1 }}
            playerName={playerName}
            sectionNum={sn}
            pageNum={++pn}
            total={totalPages}
          />
        );
      })}
      {(() => { sn++; return null; })()}
      <PersonaPage playerName={playerName} persona={persona} sectionNum={sn} pageNum={++pn} total={totalPages} />
      {(() => { sn++; return null; })()}
      <CrossroadsPage playerName={playerName} comparison={comparison} sectionNum={sn} pageNum={++pn} total={totalPages} />
      {(() => { sn++; return null; })()}
      <PrinciplesPage playerName={playerName} sectionNum={sn} pageNum={++pn} total={totalPages} />
      {(() => { sn++; return null; })()}
      <WorkbookPage playerName={playerName} sectionNum={sn} pageNum={++pn} total={totalPages} />
      {(() => { sn++; return null; })()}
      <RecommendationsPage
        playerName={playerName}
        qrCoaching={qrCoaching}
        qrNextGame={qrNextGame}
        sectionNum={sn}
        pageNum={++pn}
        total={totalPages}
      />
    </Document>
  );
};

// ─────────────────────────────────────────────────────────────
// 다운로드 헬퍼
// ─────────────────────────────────────────────────────────────
export const downloadStorybookPDF = async (gameData, options = {}) => {
  const {
    coachingUrl = 'https://cashflow-coach.vercel.app/coaching',
    nextGameUrl = 'https://cashflow-coach.vercel.app/play',
    filename,
  } = options;

  const [qrCoaching, qrNextGame] = await Promise.all([
    generateQRDataUrl(coachingUrl),
    generateQRDataUrl(nextGameUrl),
  ]);

  const blob = await pdf(
    <StorybookDocument data={gameData} qrCoaching={qrCoaching} qrNextGame={qrNextGame} />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = filename || `Cashflow_Debriefing_Report_${gameData.playerName || 'player'}_${dateStr}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default StorybookDocument;
