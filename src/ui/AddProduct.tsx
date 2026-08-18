// ============================================================
// 상품 추가 — STEP 방식 (개발지시서 §14)
// ★ 원칙: 확장이 이미 아는 정보를 사용자에게 다시 입력시키지 않는다.
//   STEP1 가져오기 → STEP2 빠진 것만 확인 → STEP3 시장가 → STEP4 심사
// ============================================================

import { useState } from "react";
import type { Product, ProductOption, ProductSpec } from "../domain/types";
import { ALL_CHANNELS } from "../domain/types";
import { addProduct, feeProfileOf } from "../store/db";
import { makeProduct, makeOption, DEFAULT_RETURN } from "../domain/factory";
import { parseProductBlock } from "../domain/productImport";
import type { ImportedReturnPolicy } from "../domain/productImport";
import { judgeProduct } from "../domain/verdict";
import { recommendSellingPrice, supplyHeadroom } from "../domain/profitEngine";
import {
  parseCompetitors, analyzeCompetition, positionOf, POSITION_LABEL,
  type CompetitionAnalysis,
} from "../domain/competition";
import { formatKrw, formatPct } from "../domain/money";
import { CHANNEL_META } from "./meta";

export function AddProduct({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1);

  // STEP 1 — 가져오기
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [started, setStarted] = useState(false);

  // 상품 기본
  const [name, setName] = useState("");
  const [supplier, setSupplier] = useState("");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Product["marketplace"]>("NAVER");
  const [supply, setSupply] = useState(0);
  const [ship, setShip] = useState(2500);
  const [minQty, setMinQty] = useState(1);
  const [opts, setOpts] = useState<ProductOption[]>([]);
  const [specs, setSpecs] = useState<ProductSpec[]>([]);
  const [imgOk, setImgOk] = useState(false);
  const [imgCount, setImgCount] = useState(0);

  // STEP 2 — 확인 필요
  const [retCost, setRetCost] = useState(DEFAULT_RETURN.costPerReturnKrw);
  const [exCost, setExCost] = useState(DEFAULT_RETURN.exchangeCostKrw);
  const [retRate, setRetRate] = useState(DEFAULT_RETURN.ratePct);
  const [policy, setPolicy] = useState<ImportedReturnPolicy | undefined>();
  const [policyApproved, setPolicyApproved] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  // STEP 3 — 시장가
  const [keyword, setKeyword] = useState("");
  const [mLow, setMLow] = useState<number | "">("");
  const [mTyp, setMTyp] = useState<number | "">("");
  const [mHigh, setMHigh] = useState<number | "">("");
  // 경쟁상품 분석 — 검색 결과를 통째로 평균내지 않고 직접 경쟁만 골라 본다
  const [compPaste, setCompPaste] = useState("");
  const [comp, setComp] = useState<CompetitionAnalysis | null>(null);
  const [compMsg, setCompMsg] = useState("");

  const analyzeComp = () => {
    const raws = parseCompetitors(compPaste);
    if (!raws.length) {
      setCompMsg("경쟁상품 목록이 아닙니다. 확장의 [경쟁상품 담기] → [복사]로 받은 내용을 넣어주세요.");
      return;
    }
    const a = analyzeCompetition(name || keyword, raws);
    setComp(a);
    setCompPaste("");
    setCompMsg("");
    if (a.band) {
      setMLow(a.band.lowest);
      setMTyp(a.band.median);
      setMHigh(a.band.highest);
    }
  };

  // 판매가
  const [target, setTarget] = useState(30);
  const [manual, setManual] = useState<number | null>(null);

  const doImport = () => {
    const r = parseProductBlock(pasteText);
    if (!r.ok) {
      setPasteMsg("확장에서 복사한 내용이 아니에요. 확장 팝업의 [복사] 버튼으로 받은 내용을 붙여넣어 주세요.");
      return;
    }
    if (r.name) setName(r.name);
    if (r.supplyPriceKrw) setSupply(r.supplyPriceKrw);
    if (r.shippingKrw) setShip(r.shippingKrw);
    setMinQty(r.minOrderQty || 1);
    if (r.sourceUrl) setUrl(r.sourceUrl);
    if (r.supplierName) setSupplier(r.supplierName);
    if (r.options.length) setOpts(r.options.map((o) => makeOption(o.name, o.supplyPriceKrw, o.addPriceKrw)));
    setSpecs(r.specs);
    setImgCount(r.imageCount);
    if (r.returnPolicy) {
      setPolicy(r.returnPolicy);
      if (r.returnPolicy.returnFeeKrw) setRetCost(r.returnPolicy.returnFeeKrw);
      if (r.returnPolicy.exchangeFeeKrw) setExCost(r.returnPolicy.exchangeFeeKrw);
    }
    setMissing(r.missing);
    setStarted(true);
    setPasteMsg("OK " + r.message);
    setPasteText("");
    if (!keyword && r.name) setKeyword(r.name.slice(0, 20));
  };

  const fee = feeProfileOf(market);
  const cost = {
    supplyPriceKrw: supply,
    minOrderQty: minQty,
    shippingKrw: ship,
    returnModel: { costPerReturnKrw: retCost, exchangeCostKrw: exCost, ratePct: retRate, measured: false },
    csCostKrw: 200,
    adCostKrw: 0,
  };
  const rec = recommendSellingPrice(cost, target, fee);
  const price = manual ?? (Number.isFinite(rec) ? rec : 0);

  const buildProduct = (): Product => {
    const p = makeProduct({
      name: name.trim() || "새 상품",
      supplierName: supplier.trim(),
      sourceUrl: url.trim(),
      marketplace: market,
      listPriceKrw: price,
      supplyPriceKrw: supply,
      minOrderQty: minQty,
      shippingKrw: ship,
      imageRightsConfirmed: imgOk,
      options: opts,
      specs,
      returnCostKrw: retCost,
      exchangeCostKrw: exCost,
      returnRatePct: retRate,
    });
    if (policy) {
      p.supplierReturnPolicy = {
        ...policy,
        source: "supplier",
        sourceUrl: url.trim(),
        capturedAt: Date.now(),
        approvedForCustomer: policyApproved,
      };
    }
    if (mTyp !== "") {
      p.marketPrice = {
        keyword,
        lowestKrw: Number(mLow) || 0,
        typicalKrw: Number(mTyp),
        highestKrw: mHigh === "" ? undefined : Number(mHigh),
        source: "manual",
        checkedAt: Date.now(),
      };
    }
    return p;
  };

  const v = judgeProduct(buildProduct(), fee);

  const submit = () => {
    if (!name.trim()) { alert("상품명을 입력해 주세요."); return; }
    if (price <= 0) { alert("판매가를 확인해 주세요."); return; }
    const p = buildProduct();
    p.status = "APPROVED";
    addProduct(p);
    onDone();
  };

  return (
    <div className="work">
      <button className="back" onClick={onDone}>← 취소</button>
      <h2 className="work-title">상품 추가</h2>

      <div className="stepbar">
        {["가져오기", "확인", "시장가", "심사"].map((t, i) => (
          <button key={t} className={"sb" + (step === i + 1 ? " on" : step > i + 1 ? " done" : "")}
                  onClick={() => setStep(i + 1)}>
            <span className="sbn">{step > i + 1 ? "✓" : i + 1}</span>{t}
          </button>
        ))}
      </div>

      {/* ============ STEP 1 ============ */}
      {step === 1 && (
        <>
          <div className="card pad" style={{ borderColor: "var(--accent)" }}>
            <div className="section-label">📥 도매처에서 상품 가져오기</div>
            <ol className="howto">
              <li>도매처 상품 페이지에서 <b>AI Seller OS 수집기</b> 아이콘을 누릅니다</li>
              <li>필요한 이미지를 골라 <b>다운로드</b>합니다</li>
              <li><b>복사</b>를 누르고 아래에 붙여넣습니다 (Ctrl+V)</li>
            </ol>
            <textarea className="paste" rows={4} value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="##AISOS## 로 시작하는 내용을 붙여넣기" />
            <div className="btn-row">
              <button className="btn primary" disabled={!pasteText.trim()} onClick={doImport}>가져오기</button>
              <button className="btn sm" onClick={() => setStarted(true)}>확장 없이 직접 입력</button>
            </div>
            {pasteMsg && (
              <div className="tiny" style={{ marginTop: 8, color: pasteMsg.startsWith("OK") ? "var(--safe)" : "var(--loss)" }}>
                {pasteMsg.startsWith("OK") ? "✅ " + pasteMsg.slice(3) : pasteMsg}
              </div>
            )}
            {started && (
              <div className="got-grid">
                <Got ok={!!name} label="상품명" v={name} />
                <Got ok={supply > 0} label="공급가" v={supply ? formatKrw(supply) : ""} />
                <Got ok={ship > 0} label="배송비" v={ship ? formatKrw(ship) : ""} />
                <Got ok={opts.length > 0} label="옵션" v={opts.length ? `${opts.length}개` : ""} />
                <Got ok={specs.length > 0} label="스펙" v={specs.length ? `${specs.length}개` : ""} />
                <Got ok={imgCount > 0} label="이미지" v={imgCount ? `${imgCount}장` : ""} />
                <Got ok={!!url} label="상품 URL" v={url ? "있음" : ""} />
                <Got ok={!!policy} label="반품 정책" v={policy ? "가져옴" : ""} />
              </div>
            )}
          </div>

          {started && (
            <>
              <div className="card pad">
                <div className="section-label">기본 정보</div>
                <div className="form-grid">
                  <div className="field full"><label>상품명</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 고리형 UV 3단 자동우산" /></div>
                  <div className="field"><label>도매처</label>
                    <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="예: 도매꾹 · 크리어유통" /></div>
                  <div className="field"><label>도매처 상품 URL</label>
                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
                    <span className="hint">발주할 때 이 링크로 바로 이동합니다</span></div>
                  <div className="field"><label>도매 공급가 (원)</label>
                    <input type="number" value={supply} onChange={(e) => setSupply(+e.target.value)} />
                    <span className="hint">내가 실제로 살 수량의 단가</span></div>
                  <div className="field"><label>배송비 (원)</label>
                    <input type="number" value={ship} onChange={(e) => setShip(+e.target.value)} /></div>
                  <div className="field"><label>도매처 최소구매수량</label>
                    <input type="number" min={1} value={minQty} onChange={(e) => setMinQty(Math.max(1, +e.target.value))} />
                    <span className="hint">
                      {minQty > 1
                        ? `고객 1주문마다 ${minQty}개를 사야 합니다 — 원가도 ${minQty}배입니다`
                        : "1개면 주문 1건씩 발주할 수 있습니다"}
                    </span></div>
                  <div className="field"><label>손익 기준 마켓</label>
                    <select value={market} onChange={(e) => setMarket(e.target.value as Product["marketplace"])}>
                      {ALL_CHANNELS.map((m) => <option key={m} value={m}>{CHANNEL_META[m].label}</option>)}
                    </select>
                    <span className="hint">수수료가 가장 높은 곳으로 잡으면 안전합니다</span></div>
                </div>
              </div>

              <OptionEditor opts={opts} setOpts={setOpts} defaultSupply={supply} />

              <SpecEditor specs={specs} setSpecs={setSpecs} />

              <div className="btn-row">
                <button className="btn primary lg" onClick={() => setStep(2)}>다음 — 확인이 필요한 정보</button>
              </div>
            </>
          )}
        </>
      )}

      {/* ============ STEP 2 ============ */}
      {step === 2 && (
        <>
          <div className="card pad">
            <div className="section-label">확인이 필요한 정보</div>
            {missing.length > 0
              ? <div className="warn-note">가져오지 못한 항목: <b>{missing.join(", ")}</b> — 도매처에서 확인해 채워주세요.</div>
              : <p className="hint">가져온 값이 맞는지만 확인하세요.</p>}
            <div className="form-grid">
              <div className="field"><label>반품 배송비 (원)</label>
                <input type="number" value={retCost} onChange={(e) => setRetCost(+e.target.value)} />
                <span className="hint">도매처가 청구하는 금액. 상품마다 다릅니다</span></div>
              <div className="field"><label>교환 배송비 (원)</label>
                <input type="number" value={exCost} onChange={(e) => setExCost(+e.target.value)} />
                <span className="hint">보통 반품비의 2배</span></div>
              <div className="field"><label>예상 반품률 (%)</label>
                <input type="number" step="0.1" value={retRate} onChange={(e) => setRetRate(+e.target.value)} />
                <span className="hint">모르면 2% 그대로 두세요</span></div>
            </div>
            <div className="reserve-box">
              반품 충당비 = {formatKrw(retCost)} × {retRate}% = <b>{formatKrw(Math.round(retCost * retRate / 100))}</b>
              <span className="tiny muted"> / 주문 1건당</span>
            </div>
          </div>

          {policy && (
            <div className="card pad">
              <div className="section-label">도매처 반품 정책</div>
              <ul className="policy-list">
                {policy.freeReturnDays && <li>무료 반품 <b>{policy.freeReturnDays}일</b></li>}
                {policy.defectReturnDays && <li>하자 반품 <b>{policy.defectReturnDays}일</b></li>}
                {policy.returnFeeKrw && <li>반품 배송비 <b>{formatKrw(policy.returnFeeKrw)}</b></li>}
                {policy.exchangeFeeKrw && <li>교환 배송비 <b>{formatKrw(policy.exchangeFeeKrw)}</b></li>}
              </ul>
              <div className="warn-note">
                ⚠️ 이것은 <b>도매처가 셀러에게 주는 정책</b>입니다. 고객에게 그대로 약속하려면
                본인 판매 정책·전자상거래법 기준과 맞는지 확인해야 합니다.
                <label className="chk-inline" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={policyApproved}
                         onChange={(e) => setPolicyApproved(e.target.checked)} />
                  확인했고, 상세페이지 하단 <b>교환/반품 안내</b>에 넣겠습니다
                </label>
              </div>
            </div>
          )}

          <div className="card pad">
            <label className="chk-inline">
              <input type="checkbox" checked={imgOk} onChange={(e) => setImgOk(e.target.checked)} />
              공급사가 <b>상세 이미지 사용을 허용</b>했는지 확인함
            </label>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={() => setStep(1)}>← 이전</button>
            <button className="btn primary lg" onClick={() => setStep(3)}>다음 — 시장가격 확인</button>
          </div>
        </>
      )}

      {/* ============ STEP 3 ============ */}
      {step === 3 && (
        <>
          <div className="card pad">
            <div className="section-label">시장 가격 확인</div>
            <p className="hint">원가만으로는 <b>팔릴지</b> 알 수 없습니다. 같은 상품이 얼마에 팔리는지 찾아 넣어주세요.</p>
            <div className="form-grid">
              <div className="field full"><label>검색어</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                         placeholder="예: 3단 자동우산" style={{ flex: 1 }} />
                  <a className="btn sm" target="_blank" rel="noreferrer"
                     href={`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword || name)}`}>
                    네이버에서 검색 ↗
                  </a>
                </div>
              </div>
              <div className="field"><label>최저가 (원)</label>
                <input type="number" value={mLow} onChange={(e) => setMLow(e.target.value === "" ? "" : +e.target.value)} /></div>
              <div className="field"><label>대표 가격 (원)</label>
                <input type="number" value={mTyp} onChange={(e) => setMTyp(e.target.value === "" ? "" : +e.target.value)} />
                <span className="hint">가장 흔히 보이는 가격. 판단 기준입니다</span></div>
              <div className="field"><label>최고가 (원)</label>
                <input type="number" value={mHigh} onChange={(e) => setMHigh(e.target.value === "" ? "" : +e.target.value)} /></div>
            </div>
            <div className="warn-note">
              💡 최저가만 보고 판단하지 마세요. <b>배송비 별도·쿠폰가·광고상품·다른 구성</b>이 섞여 있습니다.
              여러 개를 훑어보고 <b>가장 흔한 가격</b>을 대표 가격에 넣으세요.
            </div>
          </div>

          {/* 경쟁상품 분석 — 숫자 3개를 손으로 넣는 대신 목록을 붙여넣으면 코드가 가른다 */}
          <div className="card pad">
            <div className="section-label">🔎 경쟁상품 분석 <span className="tiny muted">권장</span></div>
            <p className="hint" style={{ marginTop: 0 }}>
              네이버·쿠팡 검색 결과에서 확장으로 <b>경쟁상품 담기</b> → 복사 → 여기에 붙여넣으면
              <b> 정말 비슷한 상품만 골라</b> 가격대를 만듭니다.
            </p>
            <textarea className="paste" rows={3} value={compPaste}
                      onChange={(e) => setCompPaste(e.target.value)}
                      placeholder="##AISOS-COMP## 로 시작하는 경쟁상품 목록을 붙여넣기" />
            <button className="btn primary sm" disabled={!compPaste.trim()} onClick={analyzeComp}>분석하기</button>
            {compMsg && <div className="tiny" style={{ marginTop: 8, color: "var(--loss)" }}>{compMsg}</div>}
            {comp && <CompReport a={comp} myPrice={price} />}
          </div>

          <div className="card pad">
            <div className="section-label">판매가</div>
            <div className="form-grid">
              <div className="field"><label>목표 순이익률 (%)</label>
                <input type="number" value={target} onChange={(e) => { setTarget(+e.target.value); setManual(null); }} /></div>
              <div className="field"><label>판매가 (원)</label>
                <input type="number" value={price} onChange={(e) => setManual(+e.target.value)} />
                <span className="hint">{manual === null ? "목표 마진으로 자동 계산됨" : "직접 입력함"}</span></div>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={() => setStep(2)}>← 이전</button>
            <button className="btn primary lg" onClick={() => setStep(4)}>심사 결과 보기</button>
          </div>
        </>
      )}

      {/* ============ STEP 4 ============ */}
      {step === 4 && (
        <>
          <div className="card pad">
            <div className={"verdict " + (v.verdict === "RECOMMEND" ? "ok" : v.verdict === "CHECK" ? "warn" : "bad")}>
              {v.headline}
            </div>
            <div className="money-grid">
              <J k="매입 원가" v={formatKrw(v.landedCostKrw)} />
              <J k="내 최소 판매가" v={v.minPriceKrw ? formatKrw(v.minPriceKrw) : "—"} />
              <J k="목표 판매가" v={formatKrw(v.targetPriceKrw)} />
              <J k="시장 가격"
                 v={v.market ? `${formatKrw(v.market.lowestKrw)} ~ ${formatKrw(v.market.highestKrw ?? v.market.typicalKrw)}` : "미확인"}
                 s={v.market ? `대표 ${formatKrw(v.market.typicalKrw)}` : undefined} />
              <J k="예상 이익" v={formatKrw(v.expectedProfitKrw)} s={formatPct(v.marginPct)} />
              <J k="보수적 이익" v={formatKrw(v.conservativeProfitKrw)}
                 tone={v.conservativeProfitKrw < 0 ? "bad" : "ok"} s="이 값으로 판단" />
            </div>

            {/* 등록 이후 공급가가 오르는 것이 위탁판매 최대 리스크 — 한계선을 미리 알려준다 */}
            {(() => {
              const h = supplyHeadroom(
                { listPriceKrw: price, discountKrw: 0, buyerPaidKrw: price, buyerShippingKrw: 0 },
                cost, fee
              );
              if (h.alreadyLoss) return null;
              return (
                <div className="headroom">
                  <div className="headroom-title">📌 공급가가 <b>{formatKrw(h.maxSupplyPriceKrw)}</b>을 넘으면 적자입니다</div>
                  <div className="headroom-sub">
                    지금 {formatKrw(supply)} → <b>{formatKrw(h.headroomKrw)}</b> ({Math.round(h.headroomPct)}%) 오를 때까지 버팁니다.
                    도매처 가격이 이 선을 넘으면 <b>즉시 판매를 멈추세요.</b>
                  </div>
                </div>
              );
            })()}

            <div className="section-label" style={{ marginTop: 16 }}>판단 근거</div>
            <ul className="checklist">
              {v.reasons.map((r, i) => (
                <li key={i} className={r.ok ? "ok" : "no"}><span>{r.ok ? "✓" : "!"}</span><b>{r.text}</b></li>
              ))}
            </ul>

            {v.unknown.length > 0 && (
              <div className="unknown-note">아직 확인 안 됨: {v.unknown.join(", ")} — 추측하지 않습니다</div>
            )}
          </div>

          <div className="card pad">
            <div className="section-label">할 수 있는 것</div>
            <div className="choice-list">
              {v.verdict !== "REJECT" && <button className="btn primary lg" onClick={submit}>상품 등록하기</button>}
              {v.actions.filter((a) => a !== "상품 등록하기").map((a) => (
                <button key={a} className="btn" onClick={() => {
                  if (a.includes("시장") || a.includes("마진") || a.includes("판매가")) setStep(3);
                  else if (a.includes("이미지") || a.includes("옵션")) setStep(a.includes("옵션") ? 1 : 2);
                  else onDone();
                }}>{a}</button>
              ))}
              {v.verdict === "REJECT" && (
                <button className="btn danger"
                        onClick={() => { if (confirm("비추천 상품입니다. 그래도 등록할까요?")) submit(); }}>
                  그래도 등록하기
                </button>
              )}
            </div>
          </div>

          <div className="btn-row"><button className="btn" onClick={() => setStep(3)}>← 이전</button></div>
        </>
      )}
    </div>
  );
}

function Got({ ok, label, v }: { ok: boolean; label: string; v: string }) {
  return (
    <div className={"got" + (ok ? " y" : "")}>
      <span>{ok ? "✓" : "—"}</span><b>{label}</b><em>{v || "없음"}</em>
    </div>
  );
}

function J({ k, v, s, tone }: { k: string; v: string; s?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="m">
      <div className="mk">{k}</div>
      <div className={"mv" + (tone ? ` ${tone}` : "")}>{v}</div>
      {s && <div className="ms">{s}</div>}
    </div>
  );
}

/** 옵션 편집 — 일괄 추가·일괄 적용 (하나씩 입력하지 않게) */
function OptionEditor({ opts, setOpts, defaultSupply }: {
  opts: ProductOption[];
  setOpts: React.Dispatch<React.SetStateAction<ProductOption[]>>;
  defaultSupply: number;
}) {
  const [bulkText, setBulkText] = useState("");
  const [bulkPrice, setBulkPrice] = useState<number | "">("");
  const [bulkAdd, setBulkAdd] = useState<number | "">("");

  const addNames = () => {
    const names = bulkText.split(/[\n,，]+/).map((x) => x.trim()).filter(Boolean);
    if (!names.length) return;
    setOpts((a) => [...a, ...names.map((n) => makeOption(n, defaultSupply, 0))]);
    setBulkText("");
  };

  const applyBulk = () => {
    setOpts((a) => a.map((o) => ({
      ...o,
      supplyPriceKrw: bulkPrice === "" ? o.supplyPriceKrw : Number(bulkPrice),
      addPriceKrw: bulkAdd === "" ? o.addPriceKrw : Number(bulkAdd),
    })));
  };

  /**
   * ★ 옵션마다 공급가가 다른데 판매가가 하나면, 비싼 옵션이 전부 역마진이 된다.
   *   가장 싼 옵션을 기준으로 공급가 차액을 그대로 판매가 추가금으로 옮긴다.
   *   마켓에 등록할 때 옵션가를 다르게 매기면 된다.
   */
  const autoAddPrice = () => {
    const on = opts.filter((o) => o.enabled !== false);
    if (on.length < 2) return;
    const min = Math.min(...on.map((o) => o.supplyPriceKrw));
    setOpts((a) => a.map((o) => ({
      ...o,
      addPriceKrw: Math.max(0, Math.round((o.supplyPriceKrw - min) / 100) * 100),
    })));
  };

  const supplyVaries =
    opts.length > 1 && new Set(opts.map((o) => o.supplyPriceKrw)).size > 1;

  return (
    <div className="card pad">
      <div className="section-label">
        옵션 {opts.length > 0 && <span className="tiny muted">{opts.length}개</span>}
      </div>
      {opts.length === 0 && <p className="hint">옵션이 없으면 비워두세요. 단일 상품으로 계산합니다.</p>}

      {opts.length > 0 && (
        <>
          <table className="opt-table">
            <thead><tr><th>옵션명</th><th>공급가</th><th>추가금</th><th></th></tr></thead>
            <tbody>
              {opts.map((o, i) => (
                <tr key={o.id}>
                  <td><input className="oi" value={o.name} placeholder="옵션명"
                             onChange={(e) => setOpts((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></td>
                  <td><input className="oi num" type="number" value={o.supplyPriceKrw}
                             onChange={(e) => setOpts((a) => a.map((x, j) => j === i ? { ...x, supplyPriceKrw: +e.target.value } : x))} /></td>
                  <td><input className="oi num" type="number" value={o.addPriceKrw}
                             onChange={(e) => setOpts((a) => a.map((x, j) => j === i ? { ...x, addPriceKrw: +e.target.value } : x))} /></td>
                  <td><button className="btn xs" onClick={() => setOpts((a) => a.filter((_, j) => j !== i))}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          {supplyVaries && (
            <div className="bulk-box" style={{ borderColor: "var(--accent)" }}>
              <b>옵션마다 공급가가 다릅니다</b>
              <span className="hint">
                판매가가 하나면 비싼 옵션이 손해가 됩니다. 공급가 차액을 <b>옵션 추가금</b>으로 옮기면
                마켓에서 옵션별로 다른 가격에 팔 수 있습니다.
              </span>
              <button className="btn sm primary" onClick={autoAddPrice}>
                공급가 차이만큼 추가금 자동 채우기
              </button>
            </div>
          )}

          <div className="bulk-box">
            <b>전체 {opts.length}개에 일괄 적용</b>
            <div className="bulk-row">
              <label>공급가</label>
              <input type="number" placeholder="그대로" value={bulkPrice}
                     onChange={(e) => setBulkPrice(e.target.value === "" ? "" : +e.target.value)} />
              <label>추가금</label>
              <input type="number" placeholder="그대로" value={bulkAdd}
                     onChange={(e) => setBulkAdd(e.target.value === "" ? "" : +e.target.value)} />
              <button className="btn sm primary" disabled={bulkPrice === "" && bulkAdd === ""} onClick={applyBulk}>
                일괄 적용
              </button>
            </div>
          </div>
        </>
      )}

      <div className="bulk-box">
        <b>옵션 여러 개 한 번에 추가</b>
        <span className="hint">쉼표나 줄바꿈으로 구분 — 도매처 옵션 목록을 그대로 붙여넣어도 됩니다</span>
        <textarea className="paste" rows={2} value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                  placeholder="G1화이트, G2핑크, G3스카이, G4네이비" />
        <button className="btn sm" disabled={!bulkText.trim()} onClick={addNames}>옵션 추가</button>
      </div>
    </div>
  );
}

/** 경쟁상품 분석 결과 — 개수와 근거를 그대로 보여준다 (신뢰도 %를 만들지 않는다) */
function CompReport({ a, myPrice }: { a: CompetitionAnalysis; myPrice: number }) {
  const pos = a.band && myPrice > 0 ? positionOf(myPrice, a.band) : null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="comp-counts">
        <span className="c-direct">직접 {a.directCount}</span>
        <span className="c-similar">유사 {a.similarCount}</span>
        <span className="c-indirect">간접 {a.indirectCount}</span>
        {a.brandCount > 0 && <span className="c-brand">브랜드 {a.brandCount}</span>}
      </div>
      <div className={"tiny " + (a.enough ? "" : "warn-text")} style={{ marginTop: 6 }}>
        {a.enough ? "✅ " : "⚠️ "}{a.note}
      </div>

      {a.band && (
        <>
          <div className="comp-band">
            <B k="최저" v={a.band.lowest} /><B k="25%" v={a.band.p25} />
            <B k="중간" v={a.band.median} /><B k="75%" v={a.band.p75} />
            <B k="최고" v={a.band.highest} />
          </div>
          <div className="hint">배송비를 더한 <b>실질 구매가</b> 기준입니다.</div>
        </>
      )}

      {pos && (
        <div className="comp-pos">
          <div className="comp-pos-head">
            {POSITION_LABEL[pos.position]}
            <span className="tiny muted">
              중간가 대비 {pos.vsMedianPct >= 0 ? "+" : ""}{pos.vsMedianPct.toFixed(1)}%
            </span>
          </div>
          <div className="tiny">{pos.text}</div>
          <div className="tiny" style={{ marginTop: 4 }}>{pos.advice}</div>
        </div>
      )}

      <details style={{ marginTop: 10 }}>
        <summary className="tiny">어떻게 갈랐는지 보기</summary>
        <div className="comp-list">
          {a.competitors.slice(0, 40).map((c, i) => (
            <div key={i} className={"comp-row t-" + c.tier.toLowerCase()}>
              <div className="comp-name">{c.name}</div>
              <div className="comp-meta">
                {formatKrw(c.effectiveKrw)}
                {c.shippingKrw ? ` (배송 ${formatKrw(c.shippingKrw)} 포함)` : ""} · {c.reason}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function B({ k, v }: { k: string; v: number }) {
  return <div className="comp-b"><span>{k}</span><b>{formatKrw(v)}</b></div>;
}

/** 스펙 편집 — 가져온 것을 저장한다 (다시 입력하지 않게) */
function SpecEditor({ specs, setSpecs }: {
  specs: ProductSpec[];
  setSpecs: React.Dispatch<React.SetStateAction<ProductSpec[]>>;
}) {
  const [bulk, setBulk] = useState("");

  const addBulk = () => {
    const rows = bulk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const add: ProductSpec[] = [];
    for (const r of rows) {
      const m = r.match(/^(.{1,20}?)\s*[:：\t]\s*(.+)$/);
      if (m) add.push({ key: m[1].trim(), value: m[2].trim() });
    }
    if (add.length) setSpecs((a) => [...a, ...add]);
    setBulk("");
  };

  return (
    <div className="card pad">
      <div className="section-label">
        스펙 {specs.length > 0 && <span className="tiny muted">{specs.length}개</span>}
        <span className="tiny muted">한 번 넣으면 마켓 등록 때 다시 씁니다</span>
      </div>
      {specs.length > 0 && (
        <div className="spec-grid">
          {specs.map((sp, i) => (
            <div key={i} className="spec-row">
              <input value={sp.key} placeholder="항목"
                     onChange={(e) => setSpecs((a) => a.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
              <input value={sp.value} placeholder="값"
                     onChange={(e) => setSpecs((a) => a.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <button className="btn xs" onClick={() => setSpecs((a) => a.filter((_, j) => j !== i))}>삭제</button>
            </div>
          ))}
        </div>
      )}
      <div className="bulk-box">
        <span className="hint">도매처 스펙 표를 그대로 붙여넣으세요 (`소재: 폴리에스터` 또는 탭 구분)</span>
        <textarea className="paste" rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)}
                  placeholder={"소재\t폴리에스터\n중량\t400g\n우산살\t10개"} />
        <button className="btn sm" disabled={!bulk.trim()} onClick={addBulk}>스펙 추가</button>
      </div>
    </div>
  );
}
