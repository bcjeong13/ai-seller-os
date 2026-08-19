// ============================================================
// 상세설명 텍스트 생성 (개발지시서 §12 — 삭제됐던 기능 복원)
// 규칙 기반. 원본에 없는 효능·기능을 만들지 않는다.
// 위지윅 편집기가 아니라 "복사용 텍스트"만 만든다 (§10).
// 국내 위탁 기준: 배송 국내, 반품정책은 승인된 경우만 고객용으로.
// ============================================================

import type { Product, ProductSpec } from "./types";

export interface ListingContent {
  nameCandidates: string[];
  keywords: string[];
  tags: string[];
  sections: { heading: string; body: string }[];
  faq: { q: string; a: string }[];
  plainText: string;
  warnings: string[];
}

const RISKY = [
  "최고", "최상", "1위", "유일", "세계최초", "국내최초", "100%", "완벽",
  "만병", "치료", "효능", "의학", "부작용", "특효", "즉시효과", "영구", "무조건",
];

const STOP = new Set([
  "및", "등", "그리고", "또는", "이", "그", "저", "수", "것", "더", "위한",
  "으로", "에서", "에게", "까지", "부터", "관련", "용", "형", "개",
]);

function tokenize(text: string): string[] {
  return text
    .split(/[\s,·/()\[\]]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = a.toLowerCase();
    if (a && !seen.has(k)) { seen.add(k); out.push(a); }
  }
  return out;
}

/** 상품명 후보 (네이버 권장 ~50자) */
function makeNames(p: Product): string[] {
  const core = p.name.trim();
  const hints = p.specs.map((s) => s.value.trim()).filter((v) => v && v.length <= 10).slice(0, 2);
  const raw = [
    core,
    [core, ...hints].join(" "),
    [hints[0] ?? "", core].filter(Boolean).join(" "),
  ];
  return dedupe(raw.map((s) => (s.length > 50 ? s.slice(0, 50).trim() : s))).filter(Boolean);
}

function specBody(specs: ProductSpec[]): string {
  return specs
    .filter((s) => s.key && s.value)
    .map((s) => `· ${s.key}: ${s.value}`)
    .join("\n");
}

function shippingBody(): string {
  return [
    "· 주문 후 영업일 기준 평균 2~3일 이내 발송됩니다.",
    "· 도서산간 지역은 배송비·기간이 추가될 수 있습니다.",
  ].join("\n");
}

function returnBody(p: Product): { body: string; approved: boolean; hasUnapproved: boolean } {
  const lines = ["· 전자상거래법에 따라 상품 수령 후 7일 이내 청약철회가 가능합니다."];
  const rp = p.supplierReturnPolicy;
  const approved = !!(rp && rp.approvedForCustomer);
  const hasUnapproved = !!(rp && !rp.approvedForCustomer);

  if (approved && rp) {
    if (rp.freeReturnDays) lines.push(`· 수령 후 ${rp.freeReturnDays}일 이내 반품 신청이 가능합니다.`);
    if (rp.defectReturnDays) lines.push(`· 상품 하자 시 ${rp.defectReturnDays}일 이내 무상 교환/반품이 가능합니다.`);
    if (typeof rp.returnFeeKrw === "number") {
      lines.push(rp.returnFeeKrw > 0
        ? `· 단순변심 반품 배송비: ${rp.returnFeeKrw.toLocaleString()}원(구매자 부담).`
        : "· 단순변심 반품 배송비 무료.");
    } else {
      lines.push("· 단순변심 반품 시 왕복 배송비는 구매자 부담입니다.");
    }
  } else {
    lines.push("· 단순변심 반품 시 왕복 배송비는 구매자 부담입니다.");
  }
  return { body: lines.join("\n"), approved, hasUnapproved };
}

function makeFaq(p: Product): { q: string; a: string }[] {
  const faq: { q: string; a: string }[] = [];
  faq.push({ q: "배송은 얼마나 걸리나요?", a: "주문 후 영업일 기준 평균 2~3일 이내 발송됩니다." });
  faq.push({ q: "반품이 가능한가요?", a: "수령 후 7일 이내 청약철회가 가능합니다. 단순변심 반품 시 왕복 배송비는 구매자 부담입니다." });
  const enabled = p.options.filter((o) => o.enabled);
  if (enabled.length > 0) {
    faq.push({ q: "어떤 옵션이 있나요?", a: `${enabled.map((o) => o.name).join(", ")} 중에서 선택하실 수 있습니다.` });
  }
  return faq;
}

function makeWarnings(p: Product, unapprovedPolicy: boolean): string[] {
  const w: string[] = [];
  const hay = [p.name, ...p.specs.map((s) => s.value)].join(" ");
  const hits = dedupe(RISKY.filter((t) => hay.includes(t)));
  if (hits.length > 0) {
    w.push(`과대광고 위험 표현: ${hits.join(", ")} — 표시광고법 위반 소지, 삭제 권장.`);
  }
  w.push("원본 상품에 없는 기능·효능·성능을 추가로 쓰지 마세요.");
  if (unapprovedPolicy) {
    w.push("도매처 반품정책이 아직 고객용으로 승인되지 않아 일반 안내(7일 청약철회)만 넣었습니다.");
  }
  return w;
}

export function buildListingContent(p: Product): ListingContent {
  const nameCandidates = makeNames(p);
  const keywords = dedupe(
    tokenize([p.name, ...p.specs.flatMap((s) => [s.key, s.value]), ...p.options.map((o) => o.name)].join(" "))
  ).slice(0, 20);
  const tags = keywords.slice(0, 10);

  const ret = returnBody(p);
  const faq = makeFaq(p);
  const warnings = makeWarnings(p, ret.hasUnapproved);

  const sections: { heading: string; body: string }[] = [];
  const specs = specBody(p.specs);
  if (specs) sections.push({ heading: "📋 상품 정보", body: specs });
  const enabled = p.options.filter((o) => o.enabled);
  if (enabled.length > 0) {
    sections.push({
      heading: "🎨 옵션 안내",
      body: enabled.map((o) => `· ${o.name}${o.addPriceKrw ? ` (+${o.addPriceKrw.toLocaleString()}원)` : ""}`).join("\n"),
    });
  }
  sections.push({ heading: "🚚 배송 안내", body: shippingBody() });
  sections.push({ heading: "🔁 교환/반품 안내", body: ret.body });
  sections.push({ heading: "❓ 자주 묻는 질문", body: faq.map((f) => `Q. ${f.q}\nA. ${f.a}`).join("\n\n") });

  const plainText = sections.map((s) => `[${s.heading}]\n${s.body}`).join("\n\n");

  return { nameCandidates, keywords, tags, sections, faq, plainText, warnings };
}
