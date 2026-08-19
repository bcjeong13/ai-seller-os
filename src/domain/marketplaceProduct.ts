// ============================================================
// 마켓별 등록 데이터 변환 계층
//
// ★ 이 파일이 이 프로젝트에서 가장 오래 살아남을 부분이다.
//   지금은 결과를 화면에 보여주고 손으로 옮기지만, 나중에 엑셀 대량등록 →
//   오픈API로 출구만 바뀐다. 변환 규칙 자체는 그대로 쓴다.
//
// ★ 저장하지 않고 매번 계산한다.
//   Product를 고쳤는데 마켓용 데이터가 옛날 것으로 남는 사고를 원천 차단한다.
//
// ★ 마켓별 제한값은 아래 RULES 한 곳에만 둔다.
//   마켓이 정책을 바꾸면 여기만 고친다.
//
// ★ 아래 숫자는 "보수적으로 잡은 값"이다. 마켓 공식 기준과 다를 수 있으므로
//   앱은 이것으로 등록을 막지 않고 "확인하라"고만 한다.
// ============================================================

import type { Marketplace, MarketFeeProfile, Product } from "./types";
import { ALL_CHANNELS } from "./types";
import { buildListingHtml } from "./listingHtml";
import { judgeProductNotice, noticeRows } from "./notice";
import { defaultSellerPolicy, returnNoticeLines, comparePolicies, worstGap } from "./sellerPolicy";
import { computeOptionProfits } from "./profitEngine";

import { formatKrw } from "./money";

// ------------------------------------------------------------
// 마켓별 규칙
// ------------------------------------------------------------

interface MarketRule {
  label: string;
  /** 상품명 권장 길이 — 넘으면 잘릴 수 있다고 알린다 */
  nameMaxLen: number;
  /** 옵션 개수 권장 상한 */
  optionMax: number;
  /** 판매자센터 주소 */
  centerUrl: string;
  /** 이 마켓에서 특히 조심할 것 */
  caution?: string;
}

const RULES: Record<Marketplace, MarketRule> = {
  NAVER: {
    label: "네이버",
    nameMaxLen: 100,
    optionMax: 100,
    centerUrl: "https://sell.smartstore.naver.com/",
    caution: "중복·도배성 등록에 민감합니다. 다른 마켓에서 반응을 본 뒤 올리는 걸 권합니다.",
  },
  COUPANG: {
    label: "쿠팡",
    nameMaxLen: 100,
    optionMax: 100,
    centerUrl: "https://wing.coupang.com/",
    caution: "브랜드·모델명 같은 식별정보를 요구하는 경우가 늘고 있습니다. 없으면 '자체제작'으로 둘지 확인하세요.",
  },
  "11ST": {
    label: "11번가",
    nameMaxLen: 100,
    optionMax: 100,
    centerUrl: "https://soffice.11st.co.kr/",
  },
  GMARKET: {
    label: "G마켓",
    nameMaxLen: 50,
    optionMax: 50,
    centerUrl: "https://www.esmplus.com/",
    caution: "G마켓·옥션은 ESM에서 함께 관리합니다. 한 번에 등록되는지 확인하세요.",
  },
  AUCTION: {
    label: "옥션",
    nameMaxLen: 50,
    optionMax: 50,
    centerUrl: "https://www.esmplus.com/",
    caution: "G마켓·옥션은 ESM에서 함께 관리합니다. 한 번에 등록되는지 확인하세요.",
  },
  OTHER: {
    label: "기타",
    nameMaxLen: 50,
    optionMax: 50,
    centerUrl: "",
  },
};

export function marketRule(m: Marketplace): MarketRule {
  return RULES[m] ?? RULES.OTHER;
}

// ------------------------------------------------------------
// 상품명 정리
// ------------------------------------------------------------

/**
 * 도매처 상품명에는 마켓에서 문제가 되는 것이 섞여 있다.
 * - 특수문자 떡칠 (★ ♥ [무료배송] 등)
 * - 같은 단어 반복 (검색 스팸으로 잡힌다)
 * - 도매처만 쓰는 표현 (도매, 사입, 대량)
 */
const NAME_JUNK = /[★☆♥♡◆◇■□▶◀※~!@#$%^&*_=+|\\<>{}]/g;
const NAME_BRACKET = /\[[^\]]{0,20}\]/g;
const SELLER_WORDS = /(도매|사입|대량|벌크|본사직송|무료배송|당일발송|최저가|정품보장)/g;

export function cleanProductName(raw: string, maxLen: number): string {
  let s = (raw || "")
    .replace(NAME_BRACKET, " ")
    .replace(NAME_JUNK, " ")
    .replace(SELLER_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 같은 단어가 두 번 넘게 나오면 뒤엣것을 지운다
  const seen = new Set<string>();
  s = s
    .split(" ")
    .filter((w) => {
      const k = w.toLowerCase();
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(" ");

  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

// ------------------------------------------------------------
// 변환 결과
// ------------------------------------------------------------

export type IssueLevel = "BLOCK" | "WARN";

export interface MarketIssue {
  level: IssueLevel;
  text: string;
}

export interface MarketplaceProduct {
  marketplace: Marketplace;
  label: string;
  centerUrl: string;

  /** 이 마켓에 맞춰 정리한 상품명 */
  name: string;
  /** 원본에서 무엇이 바뀌었는지 */
  nameChanged: boolean;

  listPriceKrw: number;
  /** 고객이 실제로 내는 금액 */
  buyerPaidKrw: number;
  buyerShippingKrw: number;
  /** 배송비 결제방식 — 우리는 항상 선불이다 */
  shippingPrepaid: true;

  options: { name: string; addPriceKrw: number }[];

  /** 상품정보제공고시 */
  notice: { label: string; value: string }[];
  /** 교환·반품 안내 (판매자 정책) */
  returnLines: string[];
  /** 상세페이지 */
  detailHtml: string;

  issues: MarketIssue[];
}

export function toMarketplaceProduct(p: Product, m: Marketplace): MarketplaceProduct {
  const rule = marketRule(m);
  const name = cleanProductName(p.name, rule.nameMaxLen);
  const notice = judgeProductNotice(p);
  const policy = p.sellerReturnPolicy ?? defaultSellerPolicy(p.supplierReturnPolicy);
  const options = (p.options ?? []).filter((o) => o.enabled);
  const issues: MarketIssue[] = [];

  if (!name) {
    issues.push({ level: "BLOCK", text: "정리하고 나니 상품명이 비었습니다 — 직접 지어주세요" });
  } else if (name.length < 6) {
    issues.push({ level: "WARN", text: `상품명이 ${name.length}자로 짧습니다 — 검색에 잘 걸리지 않습니다` });
  }
  if (p.name && name !== p.name.trim()) {
    // 자른 경우만 경고. 특수문자 정리는 정상 동작이므로 알리지 않는다
    if (p.name.trim().length > rule.nameMaxLen) {
      issues.push({ level: "WARN", text: `상품명이 ${rule.nameMaxLen}자를 넘어 잘렸습니다 — 확인하세요` });
    }
  }

  if (notice.level === "BLOCKED") {
    issues.push({ level: "BLOCK", text: notice.text });
  } else if (notice.level === "PARTIAL") {
    issues.push({ level: "WARN", text: notice.text });
  }

  if (options.length > rule.optionMax) {
    issues.push({ level: "WARN", text: `옵션이 ${options.length}개입니다 — ${rule.optionMax}개를 넘으면 등록이 어려울 수 있습니다` });
  }

  if (!p.imageRightsConfirmed) {
    issues.push({ level: "BLOCK", text: "이미지 사용 허용을 아직 확인하지 않았습니다" });
  }

  if (p.legalBlock) {
    issues.push({ level: "BLOCK", text: "팔면 안 되는 상품으로 표시되어 있습니다" });
  }

  const gaps = comparePolicies(policy, p.supplierReturnPolicy);
  const g = worstGap(gaps);
  if (g === "RISK") {
    issues.push({ level: "WARN", text: "고객에게 약속한 반품 조건을 도매처가 다 받아주지 않습니다" });
  } else if (g === "UNKNOWN") {
    issues.push({ level: "WARN", text: "도매처 반품정책을 읽지 못했습니다" });
  }

  if (rule.caution) issues.push({ level: "WARN", text: rule.caution });

  return {
    marketplace: m,
    label: rule.label,
    centerUrl: rule.centerUrl,
    name,
    nameChanged: !!p.name && name !== p.name.trim(),
    listPriceKrw: p.price.listPriceKrw,
    buyerPaidKrw: p.price.buyerPaidKrw,
    buyerShippingKrw: p.price.buyerShippingKrw,
    shippingPrepaid: true,
    options: options.map((o) => ({ name: o.name, addPriceKrw: o.addPriceKrw })),
    notice: noticeRows(notice),
    returnLines: returnNoticeLines(policy),
    detailHtml: buildListingHtml(p).html,
    issues,
  };
}

export function toAllMarketplaces(p: Product, only?: Marketplace[]): MarketplaceProduct[] {
  return (only ?? ALL_CHANNELS).map((m) => toMarketplaceProduct(p, m));
}

// ------------------------------------------------------------
// 등록 검토 — 승인 전에 코드가 판정할 수 있는 것
//
// ★ 체크박스를 늘어놓지 않는다. 초보자는 전부 체크하고 넘어간다.
//   코드가 볼 수 있는 것은 코드가 판정하고,
//   사람에게는 코드가 볼 수 없는 것만 묻는다.
// ------------------------------------------------------------

export interface ReviewLine {
  ok: boolean;
  label: string;
  detail: string;
}

export interface ListingReview {
  /** 코드가 판정한 것 — 사람이 체크할 필요 없다 */
  auto: ReviewLine[];
  /** 사람만 볼 수 있는 것 — 이것만 묻는다 */
  askHuman: { key: "image" | "wording"; label: string; detail: string }[];
  /** 등록을 막아야 하는가 */
  blocked: boolean;
  blockers: string[];
}

export function reviewForListing(p: Product, fee?: MarketFeeProfile): ListingReview {
  const opt = computeOptionProfits(p, fee);
  const notice = judgeProductNotice(p);
  const policy = p.sellerReturnPolicy ?? defaultSellerPolicy(p.supplierReturnPolicy);
  const gaps = comparePolicies(policy, p.supplierReturnPolicy);

  const auto: ReviewLine[] = [];
  const blockers: string[] = [];

  // 가격
  const hasPrice = p.price.buyerPaidKrw > 0;
  auto.push({
    ok: hasPrice,
    label: "판매가",
    detail: hasPrice ? formatKrw(p.price.buyerPaidKrw) : "아직 정하지 않았습니다",
  });
  if (!hasPrice) blockers.push("판매가를 정하세요");

  // 역마진 옵션
  const optOk = opt.lossCount === 0;
  auto.push({
    ok: optOk,
    label: "옵션 손익",
    detail: optOk
      ? `${opt.totalCount}개 모두 정상`
      : `${opt.totalCount}개 중 ${opt.lossCount}개가 팔면 손해`,
  });
  if (!optOk) blockers.push(`손해 보는 옵션 ${opt.lossCount}개를 끄거나 가격을 올리세요`);

  // 배송비 — 우리 원칙: 무조건 선불
  auto.push({
    ok: true,
    label: "배송비",
    detail:
      p.price.buyerShippingKrw > 0
        ? `${formatKrw(p.price.buyerShippingKrw)} · 선불(주문시결제)`
        : "무료배송 · 선불(주문시결제)",
  });

  // 고시정보
  auto.push({
    ok: notice.level === "READY",
    label: `고시정보 (${notice.label})`,
    detail: notice.level === "READY" ? `${notice.total}개 항목 준비됨` : notice.text,
  });
  if (notice.level === "BLOCKED") blockers.push("고시정보를 채우세요 — 등록이 거부될 수 있습니다");

  // 반품정책
  const g = worstGap(gaps);
  auto.push({
    ok: g === "OK",
    label: "반품정책",
    detail:
      g === "OK"
        ? `수령 후 ${policy.withdrawalDays}일 · 도매처가 받아주는 범위 안`
        : (gaps.find((x) => x.kind !== "OK")?.text ?? "확인 필요"),
  });

  // 상세설명
  const html = buildListingHtml(p);
  auto.push({
    ok: html.todos.length === 0,
    label: "상세페이지",
    detail: html.todos.length === 0 ? "만들어졌습니다" : html.todos[0],
  });

  // 팔면 안 되는 상품
  if (p.legalBlock) blockers.push("팔면 안 되는 상품으로 표시되어 있습니다");

  return {
    auto,
    askHuman: [
      {
        key: "image",
        label: "이 이미지를 써도 됩니까?",
        detail:
          "도매처 페이지에 이미지 사용 허용 표기가 있는지, 그리고 이미지에 공급사 로고·연락처가 박혀 있지 않은지 두 가지를 보세요. " +
          "코드는 이미지 안을 볼 수 없습니다. 확인하면 상품의 '이미지 사용 허용'도 함께 켜집니다.",
      },
      {
        key: "wording",
        label: "원본에 없는 효능·기능을 넣지 않았습니까?",
        detail: "직접 문구를 고쳤다면 확인하세요. 과장 광고는 반품·신고로 돌아옵니다.",
      },
    ],
    blocked: blockers.length > 0,
    blockers,
  };
}

/** 승인이 아직 유효한가 — 승인 후 가격이 바뀌면 무효 */
export function approvalValid(p: Product): boolean {
  const a = p.listingApproval;
  if (!a) return false;
  return a.approvedPriceKrw === p.price.buyerPaidKrw && a.imageChecked && a.wordingChecked;
}
