// ============================================================
// 손익 계산 엔진 (100% 결정론적 코드 — 프롬프트 §5, §64)
// 구매대행: 관세/수입부가세는 셀러원가에서 제외(고객 부담/면세).
// ============================================================

import type { CostInputs, ProfitResult } from "./types";
import { won, pct } from "./money";
import { computeCustoms } from "./customs";

export function computeProfit(
  sellingPriceKrw: number,
  cost: CostInputs,
  opts: { customsThresholdKrw: number; dutyRatePct: number }
): ProfitResult {
  const productPriceKrw = won(cost.sourcePrice * cost.exchangeRate);

  // 해외 결제/송금 수수료 = (물품가 + 국제배송비) × %
  const paymentFeeKrw = pct(
    productPriceKrw + cost.internationalShippingKrw,
    cost.paymentFeePct
  );
  // 플랫폼 수수료 / 국내 결제 수수료 = 판매가 × %
  const platformFeeKrw = pct(sellingPriceKrw, cost.platformFeePct);
  const domesticPaymentFeeKrw = pct(sellingPriceKrw, cost.domesticPaymentFeePct);

  // 셀러 총원가 (국내배송비 없음: 해외 직배송)
  const sellerCostKrw =
    productPriceKrw +
    cost.internationalShippingKrw +
    paymentFeeKrw +
    platformFeeKrw +
    domesticPaymentFeeKrw +
    cost.returnCostKrw +
    cost.csCostKrw +
    cost.adCostKrw;

  const netProfitKrw = sellingPriceKrw - sellerCostKrw;
  const marginPct =
    sellingPriceKrw > 0 ? (netProfitKrw / sellingPriceKrw) * 100 : 0;

  const variablePct = cost.platformFeePct + cost.domesticPaymentFeePct;
  const breakEvenPriceKrw =
    variablePct < 100 ? won(fixedCostOf(cost, productPriceKrw, paymentFeeKrw) / (1 - variablePct / 100)) : Infinity;

  // 구매대행 수수료(부가세 과세표준 후보) = 판매가 − 실제 해외구매비용
  const agencyFeeKrw = won(
    sellingPriceKrw - (productPriceKrw + cost.internationalShippingKrw + paymentFeeKrw)
  );

  const customs = computeCustoms(cost, opts.customsThresholdKrw, opts.dutyRatePct);

  return {
    sellingPriceKrw,
    productPriceKrw,
    paymentFeeKrw,
    platformFeeKrw,
    domesticPaymentFeeKrw,
    sellerCostKrw,
    netProfitKrw,
    marginPct,
    breakEvenPriceKrw,
    agencyFeeKrw,
    customs,
  };
}

/** 판매가에 비례하지 않는 고정비 합 */
function fixedCostOf(cost: CostInputs, productPriceKrw: number, paymentFeeKrw: number): number {
  return (
    productPriceKrw +
    cost.internationalShippingKrw +
    paymentFeeKrw +
    cost.returnCostKrw +
    cost.csCostKrw +
    cost.adCostKrw
  );
}

/**
 * 목표 순이익률(%)을 만족하는 권장 판매가 계산 (프롬프트 §19).
 * 검색 없이 원가·수수료·배송비만으로 역산.
 * @returns 권장 판매가(원). 목표 마진이 수수료 대비 과도해 불가능하면 Infinity.
 */
export function recommendSellingPrice(
  cost: CostInputs,
  targetMarginPct: number
): number {
  const productPriceKrw = won(cost.sourcePrice * cost.exchangeRate);
  const paymentFeeKrw = pct(
    productPriceKrw + cost.internationalShippingKrw,
    cost.paymentFeePct
  );
  const fixed = fixedCostOf(cost, productPriceKrw, paymentFeeKrw);
  const v = (cost.platformFeePct + cost.domesticPaymentFeePct) / 100;
  const denom = 1 - v - targetMarginPct / 100;
  if (denom <= 0) return Infinity; // 목표 마진 + 수수료가 100% 이상 → 불가능
  // 100원 단위로 올림(목표 마진 이상 보장)
  return Math.ceil(fixed / denom / 100) * 100;
}
