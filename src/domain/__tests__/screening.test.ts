import { describe, it, expect } from "vitest";
import {
  screenPriceGap, priceForMargin, buildSurveyList, parseMarketSamples,
  summarizeScreen, SURVEY_HEADER, MARKET_HEADER, type ScreenInput,
} from "../screening";

/** 수수료 10%, 최소 15%, 목표 30% */
const base = (landedCostKrw: number): ScreenInput => ({
  landedCostKrw,
  feePct: 10,
  minMarginPct: 15,
  targetMarginPct: 30,
});

const market = [12900, 15900, 17900, 19900, 24900];

describe("마진을 맞추는 판매가 역산", () => {
  it("매입 8,300 / 수수료 10% / 목표 30% → 13,900", () => {
    expect(priceForMargin(8300, 10, 30)).toBe(13900);
  });

  it("수수료+마진이 100%를 넘으면 계산 불가", () => {
    expect(priceForMargin(10000, 60, 50)).toBe(Infinity);
  });
});

describe("가격공간 — 소매가보다 충분히 싸게 살 수 있는가", () => {
  it("중간가 안에서 목표 마진이 나오면 여유 있음", () => {
    // 매입 8,300 → 목표가 13,900. 시장 중간 17,900
    const r = screenPriceGap(base(8300), market);
    expect(r.level).toBe("ROOM");
    expect(r.roomKrw).toBeGreaterThan(0);
  });

  it("중간가로는 빠듯하지만 상단이면 가능", () => {
    // 매입 12,000 → 목표가 20,000, 최소가 16,000. 중간 17,900 / 75% 19,900
    const r = screenPriceGap(base(12000), market);
    expect(r.level).toBe("TIGHT");
    expect(r.text).toContain("상단");
  });

  it("시장 상단에서도 최소 마진이 안 나오면 자리가 없다", () => {
    // 매입 20,000 → 최소가 26,700. 75%가 19,900이므로 불가
    const r = screenPriceGap(base(20000), market);
    expect(r.level).toBe("NO_ROOM");
    expect(r.text).toContain("시장 상위 75%");
  });

  it("★ 시장 중간가만으로 탈락시키지 않는다", () => {
    // 목표가가 중간가보다 높아도 상단에서 가능하면 TIGHT (탈락 아님)
    const r = screenPriceGap(base(12000), market);
    expect(r.level).not.toBe("NO_ROOM");
  });

  it("표본이 3개 미만이면 판단하지 않는다", () => {
    const r = screenPriceGap(base(8300), [15900, 17900]);
    expect(r.level).toBe("UNKNOWN");
    expect(r.text).toContain("판단하지 않습니다");
  });

  it("시세를 못 구하면 판단하지 않는다", () => {
    const r = screenPriceGap(base(8300), []);
    expect(r.level).toBe("UNKNOWN");
  });

  it("여유가 클수록 앞에 온다", () => {
    const cheap = screenPriceGap(base(5000), market);
    const pricey = screenPriceGap(base(11000), market);
    expect(cheap.rank).toBeLessThan(pricey.rank);
  });

  it("점수를 만들지 않는다 — 4단계만", () => {
    const r = screenPriceGap(base(8300), market);
    expect(["ROOM", "TIGHT", "NO_ROOM", "UNKNOWN"]).toContain(r.level);
    expect(r).not.toHaveProperty("score");
  });
});

describe("실제로 걸렀던 상품들", () => {
  it("우산: 매입 8,300 — 시장 12,900~24,900이면 자리가 있다", () => {
    expect(screenPriceGap(base(8300), market).level).toBe("ROOM");
  });

  it("우산: 같은 매입이라도 시장이 6,000~9,000이면 자리가 없다", () => {
    const r = screenPriceGap(base(8300), [5900, 6900, 7900, 8900, 9900]);
    expect(r.level).toBe("NO_ROOM");
  });

  it("크로스백: 10개 묶음이라 매입이 16,800이면 저가 시장에서 불가", () => {
    const r = screenPriceGap(base(16800), [8900, 9900, 11900, 12900, 14900]);
    expect(r.level).toBe("NO_ROOM");
  });
});

describe("앱 ⇄ 확장 시세 조사", () => {
  it("조사 목록을 만든다", () => {
    const s = buildSurveyList([
      { key: "c0", keyword: "차량용 틈새 수납함" },
      { key: "c1", keyword: "  " },
    ]);
    expect(s).toContain(SURVEY_HEADER);
    expect(s).toContain("c0|차량용 틈새 수납함");
    expect(s).not.toContain("c1");
  });

  it("수집된 시세를 읽는다", () => {
    const r = parseMarketSamples(`${MARKET_HEADER}\nc0|12,900 15,900 17,900\nc1|9900,11900`);
    expect(r).toHaveLength(2);
    expect(r[0].prices).toEqual([12900, 15900, 17900]);
    expect(r[1].prices).toEqual([9900, 11900]);
  });

  it("헤더가 없으면 빈 배열", () => {
    expect(parseMarketSamples("아무 텍스트")).toEqual([]);
  });

  it("결과를 집계한다", () => {
    const s = summarizeScreen([
      screenPriceGap(base(5000), market),
      screenPriceGap(base(12000), market),
      screenPriceGap(base(20000), market),
      screenPriceGap(base(8300), []),
    ]);
    expect(s).toMatchObject({ total: 4, room: 1, tight: 1, noRoom: 1, unknown: 1 });
  });
});
