// 금액 유틸 — 모든 금액은 정수 원(KRW)으로 반올림한다.

export const won = (n: number): number => Math.round(n);

export const pct = (base: number, percent: number): number =>
  Math.round(base * (percent / 100));

/** 원화 표기 (예: 7,000원) */
export const formatKrw = (n: number): string =>
  `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 퍼센트 표기 (소수 1자리) */
export const formatPct = (n: number): string => `${n.toFixed(1)}%`;
