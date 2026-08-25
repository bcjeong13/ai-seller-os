// ============================================================
// 상세페이지 HTML 생성
//
// ★ 마켓 에디터는 <style> 태그·외부 CSS를 지우는 경우가 많다.
//   그래서 모든 스타일을 인라인으로 넣는다. class 이름을 쓰지 않는다.
//
// ★ 중복 콘텐츠 문제
//   같은 도매 상품을 수백 명이 올린다. 내 상품 100개가 전부 같은 골격이면
//   마켓 입장에서는 도배로 보인다. 그래서 상품마다 소제목과 블록 순서를
//   다르게 뽑는다 (상품명에서 만든 고정 시드 — 같은 상품은 항상 같은 결과).
//
// ★ 원본에 없는 것을 만들지 않는다
//   스펙에 "중량 400g"이 있으면 "중량 400g"이라고 쓴다.
//   "가볍습니다"도 쓰지 않는다 — 가벼운지 아닌지는 우리가 판단할 일이 아니다.
//   사용감·효능·적합한 사람은 전부 지어낸 것이므로 넣지 않는다.
// ============================================================

import type { Product } from "./types";
import { judgeProductNotice, noticeRows, type NoticeDefaults } from "./notice";
import { isSellerOnlySpec } from "./listingContent";
import { defaultSellerPolicy, returnNoticeLines } from "./sellerPolicy";
import { formatKrw } from "./money";

// ------------------------------------------------------------
// 안전장치
// ------------------------------------------------------------

export function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 상품명에서 만든 고정 시드 — 같은 상품은 항상 같은 페이지가 나온다 */
function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(arr: T[], seed: number, salt: number): T {
  return arr[(seed + salt) % arr.length];
}

// ------------------------------------------------------------
// 소제목 후보 — 뜻은 같고 표현만 다르다
// ------------------------------------------------------------

const H_SPEC = ["상품 정보", "상세 정보", "제품 사양"];
const H_OPTION = ["옵션 안내", "선택 가능한 옵션", "구매 옵션"];
const H_IMAGE = ["상세 이미지", "제품 이미지", "상품 이미지"];
const H_SHIP = ["배송 안내", "배송 정보", "배송에 대하여"];
const H_RETURN = ["교환 · 반품 안내", "교환 및 반품", "반품 · 교환 안내"];
const H_NOTICE = ["상품정보 제공고시", "상품 정보 제공 고시"];
const H_CAUTION = ["구매 전 확인해 주세요", "구매 전 안내", "확인해 주세요"];

// ------------------------------------------------------------
// 조각
// ------------------------------------------------------------

const WRAP_OPEN =
  '<div style="max-width:860px;margin:0 auto;padding:0 4px;' +
  'font-family:-apple-system,BlinkMacSystemFont,\'Malgun Gothic\',sans-serif;' +
  'color:#222;font-size:15px;line-height:1.75;word-break:keep-all">';

function heading(text: string): string {
  return (
    `<h2 style="margin:38px 0 14px;padding:0 0 10px;border-bottom:2px solid #222;` +
    `font-size:19px;font-weight:700;letter-spacing:-0.3px">${escapeHtml(text)}</h2>`
  );
}

function imageSlot(label: string): string {
  return (
    `<div style="margin:18px 0;padding:44px 16px;background:#f5f6f8;border:1px dashed #c8ccd4;` +
    `border-radius:8px;text-align:center;color:#8a9099;font-size:14px">` +
    `[ ${escapeHtml(label)} — 이 자리에 이미지를 넣으세요 ]</div>`
  );
}

function table(rows: { label: string; value: string }[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? "#fafbfc" : "#fff"}">` +
        `<th style="width:34%;padding:11px 14px;text-align:left;font-weight:600;` +
        `color:#555;border-bottom:1px solid #eceef1;vertical-align:top">${escapeHtml(r.label)}</th>` +
        `<td style="padding:11px 14px;border-bottom:1px solid #eceef1">${escapeHtml(r.value)}</td></tr>`
    )
    .join("");
  return (
    `<table style="width:100%;border-collapse:collapse;border-top:2px solid #222;` +
    `font-size:14.5px;margin:4px 0 8px"><tbody>${body}</tbody></table>`
  );
}

function bullets(lines: string[]): string {
  if (!lines.length) return "";
  const items = lines
    .map(
      (l) =>
        `<li style="margin:0 0 8px;padding-left:2px">${escapeHtml(l.replace(/^·\s*/, ""))}</li>`
    )
    .join("");
  return `<ul style="margin:6px 0 8px;padding-left:20px">${items}</ul>`;
}

function noteBox(text: string): string {
  return (
    `<div style="margin:16px 0;padding:14px 16px;background:#fff8e6;border:1px solid #f0dfae;` +
    `border-radius:8px;font-size:14px;color:#6b5a2a">${escapeHtml(text)}</div>`
  );
}

// ------------------------------------------------------------
// 본문
// ------------------------------------------------------------

export interface ListingHtml {
  html: string;
  /** 사람이 반드시 손봐야 할 것 */
  todos: string[];
  /** 이미지 자리 개수 */
  imageSlots: number;
}

export function buildListingHtml(p: Product, noticeDefaults: NoticeDefaults = {}): ListingHtml {
  const seed = seedOf(p.name || "");
  const todos: string[] = [];

  // 고객에게 보여도 되는 스펙만
  const specs = (p.specs ?? [])
    .filter((s) => s.key && s.value && !isSellerOnlySpec(s.key))
    .map((s) => ({ label: s.key.trim(), value: s.value.trim() }));

  const notice = judgeProductNotice(p, noticeDefaults);
  const policy = p.sellerReturnPolicy ?? defaultSellerPolicy(p.supplierReturnPolicy);
  const options = (p.options ?? []).filter((o) => o.enabled);

  const parts: string[] = [WRAP_OPEN];

  // ── 대표 이미지 + 상품명. 여기에 카피를 지어 넣지 않는다.
  parts.push(imageSlot("대표 이미지"));
  parts.push(
    `<h1 style="margin:26px 0 6px;font-size:22px;font-weight:700;` +
    `letter-spacing:-0.4px;line-height:1.45">${escapeHtml(p.name)}</h1>`
  );

  // 스펙에서 사실만 뽑아 한 줄로. 판단하는 형용사를 붙이지 않는다.
  const facts = specs.slice(0, 3).map((s) => `${s.label} ${s.value}`);
  if (facts.length) {
    parts.push(
      `<p style="margin:0 0 8px;color:#666;font-size:14.5px">${escapeHtml(facts.join("  ·  "))}</p>`
    );
  }

  // ── 상품 정보
  if (specs.length) {
    parts.push(heading(pick(H_SPEC, seed, 0)));
    parts.push(table(specs));
  } else {
    todos.push("도매처에서 읽은 스펙이 없습니다 — 소재·크기 같은 정보를 직접 채우면 페이지가 훨씬 좋아집니다");
  }

  // ── 옵션
  if (options.length) {
    parts.push(heading(pick(H_OPTION, seed, 1)));
    parts.push(
      bullets(
        options.map((o) =>
          o.addPriceKrw ? `${o.name} (+${formatKrw(o.addPriceKrw)})` : o.name
        )
      )
    );
  }

  // ── 상세 이미지 자리
  parts.push(heading(pick(H_IMAGE, seed, 2)));
  parts.push(imageSlot("상세 이미지 1"));
  parts.push(imageSlot("상세 이미지 2"));
  parts.push(imageSlot("상세 이미지 3"));

  // ── 배송
  parts.push(heading(pick(H_SHIP, seed, 3)));
  const ship: string[] = [];
  ship.push(
    p.price.buyerShippingKrw > 0
      ? `배송비 ${formatKrw(p.price.buyerShippingKrw)}이 부과됩니다.`
      : `무료배송 상품입니다.`
  );
  ship.push("주문 확인 후 영업일 기준 평균 2~3일 이내 발송됩니다.");
  ship.push("주말·공휴일은 발송이 되지 않으며, 도서산간 지역은 배송비와 기간이 추가될 수 있습니다.");
  parts.push(bullets(ship));

  // ── 교환·반품 (판매자 정책. 도매처 정책을 그대로 옮기지 않는다)
  parts.push(heading(pick(H_RETURN, seed, 4)));
  parts.push(bullets(returnNoticeLines(policy)));
  if (!p.sellerReturnPolicy) {
    todos.push("판매자 반품정책을 아직 정하지 않아 법정 최소 기준으로 썼습니다 — 확인하세요");
  }

  // ── 상품정보 제공고시
  const rows = noticeRows(notice);
  parts.push(heading(pick(H_NOTICE, seed, 5)));
  if (rows.length) parts.push(table(rows));
  if (notice.missing.length) {
    parts.push(
      noteBox(`아직 채우지 못한 항목: ${notice.missing.join(", ")} — 등록 전에 채워야 합니다.`)
    );
    todos.push(`고시정보 ${notice.missing.length}개가 비어 있습니다 (${notice.missing.join(", ")})`);
  }

  // ── 주의사항
  parts.push(heading(pick(H_CAUTION, seed, 6)));
  parts.push(
    bullets([
      "모니터 환경에 따라 실제 색상과 다르게 보일 수 있습니다.",
      "측정 방법에 따라 치수에 약간의 오차가 있을 수 있습니다.",
    ])
  );

  parts.push("</div>");

  return { html: parts.join("\n"), todos, imageSlots: 4 };
}
