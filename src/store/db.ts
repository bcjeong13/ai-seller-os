// ============================================================
// 로컬 저장소 (localStorage) — 백엔드/DB 설치 불필요
// 상품·주문·이벤트를 브라우저에 보관. 새로고침해도 유지.
// ============================================================

import { useSyncExternalStore } from "react";
import type { Product, CostInputs, SupplierStock, DetailDraft } from "../domain/types";
import type { Order } from "../domain/orders";
import { buildOrder } from "../domain/orders";
import { orderPreflightCheck, type PreflightResult } from "../domain/preflight";
import { deriveStatus } from "../domain/status";
import { detectAnomaly } from "../domain/anomaly";
import { newId } from "../domain/factory";

const KEY = "ai-seller-os-v2";

interface AppState {
  products: Product[];
  orders: Order[];
}

let state: AppState = load();
const listeners = new Set<() => void>();

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore */
  }
  return { products: [], orders: [] };
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

function setState(next: AppState) {
  state = next;
  persist();
}

// --- 구독 (React) ---
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// --- 조회 ---
export const getProducts = () => state.products;
export const getProduct = (id: string) => state.products.find((p) => p.id === id);
export const getOrders = () => state.orders;
export const getOrdersFor = (productId: string) =>
  state.orders.filter((o) => o.productId === productId);

// --- 상품 ---
export function addProduct(p: Product) {
  p.status = deriveStatus(p);
  setState({ ...state, products: [p, ...state.products] });
}

export function deleteProduct(id: string) {
  setState({ ...state, products: state.products.filter((p) => p.id !== id) });
}

function mutateProduct(id: string, fn: (p: Product) => Product) {
  setState({
    ...state,
    products: state.products.map((p) => (p.id === id ? fn(p) : p)),
  });
}

/** 상품 기본 정보/설정 수정 */
export function updateProduct(id: string, patch: Partial<Product>) {
  mutateProduct(id, (p) => {
    const next = { ...p, ...patch };
    next.status = deriveStatus(next);
    return next;
  });
}

/**
 * 원가 변경 (공급처 재조회) — 이상치 감지 + 이력/이벤트 기록 + 상태 재계산.
 * lastCollectedAt을 현재로 갱신(방금 수집한 데이터).
 */
export function updateCost(id: string, newCost: CostInputs, note = "원가 갱신") {
  mutateProduct(id, (p) => {
    const now = Date.now();
    const oldPrice = Math.round(p.cost.sourcePrice * p.cost.exchangeRate);
    const newPrice = Math.round(newCost.sourcePrice * newCost.exchangeRate);
    const anomaly = detectAnomaly(oldPrice, newPrice);

    const events = [...p.events];
    if (oldPrice !== newPrice) {
      events.unshift({
        at: now,
        type: anomaly.isAnomaly ? "PRICE_ANOMALY" : "COST_CHANGED",
        message: anomaly.isAnomaly
          ? `이상 가격 감지: ${oldPrice.toLocaleString()}→${newPrice.toLocaleString()}원 (${(anomaly.changeRatio * 100).toFixed(0)}%) — 확인 필요`
          : `원가 변경: ${oldPrice.toLocaleString()}→${newPrice.toLocaleString()}원`,
      });
    }

    const next: Product = {
      ...p,
      cost: newCost,
      lastCollectedAt: now,
      costHistory: [
        ...p.costHistory,
        {
          at: now,
          sourcePrice: newCost.sourcePrice,
          sourceCurrency: newCost.sourceCurrency,
          exchangeRate: newCost.exchangeRate,
          internationalShippingKrw: newCost.internationalShippingKrw,
          productPriceKrw: newPrice,
          note,
        },
      ],
      events,
    };
    const oldStatus = p.status;
    next.status = deriveStatus(next);
    if (next.status !== oldStatus) {
      next.events = [
        { at: now, type: "STATUS_CHANGED", message: `상태 변경: ${oldStatus} → ${next.status}` },
        ...next.events,
      ];
    }
    return next;
  });
}

/** 상세페이지 초안 저장 (다시 열어 수정 가능) */
export function saveDetailDraft(id: string, draft: DetailDraft) {
  mutateProduct(id, (p) => ({
    ...p,
    detailDraft: draft,
    events: [{ at: Date.now(), type: "DETAIL_PAGE", message: "상세페이지 저장" }, ...p.events],
  }));
}

/** 공급처 재고 상태 변경 */
export function setSupplierStock(id: string, stock: SupplierStock) {
  mutateProduct(id, (p) => {
    const now = Date.now();
    const next: Product = { ...p, supplierStock: stock, lastCollectedAt: now };
    next.status = deriveStatus(next);
    next.events = [
      { at: now, type: "SUPPLIER_STOCK", message: `공급처 재고 상태: ${stock}` },
      ...next.events,
    ];
    return next;
  });
}

/** 공급처 데이터 재확인(신선도 갱신) — 크롬확장 재확인을 시뮬레이션 */
export function refreshCollectedAt(id: string) {
  mutateProduct(id, (p) => ({
    ...p,
    lastCollectedAt: Date.now(),
    events: [{ at: Date.now(), type: "RECHECK", message: "공급처 데이터 재확인" }, ...p.events],
  }));
}

// --- 주문 (PREFLIGHT 경유) ---
export function runPreflight(productId: string): PreflightResult | null {
  const p = getProduct(productId);
  if (!p) return null;
  return orderPreflightCheck(p, Date.now());
}

/** 주문 생성 — 반드시 PREFLIGHT 통과분에 대해서만. 스냅샷 영구 저장. */
export function placeOrder(
  productId: string,
  quantity: number,
  preflight: PreflightResult,
  approved: boolean
): Order | null {
  const p = getProduct(productId);
  if (!p) return null;
  const order = buildOrder(newId("o"), p, quantity, preflight, approved);
  mutateProduct(productId, (prod) => ({
    ...prod,
    events: [
      {
        at: order.createdAt,
        type: "ORDER",
        message: `주문 발주 (${preflight.status}${approved ? ", 승인됨" : ""}) — 예상손익 ${order.snapshot.expected_profit_snapshot.toLocaleString()}원`,
      },
      ...prod.events,
    ],
  }));
  setState({ ...state, orders: [order, ...state.orders] });
  return order;
}

export function resetAll() {
  setState({ products: [], orders: [] });
}

export function loadSeed(products: Product[]) {
  setState({ products, orders: [] });
}
