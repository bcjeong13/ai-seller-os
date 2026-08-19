// ============================================================
// 상품별 공급처 비교 도구 (소싱방향 §7-8)
// "이 상품을 어디서 가져오는 게 유리한가" — 여러 공급처를 넣고 비교.
// ============================================================

import { useMemo, useState } from "react";
import { compareSuppliers, type SupplierOption } from "../domain/supplierCompare";
import { newId } from "../domain/factory";
import { formatKrw } from "../domain/money";

type Row = SupplierOption;

const emptyRow = (name = ""): Row => ({
  id: newId("sup"),
  name,
  supplyPriceKrw: 0,
  shippingKrw: 2500,
  minOrderQty: 1,
  consignment: true,
  returnEasy: true,
  stockStable: true,
});

export function SupplierCompare() {
  const [product, setProduct] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow("도매매"), emptyRow("오너클랜"), emptyRow("도매꾹")]);

  const set = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, emptyRow()]);
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const result = useMemo(
    () => compareSuppliers(product || "상품", rows.filter((r) => r.name && r.supplyPriceKrw > 0)),
    [product, rows]
  );
  const hasData = result.evals.length > 0;

  return (
    <div className="card pad">
      <div className="section-label">🏪 공급처 비교 <span className="tiny muted">이 상품을 어디서 가져올까</span></div>
      <p className="hint" style={{ marginTop: 0 }}>
        같은 상품을 여러 공급처에서 담아 비교하세요. <b>최저가가 항상 최적은 아닙니다</b> — 반품·재고·위탁 여부까지 봅니다.
      </p>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>상품명</label>
        <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="예: 차량용 틈새 수납함" />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="sup-table">
          <thead>
            <tr>
              <th>공급처</th><th>공급가</th><th>배송비</th><th>최소</th>
              <th>위탁</th><th>반품</th><th>재고</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><input className="cell-in" value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} placeholder="공급처" /></td>
                <td><input className="cell-in num" type="number" value={r.supplyPriceKrw || ""} onChange={(e) => set(r.id, { supplyPriceKrw: +e.target.value })} /></td>
                <td><input className="cell-in num" type="number" value={r.shippingKrw} onChange={(e) => set(r.id, { shippingKrw: +e.target.value })} /></td>
                <td><input className="cell-in num sm" type="number" value={r.minOrderQty} onChange={(e) => set(r.id, { minOrderQty: +e.target.value })} /></td>
                <td className="ctr"><input type="checkbox" checked={r.consignment} onChange={(e) => set(r.id, { consignment: e.target.checked })} /></td>
                <td className="ctr"><input type="checkbox" checked={r.returnEasy} onChange={(e) => set(r.id, { returnEasy: e.target.checked })} /></td>
                <td className="ctr"><input type="checkbox" checked={r.stockStable} onChange={(e) => set(r.id, { stockStable: e.target.checked })} /></td>
                <td><button className="btn xs" onClick={() => remove(r.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={add}>+ 공급처 추가</button>

      {hasData && (
        <div style={{ marginTop: 16 }}>
          <div className="verdict-note">💡 {result.note}</div>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="sup-result">
              <thead>
                <tr><th>순위</th><th>공급처</th><th>1주문 매입원가</th><th>개당 환산</th><th>상태</th></tr>
              </thead>
              <tbody>
                {result.evals.map((e, i) => (
                  <tr key={e.option.id} className={e.recommended ? "rec" : e.viable ? "" : "dim"}>
                    <td>{e.recommended ? "🏆" : e.viable ? i + 1 : "–"}</td>
                    <td>
                      <b>{e.option.name}</b>
                      {e.recommended && <span className="rec-badge">추천</span>}
                    </td>
                    <td className="num">{formatKrw(e.landedCostKrw)}</td>
                    <td className="num muted">{formatKrw(e.perUnitKrw)}</td>
                    <td className="tiny">
                      {e.flags.length === 0 ? <span style={{ color: "var(--safe)" }}>안정</span> : e.flags.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            ※ 1주문 매입원가 = 공급가 × 최소구매수량 + 배송비. 고객이 1개를 사도 이 금액이 나갑니다. 최소구매수량이 1이 아니면 "개당 환산"은 참고값일 뿐이고, 남는 수량은 재고가 됩니다. 위탁 불가는 후보에서 제외됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
