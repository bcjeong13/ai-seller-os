// ============================================================
// 소싱 판정 — "이 상품을 후보로 삼아도 되는가"
//
// ★ 상품 심사(verdict.ts)와 다르다.
//   verdict : 시장가까지 조사한 뒤 "팔아도 되는가"
//   sourcing: 조사하기 전에 "조사할 가치가 있는가" — 거르는 단계
//
// ★ 점수를 만들지 않는다 (지시서 §10). 정렬용 순위값만 내부적으로 쓴다.
// ★ 계산은 전부 코드. AI는 설명만.
// ============================================================

import { judgeRisk, type RiskInfo } from "./riskCategory";
import { formatKrw } from "./money";

export type SourcingLevel = "GOOD" | "CHECK" | "SKIP";

/** 왜 걸렀는가 — 집계해서 "무엇을 피해야 하는지" 보여준다 */
export type SkipReason =
  | "MIN_ORDER"        // 최소구매수량이 커서 무재고 불가
  | "SHIPPING_HEAVY"   // 배송비가 원가를 잡아먹음
  | "TOO_CHEAP"        // 너무 싸서 배송비에 잡아먹힘
  | "RISK_CATEGORY"    // 인증·규제 부담
  | "TOO_MANY_OPTIONS" // 옵션이 많아 관리가 어려움
  | "NO_DATA";         // 값이 비어 판단 불가

export const SKIP_LABEL: Record<SkipReason, string> = {
  MIN_ORDER: "묶음으로만 판매",
  SHIPPING_HEAVY: "배송비 과다",
  TOO_CHEAP: "단가가 너무 낮음",
  RISK_CATEGORY: "인증·규제 부담",
  TOO_MANY_OPTIONS: "옵션 과다",
  NO_DATA: "정보 부족",
};

export interface SourcingCandidate {
  /** 목록에서 온 임시 식별자 */
  key: string;
  name: string;
  supplyPriceKrw: number;
  shippingKrw: number;
  minOrderQty: number;
  optionCount: number;
  url: string;
}

export interface SourcingJudgement {
  key: string;
  name: string;
  url: string;
  level: SourcingLevel;
  risk: RiskInfo;
  /** 매입 원가 = 공급가 × 최소구매수량 + 배송비 */
  landedCostKrw: number;
  /** 배송비가 매입에서 차지하는 비율(%) */
  shippingSharePct: number;
  /** 배송비를 실제로 읽었는가 — 목록 화면에서는 모를 수 있다 */
  shippingKnown: boolean;
  reasons: { ok: boolean; text: string }[];
  skipReason?: SkipReason;
  /** 목록 정렬용 — 화면에 숫자로 보여주지 않는다 */
  rank: number;
}

/** 초보자 기준선 — 나중에 사용자가 바꿀 수 있어야 한다 */
export interface SourcingRules {
  /** 이 수량을 넘으면 무재고 위탁이 불가능하다고 본다 */
  maxOrderQty: number;
  /** 배송비가 매입에서 차지하는 비율 상한(%) */
  maxShippingSharePct: number;
  /** 이보다 싸면 배송비에 잡아먹힌다 */
  minSupplyKrw: number;
  /** 이보다 옵션이 많으면 초보자가 관리하기 어렵다 */
  maxOptions: number;
}

export const DEFAULT_SOURCING_RULES: SourcingRules = {
  maxOrderQty: 3,
  maxShippingSharePct: 40,
  minSupplyKrw: 4000,
  maxOptions: 30,
};

export function judgeSourcing(
  c: SourcingCandidate,
  rules: SourcingRules = DEFAULT_SOURCING_RULES
): SourcingJudgement {
  const risk = judgeRisk(c.name);
  const qty = Math.max(1, Math.floor(c.minOrderQty || 1));
  const landed = c.supplyPriceKrw * qty + c.shippingKrw;
  const share = landed > 0 ? (c.shippingKrw / landed) * 100 : 0;

  const reasons: { ok: boolean; text: string }[] = [];
  let level: SourcingLevel = "GOOD";
  let skip: SkipReason | undefined;
  const ORDER: Record<SourcingLevel, number> = { GOOD: 0, CHECK: 1, SKIP: 2 };
  const down = (to: SourcingLevel, r?: SkipReason) => {
    if (ORDER[to] > ORDER[level]) level = to;
    if (to === "SKIP" && r && !skip) skip = r;
  };

  // 정보가 비어 있으면 판단하지 않는다 — 추측하지 않는다
  if (!c.name || c.supplyPriceKrw <= 0) {
    return {
      key: c.key, name: c.name || "(이름 없음)", url: c.url, level: "SKIP", risk,
      landedCostKrw: landed, shippingSharePct: share, shippingKnown: c.shippingKrw > 0,
      reasons: [{ ok: false, text: "공급가를 읽지 못했습니다 — 판단하지 않습니다" }],
      skipReason: "NO_DATA", rank: 999,
    };
  }

  // 1) 무재고로 굴러가는가
  if (qty > rules.maxOrderQty) {
    down("SKIP", "MIN_ORDER");
    reasons.push({ ok: false, text: `${qty}개부터 팝니다 — 재고를 떠안게 됩니다` });
  } else if (qty > 1) {
    down("CHECK");
    reasons.push({ ok: false, text: `${qty}개 묶음으로만 팔 수 있습니다` });
  } else {
    reasons.push({ ok: true, text: "1개씩 발주 가능" });
  }

  // 2) 배송비가 원가를 잡아먹는가 — 목록 화면에서는 배송비를 모를 수 있다
  const shippingKnown = c.shippingKrw > 0;
  if (!shippingKnown) {
    reasons.push({ ok: false, text: "배송비 미확인 — 상세 페이지에서 확인해야 합니다" });
  } else if (share > rules.maxShippingSharePct) {
    down("SKIP", "SHIPPING_HEAVY");
    reasons.push({ ok: false, text: `배송비가 매입의 ${Math.round(share)}%입니다 (${formatKrw(c.shippingKrw)})` });
  } else if (share > rules.maxShippingSharePct * 0.6) {
    down("CHECK");
    reasons.push({ ok: false, text: `배송비 비중이 ${Math.round(share)}%로 높은 편입니다` });
  } else {
    reasons.push({ ok: true, text: `배송비 비중 ${Math.round(share)}%` });
  }

  // 3) 단가가 너무 낮으면 무엇을 해도 남지 않는다
  if (c.supplyPriceKrw < rules.minSupplyKrw) {
    down("SKIP", "TOO_CHEAP");
    reasons.push({ ok: false, text: `공급가 ${formatKrw(c.supplyPriceKrw)} — 배송비·수수료를 빼면 남는 게 없습니다` });
  }

  // 4) 인증·규제 부담
  if (risk.level === "HIGH") {
    down("SKIP", "RISK_CATEGORY");
    reasons.push({ ok: false, text: `${risk.category} — ${risk.why}` });
  } else if (risk.level === "CHECK") {
    down("CHECK");
    reasons.push({ ok: false, text: `${risk.category} — ${risk.why}` });
  } else {
    reasons.push({ ok: true, text: risk.category });
  }

  // 5) 옵션이 너무 많으면 초보자가 못 버틴다
  if (c.optionCount > rules.maxOptions) {
    down("CHECK");
    reasons.push({ ok: false, text: `옵션 ${c.optionCount}개 — 옵션마다 손익을 봐야 합니다` });
  }

  // 정렬용 순위 — 낮을수록 먼저 본다. 화면에 숫자로 노출하지 않는다.
  const RISK_W: Record<string, number> = { LOW: 0, CHECK: 15, HIGH: 40 };
  const rank = ORDER[level] * 250 + Math.round(share) + (qty > 1 ? 20 : 0) + RISK_W[risk.level];

  return {
    key: c.key, name: c.name, url: c.url,
    level, risk, landedCostKrw: landed, shippingSharePct: share, shippingKnown,
    reasons, skipReason: skip, rank,
  };
}

// ------------------------------------------------------------
// 집계 — "무엇을 팔까"보다 "무엇을 피할까"가 초보자에게 더 중요하다
// ------------------------------------------------------------

export interface SourcingSummary {
  total: number;
  good: SourcingJudgement[];
  check: SourcingJudgement[];
  skipped: SourcingJudgement[];
  /** 제외 사유별 건수 — 많은 순 */
  skipCounts: { reason: SkipReason; label: string; count: number }[];
}

export function summarizeSourcing(list: SourcingJudgement[]): SourcingSummary {
  const good = list.filter((x) => x.level === "GOOD").sort((a, b) => a.rank - b.rank);
  const check = list.filter((x) => x.level === "CHECK").sort((a, b) => a.rank - b.rank);
  const skipped = list.filter((x) => x.level === "SKIP");

  const counts = new Map<SkipReason, number>();
  for (const s of skipped) {
    if (!s.skipReason) continue;
    counts.set(s.skipReason, (counts.get(s.skipReason) ?? 0) + 1);
  }

  return {
    total: list.length,
    good, check, skipped,
    skipCounts: [...counts.entries()]
      .map(([reason, count]) => ({ reason, label: SKIP_LABEL[reason], count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ------------------------------------------------------------
// 확장이 보낸 후보 목록 파싱
//   ##AISOS-LIST##
//   이름|공급가|배송비|최소수량|옵션수|URL
// ------------------------------------------------------------

export const LIST_HEADER = "##AISOS-LIST##";

export function parseCandidates(text: string): SourcingCandidate[] {
  if (!text || !text.includes(LIST_HEADER)) return [];
  const body = text.slice(text.indexOf(LIST_HEADER) + LIST_HEADER.length);
  const out: SourcingCandidate[] = [];
  let i = 0;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split("|").map((s) => (s ?? "").trim());
    if (f.length < 6) continue;
    const num = (s: string) => {
      const n = parseInt((s || "").replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    };
    out.push({
      key: `c${i++}`,
      name: f[0],
      supplyPriceKrw: num(f[1]),
      shippingKrw: num(f[2]),
      minOrderQty: Math.max(1, num(f[3]) || 1),
      optionCount: num(f[4]),
      url: f[5],
    });
  }
  return out;
}
