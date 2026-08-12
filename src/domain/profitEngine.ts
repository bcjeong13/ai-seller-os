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
  const productPriceKrw = won(cost.productCostCny * cost.exchangeRate);

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

  // 손익분기 판매가: netProfit = 0 지점.
  // 고정비 / (1 - 판매가비례수수료%)
  const fixedCost =
    productPriceKrw +
    cost.internationalShippingKrw +
    paymentFeeKrw +
    cost.returnCostKrw +
    cost.csCostKrw +
    cost.adCostKrw;
  const variablePct = cost.platformFeePct + cost.domesticPaymentFeePct;
  const breakEvenPriceKrw =
    variablePct < 100 ? won(fixedCost / (1 - variablePct / 100)) : Infinity;

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
