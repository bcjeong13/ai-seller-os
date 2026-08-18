// ============================================================
// 주문 — 상태 머신 + 개인정보 분리 (개발지시서 §5, §7)
// ★ Order 에는 개인정보를 담지 않는다. 배송정보는 ShippingInfo 로 분리 보관.
// ============================================================

import type { Marketplace, PriceBreakdown, ProfitResult } from "./types";

// ------------------------------------------------------------
// 상태 머신
// ------------------------------------------------------------

/** 정상 흐름 단계 */
export type OrderStage =
  | "NEW"               // 신규주문
  | "CHECKING"          // 발주검사
  | "READY_TO_ORDER"    // 발주대기 (검사 통과)
  | "ORDERED"           // 발주완료
  | "AWAITING_TRACKING" // 송장대기
  | "SHIPPED"           // 발송완료
  | "IN_TRANSIT"        // 배송중
  | "CONFIRMED"         // 구매확정
  | "SETTLED";          // 정산완료

/** 예외 상태 — 정상 흐름과 별도 축으로 관리 */
export type OrderException =
  | "SUPPLIER_OUT_OF_STOCK"
  | "SUPPLY_PRICE_UP"
  | "NEGATIVE_MARGIN"
  | "ORDER_FAILED"
  | "CUSTOMER_CANCELLED"
  | "RETURNED"
  | "EXCHANGED";

export const STAGE_ORDER: OrderStage[] = [
  "NEW", "CHECKING", "READY_TO_ORDER", "ORDERED",
  "AWAITING_TRACKING", "SHIPPED", "IN_TRANSIT", "CONFIRMED", "SETTLED",
];

export const STAGE_LABEL: Record<OrderStage, string> = {
  NEW: "새 주문",
  CHECKING: "발주 안전검사",
  READY_TO_ORDER: "발주 대기",
  ORDERED: "발주 완료",
  AWAITING_TRACKING: "송장 대기",
  SHIPPED: "발송 완료",
  IN_TRANSIT: "배송 중",
  CONFIRMED: "구매 확정",
  SETTLED: "정산 완료",
};

export const EXCEPTION_LABEL: Record<OrderException, string> = {
  SUPPLIER_OUT_OF_STOCK: "도매처 품절",
  SUPPLY_PRICE_UP: "공급가 상승",
  NEGATIVE_MARGIN: "팔면 손해",
  ORDER_FAILED: "발주 실패",
  CUSTOMER_CANCELLED: "고객 취소",
  RETURNED: "반품",
  EXCHANGED: "교환",
};

// ------------------------------------------------------------
// 배송정보 — 개인정보. 별도 저장소에 보관하고 기간 후 파기한다.
// ------------------------------------------------------------

export interface ShippingInfo {
  /** Order.id 와 동일한 키를 쓴다 */
  orderId: string;
  recipientName: string;
  phone: string;
  address: string;
  postalCode?: string;
  memo?: string;
  /** 저장 시각 — 보존기간 계산용 */
  savedAt: number;
}

// ------------------------------------------------------------
// 주문 시점 손익 스냅샷 — 발주 당시 값. 이후 절대 변경하지 않는다.
// ------------------------------------------------------------

export interface OrderSnapshot {
  supply_price_snapshot: number;
  shipping_cost_snapshot: number;
  landed_cost_snapshot: number;
  buyer_paid_snapshot: number;
  market_fee_snapshot: number;
  expected_profit_snapshot: number;
  /** 보수적 기준 순이익 — 발주 판단에 쓰인 값 */
  conservative_profit_snapshot: number;
  at: number;
}

// ------------------------------------------------------------
// 주문 (개인정보 없음)
// ------------------------------------------------------------

export interface Order {
  id: string;
  /** 마켓 주문번호 — 중복 방지 키 */
  marketOrderNo: string;
  marketplace: Marketplace;

  /** 연결된 등록 상품 (매칭 실패 시 없을 수 있음) */
  productId?: string;
  productName: string;
  /** 주문된 옵션명 */
  optionName: string;
  /** 매칭된 옵션 id */
  optionId?: string;
  quantity: number;

  price: PriceBreakdown;

  stage: OrderStage;
  exceptions: OrderException[];

  /** 배송정보 보유 여부 (실제 값은 ShippingInfo 저장소에) */
  hasShippingInfo: boolean;
  /** 보존기간 경과로 배송정보를 파기했는지 */
  shippingPurgedAt?: number;

  trackingNo?: string;
  courier?: string;

  /** 발주 시점 스냅샷 */
  snapshot?: OrderSnapshot;

  /** 실제 정산 결과 (정산완료 시 입력) */
  actualProfitKrw?: number;

  createdAt: number;
  orderedAt?: number;
  shippedAt?: number;
  deliveredAt?: number;
  settledAt?: number;

  /** 개인정보를 담지 않는 이벤트 로그 */
  events: { at: number; type: string; message: string }[];
}

// ------------------------------------------------------------
// 스냅샷 생성
// ------------------------------------------------------------

export function createSnapshot(
  order: Order,
  expected: ProfitResult,
  conservative: ProfitResult,
  now: number
): OrderSnapshot {
  return {
    supply_price_snapshot: expected.supplyPriceKrw,
    shipping_cost_snapshot: expected.landedCostKrw - expected.supplyPriceKrw,
    landed_cost_snapshot: expected.landedCostKrw,
    buyer_paid_snapshot: order.price.buyerPaidKrw,
    market_fee_snapshot: expected.totalFeeKrw,
    expected_profit_snapshot: expected.netProfitKrw,
    conservative_profit_snapshot: conservative.netProfitKrw,
    at: now,
  };
}

// ------------------------------------------------------------
// 상태 전이
// ------------------------------------------------------------

/** 다음 단계로 진행 가능한지 */
export function canAdvance(order: Order): boolean {
  if (order.exceptions.length > 0) return false;
  return order.stage !== "SETTLED";
}

export function nextStage(stage: OrderStage): OrderStage {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : stage;
}

/**
 * 이 주문에 대해 사용자가 지금 해야 할 행동.
 * 메인 화면 "오늘 해야 할 일"의 기준이 된다.
 */
export type NextAction =
  | "CHECK_ORDER"       // 발주 안전검사 실행
  | "PLACE_ORDER"       // 도매처에 발주
  | "ENTER_TRACKING"    // 송장번호 입력
  | "MARK_SHIPPED"      // 마켓에 발송처리
  | "CONFIRM_DELIVERY"  // 배송 완료 확인
  | "SETTLE"            // 정산 입력
  | "RESOLVE"           // 예외 처리 필요
  | "WAIT"              // 기다리는 중 (할 일 없음)
  | "DONE";

export function nextActionOf(order: Order): NextAction {
  if (order.exceptions.length > 0) return "RESOLVE";
  switch (order.stage) {
    case "NEW": return "CHECK_ORDER";
    case "CHECKING": return "CHECK_ORDER";
    case "READY_TO_ORDER": return "PLACE_ORDER";
    case "ORDERED": return "ENTER_TRACKING";
    case "AWAITING_TRACKING": return "ENTER_TRACKING";
    case "SHIPPED": return "MARK_SHIPPED";
    case "IN_TRANSIT": return "CONFIRM_DELIVERY";
    case "CONFIRMED": return "SETTLE";
    case "SETTLED": return "DONE";
  }
}

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  CHECK_ORDER: "발주 안전검사",
  PLACE_ORDER: "도매처에 발주",
  ENTER_TRACKING: "송장번호 입력",
  MARK_SHIPPED: "마켓에 발송처리",
  CONFIRM_DELIVERY: "배송 완료 확인",
  SETTLE: "정산 입력",
  RESOLVE: "문제 해결 필요",
  WAIT: "대기 중",
  DONE: "완료",
};

/** 정산 결과 — 예상과 실제를 비교한다 */
export interface SettlementCompare {
  expectedKrw: number;
  actualKrw: number;
  diffKrw: number;
  /** 예상보다 나빴는가 */
  worse: boolean;
  note: string;
}

export function compareSettlement(order: Order): SettlementCompare | null {
  if (order.actualProfitKrw === undefined || !order.snapshot) return null;
  const expected = order.snapshot.expected_profit_snapshot;
  const actual = order.actualProfitKrw;
  const diff = actual - expected;
  return {
    expectedKrw: expected,
    actualKrw: actual,
    diffKrw: diff,
    worse: diff < 0,
    note:
      Math.abs(diff) < 100 ? "예상과 거의 같습니다"
      : diff < 0 ? `예상보다 ${Math.abs(diff).toLocaleString()}원 덜 남았습니다`
      : `예상보다 ${diff.toLocaleString()}원 더 남았습니다`,
  };
}
