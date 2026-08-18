// ============================================================
// 소싱센터 — "오늘 무엇을 소싱할까"
// ★ 추천보다 "무엇을 피해야 하는가"가 초보자에게 더 중요하다.
// ★ 점수를 보여주지 않는다. 3단계와 이유만.
// ============================================================

import { useState } from "react";
import {
  parseCandidates, judgeSourcing, summarizeSourcing,
  type SourcingJudgement, type SourcingSummary,
} from "../domain/sourcing";
import { RISK_LABEL } from "../domain/riskCategory";
import { formatKrw } from "../domain/money";

export function SourcingPanel({ onBack }: { onBack: () => void }) {
  const [paste, setPaste] = useState("");
  const [sum, setSum] = useState<SourcingSummary | null>(null);
  const [msg, setMsg] = useState("");

  const analyze = () => {
    const cands = parseCandidates(paste);
    if (!cands.length) {
      setMsg("후보 목록이 아닙니다. 확장의 [이 화면의 상품 담기] → [후보 복사]로 받은 내용을 넣어주세요.");
      return;
    }
    setSum(summarizeSourcing(cands.map((c) => judgeSourcing(c))));
    setMsg("");
    setPaste("");
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

      {sum && <Result sum={sum} />}
    </div>
  );
}

function Result({ sum }: { sum: SourcingSummary }) {
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
          <div className="section-label">더 볼 만한 것 {sum.good.length + sum.check.length}개</div>
          <p className="hint" style={{ marginTop: 0 }}>
            아직 <b>추천이 아닙니다.</b> 배송비·최소구매수량·시장가를 확인해야 판단이 끝납니다.
          </p>
          {[...sum.good, ...sum.check].slice(0, 30).map((j) => <Card key={j.key} j={j} />)}
        </div>
      )}
    </>
  );
}

function Card({ j }: { j: SourcingJudgement }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"src-card " + (j.level === "GOOD" ? "good" : "chk")}>
      <div className="src-head">
        <div className="src-name">{j.level === "GOOD" ? "🟢" : "🟡"} {j.name}</div>
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
        <a className="btn sm" href={j.url} target="_blank" rel="noreferrer">도매처 열기 ↗</a>
        <button className="btn sm" onClick={() => setOpen((v) => !v)}>{open ? "접기" : "이유 보기"}</button>
      </div>
    </div>
  );
}
