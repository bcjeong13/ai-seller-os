// ============================================================
// 확장으로 수집한 내용을 이미 담아둔 상품에 합친다
//
// ★ 소싱센터에서 담은 초안에는 목록에서 읽은 것(이름·공급가·배송비)만 있다.
//   옵션·스펙·반품정책은 상세 페이지를 열어야 나온다.
//   같은 상품을 새로 만들지 않고 여기에 채워 넣는다.
//
// ★ 무엇을 덮어썼는지 반드시 알려준다.
//   가격이 조용히 바뀌면 손익이 바뀐 걸 모르고 지나간다.
//
// ★ 사람이 이미 손으로 정한 것(판매가·판매자 반품정책·고시정보)은 건드리지 않는다.
// ============================================================

import type { Product, ProductOption, CostInputs } from "./types";
import type { ProductImportResult } from "./productImport";
import { formatKrw } from "./money";
import { newId } from "./factory";

export interface MergeChange {
  label: string;
  before: string;
  after: string;
  /** 손익에 영향을 주는 변화인가 */
  affectsProfit: boolean;
}

export interface MergePlan {
  /** 합칠 수 있는가 */
  ok: boolean;
  /** 다른 상품의 정보로 보이는가 — 주소가 다르면 경고한다 */
  urlMismatch?: string;
  product?: Product;
  cost?: CostInputs;
  changes: MergeChange[];
  /** 여전히 비어 있는 것 */
  missing: string[];
  message: string;
}

function optionKey(name: string): string {
  return (name || "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 수집 결과를 상품에 얹은 결과를 만든다. 저장은 호출한 쪽에서 한다.
 */
export function planMerge(product: Product, r: ProductImportResult): MergePlan {
  if (!r.ok) {
    return { ok: false, changes: [], missing: [], message: "수집한 내용이 아닙니다. 확장의 [복사]로 받은 것을 넣어주세요." };
  }

  const changes: MergeChange[] = [];
  const next: Product = { ...product };
  const cost: CostInputs = { ...product.cost, returnModel: { ...product.cost.returnModel } };

  // 다른 상품의 정보를 잘못 붙여넣는 사고를 막는다
  const idOf = (u: string) => (u.match(/(\d{5,})/) || [])[1] || "";
  const mine = idOf(product.sourceUrl || "");
  const theirs = idOf(r.sourceUrl || "");
  const urlMismatch = mine && theirs && mine !== theirs
    ? `담아둔 상품은 ${mine}번인데 붙여넣은 것은 ${theirs}번입니다`
    : undefined;

  // 이름 — 목록에서 읽은 것보다 상세 페이지 쪽이 정확하다
  if (r.name && r.name !== product.name) {
    changes.push({ label: "상품명", before: product.name, after: r.name, affectsProfit: false });
    next.name = r.name;
  }

  if (r.supplierName && r.supplierName !== product.supplierName) {
    changes.push({ label: "도매처", before: product.supplierName || "(없음)", after: r.supplierName, affectsProfit: false });
    next.supplierName = r.supplierName;
  }

  if (r.sourceUrl && !product.sourceUrl) next.sourceUrl = r.sourceUrl;

  // 공급가 — 손익이 바뀐다
  if (r.supplyPriceKrw > 0 && r.supplyPriceKrw !== product.cost.supplyPriceKrw) {
    changes.push({
      label: "공급가",
      before: formatKrw(product.cost.supplyPriceKrw),
      after: formatKrw(r.supplyPriceKrw),
      affectsProfit: true,
    });
    cost.supplyPriceKrw = r.supplyPriceKrw;
  }

  // 배송비 — 목록에서는 못 읽는 값이라 대개 여기서 처음 채워진다
  if (r.shippingKrw > 0 && r.shippingKrw !== product.cost.shippingKrw) {
    changes.push({
      label: "배송비",
      before: product.cost.shippingKrw > 0 ? formatKrw(product.cost.shippingKrw) : "몰랐음",
      after: formatKrw(r.shippingKrw),
      affectsProfit: true,
    });
    cost.shippingKrw = r.shippingKrw;
  }

  // 최소구매수량 — 위탁이 성립하는지를 가른다
  const curQty = Math.max(1, product.cost.minOrderQty ?? 1);
  if (r.minOrderQty > 0 && r.minOrderQty !== curQty) {
    changes.push({
      label: "최소구매수량",
      before: `${curQty}개`,
      after: `${r.minOrderQty}개`,
      affectsProfit: true,
    });
    cost.minOrderQty = r.minOrderQty;
  }

  // 옵션 — 이미 끈 옵션은 꺼둔 채로 둔다
  const sameOptions =
    product.options.length === r.options.length &&
    r.options.every((o) => {
      const prev = product.options.find((p) => optionKey(p.name) === optionKey(o.name));
      return prev && prev.addPriceKrw === o.addPriceKrw &&
        prev.supplyPriceKrw === (o.supplyPriceKrw || cost.supplyPriceKrw);
    });

  if (r.options.length && !sameOptions) {
    const wasOff = new Set(
      product.options.filter((o) => !o.enabled).map((o) => optionKey(o.name))
    );
    const merged: ProductOption[] = r.options.map((o) => {
      const prev = product.options.find((p) => optionKey(p.name) === optionKey(o.name));
      return {
        id: prev?.id ?? newId("o"),
        name: o.name,
        supplyPriceKrw: o.supplyPriceKrw || cost.supplyPriceKrw,
        addPriceKrw: o.addPriceKrw,
        supplierStock: prev?.supplierStock ?? "IN_STOCK",
        enabled: wasOff.has(optionKey(o.name)) ? false : (prev?.enabled ?? true),
      };
    });
    changes.push({
      label: "옵션",
      before: product.options.length ? `${product.options.length}개` : "없었음",
      after: `${merged.length}개`,
      affectsProfit: true,
    });
    next.options = merged;
  }

  const specSig = (list: { key: string; value: string }[]) =>
    list.map((s) => `${s.key}=${s.value}`).join("|");
  if (r.specs.length && specSig(r.specs) !== specSig(product.specs)) {
    changes.push({
      label: "스펙",
      before: product.specs.length ? `${product.specs.length}개` : "없었음",
      after: `${r.specs.length}개`,
      affectsProfit: false,
    });
    next.specs = r.specs;
  }

  // 도매처 반품정책 — 내 판매자 정책은 건드리지 않는다
  const prevPol = product.supplierReturnPolicy;
  const samePolicy =
    !!prevPol &&
    prevPol.returnFeeKrw === r.returnPolicy?.returnFeeKrw &&
    prevPol.exchangeFeeKrw === r.returnPolicy?.exchangeFeeKrw &&
    prevPol.freeReturnDays === r.returnPolicy?.freeReturnDays;

  if (r.returnPolicy && !samePolicy) {
    changes.push({
      label: "도매처 반품정책",
      before: product.supplierReturnPolicy ? "있었음" : "몰랐음",
      after: typeof r.returnPolicy.returnFeeKrw === "number"
        ? `반품비 ${formatKrw(r.returnPolicy.returnFeeKrw)}`
        : "읽음",
      affectsProfit: false,
    });
    next.supplierReturnPolicy = {
      ...r.returnPolicy,
      source: "supplier",
      sourceUrl: r.sourceUrl || product.sourceUrl,
      capturedAt: Date.now(),
      // 고객 안내로 쓸지는 사람이 정한다 — 자동으로 승인하지 않는다
      approvedForCustomer: product.supplierReturnPolicy?.approvedForCustomer ?? false,
    };
  }

  const missing = [...r.missing];
  if (product.price.buyerPaidKrw <= 0) missing.push("판매가");

  return {
    ok: true,
    urlMismatch,
    product: next,
    cost,
    changes,
    missing,
    message: changes.length
      ? `${changes.length}가지를 채웠습니다.`
      : "새로 채울 것이 없습니다 — 이미 같은 내용입니다.",
  };
}
