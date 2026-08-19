// ============================================================
// 판매자 반품/교환 정책
//
// ★ 공급처 정책과 내 정책은 다르다. 이것이 이 파일이 존재하는 이유다.
//   - 도매처가 "30일 무료반품"이라 해도, 그건 도매처가 나에게 해주는 것이다.
//   - 고객에게 법적 책임을 지는 건 판매자인 나다.
//   - 도매처가 정책을 바꿔도 나는 이미 고객에게 약속한 상태다.
//
// ★ 그래서 도매처 정책을 그대로 복사해 고객에게 안내하지 않는다.
//   내 정책을 따로 정하게 하고, 도매처보다 후한 부분은 위험으로 표시한다.
//
// ★ 법령 자문이 아니다. 전자상거래법의 최소선만 기계적으로 지킨다.
// ============================================================

import type { ReturnPolicy, SellerReturnPolicy } from "./types";
import { formatKrw } from "./money";

/** 전자상거래법상 청약철회 기간의 최소선 */
export const MIN_WITHDRAWAL_DAYS = 7;

/**
 * 아직 정하지 않은 상품의 기본 정책.
 * 공급처 정책이 있으면 반품비만 참고하되, 기간은 법정 최소선에서 시작한다.
 */
export function defaultSellerPolicy(supplier?: ReturnPolicy, now = Date.now()): SellerReturnPolicy {
  const shipping = supplier?.returnFeeKrw ?? 0;
  return {
    withdrawalDays: MIN_WITHDRAWAL_DAYS,
    returnShippingKrw: shipping,
    exchangeShippingKrw: supplier?.exchangeFeeKrw ?? shipping,
    basedOnSupplier: !!supplier,
    updatedAt: now,
  };
}

export function normalizeSellerPolicy(p: SellerReturnPolicy): SellerReturnPolicy {
  return {
    ...p,
    withdrawalDays: Math.max(MIN_WITHDRAWAL_DAYS, Math.round(p.withdrawalDays || 0)),
    returnShippingKrw: Math.max(0, Math.round(p.returnShippingKrw || 0)),
    exchangeShippingKrw: Math.max(0, Math.round(p.exchangeShippingKrw || 0)),
  };
}

// ------------------------------------------------------------
// 공급처와 내 정책의 차이
// ------------------------------------------------------------

export type GapKind = "OK" | "RISK" | "UNKNOWN";

export interface PolicyGap {
  kind: GapKind;
  text: string;
  /** 손해가 예상되는 금액 (1건당) */
  lossPerCaseKrw?: number;
}

/**
 * 내가 고객에게 약속한 것을 공급처가 받아주지 않으면, 그 차액은 내 돈으로 메운다.
 * 그 간극을 찾아낸다.
 */
export function comparePolicies(
  seller: SellerReturnPolicy,
  supplier?: ReturnPolicy
): PolicyGap[] {
  const out: PolicyGap[] = [];

  if (!supplier) {
    out.push({
      kind: "UNKNOWN",
      text: "도매처 반품정책을 아직 읽지 못했습니다 — 반품이 들어오면 전액 내 부담일 수 있습니다",
    });
    return out;
  }

  // 반품 배송비: 고객에게 덜 받으면 차액은 내가 낸다
  const supplierFee = supplier.returnFeeKrw;
  if (typeof supplierFee === "number") {
    const gap = supplierFee - seller.returnShippingKrw;
    if (gap > 0) {
      out.push({
        kind: "RISK",
        text: `반품 1건마다 ${formatKrw(gap)}을 내가 냅니다 — 도매처가 ${formatKrw(supplierFee)}을 받는데 고객에게는 ${formatKrw(seller.returnShippingKrw)}만 받습니다`,
        lossPerCaseKrw: gap,
      });
    } else {
      out.push({
        kind: "OK",
        text: `반품 배송비는 도매처(${formatKrw(supplierFee)}) 이상을 받습니다`,
      });
    }
  } else {
    out.push({ kind: "UNKNOWN", text: "도매처 반품 배송비를 읽지 못했습니다" });
  }

  // 청약철회 기간: 도매처가 받아주는 기간보다 길게 약속하면 차액은 내 재고가 된다
  const supplierDays = supplier.freeReturnDays;
  if (typeof supplierDays === "number") {
    if (seller.withdrawalDays > supplierDays) {
      out.push({
        kind: "RISK",
        text: `${supplierDays}일이 지난 반품은 도매처가 받지 않습니다 — 고객에게는 ${seller.withdrawalDays}일을 약속했습니다`,
      });
    } else {
      out.push({
        kind: "OK",
        text: `도매처가 ${supplierDays}일까지 받아줍니다 — 내 약속(${seller.withdrawalDays}일)보다 깁니다`,
      });
    }
  }

  return out;
}

export function worstGap(gaps: PolicyGap[]): GapKind {
  if (gaps.some((g) => g.kind === "RISK")) return "RISK";
  if (gaps.some((g) => g.kind === "UNKNOWN")) return "UNKNOWN";
  return "OK";
}

// ------------------------------------------------------------
// 고객 안내문 — 상세페이지 하단에 들어간다
// ------------------------------------------------------------

export function returnNoticeLines(p: SellerReturnPolicy): string[] {
  const lines = [
    `· 상품 수령 후 ${p.withdrawalDays}일 이내에 교환·반품을 신청하실 수 있습니다.`,
  ];

  lines.push(
    p.returnShippingKrw > 0
      ? `· 단순변심 반품 시 반품 배송비 ${formatKrw(p.returnShippingKrw)}은 구매자 부담입니다.`
      : `· 단순변심 반품 시 반품 배송비는 판매자가 부담합니다.`
  );

  lines.push(
    p.exchangeShippingKrw > 0
      ? `· 단순변심 교환 시 교환 배송비 ${formatKrw(p.exchangeShippingKrw)}은 구매자 부담입니다.`
      : `· 단순변심 교환 시 교환 배송비는 판매자가 부담합니다.`
  );

  lines.push(`· 상품 불량·오배송의 경우 배송비를 포함해 판매자가 부담합니다.`);

  if (p.exceptions?.trim()) {
    lines.push(`· ${p.exceptions.trim()}`);
  } else {
    lines.push(`· 사용·훼손되었거나 포장을 개봉해 상품 가치가 떨어진 경우 반품이 제한될 수 있습니다.`);
  }

  return lines;
}
