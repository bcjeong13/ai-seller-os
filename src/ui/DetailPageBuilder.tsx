import { useMemo, useState } from "react";
import type { Product, Marketplace, DetailDraft } from "../domain/types";
import { generateDetailPage, parsePastedInfo, type DetailPageInput } from "../domain/detailPage";
import { useStore, getProducts, saveDetailDraft } from "../store/db";
import { formatKrw } from "../domain/money";
import { STATUS_META, Badge } from "./meta";

function splitLines(s: string): string[] {
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

// ---------- 상품 선택 화면 ----------
export function DetailPagePicker({
  onPick,
  onBlank,
}: {
  onPick: (id: string) => void;
  onBlank: () => void;
}) {
  useStore();
  const products = getProducts();
  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>상세페이지 만들기</div>
      <div className="pill-info" style={{ marginBottom: 16 }}>
        상세페이지를 만들 <b>등록 상품을 선택</b>하세요. 선택하면 상품명·마켓·저장된 초안을 불러옵니다.
      </div>
      {products.length === 0 ? (
        <div className="card empty">
          <div className="big">📄</div>
          먼저 "상품 추가"에서 상품을 등록하세요.
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={onBlank}>상품 없이 새로 작성</button>
          </div>
        </div>
      ) : (
        <div className="plist">
          {products.map((p) => (
            <div key={p.id} className="card prow" onClick={() => onPick(p.id)}>
              <div>
                <div className="pname">{p.name}</div>
                <div className="pmeta">
                  {p.marketplace} · 판매가 {formatKrw(p.sellingPriceKrw)}
                  {p.detailDraft ? " · ✅ 작성됨(수정 가능)" : " · 미작성"}
                </div>
              </div>
              <div className="col"><Badge meta={STATUS_META[p.status]} /></div>
              <div className="col"><button className="btn sm primary" onClick={(e) => { e.stopPropagation(); onPick(p.id); }}>선택</button></div>
            </div>
          ))}
          <div style={{ marginTop: 6 }}>
            <button className="btn" onClick={onBlank}>또는 상품 없이 새로 작성</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- 빌더 ----------
export function DetailPageBuilder({
  product,
  onBack,
}: {
  product?: Product;
  onBack: () => void;
}) {
  const d = product?.detailDraft;
  const [name, setName] = useState(product?.name ?? "");
  const [market] = useState<Marketplace>(product?.marketplace ?? "NAVER");
  const [category, setCategory] = useState(d?.category ?? "");
  const [target, setTarget] = useState(d?.target ?? "");
  const [featuresText, setFeaturesText] = useState((d?.features ?? []).join("\n"));
  const [optionsText, setOptionsText] = useState((d?.options ?? []).join("\n"));

  const [freeShipping, setFreeShipping] = useState(d?.freeShipping ?? true);
  const [returnEnabled, setReturnEnabled] = useState(d?.returnEnabled ?? true);
  const [returnDays, setReturnDays] = useState(d?.returnDays ?? 30);
  const [freeReturn, setFreeReturn] = useState(d?.freeReturn ?? false);
  const [exchange, setExchange] = useState(d?.exchange ?? true);
  const [qualityGuarantee, setQualityGuarantee] = useState(d?.qualityGuarantee ?? true);
  const [gift, setGift] = useState(d?.gift ?? "");

  const [dMin, setDMin] = useState(d?.deliveryMinDays ?? 7);
  const [dMax, setDMax] = useState(d?.deliveryMaxDays ?? 14);
  const [overseas, setOverseas] = useState(d?.isOverseasAgent ?? true);

  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [copied, setCopied] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const input: DetailPageInput = useMemo(
    () => ({
      productName: name || "상품명",
      marketplace: market,
      category, target,
      features: splitLines(featuresText),
      options: splitLines(optionsText),
      benefits: {
        freeShipping,
        returnDays: returnEnabled ? returnDays : 7,
        freeReturn: returnEnabled && freeReturn,
        exchange, qualityGuarantee, gift,
      },
      deliveryMinDays: dMin, deliveryMaxDays: dMax, isOverseasAgent: overseas,
    }),
    [name, market, category, target, featuresText, optionsText, freeShipping, returnEnabled, returnDays, freeReturn, exchange, qualityGuarantee, gift, dMin, dMax, overseas]
  );

  const out = useMemo(() => generateDetailPage(input), [input]);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1500); }
    catch { setCopied("복사 실패(수동 선택 복사)"); setTimeout(() => setCopied(""), 1800); }
  };

  const analyze = () => {
    const { features, options } = parsePastedInfo(pasteText);
    if (features.length === 0 && options.length === 0) {
      setPasteMsg("추출된 항목이 없어요. 옵션은 '색상: 블랙, 화이트' 처럼, 특징은 '· ...' 불릿으로 붙여보세요.");
      return;
    }
    if (features.length) setFeaturesText((prev) => dedupeJoin(prev, features));
    if (options.length) setOptionsText((prev) => dedupeJoin(prev, options));
    setPasteMsg(`✅ 특징 ${features.length}개, 옵션 ${options.length}개 추가됨 — 확인/수정하세요.`);
    setPasteText("");
  };

  const save = () => {
    if (!product) { setCopied("상품 없이 작성 중이라 저장 불가 (상품에서 열어주세요)"); setTimeout(() => setCopied(""), 2000); return; }
    const draft: DetailDraft = {
      category, target,
      features: splitLines(featuresText), options: splitLines(optionsText),
      freeShipping, returnEnabled, returnDays, freeReturn, exchange, qualityGuarantee, gift,
      deliveryMinDays: dMin, deliveryMaxDays: dMax, isOverseasAgent: overseas,
      updatedAt: Date.now(),
    };
    saveDetailDraft(product.id, draft);
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div>
      <button className="back" onClick={onBack}>← 돌아가기</button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>상세페이지 {d ? "수정" : "작성"}</div>
        {product && <span className="tiny muted">— {product.name}</span>}
      </div>
      <div className="pill-info" style={{ margin: "12px 0 16px" }}>
        소싱 페이지의 특징·옵션 텍스트를 <b>복사해 아래에 붙여넣으면 자동 분석</b>됩니다. 없으면 직접 입력하세요.
        구매대행 배송기간·반품 안내와 과대광고 경고는 자동으로 처리됩니다.
        <br /><span className="tiny">※ 링크만으로 자동 수집(원클릭)은 Phase 2 크롬 확장에서 제공됩니다.</span>
      </div>

      <div className="two-col">
        {/* ---------- 입력 ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card pad">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>📋 소싱 페이지 내용 붙여넣기 <span className="tiny muted">(선택)</span></div>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4}
              placeholder={"알리/1688 상품 페이지에서 특징·옵션 텍스트를 복사해 붙여넣기\n예)\n색상: 블랙, 화이트, 베이지\n재질: 금속섬유 복합재\n· 강력한 방풍 설계"}
              style={taStyle} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn sm primary" onClick={analyze} disabled={!pasteText.trim()}>자동 분석 → 채우기</button>
            </div>
            {pasteMsg && <div className="tiny" style={{ marginTop: 8, color: "var(--muted)" }}>{pasteMsg}</div>}
          </div>

          <div className="card pad">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>기본 정보</div>
            <div className="form-grid">
              <div className="field full">
                <label>상품명 (핵심)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 차량용 무선 핸드폰 거치대" />
              </div>
              <div className="field">
                <label>카테고리</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 차량용품" />
              </div>
              <div className="field">
                <label>타깃 고객</label>
                <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="예: 20~40대 운전자" />
              </div>
              <div className="field full">
                <label>핵심 특징 <span className="hint">(한 줄에 하나 — 사실만)</span></label>
                <textarea value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} rows={4}
                  placeholder={"강력한 흡착력\n360도 회전\n무선충전 지원"} style={taStyle} />
              </div>
              <div className="field full">
                <label>옵션 <span className="hint">(쉼표 또는 줄바꿈)</span></label>
                <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={2}
                  placeholder="블랙, 화이트" style={taStyle} />
              </div>
            </div>
          </div>

          <div className="card pad">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>배송 · 교환 · 반품 정책</div>
            <div className="checks-grid">
              <Check label="무료 배송" checked={freeShipping} onChange={setFreeShipping} />
              <Check label="교환 가능(하자 시)" checked={exchange} onChange={setExchange} />
              <Check label="품질 검수/보증" checked={qualityGuarantee} onChange={setQualityGuarantee} />
              <Check label="해외구매대행 상품" checked={overseas} onChange={setOverseas} />
            </div>
            <div style={{ borderTop: "1px solid var(--border)", margin: "14px 0", paddingTop: 14 }}>
              <Check label="반품 안내 표기" checked={returnEnabled} onChange={setReturnEnabled} />
              {returnEnabled && (
                <div className="form-grid" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label>반품 가능 일수</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="number" value={returnDays} onChange={(e) => setReturnDays(+e.target.value)} style={{ flex: 1 }} />
                      <button className="btn sm" onClick={() => setReturnDays(30)}>30일</button>
                    </div>
                  </div>
                  <div className="field" style={{ justifyContent: "flex-end" }}>
                    <Check label="단순변심 반품비 무료" checked={freeReturn} onChange={setFreeReturn} />
                  </div>
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="field"><label>배송 최소일</label><input type="number" value={dMin} onChange={(e) => setDMin(+e.target.value)} /></div>
              <div className="field"><label>배송 최대일</label><input type="number" value={dMax} onChange={(e) => setDMax(+e.target.value)} /></div>
              <div className="field full"><label>사은품 <span className="hint">(선택)</span></label><input value={gift} onChange={(e) => setGift(e.target.value)} placeholder="없으면 비워두기" /></div>
            </div>
          </div>

          {product && (
            <button className="btn primary" onClick={save}>{saved ? "✅ 저장됨" : (d ? "상세페이지 수정 저장" : "상세페이지 저장")}</button>
          )}
        </div>

        {/* ---------- 출력 ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {out.warnings.length > 0 && (
            <div className="card pad" style={{ borderColor: "#f3c8c8" }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--warn)" }}>⚠️ 확인 필요</div>
              <ul className="recs tiny" style={{ color: "var(--muted)" }}>
                {out.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <div className="card pad">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>상품명 후보</div>
            {out.nameCandidates.map((n, i) => (
              <div key={i} className="copy-row">
                <span style={{ flex: 1, fontSize: 13.5 }}>{n} <span className="tiny muted">({n.length}자)</span></span>
                <button className="btn sm" onClick={() => copy(n, "상품명")}>복사</button>
              </div>
            ))}
          </div>
          <div className="card pad">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>키워드 · 태그</div>
              <button className="btn sm" onClick={() => copy(out.keywords.join(", "), "키워드")}>전체 복사</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {out.tags.map((t, i) => <span key={i} className="tagchip">#{t}</span>)}
            </div>
          </div>
          <div className="card pad">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>상세페이지 미리보기</div>
              <div className="btn-row">
                <button className="btn sm" onClick={() => copy(out.plainText, "본문(텍스트)")}>텍스트 복사</button>
                <button className="btn sm primary" onClick={() => copy(out.html, "HTML")}>HTML 복사</button>
              </div>
            </div>
            <div className="detail-preview">
              {out.sections.map((s, i) => (
                <section key={i} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, borderLeft: "4px solid var(--accent)", paddingLeft: 8, margin: "0 0 8px" }}>{s.heading}</h3>
                  <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", color: "#333" }}>{s.body}</div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      {copied && <div className="toast">✅ {copied} 복사됨</div>}
      {saved && <div className="toast">✅ 상세페이지가 상품에 저장되었습니다</div>}
    </div>
  );
}

function dedupeJoin(prev: string, add: string[]): string {
  const existing = prev.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  for (const a of add) if (!seen.has(a.toLowerCase())) { existing.push(a); seen.add(a.toLowerCase()); }
  return existing.join("\n");
}

const taStyle: React.CSSProperties = {
  padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10,
  fontFamily: "inherit", fontSize: 14, resize: "vertical",
};

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
