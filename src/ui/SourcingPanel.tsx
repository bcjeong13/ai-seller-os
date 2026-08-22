// ============================================================
// 소싱센터 — "오늘 무엇을 소싱할까"
// ★ 추천보다 "무엇을 피해야 하는가"가 초보자에게 더 중요하다.
// ★ 점수를 보여주지 않는다. 3단계와 이유만.
// ============================================================

import { useState } from "react";
import {
  parseCandidates, judgeSourcing, summarizeSourcing, SORT_NOTE,
  type SourcingJudgement, type SourcingSummary,
} from "../domain/sourcing";
import { makeProduct } from "../domain/factory";
import { addProduct, getProducts } from "../store/db";
import { RISK_LABEL } from "../domain/riskCategory";
import { formatKrw } from "../domain/money";
import { SupplierCompare } from "./SupplierCompare";
import {
  buildSurveyList, parseMarketSamples, screenPriceGap, summarizeScreen,
  GAP_LABEL, type ScreenResult,
} from "../domain/screening";
import { getSettings, feeProfileOf } from "../store/db";
import { variablePctOf } from "../domain/fees";

/** 스크리닝 결과 = 후보 + 가격공간 판정 */
interface Screened {
  j: SourcingJudgement;
  s: ScreenResult;
}

/**
 * 후보를 상품으로 옮긴다.
 * 목록에서 아는 것(이름·공급가·배송비·최소수량·주소)만 채운 초안이다.
 * 옵션·스펙·반품정책은 확장으로 상세 페이지를 수집해야 채워진다.
 */
function startProduct(j: SourcingJudgement): string {
  const p = makeProduct({
    name: j.name,
    sourceUrl: j.url,
    supplierName: "도매꾹",
    marketplace: "NAVER",
    listPriceKrw: 0,          // 시세를 보고 정한다 — 지금 짐작하지 않는다
    supplyPriceKrw: j.supplyPriceKrw,
    shippingKrw: j.shippingKrw,
    minOrderQty: j.minOrderQty,
  });
  addProduct(p);
  return p.id;
}

/** 같은 도매처 주소로 이미 담은 상품이 있는가 — 중복 등록을 막는다 */
function existingIdFor(url: string): string | undefined {
  if (!url) return undefined;
  return getProducts().find((p) => p.sourceUrl === url)?.id;
}

export function SourcingPanel({ onBack, onOpenProduct }: {
  onBack: () => void;
  onOpenProduct: (id: string) => void;
}) {
  const [paste, setPaste] = useState("");
  const [sum, setSum] = useState<SourcingSummary | null>(null);
  const [msg, setMsg] = useState("");

  // 2단계 — 시세 조사
  const [survey, setSurvey] = useState("");
  const [screened, setScreened] = useState<Screened[] | null>(null);
  const [surveyMsg, setSurveyMsg] = useState("");

  const analyze = () => {
    const cands = parseCandidates(paste);
    if (!cands.length) {
      setMsg("후보 목록이 아닙니다. 확장의 [이 화면의 상품 담기] → [후보 복사]로 받은 내용을 넣어주세요.");
      return;
    }
    setSum(summarizeSourcing(cands.map((c) => judgeSourcing(c))));
    setScreened(null);
    setMsg("");
    setPaste("");
  };

  /** 1차 통과분만 시세를 조사한다 — 걸러진 것까지 검색할 이유가 없다 */
  const survivors = sum ? [...sum.good, ...sum.check] : [];

  const copySurvey = async () => {
    const text = buildSurveyList(survivors.map((j) => ({ key: j.key, keyword: j.name.slice(0, 30) })));
    try {
      await navigator.clipboard.writeText(text);
      setSurveyMsg(`${survivors.length}개 조사 목록을 복사했습니다. 확장의 [📊 후보 시세 자동 조사]에 붙여넣고 시작하세요.`);
    } catch {
      setSurveyMsg("복사 실패 — 브라우저에서 클립보드를 허용해 주세요.");
    }
  };

  const applySurvey = () => {
    const samples = parseMarketSamples(survey);
    if (!samples.length) {
      setSurveyMsg("시세 결과가 아닙니다. 확장의 [결과 복사]로 받은 내용을 넣어주세요.");
      return;
    }
    const feePct = variablePctOf(feeProfileOf("NAVER")) || 10;
    const targetMarginPct = getSettings().targetMarginPct || 30;
    const byKey = new Map(samples.map((s) => [s.key, s.prices]));
    const rows: Screened[] = survivors.map((j) => ({
      j,
      s: screenPriceGap(
        { landedCostKrw: j.landedCostKrw, feePct, minMarginPct: 15, targetMarginPct },
        byKey.get(j.key) ?? []
      ),
    }));
    rows.sort((a, b) => a.s.rank - b.s.rank);
    setScreened(rows);
    setSurvey("");
    setSurveyMsg("");
  };

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 오늘 할 일</button>
      <h2 className="work-title">소싱센터</h2>

      <div className="card pad">
        <div className="section-label">🔎 후보 가져오기</div>
        <ol className="howto">
          <li>도매꾹에서 <b>검색하거나 카테고리</b>를 엽니다</li>
          <li>확장 → <b>🔎 검색 목록에서 후보 한꺼번에 담기</b> → <b>이 화면의 상품 담기</b></li>
          <li><b>후보 복사</b>를 누르고 아래에 붙여넣습니다</li>
        </ol>
        <textarea className="paste" rows={3} value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="##AISOS-LIST## 로 시작하는 후보 목록을 붙여넣기" />
        <button className="btn primary" disabled={!paste.trim()} onClick={analyze}>분석하기</button>
        {msg && <div className="tiny" style={{ marginTop: 8, color: "var(--loss)" }}>{msg}</div>}
      </div>

      {sum && <Result sum={sum} onOpenProduct={onOpenProduct} />}

      {/* 2단계 — 소매 시세와 맞대본다. 여기서 대부분이 걸러진다 */}
      {sum && survivors.length > 0 && (
        <div className="card pad" style={{ borderColor: "var(--accent)" }}>
          <div className="section-label">📊 소매 시세와 맞대보기 <span className="tiny muted">핵심</span></div>
          <p className="hint" style={{ marginTop: 0 }}>
            도매가 싸도 <b>소매가 이미 더 싸면</b> 팔 수 없습니다. 남은 {survivors.length}개의
            시세를 한꺼번에 조사합니다.
          </p>
          <div className="watch-run">
            <div className="watch-step">
              <b>1</b> 조사 목록을 복사합니다
              <div className="btn-row">
                <button className="btn primary sm" onClick={copySurvey}>
                  {survivors.length}개 조사 목록 복사
                </button>
              </div>
            </div>
            <div className="watch-step">
              <b>2</b> 확장 → <b>📊 후보 시세 자동 조사</b> → 붙여넣고 <b>시세 조사 시작</b>
              <div className="hint">상품마다 네이버 쇼핑이 열렸다 닫힙니다. 1개당 5~8초 걸립니다.</div>
            </div>
            <div className="watch-step">
              <b>3</b> 결과를 붙여넣습니다
              <textarea className="paste" rows={3} value={survey}
                        onChange={(e) => setSurvey(e.target.value)}
                        placeholder="##AISOS-MARKET## 로 시작하는 결과를 붙여넣기" />
              <button className="btn primary sm" disabled={!survey.trim()} onClick={applySurvey}>결과 반영</button>
            </div>
          </div>
          {surveyMsg && <div className="tiny" style={{ marginTop: 8 }}>{surveyMsg}</div>}
        </div>
      )}

      {screened && <ScreenResultView rows={screened} onOpenProduct={onOpenProduct} />}

      <SupplierCompare />
    </div>
  );
}

function ScreenResultView({ rows, onOpenProduct }: { rows: Screened[]; onOpenProduct: (id: string) => void }) {
  const s = summarizeScreen(rows.map((r) => r.s));
  const worth = rows.filter((r) => r.s.level === "ROOM" || r.s.level === "TIGHT");

  return (
    <>
      <div className="card pad">
        <div className="section-label">시세 대조 결과</div>
        <div className="src-funnel">
          <div><b>{s.total}</b><span>조사</span></div>
          <div className="arw">→</div>
          <div className="good"><b>{s.room}</b><span>여유 있음</span></div>
          <div className="chk"><b>{s.tight}</b><span>상단만 가능</span></div>
          <div className="skp"><b>{s.noRoom}</b><span>자리 없음</span></div>
          {s.unknown > 0 && <div className="skp"><b>{s.unknown}</b><span>시세 미확인</span></div>}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          <b>자리 없음 {s.noRoom}개</b>는 도매가가 소매 시세보다 비싼 것들입니다. 열어볼 필요 없습니다.
        </div>
      </div>

      {worth.length === 0 ? (
        <div className="card pad center">
          살아남은 후보가 없습니다. 다른 카테고리에서 다시 담아보세요.
        </div>
      ) : (
        <div className="card pad">
          <div className="section-label">🏆 오늘 볼 만한 것 {worth.length}개</div>
          {worth.slice(0, 20).map(({ j, s: sc }) => (
            <div key={j.key} className={"src-card " + (sc.level === "ROOM" ? "good" : "chk")}>
              <div className="src-head">
                <div className="src-name">{GAP_LABEL[sc.level].slice(0, 2)} {j.name}</div>
                <div className="src-cost">매입 {formatKrw(j.landedCostKrw)}</div>
              </div>
              <div className="src-risk">{sc.text}</div>
              {sc.band && (
                <div className="comp-band" style={{ marginTop: 8 }}>
                  <div className="comp-b"><span>매입</span><b>{formatKrw(j.landedCostKrw)}</b></div>
                  <div className="comp-b"><span>최소가</span><b>{formatKrw(sc.minPriceKrw)}</b></div>
                  <div className="comp-b"><span>목표가</span><b>{formatKrw(sc.targetPriceKrw)}</b></div>
                  <div className="comp-b"><span>시장 중간</span><b>{formatKrw(sc.band.median)}</b></div>
                  <div className="comp-b"><span>시장 75%</span><b>{formatKrw(sc.band.p75)}</b></div>
                </div>
              )}
              <div className="btn-row">
                {existingIdFor(j.url) ? (
                  <button className="btn sm primary" onClick={() => onOpenProduct(existingIdFor(j.url)!)}>
                    담아둔 상품 열기 →
                  </button>
                ) : (
                  <button className="btn sm primary" onClick={() => onOpenProduct(startProduct(j))}>
                    ＋ 상품으로 담기
                  </button>
                )}
                <a className="btn sm" href={j.url} target="_blank" rel="noreferrer">도매처 열어 확인 ↗</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Result({ sum, onOpenProduct }: { sum: SourcingSummary; onOpenProduct: (id: string) => void }) {
  return (
    <>
      <div className="card pad">
        <div className="section-label">분석 결과</div>
        <div className="src-funnel">
          <div><b>{sum.total}</b><span>가져온 상품</span></div>
          <div className="arw">→</div>
          <div className="good"><b>{sum.good.length}</b><span>더 볼 만함</span></div>
          <div className="chk"><b>{sum.check.length}</b><span>조건부</span></div>
          <div className="skp"><b>{sum.skipped.length}</b><span>거름</span></div>
        </div>

        {sum.skipCounts.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 14 }}>왜 걸렀나</div>
            <div className="src-skips">
              {sum.skipCounts.map((s) => (
                <div key={s.reason} className="src-skip">
                  <span>{s.label}</span><b>{s.count}개</b>
                </div>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              무엇을 팔지보다 <b>무엇을 피할지</b>가 먼저입니다. 이 목록이 다음 검색 기준이 됩니다.
            </div>
          </>
        )}
      </div>

      {sum.good.length === 0 && sum.check.length === 0 ? (
        <div className="card pad center">
          남는 후보가 없습니다. 다른 카테고리나 검색어로 다시 담아보세요.
        </div>
      ) : (
        <div className="card pad">
          <div className="section-label">
            더 볼 만한 것 {sum.ranked.length}개 <span className="tiny muted">추천순</span>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            {SORT_NOTE}. 아직 <b>추천이 아닙니다</b> — 시장가를 확인해야 판단이 끝납니다.
          </p>
          {sum.ranked.slice(0, 30).map((j, i) => (
            <Card key={j.key} j={j} order={i + 1} onOpenProduct={onOpenProduct} />
          ))}
        </div>
      )}
    </>
  );
}

function Card({ j, order, onOpenProduct }: {
  j: SourcingJudgement;
  order: number;
  onOpenProduct: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const existing = existingIdFor(j.url);

  return (
    <div className={"src-card " + (j.level === "GOOD" ? "good" : "chk")}>
      <div className="src-head">
        <div className="src-name">
          <span className="src-no">{order}</span>
          {j.level === "GOOD" ? "🟢" : "🟡"} {j.name}
        </div>
        <div className="src-cost">{formatKrw(j.landedCostKrw)}{!j.shippingKnown && " +배송비"}</div>
      </div>
      <div className="src-risk">{RISK_LABEL[j.risk.level]} · {j.risk.category}</div>

      {open && (
        <ul className="checklist" style={{ marginTop: 8 }}>
          {j.reasons.map((r, i) => (
            <li key={i} className={r.ok ? "ok" : "no"}><span>{r.ok ? "✓" : "!"}</span><b>{r.text}</b></li>
          ))}
          {j.risk.check && (
            <li className="no"><span>!</span><b>확인할 것: {j.risk.check}</b></li>
          )}
        </ul>
      )}

      <div className="btn-row">
        {existing ? (
          <button className="btn sm primary" onClick={() => onOpenProduct(existing)}>
            담아둔 상품 열기 →
          </button>
        ) : (
          <button className="btn sm primary" onClick={() => onOpenProduct(startProduct(j))}>
            ＋ 상품으로 담기
          </button>
        )}
        <a className="btn sm" href={j.url} target="_blank" rel="noreferrer">도매처 열기 ↗</a>
        <button className="btn sm" onClick={() => setOpen((v) => !v)}>{open ? "접기" : "이유 보기"}</button>
      </div>
      {existing && <div className="tiny muted" style={{ marginTop: 6 }}>이미 담은 상품입니다</div>}
    </div>
  );
}
