// 기본값 팩토리 — 초보자가 최소 입력만 해도 동작하도록 합리적 기본값 제공.

import type { CostInputs, Product, Marketplace } from "./types";

export const DEFAULT_COST: CostInputs = {
  productCostCny: 0,
  exchangeRate: 190, // 원/위안 (예시 기본값, 사용자가 수정)
  internationalShippingKrw: 2000,
  paymentFeePct: 2,
  platformFeePct: 5.6, // 네이버 예시
  domesticPaymentFeePct: 3.4,
  returnCostKrw: 300,
  csCostKrw: 200,
  adCostKrw: 0,
};

/** 마켓별 플랫폼 수수료 기본값(예시 — 사용자가 수정 가능) */
export const MARKET_FEE_DEFAULT: Record<Marketplace, number> = {
  NAVER: 5.6,
  COUPANG: 10.8,
  "11ST": 8,
  GMARKET: 8,
  OTHER: 8,
};

let counter = 0;
export function newId(prefix = "p"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export interface NewProductInput {
  name: string;
  sourceUrl?: string;
  marketplace: Marketplace;
  sellingPriceKrw: number;
  productCostCny: number;
  exchangeRate?: number;
  internationalShippingKrw?: number;
  minMarginPct?: number;
  minProfitKrw?: number;
}

export function makeProduct(input: NewProductInput): Product {
  const now = Date.now();
  const cost: CostInputs = {
    ...DEFAULT_COST,
    productCostCny: input.productCostCny,
    exchangeRate: input.exchangeRate ?? DEFAULT_COST.exchangeRate,
    internationalShippingKrw:
      input.internationalShippingKrw ?? DEFAULT_COST.internationalShippingKrw,
    platformFeePct: MARKET_FEE_DEFAULT[input.marketplace],
  };
  const productPriceKrw = Math.round(cost.productCostCny * cost.exchangeRate);
  return {
    id: newId(),
    name: input.name,
    sourceUrl: input.sourceUrl ?? "",
    marketplace: input.marketplace,
    sellingPriceKrw: input.sellingPriceKrw,
    cost,
    baselineCost: { ...cost },
    supplierStock: "IN_STOCK",
    sellerInventory: 0, // 구매대행 = 항상 0
    minMarginPct: input.minMarginPct ?? 15,
    minProfitKrw: input.minProfitKrw ?? 0,
    legalBlock: false,
    customsThresholdKrw: 200000, // ≈ $150
    dutyRatePct: 8,
    status: "SELLING",
    lastCollectedAt: now,
    createdAt: now,
    costHistory: [
      {
        at: now,
        productCostCny: cost.productCostCny,
        exchangeRate: cost.exchangeRate,
        internationalShippingKrw: cost.internationalShippingKrw,
        productPriceKrw,
        note: "등록",
      },
    ],
    events: [{ at: now, type: "CREATED", message: "상품 등록" }],
  };
}
