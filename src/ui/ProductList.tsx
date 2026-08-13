import { useStore } from "../store/db";
import { productProfit } from "../domain/status";
import { formatKrw, formatPct } from "../domain/money";
import { agoText } from "../domain/freshness";
import { STATUS_META, Badge, ChannelChips } from "./meta";

export function ProductList({
  onOpen,
  onAdd,
}: {
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { products } = useStore();
  const now = Date.now();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>공급처 상태 관리</div>
        <div style={{ flex: 1 }} />
        <button className="btn primary sm" onClick={onAdd}>+ 상품 추가</button>
      </div>

      {products.length === 0 ? (
        <div className="card empty">
          <div className="big">📦</div>
          아직 등록된 상품이 없습니다.<br />
          <button className="btn primary" style={{ marginTop: 14 }} onClick={onAdd}>첫 상품 추가하기</button>
        </div>
      ) : (
        <div className="plist">
          {products.map((p) => {
            const pr = productProfit(p);
            return (
              <div key={p.id} className="card prow" onClick={() => onOpen(p.id)}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <ChannelChips channels={p.channels} pending={p.pendingChannels} />
                    <span className="pname">{p.name}</span>
                  </div>
                  <div className="pmeta">
                    판매가 {formatKrw(p.sellingPriceKrw)} · 확인 {agoText(p.lastCollectedAt, now)}
                  </div>
                </div>
                <div className="col hide-sm">
                  <div className="k">1688 원가</div>
                  <div className="v">{formatKrw(pr.productPriceKrw)}</div>
                </div>
                <div className="col hide-sm">
                  <div className="k">순이익</div>
                  <div className={"v " + (pr.netProfitKrw < 0 ? "neg" : "pos")}>{formatKrw(pr.netProfitKrw)}</div>
                </div>
                <div className="col hide-sm">
                  <div className="k">마진</div>
                  <div className={"v " + (pr.netProfitKrw < 0 ? "neg" : "")}>{formatPct(pr.marginPct)}</div>
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
