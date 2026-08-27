// ============================================================
// 로컬 저장소 (localStorage) — 백엔드 없음
// ★ 배송정보(개인정보)는 별도 영역에 보관하고 보존기간 후 파기한다 (지시서 §7)
// ★ 이벤트 로그에 개인정보 원문을 남기지 않는다
// ============================================================

import { useSyncExternalStore } from "react";
import type { Product, CostInputs, SupplierStock, DetailDraft, MarketFeeProfile, Marketplace } from "../domain/types";
import type { Order, ShippingInfo, OrderStage, OrderException, OrderSnapshot } from "../domain/orders";
import { deriveStatus } from "../domain/status";
import { detectAnomaly } from "../domain/anomaly";
import { newId } from "../domain/factory";
import { defaultFeeProfiles } from "../domain/fees";
import { isPurgeDue, DEFAULT_RETENTION_DAYS, sanitizeForLog } from "../domain/privacy";
import type { ParsedOrderRow } from "../domain/orderImport";
import { dedupeKey, splitDuplicates } from "../domain/orderImport";
import type { WatchResult } from "../domain/watch";
import { buildBackup, type BackupFile, type BackupKind } from "../domain/backup";

// v4: 주문 파이프라인 + 개인정보 분리 + 다차원 수수료
const KEY = "ai-seller-os-v4";

export interface Settings {
  /** 배송정보 보존기간(일) — 하드코딩 금지, 사용자가 변경 가능 */
  retentionDays: number;
  targetMarginPct: number;

  /**
   * 상품정보제공고시 중 상품이 달라도 늘 같은 값 — 한 번만 적으면 모든 상품에 채워진다.
   * ★ 도매처에서 자동으로 읽어오지 않는다. 고객 클레임이 도매처로 가면 안 된다.
   */
  asPhone?: string;
  warranty?: string;

  /**
   * 마켓에 넣을 재고수량. 위탁이라 실재고가 없다.
   * 도매처 재고를 그대로 쓰면 품절돼도 내 마켓은 판매중으로 남는다.
   */
  listingStockQty?: number;
}

/** 처음에는 작게 잡고 감시로 확인하는 편이 안전하다 */
export const DEFAULT_LISTING_STOCK = 20;

/** 대부분의 상품이 이 문구를 쓴다 */
export const DEFAULT_WARRANTY = "관련 법 및 소비자분쟁해결기준에 따름";

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: DEFAULT_RETENTION_DAYS,
  targetMarginPct: 30,
  warranty: DEFAULT_WARRANTY,
};

interface AppState {
  products: Product[];
  orders: Order[];
  /** 개인정보 — orderId 를 키로 별도 보관 */
  shippingInfos: Record<string, ShippingInfo>;
  feeProfiles: MarketFeeProfile[];
  settings: Settings;
}

function emptyState(): AppState {
  return {
    products: [],
    orders: [],
    shippingInfos: {},
    feeProfiles: defaultFeeProfiles(),
    settings: { ...DEFAULT_SETTINGS },
  };
}

let state: AppState = load();
const listeners = new Set<() => void>();

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return {
        ...emptyState(),
        ...parsed,
        shippingInfos: parsed.shippingInfos ?? {},
        feeProfiles: parsed.feeProfiles?.length ? parsed.feeProfiles : defaultFeeProfiles(),
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
    }
  } catch { /* 손상된 데이터는 무시하고 빈 상태로 시작 */ }
  return emptyState();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* 용량 초과 등 — 조용히 실패 */ }
  listeners.forEach((l) => l());
}

function setState(next: AppState) {
  state = next;
  persist();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ------------------------------------------------------------
// 조회
// ------------------------------------------------------------

export const getProducts = () => state.products;
export const getProduct = (id: string) => state.products.find((p) => p.id === id);
export const getOrders = () => state.orders;
export const getOrder = (id: string) => state.orders.find((o) => o.id === id);
export const getOrdersFor = (productId: string) => state.orders.filter((o) => o.productId === productId);
export const getSettings = () => state.settings;
export const getFeeProfiles = () => state.feeProfiles;
export const feeProfileOf = (m: Marketplace) => state.feeProfiles.find((f) => f.marketplace === m);

/** 배송정보 조회 — 개인정보. 꼭 필요한 화면에서만 호출한다. */
export const getShippingInfo = (orderId: string): ShippingInfo | undefined =>
  state.shippingInfos[orderId];

export function updateSettings(patch: Partial<Settings>) {
  setState({ ...state, settings: { ...state.settings, ...patch } });
}

export function updateFeeProfile(profile: MarketFeeProfile) {
  setState({
    ...state,
    feeProfiles: state.feeProfiles.map((f) =>
      f.marketplace === profile.marketplace ? profile : f
    ),
  });
}

// ------------------------------------------------------------
// 상품
// ------------------------------------------------------------

export function addProduct(p: Product) {
  p.status = deriveStatus(p, feeProfileOf(p.marketplace));
  setState({ ...state, products: [p, ...state.products] });
}

export function deleteProduct(id: string) {
  setState({ ...state, products: state.products.filter((p) => p.id !== id) });
}

function mutateProduct(id: string, fn: (p: Product) => Product) {
  setState({ ...state, products: state.products.map((p) => (p.id === id ? fn(p) : p)) });
}

export function updateProduct(id: string, patch: Partial<Product>) {
  mutateProduct(id, (p) => {
    const next = { ...p, ...patch };
    next.status = deriveStatus(next, feeProfileOf(next.marketplace));
    return next;
  });
}

/** 공급처 원가 갱신 — 이상치 감지 + 이력 + 상태 재계산 */
export function updateCost(id: string, newCost: CostInputs, note = "가격 갱신") {
  mutateProduct(id, (p) => {
    const now = Date.now();
    const oldPrice = Math.round(p.cost.supplyPriceKrw);
    const newPrice = Math.round(newCost.supplyPriceKrw);
    const anomaly = detectAnomaly(oldPrice, newPrice);

    const events = [...p.events];
    if (oldPrice !== newPrice) {
      events.unshift({
        at: now,
        type: anomaly.isAnomaly ? "PRICE_ANOMALY" : "COST_CHANGED",
        message: anomaly.isAnomaly
          ? `공급가가 크게 바뀌었습니다: ${oldPrice.toLocaleString()}→${newPrice.toLocaleString()}원 — 확인 필요`
          : `공급가 변경: ${oldPrice.toLocaleString()}→${newPrice.toLocaleString()}원`,
      });
    }

    const next: Product = {
      ...p,
      cost: newCost,
      lastCollectedAt: now,
      costHistory: [...p.costHistory, {
        at: now,
        supplyPriceKrw: newCost.supplyPriceKrw,
        shippingKrw: newCost.shippingKrw,
        landedCostKrw: Math.round(newCost.supplyPriceKrw + newCost.shippingKrw),
        note,
      }],
      events,
    };
    const oldStatus = p.status;
    next.status = deriveStatus(next, feeProfileOf(next.marketplace));
    if (next.status !== oldStatus) {
      next.events = [{ at: now, type: "STATUS_CHANGED", message: `상태 변경: ${oldStatus} → ${next.status}` }, ...next.events];
    }
    return next;
  });
}

export function saveDetailDraft(id: string, draft: DetailDraft) {
  mutateProduct(id, (p) => ({
    ...p,
    detailDraft: draft,
    events: [{ at: Date.now(), type: "DETAIL_PAGE", message: "상세페이지 저장" }, ...p.events],
  }));
}

export function setSupplierStock(id: string, stock: SupplierStock) {
  mutateProduct(id, (p) => {
    const now = Date.now();
    const next: Product = { ...p, supplierStock: stock, lastCollectedAt: now };
    next.status = deriveStatus(next, feeProfileOf(next.marketplace));
    next.events = [{ at: now, type: "SUPPLIER_STOCK", message: `도매처 재고: ${stock}` }, ...next.events];
    return next;
  });
}

/**
 * 상시 감시 결과 반영.
 * ★ 읽지 못한 상품(FAIL)은 lastCollectedAt 을 갱신하지 않는다.
 *   갱신해버리면 "방금 확인함"이 되어 조용히 정상 처리된다.
 */
export function applyWatchResults(results: WatchResult[]): { checked: number; failed: number; changed: number } {
  let checked = 0, failed = 0, changed = 0;
  for (const r of results) {
    const p = getProduct(r.productId);
    if (!p) continue;

    if (r.supplyPriceKrw === undefined) {
      failed++;
      mutateProduct(p.id, (cur) => ({
        ...cur,
        events: [{ at: Date.now(), type: "CHECK_FAILED", message: "가격 확인 실패 — 직접 확인 필요" }, ...cur.events],
      }));
      continue;
    }

    checked++;
    if (r.supplyPriceKrw !== p.cost.supplyPriceKrw) {
      changed++;
      updateCost(p.id, { ...p.cost, supplyPriceKrw: r.supplyPriceKrw }, "상시 감시");
    } else {
      refreshCollectedAt(p.id);
    }
    if (r.stock !== "UNKNOWN" && r.stock !== getProduct(p.id)?.supplierStock) {
      setSupplierStock(p.id, r.stock);
    }
  }
  return { checked, failed, changed };
}

export function refreshCollectedAt(id: string) {
  mutateProduct(id, (p) => ({
    ...p,
    lastCollectedAt: Date.now(),
    events: [{ at: Date.now(), type: "RECHECK", message: "공급처 정보 재확인" }, ...p.events],
  }));
}

/** 마켓 등록 상태 변경 */
export function setListing(productId: string, marketplace: Marketplace, patch: { listed?: boolean; pending?: boolean; marketProductNo?: string }) {
  mutateProduct(productId, (p) => ({
    ...p,
    listings: p.listings.map((l) =>
      l.marketplace === marketplace
        ? { ...l, ...patch, listedAt: patch.listed ? Date.now() : l.listedAt }
        : l
    ),
    events: [{ at: Date.now(), type: "LISTING", message: `${marketplace} 등록 상태 변경` }, ...p.events],
  }));
}

/**
 * 올림 표시를 전부 지운다.
 * 시험 삼아 눌러본 것을 되돌릴 길이 있어야 한다 —
 * 표시가 남아 있으면 「오늘 할 일」의 마켓에 등록에서 빠져 영영 안 올라간다.
 */
export function clearListings(productId: string) {
  mutateProduct(productId, (p) => ({
    ...p,
    listings: p.listings.map((l) => ({
      ...l, listed: false, pending: false, listedAt: undefined, marketProductNo: undefined,
    })),
    events: [{ at: Date.now(), type: "LISTING", message: "올림 표시 전체 해제" }, ...p.events],
  }));
}

// ------------------------------------------------------------
// 주문
// ------------------------------------------------------------

/** 이미 등록된 주문 키 집합 — 중복 방지용 */
export function existingOrderKeys(): Set<string> {
  return new Set(state.orders.map((o) => dedupeKey(o.marketOrderNo, o.optionName)));
}

export interface ImportOrdersResult {
  added: number;
  skipped: number;
  orders: Order[];
}

/**
 * 파싱된 주문 행을 저장한다.
 * ★ 배송정보는 shippingInfos 로 분리 보관하고, Order 에는 담지 않는다.
 * ★ 이벤트 로그에 이름·전화·주소를 남기지 않는다.
 */
export function importOrders(rows: ParsedOrderRow[], marketplace: Marketplace): ImportOrdersResult {
  const { fresh, duplicates } = splitDuplicates(rows, existingOrderKeys());
  const now = Date.now();

  const newOrders: Order[] = [];
  const newShipping: Record<string, ShippingInfo> = {};

  for (const r of fresh) {
    const id = newId("o");
    const matched = matchProduct(r.productName);
    const hasShipping = !!(r.recipientName || r.phone || r.address);

    if (hasShipping) {
      newShipping[id] = {
        orderId: id,
        recipientName: r.recipientName,
        phone: r.phone,
        address: r.address,
        postalCode: r.postalCode,
        memo: r.memo,
        savedAt: now,
      };
    }

    newOrders.push({
      id,
      marketOrderNo: r.marketOrderNo,
      marketplace,
      productId: matched?.id,
      productName: r.productName,
      optionName: r.optionName,
      optionId: matched ? matchOption(matched, r.optionName) : undefined,
      quantity: r.quantity,
      price: {
        listPriceKrw: r.listPriceKrw,
        discountKrw: r.discountKrw,
        buyerPaidKrw: r.buyerPaidKrw,
        buyerShippingKrw: r.buyerShippingKrw,
      },
      stage: "NEW",
      exceptions: [],
      hasShippingInfo: hasShipping,
      createdAt: now,
      // 개인정보 원문을 남기지 않는다
      events: [{ at: now, type: "IMPORTED", message: sanitizeForLog(`주문 ${r.marketOrderNo} 가져옴`) }],
    });
  }

  setState({
    ...state,
    orders: [...newOrders, ...state.orders],
    shippingInfos: { ...state.shippingInfos, ...newShipping },
  });

  return { added: newOrders.length, skipped: duplicates.length, orders: newOrders };
}

/** 상품명으로 등록 상품 매칭 (공백 제거 후 포함 관계) */
function matchProduct(name: string): Product | undefined {
  const n = name.replace(/\s/g, "");
  return state.products.find((p) => {
    const pn = p.name.replace(/\s/g, "");
    return pn === n || pn.includes(n) || n.includes(pn);
  });
}

function matchOption(product: Product, optionName: string): string | undefined {
  if (!optionName) return undefined;
  const n = optionName.replace(/\s/g, "");
  return product.options.find((o) => o.name.replace(/\s/g, "") === n)?.id;
}

function mutateOrder(id: string, fn: (o: Order) => Order) {
  setState({ ...state, orders: state.orders.map((o) => (o.id === id ? fn(o) : o)) });
}

export function setOrderStage(id: string, stage: OrderStage, message?: string) {
  mutateOrder(id, (o) => {
    const now = Date.now();
    const next: Order = { ...o, stage };
    if (stage === "ORDERED") next.orderedAt = now;
    if (stage === "SHIPPED") next.shippedAt = now;
    if (stage === "IN_TRANSIT" && !o.shippedAt) next.shippedAt = now;
    if (stage === "CONFIRMED") next.deliveredAt = now;
    if (stage === "SETTLED") next.settledAt = now;
    next.events = [
      { at: now, type: "STAGE", message: sanitizeForLog(message ?? `단계 변경: ${stage}`) },
      ...o.events,
    ];
    return next;
  });
}

export function saveOrderSnapshot(id: string, snapshot: OrderSnapshot) {
  mutateOrder(id, (o) => ({ ...o, snapshot }));
}

export function setTracking(id: string, courier: string, trackingNo: string) {
  mutateOrder(id, (o) => ({
    ...o,
    courier,
    trackingNo,
    stage: "SHIPPED",
    shippedAt: Date.now(),
    events: [{ at: Date.now(), type: "TRACKING", message: "송장번호 입력 완료" }, ...o.events],
  }));
}

export function addOrderException(id: string, ex: OrderException, note?: string) {
  mutateOrder(id, (o) => ({
    ...o,
    exceptions: o.exceptions.includes(ex) ? o.exceptions : [...o.exceptions, ex],
    events: [{ at: Date.now(), type: "EXCEPTION", message: sanitizeForLog(note ?? `문제 발생: ${ex}`) }, ...o.events],
  }));
}

export function clearOrderException(id: string, ex: OrderException) {
  mutateOrder(id, (o) => ({
    ...o,
    exceptions: o.exceptions.filter((e) => e !== ex),
    events: [{ at: Date.now(), type: "EXCEPTION", message: `문제 해결: ${ex}` }, ...o.events],
  }));
}

export function settleOrder(id: string, actualProfitKrw: number) {
  mutateOrder(id, (o) => ({
    ...o,
    actualProfitKrw,
    stage: "SETTLED",
    settledAt: Date.now(),
    events: [{ at: Date.now(), type: "SETTLED", message: "정산 완료" }, ...o.events],
  }));
}

export function deleteOrder(id: string) {
  const { [id]: _removed, ...rest } = state.shippingInfos;
  setState({ ...state, orders: state.orders.filter((o) => o.id !== id), shippingInfos: rest });
}

// ------------------------------------------------------------
// 개인정보 파기 (지시서 §7-1)
// 배송정보만 지우고 주문·손익 기록은 유지한다.
// ------------------------------------------------------------

export interface PurgeResult {
  purged: number;
}

export function purgeExpiredShipping(now = Date.now()): PurgeResult {
  const days = state.settings.retentionDays;
  const nextShipping = { ...state.shippingInfos };
  const purgedIds: string[] = [];

  for (const o of state.orders) {
    if (!nextShipping[o.id]) continue;
    if (isPurgeDue(o.deliveredAt, now, days)) {
      delete nextShipping[o.id]; // 실제 데이터 제거
      purgedIds.push(o.id);
    }
  }
  if (purgedIds.length === 0) return { purged: 0 };

  setState({
    ...state,
    shippingInfos: nextShipping,
    orders: state.orders.map((o) =>
      purgedIds.includes(o.id)
        ? {
            ...o,
            hasShippingInfo: false,
            shippingPurgedAt: now,
            events: [{ at: now, type: "PRIVACY", message: "보존기간 경과로 배송정보 파기" }, ...o.events],
          }
        : o
    ),
  });
  return { purged: purgedIds.length };
}

/** 특정 주문의 배송정보를 즉시 파기 */
export function purgeShippingNow(orderId: string) {
  const { [orderId]: _removed, ...rest } = state.shippingInfos;
  setState({
    ...state,
    shippingInfos: rest,
    orders: state.orders.map((o) =>
      o.id === orderId
        ? { ...o, hasShippingInfo: false, shippingPurgedAt: Date.now(),
            events: [{ at: Date.now(), type: "PRIVACY", message: "배송정보 수동 파기" }, ...o.events] }
        : o
    ),
  });
}

// ------------------------------------------------------------
// 백업 / 복원
// ------------------------------------------------------------

export function exportBackup(kind: BackupKind): BackupFile {
  return buildBackup(
    {
      products: state.products,
      orders: state.orders,
      feeProfiles: state.feeProfiles,
      shippingInfos: Object.values(state.shippingInfos),
      settings: state.settings as unknown as Record<string, unknown>,
    },
    kind,
    Date.now()
  );
}

export function restoreBackup(file: BackupFile) {
  const shippingInfos: Record<string, ShippingInfo> = {};
  for (const s of file.shippingInfos ?? []) shippingInfos[s.orderId] = s;
  setState({
    products: file.products ?? [],
    orders: file.orders ?? [],
    shippingInfos,
    feeProfiles: file.feeProfiles?.length ? file.feeProfiles : defaultFeeProfiles(),
    settings: { ...DEFAULT_SETTINGS, ...((file.settings as unknown as Settings) ?? {}) },
  });
}

export function resetAll() {
  setState(emptyState());
}

export function loadSeed(products: Product[], orders: Order[] = [], shipping: ShippingInfo[] = []) {
  const shippingInfos: Record<string, ShippingInfo> = {};
  for (const s of shipping) shippingInfos[s.orderId] = s;
  setState({ ...emptyState(), products, orders, shippingInfos });
}

// 앱 시작 시 만료된 개인정보를 자동 파기한다
purgeExpiredShipping();
