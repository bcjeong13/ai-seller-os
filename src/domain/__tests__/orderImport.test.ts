import { describe, it, expect } from "vitest";
import { parseOrders, inferMapping, splitDuplicates, dedupeKey } from "../orderImport";

// 탭 구분 (엑셀 복사 형태)
const tabbed = [
  "주문번호\t상품명\t옵션\t수량\t판매가\t할인금액\t결제금액\t배송비\t수취인\t연락처\t주소",
  "2026081712345\t차량용 거치대\t블랙\t2\t12900\t0\t12900\t0\t테스트고객A\t010-0000-0001\t서울특별시 강남구 테스트로 000",
  "2026081712346\t캠핑 미니테이블\t대형\t1\t17900\t1000\t16900\t3000\t테스트고객B\t010-0000-0002\t경기도 성남시 예시대로 000",
].join("\n");

// 쉼표 구분 + 컬럼 순서가 다름
const csv = [
  "상품주문번호,수취인명,상품 이름,선택옵션,주문수량,총결제금액",
  '"A-001","테스트고객C","실리콘 집게","3종세트",1,8900',
].join("\n");

describe("주문 붙여넣기 파서", () => {
  it("탭 구분 데이터를 인식한다", () => {
    const r = parseOrders(tabbed);
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].marketOrderNo).toBe("2026081712345");
    expect(r.rows[0].productName).toBe("차량용 거치대");
    expect(r.rows[0].optionName).toBe("블랙");
    expect(r.rows[0].quantity).toBe(2);
  });

  it("금액을 숫자로 변환한다", () => {
    const r = parseOrders(tabbed);
    expect(r.rows[1].listPriceKrw).toBe(17900);
    expect(r.rows[1].discountKrw).toBe(1000);
    expect(r.rows[1].buyerPaidKrw).toBe(16900);
    expect(r.rows[1].buyerShippingKrw).toBe(3000);
  });

  it("배송정보를 분리해서 담는다", () => {
    const r = parseOrders(tabbed);
    expect(r.rows[0].recipientName).toBe("테스트고객A");
    expect(r.rows[0].phone).toBe("010-0000-0001");
    expect(r.rows[0].address).toContain("강남구");
  });

  it("컬럼 이름과 순서가 달라도 인식한다", () => {
    const r = parseOrders(csv);
    expect(r.ok).toBe(true);
    expect(r.rows[0].marketOrderNo).toBe("A-001");
    expect(r.rows[0].productName).toBe("실리콘 집게");
    expect(r.rows[0].buyerPaidKrw).toBe(8900);
  });

  it("결제금액 컬럼이 없으면 판매가 − 할인으로 보정한다", () => {
    const t = [
      "주문번호\t상품명\t수량\t판매가\t할인금액",
      "X-1\t테스트\t1\t10000\t1500",
    ].join("\n");
    const r = parseOrders(t);
    expect(r.rows[0].buyerPaidKrw).toBe(8500);
  });

  it("필수 항목이 없으면 실패하고 무엇이 없는지 알려준다", () => {
    const r = parseOrders("이름\t주소\n홍길동\t서울");
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("marketOrderNo");
    expect(r.message).toContain("주문번호");
  });

  it("빈 입력은 실패", () => {
    expect(parseOrders("").ok).toBe(false);
    expect(parseOrders("헤더만있음").ok).toBe(false);
  });

  it("사용자가 컬럼 매핑을 직접 지정할 수 있다", () => {
    const t = "A\tB\tC\n주문1\t상품X\t3";
    const r = parseOrders(t, { marketOrderNo: 0, productName: 1, quantity: 2 });
    expect(r.ok).toBe(true);
    expect(r.rows[0].productName).toBe("상품X");
    expect(r.rows[0].quantity).toBe(3);
  });

  it("헤더에서 필드를 추론한다", () => {
    const m = inferMapping(["주문번호", "상품명", "수량"]);
    expect(m.marketOrderNo).toBe(0);
    expect(m.productName).toBe(1);
    expect(m.quantity).toBe(2);
  });
});

describe("중복 주문 방지 — 두 번 발주하면 돈이 두 번 나간다", () => {
  it("이미 있는 주문은 걸러낸다", () => {
    const r = parseOrders(tabbed);
    const existing = new Set([dedupeKey("2026081712345", "블랙")]);
    const { fresh, duplicates } = splitDuplicates(r.rows, existing);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].marketOrderNo).toBe("2026081712345");
  });

  it("같은 붙여넣기 안의 중복도 걸러낸다", () => {
    const r = parseOrders(tabbed + "\n" + tabbed.split("\n")[1]);
    const { fresh, duplicates } = splitDuplicates(r.rows, new Set());
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(1);
  });

  it("주문번호가 같아도 옵션이 다르면 별개 주문", () => {
    const existing = new Set([dedupeKey("A-1", "블랙")]);
    const rows = [
      { marketOrderNo: "A-1", optionName: "화이트" },
    ] as never as Parameters<typeof splitDuplicates>[0];
    const { fresh } = splitDuplicates(rows, existing);
    expect(fresh).toHaveLength(1);
  });
});
