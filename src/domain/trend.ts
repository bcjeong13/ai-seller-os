// ============================================================
// 소싱 레이더 — "어제와 오늘이 무엇이 달라졌는가"
//
// ★ 이것은 핫템 추천기가 아니다.
//   시장에서 움직임이 생긴 곳을 찾아줄 뿐이고, 팔지 말지는
//   기존 심사 엔진(sourcing → screening → competition)이 정한다.
//   레이더에서 나온 것에 🟢 추천을 붙이지 않는다.
//
// ★ 점수를 만들지 않는다. 신뢰도(confidence) 같은 값도 두지 않는다.
//   대신 "며칠 관찰했는가"라는 사실을 보여준다.
//   0.7보다 "5일 관찰"이 정직하고, 사용자가 스스로 판단할 수 있다.
//
// ★ 데이터가 없으면 없다고 말한다. 이틀치로 "상승 추세"라고 하면 거짓말이다.
//
// ★ 매출을 보장하는 표현을 쓰지 않는다 (핫템·대박·잘 팔림).
// ============================================================

import { tokenize } from "./competition";
import { formatKrw } from "./money";
import type { Product } from "./types";

// ------------------------------------------------------------
// 신호
// ------------------------------------------------------------

export type SignalKind =
  | "NEW"           // 🆕 어제 목록에 없던 것
  | "GONE"          // 사라진 것 (품절·단종 가능성)
  | "RANK_UP"       // 📈 목록에서 위로 올라온 것
  | "PRICE_DROP"    // 💰 공급가가 내렸다 — 내 마진이 늘었다
  | "PRICE_RISE"    // ⚠️ 공급가가 올랐다
  | "RELATED";      // 🧭 내가 파는 카테고리 주변

export type SignalSource =
  | "DOMEGGOOK_LIST"  // 확장으로 담은 도매꾹 목록
  | "MY_PRODUCTS"     // 내 상품의 원가 이력
  | "MY_SOURCING";    // 내가 심사한 기록

/** 값의 단위 — 화면이 알아서 "9,800원 → 7,500원" / "12위 → 5위"로 쓴다 */
export type SignalUnit = "KRW" | "RANK" | "COUNT" | "NONE";

export interface TrendSignal {
  id: string;
  kind: SignalKind;
  source: SignalSource;
  /** 이 신호가 가리키는 대상 — 상품명이나 검색어 */
  subject: string;
  productId?: string;
  url?: string;
  keyword?: string;

  observedAt: number;
  /** 처음 본 시각 */
  firstSeenAt: number;
  /** 며칠 관찰했는가 — 신뢰도 대신 쓰는 사실값 */
  observedDays: number;

  value?: number;
  previousValue?: number;
  unit: SignalUnit;

  /** 왜 이 신호인가 — 사람이 읽는 한 문장 */
  evidence: string;
}

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  NEW: "🆕 새로 보임",
  GONE: "🔻 목록에서 사라짐",
  RANK_UP: "📈 위로 올라옴",
  PRICE_DROP: "💰 공급가 내림",
  PRICE_RISE: "⚠️ 공급가 오름",
  RELATED: "🧭 내 카테고리 주변",
};

// ------------------------------------------------------------
// 보관 정책 — 이걸 처음부터 넣지 않으면 두 달 뒤 저장이 실패한다
// ------------------------------------------------------------

/** 이보다 오래된 스냅샷은 버린다 */
export const MAX_SNAPSHOT_DAYS = 30;
/** 한 스냅샷에 담는 최대 항목 수 */
export const MAX_ITEMS_PER_SNAPSHOT = 300;
/** 이보다 오래된 스냅샷에서는 상품명을 지운다 (id만 있으면 대조는 된다) */
export const KEEP_NAMES_DAYS = 3;

// ------------------------------------------------------------
// 스냅샷
// ------------------------------------------------------------

export interface SnapItem {
  /** 도매처 상품 id */
  i: string;
  /** 공급가 */
  p: number;
  /** 목록에서의 자리 (0부터) */
  r: number;
  /** 상품명 — 오래된 스냅샷에서는 지운다 */
  n?: string;
  /** 도매처 주소 */
  u?: string;
}

export interface ListSnapshot {
  /** 저장 시각 */
  at: number;
  /** 날짜 키 "2026-08-20" — 하루에 여러 번 눌러도 하나로 친다 */
  day: string;
  /** 어느 목록인가 — 검색어에서 뽑은 이름 */
  label: string;
  items: SnapItem[];
}

export function dayKeyOf(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 도매처 주소에서 상품 id를 뽑는다 */
export function idFromUrl(url: string): string {
  return (String(url || "").match(/(\d{5,})/) || [])[1] || "";
}

/**
 * 목록에 가장 많이 나오는 낱말로 이름을 붙인다.
 * 사용자에게 따로 묻지 않기 위해서다. 못 찾으면 "미지정".
 */
export function labelOfList(names: string[]): string {
  const count = new Map<string, number>();
  for (const n of names) {
    for (const t of new Set(tokenize(n))) {
      count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  let best = "";
  let bestN = 0;
  for (const [t, c] of count) {
    // 절반 이상에 나오는 낱말만 이름으로 삼는다
    if (c > bestN && c >= Math.max(2, names.length * 0.3)) { best = t; bestN = c; }
  }
  return best || "미지정";
}

// ------------------------------------------------------------
// 준비 상태 — 며칠치가 있어야 무엇을 판정할 수 있는가
// ------------------------------------------------------------

export const DAYS_FOR_NEW = 2;
export const DAYS_FOR_RISING = 3;
export const DAYS_FOR_SUSTAINED = 7;

export interface RadarReadiness {
  days: number;
  canDetectNew: boolean;
  canDetectRising: boolean;
  canDetectSustained: boolean;
  /** 화면에 그대로 쓰는 문장 */
  note: string;
}

export function readinessOf(days: number): RadarReadiness {
  const r: RadarReadiness = {
    days,
    canDetectNew: days >= DAYS_FOR_NEW,
    canDetectRising: days >= DAYS_FOR_RISING,
    canDetectSustained: days >= DAYS_FOR_SUSTAINED,
    note: "",
  };
  if (days === 0) r.note = "아직 담은 목록이 없습니다. 오늘 한 번 담으면 기준일이 됩니다.";
  else if (days === 1) r.note = "오늘을 기준일로 저장했습니다. 내일 다시 담으면 무엇이 달라졌는지 보여드립니다.";
  else if (!r.canDetectRising) r.note = `${days}일치입니다 — 새로 보이는 것만 알 수 있습니다. 상승 판정에는 ${DAYS_FOR_RISING}일이 필요합니다.`;
  else if (!r.canDetectSustained) r.note = `${days}일치입니다 — 상승까지 볼 수 있습니다. 지속 상승 판정에는 ${DAYS_FOR_SUSTAINED}일이 필요합니다.`;
  else r.note = `${days}일치가 쌓였습니다.`;
  return r;
}

// ------------------------------------------------------------
// 스냅샷 대조 — 발견(Discovery)
// ------------------------------------------------------------

/** 목록에서 위로 이만큼 올라오면 신호로 본다 */
const RANK_UP_MIN = 5;

export function diffSnapshots(
  today: ListSnapshot,
  previous: ListSnapshot | undefined,
  firstSeen: Map<string, number>,
  observedDays: Map<string, number>
): TrendSignal[] {
  if (!previous) return [];

  const before = new Map(previous.items.map((x) => [x.i, x]));
  const out: TrendSignal[] = [];

  for (const it of today.items) {
    const prev = before.get(it.i);
    const common = {
      source: "DOMEGGOOK_LIST" as const,
      subject: it.n || it.i,
      url: it.u,
      observedAt: today.at,
      firstSeenAt: firstSeen.get(it.i) ?? today.at,
      observedDays: observedDays.get(it.i) ?? 1,
    };

    if (!prev) {
      out.push({
        ...common,
        id: `new:${it.i}:${today.day}`,
        kind: "NEW",
        unit: "KRW",
        value: it.p,
        evidence: `${previous.day} 목록에는 없었습니다`,
      });
      continue;
    }

    if (prev.p > 0 && it.p > 0 && it.p < prev.p) {
      out.push({
        ...common,
        id: `drop:${it.i}:${today.day}`,
        kind: "PRICE_DROP",
        unit: "KRW",
        value: it.p,
        previousValue: prev.p,
        evidence: `도매가가 ${formatKrw(prev.p - it.p)} 내렸습니다`,
      });
    } else if (prev.p > 0 && it.p > prev.p) {
      out.push({
        ...common,
        id: `rise:${it.i}:${today.day}`,
        kind: "PRICE_RISE",
        unit: "KRW",
        value: it.p,
        previousValue: prev.p,
        evidence: `도매가가 ${formatKrw(it.p - prev.p)} 올랐습니다`,
      });
    }

    if (prev.r - it.r >= RANK_UP_MIN) {
      out.push({
        ...common,
        id: `up:${it.i}:${today.day}`,
        kind: "RANK_UP",
        unit: "RANK",
        value: it.r + 1,
        previousValue: prev.r + 1,
        evidence: `목록에서 ${prev.r - it.r}칸 위로 올라왔습니다`,
      });
    }
  }

  return out;
}

// ------------------------------------------------------------
// 내 데이터에서 나오는 신호 — 외부 데이터가 필요 없다
// ------------------------------------------------------------

/**
 * 💰 공급가 하락 = 내 마진이 늘었다.
 * 이미 팔고 있는 검증된 상품이라, 새 상품을 찾는 것보다 안전한 기회다.
 */
export function priceOpportunities(products: Product[], now = Date.now()): TrendSignal[] {
  const out: TrendSignal[] = [];

  for (const p of products) {
    const h = p.costHistory ?? [];
    if (h.length < 2) continue;

    const cur = p.cost.supplyPriceKrw;
    // 가장 비쌌던 때와 비교한다 — 직전만 보면 조금씩 내린 것을 놓친다
    const peak = h.reduce((m, e) => Math.max(m, e.supplyPriceKrw), 0);
    if (peak <= 0 || cur >= peak) continue;

    const gap = peak - cur;
    // 100원 미만이나 3% 미만은 잡음으로 본다
    if (gap < 100 || gap / peak < 0.03) continue;

    const qty = Math.max(1, p.cost.minOrderQty ?? 1);
    const firstAt = h[0]?.at ?? p.createdAt;

    out.push({
      id: `mydrop:${p.id}:${cur}`,
      kind: "PRICE_DROP",
      source: "MY_PRODUCTS",
      subject: p.name,
      productId: p.id,
      url: p.sourceUrl,
      observedAt: now,
      firstSeenAt: firstAt,
      observedDays: Math.max(1, Math.round((now - firstAt) / 86400000)),
      value: cur,
      previousValue: peak,
      unit: "KRW",
      evidence:
        `가장 비쌌을 때보다 ${formatKrw(gap)} 쌉니다` +
        (qty > 1 ? ` — 1주문(${qty}개)당 ${formatKrw(gap * qty)}` : ""),
    });
  }

  return out.sort((a, b) => (b.previousValue! - b.value!) - (a.previousValue! - a.value!));
}

/**
 * 🧭 내가 파는 상품의 낱말로 도매꾹 검색어를 제안한다.
 *
 * ★ 연관 상품을 찾아주는 게 아니다. 우리에겐 그럴 방법이 없다.
 *   "이 검색어로 찾아보세요"까지가 정직한 범위다.
 */
export interface KeywordSuggestion {
  keyword: string;
  /** 이 낱말을 쓰는 내 상품 수 */
  fromCount: number;
  /** 근거가 된 내 상품 이름들 */
  examples: string[];
}

export function relatedKeywords(products: Product[], limit = 8): KeywordSuggestion[] {
  const hit = new Map<string, string[]>();

  for (const p of products) {
    for (const t of new Set(tokenize(p.name))) {
      if (t.length < 2) continue;
      const arr = hit.get(t) ?? [];
      arr.push(p.name);
      hit.set(t, arr);
    }
  }

  return [...hit.entries()]
    .filter(([, names]) => names.length >= 1)
    .map(([keyword, names]) => ({
      keyword,
      fromCount: names.length,
      examples: names.slice(0, 3),
    }))
    // 여러 상품에 걸친 낱말이 내 영역에 가깝다
    .sort((a, b) => b.fromCount - a.fromCount || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}

// ------------------------------------------------------------
// 📊 카테고리 성적표 — 내가 심사한 기록에서 나온다
// ------------------------------------------------------------

export interface SourcingRun {
  at: number;
  day: string;
  label: string;
  total: number;
  good: number;
  check: number;
  skip: number;
  /** 가장 많았던 탈락 사유 */
  topSkip?: string;
}

export interface CategoryScore {
  label: string;
  runs: number;
  total: number;
  passed: number;
  passRatePct: number;
  topSkip?: string;
  /** 화면에 쓰는 한 문장 */
  note: string;
}

/** 성적표를 낼 만한 최소 표본 */
export const MIN_SAMPLE_FOR_SCORE = 15;

export function categoryScores(runs: SourcingRun[]): CategoryScore[] {
  const byLabel = new Map<string, SourcingRun[]>();
  for (const r of runs) {
    if (r.label === "미지정") continue;
    byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
  }

  const out: CategoryScore[] = [];
  for (const [label, list] of byLabel) {
    const total = list.reduce((s, r) => s + r.total, 0);
    const passed = list.reduce((s, r) => s + r.good + r.check, 0);
    if (total < MIN_SAMPLE_FOR_SCORE) continue;

    const rate = Math.round((passed / total) * 100);
    const skips = new Map<string, number>();
    for (const r of list) if (r.topSkip) skips.set(r.topSkip, (skips.get(r.topSkip) ?? 0) + 1);
    const topSkip = [...skips.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    out.push({
      label, runs: list.length, total, passed, passRatePct: rate, topSkip,
      note:
        rate >= 25
          ? `${total}개 중 ${passed}개가 1차를 통과했습니다 — 계속 볼 만합니다`
          : rate >= 10
            ? `${total}개 중 ${passed}개만 통과했습니다${topSkip ? ` (주로 ${topSkip})` : ""}`
            : `${total}개 중 ${passed}개뿐입니다${topSkip ? ` — 대부분 ${topSkip}` : ""}. 다른 쪽을 보는 게 낫습니다`,
    });
  }

  return out.sort((a, b) => b.passRatePct - a.passRatePct);
}
