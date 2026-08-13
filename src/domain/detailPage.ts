// ============================================================
// 상세페이지 생성 (Phase 1, 프롬프트 §41)
// 규칙 기반(사실 입력 기반) 생성 — 원본에 없는 효능/기능 만들지 않음.
// 구매대행 필수 고지(배송기간·해외구매대행·통관부호) 자동 포함.
// ============================================================

import type { Marketplace } from "./types";

export interface DetailBenefits {
  freeShipping: boolean;
  /** 반품 가능 일수 (0 = 미표기, 법정 7일은 항상 안내) */
  returnDays: number;
  /** 단순변심 반품비 무료 여부 */
  freeReturn: boolean;
  exchange: boolean;
  qualityGuarantee: boolean;
  gift: string; // 사은품 (없으면 "")
}

export interface DetailPageInput {
  productName: string;
  marketplace: Marketplace;
  category: string;
  target: string;
  features: string[]; // 사실 기반 특징
  options: string[];
  benefits: DetailBenefits;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  isOverseasAgent: boolean;
}

export interface DetailPageOutput {
  nameCandidates: string[];
  keywords: string[];
  tags: string[];
  sections: { heading: string; body: string }[];
  faq: { q: string; a: string }[];
  shippingNotice: string;
  returnNotice: string;
  warnings: string[];
  html: string;
  plainText: string;
}

// 과대광고 위험 표현 (표시광고법)
const RISKY_TERMS = [
  "최고", "최고급", "최상", "1위", "유일", "세계최초", "국내최초", "100%",
  "완벽", "만병", "치료", "효능", "의학", "부작용", "특효", "즉시효과", "영구",
];

const STOPWORDS = new Set([
  "및", "등", "그리고", "또는", "이", "그", "저", "수", "것", "더", "위한",
  "으로", "에서", "에게", "까지", "부터", "관련", "용", "형", "개",
]);

function tokenize(text: string): string[] {
  return text
    .split(/[\s,·/()\[\]]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = a.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(a); }
  }
  return out;
}

/** 상품명 후보 (SEO, 네이버 권장 ~50자) */
function makeNames(input: DetailPageInput): string[] {
  const core = input.productName.trim();
  const f1 = input.features[0]?.trim() ?? "";
  const f2 = input.features[1]?.trim() ?? "";
  const cat = input.category.trim();

  const raw = [
    [cat, core, f1].filter(Boolean).join(" "),
    [core, f1, f2].filter(Boolean).join(" "),
    [cat, f1, core, input.options[0] ?? ""].filter(Boolean).join(" "),
  ];
  const trimmed = raw.map((s) => (s.length > 50 ? s.slice(0, 50).trim() : s));
  return dedupe(trimmed).filter(Boolean);
}

function makeKeywords(input: DetailPageInput): string[] {
  const src = [
    input.productName, input.category, input.target,
    ...input.features, ...input.options,
  ].join(" ");
  return dedupe(tokenize(src)).slice(0, 20);
}

function shippingNotice(input: DetailPageInput): string {
  const lines = ["📦 배송 안내"];
  if (input.isOverseasAgent) {
    lines.push("· 본 상품은 해외구매대행 상품입니다.");
    lines.push(
      `· 주문 후 상품 확인·통관·국제배송으로 영업일 기준 ${input.deliveryMinDays}~${input.deliveryMaxDays}일 정도 소요됩니다.`
    );
    lines.push("· 통관을 위해 구매자 개인통관고유부호가 필요할 수 있습니다.");
  } else {
    lines.push(`· 주문 후 영업일 기준 ${input.deliveryMinDays}~${input.deliveryMaxDays}일 내 배송됩니다.`);
  }
  if (input.benefits.freeShipping) lines.push("· 무료 배송 상품입니다.");
  return lines.join("\n");
}

function returnNotice(input: DetailPageInput): string {
  const b = input.benefits;
  const lines = ["🔁 교환/반품 안내"];
  lines.push("· 전자상거래법에 따라 상품 수령 후 7일 이내 청약철회가 가능합니다.");
  if (b.returnDays > 7) {
    lines.push(`· 본 스토어는 수령 후 ${b.returnDays}일 이내 반품 신청을 받습니다.`);
  }
  if (b.freeReturn) {
    lines.push("· 단순변심 반품 배송비 무료.");
  } else {
    lines.push("· 단순변심에 의한 반품 시 왕복 배송비는 구매자 부담입니다.");
  }
  if (b.exchange) lines.push("· 상품 하자 시 교환이 가능합니다.");
  if (input.isOverseasAgent) {
    lines.push("· 해외배송 상품 특성상 반품 처리에 시간이 소요될 수 있습니다.");
  }
  return lines.join("\n");
}

function makeFaq(input: DetailPageInput): { q: string; a: string }[] {
  const b = input.benefits;
  const faq: { q: string; a: string }[] = [];
  faq.push({
    q: "배송은 얼마나 걸리나요?",
    a: input.isOverseasAgent
      ? `해외구매대행 상품으로 통관·국제배송 포함 영업일 기준 ${input.deliveryMinDays}~${input.deliveryMaxDays}일 정도 소요됩니다.`
      : `영업일 기준 ${input.deliveryMinDays}~${input.deliveryMaxDays}일 내 배송됩니다.`,
  });
  faq.push({
    q: "반품이 가능한가요?",
    a: `수령 후 ${Math.max(7, b.returnDays)}일 이내 반품 신청이 가능합니다.${b.freeReturn ? " 단순변심 반품 배송비는 무료입니다." : " 단순변심 반품 시 왕복 배송비는 구매자 부담입니다."}`,
  });
  if (input.options.length > 0) {
    faq.push({ q: "어떤 옵션이 있나요?", a: `${input.options.join(", ")} 중에서 선택하실 수 있습니다.` });
  }
  if (b.qualityGuarantee) {
    faq.push({ q: "품질은 믿을 수 있나요?", a: "입고 전 검수를 진행하며, 하자 상품은 교환/반품이 가능합니다." });
  }
  if (input.isOverseasAgent) {
    faq.push({ q: "개인통관고유부호가 필요한가요?", a: "네, 해외배송 통관을 위해 구매자 본인의 개인통관고유부호가 필요합니다. 관세청 유니패스에서 무료 발급됩니다." });
  }
  return faq;
}

function makeWarnings(input: DetailPageInput): string[] {
  const w: string[] = [];
  const haystack = [input.productName, ...input.features].join(" ");
  const hits = RISKY_TERMS.filter((t) => haystack.includes(t));
  if (hits.length > 0) {
    w.push(`과대광고 위험 표현이 포함됨: ${dedupe(hits).join(", ")} — 표시광고법 위반 소지, 삭제 권장.`);
  }
  w.push("원본 상품에 없는 기능·효능·성능을 추가로 서술하지 마세요.");
  if (input.isOverseasAgent) {
    w.push("해외구매대행 상품은 '구매대행' 표기와 배송기간 고지가 필수입니다. (자동 포함됨)");
    if (input.benefits.freeReturn && input.benefits.returnDays >= 30) {
      w.push("30일 무료반품은 구매대행 특성상 왕복 국제배송비 부담이 큽니다. 반품비를 원가에 반영했는지 확인하세요.");
    }
  }
  return w;
}

export function generateDetailPage(input: DetailPageInput): DetailPageOutput {
  const nameCandidates = makeNames(input);
  const keywords = makeKeywords(input);
  const tags = keywords.slice(0, 10);
  const ship = shippingNotice(input);
  const ret = returnNotice(input);
  const faq = makeFaq(input);
  const warnings = makeWarnings(input);

  const sections: { heading: string; body: string }[] = [];
  sections.push({
    heading: input.productName,
    body: [input.target && `${input.target}를 위한 ${input.category || "추천"} 상품`, ""].filter(Boolean).join("\n"),
  });
  if (input.features.length > 0) {
    sections.push({ heading: "✨ 이런 점이 좋아요", body: input.features.map((f) => `· ${f}`).join("\n") });
  }
  if (input.options.length > 0) {
    sections.push({ heading: "🎨 옵션 안내", body: input.options.map((o) => `· ${o}`).join("\n") });
  }
  if (input.benefits.gift) {
    sections.push({ heading: "🎁 사은품", body: `· ${input.benefits.gift}` });
  }
  sections.push({ heading: "📦 배송 안내", body: ship.replace("📦 배송 안내\n", "") });
  sections.push({ heading: "🔁 교환/반품 안내", body: ret.replace("🔁 교환/반품 안내\n", "") });
  sections.push({ heading: "❓ 자주 묻는 질문", body: faq.map((f) => `Q. ${f.q}\nA. ${f.a}`).join("\n\n") });

  const plainText = sections.map((s) => `[${s.heading}]\n${s.body}`).join("\n\n");

  const html = [
    `<div style="max-width:780px;margin:0 auto;font-family:'Malgun Gothic',sans-serif;color:#222;line-height:1.7;">`,
    ...sections.map(
      (s) =>
        `<section style="margin:0 0 28px;"><h2 style="font-size:20px;border-left:4px solid #4f46e5;padding-left:10px;margin:0 0 12px;">${escapeHtml(s.heading)}</h2><div style="font-size:15px;white-space:pre-wrap;">${escapeHtml(s.body)}</div></section>`
    ),
    `</div>`,
  ].join("\n");

  return { nameCandidates, keywords, tags, sections, faq, shippingNotice: ship, returnNotice: ret, warnings, html, plainText };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
