// 상품 상태·건강도 파생 (현재 원가 기준)
// ※ 점수(86점)를 쓰지 않는다. 🟢🟡🔴 3단계만 (개발지시서 §10)

import type {
  Product, ProductStatus, RiskGrade, HealthLevel, MarketFeeProfile,
} from "./types";
import { computeProfit, computeOptionProfits } from "./profitEngine";
import { gradeProfit } from "./grading";
import { isStale, DEFAULT_FRESHNESS } from "./freshness";

export function currentGrade(product: Product, feeProfile?: MarketFeeProfile): RiskGrade {
  if (product.legalBlock) return "BLOCKED";
  const profit = computeProfit(product.price, product.cost, { feeProfile });
  return gradeProfit(profit, {
    minMarginPct: product.minMarginPct,
    minProfitKrw: product.minProfitKrw,
    warningBufferPct: 5,
  });
}

export function deriveStatus(product: Product, feeProfile?: MarketFeeProfile): ProductStatus {
  if (product.legalBlock) return "BLOCKED";
  if (product.supplierStock === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  if (product.status === "DISCONTINUED") return "DISCONTINUED";
  if (product.status === "DRAFT") return "DRAFT";
  const grade = currentGrade(product, feeProfile);
  switch (grade) {
    case "LOSS": return "LOSS";
    case "DANGER": return "DANGER";
    case "WARNING": return "WARNING";
    default: return "SELLING";
  }
}

/** 상품 건강도 — 계산 가능한 근거만 사용한다 */
export interface HealthCheck {
  label: string;
  level: HealthLevel;
  detail: string;
}

export interface HealthReport {
  level: HealthLevel;
  checks: HealthCheck[];
  /** 데이터가 없어 판단하지 못한 항목 — "미확인"으로 표시 */
  unknown: string[];
  summary: string;
}

export function healthOf(
  product: Product,
  now: number,
  feeProfile?: MarketFeeProfile
): HealthReport {
  const checks: HealthCheck[] = [];
  const unknown: string[] = [];

  // ★ 판매가를 아직 정하지 않은 초안은 손익을 판단하지 않는다.
  //   값이 없는 것과 손해가 나는 것은 다르다. 0원으로 계산하면 무엇이든 손해로 나온다.
  const priceSet = (product.price.buyerPaidKrw || 0) > 0;

  // 1) 마진
  const grade = currentGrade(product, feeProfile);
  if (!priceSet) {
    checks.push({ label: "마진", level: "ATTENTION", detail: "판매가를 아직 정하지 않았습니다" });
  } else {
    checks.push({
      label: "마진",
      level: grade === "LOSS" || grade === "BLOCKED" ? "RISK"
           : grade === "DANGER" || grade === "WARNING" ? "ATTENTION" : "STABLE",
      detail: grade === "LOSS" ? "팔면 손해입니다" : grade === "SAFE" ? "여유 있습니다" : "최소 기준에 가깝습니다",
    });
  }

  // 2) 옵션 위험
  const opt = computeOptionProfits(product, feeProfile);
  if (!priceSet) {
    unknown.push("옵션별 손익");
  } else {
    checks.push({
      label: "옵션",
      level: opt.lossCount > 0 ? "RISK" : opt.belowMinCount > 0 ? "ATTENTION" : "STABLE",
      detail: opt.lossCount > 0
        ? `${opt.totalCount}개 중 ${opt.lossCount}개가 팔면 손해`
        : opt.belowMinCount > 0
          ? `${opt.totalCount}개 중 ${opt.belowMinCount}개가 최소 마진 미달`
          : `${opt.totalCount}개 모두 정상`,
    });
  }

  // 3) 공급가 안정성
  const base = product.baselineCost.supplyPriceKrw || 0;
  const changePct = base > 0 ? ((product.cost.supplyPriceKrw - base) / base) * 100 : 0;
  if (base > 0) {
    checks.push({
      label: "공급가 안정성",
      level: changePct >= 20 ? "RISK" : changePct >= 10 ? "ATTENTION" : "STABLE",
      detail: `등록 당시 대비 ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`,
    });
  } else {
    unknown.push("공급가 안정성");
  }

  // 4) 재고
  checks.push({
    label: "재고",
    level: product.supplierStock === "OUT_OF_STOCK" ? "RISK"
         : product.supplierStock === "LOW_STOCK" ? "ATTENTION"
         : product.supplierStock === "IN_STOCK" ? "STABLE" : "ATTENTION",
    detail: product.supplierStock === "IN_STOCK" ? "있음"
          : product.supplierStock === "OUT_OF_STOCK" ? "품절" : "확인 필요",
  });

  // 5) 정보 최신성
  const stale = isStale(product.lastCollectedAt, now, DEFAULT_FRESHNESS);
  checks.push({
    label: "가격 확인",
    level: stale ? "ATTENTION" : "STABLE",
    detail: stale ? "24시간 넘게 확인 안 함" : "최근에 확인함",
  });

  // 6) 배송비 비중 — 판매가가 있어야 비중을 낼 수 있다
  if (!priceSet) {
    unknown.push("배송비 비중");
  } else {
    const shipRatio = (product.cost.shippingKrw / product.price.buyerPaidKrw) * 100;
    checks.push({
      label: "배송비 비중",
      level: shipRatio >= 30 ? "RISK" : shipRatio >= 20 ? "ATTENTION" : "STABLE",
      detail: `판매가의 ${shipRatio.toFixed(0)}%`,
    });
  }

  // 7) 규제
  checks.push({
    label: "판매 가능",
    level: product.legalBlock ? "RISK" : "STABLE",
    detail: product.legalBlock ? (product.legalNote ?? "차단됨") : "문제 없음",
  });

  // 데이터가 없어 판단 못 하는 것들 — 추측하지 않는다
  unknown.push("검색 수요", "경쟁 강도");
  if (!product.cost.returnModel.measured) unknown.push("실제 반품률");

  const level: HealthLevel =
    checks.some((c) => c.level === "RISK") ? "RISK"
    : checks.some((c) => c.level === "ATTENTION") ? "ATTENTION"
    : "STABLE";

  // 초안이 어디까지 왔는지에 따라 다음 할 일이 다르다
  const detailCollected = product.options.length > 0 || product.specs.length > 0;
  const summary =
    !priceSet && !detailCollected
      ? "소싱센터에서 담은 초안입니다 — 확장으로 상세를 수집하세요"
    : !priceSet
      ? "상세는 가져왔습니다 — 판매가만 정하면 됩니다"
    : level === "RISK" ? "지금 손볼 곳이 있습니다"
    : level === "ATTENTION" ? "지켜볼 부분이 있습니다"
    : "정상입니다";

  return { level, checks, unknown, summary };
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  STABLE: "🟢 안정",
  ATTENTION: "🟡 관리 필요",
  RISK: "🔴 위험",
};

/** 등록된 채널에 조치가 필요한지 */
export function channelActionNeeded(
  p: Product,
  feeProfile?: MarketFeeProfile
): { pending: boolean; reason: string; action: string } {
  const listed = p.listings.filter((l) => l.listed);
  if (listed.length === 0) return { pending: false, reason: "", action: "" };
  if (p.legalBlock) return { pending: true, reason: "판매 차단 상품", action: "각 마켓에서 판매중지" };
  if (p.supplierStock === "OUT_OF_STOCK") return { pending: true, reason: "도매처 품절", action: "각 마켓에서 품절 처리" };
  const g = currentGrade(p, feeProfile);
  if (g === "LOSS") return { pending: true, reason: "팔면 손해", action: "판매가 인상 또는 판매중지" };
  if (g === "DANGER") return { pending: true, reason: "최소 마진 미달", action: "판매가 재검토" };
  if (g === "WARNING") return { pending: true, reason: "마진 하락 근접", action: "판매가 재검토" };
  return { pending: false, reason: "", action: "" };
}

export function productProfit(product: Product, feeProfile?: MarketFeeProfile) {
  return computeProfit(product.price, product.cost, { feeProfile });
}
