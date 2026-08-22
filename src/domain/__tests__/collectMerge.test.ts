import { describe, it, expect } from "vitest";
import { makeProduct, makeOption } from "../factory";
import { parseProductBlock } from "../productImport";
import { planMerge } from "../collectMerge";
import type { Product } from "../types";

/** 소싱센터에서 담은 초안 — 목록에서 읽은 것만 있다 */
function draft(over: Partial<Parameters<typeof makeProduct>[0]> = {}): Product {
  return makeProduct({
    name: "적층식 슬라이딩 서랍식 선반",
    sourceUrl: "https://www.domeggook.com/1234567",
    marketplace: "NAVER",
    listPriceKrw: 0,
    supplyPriceKrw: 4500,
    shippingKrw: 0,
    ...over,
  });
}

const block = [
  "##AISOS##",
  "name: 적층식 슬라이딩 서랍식 선반 옷정리 수납선반",
  "price: 4800",
  "shipping: 3000",
  "supplier: 도매꾹 · 모던스페이스",
  "url: https://www.domeggook.com/1234567",
  "raw:",
  "색상: 화이트, 아이보리 [5200]",
  "재질: PP",
  "최소구매수량: 2",
  "policy:",
  "반품배송비 : 4,000원",
].join("\n");

describe("담아둔 상품에 수집 내용을 채운다", () => {
  it("초안에 비어 있던 배송비·옵션·스펙이 채워진다", () => {
    const p = planMerge(draft(), parseProductBlock(block));
    expect(p.ok).toBe(true);
    expect(p.cost!.shippingKrw).toBe(3000);
    expect(p.product!.options.length).toBeGreaterThan(0);
    expect(p.product!.specs.length).toBeGreaterThan(0);
  });

  it("★ 손익이 바뀌는 변화는 따로 표시한다", () => {
    const p = planMerge(draft(), parseProductBlock(block));
    const profit = p.changes.filter((c) => c.affectsProfit).map((c) => c.label);
    expect(profit).toContain("공급가");
    expect(profit).toContain("배송비");
    expect(profit).toContain("최소구매수량");
  });

  it("몰랐던 배송비는 '몰랐음 → 3,000원'으로 보여준다", () => {
    const c = planMerge(draft(), parseProductBlock(block)).changes.find((x) => x.label === "배송비");
    expect(c?.before).toBe("몰랐음");
    expect(c?.after).toBe("3,000원");
  });

  it("상세 페이지 이름이 목록 이름을 대체한다", () => {
    const p = planMerge(draft(), parseProductBlock(block));
    expect(p.product!.name).toContain("수납선반");
  });

  it("★ 내가 정한 판매가는 건드리지 않는다", () => {
    const priced = draft({ listPriceKrw: 19900 });
    const p = planMerge(priced, parseProductBlock(block));
    expect(p.product!.price.buyerPaidKrw).toBe(priced.price.buyerPaidKrw);
  });

  it("★ 내가 꺼둔 옵션은 다시 켜지지 않는다", () => {
    const p0 = draft();
    p0.options = [{ ...makeOption("화이트", 4500), enabled: false }];
    const p = planMerge(p0, parseProductBlock(block));
    const white = p.product!.options.find((o) => o.name === "화이트");
    expect(white?.enabled).toBe(false);
  });

  it("★ 다른 상품의 정보를 붙여넣으면 경고한다", () => {
    const other = draft({ sourceUrl: "https://www.domeggook.com/9999999" });
    const p = planMerge(other, parseProductBlock(block));
    expect(p.urlMismatch).toBeTruthy();
    expect(p.urlMismatch).toContain("9999999");
  });

  it("같은 상품이면 경고하지 않는다", () => {
    expect(planMerge(draft(), parseProductBlock(block)).urlMismatch).toBeUndefined();
  });

  it("도매처 반품정책을 고객용으로 자동 승인하지 않는다", () => {
    const p = planMerge(draft(), parseProductBlock(block));
    expect(p.product!.supplierReturnPolicy?.approvedForCustomer).toBe(false);
  });

  it("판매가가 없으면 아직 비어 있다고 알린다", () => {
    expect(planMerge(draft(), parseProductBlock(block)).missing).toContain("판매가");
  });

  it("수집 내용이 아니면 합치지 않는다", () => {
    const p = planMerge(draft(), parseProductBlock("그냥 아무 텍스트"));
    expect(p.ok).toBe(false);
    expect(p.changes).toEqual([]);
  });

  it("같은 내용을 다시 붙여넣으면 바꿀 게 없다", () => {
    const first = planMerge(draft(), parseProductBlock(block));
    const applied: Product = { ...first.product!, cost: first.cost! };
    const second = planMerge(applied, parseProductBlock(block));
    expect(second.changes).toEqual([]);
  });
});
