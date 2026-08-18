// ============================================================
// ★ 발주 안전검사 (ORDER_PREFLIGHT_CHECK)
// 주문이 들어온 시점에 "지금 발주하면 돈을 버는가"를 다시 계산한다.
// 어떤 주문도 이 관문을 건너뛰고 발주할 수 없다.
// ★ 판정은 보수적(conservative) 손익 기준 (개발지시서 §6-5)
// ★ 개인정보를 다루지 않는다 — 상품·금액만 본다
// ============================================================

import type { Product, ProfitResult, MarketFeeProfile, ScenarioProfit, ProductOption } from "./types";
import type { Order } from "./orders";
import { computeProfit, computeScenarios, costOfOption, priceOfOption } from "./profitEngine";
import { gradeProfit } from "./grading";
import { isStale, DEFAULT_FRESHNESS, type FreshnessConfig } from "./freshness";
import { formatKrw } from "./money";
import { hasUnverifiedRules } from "./fees";

/** 검사 결과 상태 */
export type PreflightStatus =
  | "ORDERABLE"
  | "ORDERABLE_WITH_WARNING"
  | "PENDING_APPROVAL"
  | "BLOCKED"
  | "OUT_OF_STOCK"
  | "LOSS_RISK"
  | "DATA_UNAVAILABLE";

export interface PreflightCheckItem {
  no: number;
  label: string;
  value: string;
  ok: boolean;
}

export interface PreflightResult {
  status: PreflightStatus;
  /** 발주해도 되는가 */
  canOrder: boolean;
  /** 사용자 확인이 필요한가 */
  requiresApproval: boolean;
  checks: PreflightCheckItem[];
  /** 기대 손익 */
  profit: ProfitResult;
  /** 3단 시나리오 — 판정은 conservative 기준 */
  scenarios: ScenarioProfit;
  /** 등록 당시 대비 공급가 변동률(%) */
  supplyChangePct: number;
  reasons: string[];
  /** 사용자가 취할 수 있는 행동 */
  actions: string[];
  /** 한 줄 결론 — 화면 최상단에 크게 표시 */
  headline: string;
}

export interface PreflightInput {
  product: Product;
  order: Order;
  feeProfile?: MarketFeeProfile;
  now: number;
  freshness?: FreshnessConfig;
}

/** 주문된 옵션 찾기 (없으면 상품 기본값 사용) */
function findOption(product: Product, order: Order): ProductOption | undefined {
  if (order.optionId) {
    const byId = product.options.find((o) => o.id === order.optionId);
    if (byId) return byId;
  }
  if (order.optionName) {
    const n = order.optionName.replace(/\s/g, "");
    return product.options.find((o) => o.name.replace(/\s/g, "") === n);
  }
  return undefined;
}

export function orderPreflightCheck(input: PreflightInput): PreflightResult {
  const { product, order, feeProfile, now } = input;
  const cfg = input.freshness ?? DEFAULT_FRESHNESS;

  const option = findOption(product, order);
  const cost = option ? costOfOption(product, option) : product.cost;
  const price = option ? priceOfOption(product, option) : product.price;

  const scenarios = computeScenarios(price, cost, { feeProfile });
  const profit = scenarios.expected;
  const conservative = scenarios.conservative;

  // 판정은 보수적 기준으로 한다
  const grade = gradeProfit(conservative, {
    minMarginPct: product.minMarginPct,
    minProfitKrw: product.minProfitKrw,
    warningBufferPct: 5,
  });

  const baseSupply = product.baselineCost.supplyPriceKrw || 0;
  const supplyChangePct =
    baseSupply > 0 ? ((cost.supplyPriceKrw - baseSupply) / baseSupply) * 100 : 0;

  const stale = isStale(product.lastCollectedAt, now, cfg);
  const stockUnknown =
    product.supplierStock === "DATA_UNAVAILABLE" || product.supplierStock === "UNKNOWN";
  const optionStock = option?.supplierStock ?? product.supplierStock;
  const soldOut = optionStock === "OUT_OF_STOCK";

  const checks: PreflightCheckItem[] = [
    { no: 1, label: "상품이 아직 있나", value: product.status === "DISCONTINUED" ? "단종됨" : "있음", ok: product.status !== "DISCONTINUED" },
    { no: 2, label: "지금 공급가", value: formatKrw(cost.supplyPriceKrw), ok: cost.supplyPriceKrw > 0 },
    { no: 3, label: "등록 당시 대비", value: baseSupply > 0 ? `${supplyChangePct >= 0 ? "+" : ""}${supplyChangePct.toFixed(1)}%` : "비교 불가", ok: supplyChangePct < 20 },
    { no: 4, label: "주문된 옵션", value: option ? option.name : (order.optionName || "단일 옵션"), ok: !order.optionName || !!option },
    { no: 5, label: "도매처 재고", value: stockLabel(optionStock), ok: optionStock === "IN_STOCK" || optionStock === "LOW_STOCK" },
    { no: 6, label: "배송비", value: formatKrw(cost.shippingKrw), ok: true },
    { no: 7, label: "마켓 수수료", value: formatKrw(profit.totalFeeKrw) + (hasUnverifiedRules(feeProfile) ? " (예시값)" : ""), ok: !hasUnverifiedRules(feeProfile) },
    { no: 8, label: "반품 충당금", value: formatKrw(profit.returnReserveKrw), ok: true },
    { no: 9, label: "판매 가능 여부", value: product.legalBlock ? "차단됨" : "가능", ok: !product.legalBlock },
    { no: 10, label: "예상 순이익 (기대)", value: formatKrw(profit.netProfitKrw), ok: profit.netProfitKrw >= 0 },
    { no: 11, label: "예상 순이익 (보수적)", value: formatKrw(conservative.netProfitKrw), ok: conservative.netProfitKrw >= 0 },
    { no: 12, label: "가격 확인한 지", value: agoLabel(product.lastCollectedAt, now), ok: !stale },
  ];

  const reasons: string[] = [];
  const actions: string[] = [];
  let status: PreflightStatus;
  let headline: string;

  if (product.legalBlock) {
    status = "BLOCKED";
    headline = "🔴 이 상품은 판매할 수 없습니다";
    reasons.push(product.legalNote ?? "판매 차단으로 표시된 상품입니다.");
    actions.push("이 상품 판매 중지", "고객에게 주문 취소 안내");
  } else if (stale || stockUnknown) {
    status = "DATA_UNAVAILABLE";
    headline = "🔍 먼저 지금 가격을 확인하세요";
    reasons.push(
      stale
        ? `공급가를 확인한 지 ${agoLabel(product.lastCollectedAt, now)}입니다. 그 사이 값이 올랐을 수 있습니다.`
        : "도매처 재고를 알 수 없습니다."
    );
    actions.push("도매처에서 현재 가격·재고 확인", "확인 후 다시 검사");
  } else if (soldOut) {
    status = "OUT_OF_STOCK";
    headline = "📦 도매처에 재고가 없습니다";
    reasons.push("발주할 수 없습니다. 고객에게 안내가 필요합니다.");
    actions.push("고객에게 품절 안내 후 취소", "다른 도매처 찾기", "이 옵션 판매 중지");
  } else if (conservative.netProfitKrw < 0) {
    status = "LOSS_RISK";
    headline = "🔴 발주하지 마세요";
    reasons.push(
      `지금 발주하면 ${formatKrw(Math.abs(conservative.netProfitKrw))}을 잃습니다.`
    );
    if (supplyChangePct > 0) {
      reasons.push(`공급가가 등록 당시보다 ${supplyChangePct.toFixed(1)}% 올랐습니다.`);
    }
    actions.push("판매가 올리기", "다른 도매처 찾기", "이 상품 판매 중지", "그래도 발주 (손해 감수)");
  } else if (grade === "DANGER") {
    status = "PENDING_APPROVAL";
    headline = "🟠 남는 게 거의 없습니다";
    reasons.push(
      `보수적으로 보면 ${formatKrw(conservative.netProfitKrw)}밖에 안 남습니다. 최소 기준(${product.minMarginPct}%)에 못 미칩니다.`
    );
    actions.push("판매가 재검토", "확인 후 발주");
  } else if (grade === "WARNING" || supplyChangePct >= 10) {
    status = "ORDERABLE_WITH_WARNING";
    headline = "🟡 발주해도 되지만 확인하세요";
    if (grade === "WARNING") reasons.push("마진이 최소 기준에 가깝습니다.");
    if (supplyChangePct >= 10) reasons.push(`공급가가 ${supplyChangePct.toFixed(1)}% 올랐습니다. 판매가 조정을 검토하세요.`);
    actions.push("확인 후 발주");
  } else {
    status = "ORDERABLE";
    headline = "🟢 발주해도 됩니다";
    reasons.push(`보수적으로 봐도 ${formatKrw(conservative.netProfitKrw)}이 남습니다.`);
  }

  const canOrder = status === "ORDERABLE" || status === "ORDERABLE_WITH_WARNING";
  const requiresApproval =
    status === "PENDING_APPROVAL" || status === "LOSS_RISK" ||
    status === "OUT_OF_STOCK" || status === "BLOCKED";

  return {
    status, canOrder, requiresApproval, checks,
    profit, scenarios, supplyChangePct, reasons, actions, headline,
  };
}

function stockLabel(s: Product["supplierStock"]): string {
  switch (s) {
    case "IN_STOCK": return "있음";
    case "LOW_STOCK": return "얼마 안 남음";
    case "OUT_OF_STOCK": return "품절";
    case "UNKNOWN": return "모름";
    case "DATA_UNAVAILABLE": return "확인 안 됨";
  }
}

function agoLabel(ts: number, now: number): string {
  const h = Math.floor((now - ts) / 3600000);
  if (h < 1) return "방금 전";
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 사용자에게 보이는 상태 문구 — 개발자 용어 노출 금지 (지시서 §3) */
export const PREFLIGHT_LABEL: Record<PreflightStatus, string> = {
  ORDERABLE: "🟢 발주 가능",
  ORDERABLE_WITH_WARNING: "🟡 확인 후 발주",
  PENDING_APPROVAL: "🟠 남는 게 거의 없음",
  BLOCKED: "🔴 판매 불가 상품",
  OUT_OF_STOCK: "📦 도매처 품절",
  LOSS_RISK: "🔴 팔면 손해",
  DATA_UNAVAILABLE: "🔍 가격 확인 필요",
};

/** 단순 손익만 빠르게 (상품 목록 등에서 사용) */
export function quickProfit(product: Product, feeProfile?: MarketFeeProfile): ProfitResult {
  return computeProfit(product.price, product.cost, { feeProfile });
}
