// ============================================================
// 크롬 확장 → 앱 상품 가져오기
// ★ 원칙: 확장이 가져올 수 있는 정보는 사용자가 다시 입력하지 않는다.
// ============================================================

/** 확장이 보낸 옵션 1개 */
export interface ImportedOption {
  name: string;
  supplyPriceKrw: number;
  addPriceKrw: number;
}

export interface ImportedReturnPolicy {
  freeReturnDays?: number;
  defectReturnDays?: number;
  returnFeeKrw?: number;
  exchangeFeeKrw?: number;
  rawText?: string;
}

export interface ProductImportResult {
  ok: boolean;
  name: string;
  supplyPriceKrw: number;
  shippingKrw: number;
  sourceUrl: string;
  supplierName: string;
  /** 옵션 — 이름 + 추가금 */
  options: ImportedOption[];
  /** 스펙 key-value — 그대로 상품에 저장한다 */
  specs: { key: string; value: string }[];
  /** 도매처 반품 정책 (찾은 경우만) */
  returnPolicy?: ImportedReturnPolicy;
  /** 도매처 최소구매수량 (기본 1) */
  minOrderQty: number;
  imageCount: number;
  /** 사용자가 직접 채워야 하는 항목 */
  missing: string[];
  message: string;
}

const EMPTY: ProductImportResult = {
  ok: false, name: "", supplyPriceKrw: 0, shippingKrw: 0, sourceUrl: "",
  supplierName: "", options: [], specs: [], imageCount: 0, missing: [], minOrderQty: 1,
  message: "확장에서 복사한 데이터가 아닙니다.",
};

const OPTION_KEY = /(색상|색깔|컬러|사이즈|규격|옵션|종류|스타일|수량|타입|color|size|style)/i;
/** "수량"이 들어가지만 옵션이 아닌 항목 — 옵션으로 잘못 읽히면 안 된다 */
const NOT_OPTION = /(최소구매|구매수량|재고|판매수량|누적)/;
const JUNK = /^(가격|배송|리뷰|구매|평점|판매|무료|쿠폰|할인|장바구니|바로구매|[\d,.\s]+원?)$/i;

/**
 * 옵션 표기 1개를 파싱.
 *
 *   "G1화이트"              → { name:"G1화이트", addPriceKrw:0 }
 *   "대형 (+2,000원)"       → { name:"대형", addPriceKrw:2000 }        ← 판매가 추가금
 *   "케이스5장 [3000]"      → { name:"케이스5장", supplyPriceKrw:3000 } ← 옵션별 공급가
 *
 * ★ 대괄호와 괄호를 구분하는 이유
 *   도매처가 옵션마다 다르게 매기는 건 대부분 "내가 사는 값(공급가)"이지
 *   "고객에게 파는 값(판매가)"이 아니다. 둘을 섞으면 손익이 거꾸로 계산된다.
 *   확장은 공급가를 알면 대괄호로 보낸다.
 */
export function parseOptionToken(
  token: string
): { name: string; addPriceKrw: number; supplyPriceKrw?: number } | null {
  let t = (token ?? "").trim();
  if (!t || JUNK.test(t)) return null;

  let supplyPriceKrw: number | undefined;
  const sup = t.match(/\[\s*([\d,]+)\s*\]$/);
  if (sup) {
    supplyPriceKrw = parseInt(sup[1].replace(/,/g, ""), 10);
    t = t.slice(0, sup.index).trim();
    if (!t) return null;
  }

  const m = t.match(/^(.*?)\s*\(?\s*([+-])\s*([\d,]+)\s*원?\s*\)?$/);
  if (m && m[1].trim()) {
    const sign = m[2] === "-" ? -1 : 1;
    return {
      name: m[1].trim(),
      addPriceKrw: sign * parseInt(m[3].replace(/,/g, ""), 10),
      supplyPriceKrw,
    };
  }
  const name = t.replace(/\(\s*\)$/, "").trim();
  return name ? { name, addPriceKrw: 0, supplyPriceKrw } : null;
}

/** raw 영역에서 옵션/스펙을 뽑는다 */
export function parseRawInfo(text: string): {
  options: ImportedOption[];
  specs: { key: string; value: string }[];
} {
  const lines = (text ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const options: ImportedOption[] = [];
  const specs: { key: string; value: string }[] = [];
  const seenOpt = new Set<string>();
  const seenSpec = new Set<string>();

  for (const raw of lines) {
    const line = raw.replace(/^[·•\-*▶●]\s*/, "").trim();
    if (!line || JUNK.test(line)) continue;

    const m = line.match(/^(.{1,20}?)\s*[:：]\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (OPTION_KEY.test(key) && !NOT_OPTION.test(key)) {
        // ★ 옵션 줄은 길이 제한을 두지 않는다.
        //   옵션이 수십 개인 상품은 한 줄이 수백 자가 된다 (도매꾹 우산 = 9개, 300자+).
        if (val.length > 3000) continue;
        // ★ 천 단위 구분자(-2,500원)를 옵션 구분자로 오인하지 않도록 먼저 제거한다.
        const safe = val.replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
        safe.split(/[,，、|]+/).forEach((tok) => {
          const o = parseOptionToken(tok);
          if (!o || o.name.length > 30) return;
          const k = o.name.toLowerCase();
          if (seenOpt.has(k)) return;
          seenOpt.add(k);
          options.push({
            name: o.name,
            supplyPriceKrw: o.supplyPriceKrw ?? 0,
            addPriceKrw: o.addPriceKrw,
          });
        });
      } else if (line.length <= 90 && val.length <= 60 && !seenSpec.has(key)) {
        seenSpec.add(key);
        specs.push({ key, value: val });
      }
      continue;
    }
    if (line.length > 90) continue;
    if (raw.match(/^[·•\-*▶●]/) && line.length >= 3 && !seenSpec.has(line)) {
      seenSpec.add(line);
      specs.push({ key: "특징", value: line });
    }
  }
  return { options: options.slice(0, 50), specs: specs.slice(0, 20) };
}

/** 반품 정책 문구에서 일수·금액을 뽑는다. 못 찾으면 undefined */
export function parseReturnPolicy(text: string): ImportedReturnPolicy | undefined {
  const t = (text ?? "").replace(/\s+/g, " ");
  if (!t) return undefined;

  const free = t.match(/(\d+)\s*일\s*(?:이내)?\s*무(?:료|상)\s*반품/);
  const defectMonth = t.match(/(?:하자|불량)[^.]{0,25}?(\d+)\s*개월/) || t.match(/(\d+)\s*개월[^.]{0,25}?(?:하자|불량)/);
  const defectDay = t.match(/(?:하자|불량)[^.]{0,25}?(\d+)\s*일/);
  const rFee = t.match(/반품\s*배송비\s*:?\s*([\d,]+)\s*원/);
  const eFee = t.match(/교환\s*배송비\s*:?\s*([\d,]+)\s*원/);

  const out: ImportedReturnPolicy = {
    freeReturnDays: free ? parseInt(free[1], 10) : undefined,
    defectReturnDays: defectMonth
      ? parseInt(defectMonth[1], 10) * 30
      : defectDay ? parseInt(defectDay[1], 10) : undefined,
    returnFeeKrw: rFee ? parseInt(rFee[1].replace(/,/g, ""), 10) : undefined,
    exchangeFeeKrw: eFee ? parseInt(eFee[1].replace(/,/g, ""), 10) : undefined,
    rawText: t.slice(0, 500),
  };
  const found = out.freeReturnDays || out.defectReturnDays || out.returnFeeKrw || out.exchangeFeeKrw;
  return found ? out : undefined;
}

const num = (s?: string): number => {
  const n = parseFloat((s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * 확장이 복사한 블록을 파싱.
 *   ##AISOS##
 *   name / price / shipping / supplier / url / images
 *   raw:      ← 옵션·스펙
 *   policy:   ← 반품/교환 정책 원문 (선택)
 */
export function parseProductBlock(text: string): ProductImportResult {
  if (!text || !text.includes("##AISOS##")) return { ...EMPTY };

  const body = text.slice(text.indexOf("##AISOS##") + "##AISOS##".length);
  const lines = body.split(/\r?\n/);

  const fields: Record<string, string> = {};
  let rawStart = -1;
  let policyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const low = line.toLowerCase();
    if (low === "raw:") { rawStart = i + 1; continue; }
    if (low === "policy:") { policyStart = i + 1; continue; }
    if (rawStart >= 0 || policyStart >= 0) continue;
    const m = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }

  const sliceBlock = (start: number): string => {
    if (start < 0) return "";
    const end = [rawStart, policyStart].filter((x) => x > start).sort((a, b) => a - b)[0];
    return lines.slice(start, end !== undefined ? end - 1 : undefined).join("\n");
  };

  const raw = sliceBlock(rawStart);
  const policyText = sliceBlock(policyStart);
  const { options, specs } = parseRawInfo(raw);

  const supplyPriceKrw = num(fields.price);
  // 옵션에 개별 공급가가 없으면 상품 공급가를 채운다 (다시 입력하지 않게)
  const filledOptions = options.map((o) => ({
    ...o,
    supplyPriceKrw: o.supplyPriceKrw || supplyPriceKrw,
  }));

  const imageCount = (fields.images || "")
    .split(/[\s,]+/)
    .filter((s) => /^https?:\/\//i.test(s)).length;

  const returnPolicy = parseReturnPolicy(policyText || raw);

  const name = fields.name || "";
  const shippingKrw = num(fields.shipping);

  // 최소구매수량 — 위탁판매 성립 여부를 가르는 값이라 별도로 뽑는다
  const minSpec = specs.find((sp) => /최소구매/.test(sp.key));
  const minOrderQty = Math.max(1, num(minSpec?.value) || 1);

  const missing: string[] = [];
  if (!name) missing.push("상품명");
  if (!supplyPriceKrw) missing.push("공급가");
  if (!shippingKrw) missing.push("배송비");
  if (!returnPolicy?.returnFeeKrw) missing.push("반품 배송비");

  return {
    ok: true,
    name,
    supplyPriceKrw,
    shippingKrw,
    sourceUrl: fields.url || "",
    supplierName: fields.supplier || "",
    options: filledOptions,
    specs,
    returnPolicy,
    minOrderQty,
    imageCount,
    missing,
    message: missing.length
      ? `가져왔습니다. ${missing.join("·")}만 확인해 주세요.`
      : `${name} — 전부 가져왔습니다.`,
  };
}
