// ============================================================
// 레이더 저장소 — 스냅샷과 심사 기록
//
// ★ 상품 데이터(ai-seller-os-v4)와 분리한다.
//   이건 버려도 되는 데이터다. 용량이 차면 오래된 것부터 버린다.
//   같이 두면 스냅샷 때문에 상품 데이터 저장이 실패한다.
//
// ★ localStorage는 5MB 안팎이다. 매일 300개 × 30일이면 금방 찬다.
//   그래서 저장할 때마다 정리한다. 나중에 붙이면 이미 쌓인 걸 옮겨야 한다.
// ============================================================

import {
  MAX_SNAPSHOT_DAYS, MAX_ITEMS_PER_SNAPSHOT, KEEP_NAMES_DAYS,
  dayKeyOf, type ListSnapshot, type SourcingRun,
} from "../domain/trend";

const KEY = "ai-seller-os-trend-v1";
/** 심사 기록 보관 기간 — 카테고리 성적표에 쓴다 */
const MAX_RUN_DAYS = 90;

interface TrendState {
  snapshots: ListSnapshot[];
  runs: SourcingRun[];
}

const EMPTY: TrendState = { snapshots: [], runs: [] };

function load(): TrendState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const s = JSON.parse(raw) as Partial<TrendState>;
    return { snapshots: s.snapshots ?? [], runs: s.runs ?? [] };
  } catch {
    return { ...EMPTY };
  }
}

let state: TrendState = load();
const listeners = new Set<() => void>();

function save(next: TrendState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 용량이 찼다 — 절반을 버리고 한 번만 다시 시도한다.
    // 레이더 때문에 앱이 멈추면 안 된다.
    const half = Math.ceil(next.snapshots.length / 2);
    state = { ...next, snapshots: next.snapshots.slice(-half) };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 포기한다 */ }
  }
  listeners.forEach((l) => l());
}

export function subscribeTrend(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTrendState(): TrendState {
  return state;
}

// ------------------------------------------------------------
// 정리
// ------------------------------------------------------------

function prune(s: TrendState, now: number): TrendState {
  const cutoff = now - MAX_SNAPSHOT_DAYS * 86400000;
  const nameCutoff = now - KEEP_NAMES_DAYS * 86400000;
  const runCutoff = now - MAX_RUN_DAYS * 86400000;

  const snapshots = s.snapshots
    .filter((x) => x.at >= cutoff)
    .map((x) =>
      // 오래된 스냅샷에서는 이름과 주소를 지운다 — 대조에는 id만 있으면 된다
      x.at >= nameCutoff
        ? x
        : { ...x, items: x.items.map((it) => ({ i: it.i, p: it.p, r: it.r })) }
    );

  return { snapshots, runs: s.runs.filter((r) => r.at >= runCutoff) };
}

// ------------------------------------------------------------
// 스냅샷
// ------------------------------------------------------------

/**
 * 오늘 담은 목록을 저장한다.
 * 같은 날 같은 이름으로 다시 담으면 덮어쓴다 — 하루에 여러 번 눌러도 하루로 친다.
 */
export function saveSnapshot(snap: Omit<ListSnapshot, "day">, now = Date.now()): ListSnapshot {
  const day = dayKeyOf(snap.at);
  const full: ListSnapshot = {
    ...snap,
    day,
    items: snap.items.slice(0, MAX_ITEMS_PER_SNAPSHOT),
  };

  const rest = state.snapshots.filter((x) => !(x.day === day && x.label === full.label));
  save(prune({ ...state, snapshots: [...rest, full].sort((a, b) => a.at - b.at) }, now));
  return full;
}

/** 같은 이름의 목록 중 오늘 것을 뺀 가장 최근 스냅샷 */
export function previousSnapshot(label: string, day: string): ListSnapshot | undefined {
  return state.snapshots
    .filter((x) => x.label === label && x.day < day)
    .sort((a, b) => b.at - a.at)[0];
}

export function snapshotsOf(label: string): ListSnapshot[] {
  return state.snapshots.filter((x) => x.label === label).sort((a, b) => a.at - b.at);
}

/** 이 목록을 며칠 담았는가 */
export function daysCollected(label: string): number {
  return new Set(snapshotsOf(label).map((x) => x.day)).size;
}

/** 담아온 목록 이름들 — 많이 담은 순 */
export function collectedLabels(): { label: string; days: number; lastAt: number }[] {
  const by = new Map<string, ListSnapshot[]>();
  for (const s of state.snapshots) by.set(s.label, [...(by.get(s.label) ?? []), s]);
  return [...by.entries()]
    .map(([label, list]) => ({
      label,
      days: new Set(list.map((x) => x.day)).size,
      lastAt: Math.max(...list.map((x) => x.at)),
    }))
    .sort((a, b) => b.days - a.days || b.lastAt - a.lastAt);
}

/**
 * 상품마다 처음 본 시각과 관찰 일수 — "며칠 관찰했는가"를 사실로 보여주기 위한 것
 */
export function observationOf(label: string): {
  firstSeen: Map<string, number>;
  days: Map<string, number>;
} {
  const firstSeen = new Map<string, number>();
  const daySet = new Map<string, Set<string>>();

  for (const s of snapshotsOf(label)) {
    for (const it of s.items) {
      if (!firstSeen.has(it.i)) firstSeen.set(it.i, s.at);
      const set = daySet.get(it.i) ?? new Set<string>();
      set.add(s.day);
      daySet.set(it.i, set);
    }
  }

  const days = new Map<string, number>();
  for (const [id, set] of daySet) days.set(id, set.size);
  return { firstSeen, days };
}

// ------------------------------------------------------------
// 심사 기록
// ------------------------------------------------------------

export function recordSourcingRun(run: Omit<SourcingRun, "day">, now = Date.now()) {
  const entry: SourcingRun = { ...run, day: dayKeyOf(run.at) };
  save(prune({ ...state, runs: [...state.runs, entry] }, now));
}

export function getSourcingRuns(): SourcingRun[] {
  return state.runs;
}

// ------------------------------------------------------------
// 전체 지우기 — 설정에서 쓴다
// ------------------------------------------------------------

export function clearTrend() {
  save({ ...EMPTY });
}

/** 대략 몇 KB를 쓰고 있는가 — 사용자에게 보여준다 */
export function trendSizeKb(): number {
  try {
    return Math.round((localStorage.getItem(KEY)?.length ?? 0) / 1024);
  } catch {
    return 0;
  }
}
