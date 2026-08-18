import { describe, it, expect } from "vitest";
import {
  classify, analyzeCompetition, bandOf, positionOf, parseCompetitors,
  tokenize, COMP_HEADER, type CompetitorRaw,
} from "../competition";

const MINE = "3단 자동 우산 UV차단 암막 양산";

const c = (name: string, priceKrw: number, shippingKrw = 0): CompetitorRaw =>
  ({ name, priceKrw, shippingKrw });

describe("상품명 낱말 쪼개기", () => {
  it("의미 없는 낱말은 뺀다", () => {
    const t = tokenize("무료배송 특가 3단 자동 우산");
    expect(t).toContain("우산");
    expect(t).not.toContain("무료배송");
    expect(t).not.toContain("특가");
  });
});

describe("경쟁상품 분류 — 아무거나 비교하지 않는다", () => {
  it("핵심 낱말이 겹치면 직접 경쟁", () => {
    const r = classify(MINE, c("3단 자동 우산 UV차단 양산", 15900));
    expect(r.tier).toBe("DIRECT");
    expect(r.matched).toContain("우산");
  });

  it("용도는 같지만 사양이 다르면 유사 경쟁", () => {
    const r = classify(MINE, c("5단 수동 미니 우산", 9900));
    expect(r.tier).toBe("SIMILAR");
  });

  it("검색어만 겹치면 간접 — 가격 판단에서 뺀다", () => {
    const r = classify(MINE, c("차량용 우산꽂이 정리함", 4900));
    expect(r.tier).toBe("INDIRECT");
  });

  it("브랜드 상품은 한 단계 내린다", () => {
    const r = classify(MINE, c("닥스 3단 자동 우산 UV차단 양산", 39900));
    expect(r.tier).not.toBe("DIRECT");
  });

  it("브랜드 낱말을 잡아낸다", () => {
    expect(classify(MINE, c("나이키 3단 자동 우산", 29900)).hasBrand).toBe(true);
  });

  it("묶음/세트는 1개 상품과 직접 비교하지 않는다", () => {
    const r = classify(MINE, c("3단 자동 우산 UV차단 양산 5개 세트", 49900));
    expect(r.tier).not.toBe("DIRECT");
    expect(r.reason).toContain("묶음");
  });

  it("실질 구매가 = 상품가 + 소비자 배송비", () => {
    expect(classify(MINE, c("3단 자동 우산 양산", 17900, 3000)).effectiveKrw).toBe(20900);
  });

  it("배송비를 넣으면 순위가 뒤집힌다", () => {
    const a = classify(MINE, c("3단 자동 우산 양산 A", 19900, 0));
    const b = classify(MINE, c("3단 자동 우산 양산 B", 17900, 3000));
    expect(b.effectiveKrw).toBeGreaterThan(a.effectiveKrw);
  });
});

describe("가격대 — 통째로 평균내지 않는다", () => {
  const many: CompetitorRaw[] = [
    c("3단 자동 우산 UV차단 양산", 12900),
    c("3단 자동 우산 UV 양산", 15900),
    c("3단 자동 우산 암막 양산", 17900),
    c("자동 3단 우산 UV차단 양산", 19900),
    c("3단 우산 자동 UV차단 양산", 24900),
    c("5단 수동 우산", 6900),                    // 유사
    c("차량용 우산꽂이", 3900),                   // 간접
    c("닥스 3단 자동 우산 UV차단 양산", 59000),    // 브랜드
  ];

  it("직접 경쟁상품만으로 가격대를 만든다", () => {
    const a = analyzeCompetition(MINE, many);
    expect(a.directCount).toBe(5);
    expect(a.basis).toBe("DIRECT");
    expect(a.band!.lowest).toBe(12900);
    expect(a.band!.highest).toBe(24900);
    expect(a.band!.median).toBe(17900);
  });

  it("간접·브랜드 상품이 가격대를 오염시키지 않는다", () => {
    const a = analyzeCompetition(MINE, many);
    expect(a.band!.lowest).not.toBe(3900);   // 우산꽂이
    expect(a.band!.highest).not.toBe(59000); // 브랜드
  });

  it("직접 경쟁이 적으면 유사까지 합치고 그렇다고 알린다", () => {
    const a = analyzeCompetition(MINE, [
      c("3단 자동 우산 UV차단 양산", 15900),
      c("5단 수동 우산", 8900),
    ]);
    expect(a.enough).toBe(false);
    expect(a.basis).toBe("DIRECT_SIMILAR");
    expect(a.note).toContain("참고용");
  });

  it("비교할 상품이 없으면 가격대를 만들지 않는다", () => {
    const a = analyzeCompetition(MINE, [c("무선 청소기 거치대", 20000)]);
    expect(a.basis).toBe("NONE");
    expect(a.band).toBeUndefined();
    expect(a.note).toContain("가격만으로 판단하지 마세요");
  });

  it("신뢰도 %를 만들지 않는다 — 개수만 보여준다", () => {
    const a = analyzeCompetition(MINE, many);
    expect(a).not.toHaveProperty("confidence");
    expect(a.directCount + a.similarCount + a.indirectCount).toBe(many.length);
  });

  it("분위수를 계산한다", () => {
    const b = bandOf([10000, 12000, 14000, 16000, 18000])!;
    expect(b.p25).toBe(12000);
    expect(b.median).toBe(14000);
    expect(b.p75).toBe(16000);
  });
});

describe("내 가격의 위치 — 최저가일 필요는 없다", () => {
  const band = bandOf([12900, 15900, 17900, 19900, 24900])!;

  it("중간보다 싸면 매우 유리", () => {
    expect(positionOf(17000, band).position).toBe("VERY_GOOD");
  });

  it("중간보다 10% 안쪽이면 경쟁력 있음", () => {
    expect(positionOf(19500, band).position).toBe("GOOD");
  });

  it("20% 안쪽이면 판매 가능 — 탈락시키지 않는다", () => {
    const r = positionOf(21000, band);
    expect(r.position).toBe("OK");
    expect(r.advice).toContain("상세페이지");
  });

  it("30%를 넘으면 어렵다고 말하되 이유를 준다", () => {
    const r = positionOf(26000, band);
    expect(r.position).toBe("HARD");
    expect(r.advice).toBeTruthy();
  });

  it("시장 최고가보다 비싸면 얼마나 비싼지 알려준다", () => {
    expect(positionOf(30000, band).text).toContain("비쌉니다");
  });

  it("시장 최저가보다 싸면 더 받으라고 한다", () => {
    expect(positionOf(11000, band).text).toContain("더 받아도");
  });
});

describe("경쟁상품 목록 파싱", () => {
  it("확장이 보낸 목록을 읽는다", () => {
    const r = parseCompetitors([
      COMP_HEADER,
      "3단 자동우산 UV차단|15,900|0|스마트스토어",
      "5단 우산|9,900|3,000|쿠팡",
      "이름없음||",
    ].join("\n"));
    expect(r).toHaveLength(2);
    expect(r[0].priceKrw).toBe(15900);
    expect(r[1].shippingKrw).toBe(3000);
  });

  it("헤더가 없으면 빈 배열", () => {
    expect(parseCompetitors("아무 텍스트")).toEqual([]);
  });
});
