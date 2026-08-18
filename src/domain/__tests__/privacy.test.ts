import { describe, it, expect } from "vitest";
import {
  maskName, maskPhone, maskAddress, isPurgeDue, daysUntilPurge,
  sanitizeForLog, containsPersonalData, shippingCopyText,
} from "../privacy";
import type { ShippingInfo } from "../orders";

const DAY = 24 * 60 * 60 * 1000;

// 가짜 데이터 — 실제 개인정보 아님
const info: ShippingInfo = {
  orderId: "o1",
  recipientName: "테스트고객",
  phone: "010-0000-0001",
  address: "서울특별시 강남구 테스트로 000",
  savedAt: 0,
};

describe("마스킹", () => {
  it("이름 가운데를 가린다", () => {
    expect(maskName("홍길동")).toBe("홍*동");
    expect(maskName("남궁민수")).toBe("남**수");
  });

  it("두 글자 이름", () => {
    expect(maskName("김철")).toBe("김*");
  });

  it("한 글자는 그대로", () => {
    expect(maskName("김")).toBe("김");
  });

  it("전화번호 가운데를 가린다", () => {
    expect(maskPhone("010-1234-5678")).toBe("010-****-5678");
    expect(maskPhone("01012345678")).toBe("010-****-5678");
  });

  it("주소는 시군구까지만 남긴다", () => {
    expect(maskAddress("서울특별시 강남구 역삼동 123-45")).toBe("서울특별시 강남구 ***");
  });

  it("마스킹 결과에 원본 뒷부분이 남지 않는다", () => {
    expect(maskAddress(info.address)).not.toContain("000");
    expect(maskName(info.recipientName)).not.toBe(info.recipientName);
  });
});

describe("복사용 원본", () => {
  it("복사 텍스트에는 원본이 들어간다", () => {
    const t = shippingCopyText(info);
    expect(t).toContain(info.recipientName);
    expect(t).toContain(info.phone);
    expect(t).toContain(info.address);
  });
});

describe("보존기간 파기", () => {
  const now = 100 * DAY;

  it("배송완료 전에는 파기 대상이 아니다", () => {
    expect(isPurgeDue(undefined, now, 90)).toBe(false);
  });

  it("보존기간이 지나면 파기 대상", () => {
    expect(isPurgeDue(now - 91 * DAY, now, 90)).toBe(true);
  });

  it("보존기간 이내면 유지", () => {
    expect(isPurgeDue(now - 10 * DAY, now, 90)).toBe(false);
  });

  it("보존기간은 설정값으로 바뀐다 (하드코딩 아님)", () => {
    const delivered = now - 40 * DAY;
    expect(isPurgeDue(delivered, now, 90)).toBe(false);
    expect(isPurgeDue(delivered, now, 30)).toBe(true);
  });

  it("남은 일수를 계산한다", () => {
    expect(daysUntilPurge(now - 80 * DAY, now, 90)).toBe(10);
    expect(daysUntilPurge(now - 95 * DAY, now, 90)).toBe(0);
  });
});

describe("로그 정화 — 개인정보가 로그에 남으면 안 된다", () => {
  it("전화번호를 제거한다", () => {
    const out = sanitizeForLog("주문 처리 010-1234-5678 완료");
    expect(out).not.toContain("1234");
    expect(out).toContain("[전화번호]");
  });

  it("주소를 제거한다", () => {
    const out = sanitizeForLog("배송지 서울특별시 강남구 역삼동 123-45 입력");
    expect(out).toContain("[주소]");
    expect(out).not.toContain("역삼동");
  });

  it("주문번호만 있는 로그는 그대로 둔다", () => {
    const msg = "주문 2026081712345 배송정보 입력 완료";
    expect(sanitizeForLog(msg)).toBe(msg);
  });

  it("정화 후에는 개인정보가 검출되지 않는다", () => {
    const dirty = `${info.recipientName} / ${info.phone} / ${info.address}`;
    expect(containsPersonalData(sanitizeForLog(dirty))).toBe(false);
  });
});
