// ============================================================
// 주문 가져오기 — 마켓 판매자센터에서 복사 → 붙여넣기 (지시서 §9 P0-3)
// API보다 먼저 만드는 기능. 중복 주문을 반드시 막는다.
// ★ 개인정보가 들어오므로 화면에 원본을 늘어놓지 않는다.
// ============================================================

import { useState } from "react";
import type { Marketplace } from "../domain/types";
import { ALL_CHANNELS } from "../domain/types";
import {
  parseOrders, splitDuplicates, FIELD_LABEL,
  type ParseOrdersResult, type OrderField,
} from "../domain/orderImport";
import { importOrders, existingOrderKeys } from "../store/db";
import { maskName, maskPhone } from "../domain/privacy";
import { CHANNEL_META } from "./meta";
import { formatKrw } from "../domain/money";

const MAPPABLE: OrderField[] = [
  "marketOrderNo", "productName", "optionName", "quantity",
  "listPrice", "discount", "buyerPaid", "buyerShipping",
  "recipientName", "phone", "address", "postalCode", "memo",
];

export function OrderImportPanel({ onDone }: { onDone: () => void }) {
  const [market, setMarket] = useState<Marketplace>("NAVER");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseOrdersResult | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<OrderField, number>>>({});
  const [saved, setSaved] = useState<{ added: number; skipped: number } | null>(null);

  const doParse = (overrideMap?: Partial<Record<OrderField, number>>) => {
    const r = parseOrders(text, overrideMap);
    setResult(r);
    setMapping(r.mapping);
    setSaved(null);
  };

  const dup = result?.ok
    ? splitDuplicates(result.rows, existingOrderKeys())
    : { fresh: [], duplicates: [] };

  const save = () => {
    if (!result?.ok) return;
    const r = importOrders(result.rows, market);
    setSaved({ added: r.added, skipped: r.skipped });
    setText("");
    setResult(null);
  };

  return (
    <div className="work">
      <button className="back" onClick={onDone}>← 돌아가기</button>
      <h2 className="work-title">주문 가져오기</h2>

      <div className="steps">
        <div className="step">
          <span className="n">1</span>
          <div>
            <b>어느 마켓 주문인가요?</b>
            <div className="market-pick">
              {ALL_CHANNELS.map((m) => (
                <button key={m} className={"mbtn" + (market === m ? " on" : "")} onClick={() => setMarket(m)}>
                  <span className="chch" style={{ color: CHANNEL_META[m].color, background: CHANNEL_META[m].bg }}>
                    {CHANNEL_META[m].short}
                  </span>
                  {CHANNEL_META[m].label}
                </button>
              ))}
            </div>
            {CHANNEL_META[market].url && (
              <a className="link-out" href={CHANNEL_META[market].url} target="_blank" rel="noreferrer">
                {CHANNEL_META[market].label} 판매자센터 열기 ↗
              </a>
            )}
          </div>
        </div>

        <div className="step">
          <span className="n">2</span>
          <div>
            <b>주문 목록을 복사해서 아래에 붙여넣으세요</b>
            <div className="hint">
              판매자센터에서 주문 목록을 <b>헤더(제목 줄)까지 포함해</b> 드래그 → 복사(Ctrl+C) →
              아래에 붙여넣기(Ctrl+V). 엑셀로 받은 파일을 열어 복사해도 됩니다.
            </div>
            <textarea
              className="paste"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"주문번호\t상품명\t옵션\t수량\t결제금액\t수취인\t연락처\t주소\n2026081712345\t차량용 거치대\t블랙\t2\t12900\t..."}
            />
            <button className="btn primary" disabled={!text.trim()} onClick={() => doParse()}>
              인식하기
            </button>
          </div>
        </div>

        {result && !result.ok && (
          <div className="step">
            <span className="n warn">!</span>
            <div>
              <b>{result.message}</b>
              {result.headers.length > 0 && (
                <>
                  <div className="hint">각 항목이 몇 번째 칸인지 직접 골라주세요.</div>
                  <div className="map-grid">
                    {MAPPABLE.map((f) => (
                      <label key={f} className="map-row">
                        <span>{FIELD_LABEL[f]}</span>
                        <select
                          value={mapping[f] ?? -1}
                          onChange={(e) => {
                            const v = +e.target.value;
                            setMapping((m) => ({ ...m, [f]: v < 0 ? undefined : v }));
                          }}
                        >
                          <option value={-1}>없음</option>
                          {result.headers.map((h, i) => (
                            <option key={i} value={i}>{i + 1}. {h || "(빈 칸)"}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button className="btn primary" onClick={() => doParse(mapping)}>이 설정으로 다시 인식</button>
                </>
              )}
            </div>
          </div>
        )}

        {result?.ok && (
          <div className="step">
            <span className="n ok">3</span>
            <div>
              <b>{result.rows.length}건을 인식했습니다.</b>
              {dup.duplicates.length > 0 && (
                <div className="dup-warn">
                  ⚠ 이미 등록된 주문 {dup.duplicates.length}건이 있습니다. 이 주문은 <b>건너뜁니다.</b>
                  <div className="tiny">{dup.duplicates.slice(0, 5).map((d) => d.marketOrderNo).join(", ")}</div>
                </div>
              )}
              <table className="preview">
                <thead>
                  <tr><th>주문번호</th><th>상품</th><th>옵션</th><th>수량</th><th>결제금액</th><th>수취인</th><th></th></tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 12).map((r, i) => {
                    const isDup = dup.duplicates.includes(r);
                    return (
                      <tr key={i} className={isDup ? "dup" : ""}>
                        <td>{r.marketOrderNo}</td>
                        <td>{r.productName}</td>
                        <td>{r.optionName || "—"}</td>
                        <td>{r.quantity}</td>
                        <td>{formatKrw(r.buyerPaidKrw)}</td>
                        {/* 개인정보는 마스킹해서 보여준다 */}
                        <td>{maskName(r.recipientName)} {maskPhone(r.phone)}</td>
                        <td>{isDup ? "중복" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.rows.length > 12 && <div className="tiny muted">외 {result.rows.length - 12}건</div>}
              <div className="privacy-note">
                🔒 수취인 정보는 가려서 표시됩니다. 발주할 때만 원본을 복사해 사용합니다.
              </div>
              <button className="btn primary lg" onClick={save} disabled={dup.fresh.length === 0}>
                {dup.fresh.length}건 저장하기
              </button>
            </div>
          </div>
        )}

        {saved && (
          <div className="step">
            <span className="n ok">✓</span>
            <div>
              <b>{saved.added}건을 저장했습니다.</b>
              {saved.skipped > 0 && <span className="tiny muted"> (중복 {saved.skipped}건 건너뜀)</span>}
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={onDone}>오늘 할 일로 돌아가기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
