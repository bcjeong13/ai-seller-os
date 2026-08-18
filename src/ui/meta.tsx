import type { ProductStatus, SupplierStock, Marketplace, HealthLevel, RiskGrade } from "../domain/types";
import type { PreflightStatus } from "../domain/preflight";
import type { OrderStage, OrderException } from "../domain/orders";

export interface Meta { label: string; color: string; bg: string; }

/** 사용자 화면에는 개발자 용어를 쓰지 않는다 (개발지시서 §3) */
export const STATUS_META: Record<ProductStatus, Meta> = {
  DRAFT:        { label: "심사 전", color: "var(--muted)", bg: "#eef1f5" },
  APPROVED:     { label: "등록 대기", color: "var(--accent)", bg: "var(--accent-soft)" },
  SELLING:      { label: "🟢 판매중", color: "var(--safe)", bg: "var(--safe-bg)" },
  WARNING:      { label: "🟡 주의", color: "var(--warn)", bg: "var(--warn-bg)" },
  DANGER:       { label: "🟠 남는 게 적음", color: "var(--danger)", bg: "var(--danger-bg)" },
  LOSS:         { label: "🔴 팔면 손해", color: "var(--loss)", bg: "var(--loss-bg)" },
  BLOCKED:      { label: "⛔ 판매 불가", color: "var(--block)", bg: "var(--block-bg)" },
  OUT_OF_STOCK: { label: "📦 품절", color: "var(--stock)", bg: "var(--stock-bg)" },
  DISCONTINUED: { label: "단종", color: "var(--muted)", bg: "#eef1f5" },
};

export const PREFLIGHT_META: Record<PreflightStatus, Meta> = {
  ORDERABLE:              { label: "🟢 발주 가능", color: "var(--safe)", bg: "var(--safe-bg)" },
  ORDERABLE_WITH_WARNING: { label: "🟡 확인 후 발주", color: "var(--warn)", bg: "var(--warn-bg)" },
  PENDING_APPROVAL:       { label: "🟠 남는 게 거의 없음", color: "var(--danger)", bg: "var(--danger-bg)" },
  BLOCKED:                { label: "🔴 판매 불가 상품", color: "var(--block)", bg: "var(--block-bg)" },
  OUT_OF_STOCK:           { label: "📦 도매처 품절", color: "var(--stock)", bg: "var(--stock-bg)" },
  LOSS_RISK:              { label: "🔴 팔면 손해", color: "var(--loss)", bg: "var(--loss-bg)" },
  DATA_UNAVAILABLE:       { label: "🔍 가격 확인 필요", color: "var(--block)", bg: "var(--block-bg)" },
};

export const HEALTH_META: Record<HealthLevel, Meta> = {
  STABLE:    { label: "🟢 안정", color: "var(--safe)", bg: "var(--safe-bg)" },
  ATTENTION: { label: "🟡 관리 필요", color: "var(--warn)", bg: "var(--warn-bg)" },
  RISK:      { label: "🔴 위험", color: "var(--loss)", bg: "var(--loss-bg)" },
};

export const GRADE_META: Record<RiskGrade, Meta> = {
  SAFE:    { label: "🟢", color: "var(--safe)", bg: "var(--safe-bg)" },
  WARNING: { label: "🟡", color: "var(--warn)", bg: "var(--warn-bg)" },
  DANGER:  { label: "🟠", color: "var(--danger)", bg: "var(--danger-bg)" },
  LOSS:    { label: "🔴", color: "var(--loss)", bg: "var(--loss-bg)" },
  BLOCKED: { label: "⛔", color: "var(--block)", bg: "var(--block-bg)" },
};

export const STOCK_LABEL: Record<SupplierStock, string> = {
  IN_STOCK: "있음",
  LOW_STOCK: "얼마 안 남음",
  OUT_OF_STOCK: "품절",
  UNKNOWN: "모름",
  DATA_UNAVAILABLE: "확인 안 됨",
};

export const STAGE_META: Record<OrderStage, Meta> = {
  NEW:               { label: "새 주문", color: "var(--accent)", bg: "var(--accent-soft)" },
  CHECKING:          { label: "검사 중", color: "var(--accent)", bg: "var(--accent-soft)" },
  READY_TO_ORDER:    { label: "발주 대기", color: "var(--warn)", bg: "var(--warn-bg)" },
  ORDERED:           { label: "발주 완료", color: "var(--stock)", bg: "var(--stock-bg)" },
  AWAITING_TRACKING: { label: "송장 대기", color: "var(--warn)", bg: "var(--warn-bg)" },
  SHIPPED:           { label: "발송 완료", color: "var(--safe)", bg: "var(--safe-bg)" },
  IN_TRANSIT:        { label: "배송 중", color: "var(--muted)", bg: "#eef1f5" },
  CONFIRMED:         { label: "구매 확정", color: "var(--safe)", bg: "var(--safe-bg)" },
  SETTLED:           { label: "정산 완료", color: "var(--muted)", bg: "#eef1f5" },
};

export const EXCEPTION_META: Record<OrderException, Meta> = {
  SUPPLIER_OUT_OF_STOCK: { label: "📦 도매처 품절", color: "var(--stock)", bg: "var(--stock-bg)" },
  SUPPLY_PRICE_UP:       { label: "⚠ 공급가 상승", color: "var(--warn)", bg: "var(--warn-bg)" },
  NEGATIVE_MARGIN:       { label: "🔴 팔면 손해", color: "var(--loss)", bg: "var(--loss-bg)" },
  ORDER_FAILED:          { label: "⚠ 발주 실패", color: "var(--loss)", bg: "var(--loss-bg)" },
  CUSTOMER_CANCELLED:    { label: "고객 취소", color: "var(--muted)", bg: "#eef1f5" },
  RETURNED:              { label: "반품", color: "var(--danger)", bg: "var(--danger-bg)" },
  EXCHANGED:             { label: "교환", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export const CHANNEL_META: Record<Marketplace, { short: string; label: string; color: string; bg: string; url: string }> = {
  NAVER:   { short: "N",  label: "네이버",  color: "#068a4c", bg: "#e4f8ee", url: "https://sell.smartstore.naver.com/" },
  COUPANG: { short: "C",  label: "쿠팡",    color: "#1f5fd6", bg: "#e7effc", url: "https://wing.coupang.com/" },
  "11ST":  { short: "11", label: "11번가",  color: "#c81e1e", bg: "#fdeaea", url: "https://soffice.11st.co.kr/" },
  GMARKET: { short: "G",  label: "G마켓",   color: "#166534", bg: "#e7f5ec", url: "https://www.esmplus.com/" },
  AUCTION: { short: "옥", label: "옥션",    color: "#b42318", bg: "#fdece9", url: "https://www.esmplus.com/" },
  OTHER:   { short: "·",  label: "기타",    color: "#475569", bg: "#eef1f5", url: "" },
};

export function Badge({ meta }: { meta: Meta }) {
  return <span className="badge" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>;
}

export function ChannelChip({ m }: { m: Marketplace }) {
  const c = CHANNEL_META[m];
  return <span className="chch" style={{ color: c.color, background: c.bg }} title={c.label}>{c.short}</span>;
}
