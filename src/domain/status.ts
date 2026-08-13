// 상품 상태/등급 파생 (현재 원가 기준)

import type { Product, ProductStatus, RiskGrade } from "./types";
import { computeProfit } from "./profitEngine";
import { gradeProfit } from "./grading";

export function currentGrade(product: Product): RiskGrade {
  if (product.legalBlock) return "BLOCKED";
  const profit = computeProfit(product.sellingPriceKrw, product.cost, {
    customsThresholdKrw: product.customsThresholdKrw,
    dutyRatePct: product.dutyRatePct,
  });
  return gradeProfit(profit, {
    minMarginPct: product.minMarginPct,
    minProfitKrw: product.minProfitKrw,
    warningBufferPct: 5,
  });
}

export function deriveStatus(product: Product): ProductStatus {
  if (product.legalBlock) return "BLOCKED";
  if (product.supplierStock === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  if (product.status === "DISCONTINUED") return "DISCONTINUED";
  const grade = currentGrade(product);
  switch (grade) {
    case "LOSS": return "LOSS";
    case "DANGER": return "DANGER";
    case "WARNING": return "WARNING";
    default: return "SELLING";
  }
}

/**
 * 판매 채널에 반영이 필요한지 판정 (운영 루프).
 * 공급가 변동·손실·품절·차단 시 등록된 채널에 조치가 필요하다.
 */
export function channelActionNeeded(p: Product): { pending: boolean; reason: string; action: string } {
  const ch = p.channels ?? [];
  if (ch.length === 0) return { pending: false, reason: "", action: "" };
  if (p.legalBlock) return { pending: true, reason: "판매 차단 상품", action: "각 채널에서 판매중지/삭제" };
  if (p.supplierStock === "OUT_OF_STOCK") return { pending: true, reason: "공급처 품절", action: "각 채널에서 품절 처리" };
  const g = currentGrade(p);
  if (g === "LOSS") return { pending: true, reason: "현재 손실", action: "판매가 인상 또는 판매중지" };
  if (g === "DANGER") return { pending: true, reason: "최소 마진 미달", action: "판매가 재검토" };
  if (g === "WARNING") return { pending: true, reason: "마진 하락 근접", action: "판매가 재검토" };
  return { pending: false, reason: "", action: "" };
}

export function productProfit(product: Product) {
  return computeProfit(product.sellingPriceKrw, product.cost, {
    customsThresholdKrw: product.customsThresholdKrw,
    dutyRatePct: product.dutyRatePct,
  });
}
