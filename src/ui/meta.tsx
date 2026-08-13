import type { ProductStatus, PreflightStatus, SupplierStock, Currency } from "../domain/types";

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  KRW: "₩",
  CNY: "¥",
  USD: "$",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  KRW: "원화 (₩)",
  CNY: "위안 (¥)",
  USD: "달러 ($)",
};

interface Meta { label: string; color: string; bg: string; }

export const STATUS_META: Record<ProductStatus, Meta> = {
  DISCOVERED: { label: "발굴", color: "var(--muted)", bg: "#eef1f5" },
  ANALYZING: { label: "분석중", color: "var(--muted)", bg: "#eef1f5" },
  APPROVED: { label: "승인", color: "var(--stock)", bg: "var(--stock-bg)" },
  LISTED: { label: "등록", color: "var(--stock)", bg: "var(--stock-bg)" },
  SELLING: { label: "🟢 판매중", color: "var(--safe)", bg: "var(--safe-bg)" },
  WARNING: { label: "🟡 주의", color: "var(--warn)", bg: "var(--warn-bg)" },
  DANGER: { label: "🟠 위험", color: "var(--danger)", bg: "var(--danger-bg)" },
  LOSS: { label: "🔴 손실", color: "var(--loss)", bg: "var(--loss-bg)" },
  BLOCKED: { label: "⛔ 차단", color: "var(--block)", bg: "var(--block-bg)" },
  OUT_OF_STOCK: { label: "📦 품절", color: "var(--stock)", bg: "var(--stock-bg)" },
  DISCONTINUED: { label: "단종", color: "var(--muted)", bg: "#eef1f5" },
};

export const PREFLIGHT_META: Record<PreflightStatus, Meta> = {
  ORDERABLE: { label: "✅ 발주 가능", color: "var(--safe)", bg: "var(--safe-bg)" },
  ORDERABLE_WITH_WARNING: { label: "🟡 조건부 발주", color: "var(--warn)", bg: "var(--warn-bg)" },
  PENDING_APPROVAL: { label: "🟠 승인 대기", color: "var(--danger)", bg: "var(--danger-bg)" },
  BLOCKED: { label: "⛔ 차단", color: "var(--block)", bg: "var(--block-bg)" },
  OUT_OF_STOCK: { label: "📦 공급처 품절", color: "var(--stock)", bg: "var(--stock-bg)" },
  LOSS_RISK: { label: "🔴 손실 위험 · 발주 차단", color: "var(--loss)", bg: "var(--loss-bg)" },
  DATA_UNAVAILABLE: { label: "🔍 재확인 필요", color: "var(--block)", bg: "var(--block-bg)" },
};

export const SUPPLIER_STOCK_META: Record<SupplierStock, string> = {
  IN_STOCK: "재고 있음",
  LOW_STOCK: "재고 부족",
  OUT_OF_STOCK: "품절",
  UNKNOWN: "불명",
  DATA_UNAVAILABLE: "데이터 없음",
};

export function Badge({ meta }: { meta: Meta }) {
  return (
    <span className="badge" style={{ color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}
