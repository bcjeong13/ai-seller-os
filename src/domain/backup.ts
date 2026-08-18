// ============================================================
// 백업 / 복원 (개발지시서 §7-3)
// [전체 백업] 개인정보 포함 — 복원용. 생성 시 경고 표시.
// [안전 백업] 개인정보 제외 — 공유·보관용.
// ============================================================

import type { Product, MarketFeeProfile } from "./types";
import type { Order, ShippingInfo } from "./orders";

export type BackupKind = "FULL" | "SAFE";

export const BACKUP_VERSION = 3;

export interface BackupFile {
  app: "ai-seller-os";
  version: number;
  kind: BackupKind;
  exportedAt: number;
  /** 개인정보 포함 여부 — 복원 화면에서 사용자에게 알린다 */
  containsPersonalData: boolean;
  products: Product[];
  orders: Order[];
  feeProfiles: MarketFeeProfile[];
  /** SAFE 백업에는 없다 */
  shippingInfos?: ShippingInfo[];
  settings?: Record<string, unknown>;
}

export interface BackupSource {
  products: Product[];
  orders: Order[];
  feeProfiles: MarketFeeProfile[];
  shippingInfos: ShippingInfo[];
  settings?: Record<string, unknown>;
}

export const PERSONAL_DATA_WARNING =
  "이 백업 파일에는 고객 개인정보가 포함될 수 있습니다.\n안전한 장소에 보관하고 다른 사람과 공유하지 마세요.";

export function buildBackup(src: BackupSource, kind: BackupKind, now: number): BackupFile {
  const base: BackupFile = {
    app: "ai-seller-os",
    version: BACKUP_VERSION,
    kind,
    exportedAt: now,
    containsPersonalData: kind === "FULL",
    products: src.products,
    orders: kind === "FULL" ? src.orders : src.orders.map(stripOrder),
    feeProfiles: src.feeProfiles,
    settings: src.settings,
  };
  if (kind === "FULL") base.shippingInfos = src.shippingInfos;
  return base;
}

/** SAFE 백업용 — 주문에서 개인정보 흔적을 제거 (금액·상태는 유지) */
function stripOrder(o: Order): Order {
  return {
    ...o,
    hasShippingInfo: false,
    // 배송정보는 별도 저장소에 있으므로 Order 자체엔 개인정보가 없지만,
    // 안전을 위해 플래그를 내리고 로그를 정리한다.
    events: o.events.filter((e) => e.type !== "SHIPPING_INFO"),
  };
}

export function backupFileName(kind: BackupKind, now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `ai-seller-os-${kind === "FULL" ? "전체" : "안전"}-${stamp}.json`;
}

export interface RestoreResult {
  ok: boolean;
  data?: BackupFile;
  message: string;
}

export function parseBackup(text: string): RestoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "백업 파일을 읽을 수 없습니다. JSON 형식이 아닙니다." };
  }
  const d = raw as Partial<BackupFile>;
  if (d?.app !== "ai-seller-os") {
    return { ok: false, message: "이 프로그램의 백업 파일이 아닙니다." };
  }
  if (!Array.isArray(d.products) || !Array.isArray(d.orders)) {
    return { ok: false, message: "백업 파일이 손상되었습니다." };
  }
  if ((d.version ?? 0) > BACKUP_VERSION) {
    return { ok: false, message: "더 새로운 버전에서 만든 백업입니다. 프로그램을 업데이트해 주세요." };
  }
  const kind = d.kind === "FULL" ? "전체" : "안전";
  return {
    ok: true,
    data: d as BackupFile,
    message: `${kind} 백업 — 상품 ${d.products.length}개, 주문 ${d.orders.length}건`,
  };
}
