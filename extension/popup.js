// AI Seller OS 수집기 — 팝업 로직

const APP_URL = "http://localhost:5173";
const $ = (id) => document.getElementById(id);

// 페이지 컨텍스트에서 실행되는 추출기 (self-contained)
function extractor() {
  const meta = (p) =>
    (document.querySelector(`meta[property="${p}"]`) || document.querySelector(`meta[name="${p}"]`) || {}).content || "";
  const host = location.host;

  let name = meta("og:title") || document.title || "";
  name = name.replace(/\s*[-|]\s*(AliExpress|알리익스프레스|1688|Taobao|Tmall).*$/i, "").trim();

  let currency = "CNY";
  if (/1688|taobao|tmall/.test(host)) currency = "CNY";
  else if (/aliexpress/.test(host)) currency = "KRW";

  let price = 0;
  const ogp = meta("og:price:amount");
  if (ogp) price = parseFloat(ogp.replace(/[^\d.]/g, "")) || 0;

  // AliExpress runParams (있으면 더 정확)
  try {
    const rp = window.runParams && window.runParams.data;
    if (rp) {
      if (rp.titleModule && rp.titleModule.subject) name = rp.titleModule.subject;
      const pm = rp.priceModule;
      if (pm) {
        const v =
          (pm.minActivityAmount && pm.minActivityAmount.value) ||
          (pm.minAmount && pm.minAmount.value) || 0;
        if (v) price = v;
      }
    }
  } catch (e) { /* ignore */ }

  // 스펙 표 자동 수집: 2칸(이름/값) 구조의 행(li/tr)을 찾아 key: value 로 수집
  const specs = [];
  try {
    const seen = new Set();
    document.querySelectorAll("li, tr, dl").forEach((el) => {
      const kids = Array.from(el.children).filter((c) => c.textContent && c.textContent.trim());
      if (kids.length === 2) {
        const k = kids[0].textContent.trim().replace(/\s+/g, " ");
        const v = kids[1].textContent.trim().replace(/\s+/g, " ");
        if (k && v && k.length <= 20 && v.length <= 60 && !/[\n]/.test(k) && !seen.has(k)) {
          seen.add(k);
          specs.push([k, v]);
        }
      }
    });
  } catch (e) { /* ignore */ }

  const selection = (window.getSelection && window.getSelection().toString()) || "";
  return { name, currency, price, url: location.href, specs: specs.slice(0, 25), selection };
}

function fill(d) {
  if (!d) return;
  if (d.name) $("name").value = d.name;
  if (d.currency) $("currency").value = d.currency;
  if (d.price) $("price").value = d.price;
  if (d.url) $("url").value = d.url;
  const parts = [];
  if (d.specs && d.specs.length) parts.push(d.specs.map(([k, v]) => `${k}: ${v}`).join("\n"));
  if (d.selection && d.selection.trim()) parts.push(d.selection.trim());
  if (parts.length) $("raw").value = parts.join("\n");
}

async function run() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab && tab.url ? tab.url : "";
    if (!/aliexpress|1688|taobao|tmall/.test(url)) {
      $("status").textContent = "알리/1688/타오바오 상품 페이지에서 사용하세요. 값은 직접 입력 가능.";
      $("url").value = url;
      return;
    }
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractor });
    fill(res && res.result);
    const r = res && res.result;
    const got = r && ((r.specs && r.specs.length) || (r.selection && r.selection.trim()));
    $("status").textContent = got
      ? "수집 완료 — 확인/정리 후 복사하세요."
      : "상품명·가격 수집됨. 옵션/특징이 없으면 페이지에서 드래그 선택 후 다시 열어주세요.";
  } catch (e) {
    $("status").textContent = "이 페이지에서 자동 수집 불가 — 값을 직접 입력하세요.";
  }
}

function buildBlock() {
  return [
    "##AISOS##",
    `name: ${$("name").value.trim()}`,
    `currency: ${$("currency").value}`,
    `price: ${$("price").value.trim() || 0}`,
    `shipping: ${$("shipping").value.trim() || 0}`,
    `url: ${$("url").value.trim()}`,
    "raw:",
    $("raw").value.trim(),
  ].join("\n");
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

run();
