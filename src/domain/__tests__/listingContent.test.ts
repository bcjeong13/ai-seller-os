import { describe, it, expect } from "vitest";
import { buildListingContent, isSellerOnlySpec } from "../listingContent";
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

// ============================================================
// ★ 셀러 전용 정보가 고객용 상세설명에 새면 안 된다.
//   확장은 도매처 재고·최소구매수량·공급사까지 수집한다.
//   그대로 내보내면 고객이 도매처를 알아내고 이탈한다.
// ============================================================
describe("셀러 전용 정보 차단", () => {
  const sellerSpecs = [
    { key: "재질", value: "실리콘" },
    { key: "도매처 재고", value: "410,261개" },
    { key: "최소구매수량", value: "1개" },
    { key: "제조사", value: "크리어유통" },
    { key: "모델명", value: "고리형UV우산" },
  ];

  it("셀러가 볼 항목을 가려낸다", () => {
    expect(isSellerOnlySpec("도매처 재고")).toBe(true);
    expect(isSellerOnlySpec("최소구매수량")).toBe(true);
    expect(isSellerOnlySpec("제조사")).toBe(true);
    expect(isSellerOnlySpec("재질")).toBe(false);
    expect(isSellerOnlySpec("사이즈")).toBe(false);
  });

  it("상세설명 본문에 도매처 정보가 들어가지 않는다", () => {
    const c = buildListingContent(product({ specs: sellerSpecs }));
    expect(c.plainText).toContain("실리콘");
    expect(c.plainText).not.toContain("410,261");
    expect(c.plainText).not.toContain("크리어유통");
    expect(c.plainText).not.toContain("최소구매수량");
  });

  it("키워드에도 섞이지 않는다", () => {
    const c = buildListingContent(product({ specs: sellerSpecs }));
    expect(c.keywords.some((k) => k.includes("크리어유통"))).toBe(false);
  });

  it("상품명 후보에 제조사·재고를 붙이지 않는다", () => {
    const c = buildListingContent(product({ specs: sellerSpecs }));
    c.nameCandidates.forEach((n) => {
      expect(n).not.toContain("크리어유통");
      expect(n).not.toContain("410,261");
    });
  });

  it("무엇을 뺐는지 알려준다", () => {
    const c = buildListingContent(product({ specs: sellerSpecs }));
    expect(c.warnings.some((w) => w.includes("도매처가 드러납니다"))).toBe(true);
  });
});
