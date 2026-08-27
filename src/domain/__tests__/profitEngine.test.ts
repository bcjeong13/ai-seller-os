import { describe, it, expect } from "vitest";
import type { CostInputs, PriceBreakdown, MarketFeeProfile } from "../types";
import {
  computeProfit, recommendSellingPrice, returnReserve,
  computeScenarios, computeOptionProfits, supplyHeadroom, summarizeOptions,
} from "../profitEngine";
import { detectAnomaly } from "../anomaly";
import { makeProduct, makeOption, makePrice } from "../factory";

// 수수료 0인 프로필 — 계산을 통제하기 위해
const noFee: MarketFeeProfile = { marketplace: "OTHER", rules: [] };

const feeOnly = (pct: number): MarketFeeProfile => ({
  marketplace: "OTHER",
  rules: [{ id: "r1", label: "판매수수료", basis: "PRODUCT", pct, enabled: true, verified: true }],
});

const cost = (over: Partial<CostInputs> = {}): CostInputs => ({
  supplyPriceKrw: 5000,
  shippingKrw: 0,
  returnModel: { costPerReturnKrw: 0, exchangeCostKrw: 0 * 2, ratePct: 0, measured: false },
  csCostKrw: 0,
  adCostKrw: 0,
  ...over,
});

const price = (list: number, discount = 0, shipping = 0): PriceBreakdown =>
  makePrice(list, discount, shipping);

describe("손익 계산 엔진 (결정론적)", () => {
  it("공급가 5,000 / 판매 7,000 → 순이익 +2,000", () => {
    const r = computeProfit(price(7000), cost(), { feeProfile: noFee });
    expect(r.netProfitKrw).toBe(2000);
    expect(r.marginPct).toBeCloseTo(28.57, 1);
  });

  it("공급가 7,500 / 판매 7,000 → 손실 -500", () => {
    const r = computeProfit(price(7000), cost({ supplyPriceKrw: 7500 }), { feeProfile: noFee });
    expect(r.netProfitKrw).toBe(-500);
  });

  it("매입 합계 = 공급가 + 배송비", () => {
    const r = computeProfit(price(12000), cost({ supplyPriceKrw: 5000, shippingKrw: 2500 }), { feeProfile: noFee });
    expect(r.landedCostKrw).toBe(7500);
  });

  it("수수료 10% 반영", () => {
    const r = computeProfit(price(7000), cost(), { feeProfile: feeOnly(10) });
    expect(r.totalFeeKrw).toBe(700);
    expect(r.netProfitKrw).toBe(1300);
  });

  it("할인이 있으면 구매자 결제금액 기준으로 계산", () => {
    const r = computeProfit(price(10000, 1000), cost(), { feeProfile: feeOnly(10) });
    // 결제금액 9,000 → 수수료 900, 원가 5,000 → 순이익 3,100
    expect(r.buyerPaidKrw).toBe(9000);
    expect(r.totalFeeKrw).toBe(900);
    expect(r.netProfitKrw).toBe(3100);
  });

  it("배송비 기준 수수료는 배송비에만 붙는다", () => {
    const p: MarketFeeProfile = {
      marketplace: "NAVER",
      rules: [
        { id: "a", label: "판매", basis: "PRODUCT", pct: 10, enabled: true, verified: true },
        { id: "b", label: "배송비분", basis: "SHIPPING", pct: 10, enabled: true, verified: true },
      ],
    };
    const r = computeProfit(price(10000, 0, 3000), cost(), { feeProfile: p });
    expect(r.totalFeeKrw).toBe(1000 + 300);
  });

  it("손익분기 판매가 (수수료 비례 포함)", () => {
    const r = computeProfit(price(7000), cost(), { feeProfile: feeOnly(10) });
    expect(r.breakEvenPriceKrw).toBe(5556); // 5000 / 0.9
  });
});

describe("반품 충당금 = 1건 실부담액 × 반품률", () => {
  it("6,000원 × 3% = 180원", () => {
    expect(returnReserve({ costPerReturnKrw: 6000, exchangeCostKrw: 6000 * 2, ratePct: 3, measured: false })).toBe(180);
  });

  it("반품률 0이면 충당금 0", () => {
    expect(returnReserve({ costPerReturnKrw: 6000, exchangeCostKrw: 6000 * 2, ratePct: 0, measured: false })).toBe(0);
  });

  it("충당금이 순이익에서 차감된다", () => {
    const base = computeProfit(price(10000), cost(), { feeProfile: noFee });
    const withReturn = computeProfit(
      price(10000),
      cost({ returnModel: { costPerReturnKrw: 6000, exchangeCostKrw: 6000 * 2, ratePct: 3, measured: false } }),
      { feeProfile: noFee }
    );
    expect(base.netProfitKrw - withReturn.netProfitKrw).toBe(180);
  });
});

describe("3단 시나리오 — 발주 판단은 보수적 기준", () => {
  it("보수적 < 기대 < 낙관 순으로 순이익이 낮다", () => {
    const c = cost({ returnModel: { costPerReturnKrw: 6000, exchangeCostKrw: 6000 * 2, ratePct: 3, measured: false } });
    const s = computeScenarios(price(15000), c, { feeProfile: feeOnly(10) });
    expect(s.conservative.netProfitKrw).toBeLessThan(s.expected.netProfitKrw);
    expect(s.expected.netProfitKrw).toBeLessThan(s.optimistic.netProfitKrw);
  });

  it("보수적 시나리오는 공급가를 10% 높게 본다", () => {
    const s = computeScenarios(price(15000), cost(), { feeProfile: noFee });
    expect(s.conservative.supplyPriceKrw).toBe(5500);
    expect(s.expected.supplyPriceKrw).toBe(5000);
  });

  it("기대는 흑자지만 보수적으로는 적자일 수 있다", () => {
    // 공급가 5,000 / 판매 5,300 → 기대 +300, 보수적은 5,500 원가라 -200
    const s = computeScenarios(price(5300), cost(), { feeProfile: noFee });
    expect(s.expected.netProfitKrw).toBeGreaterThan(0);
    expect(s.conservative.netProfitKrw).toBeLessThan(0);
  });
});

describe("옵션별 손익 — 대표 옵션만 보면 안 된다", () => {
  const product = makeProduct({
    name: "테스트 상품",
    marketplace: "OTHER",
    listPriceKrw: 15900,
    supplyPriceKrw: 5000,
    shippingKrw: 3000,
    minMarginPct: 15,
    options: [
      makeOption("블랙", 5000, 0),
      makeOption("화이트", 5500, 0),
      makeOption("대형", 13500, 2000),
    ],
  });

  it("옵션마다 다른 순이익을 계산한다", () => {
    const s = computeOptionProfits(product, noFee);
    expect(s.totalCount).toBe(3);
    const black = s.lines.find((l) => l.optionName === "블랙")!;
    const large = s.lines.find((l) => l.optionName === "대형")!;
    expect(black.profit.netProfitKrw).toBeGreaterThan(large.profit.netProfitKrw);
  });

  it("역마진 옵션을 잡아낸다", () => {
    const s = computeOptionProfits(product, noFee);
    // 대형: 판매 17,900 − (13,500 + 3,000 + CS 200) = 1,200 → 흑자지만 마진 낮음
    // 공급가를 더 올려 확실히 역마진으로 만든다
    const worse = {
      ...product,
      options: product.options.map((o) =>
        o.name === "대형" ? { ...o, supplyPriceKrw: 20000 } : o
      ),
    };
    const s2 = computeOptionProfits(worse, noFee);
    expect(s2.lossCount).toBe(1);
    expect(s2.worst?.optionName).toBe("대형");
    expect(s.lossCount).toBe(0);
  });

  it("판매 중지한 옵션은 집계에서 제외한다", () => {
    const off = {
      ...product,
      options: product.options.map((o) => (o.name === "대형" ? { ...o, enabled: false } : o)),
    };
    const s = computeOptionProfits(off, noFee);
    expect(s.totalCount).toBe(2);
  });

  it("옵션이 없으면 단일 옵션으로 취급한다", () => {
    const single = { ...product, options: [] };
    const s = computeOptionProfits(single, noFee);
    expect(s.totalCount).toBe(1);
    expect(s.lines[0].optionName).toBe("단일 옵션");
  });
});

describe("권장 판매가 역산", () => {
  it("목표 마진 30% → 그 이상을 보장", () => {
    const c = cost({ shippingKrw: 1000 });
    const p = recommendSellingPrice(c, 30, feeOnly(10));
    const r = computeProfit(price(p), c, { feeProfile: feeOnly(10) });
    expect(r.marginPct).toBeGreaterThanOrEqual(30);
    expect(r.marginPct).toBeLessThan(31);
  });

  it("목표 마진이 과도하면 계산 불가", () => {
    expect(recommendSellingPrice(cost(), 10, feeOnly(95))).toBe(Infinity);
  });

  it("100원 단위로 반환", () => {
    expect(recommendSellingPrice(cost(), 25, feeOnly(10)) % 100).toBe(0);
  });
});

describe("등록 이후 공급가 인상 — 팔수록 손해가 되는 구간", () => {
  // 소싱 5,000 → 판매 7,000 으로 등록. 이후 도매처가 8,000으로 올림.
  const sell = price(7000);
  const fee = feeOnly(10);

  it("등록 시점에는 흑자다", () => {
    const r = computeProfit(sell, cost({ supplyPriceKrw: 5000 }), { feeProfile: fee });
    expect(r.netProfitKrw).toBe(1300); // 7,000 − 700(수수료) − 5,000
  });

  it("공급가가 오르면 같은 판매가로 적자가 된다", () => {
    const r = computeProfit(sell, cost({ supplyPriceKrw: 8000 }), { feeProfile: fee });
    expect(r.netProfitKrw).toBeLessThan(0);
    expect(r.netProfitKrw).toBe(-1700); // 7,000 − 700 − 8,000
  });

  it("얼마까지 올라도 버티는지 알 수 있다 (손익분기)", () => {
    const r = computeProfit(sell, cost({ supplyPriceKrw: 6300 }), { feeProfile: fee });
    expect(r.netProfitKrw).toBe(0);
  });

  it("급등은 이상치로 잡아 즉시 반영하지 않는다", () => {
    expect(detectAnomaly(5000, 8000).isAnomaly).toBe(true);   // +60%
    expect(detectAnomaly(5000, 5500).isAnomaly).toBe(false);  // +10%
  });
});

describe("버티는 한계선 — 공급가가 얼마까지 올라도 되나", () => {
  const fee = feeOnly(10);

  it("판매 7,000 / 공급 5,000 이면 6,300원까지 버틴다", () => {
    const h = supplyHeadroom(price(7000), cost({ supplyPriceKrw: 5000 }), fee);
    expect(h.maxSupplyPriceKrw).toBe(6300);
    expect(h.headroomKrw).toBe(1300);
    expect(h.headroomPct).toBeCloseTo(26, 0);
    expect(h.alreadyLoss).toBe(false);
  });

  it("한계선에서는 순이익이 정확히 0이다", () => {
    const c = cost({ supplyPriceKrw: 5000 });
    const h = supplyHeadroom(price(7000), c, fee);
    const atLimit = computeProfit(price(7000), { ...c, supplyPriceKrw: h.maxSupplyPriceKrw }, { feeProfile: fee });
    expect(atLimit.netProfitKrw).toBe(0);
  });

  it("이미 적자면 그렇다고 알려준다", () => {
    const h = supplyHeadroom(price(7000), cost({ supplyPriceKrw: 8000 }), fee);
    expect(h.alreadyLoss).toBe(true);
    expect(h.headroomKrw).toBeLessThan(0);
  });

  it("마진이 두꺼울수록 인상을 더 버틴다", () => {
    const thin = supplyHeadroom(price(6000), cost({ supplyPriceKrw: 5000 }), fee);
    const thick = supplyHeadroom(price(9000), cost({ supplyPriceKrw: 5000 }), fee);
    expect(thick.headroomPct).toBeGreaterThan(thin.headroomPct);
  });

  it("최소구매수량이 2개면 여유도 절반으로 줄어든다", () => {
    const one = supplyHeadroom(price(20000), cost({ supplyPriceKrw: 5000 }), fee);
    const two = supplyHeadroom(price(20000), cost({ supplyPriceKrw: 5000, minOrderQty: 2 }), fee);
    expect(two.headroomKrw).toBeLessThan(one.headroomKrw);
  });
});

describe("이상 가격 감지", () => {
  it("5,000 → 7,500 (+50%) → 이상치", () => {
    expect(detectAnomaly(5000, 7500).isAnomaly).toBe(true);
  });
  it("5,000 → 5,100 (+2%) → 정상", () => {
    expect(detectAnomaly(5000, 5100).isAnomaly).toBe(false);
  });
});

describe("★ 최소 마진에 '못 미침'과 '가까움'을 섞지 않는다", () => {
  /** 최소 마진 15% 기준. 실제 마진은 반품 충당까지 빼고 계산된다 */
  const at = (supplyPriceKrw: number) => {
    const p = makeProduct({
      name: "테스트", marketplace: "OTHER",
      listPriceKrw: 100000, supplyPriceKrw, shippingKrw: 0, minMarginPct: 15,
      options: [makeOption("단일", supplyPriceKrw)],
    });
    return computeOptionProfits(p, undefined);
  };

  it("최소를 못 넘긴 옵션만 '못 미침'으로 센다", () => {
    const s = at(84900);                       // 마진 14.82% — 15% 미달
    expect(s.lines[0].grade).toBe("DANGER");
    expect(s.belowMinCount).toBe(1);
    expect(s.nearMinCount).toBe(0);
    expect(summarizeOptions(s)).toContain("못 미칩니다");
  });

  it("★ 최소를 넘겼지만 가까우면 '가깝습니다'라고 쓴다 — 못 미친다고 하지 않는다", () => {
    const s = at(83000);                       // 마진 약 16.8% — 15%는 넘고 20% 미만
    expect(s.lines[0].grade).toBe("WARNING");
    expect(s.belowMinCount).toBe(0);
    expect(s.nearMinCount).toBe(1);
    expect(summarizeOptions(s)).toContain("가깝습니다");
    expect(summarizeOptions(s)).not.toContain("못 미칩니다");
  });

  it("여유가 있으면 둘 다 아니다", () => {
    const s = at(75000);                       // 마진 24.7%
    expect(s.belowMinCount).toBe(0);
    expect(s.nearMinCount).toBe(0);
    expect(summarizeOptions(s)).toContain("모두 정상");
  });

  it("역마진이 있으면 그것부터 말한다", () => {
    const s = at(120000);
    expect(s.lossCount).toBe(1);
    expect(summarizeOptions(s)).toContain("팔면 손해");
  });
});
