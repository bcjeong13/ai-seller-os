import { describe, it, expect } from "vitest";
import type { MarketFeeProfile, Product } from "../types";
import { makeProduct } from "../factory";
import {
  judgeWatch, watchIntervalHours, needsCheck,
  buildWatchList, parseWatchResults, summarizeWatch, WATCH_HEADER, RESULT_HEADER,
} from "../watch";

const fee: MarketFeeProfile = {
  marketplace: "OTHER",
  rules: [{ id: "r", label: "판매수수료", basis: "PRODUCT", pct: 10, enabled: true, verified: true }],
};

/** 공급 5,000 / 배송 0 / 판매 10,000 → 한계선 약 8,800 */
function p(over: Partial<Product> = {}): Product {
  const base = makeProduct({
    name: "감시 대상",
    marketplace: "OTHER",
    listPriceKrw: 10000,
    supplyPriceKrw: 5000,
    shippingKrw: 0,
    minMarginPct: 15,
  });
  return { ...base, ...over };
}

describe("상시 감시 — 위험 판정", () => {
  it("확인 실패는 절대 정상으로 처리하지 않는다", () => {
    const r = judgeWatch(p(), undefined, "UNKNOWN", fee);
    expect(r.level).toBe("FAILED");
    expect(r.message).toContain("읽지 못했");
    expect(r.action).toBeTruthy();
  });

  it("품절은 가격보다 먼저 잡는다", () => {
    const r = judgeWatch(p(), 5000, "OUT_OF_STOCK", fee);
    expect(r.level).toBe("RISK");
    expect(r.message).toContain("품절");
    expect(r.action).toBe("판매 중지");
  });

  it("한계선을 넘으면 위험", () => {
    const r = judgeWatch(p(), 9500, "IN_STOCK", fee);
    expect(r.level).toBe("RISK");
    expect(r.message).toContain("넘었습니다");
    expect(r.headroomKrw).toBeLessThan(0);
  });

  it("한계선에 가까우면 주의", () => {
    // 한계선 8,800 근처 — 여유 15% 미만
    const r = judgeWatch(p(), 8200, "IN_STOCK", fee);
    expect(r.level).toBe("WATCH");
    expect(r.message).toContain("남았습니다");
  });

  it("여유가 넉넉하면 조용히 넘어간다", () => {
    const r = judgeWatch(p(), 5000, "IN_STOCK", fee);
    expect(r.level).toBe("SAFE");
    expect(r.message).toBe("변동 없음");
  });

  it("올랐어도 여유가 있으면 안전 — 다만 얼마 남았는지 알려준다", () => {
    const r = judgeWatch(p(), 6000, "IN_STOCK", fee);
    expect(r.level).toBe("SAFE");
    expect(r.message).toContain("여유");
  });

  it("절대 상승률이 아니라 한계선으로 판단한다", () => {
    // +60% 상승이지만 아직 한계선(8,800) 아래 → 위험 아님
    const big = judgeWatch(p(), 8000, "IN_STOCK", fee);
    expect(big.level).not.toBe("RISK");
    // +2% 상승이지만 이미 한계선 위 → 위험
    const thin = p({ price: { listPriceKrw: 6000, discountKrw: 0, buyerPaidKrw: 6000, buyerShippingKrw: 0 } });
    expect(judgeWatch(thin, 5200, "IN_STOCK", fee).level).toBe("RISK");
  });
});

describe("감시 주기 — 모든 상품을 같은 주기로 보지 않는다", () => {
  const none = { ordersToday: 0, ordersWeek: 0 };

  it("잘 팔리는 상품일수록 자주 본다", () => {
    const hot = watchIntervalHours(p(), { ordersToday: 8, ordersWeek: 40 }, fee);
    const cold = watchIntervalHours(p(), none, fee);
    expect(hot).toBeLessThan(cold);
  });

  it("마진이 얇으면 가장 자주 본다", () => {
    const thin = p({ price: { listPriceKrw: 5700, discountKrw: 0, buyerPaidKrw: 5700, buyerShippingKrw: 0 } });
    expect(watchIntervalHours(thin, none, fee)).toBe(4);
  });

  it("안 팔리고 마진도 넉넉하면 드물게 본다", () => {
    expect(watchIntervalHours(p(), none, fee)).toBe(72);
  });

  it("주기가 지나면 확인 대상이 된다", () => {
    const now = Date.now();
    const old = p({ lastCollectedAt: now - 80 * 3600_000 });
    expect(needsCheck(old, none, now, fee)).toBe(true);
    expect(needsCheck(p({ lastCollectedAt: now }), none, now, fee)).toBe(false);
  });
});

describe("앱 ⇄ 확장 주고받기", () => {
  it("점검 목록을 만든다", () => {
    const s = buildWatchList([
      { id: "p1", url: "https://domeggook.com/1" },
      { id: "p2", url: "" },
    ]);
    expect(s).toContain(WATCH_HEADER);
    expect(s).toContain("p1|https://domeggook.com/1");
    expect(s).not.toContain("p2");
  });

  it("결과를 읽는다", () => {
    const r = parseWatchResults(`${RESULT_HEADER}\np1|5500|IN\np2|8900|OUT\np3||FAIL`);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ productId: "p1", supplyPriceKrw: 5500, stock: "IN_STOCK" });
    expect(r[1].stock).toBe("OUT_OF_STOCK");
    expect(r[2].supplyPriceKrw).toBeUndefined();
    expect(r[2].stock).toBe("DATA_UNAVAILABLE");
  });

  it("헤더가 없으면 빈 배열", () => {
    expect(parseWatchResults("그냥 텍스트")).toEqual([]);
  });

  it("정상 상품은 개수만 세고 목록에 넣지 않는다", () => {
    const rows = [
      judgeWatch(p(), 5000, "IN_STOCK", fee),
      judgeWatch(p(), 9500, "IN_STOCK", fee),
      judgeWatch(p(), undefined, "UNKNOWN", fee),
    ];
    const s = summarizeWatch(rows);
    expect(s.safeCount).toBe(1);
    expect(s.risk).toHaveLength(1);
    expect(s.failed).toHaveLength(1);
  });
});
