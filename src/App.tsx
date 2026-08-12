import { useState } from "react";
import { useStore, getProducts, loadSeed, resetAll } from "./store/db";
import { demoProducts } from "./store/seed";
import { Dashboard } from "./ui/Dashboard";
import { ProductList } from "./ui/ProductList";
import { ProductDetail } from "./ui/ProductDetail";
import { AddProductForm } from "./ui/AddProductForm";

type View = "dashboard" | "products" | "add" | "detail";

export function App() {
  useStore();
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState<string | null>(null);

  const open = (id: string) => { setSelected(id); setView("detail"); };
  const hasProducts = getProducts().length > 0;

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">A</div>
        <div className="brand">
          <h1>AI Seller OS</h1>
          <p>무재고 구매대행 · 주문 순간 손실방어</p>
        </div>
        <div className="spacer" />
        <div className="btn-row">
          {!hasProducts && (
            <button className="btn sm" onClick={() => loadSeed(demoProducts())}>데모 데이터 불러오기</button>
          )}
          {hasProducts && (
            <button className="btn sm" onClick={() => { if (confirm("모든 데이터를 초기화할까요?")) { resetAll(); setView("dashboard"); } }}>초기화</button>
          )}
        </div>
      </div>

      <div className="nav">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>대시보드</button>
        <button className={view === "products" || view === "detail" ? "active" : ""} onClick={() => setView("products")}>상품</button>
        <button className={view === "add" ? "active" : ""} onClick={() => setView("add")}>상품 추가</button>
      </div>

      {view === "dashboard" && <Dashboard onOpen={open} />}
      {view === "products" && <ProductList onOpen={open} onAdd={() => setView("add")} />}
      {view === "add" && <AddProductForm onDone={() => setView("products")} />}
      {view === "detail" && selected && <ProductDetail id={selected} onBack={() => setView("products")} />}
    </div>
  );
}
