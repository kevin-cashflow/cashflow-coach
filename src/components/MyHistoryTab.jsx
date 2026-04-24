"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateFreeFeedback, generatePaidFeedback, buildPromptText, computeBestWorstPaths, runFullAnalysis, AnalysisReport, diagnoseFinancialLevel } from "./CashflowCoachingSim";
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
  // 🆕 보안 필터 통계
  const [filteredOutCount, setFilteredOutCount] = useState(0);
  const [legacyAllowedCount, setLegacyAllowedCount] = useState(0);
  // 🆕 localStorage에만 있는 게임 (Supabase 동기화 필요)
  const [localOnlyGames, setLocalOnlyGames] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

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

    // 🛡️ 마스터 안전장치: 30초 후 무조건 setLoading(false)
    // 어떤 이유로든 loadGames가 hang하면 사용자가 영원히 로딩 화면 보지 않도록
    const masterTimeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        console.warn("[MyHistoryTab] ⏰ 마스터 타임아웃 (30초) — setLoading(false) 강제");
        setLoading(false);
        setError("로딩이 너무 오래 걸립니다. 새로고침 또는 재시도 버튼을 눌러주세요.");
      }
    }, 30000);

    // 각 storage 호출마다 새로운 타임아웃 Promise 생성 (15초)
    const makeTimeout = () => new Promise((_, reject) =>
      setTimeout(() => reject(new Error("storage 응답 시간 초과 (15초)")), 15000)
    );

    try {
      if (!window.storage) {
        throw new Error("storage가 준비되지 않았습니다.");
      }

      // 🆕 Supabase 세션 refresh 시도 (Auth session missing 대응)
      // 세션 만료 상태면 window.storage.list가 빈 결과 반환 → 세션 먼저 갱신
      try {
        const sb = (typeof window !== "undefined" && window.supabase) || null;
        if (sb && sb.auth?.refreshSession) {
          console.log("[MyHistoryTab] 🔄 Supabase 세션 refresh 시도...");
          await Promise.race([
            sb.auth.refreshSession(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("refresh timeout")), 3000)),
          ]).then(
            () => console.log("[MyHistoryTab] ✅ 세션 refresh 완료"),
            (e) => console.warn("[MyHistoryTab] 세션 refresh 실패 (무시):", e.message)
          );
        }
      } catch (e) {
        console.warn("[MyHistoryTab] 세션 refresh 시도 중 예외 (무시):", e.message);
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
          if (game) {
            gameMap.set(game.key, game);
            // 🔍 디버그: game:* 로드 시 turnLog 상태
            const tl = Array.isArray(game.turnLog) ? game.turnLog.length : -1;
            const tc = game.turnCount || 0;
            if (tc > 0 && tl !== tc) {
              console.warn(`[MyHistoryTab] ⚠️ ${game.key} turnCount=${tc}인데 turnLog=${tl} (불일치!)`);
            } else if (tc > 0) {
              console.log(`[MyHistoryTab] ✅ ${game.key} turnLog ${tl}개 / turnCount=${tc}`);
            }
          }
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
            const turnLogArr = Array.isArray(d.turnLog) ? d.turnLog : [];
            console.log(`[MyHistoryTab] 📂 debrief 로드: ${k} → 턴 ${turnLogArr.length}개 (turns 필드: ${d.turns || 0})`);
            return {
              key: k,
              source: "legacy-debrief",
              ts,
              dateTime: d.dateTime,
              date: d.date,
              time: d.time,
              version: d.version || "캐쉬플로우",
              job: d.job || "(이전 디브리핑)",
              turnCount: d.turnCount || d.turns || turnLogArr.length,
              simText: d.simText || "",
              isLegacyDebrief: true,
              _legacyRaw: d,
              // 🆕 턴 로그 및 최종 스냅샷 복원 (새 디브리핑 저장본에서 사용)
              turnLog: turnLogArr,
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

      // 🆕 🔒 보안 필터: 본인의 데이터만 허용
      // 3단계 검증 (storage layer나 RLS에서 누수가 있어도 클라이언트에서 한 번 더 필터):
      //   1순위: g.user_id === authUser.id (payload에 명시적 심어진 보안 필드)
      //   2순위: g.saveLog.savedByUserId === authUser.id (저장 로그 기반)
      //   3순위: g.playerId === authUser.id (플레이어 ID 기반, 과거 저장 형식)
      //   4순위: 위 필드가 하나도 없는 완전 레거시 데이터는 허용 (기존 데이터 보호)
      //   그 외(다른 사람이 저장한 게 명확한 것)는 제외
      const myUserId = authUser?.id ? String(authUser.id) : null;
      const beforeFilter = preserved.length;
      let filteredOut = 0;
      let legacyAllowed = 0;
      const filtered = myUserId
        ? preserved.filter(g => {
            // 1순위: 최상위 user_id (새로 저장되는 데이터)
            const directUid = g.user_id ? String(g.user_id) : null;
            if (directUid) {
              const match = directUid === myUserId;
              if (!match) filteredOut++;
              return match;
            }
            // 2순위: saveLog
            const savedByUid = g.saveLog?.savedByUserId ? String(g.saveLog.savedByUserId) : null;
            if (savedByUid) {
              const match = savedByUid === myUserId;
              if (!match) filteredOut++;
              return match;
            }
            // 3순위: playerId (과거 방식, solo/user id 로 저장되었을 수 있음)
            const playerUid = g.playerId && g.playerId !== "solo" ? String(g.playerId) : null;
            if (playerUid) {
              const match = playerUid === myUserId;
              if (!match) filteredOut++;
              return match;
            }
            // 4순위: 완전 레거시 (어떤 식별자도 없음) → 일단 허용 + 로그
            legacyAllowed++;
            console.warn(`[MyHistoryTab] ⚠️ 식별자 없는 레거시 게임 허용: ${g.key} (playerId=${g.playerId})`);
            return true;
          })
        : preserved;
      if (filteredOut > 0) {
        console.warn(`[MyHistoryTab] 🔒 보안 필터: 다른 사용자 게임 ${filteredOut}건 제외 (${beforeFilter} → ${filtered.length})`);
      }
      if (legacyAllowed > 0) {
        console.warn(`[MyHistoryTab] ℹ️ 식별자 없는 레거시 게임 ${legacyAllowed}건 허용됨 (본인 것인지 확인 필요)`);
      }
      setFilteredOutCount(filteredOut);
      setLegacyAllowedCount(legacyAllowed);

      safeSetGames(filtered);

      // 🆕 localStorage에만 저장되고 Supabase에 없는 게임 감지
      // 현재 로드된 filtered에 있는 키들을 제외하고, localStorage에만 있는 본인 게임 찾기
      try {
        if (typeof localStorage !== "undefined" && myUserId) {
          const loadedKeys = new Set(filtered.map(g => g.key));
          const localOnly = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith("game:")) continue;
            if (loadedKeys.has(k)) continue;  // 이미 Supabase에 있음
            try {
              const v = localStorage.getItem(k);
              if (!v) continue;
              const d = JSON.parse(v);
              // 본인 것인지 확인 (user_id 또는 saveLog)
              const uid = d.user_id || d.saveLog?.savedByUserId || null;
              if (uid && String(uid) === myUserId) {
                localOnly.push({ key: k, payload: v, data: d });
              }
            } catch {}
          }
          if (localOnly.length > 0) {
            console.warn(`[MyHistoryTab] 🔄 localStorage에만 저장된 본인 게임 ${localOnly.length}건 감지 (Supabase 동기화 필요)`);
          }
          setLocalOnlyGames(localOnly);
        }
      } catch (e) {
        console.warn("[MyHistoryTab] localOnly 감지 실패:", e);
      }
    } catch (e) {
      console.error("[MyHistoryTab] 게임 이력 조회 실패:", e);
      setError(e.message || "게임 이력을 불러올 수 없습니다.");
    } finally {
      clearTimeout(masterTimeoutId);  // 🛡️ 마스터 타임아웃 해제
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

  // ── 브라우저 탭 복귀 시 자동 복구 (보수적: 정말 필요할 때만) ──
  // 사용자가 다른 브라우저 갔다 와도 화면이 그대로 유지되어야 함
  // 자동 재로드는 사용자 경험을 해침 → 다음 두 경우에만 동작:
  //   1. 디브리핑 진행 중이었으면 백그라운드 결과 확인 (이건 필요)
  //   2. 그 외에는 화면 그대로 유지 (loadGames 자동 재호출 X)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // 탭이 다시 활성화되었을 때
      if (document.visibilityState === "visible") {
        console.log("[MyHistoryTab] 탭 복귀 감지 (자동 재로드 안 함)");

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

    // 🚫 focus 핸들러 제거 (자동 재로드 방지)
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [debriefModal, safeSetDebriefModal, safeSetGames]);

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // ── 게임 데이터 업데이트 (디브리핑 결과 저장) ──
  // ⚠️ 이 함수의 목적: 한 번 저장된 디브리핑은 절대로 유실되지 않도록 보장
  // 전략: 3중 저장 (메모리 + localStorage + window.storage) + 검증
  const updateGameDebrief = async (gameKey, tier, feedbackText, fullAnalysis = null) => {
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

      // 🆕 디브리핑 저장자 로그
      const debriefSaveLog = {
        savedByUserId: authUser?.id || null,
        savedByEmail: authUser?.email || null,
        savedByNickname: authUser?.user_metadata?.nickname || null,
        savedAt: new Date().toISOString(),
        tier,
        isAdmin: false,  // MyHistoryTab은 본인 수행
      };
      console.log("[updateGameDebrief] 📝 저장자 로그:", debriefSaveLog);

      const updatedFeedback = { ...debriefData.feedback };
      updatedFeedback[tier] = {
        text: feedbackText,
        generatedAt: new Date().toISOString(),
        saveLog: debriefSaveLog,  // 🆕 디브리핑 별 저장 로그
      };
      // 🆕 풀 analysis가 새로 생성됐으면 업데이트, 아니면 기존 값 유지
      const analysisToSave = fullAnalysis || debriefData.analysis;
      const updatedGame = {
        ...game,
        debriefData: {
          ...debriefData,
          analysis: analysisToSave,
          analysisAt: fullAnalysis ? new Date().toISOString() : debriefData.analysisAt,
          feedback: updatedFeedback,
          // 🆕 디브리핑 수정 이력 누적
          editHistory: [
            ...(debriefData.editHistory || []),
            { ...debriefSaveLog, action: `debrief_${tier}` },
          ].slice(-50),  // 최근 50개만 유지
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
          // 🆕 풀 analysis도 레거시에 저장
          ...(analysisToSave && { analysis: analysisToSave }),
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

    // 🆕 "analysis" 티어 전용 처리 (총평 = 전 생애 자산 흐름 + 그래프 + 5가지 교훈)
    if (tier === "analysis") {
      const cachedAnalysis = currentGame.debriefData?.analysis;
      // 저장된 analysis가 있고 phases도 있으면 즉시 표시
      if (cachedAnalysis && cachedAnalysis.phases && cachedAnalysis.lessons) {
        console.log("[handleDebrief] 📋 총평 캐시된 analysis 재사용");
        safeSetDebriefModal({
          game: currentGame,
          tier: "analysis",
          text: "",  // 총평은 텍스트 없고 그래프/phases만
          analysis: cachedAnalysis,
          generatedAt: currentGame.debriefData?.feedback?.analysis?.generatedAt || null,
          loading: false,
          error: null,
          savedReplay: true,
        });
        return;
      }

      // 새로 생성 - 확인 팝업
      const confirmed = window.confirm(
        `📋 총평 분석 (무료)\n\n` +
        `AI가 당신의 플레이를 4단계(사회 초년생 → 자산 형성기 → 성장과 전환 → 수확과 정리)로 나누어 분석합니다.\n` +
        `최상의 선택 vs 최악의 선택 비교 그래프와 5가지 교훈이 포함됩니다.\n\n` +
        `⏱️ 생성 시간: 약 1~2분\n` +
        `⚠️ 생성 중 화면을 닫지 마세요.\n\n` +
        `진행하시겠습니까?`
      );
      if (!confirmed) {
        console.log("[MyHistoryTab] analysis 사용자 취소");
        return;
      }

      console.log("[MyHistoryTab] 📋 총평 신규 진행 시작");
      safeSetDebriefModal({
        game: currentGame,
        tier: "analysis",
        text: "",
        loading: true,
        error: null,
        savedReplay: false,
      });

      try {
        const results = currentGame.gameResults || (currentGame.turnLog || []).map(t => ({
          turn: t.turn,
          cell: { type: t.cellType, label: t.cellType },
          dealType: t.dealType,
          card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
          decisionSec: t.decisionSec,
          splitApplied: t.splitApplied,
          dice: [0], total: 0, pos: 0,
        }));

        if (results.length === 0) {
          throw new Error("턴 기록이 없어 총평을 생성할 수 없습니다.");
        }

        const simText = currentGame.simText || buildPromptText(results, currentGame.version, currentGame.turnCount || 0);
        console.log("[handleDebrief] 📋 총평 runFullAnalysis 호출 시작");
        const fullAnalysis = await runFullAnalysis({
          simText,
          version: currentGame.version,
          turns: currentGame.turnCount || 0,
          results,
        });
        console.log("[handleDebrief] ✅ 총평 생성 성공 - phases:", fullAnalysis?.phases?.length, "lessons:", fullAnalysis?.lessons?.length);

        // 모달 즉시 업데이트
        safeSetDebriefModal({
          game: currentGame,
          tier: "analysis",
          text: "",
          analysis: fullAnalysis,
          generatedAt: new Date().toISOString(),
          loading: false,
          error: null,
          savedReplay: false,
        });

        // Supabase에 저장 (재호출 방지)
        try {
          await updateGameDebrief(currentGame.key, "analysis", "", fullAnalysis);
          console.log("[handleDebrief] ✅ 총평 저장 완료");
          // games state에도 analysis 반영
          safeSetGames(prev => prev.map(g => g.key === currentGame.key ? {
            ...g,
            debriefData: {
              ...(g.debriefData || {}),
              analysis: fullAnalysis,
              feedback: {
                ...(g.debriefData?.feedback || {}),
                analysis: { text: "", generatedAt: new Date().toISOString() }
              }
            }
          } : g));
        } catch (saveErr) {
          console.warn("[handleDebrief] 총평 저장 실패 (화면 표시는 계속):", saveErr.message);
        }
      } catch (err) {
        console.error("[handleDebrief] 총평 실패:", err);
        safeSetDebriefModal({
          game: currentGame,
          tier: "analysis",
          text: "",
          loading: false,
          error: err.message || "총평 생성 중 오류가 발생했습니다.",
          savedReplay: false,
        });
      }
      return;
    }

    // ─── 이미 저장된 피드백은 즉시 표시 (API 호출 없음) ───
    const existing = currentGame.debriefData?.feedback?.[tier];
    if (existing?.text) {
      console.log(`[MyHistoryTab] ${tier} 저장본 표시 (재호출 방지)`);
      safeSetDebriefModal({
        game: currentGame,
        tier,
        text: existing.text,
        analysis: currentGame.debriefData?.analysis || null, // 🆕 풀 분석도 같이
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
        ? { name: "상세 피드백", price: "$9", desc: "AI가 당신의 플레이를 상세히 분석하여\n구조적인 피드백과 개선 방향을 제시합니다.", timeNote: "⏱️ 생성 시간: 약 30초~1분" }
        : { name: "프리미엄 피드백", price: "$20", desc: "최고 수준의 AI 분석으로\n기요사키 철학 기반의 심층 조언을 받을 수 있습니다.\n\n가장 깊이 있는 통찰을 제공합니다.", timeNote: "⏱️ 생성 시간: 약 1~2분 (최고 모델 사용)" };

      const confirmed = window.confirm(
        `📝 ${tierInfo.name} (${tierInfo.price})\n\n${tierInfo.desc}\n\n` +
        `${tierInfo.timeNote}\n` +
        `⚠️ 생성 중 화면을 닫지 마세요.\n\n` +
        `한 번 생성되면 영구 저장되어 이후 재호출 없이 언제든 다시 보실 수 있습니다.\n\n` +
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
      let fullAnalysis = null; // 🆕 풀 분석 결과 (phases, lessons, bestPath, worstPath, finalQuestion 등)

      if (tier === "free") {
        // 무료: 동기 텍스트 + 풀 분석 (API 호출 1회)
        const results = currentGame.gameResults || (currentGame.turnLog || []).map(t => ({
          turn: t.turn,
          cell: { type: t.cellType, label: t.cellType },
          dealType: t.dealType,
          card: t.card ? { ...t.card, _action: t.action, _shares: t.shares } : null,
          decisionSec: t.decisionSec,
          splitApplied: t.splitApplied,
          dice: [0], total: 0, pos: 0,
        }));
        // 1) 텍스트 한 단락 (즉시, 무료)
        result = generateFreeFeedback(results, currentGame.turnCount || 0);

        // 2) 🆕 풀 분석도 같이 진행 (그래프 + 5단계 + 5가지 교훈)
        // 이미 저장된 analysis가 있으면 재호출하지 않음 (재호출 비용 방지)
        const cachedAnalysis = currentGame.debriefData?.analysis;
        if (cachedAnalysis && cachedAnalysis.phases && cachedAnalysis.lessons) {
          console.log("[handleDebrief] 캐시된 analysis 재사용 (재호출 없음)");
          fullAnalysis = cachedAnalysis;
        } else if (results.length > 0) {
          try {
            const simText = currentGame.simText || buildPromptText(results, currentGame.version, currentGame.turnCount || 0);
            console.log("[handleDebrief] 무료 디브리핑 - runFullAnalysis 호출 시작");
            fullAnalysis = await runFullAnalysis({
              simText,
              version: currentGame.version,
              turns: currentGame.turnCount || 0,
              results,
            });
            console.log("[handleDebrief] runFullAnalysis 성공 - phases:", fullAnalysis?.phases?.length, "lessons:", fullAnalysis?.lessons?.length);
            // 무료 분기에서는 6단계 진단을 하지 않음 (유료 차별화)
          } catch (analysisErr) {
            // 풀 분석 실패해도 무료 텍스트는 표시 (graceful degradation)
            console.warn("[handleDebrief] 풀 분석 실패 (텍스트만 사용):", analysisErr.message);
          }
        }
      } else {
        // 상세/프리미엄: API 호출 + 6단계 진단
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

        // 🆕 유료 전용: 6 Levels of Wealth 자동 진단 추가
        try {
          const passiveIncome = (currentGame.assets || [])
            .filter(a => a.type !== "주식")
            .reduce((sum, a) => sum + (a.cf || 0), 0);
          const totalExpense = currentGame.totalCF !== undefined && currentGame.totalCF < 0
            ? Math.abs(currentGame.totalCF) + passiveIncome
            : 1000;
          const financialLevel = diagnoseFinancialLevel({
            passiveIncome,
            totalExpense,
            cash: currentGame.cash || 0,
            assets: currentGame.assets || [],
            bankLoan: currentGame.bankLoan || 0,
            jobName: currentGame.job || "",
          });
          // 기존 analysis가 있으면 financialLevel만 추가, 없으면 새로 생성
          fullAnalysis = currentGame.debriefData?.analysis
            ? { ...currentGame.debriefData.analysis, financialLevel }
            : { financialLevel };
          console.log(`[handleDebrief] 💰 유료(${tier}) 6단계 진단:`, financialLevel.level, financialLevel.levelName);
        } catch (levelErr) {
          console.warn("[handleDebrief] 6단계 진단 실패:", levelErr.message);
        }

        // 🆕 유료 전용: phases/lessons 없으면 runFullAnalysis도 시도 (전 생애 흐름 + 5가지 교훈)
        // graceful: 실패해도 텍스트 + 6단계 진단은 보이도록
        if (!fullAnalysis?.phases || !fullAnalysis?.lessons) {
          try {
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
              console.log(`[handleDebrief] 유료(${tier}) runFullAnalysis 추가 호출 시작`);
              const analysisResult = await runFullAnalysis({
                simText,
                version: currentGame.version,
                turns: currentGame.turnCount || 0,
                results,
              });
              console.log(`[handleDebrief] ✅ 유료(${tier}) 풀 분석 성공 - phases:`, analysisResult?.phases?.length, "lessons:", analysisResult?.lessons?.length);
              // 기존 fullAnalysis (financialLevel 포함) + 풀 분석 병합
              fullAnalysis = { ...(fullAnalysis || {}), ...analysisResult, financialLevel: fullAnalysis?.financialLevel };
            }
          } catch (analysisErr) {
            // 풀 분석 실패해도 유료 텍스트 + 6단계 진단은 표시 (graceful degradation)
            console.warn(`[handleDebrief] 유료(${tier}) 풀 분석 실패 (텍스트/6단계만 유지):`, analysisErr.message);
          }
        }
      }

      // 저장 (1회만) — storage 저장은 언마운트돼도 실행됨
      await updateGameDebrief(currentGame.key, tier, result, fullAnalysis);
      safeSetDebriefModal(prev => prev ? {
        ...prev,
        text: result,
        analysis: fullAnalysis, // 🆕 풀 분석을 모달에 전달 (Step C에서 렌더링)
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
    { key: "analysis", icon: "📋", label: "총평", price: "무료", color: "#a855f7" },
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

      {/* 🆕 (games가 0이어도) localStorage-only 게임 동기화 배너 */}
      {!loading && !error && localOnlyGames.length > 0 && games.length === 0 && (
        <div style={{
          padding: "14px 16px", borderRadius: 8, marginBottom: 12,
          background: "#ef444415", border: "1px solid #ef444440",
          fontSize: 11, color: "#fca5a5",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            ⚠️ 서버 저장 실패한 게임 <strong>{localOnlyGames.length}건</strong> 감지
          </div>
          <div style={{ marginBottom: 8, color: "#fde68a", lineHeight: 1.5 }}>
            브라우저에는 저장되었으나 Supabase 서버 업로드에 실패했습니다.<br/>
            아래 버튼으로 재시도하세요.
          </div>
          <div style={{ fontSize: 10, color: "#71717a", marginBottom: 10, paddingLeft: 8, borderLeft: "2px solid #ef444430" }}>
            {localOnlyGames.slice(0, 5).map((g, i) => (
              <div key={i}>
                · {g.data.version || "캐쉬플로우"} · {g.data.job || "-"} · {(g.data.turnLog || []).length}턴
                {g.data.dateTime ? ` · ${new Date(g.data.dateTime).toLocaleString("ko-KR")}` : ""}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                if (!window.confirm(`${localOnlyGames.length}건의 게임을 Supabase 서버에 업로드합니다.\n건당 최대 30초 소요될 수 있습니다. 진행하시겠습니까?`)) return;
                setSyncing(true);
                setSyncResult(null);
                const result = { success: 0, failed: 0, errors: [] };
                try {
                  const sb = (typeof window !== "undefined" && window.supabase) || null;
                    if (sb && sb.auth?.refreshSession) {
                    await Promise.race([
                      sb.auth.refreshSession(),
                      new Promise((_, rej) => setTimeout(() => rej(new Error("refresh timeout")), 5000)),
                    ]).catch(() => {});
                  }
                } catch {}
                for (const g of localOnlyGames) {
                  try {
                    if (!window.storage || typeof window.storage.set !== "function") {
                      result.failed++;
                      result.errors.push({ key: g.key, error: "window.storage 사용 불가" });
                      continue;
                    }
                    const timeoutPromise = new Promise((_, rej) =>
                      setTimeout(() => rej(new Error("타임아웃 (30초)")), 30000)
                    );
                    const res = await Promise.race([
                      window.storage.set(g.key, g.payload),
                      timeoutPromise,
                    ]);
                    if (res) { result.success++; }
                    else { result.failed++; result.errors.push({ key: g.key, error: "저장 응답 없음" }); }
                  } catch (e) {
                    result.failed++;
                    result.errors.push({ key: g.key, error: e.message });
                  }
                }
                setSyncResult(result);
                setSyncing(false);
                if (result.success > 0) setTimeout(() => loadGames?.(), 1500);
              }}
              disabled={syncing}
              style={{
                padding: "10px 16px", borderRadius: 6, border: "none",
                background: syncing ? "#3f3f46" : "#ef4444",
                color: syncing ? "#71717a" : "#fff",
                fontSize: 12, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer",
              }}
            >{syncing ? "🔄 동기화 중..." : "🔄 서버에 동기화 (재시도)"}</button>
            <button
              onClick={() => {
                if (!window.confirm(`⚠️ Supabase 서버 저장에 실패한 로컬 게임 ${localOnlyGames.length}건을 브라우저에서 삭제합니다.\n\n삭제 후 복구 불가. 정말 삭제하시겠습니까?`)) return;
                if (!window.confirm(`한 번 더 확인: 영구 삭제됩니다.`)) return;
                let removed = 0;
                for (const g of localOnlyGames) {
                  try { localStorage.removeItem(g.key); removed++; } catch {}
                }
                alert(`${removed}건이 로컬에서 삭제되었습니다.`);
                setLocalOnlyGames([]);
              }}
              disabled={syncing}
              style={{
                padding: "10px 16px", borderRadius: 6, border: "1px solid #3f3f46",
                background: "transparent", color: "#71717a",
                fontSize: 12, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer",
              }}
            >🗑️ 로컬에서만 삭제</button>
          </div>
          {syncResult && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "#0a0a0f", fontSize: 11 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {syncResult.success > 0 && <span style={{ color: "#86efac" }}>✅ 성공 {syncResult.success}건</span>}
                {syncResult.success > 0 && syncResult.failed > 0 && <span style={{ color: "#71717a" }}> · </span>}
                {syncResult.failed > 0 && <span style={{ color: "#fca5a5" }}>❌ 실패 {syncResult.failed}건</span>}
              </div>
              {syncResult.failed > 0 && syncResult.errors.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: "#71717a", paddingLeft: 8 }}>
                    {syncResult.errors.slice(0, 3).map((e, i) => (
                      <div key={i}>· {e.error}</div>
                    ))}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: "#fbbf24", lineHeight: 1.5 }}>
                    💡 실패가 계속되면: <br/>
                    1. 브라우저 DevTools (F12) → Application → Storage → <strong>Clear site data</strong><br/>
                    2. 모든 탭 닫고 재접속 → 재로그인<br/>
                    3. 다시 동기화 시도
                  </div>
                </>
              )}
            </div>
          )}
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
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 16 }}>
            플레이 모드에서 게임을 진행하고<br/>
            "💾 게임 저장" 버튼을 누르세요
          </div>
          {/* 🆕 수동 새로고침 버튼 (세션 만료 등으로 목록이 0개로 뜬 경우 대응) */}
          <button
            onClick={() => loadGames?.()}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid #3f3f46",
              background: "#18181b", color: "#93c5fd",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >🔄 목록 새로고침</button>
          <div style={{ fontSize: 9, color: "#52525b", marginTop: 8 }}>
            방금 저장한 게임이 안 보이면 새로고침을 눌러주세요
          </div>
        </div>
      )}

      {!loading && !error && games.length > 0 && (
        <div>
          {/* 🆕 상단 유틸리티 바: 새로고침 버튼 */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              onClick={() => loadGames?.()}
              title="목록을 Supabase에서 다시 불러옵니다"
              style={{
                padding: "4px 10px", borderRadius: 4, border: "1px solid #3f3f46",
                background: "#18181b", color: "#93c5fd",
                fontSize: 10, fontWeight: 600, cursor: "pointer",
              }}
            >🔄 새로고침</button>
          </div>

          {/* 🆕 localStorage에만 있는 게임 동기화 (Supabase 저장 실패한 게임) */}
          {localOnlyGames.length > 0 && (
            <div style={{
              padding: "12px 14px", borderRadius: 8, marginBottom: 12,
              background: "#ef444410", border: "1px solid #ef444440",
              fontSize: 10, color: "#fca5a5",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                ⚠️ 서버 저장 실패한 게임 <strong>{localOnlyGames.length}건</strong> 감지
              </div>
              <div style={{ marginBottom: 8, color: "#fde68a", lineHeight: 1.5 }}>
                이 게임들은 브라우저에는 저장되었지만 Supabase 서버에 업로드되지 않았습니다.
                <br/>
                서버 저장이 완료되어야 다른 기기에서도 볼 수 있습니다.
              </div>
              <div style={{ fontSize: 9, color: "#71717a", marginBottom: 8, paddingLeft: 8, borderLeft: "2px solid #ef444430" }}>
                {localOnlyGames.slice(0, 3).map((g, i) => (
                  <div key={i}>
                    · {g.data.version || "캐쉬플로우"} · {g.data.job || "-"} · {(g.data.turnLog || []).length}턴
                    {g.data.dateTime ? ` · ${new Date(g.data.dateTime).toLocaleString("ko-KR")}` : ""}
                  </div>
                ))}
                {localOnlyGames.length > 3 && <div>· ... 외 {localOnlyGames.length - 3}건</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={async () => {
                    if (!window.confirm(`${localOnlyGames.length}건의 게임을 Supabase 서버에 다시 업로드합니다.\n\n⚠️ 이 작업에는 시간이 걸릴 수 있습니다 (건당 최대 30초).\n진행하시겠습니까?`)) return;

                    setSyncing(true);
                    setSyncResult(null);
                    const result = { success: 0, failed: 0, errors: [] };

                    // Supabase 세션 재확인 (락 해제 시도)
                    try {
                      const sb = (typeof window !== "undefined" && window.supabase) || null;
                    if (sb && sb.auth?.refreshSession) {
                        console.log("[Sync] Supabase 세션 refresh 시도...");
                        await Promise.race([
                          sb.auth.refreshSession(),
                          new Promise((_, rej) => setTimeout(() => rej(new Error("refresh timeout")), 5000)),
                        ]).catch(e => console.warn("[Sync] refresh 실패 (무시):", e.message));
                      }
                    } catch {}

                    // 각 게임 순차 업로드
                    for (const g of localOnlyGames) {
                      try {
                        console.log(`[Sync] ${g.key} 업로드 시작...`);
                        if (!window.storage || typeof window.storage.set !== "function") {
                          result.failed++;
                          result.errors.push({ key: g.key, error: "window.storage 사용 불가" });
                          continue;
                        }
                        const timeoutPromise = new Promise((_, rej) =>
                          setTimeout(() => rej(new Error("타임아웃 (30초)")), 30000)
                        );
                        const res = await Promise.race([
                          window.storage.set(g.key, g.payload),
                          timeoutPromise,
                        ]);
                        if (res) {
                          result.success++;
                          console.log(`[Sync] ✅ ${g.key} 업로드 성공`);
                        } else {
                          result.failed++;
                          result.errors.push({ key: g.key, error: "저장 응답 없음" });
                        }
                      } catch (e) {
                        result.failed++;
                        result.errors.push({ key: g.key, error: e.message });
                        console.error(`[Sync] ❌ ${g.key} 업로드 실패:`, e.message);
                      }
                    }

                    setSyncResult(result);
                    setSyncing(false);

                    if (result.success > 0) {
                      // 성공한 게임이 있으면 목록 재로드
                      setTimeout(() => {
                        loadGames?.();
                      }, 1500);
                    }
                  }}
                  disabled={syncing}
                  style={{
                    padding: "8px 14px", borderRadius: 6, border: "none",
                    background: syncing ? "#3f3f46" : "#ef4444",
                    color: syncing ? "#71717a" : "#fff",
                    fontSize: 11, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer",
                  }}
                >{syncing ? "🔄 동기화 중..." : "🔄 서버에 동기화 (재시도)"}</button>
                <button
                  onClick={() => {
                    if (!window.confirm(`⚠️ 주의\n\nSupabase 서버 저장에 실패한 로컬 게임 ${localOnlyGames.length}건을 브라우저에서 삭제합니다.\n\n삭제 후에는 복구가 불가능합니다.\n정말 삭제하시겠습니까?`)) return;
                    if (!window.confirm(`정말로 확실합니까? 이 게임들은 영구 삭제됩니다.`)) return;
                    let removed = 0;
                    for (const g of localOnlyGames) {
                      try { localStorage.removeItem(g.key); removed++; } catch {}
                    }
                    alert(`${removed}건이 로컬에서 삭제되었습니다.`);
                    setLocalOnlyGames([]);
                  }}
                  disabled={syncing}
                  style={{
                    padding: "8px 14px", borderRadius: 6, border: "1px solid #3f3f46",
                    background: "transparent", color: "#71717a",
                    fontSize: 11, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer",
                  }}
                >🗑️ 로컬에서만 삭제</button>
              </div>

              {/* 동기화 결과 */}
              {syncResult && (
                <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "#0a0a0f", fontSize: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {syncResult.success > 0 && <span style={{ color: "#86efac" }}>✅ 성공 {syncResult.success}건</span>}
                    {syncResult.success > 0 && syncResult.failed > 0 && <span style={{ color: "#71717a" }}> · </span>}
                    {syncResult.failed > 0 && <span style={{ color: "#fca5a5" }}>❌ 실패 {syncResult.failed}건</span>}
                  </div>
                  {syncResult.failed > 0 && syncResult.errors.length > 0 && (
                    <div style={{ fontSize: 9, color: "#71717a", paddingLeft: 8 }}>
                      {syncResult.errors.slice(0, 3).map((e, i) => (
                        <div key={i}>· {e.key}: {e.error}</div>
                      ))}
                      {syncResult.errors.length > 3 && <div>· ... 외 {syncResult.errors.length - 3}건</div>}
                    </div>
                  )}
                  {syncResult.failed > 0 && (
                    <div style={{ marginTop: 6, fontSize: 9, color: "#fbbf24", lineHeight: 1.5 }}>
                      💡 실패가 계속되면: 브라우저 DevTools → Application → Storage → Clear site data 후 재로그인
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 🆕 보안 필터 알림 (다른 사용자 게임 제외됨) */}
          {filteredOutCount > 0 && (
            <div style={{
              padding: "8px 12px", borderRadius: 6, marginBottom: 10,
              background: "#3b82f615", border: "1px solid #3b82f630",
              fontSize: 10, color: "#93c5fd", display: "flex", alignItems: "center", gap: 6,
            }}>
              🔒 보안: 다른 사용자의 게임 <strong>{filteredOutCount}건</strong>이 자동으로 제외되었습니다. (내 게임만 표시)
            </div>
          )}

          {/* 🆕 레거시 데이터 안내 (식별자 없는 오래된 게임) */}
          {legacyAllowedCount > 0 && (
            <div style={{
              padding: "10px 12px", borderRadius: 6, marginBottom: 10,
              background: "#fbbf2410", border: "1px solid #fbbf2430",
              fontSize: 10, color: "#fde68a",
            }}>
              <div style={{ marginBottom: 6 }}>
                ⚠️ 식별자가 없는 오래된 게임 <strong>{legacyAllowedCount}건</strong>이 있습니다.
                <br/>
                <span style={{ color: "#fca5a5" }}>
                  이 데이터는 현재 로그인 이전에 저장되었거나 다른 계정의 게임일 수 있습니다.
                </span>
              </div>
              <button
                onClick={() => {
                  if (!window.confirm(`식별자가 없는 오래된 게임 ${legacyAllowedCount}건을 브라우저에서 삭제하시겠습니까?\n\n⚠️ Supabase 서버에 저장된 데이터는 그대로 유지됩니다.\n⚠️ 브라우저 localStorage와 IndexedDB의 로컬 캐시만 삭제됩니다.\n\n정말 삭제하려면 확인을 눌러주세요.`)) return;

                  // 식별자 없는 게임 찾아서 localStorage에서 삭제
                  let removedLocal = 0;
                  const toRemove = [];
                  if (typeof localStorage !== "undefined") {
                    for (let i = 0; i < localStorage.length; i++) {
                      const k = localStorage.key(i);
                      if (!k) continue;
                      // game: 또는 debrief: 로 시작하고, value에 user_id/saveLog 없음
                      if (k.startsWith("game:") || k.startsWith("debrief:")) {
                        try {
                          const v = localStorage.getItem(k);
                          if (!v) continue;
                          const d = JSON.parse(v);
                          const hasUid = d.user_id || d.saveLog?.savedByUserId || (d.playerId && d.playerId !== "solo");
                          if (!hasUid) toRemove.push(k);
                        } catch {}
                      }
                    }
                    for (const k of toRemove) {
                      localStorage.removeItem(k);
                      removedLocal++;
                    }
                  }
                  // 영구 저장도 정리
                  let removedEternal = 0;
                  if (typeof localStorage !== "undefined") {
                    const ek = [];
                    for (let i = 0; i < localStorage.length; i++) {
                      const k = localStorage.key(i);
                      if (k && k.startsWith("debrief-永:")) {
                        // 대응되는 게임이 식별자 없으면 삭제
                        try {
                          const v = localStorage.getItem(k);
                          if (v) {
                            const d = JSON.parse(v);
                            // gameInfo에 playerId가 없거나 solo면 레거시로 판단
                            if (!d?.gameInfo || !d.gameInfo.playerId || d.gameInfo.playerId === "solo") {
                              ek.push(k);
                            }
                          }
                        } catch {}
                      }
                    }
                    for (const k of ek) {
                      localStorage.removeItem(k);
                      removedEternal++;
                    }
                  }
                  alert(`✅ 정리 완료\n\n- localStorage: ${removedLocal}건\n- 영구 저장: ${removedEternal}건\n\n페이지를 새로고침합니다.`);
                  window.location.reload();
                }}
                style={{
                  padding: "4px 10px", borderRadius: 4, border: "1px solid #fbbf2450",
                  background: "#fbbf2420", color: "#fde68a", cursor: "pointer",
                  fontSize: 10, fontWeight: 700,
                }}
              >🗑️ 오래된 데이터 정리</button>
            </div>
          )}
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

                {/* 🆕 총평 버튼 (전체 너비) */}
                {(() => {
                  const tierInfo = TIER_META.find(t => t.key === "analysis");
                  if (!tierInfo) return null;
                  const { key, icon, label, color } = tierInfo;
                  const done = !!(g.debriefData?.analysis?.phases?.length || g.debriefData?.analysis?.lessons?.length);
                  return (
                    <button
                      key={key}
                      onClick={() => handleDebrief(g, key)}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                        border: `1px solid ${done ? color + "60" : color + "30"}`,
                        background: done ? color + "20" : "transparent",
                        color: done ? color : "#a1a1aa",
                        cursor: "pointer",
                        fontSize: 11, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        transition: "all 0.2s",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <span>{label}</span>
                      <span style={{ fontSize: 9, color: done ? color : "#52525b", fontWeight: 600, marginLeft: 4 }}>
                        {done ? "· 📄 다시 보기" : "· ▶ 무료"}
                      </span>
                    </button>
                  );
                })()}

                {/* AI 피드백 3종 (요약/상세/프리미엄) - 3등분 grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {TIER_META.filter(t => t.key !== "analysis").map(({ key, icon, label, price, color }) => {
                    const done = !!fb[key]?.text;
                    return (
                      <button
                        key={key}
                        onClick={() => handleDebrief(g, key)}
                        style={{
                          padding: "10px 6px", borderRadius: 8,
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
  const { game, tier, text, analysis, generatedAt, loading, error, savedReplay } = modal;

  const TIER_LABEL = {
    free: { icon: "💬", name: "요약 피드백", color: "#22c55e" },
    analysis: { icon: "📋", name: "총평 분석", color: "#a855f7" },
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

    // 🆕 analysis(5단계 + Best/Worst 그래프 + 5가지 교훈)를 HTML로 변환
    const fmtNumLocal = (n) => new Intl.NumberFormat("en-US").format(n || 0);
    const turns = game?.turnCount || (game?.turnLog || []).length || 0;
    const phaseColors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

    let analysisHtml = "";
    if (analysis && (analysis.phases || analysis.lessons)) {
      // 1) 전 생애 자산 흐름 요약 (5단계 phases)
      if (Array.isArray(analysis.phases) && analysis.phases.length > 0) {
        analysisHtml += `<div class="section">
          <h2 class="section-title">📋 전 생애 자산 흐름 요약</h2>
          <div class="phases">`;
        analysis.phases.forEach((p, i) => {
          const c = phaseColors[i] || "#666";
          analysisHtml += `
            <div class="phase">
              <div class="phase-header">
                <span class="phase-tag" style="background:${c}20;color:${c};">${escapeHtml(p.title || "")} (${escapeHtml(p.age || "")})</span>
                <span class="phase-turns">${escapeHtml(p.turns || "")}</span>
              </div>
              <div class="phase-cards">${escapeHtml(p.cards || "")}</div>
              <div class="phase-verdict" style="color:${c};">${escapeHtml(p.verdict || "")}</div>
            </div>`;
        });
        analysisHtml += `</div></div>`;
      }

      // 2) 최상의 선택 vs 최악의 선택 그래프
      const bp = analysis.bestPath || [];
      const wp = analysis.worstPath || [];
      if (bp.length > 0 && wp.length > 0) {
        const allTurns = Array.from(new Set([...bp.map(b => b.turn), ...wp.map(w => w.turn)])).sort((a, b) => a - b);
        const yearsPerTurn = Math.round(40 / Math.max(turns, 1) * 10) / 10;
        const ageAtTurn = (t) => Math.round(20 + (t - 0.5) * yearsPerTurn);
        const getValueAtTurn = (path, turn) => {
          let cf = 0, asset = 0, note = "";
          for (const p of path) {
            if (p.turn <= turn) { cf = p.cf || 0; asset = p.asset || 0; note = p.note || ""; }
            else break;
          }
          return { cf, asset, note };
        };
        const rows = allTurns.map(t => {
          const b = getValueAtTurn(bp, t);
          const w = getValueAtTurn(wp, t);
          const bEv = bp.find(p => p.turn === t);
          const wEv = wp.find(p => p.turn === t);
          return { turn: t, age: ageAtTurn(t), bCF: b.cf, wCF: w.cf, bNote: bEv?.note || "", wNote: wEv?.note || "" };
        });
        const maxCF = Math.max(...rows.flatMap(r => [Math.abs(r.bCF), Math.abs(r.wCF)]), 100);
        const lastRow = rows[rows.length - 1] || { bCF: 0, wCF: 0 };

        analysisHtml += `<div class="section">
          <h2 class="section-title">📈 최상의 선택 vs 최악의 선택 (월 현금흐름)</h2>
          <div class="legend">
            <span class="legend-item"><span class="legend-bar" style="background:#22c55e;"></span> 최상의 선택 (누적)</span>
            <span class="legend-item"><span class="legend-bar" style="background:#ef4444;"></span> 최악의 선택 (누적)</span>
          </div>
          <table class="graph-table">`;
        rows.forEach(r => {
          const bW = r.bCF === 0 ? 0 : Math.max(2, (Math.abs(r.bCF) / maxCF) * 100);
          const wW = r.wCF === 0 ? 0 : Math.max(2, (Math.abs(r.wCF) / maxCF) * 100);
          const fmtV = (v) => v === 0 ? "—" : (v >= 0 ? `+$${fmtNumLocal(Math.round(v))}` : `-$${fmtNumLocal(Math.abs(Math.round(v)))}`);
          analysisHtml += `
            <tr>
              <td class="g-turn">T${r.turn} ${r.age}세</td>
              <td class="g-bar">
                <div class="bar-row">
                  ${bW > 0 ? `<div class="bar best" style="width:${bW}%"></div>` : `<span class="bar-empty">—</span>`}
                  <span class="bar-val best-val">${fmtV(r.bCF)}</span>
                </div>
                <div class="bar-row">
                  ${wW > 0 ? `<div class="bar worst" style="width:${wW}%"></div>` : `<span class="bar-empty">—</span>`}
                  <span class="bar-val worst-val">${fmtV(r.wCF)}</span>
                </div>
                ${r.bNote ? `<div class="note best-note">▲ ${escapeHtml(r.bNote)}</div>` : ""}
                ${r.wNote ? `<div class="note worst-note">▼ ${escapeHtml(r.wNote)}</div>` : ""}
              </td>
            </tr>`;
        });
        analysisHtml += `</table>
          <div class="comparison">
            <div class="comp-box best-box"><div class="comp-label">최상의 선택</div><div class="comp-val">${lastRow.bCF >= 0 ? "+" : ""}$${fmtNumLocal(Math.round(lastRow.bCF))}/월</div></div>
            <div class="comp-vs">VS</div>
            <div class="comp-box worst-box"><div class="comp-label">최악의 선택</div><div class="comp-val">${lastRow.wCF >= 0 ? "+" : ""}$${fmtNumLocal(Math.round(lastRow.wCF))}/월</div></div>
          </div>
          <p class="comp-gap">같은 카드, 다른 선택 — 월 현금흐름 격차: <strong>$${fmtNumLocal(Math.abs(lastRow.bCF - lastRow.wCF))}</strong></p>
        </div>`;
      }

      // 3) 5가지 교훈
      if (Array.isArray(analysis.lessons) && analysis.lessons.length > 0) {
        analysisHtml += `<div class="section">
          <h2 class="section-title">💡 이 게임이 가르쳐 준 5가지</h2>
          <ol class="lessons">`;
        analysis.lessons.forEach((lesson) => {
          analysisHtml += `<li>${escapeHtml(lesson)}</li>`;
        });
        analysisHtml += `</ol></div>`;
      }

      // 4) 💰 6 Levels of Wealth — 당신의 현 위치
      if (analysis.financialLevel) {
        const fl = analysis.financialLevel;
        const levels = [
          { n: 1, name: "의존", icon: "⚓" },
          { n: 2, name: "생존", icon: "⛺" },
          { n: 3, name: "안정", icon: "🌱" },
          { n: 4, name: "안정성", icon: "🛡️" },
          { n: 5, name: "자유", icon: "🦅" },
          { n: 6, name: "풍요", icon: "👑" },
        ];
        let levelBar = '<div class="level-bar">';
        levels.forEach(L => {
          const isCurrent = L.n === fl.level;
          const isPast = L.n < fl.level;
          levelBar += `<div class="level-cell ${isCurrent ? "current" : (isPast ? "past" : "future")}" style="${isCurrent ? `border-color:${fl.color};background:${fl.color}20;` : ""}">
            <div class="level-icon">${L.icon}</div>
            <div class="level-num" style="${isCurrent ? `color:${fl.color};` : ""}">L${L.n}</div>
            <div class="level-name">${L.name}</div>
          </div>`;
        });
        levelBar += '</div>';

        analysisHtml += `<div class="section level-section">
          <h2 class="section-title">💰 6 Levels of Wealth — 당신의 현 위치</h2>
          ${levelBar}
          <div class="level-detail" style="border-left-color:${fl.color};background:${fl.color}10;">
            <div class="level-header">
              <span class="level-big-icon">${fl.icon}</span>
              <div>
                <div class="level-title" style="color:${fl.color};">Level ${fl.level}: ${escapeHtml(fl.levelName)}</div>
                <div class="level-eng">${escapeHtml(fl.english)}</div>
              </div>
            </div>
            <p class="level-status">${escapeHtml(fl.status)}</p>
            ${fl.kpi ? `<div class="level-kpi">
              <span class="kpi-now">현재: ${escapeHtml(fl.kpi.current)}</span>
              <span class="kpi-target" style="background:${fl.color}20;color:${fl.color};">다음: ${escapeHtml(fl.kpi.target)}</span>
            </div>` : ""}
            <div class="level-guidance">
              <div class="guidance-label">📋 이 단계에서 해야 할 행동</div>
              <ol>
                ${(fl.guidance || []).map(g => `<li>${escapeHtml(g)}</li>`).join("")}
              </ol>
            </div>
            ${fl.nextStep ? `<div class="level-next">
              <div class="next-label">🎯 다음 단계로 가는 길</div>
              <p>${escapeHtml(fl.nextStep)}</p>
            </div>` : ""}
          </div>
        </div>`;

        // 5) 🛡️ 시장에 흔들리지 않는 3가지 원칙 (모든 단계 공통)
        analysisHtml += `<div class="section">
          <h2 class="section-title">🛡️ 시장에 흔들리지 않는 3가지 원칙</h2>
          <div class="principles">
            <div class="principle"><div class="p-num" style="color:#d97706;">1. 기준점의 내재화</div><p>성공의 기준을 시장 지수나 친구의 수익률이 아니라, <strong>'어제의 나보다 얼마나 더 탄탄해졌는가'</strong>에 두세요.</p></div>
            <div class="principle"><div class="p-num" style="color:#16a34a;">2. 시간의 주권 되찾기</div><p>경제적 자유의 본질은 <strong>'하기 싫은 일을 하지 않아도 되는 상태'</strong>입니다. 내가 통제할 수 있는 범위(지출 관리, 자기 계발)에 집중하세요.</p></div>
            <div class="principle"><div class="p-num" style="color:#2563eb;">3. 자산보다 중요한 '시스템'</div><p>통장 잔고를 늘리는 것보다, 어떤 상황에서도 나를 지켜줄 <strong>재무적 시스템(보험·비상금·자동 저축)</strong>을 구축하세요.</p></div>
          </div>
        </div>`;
      }

      // 6) 최종 디브리핑 질문
      if (analysis.finalQuestion) {
        analysisHtml += `<div class="section final-q">
          <p class="final-label">최종 디브리핑 질문</p>
          <p class="final-text">${escapeHtml(analysis.finalQuestion)}</p>
        </div>`;
      }
    }

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
    /* 🆕 analysis 섹션 스타일 */
    .section { margin: 24px 0; padding: 16px; background: #fafafa; border-radius: 8px; page-break-inside: avoid; }
    .section-title { font-size: 14px; font-weight: 800; color: #1a1a1a; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e5e5; }
    .phases { display: flex; flex-direction: column; gap: 10px; }
    .phase { padding: 10px; background: white; border-radius: 6px; border-left: 3px solid #ddd; }
    .phase-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .phase-tag { padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .phase-turns { font-size: 10px; color: #888; }
    .phase-cards { font-size: 11px; color: #555; margin-bottom: 4px; line-height: 1.6; }
    .phase-verdict { font-size: 11px; font-weight: 600; line-height: 1.6; }
    .legend { display: flex; gap: 16px; margin-bottom: 12px; font-size: 10px; }
    .legend-item { display: inline-flex; align-items: center; gap: 4px; }
    .legend-bar { display: inline-block; width: 14px; height: 8px; border-radius: 2px; }
    .graph-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .graph-table td { padding: 6px 0; vertical-align: top; }
    .g-turn { font-size: 10px; color: #666; width: 70px; padding-right: 8px; font-weight: 600; }
    .g-bar { width: auto; }
    .bar-row { display: flex; align-items: center; gap: 6px; min-height: 12px; margin-bottom: 2px; }
    .bar { height: 8px; border-radius: 2px; }
    .bar.best { background: #22c55e; }
    .bar.worst { background: #ef4444; }
    .bar-empty { display: inline-block; width: 14px; color: #999; font-size: 9px; }
    .bar-val { font-size: 9px; font-weight: 700; white-space: nowrap; }
    .best-val { color: #16a34a; }
    .worst-val { color: #dc2626; }
    .note { font-size: 9px; margin: 2px 0; padding-left: 4px; line-height: 1.4; }
    .best-note { color: #16a34a; }
    .worst-note { color: #dc2626; }
    .comparison { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 12px 0; padding: 12px; background: white; border-radius: 6px; }
    .comp-box { text-align: center; padding: 8px 12px; }
    .comp-label { font-size: 10px; color: #888; margin-bottom: 4px; }
    .comp-val { font-size: 18px; font-weight: 800; }
    .best-box .comp-val { color: #16a34a; }
    .worst-box .comp-val { color: #dc2626; }
    .comp-vs { font-size: 14px; font-weight: 700; color: #999; }
    .comp-gap { text-align: center; font-size: 11px; color: #555; margin: 8px 0 0; }
    .lessons { padding-left: 20px; margin: 0; }
    .lessons li { font-size: 12px; line-height: 1.7; color: #333; margin-bottom: 8px; padding-left: 4px; }
    /* 🆕 6 Levels 스타일 */
    .level-section { background: #f9fafb; }
    .level-bar { display: flex; gap: 4px; margin-bottom: 14px; }
    .level-cell { flex: 1; padding: 8px 4px; border-radius: 6px; text-align: center; border: 1px solid #ddd; background: #fafafa; }
    .level-cell.current { font-weight: 700; }
    .level-cell.past { background: #f0f9f4; }
    .level-cell.future { opacity: 0.4; }
    .level-icon { font-size: 14px; margin-bottom: 2px; }
    .level-num { font-size: 9px; font-weight: 700; color: #666; }
    .level-name { font-size: 8px; color: #888; margin-top: 1px; }
    .level-detail { padding: 14px 16px; border-radius: 8px; border-left: 4px solid #ddd; margin-bottom: 12px; }
    .level-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .level-big-icon { font-size: 22px; }
    .level-title { font-size: 14px; font-weight: 800; }
    .level-eng { font-size: 9px; color: #888; font-style: italic; }
    .level-status { font-size: 12px; color: #444; line-height: 1.6; margin: 8px 0 12px; }
    .level-kpi { display: flex; gap: 6px; font-size: 9px; margin-bottom: 12px; flex-wrap: wrap; }
    .kpi-now { padding: 3px 8px; border-radius: 4px; background: #f0f0f0; color: #666; }
    .kpi-target { padding: 3px 8px; border-radius: 4px; font-weight: 700; }
    .level-guidance { margin-bottom: 10px; }
    .guidance-label { font-size: 11px; font-weight: 700; color: #333; margin-bottom: 6px; }
    .level-guidance ol { padding-left: 20px; margin: 0; }
    .level-guidance li { font-size: 11px; line-height: 1.6; color: #444; margin-bottom: 4px; }
    .level-next { padding: 10px 12px; border-radius: 6px; background: #eff6ff; border: 1px solid #dbeafe; }
    .next-label { font-size: 10px; font-weight: 700; color: #2563eb; margin-bottom: 4px; }
    .level-next p { font-size: 11px; color: #444; margin: 0; line-height: 1.5; }
    .principles { display: flex; flex-direction: column; gap: 8px; }
    .principle { padding: 10px 12px; background: white; border-radius: 6px; border-left: 3px solid #e5e5e5; }
    .principle .p-num { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
    .principle p { font-size: 10px; color: #444; margin: 0; line-height: 1.5; }
    .DUMMY_HOOK { display: none; }
    .final-q { background: #eff6ff; border-left: 4px solid #3b82f6; }
    .final-label { font-size: 11px; font-weight: 700; color: #3b82f6; margin: 0 0 6px; }
    .final-text { font-size: 14px; font-weight: 700; color: #1a1a1a; line-height: 1.7; margin: 0; }
    .feedback-divider { margin: 30px 0 16px; padding-top: 16px; border-top: 2px solid #e5e5e5; font-size: 12px; font-weight: 700; color: ${meta.color}; }
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

  ${analysisHtml}

  ${analysisHtml ? `<div class="feedback-divider">💬 코칭 메시지</div>` : ""}
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

          {!loading && !error && (text || (tier === "analysis" && analysis)) && (
            <>
              {/* 🆕 풀 분석 (5단계 + Best/Worst 그래프 + 5가지 교훈 + 6 Levels + 3원칙) */}
              {analysis && (analysis.phases || analysis.lessons || analysis.financialLevel) && (
                <div style={{ marginBottom: 20 }}>
                  <AnalysisReport
                    analysis={analysis}
                    turns={game?.turnCount || (game?.turnLog || []).length || 0}
                  />
                </div>
              )}

              {/* 텍스트 피드백 (요약/상세/프리미엄만, analysis 티어는 제외) */}
              {tier !== "analysis" && text && (
                <div style={{
                  fontSize: 13, color: "#e4e4e7", lineHeight: 1.7,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  paddingTop: analysis ? 20 : 0,
                  borderTop: analysis ? "1px solid #27272a" : "none",
                }}>
                  {analysis && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginBottom: 12 }}>
                      💬 코칭 메시지
                    </div>
                  )}
                  {text}
                </div>
              )}
            </>
          )}
        </div>

        {/* 다운로드/복사 버튼 (결과 있을 때만) */}
        {!loading && !error && (text || (tier === "analysis" && analysis)) && (
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
