import { describe, it, expect } from "vitest";
import type { MarketFeeProfile, Product, MarketPrice } from "../types";
import { makeProduct, makeOption } from "../factory";
import { judgeProduct } from "../verdict";

const fee: MarketFeeProfile = {
  marketplace: "OTHER",
  rules: [{ id: "r", label: "판매수수료", basis: "PRODUCT", pct: 10, enabled: true, verified: true }],
};

/** 공급가 5,500 + 배송비 2,800 = 매입 8,300 */
function base(overrides: Partial<Product> = {}): Product {
  const p = makeProduct({
    name: "테스트 우산",
    marketplace: "OTHER",
    listPriceKrw: 14000,
    supplyPriceKrw: 5500,
    shippingKrw: 2800,
    minMarginPct: 15,
    imageRightsConfirmed: true,
    returnCostKrw: 4000,
    returnRatePct: 2,
  });
  return { ...p, ...overrides };
}

const market = (typical: number, lowest = typical - 2000, highest = typical + 2000): MarketPrice => ({
  keyword: "3단 자동우산",
  lowestKrw: lowest,
  typicalKrw: typical,
  highestKrw: highest,
  source: "manual",
  checkedAt: Date.now(),
});

describe("상품 심사 — 팔아도 되는가", () => {
  it("시장가를 모르면 추천하지 않고 확인을 요구한다", () => {
    const r = judgeProduct(base(), fee);
    expect(r.verdict).toBe("CHECK");
    expect(r.unknown).toContain("시장 가격");
    expect(r.actions).toContain("시장 가격 확인하기");
  });

  it("목표가가 시장 가격대 안이면 추천", () => {
    const r = judgeProduct(base({ marketPrice: market(15000) }), fee);
    expect(r.verdict).toBe("RECOMMEND");
    expect(r.reasons.some((x) => x.ok && x.text.includes("시장 가격대 안"))).toBe(true);
  });

  it("최소 판매가가 시장 대표가보다 높으면 비추천", () => {
    // 매입 8,300 + 수수료 10% → 최소 판매가가 1만원대. 시장 대표가 9,000이면 불가능
    const r = judgeProduct(base({ marketPrice: market(9000, 8000, 10000) }), fee);
    expect(r.verdict).toBe("REJECT");
    expect(r.reasons.some((x) => !x.ok && x.text.includes("높습니다"))).toBe(true);
    expect(r.actions).toContain("이 상품 제외");
  });

  // ★ 최저가일 필요는 없다 — 대표가보다 비싸도 시장 안쪽이면 정상 전략이다
  it("대표가보다 비싸도 시장 최고가 안쪽이면 문제 삼지 않는다", () => {
    // 시장 11,000~16,000 (대표 13,000), 목표가 14,000
    const r = judgeProduct(base({ marketPrice: market(13000, 11000, 16000) }), fee);
    expect(r.verdict).toBe("RECOMMEND");
    expect(r.reasons.some((x) => x.ok && x.text.includes("최저가 경쟁"))).toBe(true);
  });

  it("대표가로는 마진이 안 나오지만 상위 가격대면 가능 — 확인 단계", () => {
    // 최소 판매가 약 11,000. 대표 10,000 / 최고 20,000
    const r = judgeProduct(base({ marketPrice: market(10000, 8000, 20000) }), fee);
    expect(r.verdict).toBe("CHECK");
    expect(r.reasons.some((x) => !x.ok && x.text.includes("상위 가격대"))).toBe(true);
  });

  it("시장 최고가보다도 비싸야 마진이 나오면 비추천", () => {
    const r = judgeProduct(base({ marketPrice: market(9000, 8000, 10000) }), fee);
    expect(r.verdict).toBe("REJECT");
    expect(r.reasons.some((x) => !x.ok && x.text.includes("가장 비싼"))).toBe(true);
  });

  it("보수적으로 적자면 비추천", () => {
    const p = base({ marketPrice: market(15000) });
    const r = judgeProduct({ ...p, price: { ...p.price, listPriceKrw: 8500, buyerPaidKrw: 8500 } }, fee);
    expect(r.verdict).toBe("REJECT");
    expect(r.conservativeProfitKrw).toBeLessThan(0);
  });

  it("역마진 옵션이 있으면 비추천", () => {
    const p = base({ marketPrice: market(15000) });
    const r = judgeProduct({
      ...p,
      options: [makeOption("정상", 5500, 0), makeOption("대형", 30000, 0)],
    }, fee);
    expect(r.verdict).toBe("REJECT");
    expect(r.reasons.some((x) => !x.ok && x.text.includes("팔면 손해"))).toBe(true);
  });

  it("판매 차단 상품은 무조건 비추천", () => {
    const r = judgeProduct(base({ marketPrice: market(15000), legalBlock: true, legalNote: "KC 미인증" }), fee);
    expect(r.verdict).toBe("REJECT");
    expect(r.reasons.some((x) => x.text.includes("KC 미인증"))).toBe(true);
  });

  it("도매처 품절이면 비추천", () => {
    const r = judgeProduct(base({ marketPrice: market(15000), supplierStock: "OUT_OF_STOCK" }), fee);
    expect(r.verdict).toBe("REJECT");
  });

  it("이미지 권한 미확인이면 추천까지 가지 않는다", () => {
    const r = judgeProduct(base({ marketPrice: market(15000), imageRightsConfirmed: false }), fee);
    expect(r.verdict).toBe("CHECK");
    expect(r.unknown).toContain("이미지 사용 허용 여부");
  });

  it("판단 근거를 반드시 제공한다", () => {
    const r = judgeProduct(base({ marketPrice: market(15000) }), fee);
    expect(r.reasons.length).toBeGreaterThan(0);
    r.reasons.forEach((x) => expect(x.text.length).toBeGreaterThan(0));
  });

  it("점수를 만들지 않는다 — 3단계만", () => {
    const r = judgeProduct(base({ marketPrice: market(15000) }), fee);
    expect(["RECOMMEND", "CHECK", "REJECT"]).toContain(r.verdict);
    expect(r).not.toHaveProperty("score");
  });

  it("최소구매수량 2개면 원가가 2배로 잡힌다", () => {
    const p = base({ marketPrice: market(15000) });
    const one = judgeProduct(p, fee);
    const two = judgeProduct({ ...p, cost: { ...p.cost, minOrderQty: 2 } }, fee);
    // 매입 = 5,500×1 + 2,800 = 8,300  →  5,500×2 + 2,800 = 13,800
    expect(one.landedCostKrw).toBe(8300);
    expect(two.landedCostKrw).toBe(13800);
  });

  it("최소구매수량 2~3개는 묶음 판매를 조건으로 확인 단계", () => {
    const p = base({ marketPrice: market(30000) });
    const r = judgeProduct({
      ...p,
      price: { ...p.price, listPriceKrw: 30000, buyerPaidKrw: 30000 },
      cost: { ...p.cost, minOrderQty: 2 },
    }, fee);
    expect(r.verdict).toBe("CHECK");
    expect(r.reasons.some((x) => !x.ok && x.text.includes("1+1"))).toBe(true);
  });

  it("최소구매수량 4개 이상은 위탁판매 불가 — 비추천", () => {
    const p = base({ marketPrice: market(120000) });
    const r = judgeProduct({
      ...p,
      price: { ...p.price, listPriceKrw: 120000, buyerPaidKrw: 120000 },
      cost: { ...p.cost, minOrderQty: 10 },
    }, fee);
    expect(r.verdict).toBe("REJECT");
    expect(r.reasons.some((x) => !x.ok && x.text.includes("무재고 위탁판매가 안 됩니다"))).toBe(true);
    expect(r.actions).toContain("이 상품 제외");
  });

  it("최소구매수량 1개면 재고 부담 없음으로 표시", () => {
    const r = judgeProduct(base({ marketPrice: market(15000) }), fee);
    expect(r.reasons.some((x) => x.ok && x.text.includes("재고 부담 없음"))).toBe(true);
  });

  it("반품률이 추정치면 미확인으로 표시한다", () => {
    const r = judgeProduct(base({ marketPrice: market(15000) }), fee);
    expect(r.unknown.some((u) => u.includes("반품률"))).toBe(true);
  });
});
