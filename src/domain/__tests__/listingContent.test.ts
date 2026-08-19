import { describe, it, expect } from "vitest";
import { buildListingContent } from "../listingContent";
import { makeProduct, makeOption } from "../factory";
import type { Product } from "../types";

function product(over: Partial<Product> = {}): Product {
  const p = makeProduct({
    name: "논슬립 실리콘 주방 매트",
    marketplace: "NAVER",
    listPriceKrw: 12900,
    supplyPriceKrw: 4800,
    shippingKrw: 2800,
    options: [makeOption("블랙", 4800, 0), makeOption("화이트", 5000, 500)],
    specs: [
      { key: "재질", value: "실리콘" },
      { key: "크기", value: "40x30cm" },
      { key: "원산지", value: "중국" },
    ],
  });
  return { ...p, ...over };
}

describe("상세설명 생성 (§12 복원)", () => {
  it("상품명 후보를 만들고 50자 이하", () => {
    const c = buildListingContent(product());
    expect(c.nameCandidates.length).toBeGreaterThan(0);
    c.nameCandidates.forEach((n) => expect(n.length).toBeLessThanOrEqual(50));
  });

  it("스펙을 상품 정보 섹션으로", () => {
    const c = buildListingContent(product());
    const info = c.sections.find((s) => s.heading.includes("상품 정보"));
    expect(info?.body).toContain("재질: 실리콘");
  });

  it("활성 옵션만 옵션 안내에 (추가금 포함)", () => {
    const c = buildListingContent(product());
    const opt = c.sections.find((s) => s.heading.includes("옵션"));
    expect(opt?.body).toContain("화이트 (+500원)");
  });

  it("전자상거래법 7일 청약철회 항상 포함", () => {
    const c = buildListingContent(product());
    const ret = c.sections.find((s) => s.heading.includes("교환/반품"));
    expect(ret?.body).toContain("7일");
  });

  it("승인 안 된 도매처 반품정책은 고객 안내에 안 넣고 경고", () => {
    const p = product({
      supplierReturnPolicy: {
        freeReturnDays: 30, returnFeeKrw: 0, source: "supplier",
        capturedAt: 0, approvedForCustomer: false,
      },
    });
    const c = buildListingContent(p);
    const ret = c.sections.find((s) => s.heading.includes("교환/반품"));
    expect(ret?.body).not.toContain("30일");
    expect(c.warnings.some((w) => w.includes("승인"))).toBe(true);
  });

  it("승인된 반품정책은 고객 안내에 반영", () => {
    const p = product({
      supplierReturnPolicy: {
        freeReturnDays: 15, returnFeeKrw: 0, source: "supplier",
        capturedAt: 0, approvedForCustomer: true,
      },
    });
    const c = buildListingContent(p);
    const ret = c.sections.find((s) => s.heading.includes("교환/반품"));
    expect(ret?.body).toContain("15일");
    expect(ret?.body).toContain("무료");
  });

  it("과대광고 표현 경고", () => {
    const p = product({ name: "세계최초 100% 완벽 방수 매트" });
    const c = buildListingContent(p);
    expect(c.warnings.some((w) => w.includes("과대광고"))).toBe(true);
  });
});
