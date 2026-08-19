// ============================================================
// 상품별 공급처 비교 (소싱방향 §7-8)
// ★ "어느 도매몰이 최고인가"가 아니라 "이 상품을 어디서 가져오는 게 유리한가".
// ★ 최저가 공급처가 항상 최적은 아니다 — 반품·재고·위탁 가능 여부를 같이 본다.
// ★ 점수(87점)를 화면에 만들지 않는다 (지시서 §10). 총원가 비교 + 이유로 보여준다.
// ★ 계산은 코드. 최소구매수량 × 단가 = 실제 매입원가.
// ============================================================

export interface SupplierOption {
  id: string;
  /** 공급처 이름 — 도매매 / 오너클랜 / 도매꾹 / 공급사 A */
  name: string;
  /** 1개 단가 */
  supplyPriceKrw: number;
  /** 도매처가 셀러에게 청구하는 배송비 */
  shippingKrw: number;
  /** 최소구매수량 (기본 1). 3이면 고객 1개 주문에도 3개 매입 */
  minOrderQty: number;
  /** 이 매입액 이상이면 무료배송 (선택) */
  freeShipOverKrw?: number;
  /** 위탁배송(고객 직배송) 가능 — 무재고에 필수 */
  consignment: boolean;
  /** 반품이 원활한가 */
  returnEasy: boolean;
  /** 재고가 안정적인가 */
  stockStable: boolean;
  url?: string;
}

export interface SupplierEval {
  option: SupplierOption;
  /** 고객 1주문을 처리하는 실제 매입원가 = 단가×최소수량 + 배송비 */
  landedCostKrw: number;
  /** 실효 단가 = 매입원가 / 최소수량 (참고) */
  perUnitKrw: number;
  /** 위탁 가능해야 후보가 된다 */
  viable: boolean;
  /** 경고 신호들 */
  flags: string[];
  recommended: boolean;
}

export interface SupplierComparison {
  productName: string;
  evals: SupplierEval[]; // 유리한 순
  best?: SupplierEval;
  cheapest?: SupplierEval;
  note: string;
}

const won = (n: number) => Math.round(n);

function landedCost(o: SupplierOption): number {
  const qty = Math.max(1, Math.floor(o.minOrderQty || 1));
  const goods = o.supplyPriceKrw * qty;
  const freeShip = o.freeShipOverKrw != null && goods >= o.freeShipOverKrw;
  return won(goods + (freeShip ? 0 : o.shippingKrw));
}

function flagsOf(o: SupplierOption): string[] {
  const f: string[] = [];
  if (!o.consignment) f.push("위탁배송 불가 — 무재고엔 부적합");
  const qty = Math.max(1, Math.floor(o.minOrderQty || 1));
  if (qty > 1) f.push(`최소구매 ${qty}개 — 매입원가 ${qty}배`);
  if (!o.returnEasy) f.push("반품 어려움");
  if (!o.stockStable) f.push("재고 불안정");
  return f;
}

/** 최저가만 보지 않도록: 반품·재고 리스크는 원가에 가중 페널티 */
function adjustedScore(e: SupplierEval): number {
  let penalty = 0;
  if (!e.option.returnEasy) penalty += 0.1;
  if (!e.option.stockStable) penalty += 0.1;
  return e.landedCostKrw * (1 + penalty);
}

export function compareSuppliers(
  productName: string,
  options: SupplierOption[]
): SupplierComparison {
  const evals: SupplierEval[] = options
    .filter((o) => o.name && o.supplyPriceKrw > 0)
    .map((o) => {
      const qty = Math.max(1, Math.floor(o.minOrderQty || 1));
      const landed = landedCost(o);
      return {
        option: o,
        landedCostKrw: landed,
        perUnitKrw: won(landed / qty),
        viable: o.consignment,
        flags: flagsOf(o),
        recommended: false,
      };
    });

  // 유리한 순: 위탁가능 우선 → 리스크 가중 원가 낮은 순
  evals.sort((a, b) => {
    if (a.viable !== b.viable) return a.viable ? -1 : 1;
    return adjustedScore(a) - adjustedScore(b);
  });

  const viable = evals.filter((e) => e.viable);
  const cheapest = viable.length
    ? viable.reduce((m, e) => (e.landedCostKrw < m.landedCostKrw ? e : m))
    : undefined;
  const best = viable[0]; // 정렬상 가장 유리한 위탁 가능 공급처

  if (best) best.recommended = true;

  let note = "비교할 공급처가 없습니다.";
  if (best && cheapest) {
    if (best.option.id === cheapest.option.id) {
      note = `${best.option.name}가 최저 매입원가이면서 조건도 안정적입니다.`;
    } else {
      const diff = best.landedCostKrw - cheapest.landedCostKrw;
      note = `최저가는 ${cheapest.option.name}(${cheapest.landedCostKrw.toLocaleString()}원)이지만, ${diff.toLocaleString()}원 비싼 ${best.option.name}가 반품·재고가 안정적이라 더 유리합니다.`;
    }
  } else if (evals.length && !best) {
    note = "위탁배송 가능한 공급처가 없습니다 — 무재고로는 발주할 수 없습니다.";
  }

  return { productName, evals, best, cheapest, note };
}
