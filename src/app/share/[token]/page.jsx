// app/share/[token]/page.jsx
//
// 공유 디브리핑 표시 페이지
// URL: /share/{uuid-token}
// 누구나 접근 가능 (URL만 알면 OK)

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function SharePage() {
  // 🔧 Next.js 16 호환: useParams 훅 사용
  // - props.params 대신 useParams() 훅으로 접근
  // - 클라이언트 컴포넌트에서 가장 안정적
  // - 14/15/16 모든 버전 호환
  const params = useParams();
  const token = params?.token;

  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inappBlocked, setInappBlocked] = useState(false);

  // 🆕 useEffect 1: 카카오톡 인앱브라우저 감지 + 외부 브라우저 자동 호출
  // ─────────────────────────────────────────────────────────────────
  // 카카오톡 인앱브라우저는 vercel.app 같은 일부 도메인에서 클릭 무반응 이슈가 있음.
  // 페이지 로드 시 카카오톡 인앱브라우저면 즉시 외부 브라우저(크롬/사파리)로 자동 전환.
  // 한국 서비스 표준 패턴 (삼쩜삼, 쿠팡 등 사용 중).
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const ua = navigator.userAgent.toLowerCase();
    const isKakaoTalk = ua.includes("kakaotalk");
    const isLine = ua.includes("line/");
    const isFacebook = ua.includes("fb_iab") || ua.includes("fbav");
    const isInstagram = ua.includes("instagram");

    if (isKakaoTalk) {
      // 카카오톡: 외부 브라우저로 직접 전환 시도 (가장 효과적)
      const targetUrl = window.location.href;
      console.log("[share] 카카오톡 감지 → 외부 브라우저 전환 시도");
      window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(targetUrl);

      // 만약 위 호출이 실패하면 1.5초 후 안내 화면 표시
      setTimeout(() => setInappBlocked(true), 1500);
    } else if (isLine || isFacebook || isInstagram) {
      // 다른 인앱브라우저: 안내 화면 표시
      setInappBlocked(true);
    }
  }, []);

  // useEffect 2: 공유 데이터 조회
  useEffect(() => {
    if (!token) return;
    if (inappBlocked) return; // 인앱브라우저면 스킵
    let cancelled = false;
    
    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`);
        const data = await res.json();
        
        if (cancelled) return;
        
        if (!res.ok) {
          setError(data.error || "공유 링크를 불러올 수 없습니다");
        } else {
          setShare(data);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "네트워크 오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    load();
    return () => { cancelled = true; };
  }, [token, inappBlocked]);

  // 인앱브라우저 차단 안내 화면 (가장 먼저 체크)
  if (inappBlocked) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0f",
        color: "#fafafa",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 20,
      }}>
        <div style={{
          maxWidth: 400, textAlign: "center",
          padding: 30, borderRadius: 16,
          background: "#1a1a24", border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: "#fafafa" }}>
            외부 브라우저에서 열어주세요
          </h2>
          <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 16, lineHeight: 1.6 }}>
            현재 인앱브라우저에서는 정상 표시가 어렵습니다.<br />
            아래 방법으로 외부 브라우저(Chrome/Safari)에서 열어주세요.
          </p>
          <div style={{
            padding: 14, borderRadius: 8, marginBottom: 16,
            background: "#0a0a0f", border: "1px solid #27272a",
            fontSize: 12, color: "#d4d4d8", textAlign: "left", lineHeight: 1.8,
          }}>
            <strong style={{ color: "#fde68a" }}>📱 안드로이드:</strong><br />
            우측 상단 <strong>⋮</strong> → <strong>다른 브라우저로 열기</strong><br /><br />
            <strong style={{ color: "#fde68a" }}>🍎 아이폰:</strong><br />
            우측 하단 <strong>나침반(⊕)</strong> 아이콘 → <strong>Safari로 열기</strong>
          </div>
          <button
            onClick={() => {
              const url = window.location.href;
              if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                  alert("URL이 복사되었습니다.\n외부 브라우저 주소창에 붙여넣으세요.");
                }).catch(() => {
                  prompt("이 URL을 복사하여 외부 브라우저에 붙여넣으세요:", url);
                });
              } else {
                prompt("이 URL을 복사하여 외부 브라우저에 붙여넣으세요:", url);
              }
            }}
            style={{
              padding: "10px 20px", borderRadius: 8,
              background: "#3b82f6", color: "#fff", border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            🔗 URL 복사
          </button>
        </div>
      </div>
    );
  }

  // 로딩
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0f",
        color: "#fafafa",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <div style={{ fontSize: 14, color: "#a1a1aa" }}>공유 디브리핑 불러오는 중...</div>
        </div>
      </div>
    );
  }

  // 에러
  if (error) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0f",
        color: "#fafafa",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 20,
      }}>
        <div style={{
          maxWidth: 400, textAlign: "center",
          padding: 30, borderRadius: 16,
          background: "#1a1a24", border: "1px solid #27272a",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: "#fafafa" }}>
            공유 링크를 찾을 수 없습니다
          </h2>
          <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 20 }}>
            {error}
          </p>
          <a href="/" style={{
            display: "inline-block",
            padding: "10px 20px", borderRadius: 8,
            background: "#3b82f6", color: "#fff",
            textDecoration: "none", fontSize: 13, fontWeight: 600,
          }}>
            캐쉬플로우 코치 홈으로
          </a>
        </div>
      </div>
    );
  }

  // 정상 표시
  const tierLabel = share.feedback_tier === 0 ? "💬 요약 피드백"
    : share.feedback_tier === 1 ? "📝 상세 피드백"
    : share.feedback_tier === 2 ? "💎 프리미엄 피드백"
    : "📋 디브리핑";

  const personaImageUrl = share.persona_key
    ? `/personas/${share.persona_key}.png`
    : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0a0a0f 0%, #1a1a24 100%)",
      color: "#fafafa",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "20px 16px 60px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        
        {/* 헤더 */}
        <div style={{
          padding: "20px 24px", borderRadius: 16, marginBottom: 20,
          background: "#1a1a24", border: "1px solid #27272a",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>📊</div>
            <div>
              <div style={{ fontSize: 11, color: "#a1a1aa", letterSpacing: 2, fontWeight: 600 }}>
                CASHFLOW COACH
              </div>
              <div style={{ fontSize: 11, color: "#71717a" }}>
                국제캐쉬플로우강사협회
              </div>
            </div>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fafafa", margin: "0 0 6px" }}>
            {tierLabel}
          </h1>
          <div style={{ fontSize: 12, color: "#a1a1aa" }}>
            <strong style={{ color: "#fde68a" }}>{share.nickname}</strong>님의 디브리핑
            {share.date_played && ` · ${share.date_played}`}
            {share.version && ` · ${share.version}`}
            {share.job && ` · ${share.job}`}
            {share.turn_count > 0 && ` · ${share.turn_count}턴`}
            {share.escaped && ` · ✅ 탈출`}
          </div>
        </div>

        {/* 페르소나 카드 (있으면) */}
        {personaImageUrl && (
          <div style={{
            padding: "20px 24px", borderRadius: 16, marginBottom: 20,
            background: "linear-gradient(135deg, #fde68a08, #f59e0b08)",
            border: "1px solid #fde68a30",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <img
              src={personaImageUrl}
              alt={share.persona_name || "페르소나"}
              style={{ width: 80, height: 80, borderRadius: 12 }}
            />
            <div>
              <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4 }}>
                🎭 진단된 재무 페르소나
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fde68a" }}>
                {share.persona_name || "(진단 결과)"}
              </div>
            </div>
          </div>
        )}

        {/* 피드백 본문 */}
        {share.feedback_text && (
          <div style={{
            padding: "24px 24px", borderRadius: 16, marginBottom: 20,
            background: "#111118", border: "1px solid #27272a",
          }}>
            <div style={{
              fontSize: 13, lineHeight: 1.9, color: "#d4d4d8",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {share.feedback_text}
            </div>
          </div>
        )}

        {/* 분석 결과 (있으면) */}
        {share.analysis?.lessons && Array.isArray(share.analysis.lessons) && share.analysis.lessons.length > 0 && (
          <div style={{
            padding: "20px 24px", borderRadius: 16, marginBottom: 20,
            background: "#111118", border: "1px solid #27272a",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", marginBottom: 14 }}>
              💡 이 게임이 가르쳐 준 5가지
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, color: "#d4d4d8", fontSize: 13, lineHeight: 1.8 }}>
              {share.analysis.lessons.map((lesson, i) => (
                <li key={i} style={{ marginBottom: 8 }}>{lesson}</li>
              ))}
            </ol>
          </div>
        )}

        {/* 푸터 CTA */}
        <div style={{
          padding: "20px 24px", borderRadius: 16,
          background: "linear-gradient(135deg, #3b82f615, #8b5cf615)",
          border: "1px solid #3b82f640",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12 }}>
            나도 캐쉬플로우 게임으로 재무 페르소나 진단 받아보기
          </div>
          <a href="/" style={{
            display: "inline-block",
            padding: "12px 28px", borderRadius: 10,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14, fontWeight: 700,
          }}>
            캐쉬플로우 코치 시작하기 →
          </a>
        </div>

        {/* 출처 */}
        <div style={{ marginTop: 30, textAlign: "center", fontSize: 10, color: "#52525b" }}>
          국제캐쉬플로우강사협회 · 대표 정윤후<br />
          Robert Kiyosaki Official Korea & Japan Partner
          {share.view_count > 0 && ` · 조회수 ${share.view_count}`}
        </div>
      </div>
    </div>
  );
}
