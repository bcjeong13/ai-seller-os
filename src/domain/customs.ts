// ============================================================
// 관부가세 (구매대행 기준, 프롬프트 §3)
// - 면세 판정은 "물품가격" 기준. 국제운송비 분리(제외).
// - 초과 시 관세+부가세는 "고객(수입자)" 부담 → 셀러 손익에서 제외.
// - 추정치 + "확인 필요" 성격. 세율은 관세사 확인 대상.
// ============================================================

import type { CostInputs, CustomsResult } from "./types";
import { pct, won } from "./money";

export function computeCustoms(
  cost: CostInputs,
  thresholdKrw: number,
  dutyRatePct: number
): CustomsResult {
  const productPriceKrw = won(cost.sourcePrice * cost.exchangeRate);
  const overThreshold = productPriceKrw > thresholdKrw;

  if (!overThreshold) {
    return {
      overThreshold: false,
      productPriceKrw,
      thresholdKrw,
      estimatedDutyKrw: 0,
      estimatedVatKrw: 0,
      customerTaxBurdenKrw: 0,
      note: "면세 구간(목록통관). 물품가격 기준 면세 한도 이하.",
    };
  }

  // 과세가격 ≈ 물품가격 (운송비 분리 가정). 관세 = 과세가격 × 관세율.
  const duty = pct(productPriceKrw, dutyRatePct);
  // 부가세 = (과세가격 + 관세) × 10%
  const vat = pct(productPriceKrw + duty, 10);

  return {
    overThreshold: true,
    productPriceKrw,
    thresholdKrw,
    estimatedDutyKrw: duty,
    estimatedVatKrw: vat,
    customerTaxBurdenKrw: duty + vat,
    note:
      "⚠️ 면세 한도 초과 — 관세·부가세는 고객(수입자) 부담. 전환율·클레임 검토 필요. 세율은 관세사 확인 요망.",
  };
}
