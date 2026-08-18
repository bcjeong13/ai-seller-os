// ============================================================
// 마켓 등록 작업 화면 (개발지시서 §9 P0-2)
// 마켓 API가 없으므로 등록은 수동이다.
// 프로그램은 "무엇을 어디에 넣을지" 정리해주고, 어디까지 했는지 추적한다.
// ============================================================

import { useState } from "react";
import type { Product, Marketplace } from "../domain/types";
import { ALL_CHANNELS } from "../domain/types";
import { getProduct, feeProfileOf, setListing, useStore, updateProduct } from "../store/db";
import { computeOptionProfits, computeScenarios } from "../domain/profitEngine";
import { formatKrw, formatPct } from "../domain/money";
import { CHANNEL_META, GRADE_META } from "./meta";

/** 마켓 등록 화면에 붙여넣을 정보 묶음 */
export function listingCopyText(p: Product): string {
  const lines = [
    `[상품명]`,
    p.name,
    ``,
    `[판매가]`,
    `${p.price.listPriceKrw.toLocaleString()}원`,
  ];
  if (p.price.discountKrw > 0) {
    lines.push(`즉시할인 ${p.price.discountKrw.toLocaleString()}원 → 실결제 ${p.price.buyerPaidKrw.toLocaleString()}원`);
  }
  lines.push(``, `[배송비]`);
  lines.push(p.price.buyerShippingKrw > 0 ? `${p.price.buyerShippingKrw.toLocaleString()}원 (구매자 부담)` : `무료배송`);

  if (p.options.length > 0) {
    lines.push(``, `[옵션]`);
    for (const o of p.options.filter((x) => x.enabled)) {
      lines.push(`${o.name}${o.addPriceKrw ? ` (+${o.addPriceKrw.toLocaleString()}원)` : ""}`);
    }
  }
  if (p.sourceUrl) lines.push(``, `[도매처 원본]`, p.sourceUrl);
  return lines.join("\n");
}

export function ListingTask({ productId, onBack }: { productId: string; onBack: () => void }) {
  useStore();
  const product = getProduct(productId);
  const [copied, setCopied] = useState("");

  if (!product) return <div className="card pad center">상품을 찾을 수 없습니다.</div>;

  const fee = feeProfileOf(product.marketplace);
  const opt = computeOptionProfits(product, fee);
  const sc = computeScenarios(product.price, product.cost, { feeProfile: fee });
  const blocked = product.legalBlock || sc.conservative.netProfitKrw < 0 || opt.lossCount > 0;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1800);
    } catch { setCopied("복사 실패 — 직접 선택해 복사하세요"); }
  };

  const done = product.listings.filter((l) => l.listed);
  const todo = ALL_CHANNELS.filter((m) => !product.listings.find((l) => l.marketplace === m)?.listed);

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 목록으로</button>
      <div className="work-head">
        <div>
          <h2 className="work-title">{product.name}</h2>
          <div className="tiny muted">
            {product.supplierName || "도매처 미입력"} · 공급가 {formatKrw(product.cost.supplyPriceKrw)}
          </div>
        </div>
      </div>

      {/* 등록해도 되는 상품인지 먼저 확인 */}
      {blocked ? (
        <div className="card pad">
          <div className="verdict bad">🔴 등록하기 전에 손볼 곳이 있습니다</div>
          <ul className="ex-list">
            {product.legalBlock && <li>판매 차단으로 표시된 상품입니다 (KC·상표권 등)</li>}
            {sc.conservative.netProfitKrw < 0 && (
              <li>보수적으로 보면 {formatKrw(Math.abs(sc.conservative.netProfitKrw))} 손해입니다</li>
            )}
            {opt.lossCount > 0 && (
              <li>{opt.totalCount}개 옵션 중 {opt.lossCount}개가 팔면 손해입니다</li>
            )}
          </ul>
          <p className="reason">지금 등록하면 주문이 들어와도 발주가 막힙니다. 판매가를 올리거나 손해 보는 옵션을 끄세요.</p>
          <button className="btn" onClick={onBack}>상품 정보로 가서 고치기</button>
        </div>
      ) : (
        <div className="card pad">
          <div className="verdict ok">🟢 등록해도 됩니다</div>
          <div className="money-grid">
            <Mi k="판매가" v={formatKrw(product.price.buyerPaidKrw)} />
            <Mi k="보수적 순이익" v={formatKrw(sc.conservative.netProfitKrw)} s={formatPct(sc.conservative.marginPct)} />
            <Mi k="옵션" v={`${opt.totalCount}개 모두 정상`} />
          </div>
        </div>
      )}

      {/* 등록 정보 복사 */}
      <div className="card pad">
        <div className="section-label">등록할 내용</div>
        <pre className="copy-block">{listingCopyText(product)}</pre>
        <div className="btn-row">
          <button className="btn primary" onClick={() => copy(listingCopyText(product), "등록 정보")}>전체 복사</button>
          <button className="btn sm" onClick={() => copy(product.name, "상품명")}>상품명만</button>
          <button className="btn sm" onClick={() => copy(String(product.price.listPriceKrw), "판매가")}>판매가만</button>
        </div>
        {copied && <div className="copied">✅ {copied} 복사됨</div>}
      </div>

      {/* 이미지 */}
      <div className="card pad">
        <div className="section-label">이미지</div>
        {product.imageRightsConfirmed ? (
          <p className="hint">✅ 이미지 사용 허용을 확인한 상품입니다.</p>
        ) : (
          <div className="warn-note">
            ⚠️ <b>공급사 이미지 사용 허용을 아직 확인하지 않았습니다.</b> 도매처 상품페이지에서
            이미지 사용 가능 표기를 확인한 뒤 등록하세요.
            <label className="chk-inline" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={product.imageRightsConfirmed}
                     onChange={(e) => updateProduct(product.id, { imageRightsConfirmed: e.target.checked })} />
              확인했습니다
            </label>
          </div>
        )}
        <ol className="howto">
          <li>크롬 확장으로 도매처 상세 이미지를 받습니다 (<code>다운로드 &gt; AISOS &gt; 상품명</code>)</li>
          <li>공급사 로고·연락처가 박힌 이미지는 빼세요</li>
          <li>각 마켓 에디터에 <b>대표 1장 + 상세 순서대로</b> 업로드합니다</li>
        </ol>
        {product.sourceUrl && (
          <a className="btn sm" href={product.sourceUrl} target="_blank" rel="noreferrer">도매처 상품페이지 열기 ↗</a>
        )}
      </div>

      {/* 마켓별 등록 */}
      <div className="card pad">
        <div className="section-label">
          어디에 올릴까요
          <span className="tiny muted">{done.length}/{ALL_CHANNELS.length} 완료</span>
        </div>
        <div className="listing-steps">
          {ALL_CHANNELS.map((m) => (
            <MarketRow key={m} product={product} m={m} />
          ))}
        </div>
        {todo.includes("NAVER") && (
          <div className="warn-note" style={{ marginTop: 12 }}>
            💡 네이버는 중복·도배성 대량 등록에 민감합니다. 다른 마켓에서 반응을 본 뒤 올리는 걸 권합니다.
          </div>
        )}
      </div>

      {/* 옵션 요약 */}
      {product.options.length > 0 && (
        <div className="card pad">
          <div className="section-label">옵션별 손익</div>
          <table className="opt-table">
            <thead><tr><th></th><th>옵션</th><th>추가금</th><th>순이익</th></tr></thead>
            <tbody>
              {opt.lines.map((l) => (
                <tr key={l.optionId} className={l.profit.netProfitKrw < 0 ? "loss" : ""}>
                  <td>{GRADE_META[l.grade].label}</td>
                  <td>{l.optionName}</td>
                  <td>{formatKrw(l.sellingPriceKrw - product.price.buyerPaidKrw)}</td>
                  <td className={l.profit.netProfitKrw < 0 ? "neg" : "pos"}>{formatKrw(l.profit.netProfitKrw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MarketRow({ product, m }: { product: Product; m: Marketplace }) {
  const c = CHANNEL_META[m];
  const l = product.listings.find((x) => x.marketplace === m);
  const [no, setNo] = useState(l?.marketProductNo ?? "");

  return (
    <div className={"lstep" + (l?.listed ? " done" : "")}>
      <span className="chch" style={{ color: c.color, background: c.bg }}>{c.short}</span>
      <span className="lname">{c.label}</span>
      {l?.listed ? (
        <>
          <span className="ok-txt tiny">✅ 등록함</span>
          <input className="pno" value={no} placeholder="상품번호(선택)"
                 onChange={(e) => setNo(e.target.value)}
                 onBlur={() => setListing(product.id, m, { marketProductNo: no })} />
          <button className="btn xs" onClick={() => setListing(product.id, m, { listed: false })}>취소</button>
        </>
      ) : (
        <>
          {c.url && <a className="btn xs" href={c.url} target="_blank" rel="noreferrer">판매자센터 ↗</a>}
          <button className="btn xs primary" onClick={() => setListing(product.id, m, { listed: true, pending: false })}>
            등록 완료
          </button>
        </>
      )}
    </div>
  );
}

function Mi({ k, v, s }: { k: string; v: string; s?: string }) {
  return (
    <div className="m">
      <div className="mk">{k}</div>
      <div className="mv">{v}</div>
      {s && <div className="ms">{s}</div>}
    </div>
  );
}
