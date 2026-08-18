// 설정 — 수수료 / 개인정보 보존기간 / 백업·복원
import { useState } from "react";
import { useStore, getSettings, updateSettings, getFeeProfiles, updateFeeProfile, exportBackup, restoreBackup, purgeExpiredShipping } from "../store/db";
import { backupFileName, parseBackup, PERSONAL_DATA_WARNING, type BackupKind } from "../domain/backup";
import { CHANNEL_META } from "./meta";
import type { MarketFeeProfile } from "../domain/types";

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  useStore();
  const s = getSettings();
  const profiles = getFeeProfiles();
  const [msg, setMsg] = useState("");

  const download = (kind: BackupKind) => {
    if (kind === "FULL" && !confirm(PERSONAL_DATA_WARNING + "\n\n계속하시겠습니까?")) return;
    const data = exportBackup(kind);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName(kind, Date.now());
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(kind === "FULL" ? "전체 백업을 내려받았습니다. 안전한 곳에 보관하세요." : "안전 백업을 내려받았습니다. 개인정보는 포함되지 않았습니다.");
  };

  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = parseBackup(String(reader.result));
      if (!r.ok || !r.data) { setMsg(r.message); return; }
      if (!confirm(`${r.message}\n\n현재 데이터를 덮어씁니다. 계속할까요?`)) return;
      restoreBackup(r.data);
      setMsg("복원했습니다.");
    };
    reader.readAsText(file);
  };

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 오늘 할 일</button>
      <h2 className="work-title">설정</h2>

      {/* 수수료 */}
      <div className="card pad">
        <div className="section-label">마켓 수수료</div>
        <div className="warn-note">
          ⚠️ 아래 값은 <b>예시</b>입니다. 수수료는 시점·판매자 등급·유입경로에 따라 달라집니다.
          <b>본인 판매자센터에서 실제 요율을 확인해 입력하세요.</b> 확인한 항목은 체크해 두면 경고가 사라집니다.
        </div>
        {profiles.map((p) => <FeeEditor key={p.marketplace} profile={p} />)}
      </div>

      {/* 개인정보 */}
      <div className="card pad">
        <div className="section-label">개인정보 보관</div>
        <p className="hint">
          배송이 끝난 주문의 <b>수취인·연락처·주소</b>는 아래 기간이 지나면 자동으로 지웁니다.
          주문·손익 기록은 그대로 남습니다.
        </p>
        <div className="form-grid">
          <div className="field">
            <label>배송정보 보관 기간 (일)</label>
            <input type="number" value={s.retentionDays}
                   onChange={(e) => updateSettings({ retentionDays: Math.max(1, +e.target.value) })} />
          </div>
        </div>
        <button className="btn sm" onClick={() => {
          const r = purgeExpiredShipping();
          setMsg(r.purged > 0 ? `배송정보 ${r.purged}건을 지웠습니다.` : "지금 지울 대상이 없습니다.");
        }}>지금 정리하기</button>
      </div>

      {/* 백업 */}
      <div className="card pad">
        <div className="section-label">백업 / 복원</div>
        <p className="hint">
          이 프로그램은 데이터를 <b>브라우저에만</b> 저장합니다. 브라우저를 바꾸거나 정리하면 사라지니
          가끔 백업해 두세요.
        </p>
        <div className="backup-grid">
          <div className="bk">
            <b>전체 백업</b>
            <span>상품 + 주문 + 개인정보</span>
            <span className="warn-txt">🔒 고객 개인정보 포함</span>
            <button className="btn sm" onClick={() => download("FULL")}>내려받기</button>
          </div>
          <div className="bk">
            <b>안전 백업</b>
            <span>상품 + 주문 + 손익</span>
            <span className="ok-txt">개인정보 없음</span>
            <button className="btn sm" onClick={() => download("SAFE")}>내려받기</button>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>백업 파일에서 복원</label>
          <input type="file" accept="application/json"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      </div>

      {msg && <div className="copied">{msg}</div>}
    </div>
  );
}

function FeeEditor({ profile }: { profile: MarketFeeProfile }) {
  const c = CHANNEL_META[profile.marketplace];
  const total = profile.rules.filter((r) => r.enabled && r.basis === "PRODUCT").reduce((s, r) => s + r.pct, 0);
  const unverified = profile.rules.some((r) => r.enabled && r.pct > 0 && !r.verified);

  const patch = (id: string, p: Partial<MarketFeeProfile["rules"][0]>) =>
    updateFeeProfile({ ...profile, rules: profile.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  return (
    <div className="fee-block">
      <div className="fee-head">
        <span className="chch" style={{ color: c.color, background: c.bg }}>{c.short}</span>
        <b>{c.label}</b>
        <span className="tiny muted">상품금액 기준 합계 {total.toFixed(2)}%</span>
        {unverified && <span className="tiny warn-txt">예시값</span>}
      </div>
      {profile.rules.map((r) => (
        <div key={r.id} className="fee-row">
          <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
          <span className="fl">{r.label}</span>
          <span className="fb">{r.basis === "PRODUCT" ? "상품금액" : r.basis === "SHIPPING" ? "배송비" : "반품배송비"}</span>
          <input className="fp" type="number" step="0.01" value={r.pct}
                 onChange={(e) => patch(r.id, { pct: +e.target.value })} />
          <span>%</span>
          <label className="tiny">
            <input type="checkbox" checked={r.verified} onChange={(e) => patch(r.id, { verified: e.target.checked })} />
            확인함
          </label>
        </div>
      ))}
    </div>
  );
}
