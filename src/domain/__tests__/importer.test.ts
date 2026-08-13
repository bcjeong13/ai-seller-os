import { describe, it, expect } from "vitest";
import { parseImportBlock } from "../importer";

const block = `##AISOS##
name: 링 버클 우산 초대형
currency: KRW
price: 21410
shipping: 0
url: https://ko.aliexpress.com/item/123.html
raw:
색상: 블랙, 화이트, 베이지
재질: 금속섬유 복합재
· 강력한 방풍 설계
₩3,723`;

describe("확장 가져오기 파서", () => {
  it("헤더 필드를 파싱", () => {
    const r = parseImportBlock(block);
    expect(r.ok).toBe(true);
    expect(r.name).toBe("링 버클 우산 초대형");
    expect(r.currency).toBe("KRW");
    expect(r.price).toBe(21410);
    expect(r.shipping).toBe(0);
    expect(r.url).toContain("aliexpress");
  });

  it("raw 영역에서 옵션/특징 추출(가격 잡음 제외)", () => {
    const r = parseImportBlock(block);
    expect(r.options).toEqual(["블랙", "화이트", "베이지"]);
    expect(r.features).toContain("재질: 금속섬유 복합재");
    expect(r.features.some((f) => f.includes("3,723"))).toBe(false);
  });

  it("AISOS 마커 없으면 실패", () => {
    expect(parseImportBlock("그냥 텍스트").ok).toBe(false);
  });

  it("잘못된 통화는 CNY로 기본 처리", () => {
    const r = parseImportBlock("##AISOS##\ncurrency: XYZ\nprice: 10");
    expect(r.currency).toBe("CNY");
  });
});
