// ============================================================
// 마켓 등록화면 자동 채우기 — 앱이 보내는 값
//
// ★ 확장이 사용자의 브라우저에서 폼에 값을 넣는다.
//   저장은 하지 않는다. 잘못 채워졌을 때 되돌릴 수 없기 때문이다.
//
// ★ 실제 화면을 읽어 확인한 칸만 보낸다.
//   짐작으로 보내면 엉뚱한 칸에 값이 들어가고, 조용히 틀린다.
//
// ★ 마켓별 칸 이름은 확장이 안다. 앱은 "무엇을" 보낼지만 정한다.
//   화면이 바뀌면 확장만 고치면 된다.
// ============================================================

import type { Marketplace } from "./types";
import type { MarketplaceProduct } from "./marketplaceProduct";

export const FILL_HEADER = "##AISOS-FILL##";

/** 앱이 채울 수 있는 칸 — 확장이 이 이름을 마켓별 선택자로 옮긴다 */
export type FillField =
  | "name"        // 상품명
  | "price"       // 판매가
  | "stock"       // 재고수량
  | "category"    // 카테고리 검색어
  | "detail"      // 상세설명 HTML
  | "returnFee"   // 반품배송비(편도)
  | "exchangeFee" // 교환배송비(왕복)
  | "asPhone"     // A/S 전화번호
  | "asGuide";    // A/S 안내

export interface FillInput {
  marketplace: Marketplace;
  /** 위탁이라 실재고가 없다. 도매처 재고를 그대로 쓰면 품절을 놓친다 */
  stockQty: number;
  /** 카테고리 검색창에 넣을 말 — 고르는 건 사람이 한다 */
  categoryHint?: string;
  /** 내가 고객에게 약속한 반품·교환 배송비 */
  returnFeeKrw?: number;
  exchangeFeeKrw?: number;
  /** 설정에 적어둔 내 A/S 연락처 — 도매처 번호가 아니다 */
  asPhone?: string;
}

/**
 * A/S 안내문.
 * 할 수 있는 것만 쓴다. "무상 수리" 같은 약속을 만들지 않는다.
 */
export function asGuideText(asPhone?: string): string {
  const lines = [
    "· 상품 하자·오배송은 배송비를 포함해 판매자가 처리합니다.",
    "· 제품 특성상 수리가 어려운 경우 교환 또는 반품으로 처리됩니다.",
    "· 교환·반품은 상품 수령 후 정해진 기간 안에 신청해 주세요.",
  ];
  if (asPhone?.trim()) lines.unshift(`· 문의: ${asPhone.trim()}`);
  return lines.join("\n");
}

/**
 * 확장에 넘길 블록.
 * 값에 줄바꿈이 들어갈 수 있어(상세 HTML) 한 줄로 접어서 보낸다.
 */
export function buildFillBlock(mp: MarketplaceProduct, input: FillInput): string {
  const lines: string[] = [FILL_HEADER, `site|${input.marketplace}`];

  const put = (field: FillField, value: string) => {
    if (!value) return;
    lines.push(`${field}|${value.replace(/[\r\n]+/g, "\\n")}`);
  };

  put("name", mp.name);
  put("price", String(mp.buyerPaidKrw));
  put("stock", String(Math.max(1, Math.floor(input.stockQty))));
  if (input.categoryHint) put("category", input.categoryHint);
  put("detail", mp.detailHtml);

  // 배송·A/S — 마켓 기본값을 그냥 두면 도매처가 받는 금액보다 적게 받는다
  if (typeof input.returnFeeKrw === "number") put("returnFee", String(input.returnFeeKrw));
  if (typeof input.exchangeFeeKrw === "number") put("exchangeFee", String(input.exchangeFeeKrw));
  if (input.asPhone?.trim()) {
    put("asPhone", input.asPhone.trim());
    put("asGuide", asGuideText(input.asPhone));
  }

  return lines.join("\n");
}

/** 확장이 다시 펴서 쓴다 (테스트에서 왕복을 확인한다) */
export function parseFillBlock(text: string): { site?: string; fields: Record<string, string> } {
  const out: { site?: string; fields: Record<string, string> } = { fields: {} };
  if (!text || !text.includes(FILL_HEADER)) return out;

  const body = text.slice(text.indexOf(FILL_HEADER) + FILL_HEADER.length);
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf("|");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).replace(/\\n/g, "\n");
    if (key === "site") out.site = val;
    else out.fields[key] = val;
  }
  return out;
}

/**
 * 앱이 채우지 못하는 칸 — 화면에 그대로 보여준다.
 * "자동으로 다 됐다"고 믿게 두면 안 된다.
 */
export const NOT_FILLED: { label: string; why: string }[] = [
  { label: "카테고리 선택", why: "검색어만 넣어드립니다 — 고르는 건 직접 하셔야 합니다" },
  { label: "이미지", why: "마켓 서버에 올라가야 해서 브라우저로 넣을 수 없습니다" },
  { label: "옵션", why: "네이버의 '추가상품'과 구조가 달라 잘못 넣으면 엉뚱한 값이 됩니다" },
  { label: "택배사 · 배송비 설정", why: "고르는 칸이라 값 목록을 모릅니다. 선불(주문시결제)로 두세요" },
  { label: "출고지 · 반품지", why: "반품이 돌아오는 주소입니다 — 직접 정하셔야 합니다" },
  { label: "브랜드 · 제조사", why: "그 칸에는 이름표가 없어 정확히 짚을 수 없습니다" },
  { label: "KC 안전관리 유형", why: "법적 신고 항목입니다. 프로그램이 대신 고르지 않습니다" },
  { label: "상품정보 제공고시", why: "카테고리를 고른 뒤 나타나는 칸입니다. [고시정보 복사]로 옮기세요" },
];
