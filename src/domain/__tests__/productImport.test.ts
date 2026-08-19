import { describe, it, expect } from "vitest";
import { parseProductBlock, parseRawInfo, parseOptionToken, parseReturnPolicy, isJunkOptionName } from "../productImport";

const block = `##AISOS##
name: 차량용 무선 핸드폰 거치대
price: 4200
shipping: 2500
supplier: domeggook.com
url: https://domeggook.com/item/12345
images: https://img.domeggook.com/a.jpg, https://img.domeggook.com/b.jpg
raw:
색상: 블랙, 화이트, 실버
재질: ABS + 실리콘
· 강력한 흡착력
12,900원`;

describe("확장 → 앱 상품 가져오기", () => {
  it("헤더 필드를 파싱한다", () => {
    const r = parseProductBlock(block);
    expect(r.ok).toBe(true);
    expect(r.name).toBe("차량용 무선 핸드폰 거치대");
    expect(r.supplyPriceKrw).toBe(4200);
    expect(r.shippingKrw).toBe(2500);
    expect(r.supplierName).toBe("domeggook.com");
    expect(r.sourceUrl).toContain("domeggook");
  });

  it("옵션을 이름+가격으로 뽑고 공급가를 자동으로 채운다", () => {
    const r = parseProductBlock(block);
    expect(r.options.map((o) => o.name)).toEqual(["블랙", "화이트", "실버"]);
    expect(r.options.every((o) => o.supplyPriceKrw === 4200)).toBe(true);
  });

  it("옵션 추가금을 파싱한다", () => {
    expect(parseOptionToken("대형 (+2,000원)")).toEqual({ name: "대형", addPriceKrw: 2000 });
    expect(parseOptionToken("케이스5장 (-2,500원)")).toEqual({ name: "케이스5장", addPriceKrw: -2500 });
    expect(parseOptionToken("G1화이트")).toEqual({ name: "G1화이트", addPriceKrw: 0 });
  });

  it("스펙을 key-value로 저장한다", () => {
    const r = parseProductBlock(block);
    expect(r.specs).toContainEqual({ key: "재질", value: "ABS + 실리콘" });
    expect(r.specs.some((s) => s.value.includes("12,900"))).toBe(false);
  });

  it("반품 정책을 파싱한다", () => {
    const p = parseReturnPolicy("구매 후 30일 이내 무료 반품이 가능합니다. 하자 발생 시 3개월 이내 무상. 반품 배송비 : 4,000원");
    expect(p?.freeReturnDays).toBe(30);
    expect(p?.defectReturnDays).toBe(90);
    expect(p?.returnFeeKrw).toBe(4000);
  });

  it("반품 정책이 없으면 undefined", () => {
    expect(parseReturnPolicy("아무 내용 없음")).toBeUndefined();
  });

  it("이미지 개수를 센다", () => {
    expect(parseProductBlock(block).imageCount).toBe(2);
  });

  it("AISOS 마커가 없으면 실패", () => {
    expect(parseProductBlock("그냥 텍스트").ok).toBe(false);
  });

  it("값이 빠져도 실패시키지 않고 안내한다", () => {
    const r = parseProductBlock("##AISOS##\nurl: https://x.com");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("확인해 주세요");
  });

  it("옵션 라벨이 없는 줄은 스펙으로", () => {
    const { options, specs } = parseRawInfo("브랜드: 무명\n사이즈: S, M, L");
    expect(options.map((o) => o.name)).toEqual(["S", "M", "L"]);
    expect(specs).toContainEqual({ key: "브랜드", value: "무명" });
  });
});

// ============================================================
// 실전 회귀 테스트 — 도매꾹 실제 상품(63994067)에서 확장이 만든 블록.
// 확장 추출 로직이 깨지면 여기서 먼저 잡힌다.
// ============================================================
const domeggookBlock = `##AISOS##
name: 우산 양산 양우산 고리형 (인쇄가능) 3단자동우산 우양산 골프우산 자외선차단 UV차단 방수 자동 암막 우산
price: 5500
shipping: 2800
supplier: 도매꾹 · 크리어유통
url: https://www.domeggook.com/63994067
images: https://ai.esmplus.com/yung7788/1-31.jpg
raw:
옵션: 고리형우산케이스5장단위판매(개당600원) (-2,500원), 고리형우산(G1화이트), 고리형우산(G2핑크), 고리형우산(G3스카이), 고리형우산(G4네이비), 고리형우산(G5그린), 고리형우산(G6와인), 고리형우산(G7그레이), 고리형우산(G8블랙)
원산지: 수입산_아시아_중국
모델명: 고리형UV우산
도매처 재고: 410,261개
policy:
반품/교환정보 반품비용 반품배송비 : 4,000원 (구매자 단순 변심으로 인한 반품에만 반품비용 부과) 교환 비용은 보통 반품배송비의 2배 부과되나, 경우에 따라 다를 수 있으므로 공급사에 문의바랍니다.`;

describe("도매꾹 실제 상품 — 확장 수집 결과", () => {
  const r = parseProductBlock(domeggookBlock);

  it("공급가·배송비를 가져온다", () => {
    expect(r.supplyPriceKrw).toBe(5500);
    expect(r.shippingKrw).toBe(2800);
  });

  it("옵션 9개를 전부 가져온다", () => {
    expect(r.options).toHaveLength(9);
    expect(r.options.map((o) => o.name)).toContain("고리형우산(G8블랙)");
  });

  it("옵션 추가금(음수)을 정확히 읽는다", () => {
    const kit = r.options.find((o) => o.name.startsWith("고리형우산케이스"))!;
    expect(kit.addPriceKrw).toBe(-2500);
  });

  it("옵션에 개별 공급가가 없으면 상품 공급가로 채운다", () => {
    r.options.forEach((o) => expect(o.supplyPriceKrw).toBe(5500));
  });

  it("스펙을 저장한다", () => {
    expect(r.specs).toContainEqual({ key: "모델명", value: "고리형UV우산" });
    expect(r.specs).toContainEqual({ key: "원산지", value: "수입산_아시아_중국" });
  });

  it("반품 배송비 4,000원을 읽어 확인 항목에서 제외한다", () => {
    expect(r.returnPolicy?.returnFeeKrw).toBe(4000);
    expect(r.missing).not.toContain("반품 배송비");
  });

  it("빠진 것이 없으면 전부 가져왔다고 알린다", () => {
    expect(r.missing).toHaveLength(0);
    expect(r.message).toContain("전부 가져왔습니다");
  });

  it("옵션이 많아 줄이 길어도 잘리지 않는다", () => {
    const many = Array.from({ length: 30 }, (_, i) => `색상${i + 1}번옵션`).join(", ");
    const { options } = parseRawInfo(`색상: ${many}`);
    expect(options).toHaveLength(30);
  });

  it("추가금의 천 단위 콤마를 옵션 구분자로 오인하지 않는다", () => {
    const { options } = parseRawInfo("옵션: 기본, 대형 (+12,000원), 특대 (+1,500원)");
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.addPriceKrw)).toEqual([0, 12000, 1500]);
  });
});

// ============================================================
// 옵션별 공급가 — 도매처가 옵션마다 다르게 파는 경우
// ★ 도매꾹의 옵션 금액 차이는 "판매가 추가금"이 아니라 "공급가 차이"다.
//   이걸 판매가로 잘못 넣으면 멀쩡한 옵션이 역마진으로 계산된다.
// ============================================================
describe("옵션별 공급가 [대괄호] 표기", () => {
  it("대괄호를 공급가로 읽는다", () => {
    const o = parseOptionToken("케이스5장 [3000]")!;
    expect(o.name).toBe("케이스5장");
    expect(o.supplyPriceKrw).toBe(3000);
    expect(o.addPriceKrw).toBe(0);
  });

  it("공급가와 판매가 추가금을 함께 읽는다", () => {
    const o = parseOptionToken("대형 (+2,000원) [7500]")!;
    expect(o.name).toBe("대형");
    expect(o.addPriceKrw).toBe(2000);
    expect(o.supplyPriceKrw).toBe(7500);
  });

  it("옵션마다 다른 공급가가 그대로 들어간다", () => {
    const { options } = parseRawInfo("옵션: 화이트 [5500], 블랙 [5500], 케이스5장 [3000]");
    expect(options.map((o) => o.supplyPriceKrw)).toEqual([5500, 5500, 3000]);
    expect(options.every((o) => o.addPriceKrw === 0)).toBe(true);
  });

  it("공급가가 없는 옵션만 상품 공급가로 채운다", () => {
    const r = parseProductBlock(
      "##AISOS##\nname: 우산\nprice: 5500\nshipping: 2800\nraw:\n옵션: 화이트 [5500], 케이스 [3000], 이름만"
    );
    expect(r.options.map((o) => o.supplyPriceKrw)).toEqual([5500, 3000, 5500]);
  });
});

describe("도매처 안내 문구가 옵션으로 새는 것", () => {
  it("'상세정보 별도표기'는 옵션이 아니다 — 고객에게 그대로 나간다", () => {
    const r = parseRawInfo("색상: 아이보리, 상세정보 별도표기");
    expect(r.options.map((o) => o.name)).toEqual(["아이보리"]);
  });

  it("'상세페이지 참조' 같은 것도 뺀다", () => {
    const r = parseRawInfo("옵션: 블랙, 상세페이지 참조, 해당없음");
    expect(r.options.map((o) => o.name)).toEqual(["블랙"]);
  });

  it("이미 저장된 상품도 같은 기준으로 검사할 수 있다", () => {
    expect(isJunkOptionName("상세정보 별도표기")).toBe(true);
    expect(isJunkOptionName("아이보리")).toBe(false);
  });
});
