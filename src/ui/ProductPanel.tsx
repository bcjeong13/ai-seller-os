// 상품 — 목록 / 추가 / 상세 (옵션별 손익 포함)
import { useState } from "react";
import type { Product } from "../domain/types";
import { ALL_CHANNELS } from "../domain/types";
import {
  useStore, getProducts, getProduct, addProduct, updateProduct, deleteProduct,
  feeProfileOf, setListing, refreshCollectedAt, setSupplierStock, updateCost,
} from "../store/db";
import { AddProduct } from "./AddProduct";
import { computeOptionProfits, computeScenarios, summarizeOptions } from "../domain/profitEngine";
import { healthOf } from "../domain/status";
import { formatKrw, formatPct } from "../domain/money";
import { agoText } from "../domain/freshness";
import { parseProductBlock } from "../domain/productImport";
import { planMerge, type MergePlan } from "../domain/collectMerge";
import { STATUS_META, HEALTH_META, GRADE_META, CHANNEL_META, STOCK_LABEL, Badge } from "./meta";

export function ProductPanel({ openId, onBack, onListing }:
  { openId?: string; onBack: () => void; onListing: (id: string) => void }) {
  useStore();
  const [sel, setSel] = useState<string | undefined>(openId);
  const [adding, setAdding] = useState(false);

  if (adding) return <AddProduct onDone={() => setAdding(false)} />;
  if (sel) {
    const p = getProduct(sel);
    if (p) return <ProductDetail product={p} onBack={() => setSel(undefined)} onListing={onListing} />;
  }

  const products = getProducts();
  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 오늘 할 일</button>
      <div className="work-head">
        <h2 className="work-title">상품 {products.length}개</h2>
        <button className="btn primary" onClick={() => setAdding(true)}>+ 상품 추가</button>
      </div>

      {products.length === 0 && <div className="card pad center">등록된 상품이 없습니다.</div>}

      <div className="rows">
        {products.map((p) => {
          const fee = feeProfileOf(p.marketplace);
          const opt = computeOptionProfits(p, fee);
          const listed = p.listings.filter((l) => l.listed);
          return (
            <button key={p.id} className="row" onClick={() => setSel(p.id)}>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-sub">
                  공급가 {formatKrw(p.cost.supplyPriceKrw)} · 판매가 {formatKrw(p.price.buyerPaidKrw)}
                  {opt.lossCount > 0 && <span className="warn-txt"> · 역마진 옵션 {opt.lossCount}개</span>}
                </div>
                <div className="row-sub">
                  {listed.length > 0
                    ? listed.map((l) => <span key={l.marketplace} className="chch" style={{ color: CHANNEL_META[l.marketplace].color, background: CHANNEL_META[l.marketplace].bg, marginRight: 3 }}>{CHANNEL_META[l.marketplace].short}</span>)
                    : <span className="muted tiny">아직 등록 안 함</span>}
                </div>
              </div>
              <div className="row-right"><Badge meta={STATUS_META[p.status]} /></div>
              <span className="arw">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------

function ProductDetail({ product, onBack, onListing }:
  { product: Product; onBack: () => void; onListing: (id: string) => void }) {
  const fee = feeProfileOf(product.marketplace);
  const now = Date.now();
  const opt = computeOptionProfits(product, fee);
  const sc = computeScenarios(product.price, product.cost, { feeProfile: fee });
  const health = healthOf(product, now, fee);

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 상품 목록</button>
      <div className="work-head">
        <div>
          <h2 className="work-title">{product.name}</h2>
          <div className="tiny muted">
            {product.supplierName || "도매처 미입력"} ·{" "}
            {product.sourceUrl ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">도매처 열기 ↗</a> : "URL 없음"}
            {" · "}가격 확인 {agoText(product.lastCollectedAt, now)}
          </div>
        </div>
        <Badge meta={HEALTH_META[health.level]} />
      </div>

      {/* 건강도 — 점수 대신 근거 체크리스트 */}
      <div className="card pad">
        <div className="section-label">상태 — {health.summary}</div>
        <div className="health-grid">
          {health.checks.map((c) => (
            <div key={c.label} className="hrow">
              <span className={`dot ${c.level}`} />
              <b>{c.label}</b>
              <em>{c.detail}</em>
            </div>
          ))}
        </div>
        {health.unknown.length > 0 && (
          <div className="unknown-note">
            미확인: {health.unknown.join(", ")} — 데이터가 없어 판단하지 않습니다
          </div>
        )}
      </div>

      <CollectCard product={product} />

      {/* 판매가가 없으면 손익을 보여주지 않는다 — 0원으로 계산하면 무엇이든 손해로 나온다 */}
      {product.price.buyerPaidKrw <= 0 ? (
        <div className="card pad">
          <div className="section-label">📌 남은 것</div>
          <div className="hint">
            소싱센터에서 본 시세를 보고 <b>판매가</b>를 정하면 손익과 등록 검토가 여기에 나타납니다.
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            매입원가 {formatKrw(product.cost.supplyPriceKrw * Math.max(1, product.cost.minOrderQty ?? 1) + product.cost.shippingKrw)}
            {" "}— 공급가 {formatKrw(product.cost.supplyPriceKrw)}
            {(product.cost.minOrderQty ?? 1) > 1 && ` × ${product.cost.minOrderQty}개`}
            {" + 배송비 "}{formatKrw(product.cost.shippingKrw)}
          </div>
        </div>
      ) : (
      <div className="card pad">
        <div className="section-label">예상 손익</div>
        <div className="money-grid">
          <Mm k="낙관" v={formatKrw(sc.optimistic.netProfitKrw)} s={formatPct(sc.optimistic.marginPct)} />
          <Mm k="기대" v={formatKrw(sc.expected.netProfitKrw)} s={formatPct(sc.expected.marginPct)} />
          <Mm k="보수적" v={formatKrw(sc.conservative.netProfitKrw)} s={formatPct(sc.conservative.marginPct)}
              tone={sc.conservative.netProfitKrw < 0 ? "bad" : "ok"} note="발주 판단 기준" />
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>
          매입 {formatKrw(sc.expected.landedCostKrw)} · 수수료 {formatKrw(sc.expected.totalFeeKrw)} ·
          반품 충당 {formatKrw(sc.expected.returnReserveKrw)} · 손익분기 {formatKrw(sc.expected.breakEvenPriceKrw)}
        </div>
      </div>
      )}

      {/* 옵션별 손익 — 판매가가 있어야 뜻이 있다 */}
      {product.price.buyerPaidKrw > 0 && (
      <div className="card pad">
        <div className="section-label">옵션별 손익 — {summarizeOptions(opt)}</div>
        <table className="opt-table">
          <thead><tr><th></th><th>옵션</th><th>공급가</th><th>판매가</th><th>순이익</th><th>마진</th></tr></thead>
          <tbody>
            {opt.lines.map((l) => (
              <tr key={l.optionId} className={l.profit.netProfitKrw < 0 ? "loss" : ""}>
                <td>{GRADE_META[l.grade].label}</td>
                <td>{l.optionName}{!l.enabled && <span className="tiny muted"> (중지)</span>}</td>
                <td>{formatKrw(l.supplyPriceKrw)}</td>
                <td>{formatKrw(l.sellingPriceKrw)}</td>
                <td className={l.profit.netProfitKrw < 0 ? "neg" : "pos"}>{formatKrw(l.profit.netProfitKrw)}</td>
                <td>{formatPct(l.profit.marginPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {opt.lossCount > 0 && (
          <div className="warn-note">
            🔴 손해 보는 옵션이 있습니다. 해당 옵션의 판매가를 올리거나 판매를 중지하세요.
          </div>
        )}
      </div>
      )}

      {/* 마켓 등록 */}
      <div className="card pad">
        <div className="section-label">등록을 끝낸 마켓</div>
        <p className="hint" style={{ marginTop: 0 }}>
          체크는 <b>이미 등록을 마쳤다</b>는 뜻입니다. 아직 안 올렸으면 비워두세요 —
          비워두어야 <b>오늘 할 일</b>의 「마켓에 등록」에 남습니다.
        </p>
        <div className="listing-grid">
          {ALL_CHANNELS.map((m) => {
            const l = product.listings.find((x) => x.marketplace === m);
            const c = CHANNEL_META[m];
            return (
              <label key={m} className={"chkbtn" + (l?.listed ? " on" : "")}>
                <input type="checkbox" checked={!!l?.listed}
                       onChange={(e) => setListing(product.id, m, { listed: e.target.checked, pending: false })} />
                <span className="chch" style={{ color: c.color, background: c.bg }}>{c.short}</span>
                {c.label}
                {l?.pending && <span className="tiny warn-txt"> 대기</span>}
              </label>
            );
          })}
        </div>
      </div>

      {/* 공급처 */}
      <div className="card pad">
        <div className="section-label">도매처 상태</div>
        <div className="form-grid">
          <div className="field">
            <label>재고</label>
            <select value={product.supplierStock} onChange={(e) => setSupplierStock(product.id, e.target.value as Product["supplierStock"])}>
              {(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN"] as const).map((s) => (
                <option key={s} value={s}>{STOCK_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>지금 공급가 (원)</label>
            <input type="number" defaultValue={product.cost.supplyPriceKrw}
                   onBlur={(e) => {
                     const v = +e.target.value;
                     if (v !== product.cost.supplyPriceKrw) updateCost(product.id, { ...product.cost, supplyPriceKrw: v }, "직접 수정");
                   }} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn sm" onClick={() => refreshCollectedAt(product.id)}>방금 확인함</button>
          <label className="chk-inline">
            <input type="checkbox" checked={product.legalBlock}
                   onChange={(e) => updateProduct(product.id, { legalBlock: e.target.checked })} />
            🚫 이 상품은 팔면 안 됨 (KC 미인증·상표권 등)
          </label>
          <label className="chk-inline">
            <input type="checkbox" checked={product.imageRightsConfirmed}
                   onChange={(e) => updateProduct(product.id, { imageRightsConfirmed: e.target.checked })} />
            이미지 사용 허용 확인함
          </label>
        </div>
      </div>

      {/* 상세페이지는 여기서 만든다 — 할 일 목록을 거치지 않아도 되도록 */}
      <div className="card pad">
        <div className="section-label">📄 마켓에 올릴 내용 만들기</div>
        <p className="hint" style={{ marginTop: 0 }}>
          상품명 후보·상세설명·키워드를 만들어 줍니다. 도매처 재고나 매입가처럼
          <b> 고객이 보면 안 되는 정보는 빼고</b> 정리합니다.
        </p>
        <button className="btn primary lg" onClick={() => onListing(product.id)}>
          상세페이지 만들러 가기 →
        </button>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn danger" onClick={() => {
          if (confirm("이 상품을 삭제할까요?")) { deleteProduct(product.id); onBack(); }
        }}>상품 삭제</button>
      </div>
    </div>
  );
}

/**
 * 확장으로 수집한 내용을 이 상품에 채워 넣는다.
 * 새 상품을 만들지 않는다 — 같은 상품이 두 개가 되면 어느 쪽이 진짜인지 알 수 없다.
 */
function CollectCard({ product }: { product: Product }) {
  // 상세를 아직 안 가져온 상품만 열어둔다. 판매가만 남은 것은 접어둔다.
  const needsCollect = product.options.length === 0 && product.specs.length === 0;
  const [open, setOpen] = useState(needsCollect);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<MergePlan | null>(null);

  const check = () => setPlan(planMerge(product, parseProductBlock(text)));

  const apply = () => {
    if (!plan?.ok || !plan.product || !plan.cost) return;
    const { id, ...rest } = plan.product;
    updateProduct(id, rest);
    const changed =
      plan.cost.supplyPriceKrw !== product.cost.supplyPriceKrw ||
      plan.cost.shippingKrw !== product.cost.shippingKrw ||
      (plan.cost.minOrderQty ?? 1) !== (product.cost.minOrderQty ?? 1);
    // 원가는 이력이 남는 경로로 따로 저장한다
    if (changed) updateCost(id, plan.cost, "확장 수집");
    refreshCollectedAt(id);
    setPlan(null);
    setText("");
    setOpen(false);
  };

  return (
    <div className="card pad" style={needsCollect ? { borderColor: "var(--accent)" } : undefined}>
      <div className="section-label">
        📋 확장에서 수집한 내용 붙여넣기
        {needsCollect && <span className="tiny muted"> 아직 상세를 안 가져왔습니다</span>}
      </div>

      {!open ? (
        <button className="btn sm" onClick={() => setOpen(true)}>다시 수집해서 갱신하기</button>
      ) : (
        <>
          <ol className="howto">
            <li>
              {product.sourceUrl
                ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">도매처 상품페이지</a>
                : "도매처 상품페이지"}를 엽니다
            </li>
            <li>확장 → <b>📋 복사 (앱에 붙여넣기)</b></li>
            <li>아래에 붙여넣고 <b>내용 확인</b>을 누릅니다</li>
          </ol>
          <textarea className="paste" rows={3} value={text}
                    onChange={(e) => { setText(e.target.value); setPlan(null); }}
                    placeholder="##AISOS## 로 시작하는 수집 내용을 붙여넣기" />
          <div className="btn-row">
            <button className="btn primary" disabled={!text.trim()} onClick={check}>내용 확인</button>
            {plan && <button className="btn sm" onClick={() => { setText(""); setPlan(null); }}>지우기</button>}
          </div>
        </>
      )}

      {plan && (
        <div style={{ marginTop: 12 }}>
          {plan.urlMismatch && (
            <div className="warn-note" style={{ marginBottom: 10 }}>
              ⚠️ <b>다른 상품일 수 있습니다</b> — {plan.urlMismatch}. 그대로 반영하면 이 상품의
              내용이 통째로 바뀝니다.
            </div>
          )}

          {plan.changes.length === 0 ? (
            <div className="hint">{plan.message}</div>
          ) : (
            <>
              <div className="tiny muted" style={{ marginBottom: 6 }}>{plan.message} 반영 전에 확인하세요.</div>
              <table className="mk-table">
                <tbody>
                  {plan.changes.map((c, i) => (
                    <tr key={i}>
                      <th>{c.label}</th>
                      <td>
                        <span className="muted">{c.before}</span> → <b>{c.after}</b>
                        {c.affectsProfit && <span className="tiny warn-txt"> 손익에 영향</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {plan.missing.length > 0 && (
            <div className="hint" style={{ marginTop: 8 }}>
              아직 비어 있는 것: <b>{plan.missing.join(", ")}</b>
            </div>
          )}

          {plan.ok && plan.changes.length > 0 && (
            <button className="btn primary lg" style={{ marginTop: 10 }} onClick={apply}>
              이 내용으로 채우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Mm({ k, v, s, tone, note }: { k: string; v: string; s?: string; tone?: "ok" | "bad"; note?: string }) {
  return (
    <div className="m">
      <div className="mk">{k}</div>
      <div className={"mv" + (tone ? ` ${tone}` : "")}>{v}</div>
      {s && <div className="ms">{s}</div>}
      {note && <div className="ms accent">{note}</div>}
    </div>
  );
}
