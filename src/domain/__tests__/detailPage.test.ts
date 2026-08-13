import { describe, it, expect } from "vitest";
import { generateDetailPage, type DetailPageInput } from "../detailPage";

const base: DetailPageInput = {
  productName: "차량용 무선 핸드폰 거치대",
  marketplace: "NAVER",
  category: "차량용품",
  target: "20~40대 운전자",
  features: ["강력한 흡착력", "360도 회전", "무선충전 지원"],
  options: ["블랙", "화이트"],
  benefits: {
    freeShipping: true,
    returnDays: 30,
    freeReturn: true,
    exchange: true,
    qualityGuarantee: true,
    gift: "",
  },
  deliveryMinDays: 7,
  deliveryMaxDays: 14,
  isOverseasAgent: true,
};

describe("상세페이지 생성 (§41)", () => {
  it("상품명 후보를 만들고 50자 이하로 제한", () => {
    const out = generateDetailPage(base);
    expect(out.nameCandidates.length).toBeGreaterThan(0);
    out.nameCandidates.forEach((n) => expect(n.length).toBeLessThanOrEqual(50));
  });

  it("구매대행 배송기간(7~14일)을 배송 안내에 자동 포함", () => {
    const out = generateDetailPage(base);
    expect(out.shippingNotice).toContain("7~14일");
    expect(out.shippingNotice).toContain("해외구매대행");
  });

  it("법정 7일 청약철회 안내를 항상 포함", () => {
    const out = generateDetailPage(base);
    expect(out.returnNotice).toContain("7일");
  });

  it("30일 무료반품 시 반품비 부담 경고", () => {
    const out = generateDetailPage(base);
    expect(out.warnings.some((w) => w.includes("30일 무료반품"))).toBe(true);
  });

  it("과대광고 위험 표현 감지", () => {
    const out = generateDetailPage({ ...base, features: ["세계최초 100% 완벽 방수"] });
    expect(out.warnings.some((w) => w.includes("과대광고"))).toBe(true);
  });

  it("키워드는 중복 없이 생성", () => {
    const out = generateDetailPage(base);
    const set = new Set(out.keywords.map((k) => k.toLowerCase()));
    expect(set.size).toBe(out.keywords.length);
  });

  it("개인통관고유부호 FAQ 포함 (구매대행)", () => {
    const out = generateDetailPage(base);
    expect(out.faq.some((f) => f.q.includes("개인통관"))).toBe(true);
  });
});
