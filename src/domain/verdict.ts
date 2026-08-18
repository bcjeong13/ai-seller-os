// ============================================================
// 상품 심사 — "이 상품을 팔아도 되는가"
// 원가 + 시장가 + 옵션 손익을 종합해 3단계로만 판정한다.
// ★ 점수(87점) 만들지 않는다. AI가 가격을 결정하지 않는다.
//   계산은 전부 코드, 판정 근거를 반드시 함께 보여준다.
// ============================================================

import type { Product, MarketFeeProfile, MarketPrice } from "./types";
import { computeScenarios, computeOptionProfits, recommendSellingPrice } from "./profitEngine";
import { formatKrw } from "./money";

export type Verdict = "RECOMMEND" | "CHECK" | "REJECT";

export interface VerdictReason {
  ok: boolean;
  text: string;
}

export interface VerdictResult {
  verdict: Verdict;
  headline: string;
  /** 판정 근거 — 반드시 표시한다 */
  reasons: VerdictReason[];
  /** 아직 확인 못 한 것 — 추측하지 않는다 */
  unknown: string[];
  /** 사용자가 취할 수 있는 행동 */
  actions: string[];

  landedCostKrw: number;
  /** 최소 판매가 = 최소 마진을 겨우 맞추는 가격 */
  minPriceKrw: number;
  /** 목표 판매가 = 현재 설정된 판매가 */
  targetPriceKrw: number;
  expectedProfitKrw: number;
  conservativeProfitKrw: number;
  marginPct: number;
  market?: MarketPrice;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  RECOMMEND: "🟢 판매 추천",
  CHECK: "🟡 추가 확인 필요",
  REJECT: "🔴 판매 비추천",
};

/**
 * 시장가와 비교해 판정.
 * @param product 심사할 상품
 * @param feeProfile 손익 기준 마켓의 수수료
 */
export function judgeProduct(
  product: Product,
  feeProfile?: MarketFeeProfile
): VerdictResult {
  const sc = computeScenarios(product.price, product.cost, { feeProfile });
  const opt = computeOptionProfits(product, feeProfile);
  const landed = sc.expected.landedCostKrw;
  const minPrice = recommendSellingPrice(product.cost, product.minMarginPct, feeProfile);
  const target = product.price.buyerPaidKrw;
  const market = product.marketPrice;

  const reasons: VerdictReason[] = [];
  const unknown: string[] = [];
  const actions: string[] = [];
  let verdict: Verdict = "RECOMMEND";

  const demote = (to: Verdict) => {
    const rank = { RECOMMEND: 0, CHECK: 1, REJECT: 2 };
    if (rank[to] > rank[verdict]) verdict = to;
  };

  // --- 1) 판매 자체가 막혀 있는가 ---
  if (product.legalBlock) {
    demote("REJECT");
    reasons.push({ ok: false, text: `판매 차단 상품입니다${product.legalNote ? ` — ${product.legalNote}` : ""}` });
    actions.push("이 상품 제외");
  }

  // --- 1-2) 무재고 위탁판매가 성립하는가 (최소구매수량) ---
  //   고객이 1개를 사도 도매처가 N개부터 판다면 나머지는 내 재고가 된다.
  //   2~3개까지는 "1+1 묶음"으로 팔아 넘길 수 있지만, 그 이상은 방법이 없다.
  const minQty = Math.max(1, Math.floor(product.cost.minOrderQty ?? 1));
  if (minQty >= 4) {
    demote("REJECT");
    reasons.push({
      ok: false,
      text: `도매처가 ${minQty}개부터 팝니다 — 무재고 위탁판매가 안 됩니다`,
    });
    actions.push("이 상품 제외", "최소구매수량 1개인 상품 찾기");
  } else if (minQty > 1) {
    demote("CHECK");
    reasons.push({
      ok: false,
      text: `도매처가 ${minQty}개부터 팝니다 — ${minQty}개 묶음(1+${minQty - 1})으로만 팔아야 합니다`,
    });
    actions.push(`${minQty}개 묶음 상품으로 등록하기`);
  } else {
    reasons.push({ ok: true, text: "1개씩 발주 가능 — 재고 부담 없음" });
  }

  // --- 2) 보수적으로 봐도 흑자인가 ---
  if (sc.conservative.netProfitKrw < 0) {
    demote("REJECT");
    reasons.push({ ok: false, text: `보수적으로 보면 ${formatKrw(Math.abs(sc.conservative.netProfitKrw))} 손해입니다` });
    actions.push("목표 마진 낮춰보기", "다른 공급처 찾기");
  } else if (sc.expected.netProfitKrw < 0) {
    demote("REJECT");
    reasons.push({ ok: false, text: "지금 판매가로는 손해입니다" });
  } else {
    reasons.push({ ok: true, text: `보수적 기준에서도 ${formatKrw(sc.conservative.netProfitKrw)} 남습니다` });
  }

  // --- 3) 옵션 중 역마진이 있는가 ---
  if (opt.lossCount > 0) {
    demote("REJECT");
    reasons.push({ ok: false, text: `${opt.totalCount}개 옵션 중 ${opt.lossCount}개가 팔면 손해입니다` });
    actions.push("손해 보는 옵션 판매 중지");
  } else if (opt.belowMinCount > 0) {
    demote("CHECK");
    reasons.push({ ok: false, text: `${opt.totalCount}개 옵션 중 ${opt.belowMinCount}개가 최소 마진에 못 미칩니다` });
  } else {
    reasons.push({ ok: true, text: "옵션별 역마진 없음" });
  }

  // --- 4) 시장가 비교 — 핵심 ---
  if (!market) {
    demote("CHECK");
    unknown.push("시장 가격");
    actions.push("시장 가격 확인하기");
  } else {
    // ★ 최저가일 필요는 없다.
    //   대표가보다 비싸도 시장 최고가 안쪽이면 실제로 팔린다 (리뷰·상세페이지·배송).
    //   따라서 "대표가 초과"는 탈락 사유가 아니라 조건부다.
    //   진짜 탈락은 시장에서 가장 비싼 값보다도 비쌀 때다.
    const typical = market.typicalKrw;
    const highest = market.highestKrw && market.highestKrw > typical ? market.highestKrw : typical;

    if (minPrice > highest) {
      // 최소 마진을 맞추려면 시장 최고가보다도 비싸야 한다 = 팔 자리가 없다
      demote("REJECT");
      reasons.push({
        ok: false,
        text: `최소 판매가 ${formatKrw(minPrice)}은 시장에서 가장 비싼 ${formatKrw(highest)}보다도 ${formatKrw(minPrice - highest)} 높습니다`,
      });
      actions.push("이 상품 제외", "목표 마진 낮춰보기", "다른 공급처 찾기");
    } else if (minPrice > typical) {
      // 상위 가격대에서만 성립 — 가능하지만 그냥 올려놓으면 안 팔린다
      demote("CHECK");
      reasons.push({
        ok: false,
        text: `대표가 ${formatKrw(typical)}에서는 마진이 안 나옵니다. ${formatKrw(minPrice)} 이상 상위 가격대로만 팔 수 있습니다`,
      });
      actions.push("상세페이지·리뷰로 승부할 수 있는지 판단", "다른 공급처 찾기");
    } else if (target > typical) {
      // 대표가보다 비싸지만 시장 안쪽 — 정상적인 전략이다
      reasons.push({
        ok: true,
        text: `목표가 ${formatKrw(target)}는 대표가보다 높지만 시장 최고 ${formatKrw(highest)} 안쪽입니다 — 최저가 경쟁을 안 해도 됩니다`,
      });
    } else if (market.lowestKrw > 0 && target < market.lowestKrw) {
      demote("CHECK");
      reasons.push({
        ok: false,
        text: `목표가가 시장 최저가 ${formatKrw(market.lowestKrw)}보다도 낮습니다. 더 받아도 됩니다`,
      });
      actions.push("판매가 올려보기");
    } else {
      reasons.push({ ok: true, text: `목표가 ${formatKrw(target)}은 시장 가격대 안에 있습니다` });
    }
  }

  // --- 5) 재고 ---
  if (product.supplierStock === "OUT_OF_STOCK") {
    demote("REJECT");
    reasons.push({ ok: false, text: "도매처 품절 상태입니다" });
  } else if (product.supplierStock === "IN_STOCK" || product.supplierStock === "LOW_STOCK") {
    reasons.push({ ok: true, text: "공급처 재고 확인됨" });
  } else {
    demote("CHECK");
    unknown.push("도매처 재고");
  }

  // --- 6) 이미지 권한 ---
  if (!product.imageRightsConfirmed) {
    demote("CHECK");
    unknown.push("이미지 사용 허용 여부");
    actions.push("도매처에서 이미지 사용 가능 여부 확인");
  }

  // --- 7) 반품 정책 ---
  if (!product.supplierReturnPolicy) {
    unknown.push("도매처 반품 정책");
  }

  // --- 8) 반품률이 추정치인가 ---
  if (!product.cost.returnModel.measured) {
    unknown.push("실제 반품률 (지금은 추정치)");
  }

  const headline =
    verdict === "RECOMMEND" ? "🟢 판매 추천"
    : verdict === "CHECK" ? "🟡 확인이 더 필요합니다"
    : "🔴 판매 비추천";

  if (verdict === "RECOMMEND" && actions.length === 0) actions.push("상품 등록하기");

  return {
    verdict, headline, reasons, unknown,
    actions: dedupe(actions),
    landedCostKrw: landed,
    minPriceKrw: Number.isFinite(minPrice) ? minPrice : 0,
    targetPriceKrw: target,
    expectedProfitKrw: sc.expected.netProfitKrw,
    conservativeProfitKrw: sc.conservative.netProfitKrw,
    marginPct: sc.expected.marginPct,
    market,
  };
}

function dedupe(a: string[]): string[] {
  return [...new Set(a)];
}
