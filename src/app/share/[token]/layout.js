// app/share/[token]/layout.js
//
// 공유 페이지의 메타데이터 (OG 태그) 생성용 layout
// Server Component이므로 generateMetadata export 가능
//
// 카카오톡, 페이스북, 트위터 등에서 미리보기 그릴 때
// 이 파일이 만든 메타태그를 읽음.

import { createClient } from "@supabase/supabase-js";

// ─── generateMetadata: 공유된 디브리핑 정보로 OG 태그 동적 생성 ───
export async function generateMetadata({ params }) {
  // Next.js 16: params는 Promise
  const { token } = await params;

  const PROD_DOMAIN = "https://cashflow-coach.vercel.app";
  const shareUrl = `${PROD_DOMAIN}/share/${token}`;

  // 기본값 (DB 조회 실패 시 폴백)
  let title = "💎 캐쉬플로우 디브리핑";
  let description = "캐쉬플로우 게임으로 진단받은 재무 페르소나와 AI 코칭 결과";

  // Supabase에서 공유 데이터 조회 (RLS가 익명 SELECT 허용)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey && token) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: share } = await supabase
        .from("shared_debriefs")
        .select("nickname, version, job, turn_count, escaped, feedback_tier, persona_name, feedback_text")
        .eq("token", token)
        .single();

      if (share) {
        const tierIcon = share.feedback_tier === 0 ? "💬"
          : share.feedback_tier === 1 ? "📝"
          : share.feedback_tier === 2 ? "💎"
          : "📋";
        const tierName = share.feedback_tier === 0 ? "요약 피드백"
          : share.feedback_tier === 1 ? "상세 피드백"
          : share.feedback_tier === 2 ? "프리미엄 피드백"
          : "디브리핑";

        title = `${tierIcon} ${share.nickname || "익명"}님의 ${tierName}`;

        const personaPart = share.persona_name ? ` · 🎭 ${share.persona_name}` : "";
        const escapedPart = share.escaped ? " · ✅ 탈출" : "";
        const metaPart = `${share.version || ""} · ${share.job || ""} · ${share.turn_count || 0}턴${escapedPart}${personaPart}`;

        // 본문 발췌 (앞 100자)
        const snippet = share.feedback_text
          ? share.feedback_text.substring(0, 100).replace(/\n+/g, " ").trim() + "..."
          : "캐쉬플로우 게임 코칭 결과";

        description = `${metaPart}\n\n${snippet}`;
      }
    }
  } catch (e) {
    console.warn("[share/layout/generateMetadata] DB 조회 실패, 기본값 사용:", e.message);
  }

  const ogImageUrl = `${PROD_DOMAIN}/og-image.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: shareUrl,
      siteName: "캐쉬플로우 코치",
      images: [
        {
          url: ogImageUrl,
          width: 800,
          height: 400,
          alt: "캐쉬플로우 디브리핑",
        },
      ],
      locale: "ko_KR",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    // 카카오톡은 표준 OG 태그를 따르므로 별도 설정 불필요
    // 단, 명시적으로 robots 설정해서 카카오 봇 허용
    robots: {
      index: true,
      follow: true,
    },
  };
}

// ─── 단순 layout (children 그대로 렌더) ───
//
// page.jsx가 클라이언트 컴포넌트라 layout은 단순히
// 메타데이터 export만 하고 children은 통과시킴.
export default function ShareLayout({ children }) {
  return children;
}
