// ============================================================
// 손익 계산 엔진 — 100% 결정론적 코드 (LLM 미사용)
// 국내 위탁판매 기준. 부가세는 "현금 기준"으로 다루지 않는다 (지시서 §6-6).
// ============================================================

import type {
  CostInputs, ProfitResult, PriceBreakdown, MarketFeeProfile,
  Product, ProductOption, ScenarioProfit, Scenario,
  OptionProfit, OptionProfitSummary, RiskGrade, ReturnModel,
} from "./types";
import { won } from "./money";
import { computeFees, variablePctOf } from "./fees";
import { gradeProfit } from "./grading";

// ------------------------------------------------------------
// 반품 충당금 — (1건 실부담액 × 반품률)
// ------------------------------------------------------------

export function returnReserve(model: ReturnModel): number {
  const cost = Math.max(0, model.costPerReturnKrw || 0);
  const rate = Math.max(0, model.ratePct || 0);
  return won(cost * (rate / 100));
}

// ------------------------------------------------------------
// 기본 손익
// ------------------------------------------------------------

/**
 * 1회 발주 최소 수량. 도매처가 "2개 이상"으로만 팔면 고객이 1개를 사도 2개를 매입한다.
 * 원가는 (단가 × 이 수량)이다.
 */
export function packQty(cost: CostInputs): number {
  const q = Math.floor(cost.minOrderQty ?? 1);
  return Number.isFinite(q) && q >= 1 ? q : 1;
}

export interface ProfitOpts {
  feeProfile?: MarketFeeProfile;
  /** 반품 발생 시 반품배송비 (수수료 계산 기준) */
  returnShippingKrw?: number;
}

export function computeProfit(
  price: PriceBreakdown,
  cost: CostInputs,
  opts: ProfitOpts = {}
): ProfitResult {
  const buyerPaidKrw = won(price.buyerPaidKrw);
  const landedCostKrw = won(cost.supplyPriceKrw * packQty(cost) + cost.shippingKrw);

  const fees = computeFees(opts.feeProfile, {
    productKrw: buyerPaidKrw,
    shippingKrw: price.buyerShippingKrw || 0,
    returnShippingKrw: opts.returnShippingKrw ?? 0,
  });

  const returnReserveKrw = returnReserve(cost.returnModel);

  const sellerCostKrw = won(
    landedCostKrw +
    fees.totalKrw +
    returnReserveKrw +
    cost.csCostKrw +
    cost.adCostKrw
  );

  // 매출 = 구매자 결제금액 + 고객이 낸 배송비
  const revenueKrw = buyerPaidKrw + (price.buyerShippingKrw || 0);
  const netProfitKrw = revenueKrw - sellerCostKrw;
  const marginPct = revenueKrw > 0 ? (netProfitKrw / revenueKrw) * 100 : 0;

  const variablePct = variablePctOf(opts.feeProfile);
  const fixed = fixedCostOf(cost);
  const breakEvenPriceKrw =
    variablePct < 100 ? won(fixed / (1 - variablePct / 100)) : Infinity;

  return {
    buyerPaidKrw,
    supplyPriceKrw: cost.supplyPriceKrw,
    landedCostKrw,
    feeLines: fees.lines,
    totalFeeKrw: fees.totalKrw,
    returnReserveKrw,
    csCostKrw: cost.csCostKrw,
    adCostKrw: cost.adCostKrw,
    sellerCostKrw,
    netProfitKrw,
    marginPct,
    breakEvenPriceKrw,
  };
}

/** 판매가에 비례하지 않는 고정비 합 */
function fixedCostOf(cost: CostInputs): number {
  return (
    cost.supplyPriceKrw * packQty(cost) +
    cost.shippingKrw +
    returnReserve(cost.returnModel) +
    cost.csCostKrw +
    cost.adCostKrw
  );
}

// ------------------------------------------------------------
// 버티는 한계선 — 공급가가 얼마까지 올라도 적자가 아닌가
// ★ 이걸 미리 알고 있으면, 도매처 가격만 흘끗 봐도 판단할 수 있다.
//   "8,000원 됐네" → 한계선이 6,300원이었으면 그 자리에서 판매중지.
// ------------------------------------------------------------

export interface SupplyHeadroom {
  /** 흑자를 유지하는 최대 공급가(1개 단가). 이미 적자면 현재가보다 낮게 나온다 */
  maxSupplyPriceKrw: number;
  /** 현재 공급가 대비 여유 금액 (음수면 이미 적자) */
  headroomKrw: number;
  /** 현재 공급가 대비 여유 비율(%) */
  headroomPct: number;
  /** 이미 적자인가 */
  alreadyLoss: boolean;
}

export function supplyHeadroom(
  price: PriceBreakdown,
  cost: CostInputs,
  feeProfile?: MarketFeeProfile
): SupplyHeadroom {
  const now = computeProfit(price, cost, { feeProfile });
  const qty = packQty(cost);
  // 순이익이 0이 되는 지점까지 공급가를 올릴 수 있다. 수량이 여러 개면 나눠 갖는다.
  const maxSupplyPriceKrw = Math.max(0, won(cost.supplyPriceKrw + now.netProfitKrw / qty));
  const headroomKrw = maxSupplyPriceKrw - cost.supplyPriceKrw;
  return {
    maxSupplyPriceKrw,
    headroomKrw,
    headroomPct: cost.supplyPriceKrw > 0 ? (headroomKrw / cost.supplyPriceKrw) * 100 : 0,
    alreadyLoss: now.netProfitKrw < 0,
  };
}

// ------------------------------------------------------------
// 권장 판매가 역산
// ------------------------------------------------------------

export function recommendSellingPrice(
  cost: CostInputs,
  targetMarginPct: number,
  feeProfile?: MarketFeeProfile
): number {
  const fixed = fixedCostOf(cost);
  const v = variablePctOf(feeProfile) / 100;
  const denom = 1 - v - targetMarginPct / 100;
  if (denom <= 0) return Infinity;
  return Math.ceil(fixed / denom / 100) * 100;
}

// ------------------------------------------------------------
// 3단 시나리오 (지시서 §6-5) — 발주 판단은 conservative 기준
// ------------------------------------------------------------

/** 시나리오별 조정폭 (%). 보수적일수록 원가를 높게, 반품을 많게 본다. */
export interface ScenarioConfig {
  /** 보수적: 공급가 상승 여지(%) */
  supplyUpPct: number;
  /** 보수적: 반품률 배수 */
  returnRateMultiplier: number;
  /** 낙관적: 반품률 배수 */
  optimisticReturnMultiplier: number;
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  supplyUpPct: 10,
  returnRateMultiplier: 2,
  optimisticReturnMultiplier: 0.5,
};

function adjustCost(cost: CostInputs, scenario: Scenario, cfg: ScenarioConfig): CostInputs {
  if (scenario === "EXPECTED") return cost;
  if (scenario === "CONSERVATIVE") {
    return {
      ...cost,
      supplyPriceKrw: won(cost.supplyPriceKrw * (1 + cfg.supplyUpPct / 100)),
      returnModel: {
        ...cost.returnModel,
        ratePct: cost.returnModel.ratePct * cfg.returnRateMultiplier,
      },
    };
  }
  return {
    ...cost,
    returnModel: {
      ...cost.returnModel,
      ratePct: cost.returnModel.ratePct * cfg.optimisticReturnMultiplier,
    },
  };
}

export function computeScenarios(
  price: PriceBreakdown,
  cost: CostInputs,
  opts: ProfitOpts = {},
  cfg: ScenarioConfig = DEFAULT_SCENARIO
): ScenarioProfit {
  return {
    optimistic: computeProfit(price, adjustCost(cost, "OPTIMISTIC", cfg), opts),
    expected: computeProfit(price, adjustCost(cost, "EXPECTED", cfg), opts),
    conservative: computeProfit(price, adjustCost(cost, "CONSERVATIVE", cfg), opts),
  };
}

// ------------------------------------------------------------
// 옵션별 손익 (지시서 §6-4) — 대표 옵션만 보고 판단하지 않는다
// ------------------------------------------------------------

/** 옵션 하나의 실효 원가 */
export function costOfOption(product: Product, option: ProductOption): CostInputs {
  return {
    ...product.cost,
    supplyPriceKrw: option.supplyPriceKrw,
    shippingKrw: option.shippingKrw ?? product.cost.shippingKrw,
  };
}

/** 옵션 하나의 실효 판매가 */
export function priceOfOption(product: Product, option: ProductOption): PriceBreakdown {
  const list = product.price.listPriceKrw + (option.addPriceKrw || 0);
  const discount = product.price.discountKrw || 0;
  return {
    listPriceKrw: list,
    discountKrw: discount,
    buyerPaidKrw: Math.max(0, list - discount),
    buyerShippingKrw: product.price.buyerShippingKrw || 0,
  };
}

export function computeOptionProfits(
  product: Product,
  feeProfile?: MarketFeeProfile
): OptionProfitSummary {
  const opts: ProfitOpts = { feeProfile };

  // 옵션이 없으면 상품 자체를 1개 옵션처럼 취급
  const source: ProductOption[] = product.options.length > 0
    ? product.options
    : [{
        id: "__single__",
        name: "단일 옵션",
        supplyPriceKrw: product.cost.supplyPriceKrw,
        addPriceKrw: 0,
        supplierStock: product.supplierStock,
        enabled: true,
      }];

  const lines: OptionProfit[] = source.map((o) => {
    const cost = costOfOption(product, o);
    const price = priceOfOption(product, o);
    const profit = computeProfit(price, cost, opts);
    const grade: RiskGrade = product.legalBlock
      ? "BLOCKED"
      : gradeProfit(profit, {
          minMarginPct: product.minMarginPct,
          minProfitKrw: product.minProfitKrw,
          warningBufferPct: 5,
        });
    return {
      optionId: o.id,
      optionName: o.name,
      enabled: o.enabled,
      supplyPriceKrw: o.supplyPriceKrw,
      sellingPriceKrw: price.buyerPaidKrw,
      profit,
      grade,
    };
  });

  const active = lines.filter((l) => l.enabled);
  const lossCount = active.filter((l) => l.profit.netProfitKrw < 0).length;
  // ★ "최소 마진에 못 미친다"와 "최소 마진에 가깝다"는 다르다.
  //   한 숫자로 뭉치면 15%를 넘긴 옵션에도 "못 미칩니다"라고 쓰게 된다 — 사실이 아니다.
  const belowMinCount = active.filter(
    (l) => l.profit.netProfitKrw >= 0 && l.grade === "DANGER"
  ).length;
  const nearMinCount = active.filter(
    (l) => l.profit.netProfitKrw >= 0 && l.grade === "WARNING"
  ).length;
  const worst = active.length
    ? active.reduce((a, b) => (b.profit.netProfitKrw < a.profit.netProfitKrw ? b : a))
    : undefined;

  return { lines, lossCount, belowMinCount, nearMinCount, totalCount: active.length, worst };
}

/** 옵션 요약 → 상품 전체 한 줄 평 */
export function summarizeOptions(s: OptionProfitSummary): string {
  if (s.totalCount === 0) return "판매 중인 옵션이 없습니다.";
  if (s.lossCount > 0) {
    return `${s.totalCount}개 옵션 중 ${s.lossCount}개가 팔면 손해입니다.`;
  }
  if (s.belowMinCount > 0) {
    return `${s.totalCount}개 옵션 중 ${s.belowMinCount}개가 최소 마진에 못 미칩니다.`;
  }
  if (s.nearMinCount > 0) {
    return `${s.totalCount}개 옵션 중 ${s.nearMinCount}개가 최소 마진에 가깝습니다 — 팔 수는 있습니다.`;
  }
  return `${s.totalCount}개 옵션 모두 정상입니다.`;
}
