import { describe, it, expect } from "vitest";
import { noticeKindOf, judgeNotice, noticeFields, noticeRows } from "../notice";
import type { ProductSpec } from "../types";

const specs = (o: Record<string, string>): ProductSpec[] =>
  Object.entries(o).map(([key, value]) => ({ key, value }));

describe("고시 분류", () => {
  it("전기용품을 알아본다", () => {
    expect(noticeKindOf("무선 고속 충전기 20W")).toBe("ELECTRIC");
  });

  it("가방을 알아본다", () => {
    expect(noticeKindOf("핸즈프리 크로스백")).toBe("BAG");
  });

  it("모르면 기타 재화로 둔다 — 억지로 분류하지 않는다", () => {
    expect(noticeKindOf("정체불명의 무언가")).toBe("GENERAL");
  });

  it("규제가 무거운 쪽이 먼저 잡힌다", () => {
    // '유아 물티슈'는 유아용품으로 봐야 한다
    expect(noticeKindOf("유아 물티슈")).toBe("KIDS");
  });
});

describe("필수 항목", () => {
  it("어떤 분류든 제조사·제조국·A/S·품질보증을 묻는다", () => {
    const keys = noticeFields("GENERAL").map((f) => f.key);
    expect(keys).toContain("maker");
    expect(keys).toContain("origin");
    expect(keys).toContain("asPhone");
    expect(keys).toContain("warranty");
  });

  it("전기용품은 KC 인증번호를 더 묻는다", () => {
    expect(noticeFields("ELECTRIC").map((f) => f.key)).toContain("kcNo");
  });

  it("★ A/S 연락처는 자동으로 채우지 않는다 — 도매처 번호를 쓰면 안 된다", () => {
    const f = noticeFields("GENERAL").find((x) => x.key === "asPhone");
    expect(f?.manual).toBe(true);
  });
});

describe("도매처 스펙으로 채우기", () => {
  it("스펙에 있는 것은 자동으로 채운다", () => {
    const st = judgeNotice("스테인리스 텀블러", specs({ 재질: "스테인리스", 제조국: "중국", 용량: "500ml" }));
    const filled = st.slots.filter((s) => s.source === "spec").map((s) => s.field.key);
    expect(filled).toContain("origin");
    expect(filled).toContain("material");
  });

  it("직접 입력한 값이 스펙보다 우선한다", () => {
    const st = judgeNotice("텀블러", specs({ 제조국: "중국" }), { origin: "대한민국" });
    const origin = st.slots.find((s) => s.field.key === "origin");
    expect(origin?.value).toBe("대한민국");
    expect(origin?.source).toBe("manual");
  });

  it("★ 도매처에 없는 것이 많으면 등록이 막힐 수 있다고 본다", () => {
    const st = judgeNotice("무선 충전기", specs({ 재질: "ABS" }));
    expect(st.level).toBe("BLOCKED");
    expect(st.missing).toContain("A/S 책임자·연락처");
  });

  it("다 채우면 준비됨", () => {
    const st = judgeNotice(
      "수납함",
      specs({ 제조사: "○○", 제조국: "중국", 재질: "폴리에스터", 크기: "30cm", 구성품: "본체 1개" }),
      { asPhone: "010-0000-0000", warranty: "소비자분쟁해결기준에 따름" }
    );
    expect(st.level).toBe("READY");
    expect(st.missing).toEqual([]);
  });

  it("상세페이지 표에는 채워진 것만 넣는다", () => {
    const st = judgeNotice("수납함", specs({ 제조국: "중국" }));
    expect(noticeRows(st).every((r) => r.value)).toBe(true);
    expect(noticeRows(st).length).toBeLessThan(st.total);
  });

  it("점수를 만들지 않는다 — 3단계만", () => {
    const st = judgeNotice("수납함", []);
    expect(["READY", "PARTIAL", "BLOCKED"]).toContain(st.level);
    expect(st).not.toHaveProperty("score");
  });
});
