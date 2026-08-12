// ============================================================
// 이상 가격 감지 (프롬프트 §25, §59)
// 급등/급락은 즉시 반영 금지 → PRICE_ANOMALY 격리 후 확정.
// ============================================================

export interface AnomalyResult {
  isAnomaly: boolean;
  changeRatio: number; // (new-old)/old
  reason: string;
}

/**
 * @param threshold 변동 임계치(비율). 기본 0.4 = ±40%
 */
export function detectAnomaly(
  oldCost: number,
  newCost: number,
  threshold = 0.4
): AnomalyResult {
  if (oldCost <= 0) {
    return { isAnomaly: false, changeRatio: 0, reason: "기준 원가 없음" };
  }
  const changeRatio = (newCost - oldCost) / oldCost;
  const isAnomaly = Math.abs(changeRatio) > threshold;
  return {
    isAnomaly,
    changeRatio,
    reason: isAnomaly
      ? `비정상 변동 감지 (${(changeRatio * 100).toFixed(0)}%) — 재확인 필요`
      : "정상 범위",
  };
}
