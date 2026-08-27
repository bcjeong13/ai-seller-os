// ============================================================
// 등록화면 채우기 — 팝업과 백그라운드가 같이 쓴다
//
// ★ 저장하지 않는다. 값만 넣고, 확인과 저장은 사람이 한다.
// ★ 아래 선택자는 실제 화면을 읽어 확인한 것만 쓴다.
//   짐작으로 넣으면 엉뚱한 칸에 값이 들어가고 조용히 틀린다.
// ★ 화면이 바뀌면 이 파일만 고치면 된다.
// ============================================================

/** 어느 사이트가 어느 마켓인가 — 탭을 찾을 때 쓴다 */
var AISOS_SITE_HOST = {
  NAVER: "sell.smartstore.naver.com",
};

/**
 * 페이지 안에서 실행된다.
 * 바깥 변수를 쓰지 못하므로 선택자 표를 안에 들고 있다.
 */
function aisosFillProbe(payload) {
  // 2026-08 네이버 스마트스토어 상품등록에서 읽어 확인한 칸
  var MAP = {
    NAVER: {
      name:        ['[name="product.name"]'],
      price:       ['#prd_price2', '[name="product.salePrice"]'],
      stock:       ['#stock', '[name="product.stockQuantity"]'],
      category:    ['[name="category"]'],
      detail:      ['textarea[name="editorContent"]'],
      returnFee:   ['#return_price', '[name="product.deliveryInfo.claimDeliveryInfo.returnDeliveryFee"]'],
      exchangeFee: ['#exchange_price', '[name="product.deliveryInfo.claimDeliveryInfo.exchangeDeliveryFee"]'],
      asPhone:     ['#as_number', '[name="product.detailAttribute.afterServiceInfo.afterServiceTelephoneNumber"]'],
      asGuide:     ['#as_info', '[name="product.detailAttribute.afterServiceInfo.afterServiceGuideContent"]'],
    },
  };

  var map = MAP[payload.site];
  if (!map) return { ok: false, reason: "이 마켓은 아직 지원하지 않습니다" };

  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // React·Vue는 값을 직접 넣으면 알아채지 못한다. 네이티브 setter로 넣고 이벤트를 알린다.
  function setValue(el, value) {
    var proto = el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  var filled = [];
  var missed = [];

  Object.keys(map).forEach(function (field) {
    var value = payload.fields[field];
    if (value === undefined || value === "") return;

    var el = null;
    for (var i = 0; i < map[field].length && !el; i++) {
      var found = document.querySelectorAll(map[field][i]);
      for (var j = 0; j < found.length; j++) {
        // 상세설명 textarea는 에디터에 가려 안 보일 수 있다 — 그건 예외로 둔다
        if (field === "detail" || visible(found[j])) { el = found[j]; break; }
      }
    }

    if (!el) { missed.push(field); return; }
    try { setValue(el, value); filled.push(field); }
    catch (e) { missed.push(field); }
  });

  return { ok: true, filled: filled, missed: missed };
}

/** 앱이 보낸 블록을 편다 */
function aisosParseFill(text) {
  var out = { site: "", fields: {} };
  var H = "##AISOS-FILL##";
  if (!text || text.indexOf(H) < 0) return out;
  var body = text.slice(text.indexOf(H) + H.length);
  var lines = body.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var k = line.indexOf("|");
    if (k < 0) continue;
    var key = line.slice(0, k).trim();
    var val = line.slice(k + 1).split("\\n").join("\n");
    if (key === "site") out.site = val;
    else out.fields[key] = val;
  }
  return out;
}

var AISOS_FILL_LABEL = {
  name: "상품명", price: "판매가", stock: "재고수량",
  category: "카테고리 검색어", detail: "상세설명",
  returnFee: "반품배송비", exchangeFee: "교환배송비",
  asPhone: "A/S 전화번호", asGuide: "A/S 안내",
};

function aisosLabelList(keys) {
  return keys.map(function (k) { return AISOS_FILL_LABEL[k] || k; }).join(", ");
}
