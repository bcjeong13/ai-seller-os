import { describe, it, expect } from "vitest";
import { compareSuppliers, type SupplierOption } from "../supplierCompare";

let n = 0;
const sup = (o: Partial<SupplierOption>): SupplierOption => ({
  id: `s${++n}`,
  name: "공급처",
  supplyPriceKrw: 5000,
  shippingKrw: 3000,
  minOrderQty: 1,
  consignment: true,
  returnEasy: true,
  stockStable: true,
  ...o,
});

describe("상품별 공급처 비교 (§7-8)", () => {
  it("매입원가 = 단가×최소수량 + 배송비", () => {
    const r = compareSuppliers("테스트", [sup({ supplyPriceKrw: 4000, shippingKrw: 3000, minOrderQty: 3 })]);
    expect(r.evals[0].landedCostKrw).toBe(15000); // 4000×3 + 3000
  });

  it("최저가가 반품·재고 불안하면 조금 비싼 안정 공급처를 추천 (§8)", () => {
    const A = sup({ name: "A", supplyPriceKrw: 4000, shippingKrw: 3000, returnEasy: false, stockStable: false });
    const B = sup({ name: "B", supplyPriceKrw: 4300, shippingKrw: 3000, returnEasy: true, stockStable: true });
    const r = compareSuppliers("차량용 거치대", [A, B]);
    expect(r.best?.option.name).toBe("B");
    expect(r.cheapest?.option.name).toBe("A");
    expect(r.note).toContain("A");
  });

  it("조건이 같으면 최저가가 추천이자 최저가", () => {
    const A = sup({ name: "A", supplyPriceKrw: 4000 });
    const B = sup({ name: "B", supplyPriceKrw: 4300 });
    const r = compareSuppliers("상품", [A, B]);
    expect(r.best?.option.name).toBe("A");
    expect(r.note).toContain("안정적");
  });

  it("위탁 불가 공급처는 후보에서 제외", () => {
    const A = sup({ name: "A", supplyPriceKrw: 3000, consignment: false });
    const B = sup({ name: "B", supplyPriceKrw: 5000, consignment: true });
    const r = compareSuppliers("상품", [A, B]);
    expect(r.best?.option.name).toBe("B");
    expect(r.evals.find((e) => e.option.name === "A")?.flags.some((f) => f.includes("위탁"))).toBe(true);
  });

  it("무료배송 조건 충족 시 배송비 0", () => {
    const r = compareSuppliers("상품", [sup({ supplyPriceKrw: 10000, shippingKrw: 3000, freeShipOverKrw: 10000 })]);
    expect(r.evals[0].landedCostKrw).toBe(10000);
  });

  it("위탁 가능 공급처가 하나도 없으면 경고", () => {
    const r = compareSuppliers("상품", [sup({ consignment: false })]);
    expect(r.best).toBeUndefined();
    expect(r.note).toContain("위탁배송 가능한 공급처가 없");
  });
});
