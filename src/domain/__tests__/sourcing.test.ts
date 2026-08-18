import { describe, it, expect } from "vitest";
import { judgeRisk } from "../riskCategory";
import {
  judgeSourcing, summarizeSourcing, parseCandidates,
  LIST_HEADER, type SourcingCandidate,
} from "../sourcing";

const c = (over: Partial<SourcingCandidate> = {}): SourcingCandidate => ({
  key: "k",
  name: "차량용 틈새 수납함",
  supplyPriceKrw: 8900,
  shippingKrw: 2500,
  minOrderQty: 1,
  optionCount: 3,
  url: "https://domeggook.com/1",
  ...over,
});

describe("위험 카테고리 — 초보자 기준", () => {
  it("전기용품은 인증 부담을 알린다", () => {
    const r = judgeRisk("차량용 고속 충전기 USB");
    expect(r.level).toBe("HIGH");
    expect(r.category).toBe("전기용품");
    expect(r.check).toContain("KC");
  });

  it("어린이 제품을 잡는다", () => {
    expect(judgeRisk("유아 실리콘 젖병").level).toBe("HIGH");
  });

  it("브랜드·캐릭터를 잡는다", () => {
    expect(judgeRisk("카카오프렌즈 라이언 쿠션").level).toBe("HIGH");
    expect(judgeRisk("나이키 에어 운동화").level).toBe("HIGH");
  });

  it("식품·화장품·의료기기를 잡는다", () => {
    expect(judgeRisk("유기농 견과 간식").level).toBe("HIGH");
    expect(judgeRisk("수분 진정 토너").level).toBe("HIGH");
    expect(judgeRisk("가정용 혈압계").level).toBe("HIGH");
  });

  it("의류는 반품 때문에 확인 단계", () => {
    expect(judgeRisk("여성 니트 원피스").level).toBe("CHECK");
  });

  it("일반 잡화는 비교적 안전하되 확정하지 않는다", () => {
    const r = judgeRisk("차량용 틈새 수납함");
    expect(r.level).toBe("LOW");
    expect(r.check).toBeTruthy(); // "안전 확정"이라고 말하지 않는다
  });
});

describe("소싱 판정 — 조사할 가치가 있는가", () => {
  it("조건이 좋으면 후보로 남긴다", () => {
    const r = judgeSourcing(c());
    expect(r.level).toBe("GOOD");
    expect(r.reasons.some((x) => x.ok && x.text.includes("1개씩"))).toBe(true);
  });

  it("최소구매수량이 크면 거른다", () => {
    const r = judgeSourcing(c({ minOrderQty: 10 }));
    expect(r.level).toBe("SKIP");
    expect(r.skipReason).toBe("MIN_ORDER");
  });

  it("2개 묶음은 거르지 않고 확인 단계로", () => {
    expect(judgeSourcing(c({ minOrderQty: 2 })).level).toBe("CHECK");
  });

  it("배송비가 매입의 절반이면 거른다", () => {
    const r = judgeSourcing(c({ supplyPriceKrw: 5000, shippingKrw: 5000 }));
    expect(r.level).toBe("SKIP");
    expect(r.skipReason).toBe("SHIPPING_HEAVY");
  });

  it("단가가 너무 낮으면 거른다", () => {
    const r = judgeSourcing(c({ supplyPriceKrw: 1380, shippingKrw: 3000 }));
    expect(r.level).toBe("SKIP");
  });

  it("인증 부담이 큰 부류는 거른다", () => {
    const r = judgeSourcing(c({ name: "무선 보조배터리 10000mAh" }));
    expect(r.level).toBe("SKIP");
    expect(r.skipReason).toBe("RISK_CATEGORY");
  });

  it("옵션이 너무 많으면 확인 단계", () => {
    expect(judgeSourcing(c({ optionCount: 45 })).level).toBe("CHECK");
  });

  it("공급가를 못 읽으면 판단하지 않는다", () => {
    const r = judgeSourcing(c({ supplyPriceKrw: 0 }));
    expect(r.level).toBe("SKIP");
    expect(r.skipReason).toBe("NO_DATA");
    expect(r.reasons[0].text).toContain("판단하지 않습니다");
  });

  it("점수를 만들지 않는다 — 3단계만", () => {
    const r = judgeSourcing(c());
    expect(["GOOD", "CHECK", "SKIP"]).toContain(r.level);
    expect(r).not.toHaveProperty("score");
  });

  it("매입 원가에 최소구매수량을 곱한다", () => {
    const r = judgeSourcing(c({ supplyPriceKrw: 8900, minOrderQty: 2, shippingKrw: 2500 }));
    expect(r.landedCostKrw).toBe(8900 * 2 + 2500);
  });
});

describe("집계 — 무엇을 피해야 하는지 보여준다", () => {
  it("제외 사유를 많은 순으로 센다", () => {
    const list = [
      judgeSourcing(c({ key: "a", minOrderQty: 10 })),
      judgeSourcing(c({ key: "b", minOrderQty: 20 })),
      judgeSourcing(c({ key: "c", name: "유아 젖병" })),
      judgeSourcing(c({ key: "d" })),
    ];
    const s = summarizeSourcing(list);
    expect(s.total).toBe(4);
    expect(s.good).toHaveLength(1);
    expect(s.skipped).toHaveLength(3);
    expect(s.skipCounts[0]).toMatchObject({ reason: "MIN_ORDER", count: 2 });
  });

  it("좋은 후보가 먼저 오도록 정렬한다", () => {
    const list = [
      judgeSourcing(c({ key: "heavy", supplyPriceKrw: 6000, shippingKrw: 3500 })),
      judgeSourcing(c({ key: "light", supplyPriceKrw: 12000, shippingKrw: 2500 })),
    ];
    const s = summarizeSourcing(list);
    expect(s.good[0].key).toBe("light");
  });
});

describe("후보 목록 파싱", () => {
  it("확장이 보낸 목록을 읽는다", () => {
    const text = [
      LIST_HEADER,
      "차량용 수납함|8,900|2,500|1|3|https://domeggook.com/1",
      "유아 젖병|5,000|3,000|10|2|https://domeggook.com/2",
    ].join("\n");
    const r = parseCandidates(text);
    expect(r).toHaveLength(2);
    expect(r[0].supplyPriceKrw).toBe(8900);
    expect(r[1].minOrderQty).toBe(10);
  });

  it("헤더가 없으면 빈 배열", () => {
    expect(parseCandidates("그냥 텍스트")).toEqual([]);
  });

  it("칸이 모자란 줄은 건너뛴다", () => {
    expect(parseCandidates(`${LIST_HEADER}\n이름만|1000`)).toEqual([]);
  });
});
