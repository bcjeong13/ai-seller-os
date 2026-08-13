// ============================================================
// ★ ORDER_PREFLIGHT_CHECK — 발주 전 필수 관문 (프롬프트 §2)
// 어떤 주문도 이 관문을 건너뛰고 자동 발주할 수 없다.
// 13개 항목 확인 → 7개 결과 상태.
// ============================================================

import type { Product, PreflightStatus, ProfitResult } from "./types";
import { computeProfit } from "./profitEngine";
import { gradeProfit } from "./grading";
import { isStale, DEFAULT_FRESHNESS, type FreshnessConfig } from "./freshness";

export interface PreflightCheckItem {
  no: number;
  label: string;
  value: string;
  ok: boolean;
}

export interface PreflightResult {
  status: PreflightStatus;
  /** 자동 발주 가능 여부 — LOSS/품절/차단/노후/승인대기는 false */
  canAutoOrder: boolean;
  /** 관리자 승인 필요 여부 */
  requiresApproval: boolean;
  checks: PreflightCheckItem[];
  profit: ProfitResult;
  reasons: string[];
  recommendedActions: string[];
}

/**
 * 주문 발생 시점 실행. product는 "현재 알고 있는(캐시된) 공급처 데이터".
 * @param now 현재 시각(ms) — 신선도 판정용
 */
export function orderPreflightCheck(
  product: Product,
  now: number,
  freshnessCfg: FreshnessConfig = DEFAULT_FRESHNESS
): PreflightResult {
  const c = product.cost;
  const profit = computeProfit(product.sellingPriceKrw, c, {
    customsThresholdKrw: product.customsThresholdKrw,
    dutyRatePct: product.dutyRatePct,
  });

  const grade = gradeProfit(profit, {
    minMarginPct: product.minMarginPct,
    minProfitKrw: product.minProfitKrw,
    warningBufferPct: 5,
  });

  const known = (v: number | undefined | null) =>
    v !== undefined && v !== null && !Number.isNaN(v);

  const stale = isStale(product.lastCollectedAt, now, freshnessCfg);
  const supplierUnavailable =
    product.supplierStock === "DATA_UNAVAILABLE" ||
    product.supplierStock === "UNKNOWN";

  // --- 13개 확인 항목 ---
  const checks: PreflightCheckItem[] = [
    { no: 1, label: "공급처 상품 존재", value: product.status === "DISCONTINUED" ? "단종" : "존재", ok: product.status !== "DISCONTINUED" },
    { no: 2, label: "공급처 상품 가격", value: known(c.sourcePrice) ? `${c.sourcePrice} ${c.sourceCurrency}` : "불명", ok: known(c.sourcePrice) },
    { no: 3, label: "옵션 가격", value: "단일/대표옵션 기준", ok: true },
    { no: 4, label: "공급처 재고", value: supplierStockLabel(product.supplierStock), ok: product.supplierStock === "IN_STOCK" || product.supplierStock === "LOW_STOCK" },
    { no: 5, label: "판매 가능 여부", value: product.legalBlock ? "차단" : "가능", ok: !product.legalBlock },
    { no: 6, label: "국제배송비", value: known(c.internationalShippingKrw) ? `${c.internationalShippingKrw}원` : "불명", ok: known(c.internationalShippingKrw) },
    { no: 7, label: "환율", value: c.sourceCurrency === "KRW" ? "원화(불필요)" : known(c.exchangeRate) ? `${c.exchangeRate}원/${c.sourceCurrency}` : "불명", ok: known(c.exchangeRate) },
    { no: 8, label: "결제/송금 비용", value: `${c.paymentFeePct}%`, ok: known(c.paymentFeePct) },
    { no: 9, label: "플랫폼 수수료", value: `${c.platformFeePct}%`, ok: known(c.platformFeePct) },
    { no: 10, label: "반품/CS 비용", value: `${c.returnCostKrw + c.csCostKrw}원`, ok: true },
    { no: 11, label: "통관/규제 위험", value: product.legalBlock ? "위험" : profit.customs.overThreshold ? "관부가세 발생" : "낮음", ok: !product.legalBlock },
    { no: 12, label: "예상 순이익", value: `${profit.netProfitKrw.toLocaleString("ko-KR")}원`, ok: profit.netProfitKrw >= 0 },
    { no: 13, label: "예상 순이익률", value: `${profit.marginPct.toFixed(1)}%`, ok: profit.netProfitKrw >= 0 },
  ];

  const reasons: string[] = [];
  const recommendedActions: string[] = [];

  // --- 상태 판정 (우선순위 순서 중요) ---
  let status: PreflightStatus;

  if (product.legalBlock) {
    status = "BLOCKED";
    reasons.push(`법적/통관 차단: ${product.legalNote ?? "사유 확인 필요"}`);
    recommendedActions.push("판매중지", "상품 재검토");
  } else if (stale || supplierUnavailable) {
    status = "DATA_UNAVAILABLE";
    reasons.push(
      stale
        ? "공급처 데이터가 오래됨 — 발주 전 재확인 필요"
        : "공급처 재고 데이터 없음 — 재확인 필요"
    );
    recommendedActions.push("크롬 확장으로 현재 상품 재확인 후 발주");
  } else if (product.supplierStock === "OUT_OF_STOCK") {
    status = "OUT_OF_STOCK";
    reasons.push("공급처 품절 — 가격이 싸도 발주 불가");
    recommendedActions.push("판매중지(승인)", "대체 공급처 검색");
  } else if (profit.netProfitKrw < 0) {
    status = "LOSS_RISK";
    reasons.push(
      `현재 원가 기준 손실 예상 (순이익 ${profit.netProfitKrw.toLocaleString("ko-KR")}원)`
    );
    recommendedActions.push(
      "자동 발주 차단 — 관리자 승인 필요",
      "판매가 재계산",
      "대체 공급처 검색"
    );
  } else if (grade === "DANGER") {
    status = "PENDING_APPROVAL";
    reasons.push("최소 허용 이익 기준 미달 — 승인 필요");
    recommendedActions.push("판매가 재계산 검토 후 승인");
  } else if (grade === "WARNING" || profit.customs.overThreshold) {
    status = "ORDERABLE_WITH_WARNING";
    if (grade === "WARNING") reasons.push("마진이 최소기준에 근접 — 주의");
    if (profit.customs.overThreshold)
      reasons.push("관부가세 발생 구간 — 고객 부담/클레임 검토");
    recommendedActions.push("확인 후 발주 가능");
  } else {
    status = "ORDERABLE";
    reasons.push("정상 — 발주 가능");
  }

  const canAutoOrder =
    status === "ORDERABLE" || status === "ORDERABLE_WITH_WARNING";
  const requiresApproval =
    status === "PENDING_APPROVAL" ||
    status === "LOSS_RISK" ||
    status === "OUT_OF_STOCK" ||
    status === "BLOCKED";

  return {
    status,
    canAutoOrder,
    requiresApproval,
    checks,
    profit,
    reasons,
    recommendedActions,
  };
}

function supplierStockLabel(s: Product["supplierStock"]): string {
  switch (s) {
    case "IN_STOCK": return "재고 있음";
    case "LOW_STOCK": return "재고 부족";
    case "OUT_OF_STOCK": return "품절";
    case "UNKNOWN": return "불명";
    case "DATA_UNAVAILABLE": return "데이터 없음";
  }
}

export const PREFLIGHT_LABEL: Record<PreflightStatus, string> = {
  ORDERABLE: "✅ 발주 가능",
  ORDERABLE_WITH_WARNING: "🟡 조건부 발주(주의)",
  PENDING_APPROVAL: "🟠 승인 대기",
  BLOCKED: "⛔ 차단",
  OUT_OF_STOCK: "📦 공급처 품절",
  LOSS_RISK: "🔴 손실 위험 — 발주 차단",
  DATA_UNAVAILABLE: "🔍 재확인 필요",
};
