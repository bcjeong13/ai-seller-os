import { describe, it, expect } from "vitest";
import {
  defaultSellerPolicy, normalizeSellerPolicy, comparePolicies, worstGap,
  returnNoticeLines, MIN_WITHDRAWAL_DAYS,
} from "../sellerPolicy";
import type { ReturnPolicy, SellerReturnPolicy } from "../types";

const supplier = (o: Partial<ReturnPolicy>): ReturnPolicy => ({
  source: "supplier",
  capturedAt: 0,
  approvedForCustomer: false,
  ...o,
});

const seller = (o: Partial<SellerReturnPolicy>): SellerReturnPolicy => ({
  withdrawalDays: 7,
  returnShippingKrw: 4000,
  exchangeShippingKrw: 4000,
  basedOnSupplier: false,
  updatedAt: 0,
  ...o,
});

describe("기본 정책", () => {
  it("법정 최소선인 7일에서 시작한다", () => {
    expect(defaultSellerPolicy().withdrawalDays).toBe(MIN_WITHDRAWAL_DAYS);
  });

  it("도매처 반품비를 참고한다", () => {
    expect(defaultSellerPolicy(supplier({ returnFeeKrw: 5000 })).returnShippingKrw).toBe(5000);
  });

  it("7일보다 짧게 잡을 수 없다", () => {
    expect(normalizeSellerPolicy(seller({ withdrawalDays: 3 })).withdrawalDays).toBe(7);
  });
});

describe("★ 공급처 정책과 내 정책의 간극 — 차액은 내가 낸다", () => {
  it("고객에게 반품비를 덜 받으면 차액이 내 손해다", () => {
    const gaps = comparePolicies(
      seller({ returnShippingKrw: 3000 }),
      supplier({ returnFeeKrw: 5000 })
    );
    const risk = gaps.find((g) => g.kind === "RISK");
    expect(risk).toBeDefined();
    expect(risk?.lossPerCaseKrw).toBe(2000);
  });

  it("도매처보다 많이 받으면 문제 없다", () => {
    const gaps = comparePolicies(
      seller({ returnShippingKrw: 5000 }),
      supplier({ returnFeeKrw: 4000 })
    );
    expect(worstGap(gaps)).toBe("OK");
  });

  it("도매처가 받아주지 않는 기간까지 약속하면 위험이다", () => {
    const gaps = comparePolicies(
      seller({ withdrawalDays: 30 }),
      supplier({ returnFeeKrw: 0, freeReturnDays: 7 })
    );
    expect(gaps.some((g) => g.kind === "RISK" && g.text.includes("도매처가 받지 않습니다"))).toBe(true);
  });

  it("도매처 정책을 못 읽었으면 정상으로 처리하지 않는다", () => {
    expect(worstGap(comparePolicies(seller({}), undefined))).toBe("UNKNOWN");
  });
});

describe("고객 안내문", () => {
  it("반품비를 받으면 구매자 부담으로 쓴다", () => {
    const t = returnNoticeLines(seller({ returnShippingKrw: 4000 })).join("\n");
    expect(t).toContain("4,000원");
    expect(t).toContain("구매자 부담");
  });

  it("반품비가 0이면 판매자 부담으로 쓴다", () => {
    const t = returnNoticeLines(seller({ returnShippingKrw: 0, exchangeShippingKrw: 0 })).join("\n");
    expect(t).toContain("판매자가 부담");
  });

  it("불량·오배송은 언제나 판매자 부담이다", () => {
    const t = returnNoticeLines(seller({})).join("\n");
    expect(t).toContain("불량");
    expect(t).toContain("판매자가 부담");
  });

  it("★ 도매처 원문을 그대로 옮기지 않는다", () => {
    const t = returnNoticeLines(seller({ withdrawalDays: 7 })).join("\n");
    expect(t).not.toContain("도매");
    expect(t).toContain("7일");
  });
});
