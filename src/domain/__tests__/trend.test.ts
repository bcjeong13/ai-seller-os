import { describe, it, expect } from "vitest";
import {
  readinessOf, diffSnapshots, priceOpportunities, relatedKeywords,
  categoryScores, labelOfList, idFromUrl, dayKeyOf,
  DAYS_FOR_RISING, DAYS_FOR_SUSTAINED, MIN_SAMPLE_FOR_SCORE,
  type ListSnapshot, type SourcingRun,
} from "../trend";
import { makeProduct } from "../factory";
import type { Product } from "../types";

const snap = (day: string, items: [string, number, number][]): ListSnapshot => ({
  at: new Date(day + "T09:00:00").getTime(),
  day,
  label: "선풍기",
  items: items.map(([i, p, r]) => ({ i, p, r, n: `상품 ${i}` })),
});

describe("데이터가 부족하면 부족하다고 말한다", () => {
  it("아무것도 없으면 판정하지 않는다", () => {
    const r = readinessOf(0);
    expect(r.canDetectNew).toBe(false);
    expect(r.note).toContain("기준일");
  });

  it("★ 하루치로 '상승 추세'라고 하지 않는다", () => {
    const r = readinessOf(1);
    expect(r.canDetectRising).toBe(false);
    expect(r.canDetectSustained).toBe(false);
  });

  it("이틀이면 새로 보이는 것은 알 수 있다", () => {
    expect(readinessOf(2).canDetectNew).toBe(true);
    expect(readinessOf(2).canDetectRising).toBe(false);
  });

  it("며칠이 더 필요한지 문장으로 알려준다", () => {
    expect(readinessOf(2).note).toContain(String(DAYS_FOR_RISING));
    expect(readinessOf(4).note).toContain(String(DAYS_FOR_SUSTAINED));
  });

  it("일주일이면 지속 상승까지 본다", () => {
    expect(readinessOf(7).canDetectSustained).toBe(true);
  });
});

describe("어제와 오늘의 차이", () => {
  const yesterday = snap("2026-08-19", [["1001", 9800, 0], ["1002", 5000, 1], ["1003", 7000, 8]]);
  const today = snap("2026-08-20", [["1001", 7500, 0], ["1003", 7000, 1], ["1004", 6000, 2]]);
  const first = new Map<string, number>();
  const days = new Map<string, number>();

  it("어제 없던 것을 새로 보인다고 한다", () => {
    const s = diffSnapshots(today, yesterday, first, days);
    const news = s.filter((x) => x.kind === "NEW");
    expect(news).toHaveLength(1);
    expect(news[0].subject).toBe("상품 1004");
    expect(news[0].evidence).toContain("2026-08-19");
  });

  it("도매가가 내린 것을 잡는다", () => {
    const drop = diffSnapshots(today, yesterday, first, days).find((x) => x.kind === "PRICE_DROP");
    expect(drop?.previousValue).toBe(9800);
    expect(drop?.value).toBe(7500);
    expect(drop?.unit).toBe("KRW");
  });

  it("목록에서 크게 올라온 것을 잡는다", () => {
    const up = diffSnapshots(today, yesterday, first, days).find((x) => x.kind === "RANK_UP");
    expect(up?.previousValue).toBe(9);
    expect(up?.value).toBe(2);
    expect(up?.unit).toBe("RANK");
  });

  it("★ 비교할 어제가 없으면 아무 신호도 만들지 않는다", () => {
    expect(diffSnapshots(today, undefined, first, days)).toEqual([]);
  });

  it("★ 점수나 신뢰도를 만들지 않는다 — 관찰 일수만", () => {
    const s = diffSnapshots(today, yesterday, first, days)[0];
    expect(s).not.toHaveProperty("confidence");
    expect(s).not.toHaveProperty("score");
    expect(typeof s.observedDays).toBe("number");
  });
});

describe("내 상품에서 나오는 기회 — 외부 데이터가 필요 없다", () => {
  function withHistory(prices: number[], minOrderQty = 1): Product {
    const p = makeProduct({
      name: "차량용 무선 거치대", marketplace: "NAVER",
      listPriceKrw: 19900, supplyPriceKrw: prices[prices.length - 1],
      shippingKrw: 2500, minOrderQty,
    });
    p.costHistory = prices.map((v, i) => ({
      at: i, supplyPriceKrw: v, shippingKrw: 2500, landedCostKrw: v + 2500,
    }));
    return p;
  }

  it("가장 비쌌을 때보다 싸지면 기회로 본다", () => {
    const s = priceOpportunities([withHistory([9800, 9800, 7500])]);
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe("PRICE_DROP");
    expect(s[0].previousValue).toBe(9800);
    expect(s[0].value).toBe(7500);
  });

  it("★ 조금씩 내린 것도 놓치지 않는다 — 직전만 보지 않는다", () => {
    const s = priceOpportunities([withHistory([10000, 9500, 9000, 8500])]);
    expect(s[0].previousValue).toBe(10000);
  });

  it("묶음 상품은 1주문당 얼마인지 같이 알려준다", () => {
    const s = priceOpportunities([withHistory([10000, 8000], 3)]);
    expect(s[0].evidence).toContain("1주문(3개)당");
    expect(s[0].evidence).toContain("6,000원");
  });

  it("잡음 수준의 변화는 신호로 치지 않는다", () => {
    expect(priceOpportunities([withHistory([10000, 9950])])).toEqual([]);
  });

  it("오른 것은 기회가 아니다", () => {
    expect(priceOpportunities([withHistory([7500, 9800])])).toEqual([]);
  });

  it("이력이 하나뿐이면 비교하지 않는다", () => {
    expect(priceOpportunities([withHistory([9800])])).toEqual([]);
  });

  it("많이 내린 것부터 보여준다", () => {
    const s = priceOpportunities([withHistory([10000, 9000]), withHistory([20000, 12000])]);
    expect(s[0].previousValue! - s[0].value!).toBeGreaterThan(s[1].previousValue! - s[1].value!);
  });
});

describe("내 카테고리 주변 검색어", () => {
  const mine = [
    makeProduct({ name: "차량용 무선 핸드폰 거치대", marketplace: "NAVER", listPriceKrw: 1, supplyPriceKrw: 1 }),
    makeProduct({ name: "차량용 컵홀더 수납", marketplace: "NAVER", listPriceKrw: 1, supplyPriceKrw: 1 }),
    makeProduct({ name: "캠핑 접이식 테이블", marketplace: "NAVER", listPriceKrw: 1, supplyPriceKrw: 1 }),
  ];

  it("여러 상품에 걸친 낱말이 먼저 온다", () => {
    expect(relatedKeywords(mine)[0].keyword).toBe("차량용");
    expect(relatedKeywords(mine)[0].fromCount).toBe(2);
  });

  it("어느 상품에서 나왔는지 근거를 남긴다", () => {
    const k = relatedKeywords(mine).find((x) => x.keyword === "차량용");
    expect(k?.examples.length).toBeGreaterThan(0);
    expect(k?.examples[0]).toContain("차량용");
  });

  it("상품이 없으면 빈 목록", () => {
    expect(relatedKeywords([])).toEqual([]);
  });
});

describe("카테고리 성적표", () => {
  const run = (label: string, total: number, good: number, check: number, topSkip?: string): SourcingRun => ({
    at: 0, day: "2026-08-20", label, total, good, check, skip: total - good - check, topSkip,
  });

  it("★ 표본이 적으면 성적을 내지 않는다", () => {
    expect(categoryScores([run("차량용", 5, 1, 1)])).toEqual([]);
  });

  it("통과율이 낮으면 다른 쪽을 보라고 한다", () => {
    const s = categoryScores([run("차량용", 100, 2, 3, "마진 부족")]);
    expect(s[0].passRatePct).toBe(5);
    expect(s[0].note).toContain("다른 쪽");
    expect(s[0].note).toContain("마진 부족");
  });

  it("통과율이 높으면 계속 보라고 한다", () => {
    const s = categoryScores([run("캠핑", 50, 10, 10)]);
    expect(s[0].passRatePct).toBe(40);
    expect(s[0].note).toContain("계속");
  });

  it("여러 번 심사한 것을 합친다", () => {
    const s = categoryScores([run("캠핑", 10, 2, 1), run("캠핑", 10, 3, 1)]);
    expect(s[0].total).toBe(20);
    expect(s[0].runs).toBe(2);
  });

  it("이름을 못 붙인 것은 성적표에 넣지 않는다", () => {
    expect(categoryScores([run("미지정", 100, 20, 20)])).toEqual([]);
  });

  it("표본 기준이 문서와 맞다", () => {
    expect(categoryScores([run("x", MIN_SAMPLE_FOR_SCORE - 1, 5, 5)])).toEqual([]);
    expect(categoryScores([run("x", MIN_SAMPLE_FOR_SCORE, 5, 5)])).toHaveLength(1);
  });
});

describe("목록 이름 붙이기 — 사용자에게 묻지 않는다", () => {
  it("절반 이상에 나오는 낱말을 이름으로 쓴다", () => {
    expect(labelOfList([
      "차량용 무선 거치대", "차량용 컵홀더", "차량용 방향제", "미니 선풍기",
    ])).toBe("차량용");
  });

  it("공통 낱말이 없으면 미지정", () => {
    expect(labelOfList(["가위", "볼펜", "우산", "장갑"])).toBe("미지정");
  });
});

describe("잡다한 것", () => {
  it("주소에서 상품 번호를 뽑는다", () => {
    expect(idFromUrl("https://www.domeggook.com/63994067")).toBe("63994067");
    expect(idFromUrl("")).toBe("");
  });

  it("날짜 키는 하루 단위다", () => {
    const a = dayKeyOf(new Date("2026-08-20T01:00:00").getTime());
    const b = dayKeyOf(new Date("2026-08-20T23:00:00").getTime());
    expect(a).toBe(b);
    expect(a).toBe("2026-08-20");
  });
});

describe("★ 대조용 id는 날이 바뀌어도 같아야 한다", () => {
  it("자리 번호로 대조하면 안 된다 — 내일이면 다른 상품을 가리킨다", () => {
    // 어제: A가 0번, B가 1번 / 오늘: 순서가 뒤집힘
    const y: ListSnapshot = {
      at: 1, day: "2026-08-19", label: "x",
      items: [{ i: "77770001", p: 100, r: 0 }, { i: "77770002", p: 200, r: 1 }],
    };
    const t: ListSnapshot = {
      at: 2, day: "2026-08-20", label: "x",
      items: [{ i: "77770002", p: 200, r: 0 }, { i: "77770001", p: 100, r: 1 }],
    };
    // 자리가 바뀌었을 뿐 새 상품은 없다
    expect(diffSnapshots(t, y, new Map(), new Map()).filter((s) => s.kind === "NEW")).toEqual([]);
  });

  it("주소가 짧아 번호를 못 뽑으면 주소 자체를 쓴다", () => {
    expect(idFromUrl("https://www.domeggook.com/2001")).toBe("");
  });
});
