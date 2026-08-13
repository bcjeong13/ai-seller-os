// 데모 상품 — 처음 실행 시 다양한 상태를 바로 보여준다.

import type { Product } from "../domain/types";
import { makeProduct } from "../domain/factory";
import { deriveStatus } from "../domain/status";

const HOUR = 1000 * 60 * 60;

export function demoProducts(): Product[] {
  const list: Product[] = [];

  // 1) 정상 판매 중 (SAFE)
  const p1 = makeProduct({
    name: "차량용 무선 핸드폰 거치대",
    marketplace: "NAVER",
    sellingPriceKrw: 12900,
    sourcePrice: 22,
    exchangeRate: 190,
    internationalShippingKrw: 1800,
    minMarginPct: 15,
  });
  p1.sourceUrl = "https://detail.1688.com/offer/DEMO001.html";

  // 2) 원가 급등으로 손실 (LOSS)
  const p2 = makeProduct({
    name: "캠핑 접이식 미니 테이블",
    marketplace: "COUPANG",
    sellingPriceKrw: 15900,
    sourcePrice: 68, // 급등 반영
    exchangeRate: 195,
    internationalShippingKrw: 3500,
    minMarginPct: 15,
  });
  p2.sourceUrl = "https://detail.1688.com/offer/DEMO002.html";
  p2.baselineCost = { ...p2.baselineCost, sourcePrice: 45 };
  p2.costHistory.unshift({
    at: Date.now() - 48 * HOUR,
    sourcePrice: 45,
    sourceCurrency: "CNY",
    exchangeRate: 195,
    internationalShippingKrw: 3500,
    productPriceKrw: Math.round(45 * 195),
    note: "등록",
  });
  p2.events.unshift({ at: Date.now() - 2 * HOUR, type: "COST_CHANGED", message: "원가 급등: 8,775→13,260원" });

  // 3) 공급처 품절 (OUT_OF_STOCK)
  const p3 = makeProduct({
    name: "강아지 실리콘 급식기 매트",
    marketplace: "NAVER",
    sellingPriceKrw: 9900,
    sourcePrice: 15,
    exchangeRate: 190,
    internationalShippingKrw: 1500,
    minMarginPct: 15,
  });
  p3.supplierStock = "OUT_OF_STOCK";

  // 4) 관부가세 발생 구간 (>20만원)
  const p4 = makeProduct({
    name: "대형 캠핑 카고 수납박스 (특대)",
    marketplace: "NAVER",
    sellingPriceKrw: 289000,
    sourcePrice: 1150, // ≈ 21.8만원 > 20만원
    exchangeRate: 190,
    internationalShippingKrw: 12000,
    minMarginPct: 15,
  });

  // 5) 데이터 노후 (30시간 전 수집)
  const p5 = makeProduct({
    name: "USB 미니 가습기",
    marketplace: "COUPANG",
    sellingPriceKrw: 11900,
    sourcePrice: 19,
    exchangeRate: 190,
    internationalShippingKrw: 1600,
    minMarginPct: 15,
  });
  p5.lastCollectedAt = Date.now() - 30 * HOUR;

  p1.channels = ["NAVER", "COUPANG", "11ST"];
  p2.channels = ["COUPANG", "11ST", "GMARKET"];
  p3.channels = ["NAVER"];
  p4.channels = ["COUPANG"];
  p5.channels = ["COUPANG", "11ST", "GMARKET"];
  p5.pendingChannels = ["NAVER"]; // 네이버 승인 대기 데모

  for (const p of [p1, p2, p3, p4, p5]) {
    p.status = deriveStatus(p);
    list.push(p);
  }
  return list;
}
