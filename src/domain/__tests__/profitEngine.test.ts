import { describe, it, expect } from "vitest";
import type { CostInputs } from "../types";
import { computeProfit, recommendSellingPrice } from "../profitEngine";
import { detectAnomaly } from "../anomaly";
import { computeCustoms } from "../customs";

// 원가/수수료를 통제하기 위한 헬퍼: 환율 1, 위안값 = 원화값
const cost = (over: Partial<CostInputs> = {}): CostInputs => ({
  productCostCny: 5000,
  exchangeRate: 1,
  internationalShippingKrw: 0,
  paymentFeePct: 0,
  platformFeePct: 0,
  domesticPaymentFeePct: 0,
  returnCostKrw: 0,
  csCostKrw: 0,
  adCostKrw: 0,
  ...over,
});

const OPTS = { customsThresholdKrw: 200000, dutyRatePct: 8 };

describe("손익 계산 엔진 (결정론적)", () => {
  it("TEST1: 원가 5,000 / 판매 7,000 → 순이익 +2,000 (정상)", () => {
    const r = computeProfit(7000, cost(), OPTS);
    expect(r.netProfitKrw).toBe(2000);
    expect(r.marginPct).toBeCloseTo(28.57, 1);
  });

  it("TEST2: 원가 7,500 / 판매 7,000 → 손실 -500", () => {
    const r = computeProfit(7000, cost({ productCostCny: 7500 }), OPTS);
    expect(r.netProfitKrw).toBe(-500);
    expect(r.netProfitKrw).toBeLessThan(0);
  });

  it("TEST3: 수수료 10% 반영 시 실제 순이익", () => {
    const r = computeProfit(7000, cost({ platformFeePct: 10 }), OPTS);
    // 플랫폼 수수료 700, 원가 5000 → 순이익 1,300
    expect(r.platformFeeKrw).toBe(700);
    expect(r.netProfitKrw).toBe(1300);
  });

  it("TEST4: 환율 +10% → 물품가 재계산", () => {
    const r = computeProfit(7000, cost({ exchangeRate: 1.1 }), OPTS);
    expect(r.productPriceKrw).toBe(5500);
  });

  it("TEST5: 국제배송비 +2,000 → 마진 하락", () => {
    const base = computeProfit(7000, cost(), OPTS);
    const withShip = computeProfit(7000, cost({ internationalShippingKrw: 2000 }), OPTS);
    expect(withShip.netProfitKrw).toBe(base.netProfitKrw - 2000);
  });

  it("손익분기 판매가 계산 (수수료 비례 포함)", () => {
    // 고정비 5000, 판매가비례수수료 10% → 손익분기 = 5000/0.9 ≈ 5556
    const r = computeProfit(7000, cost({ platformFeePct: 10 }), OPTS);
    expect(r.breakEvenPriceKrw).toBe(5556);
  });

  it("구매대행 수수료(AGENCY_FEE) = 판매가 − 해외구매비용", () => {
    const r = computeProfit(7000, cost({ internationalShippingKrw: 500 }), OPTS);
    // 7000 - (5000 + 500 + 0) = 1500
    expect(r.agencyFeeKrw).toBe(1500);
  });
});

describe("권장 판매가 계산 (§19, 검색 불필요)", () => {
  it("목표 마진 30% → 그 마진 이상을 보장하는 판매가 반환", () => {
    const c = cost({ platformFeePct: 10, internationalShippingKrw: 1000 });
    const price = recommendSellingPrice(c, 30);
    const r = computeProfit(price, c, OPTS);
    // 100원 올림이므로 목표 이상, 근접
    expect(r.marginPct).toBeGreaterThanOrEqual(30);
    expect(r.marginPct).toBeLessThan(31);
  });

  it("목표 마진이 수수료 대비 과도하면 계산 불가(Infinity)", () => {
    // 수수료 합 95% + 목표 10% → 불가능
    const c = cost({ platformFeePct: 95, domesticPaymentFeePct: 0 });
    expect(recommendSellingPrice(c, 10)).toBe(Infinity);
  });

  it("100원 단위로 반환", () => {
    const price = recommendSellingPrice(cost({ platformFeePct: 10 }), 25);
    expect(price % 100).toBe(0);
  });
});

describe("이상 가격 감지 (§25)", () => {
  it("TEST7: 5,000 → 7,500 (+50%) → 이상치", () => {
    expect(detectAnomaly(5000, 7500).isAnomaly).toBe(true);
  });
  it("5,000 → 5,100 (+2%) → 정상", () => {
    expect(detectAnomaly(5000, 5100).isAnomaly).toBe(false);
  });
  it("5,000 → 50,000 (급등) → 이상치", () => {
    expect(detectAnomaly(5000, 50000).isAnomaly).toBe(true);
  });
});

describe("관부가세 ($150 물품가격 기준, §3)", () => {
  it("면세 구간(18만원) → 관부가세 0", () => {
    const r = computeCustoms(cost({ productCostCny: 180000 }), 200000, 8);
    expect(r.overThreshold).toBe(false);
    expect(r.customerTaxBurdenKrw).toBe(0);
  });
  it("초과(21만원) → 관세·부가세 발생, 고객 부담", () => {
    const r = computeCustoms(cost({ productCostCny: 210000 }), 200000, 8);
    expect(r.overThreshold).toBe(true);
    expect(r.estimatedDutyKrw).toBe(16800); // 210000 × 8%
    expect(r.estimatedVatKrw).toBe(22680); // (210000+16800) × 10%
  });
  it("면세 판정은 물품가격 기준(운송비 제외)", () => {
    // 물품가 19만 + 배송비 3만 = 22만이지만, 물품가 기준 19만 → 면세
    const r = computeCustoms(
      cost({ productCostCny: 190000, internationalShippingKrw: 30000 }),
      200000,
      8
    );
    expect(r.overThreshold).toBe(false);
  });
});
