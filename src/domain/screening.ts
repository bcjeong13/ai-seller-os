// ============================================================
// 가격공간 스크리닝 — 소싱의 첫 번째 관문
//
// ★ 지금까지 계속 불합격이 난 이유는 순서가 거꾸로였기 때문이다.
//   (기존) 도매에서 아무거나 고른다 → 소매가와 비교한다 → 이미 소매가 더 싸다
//   (바뀜) 도매가와 소매 시세를 먼저 맞대본다 → 살 자리가 있는 것만 남긴다
//
// ★ 대량으로 훑는 단계다. 정밀 판정(경쟁상품 분류·손익)은 그 뒤에 한다.
// ★ 여기서는 보수적으로 "가망 없는 것"만 떨어뜨린다.
//   최저가일 필요는 없으므로, 시장 상단에서도 자리가 없을 때만 탈락시킨다.
// ★ 점수를 만들지 않는다. 정렬용 순위값만 내부에 쓴다.
// ============================================================

import { bandOf, type PriceBand } from "./competition";
import { formatKrw } from "./money";

export type GapLevel =
  | "ROOM"     // 🟢 중간 가격대에서도 목표 마진이 나온다
  | "TIGHT"    // 🟡 상단 가격대에서만 가능하다
  | "NO_ROOM"  // 🔴 시장 상단에서도 마진이 안 나온다
  | "UNKNOWN"; // ⚪ 시세를 못 구했다 — 판단하지 않는다

export const GAP_LABEL: Record<GapLevel, string> = {
  ROOM: "🟢 가격 여유 있음",
  TIGHT: "🟡 상단에서만 가능",
  NO_ROOM: "🔴 팔 자리 없음",
  UNKNOWN: "⚪ 시세 미확인",
};

export interface ScreenInput {
  /** 고객 1주문을 처리하는 매입원가 (공급가 × 최소수량 + 배송비) */
  landedCostKrw: number;
  /** 마켓 수수료율(%) — 보수적으로 잡는다 */
  feePct: number;
  /** 이 아래로는 팔 이유가 없는 마진(%) */
  minMarginPct: number;
  /** 원하는 마진(%) */
  targetMarginPct: number;
}

export interface ScreenResult {
  level: GapLevel;
  /** 최소 마진을 맞추는 판매가 */
  minPriceKrw: number;
  /** 목표 마진을 맞추는 판매가 */
  targetPriceKrw: number;
  band?: PriceBand;
  /** 시장 중간가 대비 여유 금액 (음수면 부족) */
  roomKrw: number;
  text: string;
  /** 정렬용 — 화면에 숫자로 내보내지 않는다 */
  rank: number;
}

/** 마진을 맞추려면 얼마에 팔아야 하는가 */
export function priceForMargin(landedCostKrw: number, feePct: number, marginPct: number): number {
  const denom = 1 - feePct / 100 - marginPct / 100;
  if (denom <= 0) return Infinity;
  return Math.ceil((landedCostKrw / denom) / 100) * 100;
}

/**
 * 도매 매입원가와 소매 시세를 맞대본다.
 * @param prices 소매 시장에서 수집한 실질 구매가들
 */
export function screenPriceGap(input: ScreenInput, prices: number[]): ScreenResult {
  const band = bandOf(prices);
  const minPriceKrw = priceForMargin(input.landedCostKrw, input.feePct, input.minMarginPct);
  const targetPriceKrw = priceForMargin(input.landedCostKrw, input.feePct, input.targetMarginPct);

  if (!band || band.count < 3) {
    return {
      level: "UNKNOWN", minPriceKrw, targetPriceKrw, band, roomKrw: 0,
      text: band ? `시세 표본이 ${band.count}개뿐입니다 — 판단하지 않습니다` : "소매 시세를 구하지 못했습니다",
      rank: 900,
    };
  }

  const roomKrw = band.median - targetPriceKrw;

  // 시장 상단(75%)에서도 최소 마진이 안 나오면 자리가 없다
  if (minPriceKrw > band.p75) {
    return {
      level: "NO_ROOM", minPriceKrw, targetPriceKrw, band, roomKrw,
      text: `최소 ${formatKrw(minPriceKrw)}은 받아야 하는데 시장 상위 75%가 ${formatKrw(band.p75)}입니다`,
      rank: 700 + Math.min(200, Math.round(((minPriceKrw - band.p75) / band.p75) * 100)),
    };
  }

  // 목표 마진이 중간가 안에서 나오면 넉넉하다
  if (targetPriceKrw <= band.median) {
    return {
      level: "ROOM", minPriceKrw, targetPriceKrw, band, roomKrw,
      text: `목표가 ${formatKrw(targetPriceKrw)}이 시장 중간 ${formatKrw(band.median)}보다 ${formatKrw(roomKrw)} 낮습니다`,
      rank: Math.max(0, 100 - Math.round((roomKrw / band.median) * 100)),
    };
  }

  return {
    level: "TIGHT", minPriceKrw, targetPriceKrw, band, roomKrw,
    text: `중간가 ${formatKrw(band.median)}에서는 빠듯합니다 — ${formatKrw(minPriceKrw)} 이상 상단에서만 가능`,
    rank: 300 + Math.round(((targetPriceKrw - band.median) / band.median) * 100),
  };
}

// ------------------------------------------------------------
// 앱 ⇄ 확장: 시세 조사
//   앱 → 확장  ##AISOS-SURVEY##  key|검색어
//   확장 → 앱  ##AISOS-MARKET##  key|12900,15900,17900,...
// ------------------------------------------------------------

export const SURVEY_HEADER = "##AISOS-SURVEY##";
export const MARKET_HEADER = "##AISOS-MARKET##";

export function buildSurveyList(items: { key: string; keyword: string }[]): string {
  const lines = items
    .filter((i) => i.key && i.keyword.trim())
    .map((i) => `${i.key}|${i.keyword.replace(/\|/g, " ").trim()}`);
  return [SURVEY_HEADER, ...lines].join("\n");
}

export interface MarketSample {
  key: string;
  prices: number[];
}

export function parseMarketSamples(text: string): MarketSample[] {
  if (!text || !text.includes(MARKET_HEADER)) return [];
  const body = text.slice(text.indexOf(MARKET_HEADER) + MARKET_HEADER.length);
  const out: MarketSample[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf("|");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    const prices = line.slice(i + 1)
      // 천 단위 구분자(12,900)를 값 구분자로 오인하지 않는다
      .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
      .split(/[,\s]+/)
      .map((s) => parseInt(s.replace(/[^\d]/g, ""), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    out.push({ key, prices });
  }
  return out;
}

// ------------------------------------------------------------
// 집계
// ------------------------------------------------------------

export interface ScreenSummary {
  total: number;
  room: number;
  tight: number;
  noRoom: number;
  unknown: number;
}

export function summarizeScreen(results: ScreenResult[]): ScreenSummary {
  return {
    total: results.length,
    room: results.filter((r) => r.level === "ROOM").length,
    tight: results.filter((r) => r.level === "TIGHT").length,
    noRoom: results.filter((r) => r.level === "NO_ROOM").length,
    unknown: results.filter((r) => r.level === "UNKNOWN").length,
  };
}
