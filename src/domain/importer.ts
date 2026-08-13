// ============================================================
// 크롬 확장 → 앱 가져오기 파서 (Phase 2)
// 확장이 만든 ##AISOS## 블록을 파싱해 상품 등록 필드로 변환.
// ============================================================

import type { Currency } from "./types";
import { parsePastedInfo } from "./detailPage";

export interface ImportResult {
  ok: boolean;
  name: string;
  currency: Currency;
  price: number;
  shipping: number;
  url: string;
  options: string[];
  features: string[];
}

const CURRENCIES: Currency[] = ["KRW", "CNY", "USD"];

/**
 * 확장이 클립보드에 복사한 블록을 파싱.
 * 형식:
 *   ##AISOS##
 *   name: ...
 *   currency: KRW
 *   price: 3723
 *   shipping: 0
 *   url: ...
 *   raw:
 *   <선택 영역 텍스트 여러 줄>
 */
export function parseImportBlock(text: string): ImportResult {
  const empty: ImportResult = {
    ok: false, name: "", currency: "CNY", price: 0, shipping: 0, url: "", options: [], features: [],
  };
  if (!text || !text.includes("##AISOS##")) return empty;

  const body = text.slice(text.indexOf("##AISOS##") + "##AISOS##".length);
  const lines = body.split(/\r?\n/);

  const fields: Record<string, string> = {};
  let rawStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase() === "raw:") { rawStart = i + 1; break; }
    const m = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  const raw = rawStart >= 0 ? lines.slice(rawStart).join("\n") : "";
  const parsed = parsePastedInfo(raw);

  const currency = CURRENCIES.includes((fields.currency || "").toUpperCase() as Currency)
    ? (fields.currency.toUpperCase() as Currency)
    : "CNY";

  const num = (s?: string) => {
    const n = parseFloat((s || "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  return {
    ok: true,
    name: fields.name || "",
    currency,
    price: num(fields.price),
    shipping: num(fields.shipping),
    url: fields.url || "",
    options: parsed.options,
    features: parsed.features,
  };
}
