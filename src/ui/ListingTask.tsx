// ============================================================
// 등록센터 — 상세페이지 생성 → 내가 승인 → 마켓별 등록 데이터
//
// ★ 마켓 API가 없으므로 등록 자체는 사람이 한다.
//   프로그램은 "무엇을 어디에 넣을지" 만들어주고, 어디까지 했는지 추적한다.
//
// ★ 체크박스를 늘어놓지 않는다 (§초보자는 전부 체크하고 넘어간다).
//   코드가 볼 수 있는 것은 코드가 판정하고, 사람에게는 2가지만 묻는다.
// ============================================================

import { useState } from "react";
import type { Product, Marketplace, SellerReturnPolicy } from "../domain/types";
import { ALL_CHANNELS } from "../domain/types";
import { getProduct, feeProfileOf, setListing, useStore, updateProduct, getSettings } from "../store/db";
import { buildListingHtml } from "../domain/listingHtml";
import { judgeProductNotice, NOTICE_LABEL } from "../domain/notice";
import {
  reviewForListing, approvalValid, toMarketplaceProduct, marketCopyText,
  type MarketplaceProduct,
} from "../domain/marketplaceProduct";
import { defaultSellerPolicy, normalizeSellerPolicy, comparePolicies, MIN_WITHDRAWAL_DAYS } from "../domain/sellerPolicy";
import { formatKrw } from "../domain/money";
import { CHANNEL_META } from "./meta";

/** 설정에 적어둔 공통 고시정보 — 상품마다 다시 치지 않게 한다 */
function noticeDefaults() {
  const s = getSettings();
  return { asPhone: s.asPhone, warranty: s.warranty };
}

export function ListingTask({ productId, onBack }: { productId: string; onBack: () => void }) {
  useStore();
  const product = getProduct(productId);
  const [copied, setCopied] = useState("");

  if (!product) return <div className="card pad center">상품을 찾을 수 없습니다.</div>;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1800);
    } catch { setCopied("복사 실패 — 직접 선택해 복사하세요"); }
  };

  const approved = approvalValid(product);

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 목록으로</button>
      <div className="work-head">
        <div>
          <h2 className="work-title">{product.name}</h2>
          <div className="tiny muted">
            {product.supplierName || "도매처 미입력"} · 공급가 {formatKrw(product.cost.supplyPriceKrw)}
          </div>
        </div>
      </div>

      <Steps approved={approved} />

      <ReviewCard product={product} />
      <NoticeCard product={product} />
      <ReturnPolicyCard product={product} />
      <DetailCard product={product} onCopy={copy} />
      <ImageCard product={product} />
      <ApproveCard product={product} approved={approved} />

      {approved && <MarketSection product={product} onCopy={copy} />}

      {copied && <div className="copied fixed">✅ {copied} 복사됨</div>}
    </div>
  );
}

function Steps({ approved }: { approved: boolean }) {
  return (
    <div className="lsteps-bar">
      <div className="on">① 검토</div>
      <span>›</span>
      <div className={approved ? "on" : ""}>② 내가 승인</div>
      <span>›</span>
      <div className={approved ? "on" : ""}>③ 마켓별 등록</div>
    </div>
  );
}

// ------------------------------------------------------------
// ① 검토 — 코드가 판정한다
// ------------------------------------------------------------

function ReviewCard({ product }: { product: Product }) {
  const fee = feeProfileOf(product.marketplace);
  const r = reviewForListing(product, fee, noticeDefaults());

  return (
    <div className="card pad">
      <div className="section-label">등록 검토 <span className="tiny muted">프로그램이 확인한 것</span></div>
      <ul className="checklist">
        {r.auto.map((a, i) => (
          <li key={i} className={a.ok ? "ok" : "no"}>
            <span>{a.ok ? "✓" : "!"}</span>
            <b>{a.label}</b> — {a.detail}
          </li>
        ))}
      </ul>
      {r.blocked && (
        <div className="warn-note" style={{ marginTop: 12 }}>
          <b>🔴 이대로는 등록하면 안 됩니다</b>
          <ul className="ex-list" style={{ marginTop: 6 }}>
            {r.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 고시정보 — 비어 있는 것만 묻는다
// ------------------------------------------------------------

function NoticeCard({ product }: { product: Product }) {
  const st = judgeProductNotice(product, noticeDefaults());
  const [open, setOpen] = useState(st.level !== "READY");

  const set = (key: string, value: string) => {
    // 저장 직전에 최신 상품을 다시 읽는다.
    // 렌더 시점의 product를 쓰면 여러 칸을 연달아 채울 때 앞엣것이 지워진다.
    const cur = getProduct(product.id) ?? product;
    const next = { ...(cur.noticeInfo ?? {}) };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    updateProduct(product.id, { noticeInfo: next });
  };

  return (
    <div className="card pad">
      <div className="section-label">
        상품정보 제공고시 <span className="tiny muted">{st.label}</span>
      </div>
      <div className={"verdict " + (st.level === "READY" ? "ok" : st.level === "BLOCKED" ? "bad" : "warn")}>
        {NOTICE_LABEL[st.level]} — {st.text}
      </div>
      <p className="hint">
        마켓은 카테고리마다 정해진 항목을 요구합니다. <b>못 채우면 등록이 거부됩니다.</b>
        도매처에서 읽힌 것은 자동으로 채웠습니다.
      </p>

      <button className="btn sm" onClick={() => setOpen((v) => !v)}>
        {open ? "접기" : `${st.filled}/${st.total} 채움 — 열어서 채우기`}
      </button>

      {open && (
        <div className="notice-grid">
          {st.slots.map((s) => (
            <label key={s.field.key} className="notice-row">
              <div className="nlab">
                {s.field.label}
                {s.source === "spec" && <span className="tiny muted"> 도매처에서 읽음</span>}
                {s.source === "settings" && <span className="tiny muted"> 내 설정에서</span>}
                {s.source === "empty" && <span className="tiny warn-txt"> 비어 있음</span>}
              </div>
              <input
                type="text"
                defaultValue={s.source === "manual" ? s.value : ""}
                placeholder={s.source === "spec" || s.source === "settings" ? s.value : "직접 입력"}
                onBlur={(e) => set(s.field.key, e.target.value)}
              />
              {s.field.hint && <div className="tiny muted nhint">{s.field.hint}</div>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 판매자 반품정책 — 공급처 정책과 분리한다
// ------------------------------------------------------------

function ReturnPolicyCard({ product }: { product: Product }) {
  const saved = product.sellerReturnPolicy;
  const policy = saved ?? defaultSellerPolicy(product.supplierReturnPolicy);
  const gaps = comparePolicies(policy, product.supplierReturnPolicy);

  const save = (patch: Partial<SellerReturnPolicy>) => {
    const cur = getProduct(product.id) ?? product;
    const base = cur.sellerReturnPolicy ?? defaultSellerPolicy(cur.supplierReturnPolicy);
    updateProduct(product.id, {
      sellerReturnPolicy: normalizeSellerPolicy({ ...base, ...patch, updatedAt: Date.now() }),
    });
  };

  const sup = product.supplierReturnPolicy;

  return (
    <div className="card pad">
      <div className="section-label">교환 · 반품 정책</div>
      <p className="hint" style={{ marginTop: 0 }}>
        도매처가 <b>나에게</b> 해주는 것과, 내가 <b>고객에게</b> 약속하는 것은 다릅니다.
        고객에게 책임을 지는 건 판매자인 나입니다.
      </p>

      <div className="pol-two">
        <div className="pol-box sup">
          <div className="pol-h">도매처가 나에게</div>
          {sup ? (
            <ul className="ex-list">
              {typeof sup.freeReturnDays === "number" && <li>{sup.freeReturnDays}일 이내 반품</li>}
              {typeof sup.returnFeeKrw === "number" && <li>반품 배송비 {formatKrw(sup.returnFeeKrw)}</li>}
              {typeof sup.exchangeFeeKrw === "number" && <li>교환 배송비 {formatKrw(sup.exchangeFeeKrw)}</li>}
            </ul>
          ) : (
            <div className="tiny warn-txt">읽지 못했습니다</div>
          )}
        </div>

        <div className="pol-box me">
          <div className="pol-h">내가 고객에게</div>
          <label className="pol-f">
            청약철회 기간
            <span>
              <input type="number" min={MIN_WITHDRAWAL_DAYS} defaultValue={policy.withdrawalDays}
                     onBlur={(e) => save({ withdrawalDays: +e.target.value })} /> 일
            </span>
          </label>
          <label className="pol-f">
            반품 배송비
            <span>
              <input type="number" min={0} step={500} defaultValue={policy.returnShippingKrw}
                     onBlur={(e) => save({ returnShippingKrw: +e.target.value })} /> 원
            </span>
          </label>
          <label className="pol-f">
            교환 배송비
            <span>
              <input type="number" min={0} step={500} defaultValue={policy.exchangeShippingKrw}
                     onBlur={(e) => save({ exchangeShippingKrw: +e.target.value })} /> 원
            </span>
          </label>
        </div>
      </div>

      <ul className="checklist" style={{ marginTop: 12 }}>
        {gaps.map((g, i) => (
          <li key={i} className={g.kind === "OK" ? "ok" : "no"}>
            <span>{g.kind === "OK" ? "✓" : "!"}</span><b>{g.text}</b>
          </li>
        ))}
      </ul>

      {!saved && (
        <div className="hint">법정 최소 기준({MIN_WITHDRAWAL_DAYS}일)으로 잡아두었습니다. 값을 고치면 저장됩니다.</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 상세페이지
// ------------------------------------------------------------

function DetailCard({ product, onCopy }: { product: Product; onCopy: (t: string, l: string) => void }) {
  const r = buildListingHtml(product, noticeDefaults());
  const [tab, setTab] = useState<"mobile" | "pc" | "code">("mobile");

  return (
    <div className="card pad">
      <div className="section-label">
        상세페이지 <span className="tiny muted">마켓 에디터의 HTML 모드에 붙여넣으세요</span>
      </div>

      {r.todos.length > 0 && (
        <div className="warn-note" style={{ marginBottom: 12 }}>
          <b>손볼 곳</b>
          <ul className="ex-list" style={{ marginTop: 6 }}>
            {r.todos.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      <div className="btn-row">
        <button className={"btn sm" + (tab === "mobile" ? " primary" : "")} onClick={() => setTab("mobile")}>📱 휴대폰</button>
        <button className={"btn sm" + (tab === "pc" ? " primary" : "")} onClick={() => setTab("pc")}>🖥️ PC</button>
        <button className={"btn sm" + (tab === "code" ? " primary" : "")} onClick={() => setTab("code")}>&lt;/&gt; HTML</button>
      </div>

      {tab === "code" ? (
        <pre className="copy-block small">{r.html}</pre>
      ) : (
        <>
          <p className="hint">
            {tab === "mobile"
              ? "고객 10명 중 8명 이상은 이 화면으로 봅니다. 여기서 읽히지 않으면 안 팔립니다."
              : "PC에서는 이렇게 보입니다."}
          </p>
          <div className={"preview-stage " + tab}>
            <div className="html-preview" dangerouslySetInnerHTML={{ __html: r.html }} />
          </div>
        </>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={() => onCopy(r.html, "상세페이지 HTML")}>
          HTML 복사
        </button>
        <span className="tiny muted">회색 칸 {r.imageSlots}곳에 이미지를 넣으면 완성입니다</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 이미지
//
// ★ 앱은 이미지를 보관하지 않는다. 확장이 도매처에서 내 컴퓨터로 받고,
//   사람이 마켓 에디터에 직접 올린다. 마켓 서버에 올라가야 하기 때문이다.
// ------------------------------------------------------------

function ImageCard({ product }: { product: Product }) {
  return (
    <div className="card pad">
      <div className="section-label">
        이미지 <span className="tiny muted">앱이 보관하지 않습니다</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        이미지는 <b>마켓 서버에 올라가야</b> 고객에게 보입니다. 그래서 앱이 대신 넣을 수 없고,
        마켓 에디터에서 직접 올리셔야 합니다.
      </p>
      <ol className="howto">
        <li>
          {product.sourceUrl
            ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">도매처 상품페이지</a>
            : "도매처 상품페이지"}에서 확장 → <b>⬇️ 선택한 이미지 다운로드</b>
          <div className="tiny muted">저장 위치: 다운로드 &gt; AISOS &gt; 상품명</div>
        </li>
        <li>
          <b>공급사 로고·연락처가 박힌 이미지는 빼세요</b>
          <div className="tiny muted">다른 판매자 연락처가 내 상세페이지에 노출됩니다</div>
        </li>
        <li>
          마켓 에디터에서 회색 칸을 지우고 그 자리에 사진을 넣습니다
          <div className="tiny muted">대표 1장 + 상세 3장 = 4곳</div>
        </li>
      </ol>
      {product.imageRightsConfirmed ? (
        <div className="hint">✅ 이미지 사용 허용을 확인한 상품입니다.</div>
      ) : (
        <div className="warn-note">
          ⚠️ 아직 <b>이미지 사용 허용</b>을 확인하지 않았습니다. 아래 승인 단계에서 확인합니다.
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// ② 승인 — 사람에게는 코드가 볼 수 없는 것만 묻는다
// ------------------------------------------------------------

function ApproveCard({ product, approved }: { product: Product; approved: boolean }) {
  const fee = feeProfileOf(product.marketplace);
  const r = reviewForListing(product, fee, noticeDefaults());
  const a = product.listingApproval;
  const [img, setImg] = useState(a?.imageChecked ?? false);
  const [word, setWord] = useState(a?.wordingChecked ?? false);

  const staleApproval = !!a && !approved && a.approvedPriceKrw !== product.price.buyerPaidKrw;

  const approve = () => {
    updateProduct(product.id, {
      // 이미지 확인은 한 곳에서만 한다 — 승인에서 확인하면 상품 쪽도 함께 켠다
      imageRightsConfirmed: img,
      listingApproval: {
        approvedAt: Date.now(),
        approvedPriceKrw: product.price.buyerPaidKrw,
        imageChecked: img,
        wordingChecked: word,
      },
    });
  };

  const cancel = () => updateProduct(product.id, { listingApproval: undefined });

  if (approved) {
    return (
      <div className="card pad">
        <div className="verdict ok">✅ 등록 승인됨 — {formatKrw(product.price.buyerPaidKrw)}</div>
        <p className="hint">
          가격을 바꾸면 승인이 자동으로 풀립니다. 바뀐 가격으로 다시 확인해야 하기 때문입니다.
        </p>
        <button className="btn sm" onClick={cancel}>승인 취소</button>
      </div>
    );
  }

  return (
    <div className="card pad" style={{ borderColor: "var(--accent)" }}>
      <div className="section-label">내가 확인할 것 <span className="tiny muted">프로그램이 볼 수 없는 것</span></div>

      {staleApproval && (
        <div className="warn-note" style={{ marginBottom: 12 }}>
          승인한 뒤 판매가가 {formatKrw(a!.approvedPriceKrw)} → {formatKrw(product.price.buyerPaidKrw)}로 바뀌었습니다. 다시 확인해 주세요.
        </div>
      )}

      <label className="ask-row">
        <input type="checkbox" checked={img} onChange={(e) => setImg(e.target.checked)} />
        <div>
          <b>{r.askHuman[0].label}</b>
          <div className="tiny muted">{r.askHuman[0].detail}</div>
        </div>
      </label>
      <label className="ask-row">
        <input type="checkbox" checked={word} onChange={(e) => setWord(e.target.checked)} />
        <div>
          <b>{r.askHuman[1].label}</b>
          <div className="tiny muted">{r.askHuman[1].detail}</div>
        </div>
      </label>

      <button className="btn primary lg" disabled={!img || !word || r.blocked} onClick={approve}>
        {r.blocked ? "먼저 위의 문제를 고쳐주세요" : "✅ 이 상품 등록 승인"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// ③ 마켓별 등록
// ------------------------------------------------------------

function MarketSection({ product, onCopy }: { product: Product; onCopy: (t: string, l: string) => void }) {
  const [sel, setSel] = useState<Marketplace[]>(
    ALL_CHANNELS.filter((m) => !product.listings.find((l) => l.marketplace === m)?.listed)
  );
  const [open, setOpen] = useState<Marketplace | null>(null);

  const toggle = (m: Marketplace) =>
    setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const done = product.listings.filter((l) => l.listed);

  return (
    <>
      <div className="card pad">
        <div className="section-label">
          어디에 올릴까요 <span className="tiny muted">{done.length}/{ALL_CHANNELS.length} 올림</span>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          마켓마다 상품명 길이·필수 항목이 다릅니다. 고른 마켓에 맞춰 각각 변환해 드립니다.
        </p>
        <div className="hint" style={{ marginTop: 6 }}>
          <b>상세페이지 HTML은 5곳이 모두 같습니다</b> — 한 번 복사해두고 붙여넣기만 반복하면 됩니다.
          다만 <b>이미지는 마켓마다 다시 올려야</b> 합니다. 각 마켓 서버에 올라가야 하기 때문입니다.
        </div>
        <div className="listing-grid">
          {ALL_CHANNELS.map((m) => {
            const c = CHANNEL_META[m];
            const listed = product.listings.find((x) => x.marketplace === m)?.listed;
            return (
              <label key={m} className={"chkbtn" + (sel.includes(m) ? " on" : "")}>
                <input type="checkbox" checked={sel.includes(m)} onChange={() => toggle(m)} />
                <span className="chch" style={{ color: c.color, background: c.bg }}>{c.short}</span>
                {c.label}
                {listed && <span className="tiny ok-txt"> 올림</span>}
              </label>
            );
          })}
        </div>
      </div>

      {sel.map((m) => (
        <MarketCard
          key={m}
          mp={toMarketplaceProduct(product, m, noticeDefaults())}
          listed={!!product.listings.find((x) => x.marketplace === m)?.listed}
          open={open === m}
          onToggle={() => setOpen((o) => (o === m ? null : m))}
          onCopy={onCopy}
          onListed={(v) => setListing(product.id, m, { listed: v, pending: false })}
        />
      ))}
    </>
  );
}

function MarketCard({
  mp, listed, open, onToggle, onCopy, onListed,
}: {
  mp: MarketplaceProduct;
  listed: boolean;
  open: boolean;
  onToggle: () => void;
  onCopy: (t: string, l: string) => void;
  onListed: (v: boolean) => void;
}) {
  const c = CHANNEL_META[mp.marketplace];
  const blocks = mp.issues.filter((i) => i.level === "BLOCK");
  const warns = mp.issues.filter((i) => i.level === "WARN");

  return (
    <div className={"card pad mk-card" + (listed ? " done" : "")}>
      <div className="mk-head">
        <span className="chch" style={{ color: c.color, background: c.bg }}>{c.short}</span>
        <b>{mp.label}</b>
        {blocks.length > 0
          ? <span className="tiny warn-txt">🔴 등록 불가 {blocks.length}</span>
          : <span className="tiny ok-txt">🟢 준비됨</span>}
        <div className="spacer" />
        {listed
          ? <button className="btn xs" onClick={() => onListed(false)}>올림 취소</button>
          : <button className="btn xs primary" onClick={() => onListed(true)}>올렸음 ✓</button>}
      </div>

      {blocks.length > 0 && (
        <ul className="ex-list">{blocks.map((b, i) => <li key={i}>{b.text}</li>)}</ul>
      )}

      <table className="mk-table">
        <tbody>
          <tr>
            <th>상품명</th>
            <td>
              {mp.name}
              <button className="btn xs" onClick={() => onCopy(mp.name, "상품명")}>복사</button>
              {mp.nameChanged && <div className="tiny muted">도매처 이름에서 홍보문구·특수문자를 걷어냈습니다</div>}
            </td>
          </tr>
          <tr>
            <th>판매가</th>
            <td>
              {formatKrw(mp.buyerPaidKrw)}
              <button className="btn xs" onClick={() => onCopy(String(mp.buyerPaidKrw), "판매가")}>복사</button>
            </td>
          </tr>
          <tr>
            <th>배송비</th>
            <td>
              {mp.buyerShippingKrw > 0 ? formatKrw(mp.buyerShippingKrw) : "무료배송"}
              {" · "}<b>선불(주문시결제)</b>
              <div className="tiny muted">착불로 두면 택배기사가 고객에게 배송비를 요구합니다</div>
            </td>
          </tr>
          {mp.options.length > 0 && (
            <tr>
              <th>옵션 {mp.options.length}개</th>
              <td>
                {mp.options.map((o) => o.addPriceKrw ? `${o.name} (+${formatKrw(o.addPriceKrw)})` : o.name).join(" / ")}
                <button className="btn xs"
                        onClick={() => onCopy(mp.options.map((o) => o.addPriceKrw ? `${o.name},${o.addPriceKrw}` : o.name).join("\n"), "옵션")}>
                  복사
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="btn-row">
        <button className="btn sm primary" onClick={() => onCopy(marketCopyText(mp), `${mp.label} 등록정보 전체`)}>
          📋 등록정보 전체 복사
        </button>
        <button className="btn sm primary" onClick={() => onCopy(mp.detailHtml, `${mp.label} 상세 HTML`)}>
          상세페이지 HTML 복사
        </button>
        {mp.centerUrl && (
          <a className="btn sm" href={mp.centerUrl} target="_blank" rel="noreferrer">판매자센터 ↗</a>
        )}
        <button className="btn sm" onClick={onToggle}>{open ? "접기" : "고시정보·주의사항"}</button>
      </div>

      {open && (
        <>
          {mp.notice.length > 0 && (
            <table className="mk-table" style={{ marginTop: 10 }}>
              <tbody>
                {mp.notice.map((n) => (
                  <tr key={n.label}><th>{n.label}</th><td>{n.value}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="btn xs" style={{ marginTop: 8 }}
                  onClick={() => onCopy(mp.notice.map((n) => `${n.label}: ${n.value}`).join("\n"), "고시정보")}>
            고시정보 복사
          </button>
          {warns.length > 0 && (
            <ul className="ex-list" style={{ marginTop: 10 }}>
              {warns.map((w, i) => <li key={i}>{w.text}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
