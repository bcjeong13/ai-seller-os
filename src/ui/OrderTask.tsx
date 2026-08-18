// ============================================================
// 주문 작업 화면 — 한 화면에 할 일 하나, Primary 버튼 하나 (지시서 §3, §4)
// 발주 안전검사 → 발주 → 송장 → 발송처리
// ★ 개인정보는 마스킹, [복사] 눌렀을 때만 원본
// ============================================================

import { useState } from "react";
import type { Order } from "../domain/orders";
import { nextActionOf, compareSettlement } from "../domain/orders";
import { getProduct, getOrder, getShippingInfo, feeProfileOf, setOrderStage, setTracking, saveOrderSnapshot, addOrderException, settleOrder, useStore, updateProduct, updateCost } from "../store/db";
import { orderPreflightCheck, type PreflightResult } from "../domain/preflight";
import { createSnapshot } from "../domain/orders";
import { maskShipping, shippingCopyText } from "../domain/privacy";
import { formatKrw } from "../domain/money";
import { recommendSellingPrice, computeProfit } from "../domain/profitEngine";
import { CHANNEL_META, STAGE_META, Badge } from "./meta";

export function OrderTask({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  useStore();
  // ★ 주문 객체를 들고 있으면 상태가 바뀌어도 화면이 갱신되지 않는다. 항상 id로 다시 읽는다.
  const order = getOrder(orderId);
  if (!order) return <div className="card pad center">주문을 찾을 수 없습니다.</div>;
  const action = nextActionOf(order);

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 목록으로</button>
      <div className="work-head">
        <div>
          <h2 className="work-title">{order.productName}</h2>
          <div className="tiny muted">
            {order.optionName && <>옵션 {order.optionName} · </>}
            {order.quantity}개 · 주문번호 {order.marketOrderNo}
            {" · "}<span className="chch" style={{ color: CHANNEL_META[order.marketplace].color, background: CHANNEL_META[order.marketplace].bg }}>
              {CHANNEL_META[order.marketplace].short}
            </span>
          </div>
        </div>
        <Badge meta={STAGE_META[order.stage]} />
      </div>

      {action === "CHECK_ORDER" && <CheckStep order={order} />}
      {action === "PLACE_ORDER" && <PlaceStep order={order} />}
      {action === "ENTER_TRACKING" && <TrackingStep order={order} />}
      {action === "MARK_SHIPPED" && <ShipStep order={order} />}
      {action === "CONFIRM_DELIVERY" && <ConfirmStep order={order} />}
      {action === "SETTLE" && <SettleStep order={order} />}
      {action === "RESOLVE" && <ResolveStep order={order} />}
      {(action === "WAIT" || action === "DONE") && <DoneStep order={order} />}
    </div>
  );
}

// ------------------------------------------------------------
// 1) 발주 안전검사
// ------------------------------------------------------------

function CheckStep({ order }: { order: Order }) {
  const product = order.productId ? getProduct(order.productId) : undefined;
  const [showAll, setShowAll] = useState(false);

  if (!product) {
    return (
      <div className="card pad">
        <div className="verdict warn">⚠ 등록된 상품과 연결되지 않았습니다</div>
        <p>주문의 상품명이 등록 상품과 달라 손익을 계산할 수 없습니다. 상품을 먼저 등록하거나 이름을 맞춰주세요.</p>
        <button className="btn" onClick={() => setOrderStage(order.id, "READY_TO_ORDER", "상품 미연결 상태로 진행")}>
          그래도 발주 단계로 넘기기
        </button>
      </div>
    );
  }

  const fee = feeProfileOf(order.marketplace);
  const r = orderPreflightCheck({ product, order, feeProfile: fee, now: Date.now() });

  const proceed = () => {
    saveOrderSnapshot(order.id, createSnapshot(order, r.profit, r.scenarios.conservative, Date.now()));
    setOrderStage(order.id, "READY_TO_ORDER", "발주 안전검사 통과");
  };

  const tone = r.status === "ORDERABLE" ? "ok" : r.canOrder ? "warn" : "bad";
  const recPrice = recommendSellingPrice(product.cost, product.minMarginPct + 10, fee);

  return (
    <>
      <div className="card pad">
        <div className={`verdict ${tone}`}>{r.headline}</div>

        <div className="money-grid">
          <M k="등록 당시 공급가" v={formatKrw(product.baselineCost.supplyPriceKrw)} />
          <M k="지금 공급가" v={formatKrw(product.cost.supplyPriceKrw)}
             sub={r.supplyChangePct !== 0 ? `${r.supplyChangePct > 0 ? "▲" : "▼"}${Math.abs(r.supplyChangePct).toFixed(1)}%` : "변동 없음"}
             tone={r.supplyChangePct >= 10 ? "bad" : undefined} />
          <M k="구매자 결제금액" v={formatKrw(r.profit.buyerPaidKrw)} />
          <M k="마켓 수수료" v={formatKrw(r.profit.totalFeeKrw)} />
          <M k="예상 순이익 (기대)" v={formatKrw(r.profit.netProfitKrw)}
             tone={r.profit.netProfitKrw < 0 ? "bad" : "ok"} />
          <M k="예상 순이익 (보수적)" v={formatKrw(r.scenarios.conservative.netProfitKrw)}
             sub="이 값으로 판단합니다"
             tone={r.scenarios.conservative.netProfitKrw < 0 ? "bad" : "ok"} />
        </div>

        {r.reasons.map((x, i) => <p key={i} className="reason">{x}</p>)}

        <button className="linkbtn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "검사 항목 접기" : `검사 항목 ${r.checks.length}개 보기`}
        </button>
        {showAll && (
          <ul className="checklist">
            {r.checks.map((c) => (
              <li key={c.no} className={c.ok ? "ok" : "no"}>
                <span>{c.ok ? "✓" : "!"}</span>
                <b>{c.label}</b>
                <em>{c.value}</em>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card pad">
        <div className="section-label">할 수 있는 것</div>
        {r.canOrder ? (
          <button className="btn primary lg" onClick={proceed}>발주 단계로 진행</button>
        ) : (
          <div className="choice-list">
            {Number.isFinite(recPrice) && (
              <button className="btn" onClick={() => {
                updateProduct(product.id, { price: { ...product.price, listPriceKrw: recPrice, buyerPaidKrw: Math.max(0, recPrice - product.price.discountKrw) } });
              }}>
                판매가를 {formatKrw(recPrice)}로 올리기
              </button>
            )}
            <button className="btn" onClick={() => addOrderException(order.id, "SUPPLIER_OUT_OF_STOCK", "도매처 품절로 처리")}>
              도매처 품절로 처리
            </button>
            <button className="btn" onClick={() => updateProduct(product.id, { status: "DISCONTINUED" })}>
              이 상품 판매 중지
            </button>
            <button className="btn danger" onClick={() => {
              if (confirm("손해를 감수하고 발주 단계로 넘기시겠습니까?")) proceed();
            }}>
              그래도 발주 (손해 감수)
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------
// 2) 도매처에 발주
// ------------------------------------------------------------

function PlaceStep({ order }: { order: Order }) {
  const product = order.productId ? getProduct(order.productId) : undefined;
  const info = getShippingInfo(order.id);
  const [copied, setCopied] = useState("");
  const [revealed, setRevealed] = useState(false);
  // ★ 착불로 발주하면 고객이 택배기사에게 배송비를 낸다 → 환불·클레임으로 직결된다.
  //   되돌릴 수 없는 실수라 발주 완료를 잠가둔다.
  const [prepaid, setPrepaid] = useState(false);
  // ★ 등록 이후 도매처가 공급가를 올리면 팔수록 손해다.
  //   발주는 어차피 도매처 결제 화면을 보는 순간이라, 여기서 실제 금액을 받아 감시한다.
  const baseSupply = product ? product.cost.supplyPriceKrw : 0;
  const [paidSupply, setPaidSupply] = useState(baseSupply);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1600);
    } catch { setCopied("복사 실패 — 직접 선택해 복사하세요"); }
  };

  const masked = info ? maskShipping(info) : null;

  const diff = paidSupply - baseSupply;
  const feeP = feeProfileOf(order.marketplace);
  // 오른 공급가로 다시 계산한 손익 — "지금 이 판매가로 계속 팔면" 어떻게 되는가
  const after =
    product && diff !== 0
      ? computeProfit(product.price, { ...product.cost, supplyPriceKrw: paidSupply }, { feeProfile: feeP })
      : null;

  const confirmOrder = () => {
    let msg = "도매처에서 정말 발주하셨습니까?\n\n확인을 누르면 발주 완료로 기록됩니다.";
    if (diff > 0) {
      const willLose = after && after.netProfitKrw < 0
        ? `지금 판매가로는 앞으로 1건당 ${formatKrw(Math.abs(after.netProfitKrw))} 손해입니다.\n`
        : "";
      msg =
        `공급가가 ${formatKrw(diff)} 올랐습니다 (${formatKrw(baseSupply)} → ${formatKrw(paidSupply)}).\n` +
        willLose +
        "\n발주 완료로 기록하고, 상품 공급가를 갱신합니다.";
    }
    if (!confirm(msg)) return;
    if (product && diff !== 0) {
      updateCost(product.id, { ...product.cost, supplyPriceKrw: paidSupply }, "발주 시 실제 결제금액");
    }
    setOrderStage(order.id, "ORDERED", "도매처 발주 완료");
  };

  return (
    <>
      <div className="card pad">
        <div className="section-label">이렇게 하세요</div>
        <ol className="howto">
          <li>아래 버튼으로 도매처 상품 페이지를 엽니다</li>
          <li>옵션 <b>{order.optionName || "기본"}</b>을 <b>{order.quantity}개</b> 장바구니에 담습니다</li>
          <li>배송지에 아래 정보를 붙여넣습니다</li>
          <li>배송비결제를 <b>선불(주문시결제)</b>로 고릅니다</li>
          <li>결제 후 <b>발주 완료</b> 버튼을 누릅니다</li>
        </ol>
        {product?.sourceUrl ? (
          <a className="btn primary lg" href={product.sourceUrl} target="_blank" rel="noreferrer">
            도매처 열기 ↗
          </a>
        ) : (
          <div className="hint">도매처 URL이 등록되어 있지 않습니다. 상품 정보에 추가해 주세요.</div>
        )}
      </div>

      <div className="card pad">
        <div className="section-label">
          배송 정보
          <span className="lock">🔒 가려서 표시됩니다</span>
        </div>
        {!info ? (
          <div className="hint">이 주문에는 배송정보가 없습니다.</div>
        ) : (
          <>
            <div className="ship-grid">
              <ShipRow label="받는분" masked={masked!.recipientName} real={info.recipientName}
                       revealed={revealed} onCopy={() => copy(info.recipientName, "받는분")} />
              <ShipRow label="연락처" masked={masked!.phone} real={info.phone}
                       revealed={revealed} onCopy={() => copy(info.phone, "연락처")} />
              <ShipRow label="주소" masked={masked!.address} real={info.address}
                       revealed={revealed} onCopy={() => copy(info.address, "주소")} />
              {info.postalCode && (
                <ShipRow label="우편번호" masked={info.postalCode} real={info.postalCode}
                         revealed onCopy={() => copy(info.postalCode!, "우편번호")} />
              )}
              {info.memo && (
                <ShipRow label="배송메모" masked={info.memo} real={info.memo}
                         revealed onCopy={() => copy(info.memo!, "배송메모")} />
              )}
            </div>
            <div className="btn-row">
              <button className="btn primary" onClick={() => copy(shippingCopyText(info), "전체")}>
                전체 복사
              </button>
              <button className="btn sm" onClick={() => setRevealed((v) => !v)}>
                {revealed ? "가리기" : "원본 보기"}
              </button>
            </div>
            {copied && <div className="copied">✅ {copied} 복사됨</div>}
          </>
        )}
      </div>

      <div className="card pad">
        <div className="section-label">실제로 얼마에 사셨나요?</div>
        <div className="paid-row">
          <div>
            <div className="paid-label">등록할 때</div>
            <div className="paid-base">{formatKrw(baseSupply)}</div>
          </div>
          <div className="paid-arrow">→</div>
          <div className="paid-input">
            <div className="paid-label">지금 결제한 금액</div>
            <input type="number" value={paidSupply}
                   onChange={(e) => setPaidSupply(Math.max(0, +e.target.value))} />
          </div>
        </div>
        <div className="hint">도매처 결제 화면에 뜬 <b>1개 단가</b>를 그대로 넣으세요. 같으면 그냥 두시면 됩니다.</div>

        {diff !== 0 && (
          <div className={`warn-note ${after && after.netProfitKrw < 0 ? "bad-note" : ""}`} style={{ marginTop: 10 }}>
            {diff > 0 ? "📈" : "📉"} 공급가가 <b>{formatKrw(Math.abs(diff))}</b> {diff > 0 ? "올랐습니다" : "내렸습니다"}
            {baseSupply > 0 && <> ({Math.round((diff / baseSupply) * 100)}%)</>}
            {after && (
              <div style={{ marginTop: 6 }}>
                {after.netProfitKrw < 0 ? (
                  <>이 판매가({formatKrw(product?.price.buyerPaidKrw ?? 0)})로 계속 팔면
                    <b> 1건당 {formatKrw(Math.abs(after.netProfitKrw))} 손해</b>입니다.
                    이번 건은 발주하시고, <b>판매가를 올리거나 판매를 멈추세요.</b></>
                ) : (
                  <>바뀐 공급가로도 1건당 {formatKrw(after.netProfitKrw)} 남습니다.</>
                )}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 12 }}>
              발주 완료를 누르면 상품 공급가가 <b>{formatKrw(paidSupply)}</b>으로 갱신되고 기록에 남습니다.
            </div>
          </div>
        )}
      </div>

      <div className="card pad">
        <div className="section-label">발주하셨나요?</div>
        <div className="warn-note">
          ⚠️ 배송비를 <b>착불</b>로 발주하면 택배기사가 <b>고객에게</b> 배송비를 받아갑니다.
          환불·별점 1점으로 이어집니다. 반드시 <b>선불(주문시결제)</b>이어야 합니다.
          <label className="chk-inline" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} />
            배송비를 <b>선불(주문시결제)</b>로 선택했습니다
          </label>
        </div>
        <button className="btn primary lg" style={{ marginTop: 10 }}
                disabled={!prepaid} onClick={confirmOrder}>발주 완료</button>
        <button className="btn sm" style={{ marginTop: 8 }}
                onClick={() => addOrderException(order.id, "ORDER_FAILED", "발주 실패로 표시")}>
          발주가 안 됐어요 (품절·오류)
        </button>
      </div>
    </>
  );
}

function ShipRow({ label, masked, real, revealed, onCopy }: {
  label: string; masked: string; real: string; revealed: boolean; onCopy: () => void;
}) {
  return (
    <div className="ship-row">
      <span className="k">{label}</span>
      <span className="v">{revealed ? real : masked}</span>
      <button className="btn xs" onClick={onCopy}>복사</button>
    </div>
  );
}

// ------------------------------------------------------------
// 3) 송장번호 입력
// ------------------------------------------------------------

function TrackingStep({ order }: { order: Order }) {
  const [courier, setCourier] = useState(order.courier ?? "");
  const [no, setNo] = useState(order.trackingNo ?? "");

  return (
    <div className="card pad">
      <div className="section-label">이렇게 하세요</div>
      <ol className="howto">
        <li>도매처에서 발급된 <b>택배사·송장번호</b>를 확인합니다</li>
        <li>아래에 입력하고 저장합니다</li>
        <li>다음 단계에서 마켓에 발송처리를 합니다</li>
      </ol>
      <div className="form-grid">
        <div className="field">
          <label>택배사</label>
          <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="예: CJ대한통운" />
        </div>
        <div className="field">
          <label>송장번호</label>
          <input value={no} onChange={(e) => setNo(e.target.value)} placeholder="숫자만" />
        </div>
      </div>
      <button className="btn primary lg" disabled={!courier.trim() || !no.trim()}
              onClick={() => setTracking(order.id, courier.trim(), no.trim())}>
        송장 저장
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 4) 마켓에 발송처리
// ------------------------------------------------------------

function ShipStep({ order }: { order: Order }) {
  const [copied, setCopied] = useState(false);
  const c = CHANNEL_META[order.marketplace];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${order.courier ?? ""} ${order.trackingNo ?? ""}`.trim());
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  return (
    <div className="card pad">
      <div className="section-label">이렇게 하세요</div>
      <ol className="howto">
        <li>{c.label} 판매자센터를 엽니다</li>
        <li>주문번호 <b>{order.marketOrderNo}</b>를 찾습니다</li>
        <li>아래 송장번호를 입력하고 발송처리합니다</li>
      </ol>

      <div className="track-box">
        <div><span className="k">택배사</span> <b>{order.courier}</b></div>
        <div><span className="k">송장번호</span> <b>{order.trackingNo}</b></div>
        <button className="btn xs" onClick={copy}>복사</button>
      </div>
      {copied && <div className="copied">✅ 복사됨</div>}

      {c.url && <a className="btn primary lg" href={c.url} target="_blank" rel="noreferrer">{c.label} 판매자센터 열기 ↗</a>}
      <button className="btn" style={{ marginTop: 10 }}
              onClick={() => setOrderStage(order.id, "IN_TRANSIT", "마켓 발송처리 완료")}>
        발송처리 완료
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 5) 배송 완료 확인
// ------------------------------------------------------------

function ConfirmStep({ order }: { order: Order }) {
  const c = CHANNEL_META[order.marketplace];
  return (
    <div className="card pad">
      <div className="section-label">배송이 끝났나요?</div>
      <ol className="howto">
        <li>{c.label}에서 주문 <b>{order.marketOrderNo}</b>의 배송 상태를 확인합니다</li>
        <li>고객이 받았으면 아래 버튼을 누릅니다</li>
      </ol>
      <div className="track-box">
        <div><span className="k">택배사</span> <b>{order.courier || "—"}</b></div>
        <div><span className="k">송장번호</span> <b>{order.trackingNo || "—"}</b></div>
      </div>
      {c.url && <a className="btn" href={c.url} target="_blank" rel="noreferrer">{c.label} 판매자센터 열기 ↗</a>}
      <button className="btn primary lg" style={{ marginTop: 10 }}
              onClick={() => setOrderStage(order.id, "CONFIRMED", "배송 완료 확인")}>
        배송 완료됐습니다
      </button>
      <button className="btn sm" style={{ marginTop: 8 }}
              onClick={() => addOrderException(order.id, "RETURNED", "반품 발생")}>
        반품됐어요
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 6) 정산 입력 — 예상과 실제를 비교한다
// ------------------------------------------------------------

function SettleStep({ order }: { order: Order }) {
  const expected = order.snapshot?.expected_profit_snapshot;
  const [payout, setPayout] = useState<number | "">("");
  const c = CHANNEL_META[order.marketplace];

  // 실제 순이익 = 마켓 정산금액 − 내가 도매처에 쓴 돈
  const landed = order.snapshot?.landed_cost_snapshot ?? 0;
  const actual = payout === "" ? null : Math.round(Number(payout) - landed);
  const diff = actual !== null && expected !== undefined ? actual - expected : null;

  return (
    <div className="card pad">
      <div className="section-label">정산 확인</div>
      <ol className="howto">
        <li>{c.label} 판매자센터에서 이 주문의 <b>정산금액(실제 입금액)</b>을 확인합니다</li>
        <li>아래에 입력하면 예상과 얼마나 달랐는지 비교해 드립니다</li>
      </ol>
      {c.url && <a className="btn sm" href={c.url} target="_blank" rel="noreferrer">{c.label} 정산 확인 ↗</a>}

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label>마켓 정산금액 (실제 입금액, 원)</label>
          <input type="number" value={payout}
                 onChange={(e) => setPayout(e.target.value === "" ? "" : +e.target.value)}
                 placeholder="예: 11,800" />
          <span className="hint">수수료가 빠지고 실제로 들어온 금액</span>
        </div>
      </div>

      <div className="money-grid" style={{ marginTop: 10 }}>
        <M k="도매처에 쓴 돈" v={formatKrw(landed)} />
        {expected !== undefined && <M k="예상했던 순이익" v={formatKrw(expected)} />}
        {actual !== null && (
          <M k="실제 순이익" v={formatKrw(actual)} tone={actual < 0 ? "bad" : "ok"} />
        )}
      </div>

      {diff !== null && (
        <div className={"warn-note"} style={{ marginTop: 12 }}>
          {Math.abs(diff) < 100
            ? "✅ 예상과 거의 같습니다. 계산이 잘 맞고 있습니다."
            : diff < 0
              ? `⚠ 예상보다 ${formatKrw(Math.abs(diff))} 덜 남았습니다. 수수료 설정을 확인해 보세요.`
              : `✅ 예상보다 ${formatKrw(diff)} 더 남았습니다.`}
        </div>
      )}

      <button className="btn primary lg" style={{ marginTop: 12 }} disabled={actual === null}
              onClick={() => actual !== null && settleOrder(order.id, actual)}>
        정산 완료로 기록
      </button>
      <button className="btn sm" style={{ marginTop: 8 }}
              onClick={() => setOrderStage(order.id, "SETTLED", "정산 금액 없이 마무리")}>
        정산금액 모름 — 그냥 마무리
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 7) 완료
// ------------------------------------------------------------

function DoneStep({ order }: { order: Order }) {
  const cmp = compareSettlement(order);
  return (
    <div className="card pad">
      <div className="verdict ok">✅ 이 주문은 끝났습니다</div>
      {cmp && (
        <div className="money-grid">
          <M k="예상했던 순이익" v={formatKrw(cmp.expectedKrw)} />
          <M k="실제 순이익" v={formatKrw(cmp.actualKrw)} tone={cmp.actualKrw < 0 ? "bad" : "ok"} />
          <M k="차이" v={formatKrw(cmp.diffKrw)} sub={cmp.note} tone={cmp.worse ? "bad" : "ok"} />
        </div>
      )}
      {!order.hasShippingInfo && order.shippingPurgedAt && (
        <p className="reason tiny muted">🔒 보존기간이 지나 배송정보는 삭제되었습니다. 손익 기록은 남아 있습니다.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 8) 예외 처리
// ------------------------------------------------------------

function ResolveStep({ order }: { order: Order }) {
  return (
    <div className="card pad">
      <div className="verdict bad">⚠ 이 주문에 문제가 있습니다</div>
      <ul className="ex-list">
        {order.exceptions.map((e) => <li key={e}>{e}</li>)}
      </ul>
      <p className="reason">
        고객에게 안내가 필요할 수 있습니다. 처리 후 아래에서 상태를 정리하세요.
      </p>
      <div className="choice-list">
        <button className="btn" onClick={() => setOrderStage(order.id, "SETTLED", "취소 처리")}>취소로 마무리</button>
        <button className="btn" onClick={() => setOrderStage(order.id, "NEW", "다시 검사")}>다시 검사하기</button>
      </div>
    </div>
  );
}

function M({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="m">
      <div className="mk">{k}</div>
      <div className={"mv" + (tone ? ` ${tone}` : "")}>{v}</div>
      {sub && <div className="ms">{sub}</div>}
    </div>
  );
}
