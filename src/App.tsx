import { useState } from "react";
import { useStore, getProducts, loadSeed, resetAll } from "./store/db";
import { demoData } from "./store/seed";
import { Today, type TodoKey } from "./ui/Today";
import { TaskList } from "./ui/TaskList";
import { OrderTask } from "./ui/OrderTask";
import { OrderImportPanel } from "./ui/OrderImportPanel";
import { ProductPanel } from "./ui/ProductPanel";
import { ListingTask } from "./ui/ListingTask";
import { SettingsPanel } from "./ui/SettingsPanel";
import { SourcingPanel } from "./ui/SourcingPanel";
import type { Order } from "./domain/orders";

type View =
  | { v: "today" }
  | { v: "list"; which: TodoKey }
  | { v: "order"; orderId: string }
  | { v: "import" }
  | { v: "products"; id?: string }
  | { v: "listing"; productId: string }
  | { v: "sourcing" }
  | { v: "settings" };

export function App() {
  useStore();
  const [view, setView] = useState<View>({ v: "today" });
  const [menu, setMenu] = useState(false);
  const hasData = getProducts().length > 0;

  const go = (v: View) => { setView(v); setMenu(false); };

  return (
    <div className="app">
      <div className="topbar">
        <button className="menu-btn" onClick={() => setMenu((m) => !m)} aria-label="메뉴">☰</button>
        <div className="logo" onClick={() => go({ v: "today" })}>A</div>
        <div className="brand" onClick={() => go({ v: "today" })}>
          <h1>AI Seller OS</h1>
          <p>국내 위탁판매 · 손실 방지</p>
        </div>
        <div className="spacer" />
        {!hasData && (
          <button className="btn sm" onClick={() => { const d = demoData(); loadSeed(d.products, d.orders, d.shipping); }}>
            데모 데이터
          </button>
        )}
      </div>

      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <nav className="side">
            <button onClick={() => go({ v: "today" })}>오늘 할 일</button>
            <button onClick={() => go({ v: "sourcing" })}>소싱센터</button>
            <button onClick={() => go({ v: "products" })}>상품</button>
            <button onClick={() => go({ v: "import" })}>주문 가져오기</button>
            <button onClick={() => go({ v: "settings" })}>설정</button>
            <div className="side-sep" />
            <button className="danger" onClick={() => {
              if (confirm("모든 데이터를 지웁니다. 계속할까요?")) { resetAll(); go({ v: "today" }); }
            }}>전체 초기화</button>
          </nav>
        </>
      )}

      <main>
        {view.v === "today" && (
          <Today onOpen={(which) => go({ v: "list", which })} onImport={() => go({ v: "import" })} />
        )}
        {view.v === "list" && (
          <TaskList
            which={view.which}
            onBack={() => go({ v: "today" })}
            onOpenOrder={(order) => go({ v: "order", orderId: order.id })}
            onOpenProduct={(p) =>
              go(view.which === "toList"
                ? { v: "listing", productId: p.id }
                : { v: "products", id: p.id })
            }
          />
        )}
        {view.v === "listing" && (
          <ListingTask productId={view.productId} onBack={() => go({ v: "today" })} />
        )}
        {view.v === "order" && (
          <OrderTask orderId={view.orderId} onBack={() => go({ v: "today" })} />
        )}
        {view.v === "import" && <OrderImportPanel onDone={() => go({ v: "today" })} />}
        {view.v === "products" && (
          <ProductPanel openId={view.id} onBack={() => go({ v: "today" })}
                        onListing={(id) => go({ v: "listing", productId: id })} />
        )}
        {view.v === "sourcing" && <SourcingPanel onBack={() => go({ v: "today" })} />}
        {view.v === "settings" && <SettingsPanel onBack={() => go({ v: "today" })} />}
      </main>
    </div>
  );
}
