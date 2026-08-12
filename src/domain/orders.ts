// ============================================================
// 주문 & 주문 시점 손익 스냅샷 (프롬프트 §22, §23)
// 발주 당시 값 영구 보존. 이후 원가 변동에도 소급 변경 금지.
// ============================================================

import type { Product, PreflightStatus, ProfitResult } from "./types";
import type { PreflightResult } from "./preflight";

export interface OrderSnapshot {
  source_cost_snapshot: number; // 물품가 원화
  shipping_cost_snapshot: number;
  exchange_rate_snapshot: number;
  selling_price_snapshot: number;
  market_fee_snapshot: number;
  expected_profit_snapshot: number;
}

export interface Order {
  id: string;
  productId: string;
  productName: string;
  createdAt: number;
  quantity: number;
  /** 발주 당시 PREFLIGHT 판정 */
  preflightStatus: PreflightStatus;
  approved: boolean;
  /** 영구 보존 스냅샷 */
  snapshot: OrderSnapshot;
}

/** 주문 시점 스냅샷 생성 — 이 값은 이후 절대 변경하지 않는다. */
export function createSnapshot(
  product: Product,
  profit: ProfitResult
): OrderSnapshot {
  return {
    source_cost_snapshot: profit.productPriceKrw,
    shipping_cost_snapshot: product.cost.internationalShippingKrw,
    exchange_rate_snapshot: product.cost.exchangeRate,
    selling_price_snapshot: product.sellingPriceKrw,
    market_fee_snapshot: profit.platformFeeKrw + profit.domesticPaymentFeeKrw,
    expected_profit_snapshot: profit.netProfitKrw,
  };
}

export function buildOrder(
  id: string,
  product: Product,
  quantity: number,
  preflight: PreflightResult,
  approved: boolean
): Order {
  return {
    id,
    productId: product.id,
    productName: product.name,
    createdAt: Date.now(),
    quantity,
    preflightStatus: preflight.status,
    approved,
    snapshot: createSnapshot(product, preflight.profit),
  };
}
