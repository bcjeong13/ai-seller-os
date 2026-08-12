import { describe, it, expect } from "vitest";
import type { Product, CostInputs } from "../types";
import { makeProduct } from "../factory";
import { orderPreflightCheck } from "../preflight";

const HOUR = 1000 * 60 * 60;

// 통제된 원가로 상품 생성 (환율 1, 위안=원)
function product(over: Partial<CostInputs> = {}, patch: Partial<Product> = {}): Product {
  const p = makeProduct({
    name: "테스트 상품",
    marketplace: "NAVER",
    sellingPriceKrw: 7000,
    productCostCny: 5000,
    exchangeRate: 1,
    minMarginPct: 15,
  });
  const cost: CostInputs = {
    productCostCny: 5000,
    exchangeRate: 1,
    internationalShippingKrw: 0,
    paymentFeePct: 0,
    platformFeePct: 5,
    domesticPaymentFeePct: 0,
    returnCostKrw: 0,
    csCostKrw: 0,
    adCostKrw: 0,
    ...over,
  };
  return { ...p, cost, lastCollectedAt: Date.now(), ...patch };
}

describe("★ ORDER_PREFLIGHT_CHECK (§2, §11)", () => {
  it("시나리오 A — 등록 시점: 정상 → ORDERABLE", () => {
    const p = product();
    const r = orderPreflightCheck(p, Date.now());
    // 원가 5000, 판매 7000, 플랫폼 5%(350) → 순이익 1650, 마진 23.6% → SAFE
    expect(r.profit.netProfitKrw).toBe(1650);
    expect(r.status).toBe("ORDERABLE");
    expect(r.canAutoOrder).toBe(true);
  });

  it("시나리오 A — 주문 시점 원가 5,000→7,500 급등 → LOSS_RISK, 자동발주 차단", () => {
    const p = product({ productCostCny: 7500 });
    const r = orderPreflightCheck(p, Date.now());
    expect(r.profit.netProfitKrw).toBeLessThan(0);
    expect(r.status).toBe("LOSS_RISK");
    expect(r.canAutoOrder).toBe(false);
    expect(r.requiresApproval).toBe(true);
  });

  it("시나리오 B — 가격 그대로, 공급처 품절 → OUT_OF_STOCK (발주 불가)", () => {
    const p = product({}, { supplierStock: "OUT_OF_STOCK" });
    const r = orderPreflightCheck(p, Date.now());
    expect(r.status).toBe("OUT_OF_STOCK");
    expect(r.canAutoOrder).toBe(false);
  });

  it("시나리오 C — 상품가 소폭(+2%), 국제배송비 1,500→4,000 급등 → 손실 포착", () => {
    const p = product({ productCostCny: 5100, internationalShippingKrw: 4000 });
    const r = orderPreflightCheck(p, Date.now());
    expect(r.profit.netProfitKrw).toBeLessThan(0);
    expect(r.status).toBe("LOSS_RISK");
  });

  it("시나리오 D — 데이터 30시간 노후 → DATA_UNAVAILABLE (수동 재확인)", () => {
    const now = Date.now();
    const p = product({}, { lastCollectedAt: now - 30 * HOUR });
    const r = orderPreflightCheck(p, now);
    expect(r.status).toBe("DATA_UNAVAILABLE");
    expect(r.canAutoOrder).toBe(false);
  });

  it("법적 차단 상품 → BLOCKED", () => {
    const p = product({}, { legalBlock: true, legalNote: "상표권 의심" });
    const r = orderPreflightCheck(p, Date.now());
    expect(r.status).toBe("BLOCKED");
  });

  it("13개 확인 항목을 모두 반환", () => {
    const r = orderPreflightCheck(product(), Date.now());
    expect(r.checks).toHaveLength(13);
  });
});
