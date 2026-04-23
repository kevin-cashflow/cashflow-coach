"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateFreeFeedback, generatePaidFeedback, buildPromptText } from "./CashflowCoachingSim";
import {
  saveEternalDebrief,
  getAllEternalDebriefs,
  deleteGameEternalDebriefs,
  countEternalDebriefs,
} from "./eternalStorage";

/**
 * 📊 내 이력 탭 (Phase B Day 4 — 게임 단위 통합)
 *
 * 변경 사항 (2026-04):
 *  - 기존 debrief_reports 테이블 기반 → window.storage의 game:* 키 기반으로 변경
 *  - 게임 단위로 카드 표시 (각 게임마다 디브리핑 4종 진행/보기 버튼)
 *  - 디브리핑은 한 번만 진행, 진행 후 저장본 표시
 *
 * Props:
 * - authUser: 현재 로그인 사용자
 * - embedded: true면 자체 헤더/외곽 패딩 제거 (다른 탭/카드에 끼워 쓸 때)
 */
export default function MyHistoryTab({ authUser, embedded = false }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 디브리핑 모달: { game, tier: "free"|"detail"|"premium", text, loading, error }
  const [debriefModal, setDebriefModal] = useState(null);
  // 게임 기록 모달: 게임 객체 전체 (턴 로그, 자산, 자금 등 표시용)
  const [recordModal, setRecordModal] = useState(null);

  // 언마운트 체크용 ref (React state 업데이트 경고 방지)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 안전한 setState 래퍼 — 언마운트 후에도 에러 없음
  const safeSetGames = useCallback((updater) => {
    if (isMountedRef.current) setGames(updater);
  }, []);
  const safeSetDebriefModal = useCallback((updater) => {
    if (isMountedRef.current) setDebriefModal(updater);
  }, []);

  // ── 게임 목록 로드 (안전 모드: 타임아웃 + 에러 격리) ──
  const loadGames = useCallback(async () => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    // 각 storage 호출마다 새로운 타임아웃 Promise 생성 (15초)
    const makeTimeout = () => new Promise((_, reject) =>
      setTimeout(() => reject(new Error("storage 응답 시간 초과 (15초)")), 15000)
    );

    try {
      if (!window.storage) {
        throw new Error("storage가 준비되지 않았습니다.");
      }

      console.log("[MyHistoryTab] 로드 시작...");
      const gameMap = new Map();

      // ── 1) window.storage에서 game:* 키 조회 (타임아웃 보호) ──
      try {
        const list = await Promise.race([
          window.storage.list("game:"),
          makeTimeout(),
        ]);
        const keys = list?.keys || [];
        console.log("[MyHistoryTab] game:* 키:", keys.length, "개");

        // 키 개수 제한 (너무 많으면 처음 50개만)
        const limitedKeys = keys.slice(0, 50);

        // 병렬 조회 (Promise.all로 최적화)
        const fetchPromises = limitedKeys.map(async (k) => {
          try {
            const r = await Promise.race([
              window.storage.get(k),
              new Promise((_, rej) => setTimeout(() => rej(new Error("get 타임아웃")), 8000)),
            ]);
            if (!r?.value) return null;
            const data = JSON.parse(r.value);

            // debriefData 구조 검증 - 없거나 잘못된 구조면 빈 구조로 보정
            // (이미 저장된 피드백은 최대한 보존)
            if (!data.debriefData || typeof data.debriefData !== "object") {
              data.debriefData = { analysis: null, analysisAt: null, feedback: { free: null, detail: null, premium: null } };
            } else if (!data.debriefData.feedback || typeof data.debriefData.feedback !== "object") {
              // feedback 필드가 없거나 깨져있으면 복구 시도
              // (이전 버그로 최상위에 free/detail/premium이 있는 경우)
              data.debriefData.feedback = {
                free: data.debriefData.free || null,
                detail: data.debriefData.detail || null,
                premium: data.debriefData.premium || null,
              };
            }

            return { key: k, source: "storage", ...data };
          } catch (err) {
            console.warn("[MyHistoryTab] 게임 로드 스킵:", k);
            return null;
          }
        });

        const results = await Promise.all(fetchPromises);
        for (const game of results) {
          if (game) gameMap.set(game.key, game);
        }
      } catch (e) {
        console.warn("[MyHistoryTab] storage 조회 실패 (계속 진행):", e.message);
      }

      // ── 2) localStorage 백업 검색 (안전: 키 개수 제한) ──
      try {
        if (typeof localStorage !== "undefined") {
          const lsKeys = [];
          // 빠르게 game:로 시작하는 키만 수집 (전체 키 순회는 빠름, 값 읽기가 느림)
          for (let i = 0; i < localStorage.length && lsKeys.length < 50; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("game:") && !gameMap.has(k)) {
              lsKeys.push(k);
            }
          }
          console.log("[MyHistoryTab] localStorage 추가 키:", lsKeys.length, "개");

          for (const k of lsKeys) {
            try {
              const v = localStorage.getItem(k);
              if (!v) continue;
              const data = JSON.parse(v);
              gameMap.set(k, { key: k, source: "localStorage", ...data });
            } catch {}
          }
        }
      } catch (e) {
        console.warn("[MyHistoryTab] localStorage 검색 실패 (계속 진행):", e.message);
      }

      // ── 3) 구버전 debrief:* 데이터 (선택적, 실패해도 무시) ──
      try {
        const debriefList = await Promise.race([
          window.storage.list("debrief:"),
          new Promise((_, rej) => setTimeout(() => rej(new Error("debrief list 타임아웃")), 10000)),
        ]);
        const debriefKeys = (debriefList?.keys || []).slice(0, 30);
        console.log("[MyHistoryTab] debrief:* 키:", debriefKeys.length, "개");

        const debriefPromises = debriefKeys.map(async (k) => {
          try {
            const r = await Promise.race([
              window.storage.get(k),
              new Promise((_, rej) => setTimeout(() => rej(new Error("타임아웃")), 5000)),
            ]);
            if (!r?.value) return null;
            const d = JSON.parse(r.value);
            const ts = d.ts || parseInt(k.split(":")[1]) || Date.now();

            // 기존 구조에서 feedback 재구성
            // 1. 원본 feedbackTier/feedback (legacy 단일 티어)
            // 2. debriefDataExtended (우리가 추가한 확장 필드, 여러 티어 포함)
            const baseFeedback = {
              free: d.feedbackTier === 0 && d.feedback ? { text: d.feedback, generatedAt: d.dateTime } : null,
              detail: d.feedbackTier === 1 && d.feedback ? { text: d.feedback, generatedAt: d.dateTime } : null,
              premium: d.feedbackTier === 2 && d.feedback ? { text: d.feedback, generatedAt: d.dateTime } : null,
            };
            // debriefDataExtended가 있으면 덮어쓰기 (더 최신)
            const mergedFeedback = {
              free: d.debriefDataExtended?.free || baseFeedback.free,
              detail: d.debriefDataExtended?.detail || baseFeedback.detail,
              premium: d.debriefDataExtended?.premium || baseFeedback.premium,
            };

            // 원본 키(k)를 그대로 유지. 저장 시에도 이 키를 씀.
            return {
              key: k,
              source: "legacy-debrief",
              ts,
              dateTime: d.dateTime,
              date: d.date,
              time: d.time,
              version: d.version || "캐쉬플로우",
              job: d.job || "(이전 디브리핑)",
              turnCount: d.turnCount || d.turns || (Array.isArray(d.turnLog) ? d.turnLog.length : 0),
              simText: d.simText || "",
              isLegacyDebrief: true,
              _legacyRaw: d,
              // 🆕 턴 로그 및 최종 스냅샷 복원 (새 디브리핑 저장본에서 사용)
              turnLog: Array.isArray(d.turnLog) ? d.turnLog : [],
              assets: Array.isArray(d.assets) ? d.assets : [],
              cash: d.cash ?? 0,
              totalCF: d.totalCF ?? 0,
              bankLoan: d.bankLoan ?? 0,
              loanInterest: d.loanInterest ?? 0,
              babies: d.babies ?? 0,
              debriefData: {
                analysis: d.analysis || null,
                analysisAt: d.dateTime || null,
                feedback: mergedFeedback,  // ★ 올바르게 병합된 구조
              },
            };
          } catch {
            return null;
          }
        });

        const debriefResults = await Promise.all(debriefPromises);
        for (const d of debriefResults) {
          if (d && !gameMap.has(d.key)) gameMap.set(d.key, d);
        }
      } catch (e) {
        console.warn("[MyHistoryTab] debrief 검색 실패 (계속 진행):", e.message);
      }

      const loaded = Array.from(gameMap.values());
      console.log("[MyHistoryTab] 최종 로드:", loaded.length, "개");

      // 최신순 정렬
      loaded.sort((a, b) => {
        const ta = a.ts || new Date(a.dateTime || 0).getTime();
        const tb = b.ts || new Date(b.dateTime || 0).getTime();
        return tb - ta;
      });

      // ── 🔐 영구 저장된 디브리핑 데이터 복원 ──
      // localStorage의 "debrief-永:" 키들에서 피드백 정보 수집
      // 이 데이터는 어떤 일이 있어도 유지되어야 함 (박제)
      const eternalFeedbacks = new Map(); // Map<gameKey, { free, detail, premium }>
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith("debrief-永:")) continue;
          try {
            const v = localStorage.getItem(k);
            if (!v) continue;
            const eternal = JSON.parse(v);
            const { gameKey, tier, text, generatedAt } = eternal;
            if (!gameKey || !tier || !text) continue;

            if (!eternalFeedbacks.has(gameKey)) {
              eternalFeedbacks.set(gameKey, {});
            }
            eternalFeedbacks.get(gameKey)[tier] = { text, generatedAt };
          } catch {}
        }
        console.log(`[MyHistoryTab] 🔐 영구 저장 디브리핑 발견 (localStorage):`, eternalFeedbacks.size, "개 게임");
      } catch (e) {
        console.warn("[MyHistoryTab] 영구 저장 검색 실패:", e);
      }

      // ── 🔐 IndexedDB 영구 저장 조회 (Supabase가 건드릴 수 없음) ──
      // localStorage가 비어있어도 IndexedDB에는 살아있을 수 있음 (최종 보루)
      const eternalFeedbacksIDB = new Map(); // gameInfo 포함 버전
      try {
        const allIDB = await getAllEternalDebriefs();
        for (const d of allIDB) {
          const { gameKey, tier, text, generatedAt, gameInfo } = d;
          if (!gameKey || !tier || !text) continue;

          if (!eternalFeedbacks.has(gameKey)) {
            eternalFeedbacks.set(gameKey, {});
          }
          // IndexedDB 값이 localStorage에 없었으면 우선 적용
          if (!eternalFeedbacks.get(gameKey)[tier]) {
            eternalFeedbacks.get(gameKey)[tier] = { text, generatedAt };
          }
          // gameInfo도 저장 (복원용)
          if (!eternalFeedbacksIDB.has(gameKey)) {
            eternalFeedbacksIDB.set(gameKey, gameInfo || {});
          }
        }
        console.log(`[MyHistoryTab] 🔐 IndexedDB 영구 저장 발견:`, allIDB.length, "개 디브리핑");
      } catch (e) {
        console.warn("[MyHistoryTab] IndexedDB 조회 실패:", e);
      }

      // ⚠️ 3중 방어 병합 로직
      // 우선순위: 영구 저장(debrief-永) > 메모리 > storage > 기본값 null
      const preserved = loaded.slice(0, 50).map(newGame => {
        const existing = games.find(g => g.key === newGame.key);
        const eternalFb = eternalFeedbacks.get(newGame.key) || {};

        const newFb = newGame.debriefData?.feedback || {};
        const oldFb = existing?.debriefData?.feedback || {};

        // 영구 저장본이 최우선 (한번 저장된 것은 절대 잃지 않음)
        const mergedFb = {
          free: eternalFb.free || newFb.free || oldFb.free || null,
          detail: eternalFb.detail || newFb.detail || oldFb.detail || null,
          premium: eternalFb.premium || newFb.premium || oldFb.premium || null,
        };

        return {
          ...newGame,
          debriefData: {
            ...(newGame.debriefData || {}),
            feedback: mergedFb,
          },
        };
      });

      // ⚠️ 영구 저장본만 있고 게임 데이터가 없는 경우도 복원
      // (ex: storage 실패로 게임은 사라졌지만 디브리핑은 살아있는 경우)
      const loadedKeys = new Set(preserved.map(g => g.key));
      for (const [gameKey, fb] of eternalFeedbacks.entries()) {
        if (loadedKeys.has(gameKey)) continue;

        // 영구 저장에서 게임 정보 뽑아서 가상 게임 객체 생성
        try {
          let gameInfo = {};
          let generatedAt = null;

          // 우선 localStorage에서 gameInfo 시도
          const firstTier = Object.keys(fb)[0];
          const firstTierKey = `debrief-永:${gameKey}:${firstTier}`;
          try {
            const firstTierRaw = localStorage.getItem(firstTierKey);
            if (firstTierRaw) {
              const parsed = JSON.parse(firstTierRaw);
              gameInfo = parsed.gameInfo || {};
              generatedAt = parsed.generatedAt;
            }
          } catch {}

          // localStorage에 없으면 IndexedDB의 gameInfo 사용
          if (!gameInfo || Object.keys(gameInfo).length === 0) {
            gameInfo = eternalFeedbacksIDB.get(gameKey) || {};
          }

          // 생성 시간 추출
          if (!generatedAt) {
            generatedAt = fb.free?.generatedAt || fb.detail?.generatedAt || fb.premium?.generatedAt;
          }

          preserved.push({
            key: gameKey,
            source: "eternal-only",
            ts: generatedAt ? new Date(generatedAt).getTime() : Date.now(),
            dateTime: gameInfo.dateTime,
            date: gameInfo.date,
            version: gameInfo.version || "캐쉬플로우",
            job: gameInfo.job || "(복원된 디브리핑)",
            turnCount: gameInfo.turnCount || 0,
            isEternalOnly: true,
            debriefData: {
              analysis: null,
              analysisAt: null,
              feedback: {
                free: fb.free || null,
                detail: fb.detail || null,
                premium: fb.premium || null,
              },
            },
          });
          console.log(`[MyHistoryTab] 🔐 영구 저장에서 게임 복원: ${gameKey}`);
        } catch {}
      }

      // 다시 정렬 (복원된 게임도 시간순)
      preserved.sort((a, b) => {
        const ta = a.ts || new Date(a.dateTime || 0).getTime();
        const tb = b.ts || new Date(b.dateTime || 0).getTime();
        return tb - ta;
      });

      safeSetGames(preserved);
    } catch (e) {
      console.error("[MyHistoryTab] 게임 이력 조회 실패:", e);
      setError(e.message || "게임 이력을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  // ⚡ 동기 함수: 영구 저장된 디브리핑만 즉시 로드 (네트워크 없음)
  // 로그아웃/재로그인 등 어떤 상황에서도 저장본이 바로 보이도록
  const loadEternalFeedbacksAsGames = () => {
    if (typeof localStorage === "undefined") return [];
    const feedbackMap = new Map(); // Map<gameKey, { free, detail, premium, gameInfo }>

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("debrief-永:")) continue;
      try {
        const v = localStorage.getItem(k);
        if (!v) continue;
        const eternal = JSON.parse(v);
        const { gameKey, tier, text, generatedAt, gameInfo } = eternal;
        if (!gameKey || !tier || !text) continue;

        if (!feedbackMap.has(gameKey)) {
          feedbackMap.set(gameKey, { feedback: {}, gameInfo: gameInfo || {} });
        }
        const entry = feedbackMap.get(gameKey);
        entry.feedback[tier] = { text, generatedAt };
        // gameInfo는 모든 티어에 같이 저장되어 있으므로 덮어써도 OK
        if (gameInfo) entry.gameInfo = gameInfo;
      } catch {}
    }

    // game 객체 배열로 변환
    const result = [];
    for (const [gameKey, { feedback, gameInfo }] of feedbackMap.entries()) {
      // 원본 게임 데이터가 localStorage에 있으면 그걸 기반으로, 없으면 gameInfo 기반
      let baseGame;
      try {
        const raw = localStorage.getItem(gameKey);
        if (raw) {
          baseGame = JSON.parse(raw);
        }
      } catch {}

      if (baseGame) {
        // 원본 있음 → 피드백만 병합
        result.push({
          key: gameKey,
          source: "eternal-enhanced",
          ...baseGame,
          debriefData: {
            ...(baseGame.debriefData || {}),
            feedback: {
              free: feedback.free || baseGame.debriefData?.feedback?.free || null,
              detail: feedback.detail || baseGame.debriefData?.feedback?.detail || null,
              premium: feedback.premium || baseGame.debriefData?.feedback?.premium || null,
            },
          },
        });
      } else {
        // 원본 없음 → gameInfo 기반 가상 게임
        const generatedAt = feedback.free?.generatedAt || feedback.detail?.generatedAt || feedback.premium?.generatedAt;
        result.push({
          key: gameKey,
          source: "eternal-only",
          ts: generatedAt ? new Date(generatedAt).getTime() : Date.now(),
          dateTime: gameInfo.dateTime,
          date: gameInfo.date,
          version: gameInfo.version || "캐쉬플로우",
          job: gameInfo.job || "(보존된 디브리핑)",
          turnCount: gameInfo.turnCount || 0,
          isEternalOnly: true,
          debriefData: {
            analysis: null,
            analysisAt: null,
            feedback: {
              free: feedback.free || null,
              detail: feedback.detail || null,
              premium: feedback.premium || null,
            },
          },
        });
      }
    }

    // 최신순 정렬
    result.sort((a, b) => {
      const ta = a.ts || new Date(a.dateTime || 0).getTime();
      const tb = b.ts || new Date(b.dateTime || 0).getTime();
      return tb - ta;
    });

    return result;
  };

  // 컴포넌트 마운트 시 영구 저장 디브리핑 먼저 즉시 표시 (로그인 여부 무관)
  // → 로그인 지연 시에도 저장본이 먼저 보임
  useEffect(() => {
    try {
      const eternalGames = loadEternalFeedbacksAsGames();
      if (eternalGames.length > 0) {
        console.log(`[MyHistoryTab] 🔐 마운트 시 영구 저장본 즉시 표시:`, eternalGames.length, "개");
        if (isMountedRef.current) {
          setGames(eternalGames);
          setLoading(false); // 즉시 표시
        }
      }
    } catch (e) {
      console.warn("[MyHistoryTab] 마운트 시 영구 저장 로드 실패:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만

  // 컴포넌트 마운트 시 1회 로드 (탭 전환마다 재로드 방지)
  useEffect(() => {
    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]); // authUser가 바뀔 때만 (로그아웃/재로그인 시)

  // ── 브라우저 탭 복귀 시 자동 복구 ──
  // 다른 브라우저 보다가 돌아올 때, storage 조회가 멈춰있거나 세션 토큰이 만료된 경우 대비
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // 탭이 다시 활성화되었을 때
      if (document.visibilityState === "visible") {
        console.log("[MyHistoryTab] 탭 복귀 감지");
        // 로딩 상태에서 멈춰있으면 취소하고 재시도
        if (loading) {
          console.log("[MyHistoryTab] 로딩 중 탭 복귀 → 재시도");
          if (isMountedRef.current) {
            setLoading(false);
            setTimeout(() => {
              if (isMountedRef.current) loadGames();
            }, 100);
          }
          return;
        }

        // 디브리핑 진행 중이었다면 → storage에서 최신 결과 확인
        // (탭이 백그라운드에서도 fetch는 완료되고 storage에 저장되었을 수 있음)
        if (debriefModal?.loading && debriefModal?.game?.key) {
          console.log("[MyHistoryTab] 디브리핑 로딩 중 탭 복귀 → storage 재확인");
          try {
            const r = await window.storage.get(debriefModal.game.key);
            if (r?.value) {
              const updated = JSON.parse(r.value);
              const savedFeedback = updated?.debriefData?.feedback?.[debriefModal.tier]
                || updated?.debriefDataExtended?.[debriefModal.tier];
              if (savedFeedback?.text && isMountedRef.current) {
                // 백그라운드에서 저장된 결과 발견 → 모달 업데이트
                console.log("[MyHistoryTab] 백그라운드 저장 결과 발견");
                safeSetDebriefModal(prev => prev ? {
                  ...prev,
                  text: savedFeedback.text,
                  generatedAt: savedFeedback.generatedAt,
                  loading: false,
                  savedReplay: false,
                } : null);
                // 목록도 갱신
                safeSetGames(prev => prev.map(g =>
                  g.key === debriefModal.game.key
                    ? { ...g, ...updated, key: g.key }
                    : g
                ));
              }
            }
          } catch (e) {
            console.warn("[MyHistoryTab] 복귀 시 storage 확인 실패:", e);
          }
        }
      }
    };

    const handleFocus = () => {
      // 윈도우 포커스 돌아올 때도 체크
      if (loading) {
        console.log("[MyHistoryTab] 포커스 복귀 + 로딩 중 → 재시도");
        if (isMountedRef.current) {
          setLoading(false);
          setTimeout(() => {
            if (isMountedRef.current) loadGames();
          }, 100);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loading, loadGames, debriefModal, safeSetDebriefModal, safeSetGames]);

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // ── 게임 데이터 업데이트 (디브리핑 결과 저장) ──
  // ⚠️ 이 함수의 목적: 한 번 저장된 디브리핑은 절대로 유실되지 않도록 보장
  // 전략: 3중 저장 (메모리 + localStorage + window.storage) + 검증
  const updateGameDebrief = async (gameKey, tier, feedbackText) => {
    try {
      const game = games.find(g => g.key === gameKey);
      if (!game) {
        console.error("[updateGameDebrief] 게임 못 찾음:", gameKey);
        return;
      }
      const debriefData = game.debriefData || {
        analysis: null,
        analysisAt: null,
        feedback: { free: null, detail: null, premium: null },
      };
      const updatedFeedback = { ...debriefData.feedback };
      updatedFeedback[tier] = {
        text: feedbackText,
        generatedAt: new Date().toISOString(),
      };
      const updatedGame = {
        ...game,
        debriefData: {
          ...debriefData,
          feedback: updatedFeedback,
        },
      };

      // 저장할 payload 구성
      const { key: _ignore, source: _s, _legacyRaw, ...basePayload } = updatedGame;

      let finalPayload;
      if (game.isLegacyDebrief && _legacyRaw) {
        // 레거시 debrief:* 키: 원본 구조 유지 + 새 feedback은 debriefDataExtended에 누적
        finalPayload = {
          ..._legacyRaw,
          debriefDataExtended: updatedFeedback,
          ...(tier === "free"    && { feedbackTier: 0, feedback: feedbackText }),
          ...(tier === "detail"  && { feedbackTier: 1, feedback: feedbackText }),
          ...(tier === "premium" && { feedbackTier: 2, feedback: feedbackText }),
        };
      } else {
        finalPayload = basePayload;
      }

      const payloadStr = JSON.stringify(finalPayload);

      // ─── 🛡️ 1차 저장: localStorage (절대 안 사라짐, 로그아웃 후에도 유지) ───
      // 별도 namespace를 쓰지 않고 원본 키 그대로 (호환성)
      let localSaved = false;
      try {
        localStorage.setItem(gameKey, payloadStr);
        localSaved = true;
        console.log(`[updateGameDebrief] ✅ localStorage 저장 성공: ${gameKey} (${tier})`);
      } catch (e) {
        console.error("[updateGameDebrief] localStorage 저장 실패:", e);
      }

      // ─── 🛡️ 2차 저장: "박제용" 별도 키 (절대 손실 방지) ───
      // 이 키는 어떤 경우에도 건드리지 않음. 복구 전용.
      const gameInfo = {
        version: game.version,
        job: game.job,
        turnCount: game.turnCount,
        date: game.date,
        dateTime: game.dateTime,
      };
      try {
        const eternalKey = `debrief-永:${gameKey}:${tier}`;
        localStorage.setItem(eternalKey, JSON.stringify({
          gameKey,
          tier,
          text: feedbackText,
          generatedAt: updatedFeedback[tier].generatedAt,
          gameInfo,
        }));
        console.log(`[updateGameDebrief] ✅ 영구 저장 성공: ${eternalKey}`);
      } catch (e) {
        console.warn("[updateGameDebrief] 영구 저장 실패 (무시 가능):", e);
      }

      // ─── 🔐 2.5차 저장: IndexedDB (Supabase도 건드릴 수 없는 완전 박제) ───
      try {
        await saveEternalDebrief(gameKey, tier, feedbackText, gameInfo);
      } catch (e) {
        console.warn("[updateGameDebrief] IndexedDB 저장 실패 (무시 가능):", e);
      }

      // ─── 🛡️ 3차 저장: window.storage (Supabase) - 타임아웃 + 실패 허용 ───
      try {
        const storagePromise = window.storage.set(gameKey, payloadStr);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("storage 저장 타임아웃 (10초)")), 10000)
        );
        const result = await Promise.race([storagePromise, timeoutPromise]);
        if (result) {
          console.log(`[updateGameDebrief] ✅ window.storage 저장 성공: ${gameKey}`);
        } else {
          console.warn(`[updateGameDebrief] ⚠️ window.storage null 반환 (localStorage에는 저장됨)`);
        }
      } catch (e) {
        console.warn(`[updateGameDebrief] ⚠️ window.storage 저장 실패 (localStorage에는 저장됨):`, e.message);
        // localStorage에는 저장됐으므로 에러 throw 안 함
      }

      // 최소 localStorage 저장은 성공해야 함
      if (!localSaved) {
        throw new Error("모든 저장소에 접근 불가. 브라우저 설정을 확인하세요.");
      }

      // 메모리 상태 갱신
      safeSetGames(prev => prev.map(g => g.key === gameKey ? updatedGame : g));
      return updatedGame;
    } catch (e) {
      console.error("디브리핑 저장 실패:", e);
      throw e;
    }
  };

  // ── 디브리핑 진행/보기 ──
  const handleDebrief = async (game, tier) => {
    // ⚠️ 1회 출력 후 재요청 절대 금지: games state 최신값 기준으로 재확인
    const currentGame = games.find(g => g.key === game.key) || game;

    // ─── 이미 저장된 피드백은 즉시 표시 (API 호출 없음) ───
    const existing = currentGame.debriefData?.feedback?.[tier];
    if (existing?.text) {
      console.log(`[MyHistoryTab] ${tier} 저장본 표시 (재호출 방지)`);
      safeSetDebriefModal({
        game: currentGame,
        tier,
        text: existing.text,
        generatedAt: existing.generatedAt,
        loading: false,
        error: null,
        savedReplay: true,
      });
      return;
    }

    // ─── 유료 티어 확인 팝업 (상세 $9, 프리미엄 $20) ───
    if (tier === "detail" || tier === "premium") {
      const tierInfo = tier === "detail"
        ? { name: "상세 피드백", price: "$9", desc: "AI가 당신의 플레이를 상세히 분석하여\n구조적인 피드백과 개선 방향을 제시합니다." }
        : { name: "프리미엄 피드백", price: "$20", desc: "최고 수준의 AI 분석으로\n기요사키 철학 기반의 심층 조언을 받을 수 있습니다.\n\n가장 깊이 있는 통찰을 제공합니다." };

      const confirmed = window.confirm(
        `📝 ${tierInfo.name} (${tierInfo.price})\n\n${tierInfo.desc}\n\n` +
        `⚠️ 한 번 생성되면 영구 저장되어 이후 재호출 없이 언제든 다시 보실 수 있습니다.\n\n` +
        `진행하시겠습니까?`
      );

      if (!confirmed) {
        console.log(`[MyHistoryTab] ${tier} 사용자 취소`);
        return;
      }
    }

    // 새로 진행 (한 번만 API 호출)
    console.log(`[MyHistoryTab] ${tier} 신규 진행 시작`);
    safeSetDebriefModal({
      game: currentGame,
      tier,
      text: "",
      loading: true,
      error: null,
      savedReplay: false,
    });

    try {
      let result;
      if (tier === "free") {
        // 무료: 동기, 즉시 생성 (비용 없음)
        const results = currentGame.gameResults || (currentGame.turnLog || []).map(t => ({
          turn: t.turn,
          cell: { type: t.cellType, label: t.cellType },
          dealType: t.dealType,
          card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
          decisionSec: t.decisionSec,
          splitApplied: t.splitApplied,
          dice: [0], total: 0, pos: 0,
        }));
        result = generateFreeFeedback(results, currentGame.turnCount || 0);
      } else {
        // 상세/프리미엄: API 호출
        const numericTier = tier === "detail" ? 1 : 2;
        let simText = currentGame.simText;
        if (!simText) {
          const results = currentGame.gameResults || (currentGame.turnLog || []).map(t => ({
            turn: t.turn,
            cell: { type: t.cellType, label: t.cellType },
            dealType: t.dealType,
            card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
            decisionSec: t.decisionSec,
            splitApplied: t.splitApplied,
            dice: [0], total: 0, pos: 0,
          }));
          if (results.length > 0) {
            simText = buildPromptText(results, currentGame.version, currentGame.turnCount || 0);
          }
        }
        if (!simText) {
          throw new Error("이 게임의 시뮬레이션 데이터가 부족하여 디브리핑을 진행할 수 없습니다.");
        }
        result = await generatePaidFeedback({
          tier: numericTier,
          version: currentGame.version,
          turns: currentGame.turnCount || 0,
          simText,
        });
      }

      // 저장 (1회만) — storage 저장은 언마운트돼도 실행됨
      await updateGameDebrief(currentGame.key, tier, result);
      safeSetDebriefModal(prev => prev ? {
        ...prev,
        text: result,
        generatedAt: new Date().toISOString(),
        loading: false,
        savedReplay: false,
      } : null);
    } catch (e) {
      console.error(`디브리핑(${tier}) 실패:`, e);
      safeSetDebriefModal(prev => prev ? {
        ...prev,
        loading: false,
        error: e.message || "디브리핑 진행 중 오류가 발생했습니다.",
      } : null);
    }
  };

  const handleDeleteGame = async (gameKey) => {
    if (!window.confirm("이 게임 기록과 디브리핑 결과를 모두 삭제하시겠습니까?\n\n⚠️ 되돌릴 수 없습니다.\n※ 디브리핑 결과는 영구 저장되어 있으며 함께 삭제됩니다.")) return;
    try {
      // 1) window.storage 삭제
      try { await window.storage.delete(gameKey); } catch {}
      // 2) localStorage 원본 삭제
      try { localStorage.removeItem(gameKey); } catch {}
      // 3) 영구 저장된 디브리핑 3종 모두 삭제 (localStorage)
      try {
        localStorage.removeItem(`debrief-永:${gameKey}:free`);
        localStorage.removeItem(`debrief-永:${gameKey}:detail`);
        localStorage.removeItem(`debrief-永:${gameKey}:premium`);
      } catch {}
      // 4) IndexedDB 영구 저장도 모두 삭제
      try { await deleteGameEternalDebriefs(gameKey); } catch {}
      setGames(prev => prev.filter(g => g.key !== gameKey));
    } catch (e) {
      alert("삭제 실패: " + (e.message || ""));
    }
  };

  // 티어 정의 (유료/무료 피드백)
  const TIER_META = [
    { key: "free", icon: "💬", label: "요약", price: "무료", color: "#22c55e" },
    { key: "detail", icon: "📝", label: "상세", price: "$9", color: "#3b82f6" },
    { key: "premium", icon: "💎", label: "프리미엄", price: "$20", color: "#f59e0b" },
  ];

  return (
    <div style={embedded
      ? { width: "100%" }
      : { maxWidth: 560, margin: "0 auto", padding: "20px 16px" }
    }>
      {!embedded && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#fafafa", margin: "0 0 4px 0" }}>
            📊 내 이력
          </h2>
          <p style={{ fontSize: 12, color: "#71717a", margin: 0 }}>
            저장한 게임과 디브리핑 기록입니다
          </p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#71717a", fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>⏳ 불러오는 중...</div>
          <div style={{ fontSize: 10, color: "#52525b" }}>
            5초 이상 걸리면 자동으로 중단됩니다
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: 14, borderRadius: 10, background: "#7f1d1d30",
          border: "1px solid #dc262650", color: "#fca5a5", fontSize: 12,
        }}>
          <div style={{ marginBottom: 10 }}>❌ {error}</div>
          <button
            onClick={loadGames}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid #fca5a560",
              background: "#7f1d1d50", color: "#fca5a5",
              cursor: "pointer", fontSize: 11, fontWeight: 700,
            }}
          >🔄 다시 시도</button>
        </div>
      )}

      {!loading && !error && games.length === 0 && (
        <div style={{
          padding: 40, borderRadius: 12, background: "#111118",
          border: "1px solid #27272a", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a1a1aa", marginBottom: 6 }}>
            아직 저장된 게임이 없습니다
          </div>
          <div style={{ fontSize: 11, color: "#71717a" }}>
            플레이 모드에서 게임을 진행하고<br/>
            "💾 게임 저장" 버튼을 누르세요
          </div>
        </div>
      )}

      {!loading && !error && games.length > 0 && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {games.map((g) => {
            const debriefData = g.debriefData || { feedback: {} };
            const fb = debriefData.feedback || {};
            return (
              <div key={g.key} style={{
                padding: 14, borderRadius: 12, background: "#111118",
                border: "1px solid #27272a",
              }}>
                {/* 게임 메타 정보 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#71717a", marginBottom: 3 }}>
                      📅 {formatDate(g.dateTime || (g.ts ? new Date(g.ts).toISOString() : null))}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa", marginBottom: 3 }}>
                      <span style={{ color: "#93c5fd" }}>{g.version}</span>
                      {" · "}
                      {g.job || g.jobAtEscape || "직업 미지정"}
                      {" · "}
                      {g.turnCount}턴
                    </div>
                    <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                      {g.isContest && <span style={{ color: "#fca5a5", fontWeight: 700 }}>🏆 대회 </span>}
                      {g.escaped && (
                        <span style={{ color: "#86efac", fontWeight: 700 }}>
                          ✅ 탈출
                          {g.escapeTimeSec != null && ` (${Math.floor(g.escapeTimeSec / 60)}분 ${g.escapeTimeSec % 60}초)`}
                        </span>
                      )}
                      {!g.escaped && <span style={{ color: "#71717a" }}>진행 중 저장</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteGame(g.key)}
                    title="삭제"
                    style={{
                      padding: "4px 8px", borderRadius: 6, border: "none",
                      background: "#7f1d1d30", color: "#fca5a5",
                      cursor: "pointer", fontSize: 10, fontWeight: 700,
                    }}
                  >🗑️</button>
                </div>

                {/* 게임 기록 보기 버튼 */}
                <div style={{ paddingTop: 10, borderTop: "1px solid #27272a", marginBottom: 8 }}>
                  <button
                    onClick={() => setRecordModal(g)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8,
                      border: "1px solid #a855f740",
                      background: "#a855f710", color: "#c4b5fd",
                      cursor: "pointer", fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    📋 게임 기록 보기 ({(g.turnLog || []).length}턴 + 자산/자금)
                  </button>
                </div>

                {/* AI 피드백 3종 */}
                <div style={{ display: "flex", gap: 6 }}>
                  {TIER_META.map(({ key, icon, label, price, color }) => {
                    const done = !!fb[key]?.text;
                    return (
                      <button
                        key={key}
                        onClick={() => handleDebrief(g, key)}
                        style={{
                          flex: 1, padding: "8px 4px", borderRadius: 8,
                          border: `1px solid ${done ? color + "60" : color + "30"}`,
                          background: done ? color + "20" : "transparent",
                          color: done ? color : "#a1a1aa",
                          cursor: "pointer",
                          fontSize: 10, fontWeight: 700,
                          display: "flex", flexDirection: "column", gap: 2, alignItems: "center",
                          transition: "all 0.2s",
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        <span>{label}</span>
                        <span style={{ fontSize: 9, color: done ? color : "#52525b", fontWeight: 600 }}>
                          {done ? "📄 다시 보기" : `▶ ${price}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {games.length >= 50 && (
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 10, color: "#52525b" }}>
          최근 50개만 표시됩니다
        </div>
      )}

      {/* ═══ 디브리핑 결과 모달 ═══ */}
      {debriefModal && (
        <DebriefResultModal
          modal={debriefModal}
          onClose={() => setDebriefModal(null)}
        />
      )}

      {/* ═══ 게임 기록 모달 ═══ */}
      {recordModal && (
        <GameRecordModal
          game={recordModal}
          onClose={() => setRecordModal(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   디브리핑 결과 표시 모달
═══════════════════════════════════════════════════ */
function DebriefResultModal({ modal, onClose }) {
  const { game, tier, text, generatedAt, loading, error, savedReplay } = modal;

  const TIER_LABEL = {
    free: { icon: "💬", name: "요약 피드백", color: "#22c55e" },
    detail: { icon: "📝", name: "상세 피드백 ($9)", color: "#3b82f6" },
    premium: { icon: "💎", name: "프리미엄 피드백 ($20)", color: "#f59e0b" },
  };
  const meta = TIER_LABEL[tier] || TIER_LABEL.free;

  // ── 다운로드 기능 ──
  const handleDownload = (format) => {
    if (!text) return;

    // 파일명 생성
    const gameInfo = [
      game.version || "캐쉬플로우",
      game.job || "개인플레이",
      `${game.turnCount || 0}턴`,
    ].join("_");
    const dateStr = game.date || new Date(game.dateTime || Date.now()).toLocaleDateString("ko-KR");
    const safeDate = dateStr.replace(/[\/.\s]/g, "-");
    const tierLabel = meta.name.replace(/\s*\(\$\d+\)/, "");
    const fileName = `디브리핑_${tierLabel}_${gameInfo}_${safeDate}`;

    let content, mimeType, ext;
    if (format === "txt") {
      // 텍스트 파일
      content = [
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `${meta.icon} ${meta.name}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `📅 게임일: ${dateStr}`,
        `🎮 ${game.version} · ${game.job} · ${game.turnCount}턴`,
        game.escaped ? `✅ 탈출 성공${game.escapeTimeSec ? ` (${Math.floor(game.escapeTimeSec/60)}분 ${game.escapeTimeSec%60}초)` : ""}` : `🏃 진행 중 저장`,
        generatedAt ? `📝 생성일: ${new Date(generatedAt).toLocaleString("ko-KR")}` : "",
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        text,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `국제캐쉬플로우강사협회 | 생성: Claude AI`,
      ].filter(Boolean).join("\n");
      mimeType = "text/plain;charset=utf-8";
      ext = "txt";
    } else {
      // Markdown 파일
      content = [
        `# ${meta.icon} ${meta.name}`,
        ``,
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 📅 게임일 | ${dateStr} |`,
        `| 🎮 버전 | ${game.version} |`,
        `| 👤 직업 | ${game.job} |`,
        `| 🎯 턴 수 | ${game.turnCount}턴 |`,
        game.escaped ? `| ✅ 결과 | 탈출 성공${game.escapeTimeSec ? ` (${Math.floor(game.escapeTimeSec/60)}분 ${game.escapeTimeSec%60}초)` : ""} |` : `| 🏃 결과 | 진행 중 저장 |`,
        generatedAt ? `| 📝 생성일 | ${new Date(generatedAt).toLocaleString("ko-KR")} |` : "",
        ``,
        `---`,
        ``,
        text,
        ``,
        `---`,
        `*국제캐쉬플로우강사협회 | 생성: Claude AI*`,
      ].filter(Boolean).join("\n");
      mimeType = "text/markdown;charset=utf-8";
      ext = "md";
    }

    // 다운로드 트리거
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 클립보드 복사
  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("✅ 클립보드에 복사되었습니다.");
    } catch {
      // 폴백: 오래된 브라우저
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("✅ 클립보드에 복사되었습니다.");
    }
  };

  // 카카오톡 공유 (본인에게 보내기: 공유창에서 "나와의 채팅" 선택 가능)
  const handleKakaoShare = () => {
    if (!text) return;
    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!kakaoKey) {
      alert("⚠️ 카카오톡 공유 기능이 아직 설정되지 않았습니다.\n\n관리자에게 문의해주세요.\n(환경 변수 NEXT_PUBLIC_KAKAO_JS_KEY 설정 필요)");
      return;
    }
    if (typeof window === "undefined") return;

    // Kakao SDK 동적 로드 (1회만)
    const loadKakao = () => new Promise((resolve, reject) => {
      if (window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized()) {
        resolve(window.Kakao);
        return;
      }
      // 이미 스크립트는 있는데 init 안 된 경우
      if (window.Kakao) {
        try {
          window.Kakao.init(kakaoKey);
          resolve(window.Kakao);
          return;
        } catch (e) {
          reject(e);
          return;
        }
      }
      // 스크립트 신규 로드
      const script = document.createElement("script");
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
      script.integrity = "sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4";
      script.crossOrigin = "anonymous";
      script.onload = () => {
        try {
          window.Kakao.init(kakaoKey);
          resolve(window.Kakao);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = () => reject(new Error("Kakao SDK 로드 실패"));
      document.head.appendChild(script);
    });

    (async () => {
      try {
        const Kakao = await loadKakao();

        const dateStr = game.date || new Date(game.dateTime || Date.now()).toLocaleDateString("ko-KR");
        const tierLabel = meta.name.replace(/\s*\(\$\d+\)/, "");

        // 카카오톡 메시지는 템플릿에 긴 본문을 직접 넣기 어려움 (1000자 제한)
        // → 요약 텍스트 + "웹에서 전체 보기" 링크 방식이 표준
        // 하지만 링크용 페이지가 없으니 → 텍스트 설명에 본문 발췌만 포함
        const snippet = text.length > 200 ? text.substring(0, 200) + "..." : text;
        const currentUrl = typeof window !== "undefined" ? window.location.href : "";

        Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `${meta.icon} ${tierLabel} - ${game.job || "캐쉬플로우"}`,
            description: `📅 ${dateStr} · ${game.version} · ${game.turnCount}턴${game.escaped ? " · ✅ 탈출" : ""}\n\n${snippet}`,
            imageUrl: "https://cashflow-coach.vercel.app/og-image.png",  // 선택: OG 이미지 (없어도 됨)
            link: {
              mobileWebUrl: currentUrl,
              webUrl: currentUrl,
            },
          },
          buttons: [
            {
              title: "웹에서 전체 보기",
              link: {
                mobileWebUrl: currentUrl,
                webUrl: currentUrl,
              },
            },
          ],
          // installTalk: true, // 카톡 앱 없을 때 설치 유도 (선택)
        });
      } catch (e) {
        console.error("카카오 공유 실패:", e);
        alert("❌ 카카오톡 공유에 실패했습니다.\n\n" + (e.message || "알 수 없는 오류") + "\n\n팝업 차단 또는 도메인 등록을 확인해주세요.");
      }
    })();
  };

  // PDF 다운로드 (브라우저 인쇄 다이얼로그 활용 - 한글 폰트 완벽 지원)
  const handlePrintPDF = () => {
    if (!text) return;

    const dateStr = game.date || new Date(game.dateTime || Date.now()).toLocaleDateString("ko-KR");
    const tierLabel = meta.name.replace(/\s*\(\$\d+\)/, "");

    // 새 창 열어서 인쇄용 HTML 생성
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      alert("❌ 팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.");
      return;
    }

    // HTML 문자열 구성
    const escapeHtml = (s) => String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(tierLabel)} - ${escapeHtml(game.job || "")} ${escapeHtml(game.turnCount || 0)}턴</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 18mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", -apple-system, sans-serif;
      color: #1a1a1a;
      line-height: 1.7;
      margin: 0;
      padding: 0;
      background: white;
    }
    .header {
      border-bottom: 3px solid ${meta.color};
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 24px;
      font-weight: 900;
      color: ${meta.color};
      margin: 0 0 8px 0;
    }
    .subtitle {
      font-size: 12px;
      color: #666;
      margin: 0;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 24px;
      font-size: 11px;
    }
    .meta-table td {
      padding: 6px 10px;
      border: 1px solid #ddd;
    }
    .meta-table td.label {
      background: #f5f5f5;
      font-weight: 700;
      width: 30%;
      color: #333;
    }
    .content {
      font-size: 13px;
      line-height: 1.85;
      white-space: pre-wrap;
      word-break: break-word;
      color: #222;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
      font-size: 10px;
      color: #888;
      text-align: center;
    }
    .print-btn {
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 10px 20px;
      background: ${meta.color};
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .guide {
      position: fixed;
      top: 60px;
      right: 16px;
      padding: 10px 14px;
      background: #fef3c7;
      border: 1px solid #fde68a;
      border-radius: 6px;
      font-size: 11px;
      color: #78350f;
      max-width: 260px;
    }
    @media print {
      .print-btn, .guide { display: none !important; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
  <div class="guide">
    💡 <strong>PDF 저장 방법:</strong><br>
    인쇄 창에서 "대상"을 <strong>"PDF로 저장"</strong>으로 선택하세요.
  </div>

  <div class="header">
    <h1 class="title">${escapeHtml(meta.icon)} ${escapeHtml(tierLabel)}</h1>
    <p class="subtitle">캐쉬플로우 보드게임 디브리핑</p>
  </div>

  <table class="meta-table">
    <tr>
      <td class="label">📅 게임 일시</td>
      <td>${escapeHtml(dateStr)}</td>
    </tr>
    <tr>
      <td class="label">🎮 버전</td>
      <td>${escapeHtml(game.version || "")}</td>
    </tr>
    <tr>
      <td class="label">👤 직업</td>
      <td>${escapeHtml(game.job || "")}</td>
    </tr>
    <tr>
      <td class="label">🎯 턴 수</td>
      <td>${escapeHtml(game.turnCount || 0)}턴</td>
    </tr>
    ${game.escaped ? `
    <tr>
      <td class="label">✅ 결과</td>
      <td>탈출 성공${game.escapeTimeSec ? ` (${Math.floor(game.escapeTimeSec/60)}분 ${game.escapeTimeSec%60}초)` : ""}</td>
    </tr>` : ""}
    ${generatedAt ? `
    <tr>
      <td class="label">📝 분석 생성일</td>
      <td>${escapeHtml(new Date(generatedAt).toLocaleString("ko-KR"))}</td>
    </tr>` : ""}
  </table>

  <div class="content">${escapeHtml(text)}</div>

  <div class="footer">
    국제캐쉬플로우강사협회 · 대표 정윤후 · 생성: Claude AI<br>
    Robert Kiyosaki Official Korea & Japan Partner
  </div>

  <script>
    // 페이지 로드 즉시 인쇄 다이얼로그 자동 표시 (선택사항)
    window.onload = () => {
      setTimeout(() => {
        // 자동 인쇄 다이얼로그는 주석 처리 - 사용자가 원할 때 버튼 클릭하도록
        // window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 540, background: "#111118",
          borderRadius: 16, border: `1px solid ${meta.color}40`,
          padding: 20, maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #27272a",
        }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: meta.color, margin: 0 }}>
              {meta.icon} {meta.name}
            </h3>
            <p style={{ fontSize: 11, color: "#71717a", margin: "4px 0 0" }}>
              {game.version} · {game.job} · {game.turnCount}턴
              {savedReplay && generatedAt && (
                <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 4, background: "#3b82f620", color: "#93c5fd", fontSize: 9, fontWeight: 700 }}>
                  저장본 · {new Date(generatedAt).toLocaleString("ko-KR")}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "4px 10px", borderRadius: 6, border: "1px solid #27272a",
              background: "transparent", color: "#a1a1aa", cursor: "pointer",
              fontSize: 11,
            }}
          >✕ 닫기</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 100 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "#a1a1aa" }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                {tier === "free" ? "요약 생성 중..." : "AI 분석 중..."}
              </div>
              <div style={{ fontSize: 10, color: "#71717a" }}>
                {tier !== "free" && "10~30초 정도 소요됩니다"}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: 14, borderRadius: 8, background: "#7f1d1d30",
              border: "1px solid #dc262650", color: "#fca5a5", fontSize: 12,
            }}>
              ❌ {error}
            </div>
          )}

          {!loading && !error && text && (
            <div style={{
              fontSize: 13, color: "#e4e4e7", lineHeight: 1.7,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {text}
            </div>
          )}
        </div>

        {/* 다운로드/복사 버튼 (결과 있을 때만) */}
        {!loading && !error && text && (
          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: "1px solid #27272a",
          }}>
            {/* 1줄: PDF (가장 추천) */}
            <button
              onClick={handlePrintPDF}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                border: `1px solid ${meta.color}`,
                background: `linear-gradient(135deg, ${meta.color}30, ${meta.color}20)`,
                color: meta.color,
                cursor: "pointer", fontSize: 13, fontWeight: 800,
                marginBottom: 6,
              }}
            >📑 PDF로 저장 (인쇄 → PDF)</button>

            {/* 2줄: 카카오톡 공유 */}
            <button
              onClick={handleKakaoShare}
              style={{
                width: "100%", padding: "9px 14px", borderRadius: 8,
                border: "1px solid #FEE500",
                background: "linear-gradient(135deg, #FEE500, #FAD84B)",
                color: "#3C1E1E",
                cursor: "pointer", fontSize: 12, fontWeight: 800,
                marginBottom: 6,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>💬</span>
              카카오톡으로 보내기 (본인/지인)
            </button>

            {/* 3줄: 보조 다운로드 */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => handleDownload("txt")}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8,
                  border: `1px solid ${meta.color}40`,
                  background: `${meta.color}10`, color: meta.color,
                  cursor: "pointer", fontSize: 10, fontWeight: 700,
                }}
              >📄 TXT</button>
              <button
                onClick={() => handleDownload("md")}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8,
                  border: `1px solid ${meta.color}40`,
                  background: `${meta.color}10`, color: meta.color,
                  cursor: "pointer", fontSize: 10, fontWeight: 700,
                }}
              >📝 MD</button>
              <button
                onClick={handleCopy}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8,
                  border: "1px solid #27272a",
                  background: "#18181b", color: "#a1a1aa",
                  cursor: "pointer", fontSize: 10, fontWeight: 700,
                }}
              >📋 복사</button>
            </div>
          </div>
        )}

        {/* 하단 안내 */}
        {!loading && !error && text && savedReplay && (
          <div style={{
            marginTop: 10, fontSize: 10, color: "#71717a", textAlign: "center",
          }}>
            ℹ️ 저장된 결과입니다. 언제든 다시 불러올 수 있습니다.
          </div>
        )}
        {!loading && !error && text && !savedReplay && (
          <div style={{
            marginTop: 10, fontSize: 10, color: "#86efac", textAlign: "center",
          }}>
            ✅ 디브리핑 결과가 저장되었습니다. 이후에는 API 재호출 없이 즉시 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   🎮 게임 기록 모달 - 턴 로그 + 자산 + 자금 상세 표시
═══════════════════════════════════════════════════ */
function GameRecordModal({ game, onClose }) {
  const turnLog = game.turnLog || [];
  const assets = game.assets || [];
  const dateStr = game.date || new Date(game.dateTime || Date.now()).toLocaleDateString("ko-KR");

  // 자산 분류
  const realEstates = assets.filter(a => a.type === "부동산");
  const stocks = assets.filter(a => a.type === "주식");
  const businesses = assets.filter(a => a.type === "사업");

  // 자산 합계
  const totalPassiveIncome = assets
    .filter(a => a.type !== "주식")
    .reduce((sum, a) => sum + (a.cf || 0), 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 600, background: "#111118",
          borderRadius: 16, border: "1px solid #a855f740",
          padding: 20, maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #27272a",
        }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: "#c4b5fd", margin: 0 }}>
              📋 게임 기록 상세
            </h3>
            <p style={{ fontSize: 11, color: "#71717a", margin: "4px 0 0" }}>
              {dateStr} · {game.version} · {game.job} · {game.turnCount}턴
              {game.escaped && (
                <span style={{ marginLeft: 6, color: "#86efac", fontWeight: 700 }}>
                  ✅ 탈출{game.escapeTimeSec ? ` (${Math.floor(game.escapeTimeSec/60)}분 ${game.escapeTimeSec%60}초)` : ""}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "4px 10px", borderRadius: 6, border: "1px solid #27272a",
              background: "transparent", color: "#a1a1aa", cursor: "pointer",
              fontSize: 11,
            }}
          >✕ 닫기</button>
        </div>

        {/* 본문 (스크롤) */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 200 }}>
          {/* 요약 카드 */}
          <div style={{
            padding: 12, borderRadius: 10, background: "#18181b",
            border: "1px solid #27272a", marginBottom: 14,
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 10, color: "#71717a" }}>💰 보유 현금</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fafafa" }}>
                ${(game.cash ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#71717a" }}>📊 월 현금흐름</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: (game.totalCF || 0) >= 0 ? "#86efac" : "#fca5a5" }}>
                {(game.totalCF ?? 0) >= 0 ? "+" : ""}${(game.totalCF ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#71717a" }}>🏦 신용대출</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fca5a5" }}>
                ${(game.bankLoan ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#71717a" }}>💵 월 이자</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fde68a" }}>
                ${(game.loanInterest ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#71717a" }}>💎 수동소득</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#86efac" }}>
                ${totalPassiveIncome.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#71717a" }}>👶 아기</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fde68a" }}>
                {game.babies ?? 0}명
              </div>
            </div>
          </div>

          {/* 자산 목록 */}
          {assets.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 12, fontWeight: 800, color: "#fafafa", margin: "0 0 8px" }}>
                📦 보유 자산 ({assets.length}개)
              </h4>
              {realEstates.length > 0 && (
                <AssetSection title="🏠 부동산" items={realEstates} color="#86efac" />
              )}
              {businesses.length > 0 && (
                <AssetSection title="🏢 사업체" items={businesses} color="#c4b5fd" />
              )}
              {stocks.length > 0 && (
                <AssetSection title="📈 주식" items={stocks} color="#93c5fd" isStock />
              )}
            </div>
          )}

          {/* 턴 로그 */}
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 800, color: "#fafafa", margin: "0 0 8px" }}>
              🎲 턴별 기록 ({turnLog.length}턴)
            </h4>
            {turnLog.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "#71717a", fontSize: 11 }}>
                턴 기록이 없습니다
              </div>
            )}
            {turnLog.map((t, i) => (
              <TurnLogRow key={i} turn={t} />
            ))}
          </div>
        </div>

        {/* 하단 안내 */}
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid #27272a",
          fontSize: 10, color: "#71717a", textAlign: "center",
        }}>
          이 기록은 영구 보존되며 디브리핑에 사용되는 원본 데이터입니다.
        </div>
      </div>
    </div>
  );
}

// 자산 섹션 (부동산/사업/주식)
function AssetSection({ title, items, color, isStock = false }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 4 }}>
        {title} ({items.length}개)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((a, i) => (
          <div key={i} style={{
            padding: "6px 10px", borderRadius: 6,
            background: "#18181b", border: "1px solid #27272a",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 11,
          }}>
            <div style={{ color: "#e4e4e7", fontWeight: 600 }}>
              {a.name || "(미지정)"}
              {isStock && a.shares != null && (
                <span style={{ marginLeft: 6, fontSize: 10, color: "#93c5fd" }}>
                  {a.shares}주 @ ${a.price || 0}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!isStock && a.cf != null && (
                <span style={{ color: a.cf >= 0 ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
                  {a.cf >= 0 ? "+" : ""}${a.cf}
                </span>
              )}
              {a.downPay != null && (
                <span style={{ color: "#71717a", fontSize: 10 }}>
                  착수 ${(a.downPay || 0).toLocaleString()}
                </span>
              )}
              {a.loan > 0 && (
                <span style={{ color: "#fde68a", fontSize: 10 }}>
                  대출 ${(a.loan || 0).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 턴 로그 한 줄
function TurnLogRow({ turn }) {
  const cellEmoji = {
    "OPPORTUNITY": "💼",
    "PAYDAY": "💰",
    "MARKET": "📈",
    "DOODAD": "🛍️",
    "CHARITY": "🎁",
    "BABY": "👶",
    "DOWNSIZED": "⚠️",
    "EXTRA_BUY": "🤝",
    "EXTRA_LOAN": "🏦",
    "DEBT_REPAY": "💵",
  };
  const emoji = cellEmoji[turn.cellType] || "🎲";
  const cardDesc = turn.card?.desc || turn.card?.sub || "";
  const action = turn.action ? `[${turn.action}]` : "";

  return (
    <div style={{
      padding: "6px 10px", borderRadius: 6, marginBottom: 3,
      background: "#18181b", border: "1px solid #27272a",
      display: "flex", alignItems: "start", gap: 8,
      fontSize: 11, lineHeight: 1.5,
    }}>
      <span style={{ fontWeight: 700, color: "#71717a", minWidth: 30 }}>
        T{turn.turn}
      </span>
      <span style={{ fontSize: 13 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#e4e4e7", fontWeight: 600 }}>
          {turn.cellType || turn.dealType} {action}
        </div>
        {cardDesc && (
          <div style={{ color: "#a1a1aa", fontSize: 10, marginTop: 2 }}>
            {cardDesc.substring(0, 80)}{cardDesc.length > 80 ? "..." : ""}
          </div>
        )}
      </div>
      {turn.decisionSec != null && (
        <span style={{ color: "#52525b", fontSize: 9 }}>
          ⏱ {turn.decisionSec}s
        </span>
      )}
    </div>
  );
}
