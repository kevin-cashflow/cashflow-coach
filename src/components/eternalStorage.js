"use client";

/**
 * 🔐 IndexedDB 기반 영구 저장소
 * 
 * Supabase signOut()은 localStorage만 건드림 → IndexedDB는 절대 안전
 * 
 * 저장 구조:
 * - DB: "cashflow-eternal"
 * - Store: "debriefs"
 * - Key: `${gameKey}:${tier}` (예: "debrief:1776917218679:detail")
 * - Value: { gameKey, tier, text, generatedAt, gameInfo }
 */

const DB_NAME = "cashflow-eternal";
const DB_VERSION = 1;
const STORE_NAME = "debriefs";

let dbPromise = null;

// DB 연결 (싱글톤)
function openDB() {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB 미지원"));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
  
  return dbPromise;
}

// 디브리핑 저장
export async function saveEternalDebrief(gameKey, tier, text, gameInfo) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    const id = `${gameKey}:${tier}`;
    const record = {
      id,
      gameKey,
      tier,
      text,
      generatedAt: new Date().toISOString(),
      gameInfo: gameInfo || {},
    };
    
    await new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    console.log(`[EternalStorage] ✅ IndexedDB 저장: ${id}`);
    return true;
  } catch (e) {
    console.error("[EternalStorage] 저장 실패:", e);
    return false;
  }
}

// 디브리핑 단건 조회
export async function getEternalDebrief(gameKey, tier) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    const id = `${gameKey}:${tier}`;
    return await new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[EternalStorage] 조회 실패:", e);
    return null;
  }
}

// 모든 디브리핑 조회
export async function getAllEternalDebriefs() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    return await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[EternalStorage] 전체 조회 실패:", e);
    return [];
  }
}

// 디브리핑 삭제
export async function deleteEternalDebrief(gameKey, tier) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    const id = `${gameKey}:${tier}`;
    await new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return true;
  } catch (e) {
    console.warn("[EternalStorage] 삭제 실패:", e);
    return false;
  }
}

// 게임 관련 모든 디브리핑 삭제
export async function deleteGameEternalDebriefs(gameKey) {
  const all = await getAllEternalDebriefs();
  const matching = all.filter(d => d.gameKey === gameKey);
  for (const d of matching) {
    await deleteEternalDebrief(d.gameKey, d.tier);
  }
  return matching.length;
}

// 디버깅용: 전체 카운트
export async function countEternalDebriefs() {
  const all = await getAllEternalDebriefs();
  return all.length;
}

// 전역 window에 노출 (콘솔에서 직접 확인 가능)
if (typeof window !== "undefined") {
  window.__eternalStorage = {
    count: countEternalDebriefs,
    getAll: getAllEternalDebriefs,
    get: getEternalDebrief,
  };
}
