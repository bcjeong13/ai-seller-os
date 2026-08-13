import { useStore } from "../store/db";
import { productProfit, channelActionNeeded } from "../domain/status";
import { formatKrw } from "../domain/money";
import { STATUS_META, Badge, ChannelChips } from "./meta";
import type { Product } from "../domain/types";

export function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const { products } = useStore();

  const count = (fn: (p: Product) => boolean) => products.filter(fn).length;
  const loss = count((p) => p.status === "LOSS");
  const warn = count((p) => p.status === "WARNING" || p.status === "DANGER");
  const oos = count((p) => p.status === "OUT_OF_STOCK");
  const blocked = count((p) => p.status === "BLOCKED");
  const syncPending = count((p) => channelActionNeeded(p).pending);

  const risky = products.filter((p) =>
    ["LOSS", "DANGER", "WARNING", "OUT_OF_STOCK", "BLOCKED"].includes(p.status)
  );

  const totalProfit = products
    .filter((p) => p.status === "SELLING")
    .reduce((s, p) => s + productProfit(p).netProfitKrw, 0);

  return (
    <div>
      <div className="section-title">한눈에 보기</div>
      <div className="stat-grid">
        <div className="card stat">
          <div className="label">판매 상품</div>
          <div className="value">{products.length}<span style={{ fontSize: 14 }}>개</span></div>
          <div className="sub">등록된 전체 상품</div>
        </div>
        <div className="card stat">
          <div className="label">정상 상품 예상 순이익(건당 합)</div>
          <div className="value" style={{ color: "var(--safe)" }}>{formatKrw(totalProfit)}</div>
          <div className="sub">판매중 상태 기준</div>
        </div>
        <div className="card stat alert">
          <div className="label">🔴 손실 상품</div>
          <div className="value">{loss}<span style={{ fontSize: 14 }}>개</span></div>
          <div className="sub">즉시 조치 필요</div>
        </div>
        <div className="card stat">
          <div className="label">🟡 위험/주의</div>
          <div className="value" style={{ color: "var(--warn)" }}>{warn}<span style={{ fontSize: 14 }}>개</span></div>
          <div className="sub">마진 하락 감시</div>
        </div>
      </div>

      <div className="section-title">위험 상품 (우선 조치)</div>
      <div className="risk-grid" style={{ marginBottom: 18 }}>
        <RiskTile n={loss} t="🔴 손실 (LOSS)" color="var(--loss)" />
        <RiskTile n={warn} t="🟡 마진 주의" color="var(--warn)" />
        <RiskTile n={oos} t="📦 공급처 품절" color="var(--stock)" />
        <RiskTile n={blocked} t="⛔ 차단" color="var(--block)" />
        <RiskTile n={syncPending} t="🔁 채널 반영 필요" color="var(--accent)" />
      </div>

      {risky.length === 0 ? (
        <div className="card empty">
          <div className="big">✅</div>
          위험 상품이 없습니다. 모두 안전 상태예요.
        </div>
      ) : (
        <div className="plist">
          {risky.map((p) => {
            const pr = productProfit(p);
            return (
              <div key={p.id} className="card prow" onClick={() => onOpen(p.id)}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <ChannelChips channels={p.channels} />
                    <span className="pname">{p.name}</span>
                  </div>
                  <div className="pmeta">판매가 {formatKrw(p.sellingPriceKrw)}</div>
                </div>
                <div className="col hide-sm">
                  <div className="k">현재 원가</div>
                  <div className="v">{formatKrw(pr.productPriceKrw)}</div>
                </div>
                <div className="col hide-sm">
                  <div className="k">예상 순이익</div>
                  <div className={"v " + (pr.netProfitKrw < 0 ? "neg" : "pos")}>
                    {formatKrw(pr.netProfitKrw)}
                  </div>
                </div>
                <div className="col"><Badge meta={STATUS_META[p.status]} /></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RiskTile({ n, t, color }: { n: number; t: string; color: string }) {
  return (
    <div className="card risk-tile">
      <div className="n" style={{ color: n > 0 ? color : "var(--muted2)" }}>{n}</div>
      <div className="t">{t}</div>
    </div>
  );
}
