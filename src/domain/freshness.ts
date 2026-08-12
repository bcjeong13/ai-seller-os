// ============================================================
// 데이터 신선도 게이트 (프롬프트 §2 설계판단, §7)
// 노후 데이터로는 발주 판정 금지 → 수동 재확인 요구.
// ============================================================

import type { Freshness } from "./types";

export interface FreshnessConfig {
  /** 이 시간(h) 초과 시 PREFLIGHT를 DATA_UNAVAILABLE로 강제 */
  staleHours: number;
}

export const DEFAULT_FRESHNESS: FreshnessConfig = { staleHours: 24 };

export function freshnessLevel(lastCollectedAt: number, now: number): Freshness {
  const hours = (now - lastCollectedAt) / (1000 * 60 * 60);
  if (hours <= 1) return "HIGH";
  if (hours <= 6) return "MEDIUM_HIGH";
  if (hours <= 24) return "MEDIUM";
  return "LOW";
}

export function isStale(
  lastCollectedAt: number,
  now: number,
  cfg: FreshnessConfig = DEFAULT_FRESHNESS
): boolean {
  const hours = (now - lastCollectedAt) / (1000 * 60 * 60);
  return hours > cfg.staleHours;
}

export function agoText(ts: number, now: number): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
