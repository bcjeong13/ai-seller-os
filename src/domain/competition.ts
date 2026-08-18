// ============================================================
// 경쟁상품 분석 — "정말 비슷한 상품과 비교했는가"
//
// ★ 최저가를 찾는 게 아니다. 내 상품이 설 자리가 있는지 본다.
// ★ 검색 결과를 통째로 평균내지 않는다. 직접 경쟁상품만 골라 가격대를 만든다.
// ★ 분류는 결정론적 코드로 한다 (지시서: 계산은 코드).
//   AI가 임의로 "이건 경쟁상품이다"라고 정하지 않는다. 규칙과 근거를 남긴다.
// ★ 신뢰도 %를 만들지 않는다. 몇 개를 어떻게 분류했는지 그대로 보여준다.
// ============================================================

import { formatKrw } from "./money";

export type CompTier =
  | "DIRECT"    // 🟢 구매자가 실제로 비교할 상품
  | "SIMILAR"   // 🟡 용도는 같지만 사양이 다름
  | "INDIRECT"; // ⚪ 검색어만 겹침 — 가격 판단에서 뺀다

export interface CompetitorRaw {
  name: string;
  priceKrw: number;
  /** 소비자가 따로 내는 배송비. 무료면 0 */
  shippingKrw?: number;
  mall?: string;
}

export interface Competitor extends CompetitorRaw {
  tier: CompTier;
  /** 실질 구매가 = 상품가 + 소비자 부담 배송비 */
  effectiveKrw: number;
  hasBrand: boolean;
  /** 내 상품명과 겹친 낱말 */
  matched: string[];
  reason: string;
}

/** 브랜드로 보이는 낱말 — 무브랜드 상품과 섞으면 가격대가 망가진다 */
const BRAND_WORDS = [
  "나이키", "아디다스", "뉴발란스", "노스페이스", "코오롱", "블랙야크", "k2",
  "샤넬", "구찌", "루이비통", "프라다", "버버리", "몽클레어",
  "다이슨", "필립스", "샤오미", "브라운", "테팔", "락앤락", "쿠쿠", "쿠첸",
  "삼성", "엘지", "lg", "애플", "apple", "소니", "jbl", "보스",
  "디즈니", "카카오프렌즈", "라인프렌즈", "산리오", "포켓몬", "마블",
  "스타벅스", "코카콜라", "3m", "옥소", "휘슬러", "실리트",
  "닥스", "헤지스", "빈폴", "라코스테", "폴로", "타미", "리복", "퓨마", "컨버스", "반스",
  "아놀드파마", "잭니클라우스", "크로커다일", "지오지아", "쌤소나이트", "네파", "밀레",
];

/** 구성이 다르다는 신호 — 5개 세트를 1개 상품과 비교하면 안 된다 */
const BUNDLE_RE = /(\d+\s*(개|p|pcs|매|장|팩|세트|묶음)|세트|묶음|대용량|벌크)/i;

/** 의미 없는 낱말 — 겹쳐도 유사도로 치지 않는다 */
const STOP_WORDS = new Set([
  "무료배송", "무료", "배송", "당일", "당일발송", "국내산", "정품", "신상", "인기",
  "best", "new", "sale", "특가", "할인", "이벤트", "사은품", "증정", "추천",
  "남녀공용", "남녀", "공용", "모음", "택1", "선택", "옵션", "다양한", "고급",
]);

/** 상품명을 낱말로 쪼갠다 */
export function tokenize(name: string): string[] {
  return (name || "")
    .toLowerCase()
    .replace(/[[\]()（）{}<>·,./\\|~!@#$%^&*_+=?"'`:;]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function hasBrand(tokens: string[], name: string): boolean {
  const n = name.toLowerCase().replace(/\s+/g, "");
  return BRAND_WORDS.some((b) => n.includes(b)) || tokens.some((t) => BRAND_WORDS.includes(t));
}

export interface ClassifyOptions {
  /** 내 상품이 무브랜드면 브랜드 상품을 직접 경쟁에서 뺀다 */
  myHasBrand?: boolean;
  /** 내 상품의 구성 수량 (기본 1) */
  myBundle?: boolean;
}

/**
 * 경쟁상품 하나를 분류한다.
 * 규칙 (양쪽 이름 기준 중 높은 겹침 비율을 쓴다):
 *   0.5 이상 → DIRECT
 *   0.2 이상 → SIMILAR
 *   그 외    → INDIRECT
 * 브랜드 상품과 묶음/세트는 각각 한 단계씩 내린다.
 */
export function classify(
  myName: string,
  c: CompetitorRaw,
  opt: ClassifyOptions = {}
): Competitor {
  const mine = tokenize(myName);
  const theirs = tokenize(c.name);
  const mineSet = new Set(mine);
  const matched = theirs.filter((t) => mineSet.has(t));

  // ★ 한쪽 이름이 길다고 유사도가 낮아지면 안 된다.
  //   "3단 자동 우산 UV차단 암막 양산" vs "5단 수동 우산" 은 용도가 같다.
  //   그래서 양쪽 기준 중 높은 쪽을 쓴다.
  const sim = Math.max(
    mine.length ? matched.length / mine.length : 0,
    theirs.length ? matched.length / theirs.length : 0
  );

  let tier: CompTier = sim >= 0.5 ? "DIRECT" : sim >= 0.2 ? "SIMILAR" : "INDIRECT";

  const reasons: string[] = [];
  const brand = hasBrand(theirs, c.name);
  const bundle = BUNDLE_RE.test(c.name);

  const stepDown = () => { tier = tier === "DIRECT" ? "SIMILAR" : "INDIRECT"; };

  if (brand && !opt.myHasBrand) {
    stepDown();
    reasons.push("브랜드 상품 — 무브랜드와 가격대가 다릅니다");
  }
  if (bundle && !opt.myBundle) {
    stepDown();
    reasons.push("묶음/세트 구성 — 1개 상품과 직접 비교할 수 없습니다");
  }

  if (!reasons.length) {
    reasons.push(
      tier === "DIRECT" ? `핵심 낱말이 겹칩니다 (${matched.slice(0, 4).join(", ")})`
      : tier === "SIMILAR" ? "용도는 비슷하지만 사양이 다를 수 있습니다"
      : "검색어만 겹칩니다"
    );
  }

  const shipping = Math.max(0, c.shippingKrw ?? 0);
  return {
    ...c,
    tier,
    effectiveKrw: Math.round(c.priceKrw + shipping),
    hasBrand: brand,
    matched,
    reason: reasons.join(" · "),
  };
}

// ------------------------------------------------------------
// 가격대
// ------------------------------------------------------------

export interface PriceBand {
  lowest: number;
  p25: number;
  median: number;
  p75: number;
  highest: number;
  count: number;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function bandOf(values: number[]): PriceBand | undefined {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return undefined;
  return {
    lowest: s[0],
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    highest: s[s.length - 1],
    count: s.length,
  };
}

/** 가격대를 만들 때 직접 경쟁이 이만큼은 있어야 믿을 만하다 */
export const MIN_DIRECT = 5;

export interface CompetitionAnalysis {
  competitors: Competitor[];
  directCount: number;
  similarCount: number;
  indirectCount: number;
  brandCount: number;
  /** 가격대 (실질 구매가 기준) */
  band?: PriceBand;
  /** 무엇을 근거로 가격대를 만들었나 */
  basis: "DIRECT" | "DIRECT_SIMILAR" | "NONE";
  /** 직접 경쟁상품이 충분한가 — 부족하면 가격만으로 판단하면 안 된다 */
  enough: boolean;
  note: string;
}

export function analyzeCompetition(
  myName: string,
  raws: CompetitorRaw[],
  opt: ClassifyOptions = {}
): CompetitionAnalysis {
  const competitors = raws
    .filter((r) => r.name && r.priceKrw > 0)
    .map((r) => classify(myName, r, opt));

  const direct = competitors.filter((c) => c.tier === "DIRECT");
  const similar = competitors.filter((c) => c.tier === "SIMILAR");
  const indirect = competitors.filter((c) => c.tier === "INDIRECT");

  let basis: CompetitionAnalysis["basis"] = "NONE";
  let band: PriceBand | undefined;

  if (direct.length >= MIN_DIRECT) {
    basis = "DIRECT";
    band = bandOf(direct.map((c) => c.effectiveKrw));
  } else if (direct.length + similar.length > 0) {
    basis = "DIRECT_SIMILAR";
    band = bandOf([...direct, ...similar].map((c) => c.effectiveKrw));
  }

  const enough = direct.length >= MIN_DIRECT;
  const note = enough
    ? `직접 비교 가능한 상품 ${direct.length}개로 가격대를 잡았습니다`
    : direct.length + similar.length > 0
      ? `직접 비교 가능한 상품이 ${direct.length}개뿐입니다 — 유사 상품까지 합쳐 참고용으로만 잡았습니다`
      : "비교할 상품을 찾지 못했습니다 — 가격만으로 판단하지 마세요";

  return {
    competitors,
    directCount: direct.length,
    similarCount: similar.length,
    indirectCount: indirect.length,
    brandCount: competitors.filter((c) => c.hasBrand).length,
    band,
    basis,
    enough,
    note,
  };
}

// ------------------------------------------------------------
// 내 가격의 위치 — 최저가일 필요는 없다
// ------------------------------------------------------------

export type PricePosition = "VERY_GOOD" | "GOOD" | "OK" | "WEAK" | "HARD";

export const POSITION_LABEL: Record<PricePosition, string> = {
  VERY_GOOD: "🟢 매우 유리",
  GOOD: "🟢 경쟁력 있음",
  OK: "🟡 판매 가능",
  WEAK: "🟠 가격 경쟁력 낮음",
  HARD: "🔴 시장 진입 어려움",
};

export interface PositionResult {
  position: PricePosition;
  /** 중간 가격 대비 (%) — 양수면 비싸다 */
  vsMedianPct: number;
  vsHighestPct: number;
  text: string;
  advice: string;
}

export function positionOf(myPriceKrw: number, band: PriceBand): PositionResult {
  const vsMedianPct = band.median > 0 ? ((myPriceKrw - band.median) / band.median) * 100 : 0;
  const vsHighestPct = band.highest > 0 ? ((myPriceKrw - band.highest) / band.highest) * 100 : 0;

  let position: PricePosition;
  let advice: string;

  if (vsMedianPct <= 5) {
    position = "VERY_GOOD";
    advice = "가격만으로도 충분히 팔립니다. 더 내릴 필요 없습니다.";
  } else if (vsMedianPct <= 10) {
    position = "GOOD";
    advice = "중간 가격대입니다. 최저가 경쟁을 하지 않아도 됩니다.";
  } else if (vsMedianPct <= 20) {
    position = "OK";
    advice = "상세페이지에서 무엇이 더 나은지 보여주면 팔립니다.";
  } else if (vsMedianPct <= 30) {
    position = "WEAK";
    advice = "구성·배송·상세페이지 중 하나는 확실히 나아야 합니다.";
  } else {
    position = "HARD";
    advice = "이 가격을 받으려면 시장 상단 상품과 겨뤄야 합니다. 다른 공급처를 먼저 찾아보세요.";
  }

  const text =
    myPriceKrw <= band.lowest
      ? `시장 최저 ${formatKrw(band.lowest)}보다 낮습니다 — 더 받아도 됩니다`
      : myPriceKrw > band.highest
        ? `시장 최고 ${formatKrw(band.highest)}보다 ${formatKrw(myPriceKrw - band.highest)} 비쌉니다`
        : `시장 ${formatKrw(band.lowest)}~${formatKrw(band.highest)} 안에 있습니다`;

  return { position, vsMedianPct, vsHighestPct, text, advice };
}

// ------------------------------------------------------------
// 확장 → 앱: 경쟁상품 목록
//   ##AISOS-COMP##
//   상품명|가격|배송비|쇼핑몰
// ------------------------------------------------------------

export const COMP_HEADER = "##AISOS-COMP##";

export function parseCompetitors(text: string): CompetitorRaw[] {
  if (!text || !text.includes(COMP_HEADER)) return [];
  const body = text.slice(text.indexOf(COMP_HEADER) + COMP_HEADER.length);
  const out: CompetitorRaw[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split("|").map((s) => (s ?? "").trim());
    if (f.length < 2 || !f[0]) continue;
    const num = (s: string) => {
      const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const price = num(f[1]);
    if (price <= 0) continue;
    out.push({ name: f[0], priceKrw: price, shippingKrw: num(f[2]), mall: f[3] || undefined });
  }
  return out;
}
