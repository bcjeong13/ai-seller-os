import { useMemo, useState } from "react";
import type { Product, Marketplace } from "../domain/types";
import { generateDetailPage, type DetailPageInput } from "../domain/detailPage";

function splitLines(s: string): string[] {
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

export function DetailPageBuilder({
  product,
  onBack,
}: {
  product?: Product;
  onBack: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [market] = useState<Marketplace>(product?.marketplace ?? "NAVER");
  const [category, setCategory] = useState("");
  const [target, setTarget] = useState("");
  const [featuresText, setFeaturesText] = useState("");
  const [optionsText, setOptionsText] = useState("");

  const [freeShipping, setFreeShipping] = useState(true);
  const [returnEnabled, setReturnEnabled] = useState(true);
  const [returnDays, setReturnDays] = useState(30);
  const [freeReturn, setFreeReturn] = useState(false);
  const [exchange, setExchange] = useState(true);
  const [qualityGuarantee, setQualityGuarantee] = useState(true);
  const [gift, setGift] = useState("");

  const [dMin, setDMin] = useState(7);
  const [dMax, setDMax] = useState(14);
  const [overseas, setOverseas] = useState(true);

  const [copied, setCopied] = useState<string>("");

  const input: DetailPageInput = useMemo(
    () => ({
      productName: name || "상품명",
      marketplace: market,
      category,
      target,
      features: splitLines(featuresText),
      options: splitLines(optionsText),
      benefits: {
        freeShipping,
        returnDays: returnEnabled ? returnDays : 7,
        freeReturn: returnEnabled && freeReturn,
        exchange,
        qualityGuarantee,
        gift,
      },
      deliveryMinDays: dMin,
      deliveryMaxDays: dMax,
      isOverseasAgent: overseas,
    }),
    [name, market, category, target, featuresText, optionsText, freeShipping, returnEnabled, returnDays, freeReturn, exchange, qualityGuarantee, gift, dMin, dMax, overseas]
  );

  const out = useMemo(() => generateDetailPage(input), [input]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("복사 실패");
    }
  };

  return (
    <div>
      <button className="back" onClick={onBack}>← 돌아가기</button>
      <div className="section-title" style={{ marginTop: 0 }}>상세페이지 만들기</div>
      <div className="pill-info" style={{ marginBottom: 16 }}>
        사실 정보만 넣으면 상품명·키워드·상세페이지·FAQ·배송/반품 안내를 자동으로 만들어 줍니다.
        <b> 구매대행 배송기간과 반품 안내가 자동 포함</b>되고, 과대광고 표현은 경고로 잡아줍니다.
      </div>

      <div className="two-col">
        {/* ---------- 입력 ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                  placeholder={"강력한 흡착력\n360도 회전\n무선충전 지원"}
                  style={taStyle} />
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
              <div className="field">
                <label>배송 최소일</label>
                <input type="number" value={dMin} onChange={(e) => setDMin(+e.target.value)} />
              </div>
              <div className="field">
                <label>배송 최대일</label>
                <input type="number" value={dMax} onChange={(e) => setDMax(+e.target.value)} />
              </div>
              <div className="field full">
                <label>사은품 <span className="hint">(선택)</span></label>
                <input value={gift} onChange={(e) => setGift(e.target.value)} placeholder="예: 사은품 없음이면 비워두기" />
              </div>
            </div>
          </div>
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
            <div className="row-between">
              <div style={{ fontWeight: 700 }}>상품명 후보</div>
            </div>
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
              {out.tags.map((t, i) => (
                <span key={i} className="tagchip">#{t}</span>
              ))}
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
    </div>
  );
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
