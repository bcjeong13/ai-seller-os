import { describe, it, expect } from "vitest";
import { makeProduct, makeOption } from "../factory";
import { buildListingHtml, escapeHtml } from "../listingHtml";
import {
  cleanProductName, toMarketplaceProduct, toAllMarketplaces,
  reviewForListing, approvalValid, marketRule,
} from "../marketplaceProduct";
import { defaultFeeProfiles } from "../fees";
import type { Product } from "../types";

const fee = defaultFeeProfiles().find((f) => f.marketplace === "NAVER")!;

function sample(over: Partial<Parameters<typeof makeProduct>[0]> = {}): Product {
  return makeProduct({
    name: "차량용 무선 핸드폰 거치대",
    marketplace: "NAVER",
    listPriceKrw: 19900,
    supplyPriceKrw: 6000,
    shippingKrw: 2500,
    imageRightsConfirmed: true,
    specs: [
      { key: "재질", value: "ABS" },
      { key: "크기", value: "12cm" },
      { key: "제조국", value: "중국" },
      { key: "제조사", value: "○○산업" },
      { key: "도매처 재고", value: "410,261개" },
    ],
    options: [makeOption("블랙", 6000), makeOption("화이트", 6000, 500)],
    ...over,
  });
}

// ------------------------------------------------------------

describe("상품명 정리", () => {
  it("특수문자와 대괄호 홍보문구를 걷어낸다", () => {
    expect(cleanProductName("★[무료배송]★ 차량용 거치대 ♥", 100)).toBe("차량용 거치대");
  });

  it("도매처만 쓰는 말을 뺀다", () => {
    expect(cleanProductName("도매 대량 차량용 거치대", 100)).toBe("차량용 거치대");
  });

  it("같은 단어 반복을 지운다 — 검색 스팸으로 잡힌다", () => {
    expect(cleanProductName("거치대 차량용 거치대 거치대", 100)).toBe("거치대 차량용");
  });

  it("길이 제한에 맞춰 자른다", () => {
    expect(cleanProductName("가나다라마바사아자차카타파하", 5).length).toBeLessThanOrEqual(5);
  });
});

describe("마켓별 변환", () => {
  it("5개 마켓 모두로 변환된다", () => {
    expect(toAllMarketplaces(sample())).toHaveLength(5);
  });

  it("★ 배송비는 어느 마켓이든 선불이다", () => {
    for (const mp of toAllMarketplaces(sample())) {
      expect(mp.shippingPrepaid).toBe(true);
    }
  });

  it("마켓마다 상품명 길이 제한이 다르게 적용된다", () => {
    const long = sample({ name: "가".repeat(80) });
    const naver = toMarketplaceProduct(long, "NAVER");
    const gmarket = toMarketplaceProduct(long, "GMARKET");
    expect(naver.name.length).toBeGreaterThan(gmarket.name.length);
    expect(gmarket.name.length).toBeLessThanOrEqual(marketRule("GMARKET").nameMaxLen);
  });

  it("이미지 허용을 확인하지 않으면 등록을 막는다", () => {
    const mp = toMarketplaceProduct(sample({ imageRightsConfirmed: false }), "NAVER");
    expect(mp.issues.some((i) => i.level === "BLOCK" && i.text.includes("이미지"))).toBe(true);
  });

  it("판매 금지로 표시하면 등록을 막는다", () => {
    const p = { ...sample(), legalBlock: true };
    expect(toMarketplaceProduct(p, "NAVER").issues.some((i) => i.level === "BLOCK")).toBe(true);
  });

  it("네이버에는 중복 등록 주의를 붙인다", () => {
    const mp = toMarketplaceProduct(sample(), "NAVER");
    expect(mp.issues.some((i) => i.text.includes("도배"))).toBe(true);
  });
});

describe("등록 검토", () => {
  it("코드가 판정할 수 있는 것은 사람에게 묻지 않는다", () => {
    const r = reviewForListing(sample(), fee);
    const labels = r.auto.map((a) => a.label);
    expect(labels).toContain("판매가");
    expect(labels).toContain("옵션 손익");
    expect(labels).toContain("배송비");
    expect(labels.some((l) => l.startsWith("고시정보"))).toBe(true);
    // 전원이 없는 거치대는 전기용품이 아니다 — 억지로 분류하지 않는다
    expect(labels).toContain("고시정보 (기타 재화)");
  });

  it("★ 사람에게는 코드가 볼 수 없는 것만 묻는다 — 체크박스 2개", () => {
    const r = reviewForListing(sample(), fee);
    expect(r.askHuman).toHaveLength(2);
    expect(r.askHuman.map((a) => a.key).sort()).toEqual(["image", "wording"]);
  });

  it("역마진 옵션이 있으면 막는다", () => {
    const p = sample({ listPriceKrw: 7000 });
    const r = reviewForListing(p, fee);
    expect(r.blocked).toBe(true);
  });

  it("판매가가 없으면 막는다", () => {
    const r = reviewForListing(sample({ listPriceKrw: 0 }), fee);
    expect(r.blockers.some((b) => b.includes("판매가"))).toBe(true);
  });
});

describe("승인", () => {
  it("승인이 없으면 무효다", () => {
    expect(approvalValid(sample())).toBe(false);
  });

  it("★ 승인 뒤 가격이 바뀌면 승인이 무효가 된다", () => {
    const p = sample();
    const approved: Product = {
      ...p,
      listingApproval: {
        approvedAt: 0,
        approvedPriceKrw: p.price.buyerPaidKrw,
        imageChecked: true,
        wordingChecked: true,
      },
    };
    expect(approvalValid(approved)).toBe(true);

    const repriced: Product = { ...approved, price: { ...approved.price, buyerPaidKrw: 25000 } };
    expect(approvalValid(repriced)).toBe(false);
  });

  it("사람이 확인하지 않은 항목이 있으면 무효다", () => {
    const p = sample();
    const half: Product = {
      ...p,
      listingApproval: {
        approvedAt: 0,
        approvedPriceKrw: p.price.buyerPaidKrw,
        imageChecked: true,
        wordingChecked: false,
      },
    };
    expect(approvalValid(half)).toBe(false);
  });
});

// ------------------------------------------------------------

describe("상세페이지 HTML", () => {
  it("인라인 스타일만 쓴다 — 마켓 에디터가 style 태그를 지운다", () => {
    const { html } = buildListingHtml(sample());
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
    expect(html).toContain("style=");
  });

  it("★ 판매자 전용 정보가 고객에게 새지 않는다", () => {
    const { html } = buildListingHtml(sample());
    expect(html).not.toContain("410,261");
    expect(html).not.toContain("도매처 재고");
  });

  it("이미지 자리를 표시해 둔다", () => {
    const r = buildListingHtml(sample());
    expect(r.imageSlots).toBeGreaterThan(0);
    expect(r.html).toContain("이 자리에 이미지를 넣으세요");
  });

  it("옵션과 반품 안내가 들어간다", () => {
    const { html } = buildListingHtml(sample());
    expect(html).toContain("블랙");
    expect(html).toContain("반품");
    expect(html).toContain("7일");
  });

  it("고시정보가 비면 채우라고 알린다", () => {
    const r = buildListingHtml(sample());
    expect(r.todos.some((t) => t.includes("고시정보"))).toBe(true);
  });

  it("★ 같은 상품은 항상 같은 페이지 — 눌러도 결과가 흔들리지 않는다", () => {
    const p = sample();
    expect(buildListingHtml(p).html).toBe(buildListingHtml(p).html);
  });

  it("★ 상품이 다르면 골격이 달라진다 — 중복 콘텐츠 방어", () => {
    const a = buildListingHtml(sample({ name: "차량용 무선 핸드폰 거치대" })).html;
    const b = buildListingHtml(sample({ name: "캠핑 접이식 미니 테이블" })).html;
    const headingsOf = (h: string) => (h.match(/<h2[^>]*>([^<]+)</g) ?? []).join("|");
    expect(headingsOf(a)).not.toBe(headingsOf(b));
  });

  it("HTML을 깨뜨릴 수 있는 문자를 막는다", () => {
    expect(escapeHtml('<script>"x"</script>')).not.toContain("<script>");
    const { html } = buildListingHtml(sample({ name: "<script>alert(1)</script> 거치대" }));
    expect(html).not.toContain("<script>");
  });

  it("원본에 없는 효능을 만들지 않는다", () => {
    const { html } = buildListingHtml(sample());
    for (const w of ["효과", "치료", "완벽", "최고", "1위", "부담이 없"]) {
      expect(html).not.toContain(w);
    }
  });
});

describe("★ 인증·규제 부담 — 등록 단계에서도 검사한다", () => {
  it("소싱을 거치지 않고 담은 상품도 검사받는다", () => {
    const food = sample({ name: "유기농 올레샷 100% 올리브오일 1개 + 레몬즙 스틱 1개" });
    const r = reviewForListing(food, fee);
    const line = r.auto.find((a) => a.label === "인증·규제");
    expect(line?.ok).toBe(false);
    expect(line?.detail).toContain("식품");
  });

  it("위험군이면 사람에게 한 가지를 더 묻는다", () => {
    const food = sample({ name: "홍삼 스틱 30포" });
    expect(reviewForListing(food, fee).askHuman.map((q) => q.key)).toContain("risk");
  });

  it("일반 상품은 2가지만 묻는다", () => {
    expect(reviewForListing(sample(), fee).askHuman).toHaveLength(2);
  });

  it("★ 막지 않는다 — 신고를 마친 사람까지 못 팔면 안 된다", () => {
    const food = sample({ name: "올리브오일 500ml" });
    expect(reviewForListing(food, fee).blockers.some((b) => b.includes("식품"))).toBe(false);
  });

  it("★ 위험군은 확인 체크 없이 승인이 유효해지지 않는다", () => {
    const food = sample({ name: "올리브오일 500ml" });
    const half: Product = {
      ...food,
      listingApproval: {
        approvedAt: 0, approvedPriceKrw: food.price.buyerPaidKrw,
        imageChecked: true, wordingChecked: true,
      },
    };
    expect(approvalValid(half)).toBe(false);
    expect(approvalValid({ ...half, listingApproval: { ...half.listingApproval!, riskChecked: true } })).toBe(true);
  });
});
