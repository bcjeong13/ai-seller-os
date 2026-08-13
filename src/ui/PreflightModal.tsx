import { useState } from "react";
import type { Product } from "../domain/types";
import { runPreflight, placeOrder } from "../store/db";
import { PREFLIGHT_META } from "./meta";
import { formatKrw, formatPct } from "../domain/money";

export function PreflightModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [result] = useState(() => runPreflight(product.id));
  const [placed, setPlaced] = useState<null | string>(null);

  if (!result) return null;
  const meta = PREFLIGHT_META[result.status];
  const p = result.profit;

  const doOrder = (approved: boolean) => {
    placeOrder(product.id, 1, result, approved);
    setPlaced(
      (approved ? "승인 후 " : "") +
        "이 주문을 기록했어요 — 예상손익 스냅샷 저장됨. 실제 발주는 공급처(도매꾹 등)에서 진행하세요."
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="tiny muted">고객 주문 발생 → 발주 전 검증</div>
          <h2 style={{ margin: "4px 0 0", fontSize: 18 }}>ORDER PREFLIGHT CHECK</h2>
          <div className="tiny muted">{product.name}</div>
        </div>
        <div className="modal-body">
          <div className="result-banner" style={{ color: meta.color, background: meta.bg }}>
            {meta.label}
          </div>

          {result.reasons.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {result.reasons.map((r, i) => (
                <div key={i} className="tiny" style={{ color: "var(--muted)", marginBottom: 2 }}>· {r}</div>
              ))}
            </div>
          )}

          <div className="kv-grid" style={{ margin: "12px 0" }}>
            <div className="kv"><div className="k">예상 순이익</div><div className="v" style={{ color: p.netProfitKrw < 0 ? "var(--loss)" : "var(--safe)" }}>{formatKrw(p.netProfitKrw)}</div></div>
            <div className="kv"><div className="k">순이익률</div><div className="v">{formatPct(p.marginPct)}</div></div>
            <div className="kv"><div className="k">현재 원가</div><div className="v">{formatKrw(p.productPriceKrw)}</div></div>
          </div>

          <div className="tiny muted" style={{ margin: "14px 0 6px", fontWeight: 700 }}>확인 항목 13</div>
          <div className="checklist">
            {result.checks.map((c) => (
              <div key={c.no} className="check">
                <span className={"ic " + (c.ok ? "ok" : "no")}>{c.ok ? "✓" : "!"}</span>
                <span className="lbl">{c.no}. {c.label}</span>
                <span className="val">{c.value}</span>
              </div>
            ))}
          </div>

          {result.recommendedActions.length > 0 && (
            <>
              <div className="tiny muted" style={{ margin: "14px 0 4px", fontWeight: 700 }}>권장 행동</div>
              <ul className="recs tiny">
                {result.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </>
          )}

          <div style={{ marginTop: 18 }}>
            {placed ? (
              <div className="pill-info">✅ {placed}</div>
            ) : result.canAutoOrder ? (
              <div className="btn-row">
                <button className="btn primary" onClick={() => doOrder(false)}>발주 진행</button>
                <button className="btn" onClick={onClose}>닫기</button>
              </div>
            ) : (
              <div className="btn-row">
                <button className="btn danger" onClick={() => doOrder(true)}>위험 감수하고 승인 발주</button>
                <button className="btn primary" onClick={onClose}>발주 보류</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
