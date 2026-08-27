// ============================================================
// 상품정보제공고시 — 등록의 진짜 관문
//
// ★ 마켓은 카테고리별로 정해진 항목을 요구한다. 못 채우면 등록이 거부된다.
//   그런데 상당수가 도매처 상품페이지에 아예 없다 (제조국·제조사·A/S 연락처).
//
// ★ 그래서 이 판정은 등록 직전이 아니라 "소싱 단계"에 있어야 한다.
//   상세페이지까지 다 만들고 나서 "등록 불가"를 알면 이미 늦다.
//
// ★ 이 파일은 법령 자체를 판정하지 않는다. "무엇을 더 물어봐야 하는가"만 본다.
//   실제 필수 항목은 마켓·카테고리·시행 고시에 따라 다르므로
//   사용자가 마켓 등록 화면에서 최종 확인해야 한다.
// ============================================================

import type { Product, ProductSpec } from "./types";

/** 고시 분류 — 마켓 카테고리가 아니라 "무엇을 물어야 하는가"의 묶음 */
export type NoticeKind =
  | "GENERAL"    // 기타 재화 — 가장 가벼움
  | "APPAREL"    // 의류
  | "SHOES"      // 신발
  | "BAG"        // 가방
  | "FURNITURE"  // 가구
  | "KITCHEN"    // 주방용품
  | "ELECTRIC"   // 전기·전자
  | "COSMETIC"   // 화장품
  | "FOOD"       // 식품
  | "KIDS";      // 유아용품

export interface NoticeField {
  /** 저장 키 */
  key: string;
  /** 화면에 보일 이름 */
  label: string;
  /** 도매처 스펙에서 이 이름들을 찾아 자동으로 채운다 */
  from?: string[];
  /** 사람이 반드시 손으로 확인해야 하는 항목 (자동으로 채우지 않는다) */
  manual?: boolean;
  /** 왜 필요한지 — 초보자에게 설명 */
  hint?: string;
}

/** 어떤 분류든 공통으로 요구되는 것 */
const COMMON: NoticeField[] = [
  { key: "maker", label: "제조사(수입사)", from: ["제조사", "제조원", "브랜드", "수입사", "제조업체"] },
  { key: "origin", label: "제조국", from: ["제조국", "원산지", "생산지", "made in"] },
  { key: "asPhone", label: "A/S 책임자·연락처", manual: true,
    hint: "고객이 문제를 겪을 때 연락할 곳입니다. 도매처 번호를 그대로 쓰면 안 됩니다 — 판매자인 내가 받아야 합니다" },
  { key: "warranty", label: "품질보증기준", manual: true,
    hint: "보통 '관련 법 및 소비자분쟁해결기준에 따름'으로 씁니다" },
];

interface KindSpec {
  label: string;
  extra: NoticeField[];
  /** 이 분류로 보는 상품명 키워드 */
  words: string[];
}

// 위에 있는 것이 먼저 잡힌다 — 규제가 무거운 것부터.
const KINDS: Record<NoticeKind, KindSpec> = {
  FOOD: {
    label: "식품",
    words: [
      "식품", "과자", "간식", "즉석", "반찬", "김치", "육포", "견과", "차류", "음료", "건강기능식품",
      "올리브오일", "식용유", "참기름", "들기름", "카놀라유", "포도씨유",
      "고추장", "된장", "간장", "식초", "소스", "드레싱",
      "레몬즙", "양배추즙", "도라지즙", "매실액", "주스",
      "백미", "현미", "잡곡", "밀가루", "라면", "국수", "통조림", "이유식", "분유",
      "건어물", "멸치", "조미김", "미역", "다시마",
      "초콜릿", "사탕", "젤리", "쿠키", "식빵", "떡볶이", "벌꿀", "시럽", "원두", "커피",
    ],
    extra: [
      { key: "foodType", label: "식품의 유형", from: ["식품유형", "유형"] },
      { key: "expiry", label: "유통기한", from: ["유통기한", "소비기한"] },
      { key: "volume", label: "내용량", from: ["내용량", "중량", "용량"] },
      { key: "ingredients", label: "원재료명", from: ["원재료", "성분"] },
      { key: "reportNo", label: "품목보고번호", manual: true },
    ],
  },
  COSMETIC: {
    label: "화장품",
    words: ["화장품", "스킨", "로션", "에센스", "앰플", "선크림", "쿠션", "틴트", "클렌징", "토너", "세럼", "크림"],
    extra: [
      { key: "volume", label: "내용물의 용량·중량", from: ["용량", "중량", "내용량"] },
      { key: "ingredients", label: "전성분", from: ["전성분", "성분"] },
      { key: "expiry", label: "사용기한", from: ["사용기한", "유통기한"] },
      { key: "usage", label: "사용방법", from: ["사용방법", "사용법"] },
      { key: "caution", label: "사용 시 주의사항", manual: true },
    ],
  },
  KIDS: {
    label: "유아용품",
    words: ["유아", "영유아", "아기", "baby", "젖병", "기저귀", "유모차", "카시트", "보행기", "치발기"],
    extra: [
      { key: "kcNo", label: "KC 인증번호", manual: true,
        hint: "어린이제품 안전 인증 대상입니다. 인증번호가 없으면 등록하지 마세요" },
      { key: "targetAge", label: "사용연령", from: ["사용연령", "권장연령", "연령"] },
      { key: "material", label: "재질", from: ["재질", "소재"] },
      { key: "size", label: "크기", from: ["크기", "사이즈", "규격"] },
    ],
  },
  ELECTRIC: {
    label: "전기·전자",
    words: ["충전기", "케이블", "배터리", "보조배터리", "전기", "전자", "led", "램프", "선풍기", "히터", "가습기", "청소기", "이어폰", "스피커", "공기청정"],
    extra: [
      { key: "kcNo", label: "KC 인증(안전확인) 번호", manual: true,
        hint: "전기용품 안전관리법 대상일 수 있습니다. 도매처에 인증번호를 요청하세요" },
      { key: "rating", label: "정격전압·소비전력", from: ["정격", "전압", "소비전력", "출력", "입력"] },
      { key: "size", label: "크기·중량", from: ["크기", "사이즈", "규격", "중량", "무게"] },
      { key: "releaseAt", label: "출시연월", manual: true },
    ],
  },
  FURNITURE: {
    label: "가구",
    words: ["가구", "책상", "의자", "선반", "수납장", "옷장", "침대", "테이블", "서랍"],
    extra: [
      { key: "size", label: "크기", from: ["크기", "사이즈", "규격"] },
      { key: "material", label: "재질", from: ["재질", "소재"] },
      { key: "assembly", label: "배송·설치비용", manual: true },
      { key: "composition", label: "구성품", from: ["구성", "구성품", "세트구성"] },
    ],
  },
  APPAREL: {
    label: "의류",
    words: ["의류", "티셔츠", "셔츠", "바지", "원피스", "자켓", "코트", "니트", "맨투맨", "후드", "레깅스", "치마"],
    extra: [
      { key: "material", label: "제품 소재", from: ["소재", "재질", "혼용률"] },
      { key: "color", label: "색상", from: ["색상", "컬러"] },
      { key: "size", label: "치수", from: ["사이즈", "치수", "규격"] },
      { key: "wash", label: "취급시 주의사항", manual: true },
    ],
  },
  SHOES: {
    label: "신발",
    words: ["신발", "운동화", "구두", "슬리퍼", "샌들", "부츠", "스니커즈"],
    extra: [
      { key: "material", label: "제품 주소재", from: ["소재", "재질"] },
      { key: "color", label: "색상", from: ["색상", "컬러"] },
      { key: "size", label: "치수", from: ["사이즈", "치수"] },
    ],
  },
  BAG: {
    label: "가방",
    words: ["가방", "백팩", "크로스백", "숄더백", "토트백", "파우치", "지갑", "캐리어"],
    extra: [
      { key: "material", label: "종류·소재", from: ["소재", "재질", "종류"] },
      { key: "size", label: "크기", from: ["크기", "사이즈", "규격"] },
      { key: "color", label: "색상", from: ["색상", "컬러"] },
    ],
  },
  KITCHEN: {
    label: "주방용품",
    words: ["주방", "냄비", "프라이팬", "도마", "칼", "그릇", "컵", "텀블러", "보온병", "밀폐용기", "집게", "국자"],
    extra: [
      { key: "material", label: "재질", from: ["재질", "소재"] },
      { key: "size", label: "크기", from: ["크기", "사이즈", "규격", "용량"] },
      { key: "composition", label: "구성품", from: ["구성", "구성품", "세트구성"] },
      { key: "foodSafe", label: "식품용 기구 여부", manual: true,
        hint: "음식이 닿는 제품이면 식품용 기구 표시가 필요합니다" },
    ],
  },
  GENERAL: {
    label: "기타 재화",
    words: [],
    extra: [
      { key: "material", label: "재질", from: ["재질", "소재"] },
      { key: "size", label: "크기", from: ["크기", "사이즈", "규격"] },
      { key: "composition", label: "구성품", from: ["구성", "구성품", "세트구성"] },
    ],
  },
};

const ORDER: NoticeKind[] = [
  "FOOD", "COSMETIC", "KIDS", "ELECTRIC", "FURNITURE",
  "APPAREL", "SHOES", "BAG", "KITCHEN", "GENERAL",
];

/** 상품명으로 고시 분류를 고른다. 확실하지 않으면 GENERAL. */
export function noticeKindOf(name: string): NoticeKind {
  const t = (name || "").toLowerCase().replace(/\s+/g, "");
  for (const k of ORDER) {
    if (KINDS[k].words.some((w) => t.includes(w.toLowerCase()))) return k;
  }
  return "GENERAL";
}

export function noticeLabel(kind: NoticeKind): string {
  return KINDS[kind].label;
}

/** 이 분류가 요구하는 항목 전부 */
export function noticeFields(kind: NoticeKind): NoticeField[] {
  return [...COMMON, ...KINDS[kind].extra];
}

// ------------------------------------------------------------
// 도매처 스펙에서 자동으로 채우기
// ------------------------------------------------------------

function findSpec(specs: ProductSpec[], names: string[]): string | undefined {
  for (const n of names) {
    const hit = specs.find((s) => (s.key || "").replace(/\s+/g, "").includes(n.replace(/\s+/g, "")));
    if (hit && (hit.value || "").trim()) return hit.value.trim();
  }
  return undefined;
}

export interface NoticeSlot {
  field: NoticeField;
  value?: string;
  /** 어디서 왔는가 */
  source: "spec" | "manual" | "settings" | "empty";
}

/**
 * 상품이 달라도 늘 같은 값 — 설정에 한 번 적어두면 모든 상품에 채워진다.
 * 상품마다 A/S 번호를 다시 치게 하지 않는다.
 */
export interface NoticeDefaults {
  asPhone?: string;
  warranty?: string;
}

/**
 * 도매처 스펙으로 채울 수 있는 만큼 채우고, 나머지는 비워 둔다.
 * @param saved 사용자가 이 상품에만 직접 입력해 둔 값 (가장 우선한다)
 * @param defaults 설정에 적어둔 공통값
 */
export function fillNotice(
  kind: NoticeKind,
  specs: ProductSpec[],
  saved: Record<string, string> = {},
  defaults: NoticeDefaults = {}
): NoticeSlot[] {
  return noticeFields(kind).map((field) => {
    const own = (saved[field.key] || "").trim();
    if (own) return { field, value: own, source: "manual" as const };

    if (!field.manual && field.from) {
      const v = findSpec(specs, field.from);
      if (v) return { field, value: v, source: "spec" as const };
    }

    const fromSettings = (defaults as Record<string, string | undefined>)[field.key];
    if (fromSettings?.trim()) {
      return { field, value: fromSettings.trim(), source: "settings" as const };
    }

    return { field, source: "empty" as const };
  });
}

// ------------------------------------------------------------
// 판정
// ------------------------------------------------------------

export type NoticeLevel =
  | "READY"    // 🟢 다 찼다
  | "PARTIAL"  // 🟡 몇 개만 더 채우면 된다
  | "BLOCKED"; // 🔴 도매처에 없는 것이 많다 — 등록이 막힐 가능성이 크다

export interface NoticeStatus {
  kind: NoticeKind;
  label: string;
  level: NoticeLevel;
  slots: NoticeSlot[];
  filled: number;
  total: number;
  /** 아직 비어 있는 항목 이름 */
  missing: string[];
  text: string;
}

/** 비어 있는 칸이 3개를 넘으면 등록이 막힐 가능성이 크다고 본다 */
const BLOCK_AT = 3;

export function judgeNotice(
  name: string,
  specs: ProductSpec[],
  saved: Record<string, string> = {},
  defaults: NoticeDefaults = {}
): NoticeStatus {
  const kind = noticeKindOf(name);
  const slots = fillNotice(kind, specs, saved, defaults);
  const missing = slots.filter((s) => s.source === "empty").map((s) => s.field.label);
  const filled = slots.length - missing.length;

  let level: NoticeLevel;
  let text: string;
  if (missing.length === 0) {
    level = "READY";
    text = "고시정보가 다 찼습니다";
  } else if (missing.length >= BLOCK_AT) {
    level = "BLOCKED";
    text = `${missing.length}개가 비어 있습니다 — 도매처에 물어보지 않으면 등록이 막힐 수 있습니다`;
  } else {
    level = "PARTIAL";
    text = `${missing.length}개만 더 채우면 됩니다`;
  }

  return { kind, label: KINDS[kind].label, level, slots, filled, total: slots.length, missing, text };
}

export const NOTICE_LABEL: Record<NoticeLevel, string> = {
  READY: "🟢 고시정보 준비됨",
  PARTIAL: "🟡 고시정보 일부 부족",
  BLOCKED: "🔴 고시정보 많이 부족",
};

/** 상품 하나를 그대로 판정 */
export function judgeProductNotice(p: Product, defaults: NoticeDefaults = {}): NoticeStatus {
  return judgeNotice(p.name, p.specs ?? [], p.noticeInfo ?? {}, defaults);
}

/** 상세페이지 하단에 넣을 고시 표 (채워진 것만) */
export function noticeRows(st: NoticeStatus): { label: string; value: string }[] {
  return st.slots
    .filter((s) => s.value)
    .map((s) => ({ label: s.field.label, value: s.value as string }));
}
