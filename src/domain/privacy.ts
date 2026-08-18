// ============================================================
// 개인정보 보호 (개발지시서 §7)
// - 화면 기본 마스킹, 복사할 때만 원본
// - 배송정보는 보존기간 경과 시 파기 (주문·손익 기록은 유지)
// - 로그에 개인정보 원문이 남지 않도록 정화
// ============================================================

import type { ShippingInfo } from "./orders";

/** 기본 보존기간(일). 하드코딩 금지 — 설정에서 변경한다. */
export const DEFAULT_RETENTION_DAYS = 90;

// ------------------------------------------------------------
// 마스킹
// ------------------------------------------------------------

/** 홍길동 → 홍*동 / 홍길 → 홍* / 김 → 김 */
export function maskName(name: string): string {
  const n = (name ?? "").trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + "*";
  return n[0] + "*".repeat(n.length - 2) + n[n.length - 1];
}

/** 010-1234-5678 → 010-****-5678 (구분자 없어도 동작) */
export function maskPhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return phone ? "*".repeat(phone.length) : "";
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${head}-****-${tail}`;
}

/**
 * 서울시 강남구 역삼동 123-45 → 서울시 강남구 ***
 * 앞 2어절(시/도 + 시군구)까지만 남긴다.
 */
export function maskAddress(address: string): string {
  const a = (address ?? "").trim();
  if (!a) return "";
  const parts = a.split(/\s+/);
  if (parts.length <= 2) return parts[0] + " ***";
  return `${parts[0]} ${parts[1]} ***`;
}

export interface MaskedShipping {
  recipientName: string;
  phone: string;
  address: string;
}

export function maskShipping(info: ShippingInfo): MaskedShipping {
  return {
    recipientName: maskName(info.recipientName),
    phone: maskPhone(info.phone),
    address: maskAddress(info.address),
  };
}

/** 도매처 배송지 입력용 원본 텍스트 — [복사] 버튼을 눌렀을 때만 사용 */
export function shippingCopyText(info: ShippingInfo): string {
  const lines = [
    `받는분: ${info.recipientName}`,
    `연락처: ${info.phone}`,
    `주소: ${info.address}`,
  ];
  if (info.postalCode) lines.push(`우편번호: ${info.postalCode}`);
  if (info.memo) lines.push(`배송메모: ${info.memo}`);
  return lines.join("\n");
}

// ------------------------------------------------------------
// 파기
// ------------------------------------------------------------

/**
 * 배송 목적 달성 후 보존기간이 지났는지.
 * @param deliveredAt 배송완료 시각(ms). 없으면 아직 파기 대상 아님.
 */
export function isPurgeDue(
  deliveredAt: number | undefined,
  now: number,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): boolean {
  if (!deliveredAt) return false;
  const ms = retentionDays * 24 * 60 * 60 * 1000;
  return now - deliveredAt >= ms;
}

/** 파기까지 남은 일수 (이미 지났으면 0) */
export function daysUntilPurge(
  deliveredAt: number | undefined,
  now: number,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): number | null {
  if (!deliveredAt) return null;
  const ms = retentionDays * 24 * 60 * 60 * 1000;
  const left = deliveredAt + ms - now;
  return left <= 0 ? 0 : Math.ceil(left / (24 * 60 * 60 * 1000));
}

// ------------------------------------------------------------
// 로그 정화 (§7-4)
// ------------------------------------------------------------

const PHONE_RE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g;
const ADDR_RE = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n,]{4,}/g;

/**
 * 로그 문자열에서 개인정보로 보이는 부분을 제거한다.
 * 이벤트 로그를 기록하기 전에 반드시 통과시킨다.
 */
export function sanitizeForLog(message: string): string {
  return (message ?? "")
    .replace(PHONE_RE, "[전화번호]")
    .replace(ADDR_RE, "[주소]");
}

/** 로그에 개인정보가 남았는지 검사 (테스트·개발용) */
export function containsPersonalData(message: string): boolean {
  return PHONE_RE.test(message) || ADDR_RE.test(message);
}
