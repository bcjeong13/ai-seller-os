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

export function productProfit(product: Product) {
  return computeProfit(product.sellingPriceKrw, product.cost, {
    customsThresholdKrw: product.customsThresholdKrw,
    dutyRatePct: product.dutyRatePct,
  });
}
