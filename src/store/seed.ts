// 데모 데이터 — 처음 실행 시 화면을 바로 확인할 수 있게 한다.
// ★ 실제 고객 개인정보를 절대 쓰지 않는다 (개발지시서 §7-5).
//   아래 수취인/연락처/주소는 전부 명백한 가짜 값이다.

import type { Product } from "../domain/types";
import type { Order, ShippingInfo } from "../domain/orders";
import { makeProduct, makeOption, newId } from "../domain/factory";
import { deriveStatus } from "../domain/status";

const HOUR = 1000 * 60 * 60;

export interface SeedData {
  products: Product[];
  orders: Order[];
  shipping: ShippingInfo[];
}

export function demoData(): SeedData {
  const now = Date.now();

  // 1) 정상 — 옵션 3개, 전부 안전
  const p1 = makeProduct({
    name: "차량용 무선 핸드폰 거치대",
    supplierName: "도매꾹 · 한성유통(예시)",
    marketplace: "NAVER",
    listPriceKrw: 12900,
    supplyPriceKrw: 4200,
    shippingKrw: 2500,
    minMarginPct: 15,
    imageRightsConfirmed: true,
    options: [
      makeOption("블랙", 4200, 0),
      makeOption("화이트", 4500, 0),
      makeOption("실버", 4800, 500),
    ],
  });
  p1.sourceUrl = "https://domeggook.com/DEMO001";
  p1.status = "SELLING";
  p1.listings = p1.listings.map((l) =>
    ["NAVER", "COUPANG", "11ST"].includes(l.marketplace) ? { ...l, listed: true, listedAt: now } : l
  );

  // 2) 옵션 중 하나가 역마진 — 옵션별 손익의 핵심 데모
  const p2 = makeProduct({
    name: "캠핑 접이식 미니 테이블",
    supplierName: "도매꾹 · 아웃도어팩토리(예시)",
    marketplace: "COUPANG",
    listPriceKrw: 15900,
    supplyPriceKrw: 8800,
    shippingKrw: 3500,
    minMarginPct: 15,
    imageRightsConfirmed: true,
    options: [
      makeOption("소형", 8800, 0),
      makeOption("중형", 9900, 1000),
      makeOption("대형", 13500, 2000), // ← 역마진
    ],
  });
  p2.sourceUrl = "https://domeggook.com/DEMO002";
  p2.status = "SELLING";
  p2.listings = p2.listings.map((l) =>
    ["COUPANG", "11ST", "GMARKET"].includes(l.marketplace) ? { ...l, listed: true, listedAt: now } : l
  );

  // 3) 공급가가 올라 손실 — 발주 차단 데모
  const p3 = makeProduct({
    name: "강아지 실리콘 급식기 매트",
    supplierName: "도매꾹 · 펫라인(예시)",
    marketplace: "NAVER",
    listPriceKrw: 9900,
    supplyPriceKrw: 7800, // 등록 당시 2,850 → 인상됨
    shippingKrw: 2500,
    minMarginPct: 15,
    imageRightsConfirmed: true,
  });
  p3.baselineCost = { ...p3.baselineCost, supplyPriceKrw: 2850 };
  p3.costHistory.unshift({
    at: now - 48 * HOUR,
    supplyPriceKrw: 2850,
    shippingKrw: 2500,
    landedCostKrw: 5350,
    note: "등록",
  });
  p3.events.unshift({ at: now - 2 * HOUR, type: "COST_CHANGED", message: "공급가 인상: 2,850→7,800원" });
  p3.status = "SELLING";
  p3.listings = p3.listings.map((l) => (l.marketplace === "NAVER" ? { ...l, listed: true } : l));

  // 4) 도매처 품절
  const p4 = makeProduct({
    name: "USB 미니 가습기",
    supplierName: "도매꾹 · 리빙마트(예시)",
    marketplace: "COUPANG",
    listPriceKrw: 11900,
    supplyPriceKrw: 3600,
    shippingKrw: 2500,
    minMarginPct: 15,
  });
  p4.supplierStock = "OUT_OF_STOCK";
  p4.status = "SELLING";
  p4.listings = p4.listings.map((l) => (l.marketplace === "COUPANG" ? { ...l, listed: true } : l));

  // 5) 아직 등록 안 함 — 등록 대기 데모
  const p5 = makeProduct({
    name: "대형 캠핑 카고 수납박스",
    supplierName: "도매꾹 · 아웃도어팩토리(예시)",
    marketplace: "NAVER",
    listPriceKrw: 89000,
    supplyPriceKrw: 52000,
    shippingKrw: 9000,
    minMarginPct: 15,
  });
  p5.status = "APPROVED";
  p5.listings = p5.listings.map((l) => (l.marketplace === "NAVER" ? { ...l, pending: true } : l));

  // 6) 가격 확인이 오래됨 — 재확인 요구 데모
  const p6 = makeProduct({
    name: "실리콘 주방 집게 3종",
    supplierName: "도매꾹 · 리빙마트(예시)",
    marketplace: "11ST",
    listPriceKrw: 8900,
    supplyPriceKrw: 2900,
    shippingKrw: 2500,
    minMarginPct: 15,
  });
  p6.lastCollectedAt = now - 40 * HOUR;
  p6.status = "SELLING";
  p6.listings = p6.listings.map((l) => (l.marketplace === "11ST" ? { ...l, listed: true } : l));

  const products = [p1, p2, p3, p4, p5, p6];
  for (const p of products) p.status = deriveStatus(p);

  // ---- 주문 (개인정보는 전부 가짜) ----
  const orders: Order[] = [];
  const shipping: ShippingInfo[] = [];

  const mkOrder = (
    product: Product,
    optionName: string,
    qty: number,
    stage: Order["stage"],
    fake: { name: string; phone: string; addr: string }
  ): Order => {
    const id = newId("o");
    const opt = product.options.find((o) => o.name === optionName);
    const list = product.price.listPriceKrw + (opt?.addPriceKrw ?? 0);
    shipping.push({
      orderId: id,
      recipientName: fake.name,
      phone: fake.phone,
      address: fake.addr,
      postalCode: "00000",
      savedAt: now,
    });
    return {
      id,
      marketOrderNo: `DEMO${String(orders.length + 1).padStart(6, "0")}`,
      marketplace: product.marketplace,
      productId: product.id,
      productName: product.name,
      optionName,
      optionId: opt?.id,
      quantity: qty,
      price: { listPriceKrw: list, discountKrw: 0, buyerPaidKrw: list, buyerShippingKrw: 0 },
      stage,
      exceptions: [],
      hasShippingInfo: true,
      createdAt: now - 3 * HOUR,
      events: [{ at: now - 3 * HOUR, type: "IMPORTED", message: "주문 가져옴" }],
    };
  };

  // 발주 대기 2건 (하나는 정상, 하나는 손실 상품)
  orders.push(mkOrder(p1, "블랙", 2, "NEW", {
    name: "테스트고객A", phone: "010-0000-0001", addr: "서울특별시 강남구 테스트로 000",
  }));
  orders.push(mkOrder(p3, "", 1, "NEW", {
    name: "테스트고객B", phone: "010-0000-0002", addr: "경기도 성남시 예시대로 000",
  }));

  // 송장 입력 대기 1건
  const o3 = mkOrder(p2, "중형", 1, "ORDERED", {
    name: "테스트고객C", phone: "010-0000-0003", addr: "부산광역시 해운대구 샘플로 000",
  });
  o3.orderedAt = now - 20 * HOUR;
  orders.push(o3);

  return { products, orders, shipping };
}
