// AI Seller OS 수집기 — 팝업 로직 (국내 도매 소싱용)

const APP_URL = "http://localhost:5173";
const $ = (id) => document.getElementById(id);
const val = (id) => ($(id).value || "").trim();

// 국내 도매 사이트로 인식할 호스트 (그 외에서도 수동 입력은 가능)
const WHOLESALE_HOSTS = /domeggook|domemedb|domeme|ownerclan|onch3|pandarose|sellforyou|dodomall|w-dome/i;

// ============================================================
// 페이지 컨텍스트에서 실행되는 추출기 (self-contained)
//  ※ 배송조건·반품정책은 화면에서 접혀 있는 경우가 많아 innerText 로는 안 잡힌다.
//    그래서 HTML 을 평문화한 flat 을 함께 사용한다.
// ============================================================
function extractor() {
  const html = document.documentElement.innerHTML;
  const text = document.body.innerText || "";
  const flat = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

  const meta = (p) =>
    (document.querySelector('meta[property="' + p + '"]') ||
      document.querySelector('meta[name="' + p + '"]') || {}).content || "";

  const won = (s) => {
    const n = parseInt(String(s == null ? "" : s).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };

  // ── 상품명
  let name = meta("og:title") || document.title || "";
  name = name
    .replace(/^\s*\[[^\]]{1,12}\]\s*/, "")
    .replace(/\s*[-|]\s*[^|]*?(도매꾹|도매매|오너클랜|온채널).*$/i, "")
    .trim();

  // ── 옵션: 도매꾹은 옵션 데이터가 페이지 안에 JSON 으로 들어 있다
  const options = [];
  const seenOpt = new Set();
  // adj = 도매처가 옵션마다 매긴 금액 차이. 도매꾹에서는 이게 "판매가 추가금"이 아니라
  //       "내가 사는 값(공급가)의 차이"다. 뒤에서 공급가로 환산해 보낸다.
  const addOpt = (nm, adj, fromSupplier) => {
    const clean = String(nm || "").replace(/[,，]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean || clean.length > 40 || seenOpt.has(clean)) return;
    seenOpt.add(clean);
    options.push({ name: clean, adj: Number(adj) || 0, fromSupplier: !!fromSupplier });
  };

  try {
    const m = html.match(/data\s*:\s*(\{"type":"[\s\S]{0,40000}?\})\s*,\s*[\r\n]+\s*amtDome/);
    if (m) {
      const parsed = JSON.parse(m[1]);
      const rows = parsed.data || {};
      Object.keys(rows).forEach((k) => {
        const o = rows[k];
        if (!o || !o.name || o.hid) return;
        addOpt(o.name, o.domPrice, true);
      });
    }
  } catch (e) { /* 형식이 다르면 아래 폴백으로 */ }

  // 폴백: 옵션처럼 보이는 select
  if (!options.length) {
    document.querySelectorAll("select").forEach((sel) => {
      const tag = ((sel.id || "") + " " + (sel.name || "") + " " + (sel.className || "")).toLowerCase();
      const list = Array.from(sel.options || []).map((o) => (o.textContent || "").trim()).filter(Boolean);
      const looksOpt = /opt|option|choice|item/.test(tag) || /선택|옵션/.test(list[0] || "");
      if (!looksOpt || list.length < 2 || list.length > 60) return;
      list.slice(1).forEach((t) => addOpt(t, 0, false));
    });
  }

  // ── 공급가
  let price = 0;
  const am = html.match(/amtDome\s*:\s*(\d+)/);
  if (am) price = parseInt(am[1], 10) || 0;
  if (!price) price = won(meta("og:price:amount") || meta("product:price:amount"));
  if (!price) {
    const el = document.querySelector(".lItemPrice, .price, [class*=Price]");
    if (el) {
      const pm = (el.textContent || "").match(/[\d,]{3,}\s*원/);
      if (pm) price = won(pm[0]);
    }
  }
  if (!price) {
    const pm = text.match(/([\d,]{3,})\s*원/);
    if (pm) price = won(pm[1]);
  }

  // 옵션별 공급가 확정 — 상품 공급가 + 도매처가 매긴 차액
  options.forEach((o) => {
    if (o.fromSupplier && price > 0) o.supply = Math.max(0, price + o.adj);
  });

  // ── 배송비 (수량별 비례면 첫 구간 금액)
  let shipping = 0;
  let sm = flat.match(/(\d+)\s*개까지\s*([\d,]+)\s*원/);
  if (sm) shipping = won(sm[2]);
  if (!shipping) {
    sm = flat.match(/배송비[^\d]{0,14}([\d,]{3,})\s*원/);
    if (sm) shipping = won(sm[1]);
  }

  // ── 반품/교환 정책 원문
  let policy = "";
  const pi = flat.indexOf("반품/교환정보");
  if (pi >= 0) {
    const seg = flat.slice(pi, pi + 1400);
    const ci = seg.indexOf("클린캠페인");
    policy = (ci > 0 ? seg.slice(0, ci) : seg).trim();
  }
  if (!policy) {
    const rm = flat.match(/[^.]{0,100}반품\s*배송비[^.]{0,120}/);
    if (rm) policy = rm[0].trim();
  }

  // ── 스펙: 표 구조 우선, 부족하면 일반 스캔
  const specs = [];
  const seenSpec = new Set();
  const pushSpec = (k, v) => {
    const key = String(k || "").trim().replace(/\s+/g, " ");
    const value = String(v || "").trim().replace(/\s+/g, " ");
    if (!key || !value || key.length > 20 || value.length > 60 || seenSpec.has(key)) return;
    seenSpec.add(key);
    specs.push([key, value]);
  };

  document.querySelectorAll(".lTbl").forEach((t) => {
    const c = t.querySelectorAll(".lTblCell");
    if (c.length === 2) pushSpec(c[0].textContent, c[1].textContent);
  });

  const stockM = flat.match(/재고수량\s*([\d,]+)\s*개/);
  if (stockM) pushSpec("도매처 재고", stockM[1] + "개");

  // ★ 최소구매수량 — 위탁판매는 주문 1건씩 발주한다.
  //   이 값이 1이 아니면 "1개만 사서 보내기"가 불가능하다. 반드시 확인해야 한다.
  const minQ = flat.match(/최소구매수량\s*([\d,]+)\s*개/) || html.match(/unitQty\s*:\s*(\d+)/);
  if (minQ) pushSpec("최소구매수량", minQ[1].replace(/,/g, "") + "개");

  if (specs.length < 3) {
    document.querySelectorAll("li, tr, dl").forEach((el) => {
      const kids = Array.from(el.children).filter((c) => c.textContent && c.textContent.trim());
      if (kids.length !== 2) return;
      const k = kids[0].textContent.trim();
      if (/[\n]/.test(k)) return;
      pushSpec(k, kids[1].textContent);
    });
  }

  // ── 공급사
  let supplier = "";
  const sEl = document.querySelector("#lInfoSellerId b, #lSellerPopInfoNick .id");
  if (sEl) supplier = (sEl.textContent || "").trim();
  const host = location.host.replace(/^www\./, "");
  const siteName = /domeggook/i.test(host) ? "도매꾹" : "";
  if (supplier && siteName) supplier = siteName + " · " + supplier;
  if (!supplier) supplier = host;

  // ── 상세 이미지 (아이콘·추적 픽셀 제외)
  const images = [];
  try {
    const seenImg = new Set();
    document.querySelectorAll("img").forEach((img) => {
      const src = img.currentSrc || img.src || "";
      if (!/^https?:\/\//i.test(src)) return;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w < 200 || h < 200) return;
      const clean = src.split("?")[0];
      if (seenImg.has(clean)) return;
      seenImg.add(clean);
      images.push({ src: src, w: w, h: h });
    });
  } catch (e) { /* ignore */ }

  const selection = (window.getSelection && window.getSelection().toString()) || "";

  return {
    name: name,
    price: price,
    shipping: shipping,
    supplier: supplier,
    policy: policy,
    options: options,
    url: location.href,
    host: host,
    specs: specs.slice(0, 25),
    selection: selection,
    images: images.slice(0, 60),
  };
}

// ============================================================
// 팝업 UI
// ============================================================
let IMAGES = []; // {src, w, h, checked}

function renderImages() {
  const grid = $("imggrid");
  grid.innerHTML = "";
  $("imgcount").textContent = IMAGES.filter((i) => i.checked).length + "/" + IMAGES.length + "장 선택";
  IMAGES.forEach((im, idx) => {
    const cell = document.createElement("div");
    cell.className = "cell" + (im.checked ? " on" : "");
    cell.title = im.w + "x" + im.h;
    const thumb = document.createElement("img");
    thumb.src = im.src;
    thumb.loading = "lazy";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = im.checked ? "✓" : "";
    cell.appendChild(thumb);
    cell.appendChild(mark);
    cell.addEventListener("click", () => {
      IMAGES[idx].checked = !IMAGES[idx].checked;
      renderImages();
    });
    grid.appendChild(cell);
  });
}

function optionLine(options) {
  // 금액에 천 단위 콤마를 넣지 않는다 — 앱이 옵션 구분자로 오인할 수 있다.
  // 대괄호 [n] = 이 옵션의 공급가(내가 사는 값). 괄호 (+n원) = 판매가 추가금.
  const body = options.map((o) => {
    if (o.supply != null) return o.name + " [" + o.supply + "]";
    if (!o.adj) return o.name;
    const sign = o.adj > 0 ? "+" : "-";
    return o.name + " (" + sign + Math.abs(o.adj) + "원)";
  }).join(", ");
  return "옵션: " + body;
}

function fill(d) {
  if (!d) return;
  if (d.name) $("name").value = d.name;
  if (d.price) $("price").value = d.price;
  if (d.shipping) $("shipping").value = d.shipping;
  if (d.url) $("url").value = d.url;
  if (d.supplier) $("supplier").value = d.supplier;
  if (d.policy) $("policy").value = d.policy;

  const parts = [];
  if (d.options && d.options.length) parts.push(optionLine(d.options));
  if (d.specs && d.specs.length) parts.push(d.specs.map((s) => s[0] + ": " + s[1]).join("\n"));
  if (d.selection && d.selection.trim()) parts.push(d.selection.trim());
  if (parts.length) $("raw").value = parts.join("\n");

  IMAGES = (d.images || []).map((im) => ({ src: im.src, w: im.w, h: im.h, checked: true }));
  renderImages();
}

async function run() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const url = tab && tab.url ? tab.url : "";
    $("url").value = url;

    if (!/^https?:/i.test(url)) {
      $("status").textContent = "상품 페이지에서 사용하세요. 값은 직접 입력 가능.";
      return;
    }

    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractor });
    const r = res && res[0] && res[0].result;
    fill(r);

    const got = [];
    if (r && r.price) got.push("공급가");
    if (r && r.shipping) got.push("배송비");
    if (r && r.options && r.options.length) got.push("옵션 " + r.options.length + "개");
    if (r && r.specs && r.specs.length) got.push("스펙 " + r.specs.length + "개");
    if (r && r.policy) got.push("반품정책");
    if (r && r.images && r.images.length) got.push("이미지 " + r.images.length + "장");

    if (got.length >= 4) {
      $("status").textContent = "수집 완료 — " + got.join(" · ") + ". 확인 후 복사하세요.";
    } else if (WHOLESALE_HOSTS.test(url)) {
      $("status").textContent = "일부만 수집됨 — " + (got.join(" · ") || "없음") + ". 빈 칸은 직접 채워주세요.";
    } else {
      $("status").textContent = "도매 사이트가 아니면 값이 부정확할 수 있어요 — 확인 후 사용하세요.";
    }
  } catch (e) {
    $("status").textContent = "이 페이지에서 자동 수집 불가 — 값을 직접 입력하세요.";
  }
}

function safeName(s) {
  return (s || "상품").replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "상품";
}

function extOf(url) {
  const m = url.split("?")[0].match(/\.(jpe?g|png|gif|webp|bmp)$/i);
  return m ? m[1].toLowerCase() : "jpg";
}

$("dl").addEventListener("click", async () => {
  const picked = IMAGES.filter((i) => i.checked);
  if (picked.length === 0) {
    $("dlnote").textContent = "선택된 이미지가 없습니다.";
    return;
  }
  const folder = safeName($("name").value);
  let ok = 0;
  for (let i = 0; i < picked.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    try {
      await chrome.downloads.download({
        url: picked[i].src,
        filename: "AISOS/" + folder + "/" + folder + "_" + n + "." + extOf(picked[i].src),
        conflictAction: "uniquify",
      });
      ok++;
    } catch (e) { /* 개별 실패는 건너뜀 */ }
  }
  $("dlnote").textContent = "✅ " + ok + "/" + picked.length + "장 저장 — 다운로드 폴더 > AISOS > " + folder;
});

$("selall").addEventListener("click", () => { IMAGES.forEach((i) => (i.checked = true)); renderImages(); });
$("selnone").addEventListener("click", () => { IMAGES.forEach((i) => (i.checked = false)); renderImages(); });

function buildBlock() {
  const picked = IMAGES.filter((i) => i.checked).map((i) => i.src);
  const lines = [
    "##AISOS##",
    "name: " + val("name"),
    "price: " + (val("price") || 0),
    "shipping: " + (val("shipping") || 0),
    "supplier: " + val("supplier"),
    "url: " + val("url"),
    "images: " + picked.join(", "),
    "raw:",
    val("raw"),
  ];
  const pol = val("policy");
  if (pol) {
    lines.push("policy:");
    lines.push(pol);
  }
  return lines.join("\n");
}

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildBlock());
    $("done").textContent = "✅ 복사됨 — 앱의 '상품 추가 → 가져오기'에 붙여넣기";
  } catch (e) {
    $("done").textContent = "복사 실패 — 텍스트를 수동 선택해 복사하세요.";
  }
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: APP_URL });
});

// ============================================================
// 여러 상품 가격·재고 일괄 점검
//  ★ 서버 크롤링이 아니다. 내 브라우저에서, 내가 파는 상품만, 내가 눌렀을 때 연다.
//  ★ 읽지 못하면 FAIL 로 남긴다. 절대 정상으로 처리하지 않는다.
// ============================================================

/** 상품 페이지에서 공급가와 재고만 읽는다 (탭 안에서 실행) */
function watchProbe() {
  const html = document.documentElement.innerHTML;
  const flat = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  let price = 0;
  const am = html.match(/amtDome\s*:\s*(\d+)/);
  if (am) price = parseInt(am[1], 10) || 0;
  if (!price) {
    const el = document.querySelector(".lItemPrice, .price, [class*=Price]");
    if (el) {
      const pm = (el.textContent || "").match(/[\d,]{3,}\s*원/);
      if (pm) price = parseInt(pm[0].replace(/[^\d]/g, ""), 10) || 0;
    }
  }

  let stock = "UNKNOWN";
  const st = flat.match(/재고수량\s*([\d,]+)\s*개/);
  if (st) {
    const n = parseInt(st[1].replace(/,/g, ""), 10);
    stock = n <= 0 ? "OUT" : n < 30 ? "LOW" : "IN";
  }
  if (/품절|판매종료|재고가 없는 상품/.test(flat)) stock = "OUT";

  // 하나도 못 읽었으면 아직 로딩 중일 수 있다 → null 을 돌려 재시도하게 한다
  if (!price && stock === "UNKNOWN") return null;
  return { price: price, stock: stock };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeOne(url) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: url, active: false });
    for (let i = 0; i < 24; i++) {           // 최대 약 12초
      await sleep(500);
      try {
        const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: watchProbe });
        const r = res && res[0] && res[0].result;
        if (r) return r;
      } catch (e) { /* 아직 로딩 중 */ }
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    if (tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
  }
}

function parseWatchList(text) {
  const H = "##AISOS-WATCH##";
  if (!text || text.indexOf(H) < 0) return [];
  return text.slice(text.indexOf(H) + H.length)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i < 0) return null;
      return { id: l.slice(0, i).trim(), url: l.slice(i + 1).trim() };
    })
    .filter((x) => x && x.id && /^https?:\/\//i.test(x.url));
}

$("watchRun").addEventListener("click", async () => {
  const items = parseWatchList($("watchList").value);
  if (!items.length) {
    $("watchStatus").textContent = "점검 목록이 없습니다. 앱의 [가격 점검 목록 복사]를 눌러 붙여넣으세요.";
    return;
  }
  $("watchRun").disabled = true;
  const out = ["##AISOS-PRICES##"];
  let outOfStock = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    $("watchStatus").textContent = "점검 중 " + (i + 1) + "/" + items.length + " …";
    const r = await probeOne(items[i].url);
    if (!r) {
      failed++;
      out.push(items[i].id + "||FAIL");
    } else {
      if (r.stock === "OUT") outOfStock++;
      out.push(items[i].id + "|" + r.price + "|" + r.stock);
    }
  }

  $("watchOut").value = out.join("\n");
  $("watchOut").style.display = "block";
  $("watchCopy").style.display = "block";
  $("watchStatus").textContent =
    "완료 — " + items.length + "개 확인" +
    (failed ? " · 실패 " + failed + "개" : "") +
    (outOfStock ? " · 품절 " + outOfStock + "개" : "") +
    ". 결과를 복사해 앱에 붙여넣으세요.";
  $("watchRun").disabled = false;
});

$("watchCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("watchOut").value);
    $("watchStatus").textContent = "✅ 복사됨 — 앱의 [점검 결과 붙여넣기]에 넣으세요.";
  } catch (e) {
    $("watchStatus").textContent = "복사 실패 — 아래 내용을 직접 선택해 복사하세요.";
  }
});

// ============================================================
// 검색 목록에서 후보 담기 (1차 거르기용)
//  ★ 목록 화면에는 배송비·최소구매수량이 없다. 이름·가격·주소만 담는다.
//    정밀 판정은 상세 페이지에서 따로 한다.
// ============================================================

function listProbe() {
  // ★ 상품 하나에 링크가 여러 개다 (이미지 링크 · 제목 링크 · 판매자 링크).
  //   먼저 만난 링크를 쓰면 이미지 링크의 alt="상품이미지"가 이름이 된다.
  //   그래서 같은 상품의 후보를 다 모아놓고 그중 제일 나은 것을 고른다.

  // 상품명이 아니라 자리표시자인 것들
  var GENERIC = /^(상품\s*이미지|이미지|썸네일|사진|대표\s*이미지|no\s*image|image|photo|thumbnail|product|상품|더보기|자세히|바로가기)$/i;

  function cleanName(s) {
    var t = (s || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    // 끝에 붙은 가격을 뗀다 — "… 노선도 보기 7,800원"
    t = t.replace(/[\s|·,]*[\d,]{3,}\s*원\s*$/, "").trim();
    // 앞뒤 홍보 대괄호
    t = t.replace(/^\[[^\]]{0,20}\]\s*/, "").trim();
    if (GENERIC.test(t)) return "";
    if (/^[\d,.\s원%]+$/.test(t)) return "";   // 숫자·가격만 있는 것
    if (t.length < 4) return "";
    return t.slice(0, 80);
  }

  var byId = {};

  document.querySelectorAll("a[href]").forEach(function (a) {
    var m = (a.href || "").match(/^https?:\/\/[^/]*domeggook\.com\/(\d{5,})/i);
    if (!m) return;
    var id = m[1];
    var rec = byId[id] || (byId[id] = { names: [], card: null });

    rec.names.push(a.getAttribute("title") || "");
    rec.names.push(a.textContent || "");
    var img = a.querySelector("img[alt]");
    if (img) rec.names.push(img.getAttribute("alt") || "");

    // 카드는 상품 하나를 담은 가장 큰 덩어리로 잡는다 (가격을 찾기 위해)
    var card = a.closest("li, tr, article, .item, .prd, div");
    if (card) {
      var len = (card.innerText || "").length;
      if (len < 2000 && (!rec.card || len > (rec.card.innerText || "").length)) rec.card = card;
    }
  });

  var out = [];
  var noName = 0;

  Object.keys(byId).forEach(function (id) {
    var rec = byId[id];

    // 이름 후보 중 가장 긴 것 — 제목 링크가 이미지 alt보다 길다
    var name = "";
    for (var i = 0; i < rec.names.length; i++) {
      var c = cleanName(rec.names[i]);
      if (c.length > name.length) name = c;
    }

    var text = rec.card ? (rec.card.innerText || "").replace(/\s+/g, " ") : "";

    // 이름을 못 찾으면 카드 본문에서 가장 그럴듯한 한 줄을 쓴다
    if (!name && text) {
      var lines = (rec.card.innerText || "").split("\n");
      for (var j = 0; j < lines.length; j++) {
        var c2 = cleanName(lines[j]);
        if (c2.length > name.length) name = c2;
      }
    }
    if (!name) { noName++; return; }

    // 배송비를 판매가로 잘못 읽지 않도록 '배송' 뒤의 금액은 건너뛴다
    var price = 0;
    var re = /([\d,]{3,})\s*원/g, mm;
    while ((mm = re.exec(text))) {
      var before = text.slice(Math.max(0, mm.index - 12), mm.index);
      if (/배송|반품|교환/.test(before)) continue;
      price = parseInt(mm[1].replace(/,/g, ""), 10);
      break;
    }
    if (!price) return;

    out.push({ name: name, price: price, url: "https://www.domeggook.com/" + id });
  });

  return { items: out, noName: noName };
}

$("listRun").addEventListener("click", async () => {
  $("listStatus").textContent = "읽는 중…";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: listProbe });
    const r = (res && res[0] && res[0].result) || { items: [], noName: 0 };
    const items = r.items || [];
    if (!items.length) {
      $("listStatus").textContent = "상품을 찾지 못했습니다. 도매꾹 검색 결과 화면에서 눌러주세요.";
      return;
    }
    // 이름|공급가|배송비|최소수량|옵션수|URL  (모르는 값은 0)
    const lines = items.map((i) => [i.name.replace(/\|/g, " "), i.price, 0, 1, 0, i.url].join("|"));
    $("listOut").value = ["##AISOS-LIST##"].concat(lines).join("\n");
    $("listOut").style.display = "block";
    $("listCopy").style.display = "block";
    // 이름을 못 읽은 것은 조용히 버리지 않고 몇 개인지 알린다
    $("listStatus").textContent =
      items.length + "개 담았습니다. 복사해서 앱 소싱센터에 넣으세요." +
      (r.noName ? " (이름을 못 읽은 " + r.noName + "개는 뺐습니다)" : "");
  } catch (e) {
    $("listStatus").textContent = "이 화면에서는 읽을 수 없습니다.";
  }
});

$("listCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("listOut").value);
    $("listStatus").textContent = "✅ 복사됨 — 앱 → 소싱센터에 붙여넣으세요.";
  } catch (e) {
    $("listStatus").textContent = "복사 실패 — 아래 내용을 직접 선택해 복사하세요.";
  }
});

// ============================================================
// 경쟁상품 가격 담기 (네이버 쇼핑·쿠팡 검색 화면)
//  ★ 상품명·가격·배송비만 읽는다. 판단은 앱이 한다.
// ============================================================

function compProbe() {
  const out = [];
  const seen = new Set();

  // 가격이 들어있는 작은 덩어리를 찾아 위로 올라가며 상품 카드를 잡는다
  const nodes = Array.from(document.querySelectorAll("li, div, article"));
  for (const el of nodes) {
    if (el.children.length > 12) continue;                 // 너무 큰 컨테이너는 건너뜀
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 220) continue;

    const pm = t.match(/([\d,]{4,})\s*원/);
    if (!pm) continue;
    const price = parseInt(pm[1].replace(/,/g, ""), 10);
    if (!price || price < 500 || price > 5000000) continue;

    // 상품명 후보: 카드 안에서 가장 긴 링크 텍스트
    let name = "";
    el.querySelectorAll("a").forEach((a) => {
      const s = (a.innerText || a.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (s.length > name.length && s.length >= 8 && !/원$/.test(s)) name = s;
    });
    if (!name || name.length < 8) continue;

    const key = name.slice(0, 30) + "|" + price;
    if (seen.has(key)) continue;
    seen.add(key);

    // 배송비: "배송비 3,000원" / "무료배송"
    let shipping = 0;
    if (!/무료\s*배송|무료배송/.test(t)) {
      const sm = t.match(/배송비?\s*([\d,]{3,})\s*원/);
      if (sm) shipping = parseInt(sm[1].replace(/,/g, ""), 10) || 0;
    }

    out.push({ name: name.slice(0, 80), price: price, shipping: shipping });
    if (out.length >= 80) break;
  }
  return out;
}

$("compRun").addEventListener("click", async () => {
  $("compStatus").textContent = "읽는 중…";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: compProbe });
    const items = (res && res[0] && res[0].result) || [];
    if (!items.length) {
      $("compStatus").textContent = "가격을 찾지 못했습니다. 검색 결과 화면에서 눌러주세요.";
      return;
    }
    const host = (tabs[0].url || "").replace(/^https?:\/\//, "").split("/")[0];
    const lines = items.map((i) =>
      [i.name.replace(/\|/g, " "), i.price, i.shipping, host].join("|"));
    $("compOut").value = ["##AISOS-COMP##"].concat(lines).join("\n");
    $("compOut").style.display = "block";
    $("compCopy").style.display = "block";
    $("compStatus").textContent = items.length + "개 담았습니다. 복사해서 앱 STEP3에 넣으세요.";
  } catch (e) {
    $("compStatus").textContent = "이 화면에서는 읽을 수 없습니다.";
  }
});

$("compCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("compOut").value);
    $("compStatus").textContent = "✅ 복사됨 — 앱 STEP3 경쟁상품 칸에 붙여넣으세요.";
  } catch (e) {
    $("compStatus").textContent = "복사 실패 — 아래 내용을 직접 선택해 복사하세요.";
  }
});

// ============================================================
// 후보 시세 자동 조사
//  ★ 검색을 사람 대신 눌러줄 뿐이다. 내 브라우저에서, 내가 시작을 눌렀을 때만.
//  ★ 상품마다 탭 하나를 열고 가격만 읽고 바로 닫는다.
// ============================================================

function parseSurveyList(text) {
  const H = "##AISOS-SURVEY##";
  if (!text || text.indexOf(H) < 0) return [];
  return text.slice(text.indexOf(H) + H.length)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i < 0) return null;
      return { key: l.slice(0, i).trim(), keyword: l.slice(i + 1).trim() };
    })
    .filter((x) => x && x.key && x.keyword);
}

/** 검색 결과에서 가격만 뽑는다 (상단 몇 개면 충분) */
function priceProbe() {
  const out = [];
  const nodes = Array.from(document.querySelectorAll("li, div, article"));
  for (const el of nodes) {
    if (el.children.length > 12) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 220) continue;
    if (/광고|AD\b/.test(t)) continue;                // 광고 상품은 시세로 치지 않는다
    const pm = t.match(/([\d,]{4,})\s*원/);
    if (!pm) continue;
    const p = parseInt(pm[1].replace(/,/g, ""), 10);
    if (!p || p < 1000 || p > 3000000) continue;
    let hasName = false;
    el.querySelectorAll("a").forEach((a) => {
      const s = (a.innerText || "").trim();
      if (s.length >= 8) hasName = true;
    });
    if (!hasName) continue;
    out.push(p);
    if (out.length >= 20) break;
  }
  return out.length ? out : null;
}

async function surveyOne(keyword) {
  const url = "https://search.shopping.naver.com/search/all?query=" + encodeURIComponent(keyword);
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: url, active: false });
    for (let i = 0; i < 24; i++) {
      await sleep(500);
      try {
        const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: priceProbe });
        const r = res && res[0] && res[0].result;
        if (r && r.length >= 3) return r;
      } catch (e) { /* 로딩 중 */ }
    }
    return [];
  } catch (e) {
    return [];
  } finally {
    if (tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
  }
}

$("surveyRun").addEventListener("click", async () => {
  const items = parseSurveyList($("surveyList").value);
  if (!items.length) {
    $("surveyStatus").textContent = "조사 목록이 없습니다. 앱 소싱센터의 [시세 조사 목록 복사]를 누르세요.";
    return;
  }
  $("surveyRun").disabled = true;
  const out = ["##AISOS-MARKET##"];
  let got = 0;

  for (let i = 0; i < items.length; i++) {
    $("surveyStatus").textContent =
      "조사 중 " + (i + 1) + "/" + items.length + " — " + items[i].keyword.slice(0, 18);
    const prices = await surveyOne(items[i].keyword);
    if (prices.length) got++;
    out.push(items[i].key + "|" + prices.join(","));
    await sleep(600);   // 사람이 훑는 속도로
  }

  $("surveyOut").value = out.join("\n");
  $("surveyOut").style.display = "block";
  $("surveyCopy").style.display = "block";
  $("surveyStatus").textContent =
    "완료 — " + got + "/" + items.length + "개 시세 확보. 결과를 복사해 앱에 붙여넣으세요.";
  $("surveyRun").disabled = false;
});

$("surveyCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("surveyOut").value);
    $("surveyStatus").textContent = "✅ 복사됨 — 앱 소싱센터에 붙여넣으세요.";
  } catch (e) {
    $("surveyStatus").textContent = "복사 실패 — 아래 내용을 직접 선택해 복사하세요.";
  }
});

// ------------------------------------------------------------
// 판매자센터 등록화면 조사
//
// ★ 읽기만 한다. 입력도 저장도 하지 않는다.
// ★ 값은 가져오지 않는다 — 칸의 "이름"만 본다.
//   자동입력을 만들려면 어떤 칸이 있는지부터 알아야 한다.
// ------------------------------------------------------------

function formProbe() {
  function labelOf(el) {
    // 1) for=id 로 연결된 label
    if (el.id) {
      var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l && l.textContent.trim()) return l.textContent.trim();
    }
    // 2) 감싸고 있는 label
    var p = el.closest("label");
    if (p && p.textContent.trim()) return p.textContent.trim();
    // 3) 접근성 이름
    var al = el.getAttribute("aria-label");
    if (al) return al.trim();
    // 4) 바로 앞 칸 제목 (th / dt / 앞 형제)
    var row = el.closest("tr, li, dd, .form-row, div");
    if (row) {
      var h = row.querySelector("th, dt, legend, strong, b");
      if (h && h.textContent.trim()) return h.textContent.trim();
      var prev = row.previousElementSibling;
      if (prev && prev.textContent.trim().length < 40) return prev.textContent.trim();
    }
    return "";
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  var out = [];
  var nodes = document.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, [contenteditable=true]"
  );

  for (var i = 0; i < nodes.length && out.length < 120; i++) {
    var el = nodes[i];
    if (!visible(el)) continue;
    var tag = el.tagName.toLowerCase();
    var type = el.getAttribute("type") || (tag === "input" ? "text" : tag);
    var label = labelOf(el).replace(/\s+/g, " ").slice(0, 40);
    var ph = (el.getAttribute("placeholder") || "").replace(/\s+/g, " ").slice(0, 30);
    var name = el.getAttribute("name") || "";
    var id = el.id || "";
    // 개인정보·인증 관련 칸은 조사 대상이 아니다
    if (/pass|pwd|card|account|resident|jumin|ssn/i.test(name + " " + id)) continue;
    out.push([tag + ":" + type, label, ph, id, name].join("|"));
  }

  var iframes = document.querySelectorAll("iframe").length;
  return { url: location.hostname + location.pathname, fields: out, iframes: iframes };
}

$("formRun").addEventListener("click", async () => {
  $("formStatus").textContent = "읽는 중…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: formProbe });
    const r = res && res[0] && res[0].result;
    if (!r || !r.fields.length) {
      $("formStatus").textContent = "입력칸을 찾지 못했습니다. 상품등록 화면인지 확인해 주세요.";
      return;
    }
    const lines = ["##AISOS-FORM##", "page|" + r.url, "iframes|" + r.iframes].concat(r.fields);
    $("formOut").value = lines.join("\n");
    $("formOut").style.display = "block";
    $("formCopy").style.display = "block";
    $("formStatus").textContent =
      "입력칸 " + r.fields.length + "개를 찾았습니다" +
      (r.iframes > 0 ? " (프레임 " + r.iframes + "개는 따로 읽어야 합니다)" : "") + ".";
  } catch (e) {
    $("formStatus").textContent = "읽지 못했습니다 — 이 페이지에서는 확장이 동작하지 않습니다.";
  }
});

$("formCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("formOut").value);
    $("formStatus").textContent = "✅ 복사됨";
  } catch (e) {
    $("formStatus").textContent = "복사 실패 — 아래 내용을 직접 선택해 복사하세요.";
  }
});

run();
