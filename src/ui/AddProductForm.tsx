import { useState } from "react";
import { makeProduct, type NewProductInput } from "../domain/factory";
import { computeProfit, recommendSellingPrice } from "../domain/profitEngine";
import { addProduct, saveDetailDraft } from "../store/db";
import { formatKrw, formatPct } from "../domain/money";
import type { Marketplace, Currency, DetailDraft } from "../domain/types";
import { parseImportBlock } from "../domain/importer";
import { CURRENCY_LABEL, CURRENCY_SYMBOL } from "./meta";

type PriceMode = "target" | "manual";

/** 시장환율 참고 조회 (프랑크푸르터 무료 API). 실패 시 null. */
async function fetchMarketRate(from: Currency): Promise<number | null> {
  if (from === "KRW") return 1;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=KRW`);
    const data = await res.json();
    return typeof data?.rates?.KRW === "number" ? data.rates.KRW : null;
  } catch {
    return null;
  }
}

export function AddProductForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Marketplace>("NAVER");

  const [currency, setCurrency] = useState<Currency>("KRW");
  const [srcPrice, setSrcPrice] = useState(8000);
  const [rate, setRate] = useState(1);
  const [fxNote, setFxNote] = useState<string>("");
  const [fxLoading, setFxLoading] = useState(false);

  const [mode, setMode] = useState<PriceMode>("target");
  const [targetMargin, setTargetMargin] = useState(30);
  const [selling, setSelling] = useState(12900);
  const [ship, setShip] = useState(1800);
  const [minMargin, setMinMargin] = useState(15);

  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [impOptions, setImpOptions] = useState<string[]>([]);
  const [impFeatures, setImpFeatures] = useState<string[]>([]);

  const doImport = () => {
    const r = parseImportBlock(importText);
    if (!r.ok) { setImportMsg("확장에서 복사한 데이터가 아니에요. 확장 팝업의 '복사'로 받은 내용을 붙여넣어 주세요."); return; }
    if (r.name) setName(r.name);
    changeCurrency(r.currency);
    if (r.price) setSrcPrice(r.price);
    if (r.currency !== "KRW") {/* 환율은 changeCurrency 기본값 유지, 자동 버튼으로 갱신 */}
    setShip(r.shipping);
    if (r.url) setUrl(r.url);
    setImpOptions(r.options);
    setImpFeatures(r.features);
    setImportMsg(`✅ 가져옴 — ${r.name || "상품"} / ${CURRENCY_SYMBOL[r.currency]}${r.price} · 옵션 ${r.options.length} · 특징 ${r.features.length}. 등록하면 상세페이지 초안에 반영됩니다.`);
    setImportText("");
  };

  const effectiveRate = currency === "KRW" ? 1 : Number(rate) || 0;

  const baseInput: NewProductInput = {
    name: name || "새 상품",
    sourceUrl: url,
    marketplace: market,
    sellingPriceKrw: 0,
    sourceCurrency: currency,
    sourcePrice: Number(srcPrice) || 0,
    exchangeRate: effectiveRate,
    internationalShippingKrw: Number(ship) || 0,
    minMarginPct: Number(minMargin) || 0,
  };
  const base = makeProduct(baseInput);
  const recommended = recommendSellingPrice(base.cost, Number(targetMargin) || 0);
  const recOk = Number.isFinite(recommended);
  const effectiveSelling = mode === "target" ? (recOk ? recommended : 0) : Number(selling) || 0;

  const profit = computeProfit(effectiveSelling, base.cost, {
    customsThresholdKrw: base.customsThresholdKrw,
    dutyRatePct: base.dutyRatePct,
  });

  const changeCurrency = (c: Currency) => {
    setCurrency(c);
    setFxNote("");
    if (c === "KRW") setRate(1);
    else if (c === "CNY") setRate(190);
    else setRate(1350);
  };

  const autoRate = async () => {
    setFxLoading(true);
    setFxNote("");
    const r = await fetchMarketRate(currency);
    setFxLoading(false);
    if (r) {
      setRate(Math.round(r * 100) / 100);
      setFxNote("시장환율(참고용). 실제 결제는 카드 해외수수료가 더 붙어요 → 아래 결제수수료로 반영됩니다.");
    } else {
      setFxNote("자동 조회 실패 — 환율을 직접 입력해 주세요.");
    }
  };

  const submit = () => {
    if (!name.trim()) { alert("상품명을 입력해 주세요."); return; }
    if (effectiveSelling <= 0) { alert("판매가를 확인해 주세요."); return; }
    const p = makeProduct({ ...baseInput, sellingPriceKrw: effectiveSelling });
    addProduct(p);
    if (impOptions.length || impFeatures.length) {
      const draft: DetailDraft = {
        category: "", target: "", features: impFeatures, options: impOptions,
        freeShipping: ship === 0, returnEnabled: true, returnDays: 30, freeReturn: false,
        exchange: true, qualityGuarantee: true, gift: "",
        deliveryMinDays: currency === "KRW" ? 1 : 7,
        deliveryMaxDays: currency === "KRW" ? 3 : 14,
        isOverseasAgent: currency !== "KRW", updatedAt: Date.now(),
      };
      saveDetailDraft(p.id, draft);
    }
    onDone();
  };

  return (
    <div>
      <div className="section-title">상품 추가</div>
      <div className="pill-info" style={{ marginBottom: 16 }}>
        소싱 원가만 넣으면 됩니다. 판매가를 모르면 <b>"목표 마진으로 자동 계산"</b>을 쓰세요 —
        검색 없이 원가·수수료·배송비를 역산해 <b>권장 판매가</b>를 알려줍니다.
      </div>

      <div className="card pad" style={{ marginBottom: 16, borderColor: "var(--accent)" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>📥 크롬 확장에서 가져오기 <span className="tiny muted">(선택)</span></div>
        <div className="tiny muted" style={{ marginBottom: 8 }}>
          "AI Seller OS 수집기" 확장의 <b>복사</b> 버튼으로 받은 내용을 붙여넣고 "가져오기"를 누르면 아래 항목이 자동으로 채워집니다.
        </div>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3}
          placeholder="##AISOS## 로 시작하는 확장 복사 데이터를 붙여넣기" style={taStyle} />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn sm primary" onClick={doImport} disabled={!importText.trim()}>가져오기</button>
        </div>
        {importMsg && <div className="tiny" style={{ marginTop: 8, color: importMsg.startsWith("✅") ? "var(--safe)" : "var(--loss)" }}>{importMsg}</div>}
      </div>

      <div className="card pad">
        <div className="form-grid">
          <div className="field full">
            <label>상품명</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 차량용 무선 핸드폰 거치대" />
          </div>
          <div className="field full">
            <label>소싱 상품 URL <span className="hint">(선택 — 1688 / 알리익스프레스 등)</span></label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="field">
            <label>판매 마켓</label>
            <select value={market} onChange={(e) => setMarket(e.target.value as Marketplace)}>
              <option value="NAVER">네이버 스마트스토어</option>
              <option value="COUPANG">쿠팡</option>
              <option value="11ST">11번가</option>
              <option value="GMARKET">G마켓</option>
              <option value="OTHER">기타</option>
            </select>
          </div>
          <div className="field">
            <label>소싱처 통화</label>
            <select value={currency} onChange={(e) => changeCurrency(e.target.value as Currency)}>
              <option value="KRW">{CURRENCY_LABEL.KRW} · 국내 위탁/도매</option>
              <option value="CNY">{CURRENCY_LABEL.CNY} · 1688/타오바오</option>
              <option value="USD">{CURRENCY_LABEL.USD} · 아마존/알리($)</option>
            </select>
          </div>

          <div className="field">
            <label>소싱 상품가 ({CURRENCY_SYMBOL[currency]})</label>
            <input type="number" value={srcPrice} onChange={(e) => setSrcPrice(+e.target.value)} />
            <span className="hint">⚠️ 알리 "신규회원/할인 전용가"는 1회성입니다. 반드시 <b>정상가</b>로 입력하세요.</span>
          </div>

          {currency === "KRW" ? (
            <div className="field">
              <label>환율</label>
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "#f4f5f8", color: "var(--muted)" }}>
                원화라 환율 불필요 (그대로 사용)
              </div>
            </div>
          ) : (
            <div className="field">
              <label>환율 (원/{CURRENCY_SYMBOL[currency]})</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" value={rate} onChange={(e) => setRate(+e.target.value)} style={{ flex: 1 }} />
                <button className="btn sm" onClick={autoRate} disabled={fxLoading}>{fxLoading ? "조회중…" : "자동"}</button>
              </div>
              {fxNote && <span className="hint">{fxNote}</span>}
            </div>
          )}

          <div className="field">
            <label>배송비 (원)</label>
            <input type="number" value={ship} onChange={(e) => setShip(+e.target.value)} />
            <span className="hint">{currency === "KRW" ? "국내 택배비(공급처 부과분). 무료면 0." : "국제배송비. 무료 배송이면 0."}</span>
          </div>
        </div>
      </div>

      {/* ---------- 판매가 결정 ---------- */}
      <div className="section-title">판매가 정하기</div>
      <div className="card pad">
        <div className="nav" style={{ marginBottom: 16 }}>
          <button className={mode === "target" ? "active" : ""} onClick={() => setMode("target")}>
            목표 마진으로 자동 계산 (추천)
          </button>
          <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
            판매가 직접 입력
          </button>
        </div>

        {mode === "target" ? (
          <>
            <div className="form-grid">
              <div className="field">
                <label>목표 순이익률 (%)</label>
                <input type="number" value={targetMargin} onChange={(e) => setTargetMargin(+e.target.value)} />
                <span className="hint">이만큼 남기고 싶다 → 판매가를 역산</span>
              </div>
              <div className="field">
                <label>권장 판매가</label>
                <div style={{
                  padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 20,
                  background: recOk ? "var(--accent-soft)" : "var(--loss-bg)",
                  color: recOk ? "var(--accent)" : "var(--loss)",
                }}>
                  {recOk ? formatKrw(recommended) : "계산 불가"}
                </div>
                {!recOk && <span className="hint">목표 마진이 수수료 대비 너무 높습니다. 낮춰보세요.</span>}
              </div>
            </div>
            <div className="warn-note" style={{ marginTop: 12, background: "var(--accent-soft)", color: "var(--accent)" }}>
              💡 이 가격은 <b>원가 기준</b>이에요. 실제로 잘 팔리려면 네이버/쿠팡에서 경쟁가도 한 번 확인하는 게 좋아요.
              (경쟁가 자동 조회는 Phase 3에서 추가됩니다.)
            </div>
          </>
        ) : (
          <div className="form-grid">
            <div className="field">
              <label>국내 판매가 (원)</label>
              <input type="number" value={selling} onChange={(e) => setSelling(+e.target.value)} />
            </div>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: 4 }}>
          <div className="field">
            <label>최소 허용 순이익률 (%)</label>
            <input type="number" value={minMargin} onChange={(e) => setMinMargin(+e.target.value)} />
            <span className="hint">판매 중 이 값 아래로 떨어지면 위험 경고</span>
          </div>
        </div>
      </div>

      <div className="section-title">실시간 예상 손익</div>
      <div className="card pad">
        <div className="kv-grid">
          <KV k="적용 판매가" v={formatKrw(effectiveSelling)} />
          <KV k="물품가(원화)" v={formatKrw(profit.productPriceKrw)} />
          <KV k="셀러 총원가" v={formatKrw(profit.sellerCostKrw)} />
          <KV k="예상 순이익" v={formatKrw(profit.netProfitKrw)} accent={profit.netProfitKrw < 0 ? "var(--loss)" : "var(--safe)"} />
          <KV k="순이익률" v={formatPct(profit.marginPct)} accent={profit.marginPct < minMargin ? "var(--warn)" : "var(--safe)"} />
          <KV k="손익분기 판매가" v={formatKrw(profit.breakEvenPriceKrw)} />
        </div>
        {profit.customs.overThreshold && (
          <div className="warn-note" style={{ marginTop: 12 }}>
            ⚠️ 물품가가 면세 한도(약 20만원)를 초과합니다. 관부가세(고객 부담) 추정 {formatKrw(profit.customs.customerTaxBurdenKrw)} — 전환율·클레임 검토 필요.
          </div>
        )}
        {profit.netProfitKrw < 0 && effectiveSelling > 0 && (
          <div className="warn-note" style={{ marginTop: 12, background: "var(--loss-bg)", color: "var(--loss)" }}>
            🔴 현재 조건은 손실입니다. 판매가를 올리거나 더 싼 공급처를 검토하세요.
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn primary" onClick={submit}>상품 등록</button>
        <button className="btn" onClick={onDone}>취소</button>
      </div>
    </div>
  );
}

const taStyle: React.CSSProperties = {
  padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10,
  fontFamily: "inherit", fontSize: 14, resize: "vertical",
};

function KV({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v" style={accent ? { color: accent } : undefined}>{v}</div>
    </div>
  );
}
