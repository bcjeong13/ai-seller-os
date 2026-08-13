import type { ProductStatus, PreflightStatus, SupplierStock, Currency, Marketplace } from "../domain/types";

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

export const CHANNEL_META: Record<Marketplace, { short: string; label: string; color: string; bg: string }> = {
  NAVER: { short: "N", label: "네이버", color: "#068a4c", bg: "#e4f8ee" },
  COUPANG: { short: "C", label: "쿠팡", color: "#1f5fd6", bg: "#e7effc" },
  "11ST": { short: "11", label: "11번가", color: "#c81e1e", bg: "#fdeaea" },
  GMARKET: { short: "G", label: "G마켓", color: "#166534", bg: "#e7f5ec" },
  AUCTION: { short: "옥", label: "옥션", color: "#b42318", bg: "#fdece9" },
  OTHER: { short: "·", label: "기타", color: "#475569", bg: "#eef1f5" },
};

export function ChannelChips({ channels, pending }: { channels?: Marketplace[]; pending?: Marketplace[] }) {
  const list = channels ?? [];
  const pend = pending ?? [];
  if (list.length === 0 && pend.length === 0) return <span className="tiny" style={{ color: "var(--muted2)" }}>미등록</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {list.map((c) => {
        const m = CHANNEL_META[c];
        return <span key={c} className="chch" style={{ color: m.color, background: m.bg }} title={m.label}>{m.short}</span>;
      })}
      {pend.map((c) => {
        const m = CHANNEL_META[c];
        return <span key={"p" + c} className="chch pend" title={m.label + " 승인 대기"}>{m.short}⏳</span>;
      })}
    </span>
  );
}

export function Badge({ meta }: { meta: Meta }) {
  return (
    <span className="badge" style={{ color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}
