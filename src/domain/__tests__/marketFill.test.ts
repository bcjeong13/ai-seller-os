import { describe, it, expect } from "vitest";
import { buildFillBlock, parseFillBlock, asGuideText, FILL_HEADER, NOT_FILLED } from "../marketFill";
import { toMarketplaceProduct } from "../marketplaceProduct";
import { makeProduct, makeOption } from "../factory";

const mp = () =>
  toMarketplaceProduct(
    makeProduct({
      name: "기능성 학원책상 학교 공부방 책상",
      marketplace: "NAVER", listPriceKrw: 37600, supplyPriceKrw: 23000,
      shippingKrw: 6000, imageRightsConfirmed: true,
      options: [makeOption("아이보리", 23000)],
      specs: [{ key: "재질", value: "LPM(E1),스틸프레임" }],
    }),
    "NAVER"
  );

describe("자동 채우기 값", () => {
  it("확장이 쓸 칸을 담는다", () => {
    const f = parseFillBlock(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 20 })).fields;
    expect(f.name).toContain("학원책상");
    expect(f.price).toBe("37600");
    expect(f.stock).toBe("20");
    expect(f.detail).toContain("<div");
  });

  it("★ 줄바꿈이 있는 상세 HTML도 왕복한다", () => {
    const back = parseFillBlock(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 20 }));
    expect(back.site).toBe("NAVER");
    expect(back.fields.detail).toBe(mp().detailHtml);
    expect(back.fields.detail.split("\n").length).toBeGreaterThan(5);
  });

  it("★ 재고수량은 도매처 재고가 아니라 내가 정한 값이다", () => {
    const f = parseFillBlock(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 5 })).fields;
    expect(f.stock).toBe("5");
  });

  it("재고를 0 이하로 보내지 않는다", () => {
    const f = parseFillBlock(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 0 })).fields;
    expect(Number(f.stock)).toBeGreaterThan(0);
  });

  it("카테고리는 검색어만 보낸다 — 고르는 건 사람이 한다", () => {
    const f = parseFillBlock(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 20, categoryHint: "공부방 책상" })).fields;
    expect(f.category).toBe("공부방 책상");
  });

  it("값이 아니면 빈 결과", () => {
    expect(parseFillBlock("아무 텍스트").site).toBeUndefined();
    expect(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 20 })).toContain(FILL_HEADER);
  });

  it("★ 자동으로 안 되는 칸을 숨기지 않는다", () => {
    const labels = NOT_FILLED.map((n) => n.label);
    expect(labels).toContain("이미지");
    expect(labels).toContain("출고지 · 반품지");
    expect(labels).toContain("상품정보 제공고시");
  });
});

describe("배송·A/S 칸 — 화면을 펼쳐 읽은 뒤 추가한 것", () => {
  const withFees = () =>
    parseFillBlock(buildFillBlock(mp(), {
      marketplace: "NAVER", stockQty: 20,
      returnFeeKrw: 12000, exchangeFeeKrw: 12000, asPhone: "홍길동 010-1111-2222",
    })).fields;

  it("반품·교환 배송비를 보낸다 — 마켓 기본값을 두면 차액을 내가 낸다", () => {
    expect(withFees().returnFee).toBe("12000");
    expect(withFees().exchangeFee).toBe("12000");
  });

  it("A/S 전화번호는 내 설정값이다", () => {
    expect(withFees().asPhone).toBe("홍길동 010-1111-2222");
  });

  it("A/S 안내문에 연락처가 들어간다", () => {
    expect(withFees().asGuide).toContain("010-1111-2222");
    expect(withFees().asGuide).toContain("판매자가 처리합니다");
  });

  it("★ 할 수 없는 약속을 만들지 않는다", () => {
    for (const w of ["무상 수리", "평생", "100%", "언제든지"]) {
      expect(asGuideText("010-0000-0000")).not.toContain(w);
    }
  });

  it("A/S 연락처가 없으면 그 칸을 아예 보내지 않는다", () => {
    const f = parseFillBlock(buildFillBlock(mp(), { marketplace: "NAVER", stockQty: 20 })).fields;
    expect(f.asPhone).toBeUndefined();
    expect(f.asGuide).toBeUndefined();
  });

  it("반품비 0원도 보낸다 — 판매자 부담이라는 뜻이다", () => {
    const f = parseFillBlock(buildFillBlock(mp(), {
      marketplace: "NAVER", stockQty: 20, returnFeeKrw: 0,
    })).fields;
    expect(f.returnFee).toBe("0");
  });
});
