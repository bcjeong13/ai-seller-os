// 기본값 팩토리 — 최소 입력만으로 동작하도록 합리적 기본값 제공.
// ※ 수수료 요율은 fees.ts 에서 마켓별 프로필로 관리한다 (여기 하드코딩 금지).

import type {
  CostInputs, Product, Marketplace, PriceBreakdown, ReturnModel,
  ProductOption, ChannelListing, ProductSpec,
} from "./types";
import { ALL_CHANNELS } from "./types";

/** 반품 기본 모델 — 추정치. 운영하며 실측으로 대체된다. */
export const DEFAULT_RETURN: ReturnModel = {
  costPerReturnKrw: 4000, // 도매처가 청구하는 반품배송비 — 상품마다 다르므로 반드시 확인
  exchangeCostKrw: 8000,  // 보통 반품비의 2배
  ratePct: 2,
  measured: false,
};

export const DEFAULT_COST: CostInputs = {
  supplyPriceKrw: 0,
  minOrderQty: 1,
  shippingKrw: 2500,
  returnModel: { ...DEFAULT_RETURN },
  csCostKrw: 200,
  adCostKrw: 0,
};

let counter = 0;
export function newId(prefix = "p"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function makePrice(listPriceKrw: number, discountKrw = 0, buyerShippingKrw = 0): PriceBreakdown {
  return {
    listPriceKrw,
    discountKrw,
    buyerPaidKrw: Math.max(0, listPriceKrw - discountKrw),
    buyerShippingKrw,
  };
}

export function makeOption(name: string, supplyPriceKrw: number, addPriceKrw = 0): ProductOption {
  return {
    id: newId("opt"),
    name,
    supplyPriceKrw,
    addPriceKrw,
    supplierStock: "IN_STOCK",
    enabled: true,
  };
}

function emptyListings(): ChannelListing[] {
  return ALL_CHANNELS.map((m) => ({ marketplace: m, listed: false, pending: false }));
}

export interface NewProductInput {
  name: string;
  sourceUrl?: string;
  supplierName?: string;
  marketplace: Marketplace;
  listPriceKrw: number;
  discountKrw?: number;
  buyerShippingKrw?: number;
  supplyPriceKrw: number;
  minOrderQty?: number;
  shippingKrw?: number;
  minMarginPct?: number;
  minProfitKrw?: number;
  imageRightsConfirmed?: boolean;
  options?: ProductOption[];
  specs?: ProductSpec[];
  returnCostKrw?: number;
  exchangeCostKrw?: number;
  returnRatePct?: number;
}

export function makeProduct(input: NewProductInput): Product {
  const now = Date.now();
  const cost: CostInputs = {
    ...DEFAULT_COST,
    returnModel: {
      ...DEFAULT_RETURN,
      costPerReturnKrw: input.returnCostKrw ?? DEFAULT_RETURN.costPerReturnKrw,
      exchangeCostKrw: input.exchangeCostKrw ?? DEFAULT_RETURN.exchangeCostKrw,
      ratePct: input.returnRatePct ?? DEFAULT_RETURN.ratePct,
    },
    supplyPriceKrw: input.supplyPriceKrw,
    minOrderQty: Math.max(1, Math.floor(input.minOrderQty ?? 1)),
    shippingKrw: input.shippingKrw ?? DEFAULT_COST.shippingKrw,
  };
  return {
    id: newId(),
    name: input.name,
    sourceUrl: input.sourceUrl ?? "",
    supplierName: input.supplierName ?? "",
    marketplace: input.marketplace,
    price: makePrice(input.listPriceKrw, input.discountKrw ?? 0, input.buyerShippingKrw ?? 0),
    cost,
    baselineCost: { ...cost, returnModel: { ...cost.returnModel } },
    options: input.options ?? [],
    supplierStock: "IN_STOCK",
    sellerInventory: 0, // 위탁배송 = 항상 0
    minMarginPct: input.minMarginPct ?? 15,
    minProfitKrw: input.minProfitKrw ?? 0,
    legalBlock: false,
    imageRightsConfirmed: input.imageRightsConfirmed ?? false,
    specs: input.specs ?? [],
    status: "DRAFT",
    listings: emptyListings(),
    lastCollectedAt: now,
    createdAt: now,
    costHistory: [{
      at: now,
      supplyPriceKrw: cost.supplyPriceKrw,
      shippingKrw: cost.shippingKrw,
      landedCostKrw: cost.supplyPriceKrw + cost.shippingKrw,
      note: "등록",
    }],
    events: [{ at: now, type: "CREATED", message: "상품 추가" }],
  };
}
