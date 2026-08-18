// ============================================================
// 공급가·재고 상시 감시 (사전 방어선)
//
// ★ 발주 전 검사와 역할이 다르다. 절대 하나로 합치지 않는다.
//   발주 전 검사 : 이미 들어온 주문을 손해 발주하지 않게 막는다 (최종 방어선)
//   상시 감시    : 손해 나는 주문이 애초에 들어오지 않게 막는다 (사전 방어선)
//
// ★ 읽지 못하면 절대 "정상"으로 넘기지 않는다. 반드시 "확인 실패"로 남긴다.
// ============================================================

import type { Product, SupplierStock, MarketFeeProfile } from "./types";
import { supplyHeadroom } from "./profitEngine";
import { formatKrw } from "./money";

// ------------------------------------------------------------
// 감시 결과 등급
// ------------------------------------------------------------

export type WatchLevel =
  | "SAFE"    // 여유 있음 — 화면에 띄우지 않는다
  | "WATCH"   // 한계선에 가까움
  | "RISK"    // 팔면 손해 · 품절
  | "FAILED"; // 확인 실패 — 정상으로 처리하면 안 된다

export interface WatchRow {
  productId: string;
  name: string;
  /** 등록(기준) 공급가 */
  baseKrw: number;
  /** 이번에 확인된 공급가. 실패면 undefined */
  nowKrw?: number;
  /** 이 값을 넘으면 적자 */
  limitKrw: number;
  /** 한계선까지 남은 금액 (음수면 이미 적자) */
  headroomKrw: number;
  stock: SupplierStock;
  level: WatchLevel;
  message: string;
  /** 사용자가 지금 해야 할 일 */
  action?: string;
}

/** 한계선 대비 여유가 이 비율 아래면 "곧 위험" */
export const WATCH_MARGIN_PCT = 15;

/**
 * 확인된 값으로 한 상품의 위험도를 판정한다.
 * @param nowKrw 확인된 공급가. undefined = 읽기 실패
 */
export function judgeWatch(
  product: Product,
  nowKrw: number | undefined,
  stock: SupplierStock,
  feeProfile?: MarketFeeProfile
): WatchRow {
  const h = supplyHeadroom(product.price, product.cost, feeProfile);
  const base = product.cost.supplyPriceKrw;
  const limit = h.maxSupplyPriceKrw;

  const row: WatchRow = {
    productId: product.id,
    name: product.name,
    baseKrw: base,
    nowKrw,
    limitKrw: limit,
    headroomKrw: nowKrw === undefined ? h.headroomKrw : limit - nowKrw,
    stock,
    level: "SAFE",
    message: "",
  };

  // 1) 읽지 못했다 — 정상으로 처리하지 않는다
  if (nowKrw === undefined) {
    row.level = "FAILED";
    row.message = "가격을 읽지 못했습니다 — 직접 확인해야 합니다";
    row.action = "도매처 열어 확인";
    return row;
  }

  // 2) 품절이 가격보다 급하다 — 주문이 들어오면 발주 자체가 불가능하다
  if (stock === "OUT_OF_STOCK") {
    row.level = "RISK";
    row.message = "도매처 품절 — 지금 주문이 들어오면 발주할 수 없습니다";
    row.action = "판매 중지";
    return row;
  }

  // 3) 한계선 초과 = 팔수록 손해
  if (nowKrw > limit) {
    row.level = "RISK";
    row.message = `공급가 ${formatKrw(nowKrw)} — 한계선 ${formatKrw(limit)}을 ${formatKrw(nowKrw - limit)} 넘었습니다`;
    row.action = "판매 중지 또는 판매가 인상";
    return row;
  }

  // 4) 한계선에 가까움
  const usedPct = limit > 0 ? ((limit - nowKrw) / limit) * 100 : 0;
  if (usedPct < WATCH_MARGIN_PCT) {
    row.level = "WATCH";
    row.message = `한계선까지 ${formatKrw(limit - nowKrw)} 남았습니다`;
    row.action = "판매가 올려두기";
    return row;
  }

  if (stock === "LOW_STOCK") {
    row.level = "WATCH";
    row.message = "도매처 재고가 얼마 남지 않았습니다";
    row.action = "재고 확인";
    return row;
  }

  row.level = nowKrw !== base ? "SAFE" : "SAFE";
  row.message =
    nowKrw === base
      ? "변동 없음"
      : `공급가 ${formatKrw(base)} → ${formatKrw(nowKrw)} — 아직 ${formatKrw(limit - nowKrw)} 여유`;
  return row;
}

// ------------------------------------------------------------
// 감시 주기 — 모든 상품을 같은 주기로 보지 않는다
// ★ 얇은 마진과 잘 팔리는 상품이 먼저다.
// ------------------------------------------------------------

export interface WatchContext {
  /** 최근 24시간 주문 수 */
  ordersToday: number;
  /** 최근 7일 주문 수 */
  ordersWeek: number;
}

const HOUR = 3600_000;

/** 이 상품을 몇 시간마다 확인해야 하는가 */
export function watchIntervalHours(
  product: Product,
  ctx: WatchContext,
  feeProfile?: MarketFeeProfile
): number {
  const h = supplyHeadroom(product.price, product.cost, feeProfile);

  // 이미 적자거나 여유가 거의 없다 → 가장 짧게
  if (h.alreadyLoss || h.headroomPct < 10) return 4;
  // 잘 팔린다 → 짧게 (손해가 빠르게 누적된다)
  if (ctx.ordersToday >= 5) return 6;
  if (ctx.ordersToday >= 1) return 12;
  // 마진이 얇다
  if (h.headroomPct < 25) return 12;
  // 안 팔리고 마진도 넉넉하다 → 길게
  if (ctx.ordersWeek === 0) return 72;
  return 24;
}

export function needsCheck(
  product: Product,
  ctx: WatchContext,
  now: number,
  feeProfile?: MarketFeeProfile
): boolean {
  const due = watchIntervalHours(product, ctx, feeProfile) * HOUR;
  return now - product.lastCollectedAt >= due;
}

// ------------------------------------------------------------
// 앱 ⇄ 확장 주고받는 블록
// ------------------------------------------------------------

export const WATCH_HEADER = "##AISOS-WATCH##";
export const RESULT_HEADER = "##AISOS-PRICES##";

/** 앱 → 확장: 점검할 목록 */
export function buildWatchList(items: { id: string; url: string }[]): string {
  const lines = items
    .filter((i) => /^https?:\/\//i.test(i.url))
    .map((i) => `${i.id}|${i.url}`);
  return [WATCH_HEADER, ...lines].join("\n");
}

export interface WatchResult {
  productId: string;
  /** 못 읽었으면 undefined */
  supplyPriceKrw?: number;
  stock: SupplierStock;
}

/** 확장 → 앱: 점검 결과 */
export function parseWatchResults(text: string): WatchResult[] {
  if (!text || !text.includes(RESULT_HEADER)) return [];
  const body = text.slice(text.indexOf(RESULT_HEADER) + RESULT_HEADER.length);
  const out: WatchResult[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [id, priceStr, stockStr] = line.split("|").map((s) => (s ?? "").trim());
    if (!id) continue;
    const n = parseInt((priceStr || "").replace(/[^\d]/g, ""), 10);
    out.push({
      productId: id,
      supplyPriceKrw: Number.isFinite(n) && n > 0 ? n : undefined,
      stock: toStock(stockStr),
    });
  }
  return out;
}

function toStock(s: string): SupplierStock {
  switch ((s || "").toUpperCase()) {
    case "OUT": case "OUT_OF_STOCK": return "OUT_OF_STOCK";
    case "LOW": case "LOW_STOCK": return "LOW_STOCK";
    case "IN": case "IN_STOCK": return "IN_STOCK";
    case "FAIL": return "DATA_UNAVAILABLE";
    default: return "UNKNOWN";
  }
}

/** 결과 묶음 요약 — 대시보드에는 정상 상품을 띄우지 않는다 */
export interface WatchSummary {
  risk: WatchRow[];
  watch: WatchRow[];
  failed: WatchRow[];
  safeCount: number;
}

export function summarizeWatch(rows: WatchRow[]): WatchSummary {
  return {
    risk: rows.filter((r) => r.level === "RISK"),
    watch: rows.filter((r) => r.level === "WATCH"),
    failed: rows.filter((r) => r.level === "FAILED"),
    safeCount: rows.filter((r) => r.level === "SAFE").length,
  };
}
