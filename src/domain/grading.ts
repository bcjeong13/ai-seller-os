// ============================================================
// 손익 위험 등급 (프롬프트 §17, §18)
// LOSS → DANGER → WARNING → SAFE  (BLOCKED는 법적/이상치에서 별도)
// ============================================================

import type { ProfitResult, RiskGrade } from "./types";

export interface GradingSettings {
  minMarginPct: number;
  minProfitKrw: number;
  /** WARNING 완충폭(%p) — 최소기준 위 이 폭 안이면 WARNING */
  warningBufferPct: number;
}

export function gradeProfit(
  profit: ProfitResult,
  s: GradingSettings
): RiskGrade {
  if (profit.netProfitKrw < 0) return "LOSS";

  const belowMin =
    profit.marginPct < s.minMarginPct || profit.netProfitKrw < s.minProfitKrw;
  if (belowMin) return "DANGER";

  const nearMin =
    profit.marginPct < s.minMarginPct + s.warningBufferPct;
  if (nearMin) return "WARNING";

  return "SAFE";
}

export const GRADE_LABEL: Record<RiskGrade, string> = {
  SAFE: "🟢 안전",
  WARNING: "🟡 주의",
  DANGER: "🟠 위험",
  LOSS: "🔴 손실",
  BLOCKED: "⛔ 차단",
};
