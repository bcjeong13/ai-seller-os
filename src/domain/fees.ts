// ============================================================
// 마켓 수수료 — 다차원 구조 (개발지시서 §6-2)
// ★ 구체적 요율을 확정 사실로 하드코딩하지 않는다.
//   기본값은 "예시"이며 사용자가 판매자센터에서 확인해 수정해야 한다.
// ============================================================

import type { FeeRule, MarketFeeProfile, Marketplace, FeeBasis } from "./types";
import { pct, won } from "./money";

let seq = 0;
const rid = () => `fee_${++seq}`;

function rule(label: string, basis: FeeBasis, p: number): FeeRule {
  return { id: rid(), label, basis, pct: p, enabled: true, verified: false };
}

/**
 * 마켓별 기본 수수료 프로필 — 전부 "예시값"이며 verified=false 다.
 * 사용자가 본인 판매자센터에서 실제 요율을 확인해 수정해야 한다.
 */
export function defaultFeeProfile(marketplace: Marketplace): MarketFeeProfile {
  switch (marketplace) {
    case "NAVER":
      // 네이버는 판매수수료와 결제·주문관리 수수료가 별도 구조다.
      // 배송비에도 수수료가 붙을 수 있어 basis 를 나눠 둔다.
      return {
        marketplace,
        rules: [
          rule("판매수수료", "PRODUCT", 3),
          rule("결제·주문관리 수수료", "PRODUCT", 3.6),
          rule("결제·주문관리 수수료(배송비분)", "SHIPPING", 3.6),
          rule("마케팅 수수료", "PRODUCT", 0),
        ],
      };
    case "COUPANG":
      return {
        marketplace,
        rules: [
          rule("판매수수료", "PRODUCT", 10.8),
          rule("결제 수수료", "PRODUCT", 0),
        ],
      };
    case "11ST":
    case "GMARKET":
    case "AUCTION":
    case "OTHER":
    default:
      return {
        marketplace,
        rules: [
          rule("판매수수료", "PRODUCT", 8),
          rule("결제 수수료", "PRODUCT", 0),
        ],
      };
  }
}

export function defaultFeeProfiles(): MarketFeeProfile[] {
  return (["NAVER", "COUPANG", "11ST", "GMARKET", "AUCTION"] as Marketplace[])
    .map(defaultFeeProfile);
}

export interface FeeBase {
  /** 상품금액 — 구매자 실제 결제금액 */
  productKrw: number;
  /** 고객이 부담한 배송비 */
  shippingKrw: number;
  /** 반품배송비 (반품 발생 시) */
  returnShippingKrw: number;
}

export interface ComputedFee {
  lines: { label: string; basis: FeeBasis; pct: number; amountKrw: number }[];
  totalKrw: number;
  /** 상품금액 대비 실효 수수료율(%) */
  effectivePct: number;
}

/** 수수료 규칙을 실제 금액으로 계산 */
export function computeFees(profile: MarketFeeProfile | undefined, base: FeeBase): ComputedFee {
  const rules = (profile?.rules ?? []).filter((r) => r.enabled && r.pct > 0);
  const lines = rules.map((r) => {
    const b =
      r.basis === "PRODUCT" ? base.productKrw
      : r.basis === "SHIPPING" ? base.shippingKrw
      : base.returnShippingKrw;
    return { label: r.label, basis: r.basis, pct: r.pct, amountKrw: pct(b, r.pct) };
  });
  const totalKrw = won(lines.reduce((s, l) => s + l.amountKrw, 0));
  const effectivePct = base.productKrw > 0 ? (totalKrw / base.productKrw) * 100 : 0;
  return { lines, totalKrw, effectivePct };
}

/**
 * 판매가에 비례하는 수수료율 합(%) — 손익분기 역산에 사용.
 * PRODUCT 기준 규칙만 판매가에 비례한다.
 */
export function variablePctOf(profile: MarketFeeProfile | undefined): number {
  return (profile?.rules ?? [])
    .filter((r) => r.enabled && r.basis === "PRODUCT")
    .reduce((s, r) => s + r.pct, 0);
}

/** 아직 사용자가 확인하지 않은 규칙이 있는지 — 화면에 "예시값" 경고 표시용 */
export function hasUnverifiedRules(profile: MarketFeeProfile | undefined): boolean {
  return (profile?.rules ?? []).some((r) => r.enabled && r.pct > 0 && !r.verified);
}
