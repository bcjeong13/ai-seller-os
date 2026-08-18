// ============================================================
// 주문 붙여넣기 파서 (개발지시서 §9 P0-3)
// 마켓 판매자센터에서 주문 목록을 복사 → Ctrl+V → 자동 인식.
// 마켓마다 컬럼 이름·순서가 다르므로 "키워드 매칭 + 수동 보정" 구조로 만든다.
// ★ 개인정보를 다루므로 파싱 결과를 로그에 남기지 않는다.
// ============================================================

export type OrderField =
  | "marketOrderNo" | "productName" | "optionName" | "quantity"
  | "listPrice" | "discount" | "buyerPaid" | "buyerShipping"
  | "recipientName" | "phone" | "address" | "postalCode" | "memo";

/** 필드별 인식 키워드 — 마켓별 표기 차이를 흡수한다 */
const FIELD_KEYWORDS: Record<OrderField, string[]> = {
  marketOrderNo: ["주문번호", "주문 번호", "상품주문번호", "orderid", "order_no", "주문아이디"],
  productName:   ["상품명", "상품 이름", "product", "상품이름"],
  optionName:    ["옵션", "옵션명", "옵션정보", "선택옵션", "option"],
  quantity:      ["수량", "주문수량", "구매수량", "qty", "quantity"],
  listPrice:     ["판매가", "상품가격", "정상가", "판매단가", "상품금액"],
  discount:      ["할인", "즉시할인", "할인금액", "discount"],
  buyerPaid:     ["결제금액", "실결제", "구매자결제", "총결제금액", "결제액"],
  buyerShipping: ["배송비", "배송비합계", "배송비금액", "shipping"],
  recipientName: ["수취인", "수령인", "받는사람", "수취인명", "수취인이름", "받는분"],
  phone:         ["연락처", "전화", "휴대폰", "수취인연락처", "전화번호", "핸드폰"],
  address:       ["주소", "배송지", "배송주소", "수취인주소"],
  postalCode:    ["우편번호", "우편", "zipcode", "zip"],
  memo:          ["배송메모", "배송요청", "요청사항", "메모"],
};

/** 반드시 있어야 하는 필드 */
const REQUIRED: OrderField[] = ["marketOrderNo", "productName", "quantity"];

export interface ParsedOrderRow {
  marketOrderNo: string;
  productName: string;
  optionName: string;
  quantity: number;
  listPriceKrw: number;
  discountKrw: number;
  buyerPaidKrw: number;
  buyerShippingKrw: number;
  /** 개인정보 — 별도 저장소로 분리해서 보관한다 */
  recipientName: string;
  phone: string;
  address: string;
  postalCode?: string;
  memo?: string;
}

export interface ParseOrdersResult {
  ok: boolean;
  rows: ParsedOrderRow[];
  headers: string[];
  /** 필드 → 컬럼 인덱스. 사용자가 화면에서 수정할 수 있다 */
  mapping: Partial<Record<OrderField, number>>;
  /** 인식하지 못한 필수 필드 */
  missing: OrderField[];
  message: string;
}

export const FIELD_LABEL: Record<OrderField, string> = {
  marketOrderNo: "주문번호",
  productName: "상품명",
  optionName: "옵션",
  quantity: "수량",
  listPrice: "판매가",
  discount: "할인",
  buyerPaid: "결제금액",
  buyerShipping: "배송비",
  recipientName: "수취인",
  phone: "연락처",
  address: "주소",
  postalCode: "우편번호",
  memo: "배송메모",
};

// ------------------------------------------------------------

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/[\s_\-()[\]]/g, "");
}

/** 탭이 있으면 탭, 없으면 쉼표로 분리 (엑셀 복사는 대부분 탭) */
function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs >= commas && tabs > 0 ? "\t" : ",";
}

function splitLine(line: string, delim: string): string[] {
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  // 쉼표 구분 — 큰따옴표 안의 쉼표는 보존
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** 헤더 행에서 필드 → 컬럼 인덱스 매핑을 추론 */
export function inferMapping(headers: string[]): Partial<Record<OrderField, number>> {
  const map: Partial<Record<OrderField, number>> = {};
  const used = new Set<number>();
  const norm = headers.map(normalize);

  // 긴 키워드부터 매칭해야 "주문번호"가 "번호"보다 먼저 잡힌다
  (Object.keys(FIELD_KEYWORDS) as OrderField[]).forEach((field) => {
    const keys = [...FIELD_KEYWORDS[field]].sort((a, b) => b.length - a.length);
    for (const k of keys) {
      const nk = normalize(k);
      const idx = norm.findIndex((h, i) => !used.has(i) && h.includes(nk));
      if (idx >= 0) { map[field] = idx; used.add(idx); return; }
    }
  });
  return map;
}

const toNum = (s?: string): number => {
  const n = parseFloat((s ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * 붙여넣은 텍스트를 주문 목록으로 변환.
 * @param overrideMapping 사용자가 화면에서 컬럼을 직접 지정한 경우
 */
export function parseOrders(
  text: string,
  overrideMapping?: Partial<Record<OrderField, number>>
): ParseOrdersResult {
  const empty: ParseOrdersResult = {
    ok: false, rows: [], headers: [], mapping: {}, missing: [...REQUIRED],
    message: "붙여넣은 내용이 없습니다.",
  };
  if (!text || !text.trim()) return empty;

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { ...empty, message: "헤더 행과 주문 행이 각각 최소 1줄씩 필요합니다." };
  }

  const delim = detectDelimiter(lines);
  const headers = splitLine(lines[0], delim);
  const mapping = overrideMapping ?? inferMapping(headers);
  const missing = REQUIRED.filter((f) => mapping[f] === undefined);

  if (missing.length > 0) {
    return {
      ok: false, rows: [], headers, mapping, missing,
      message: `필수 항목을 찾지 못했습니다: ${missing.map((m) => FIELD_LABEL[m]).join(", ")}. 아래에서 컬럼을 직접 지정해 주세요.`,
    };
  }

  const at = (cells: string[], f: OrderField): string => {
    const i = mapping[f];
    return i !== undefined && i < cells.length ? cells[i] : "";
  };

  const rows: ParsedOrderRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const orderNo = at(cells, "marketOrderNo");
    const name = at(cells, "productName");
    if (!orderNo || !name) continue; // 합계행·빈행 제외

    const listPrice = toNum(at(cells, "listPrice"));
    const discount = toNum(at(cells, "discount"));
    const paidRaw = toNum(at(cells, "buyerPaid"));
    // 결제금액 컬럼이 없으면 판매가 − 할인으로 보정
    const buyerPaid = paidRaw > 0 ? paidRaw : Math.max(0, listPrice - discount);

    rows.push({
      marketOrderNo: orderNo,
      productName: name,
      optionName: at(cells, "optionName"),
      quantity: Math.max(1, toNum(at(cells, "quantity")) || 1),
      listPriceKrw: listPrice > 0 ? listPrice : buyerPaid,
      discountKrw: discount,
      buyerPaidKrw: buyerPaid,
      buyerShippingKrw: toNum(at(cells, "buyerShipping")),
      recipientName: at(cells, "recipientName"),
      phone: at(cells, "phone"),
      address: at(cells, "address"),
      postalCode: at(cells, "postalCode") || undefined,
      memo: at(cells, "memo") || undefined,
    });
  }

  if (rows.length === 0) {
    return { ...empty, headers, mapping, missing: [], message: "주문 행을 찾지 못했습니다. 헤더 행이 첫 줄에 있는지 확인해 주세요." };
  }

  return {
    ok: true, rows, headers, mapping, missing: [],
    message: `${rows.length}건을 인식했습니다.`,
  };
}

// ------------------------------------------------------------
// 중복 방지 (지시서 §5) — 같은 주문을 두 번 넣으면 돈이 두 번 나간다
// ------------------------------------------------------------

/** 마켓 + 주문번호 + 옵션 조합을 중복 판정 키로 쓴다 */
export function dedupeKey(marketOrderNo: string, optionName: string): string {
  return `${marketOrderNo.trim()}::${(optionName ?? "").trim()}`;
}

export interface DedupeResult {
  fresh: ParsedOrderRow[];
  duplicates: ParsedOrderRow[];
}

export function splitDuplicates(
  rows: ParsedOrderRow[],
  existingKeys: Set<string>
): DedupeResult {
  const fresh: ParsedOrderRow[] = [];
  const duplicates: ParsedOrderRow[] = [];
  const seen = new Set(existingKeys);
  for (const r of rows) {
    const k = dedupeKey(r.marketOrderNo, r.optionName);
    if (seen.has(k)) { duplicates.push(r); continue; }
    seen.add(k);
    fresh.push(r);
  }
  return { fresh, duplicates };
}
