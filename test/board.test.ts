

import assert from "node:assert";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { Board } from "../src/board.js";

type Spot = "none" | "down" | `up ${string}` | `my ${string}`;

/* -------- helpers with strict guards (no undefined) -------- */

function parseState(state: string) {
  const lines = state.trimEnd().split(/\r?\n/);
  if (lines.length < 1) throw new Error("empty snapshot");
  const header = String(lines[0]);
  const m = header.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error("bad header ROWxCOL");
  const rows = Number(m[1] as string);
  const cols = Number(m[2] as string);

  if (lines.length !== 1 + rows * cols) {
    throw new Error("wrong number of SPOT lines");
  }

  const at = (r: number, c: number): Spot => {
    if (!(r >= 0 && r < rows && c >= 0 && c < cols)) throw new Error("OOB");
    const idx = 1 + r * cols + c;
    const v = lines[idx];
    if (v === undefined) throw new Error("missing SPOT");
    return v as Spot;
  };

  return { rows, cols, at, all: lines.slice(1) as Spot[] };
}

async function loadGridFromFile(rel: string): Promise<string[][]> {
  const txt = await fsp.readFile(path.resolve(rel), "utf8");
  const lines = txt.trimEnd().split(/\r?\n/);
  if (lines.length < 1) throw new Error("empty board file");
  const hdr = String(lines[0]);
  const m = hdr.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error("invalid dimension line");
  const rows = Number(m[1] as string);
  const cols = Number(m[2] as string);
  const cards = lines.slice(1);
  if (cards.length !== rows * cols) throw new Error("wrong number of cards");
  const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(""));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cards[r * cols + c];
      if (v === undefined) throw new Error("missing card");
      const row = grid[r];
      if (!row) throw new Error("malformed grid row");
      row[c] = v;
    }
  }
  return grid;
}

function findMatchingPair(grid: string[][]): [[number, number], [number, number]] {
  const firstRow = grid[0];
  if (grid.length === 0 || !firstRow || firstRow.length === 0) throw new Error("empty grid");
  const cols = firstRow.length;
  const seen = new Map<string, [number, number]>();
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) throw new Error("malformed grid row");
    for (let c = 0; c < cols; c++) {
      const v = row[c];
      if (v === undefined) throw new Error("malformed grid cell");
      const prev = seen.get(v);
      if (prev) {
        const isPrevZero = prev[0] === 0 && prev[1] === 0;
        const isCurrZero = r === 0 && c === 0;
        if (!isPrevZero && !isCurrZero) return [prev, [r, c]];
        // otherwise keep searching for a pair not involving (0,0)
      }
      seen.set(v, [r, c]);
    }
  }
  throw new Error("no pair found");
}

function findNonMatchingPair(grid: string[][]): [[number, number], [number, number]] {
  const firstRow = grid[0];
  if (grid.length === 0 || !firstRow || firstRow.length === 0) throw new Error("empty grid");
  const cols = firstRow.length;
  const base: [number, number] = [0, 0];
  const baseValMaybe = firstRow[0];
  if (baseValMaybe === undefined) throw new Error("malformed grid cell");
  const baseVal: string = baseValMaybe;
  // Exclude (0,0) and (0,1) to avoid interfering with test's cleanup/release coordinates
  const excluded = (r: number, c: number) => r === 0 && (c === 0 || c === 1);
  let firstPos: [number, number] | undefined;
  let firstVal: string | undefined;
  outer: for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) throw new Error("malformed grid row");
    for (let c = 0; c < cols; c++) {
      if (excluded(r, c)) continue;
      const v = row[c];
      if (v === undefined) throw new Error("malformed grid cell");
      firstPos = [r, c];
      firstVal = v;
      break outer;
    }
  }
  if (!firstPos || firstVal === undefined) throw new Error("no candidates for first non-matching base");
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) throw new Error("malformed grid row");
    for (let c = 0; c < cols; c++) {
      if (excluded(r, c)) continue;
      if (r === firstPos[0] && c === firstPos[1]) continue;
      const v = row[c];
      if (v === undefined) throw new Error("malformed grid cell");
      if (v !== firstVal) return [firstPos, [r, c]];
    }
  }
  throw new Error("no non-matching pair found");
}

/* =============================== PROBLEM 1 =============================== */

describe("Board — P1 parse + render", () => {
  it("parses perfect.txt and renders all down", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    const s = parseState(b.snapshot("alice"));
    for (const spot of s.all) assert.equal(spot, "down");
  });

  it("toString has Board(RxC)", async () => {
    const b1 = await Board.parseFromFile("boards/perfect.txt");
    assert.equal(b1.toString(), "Board(3x3)");
    const b2 = await Board.parseFromFile("boards/ab.txt");
    assert.equal(b2.toString(), "Board(5x5)");
  });

  it("ab.txt dimensions & count", async () => {
    const b = await Board.parseFromFile("boards/ab.txt");
    const s = parseState(b.snapshot("p"));
    assert.equal(s.rows, 5);
    assert.equal(s.cols, 5);
    assert.equal(s.all.length, 25);
  });

  it("rejects malformed files", async () => {
    const f1 = path.resolve("test-empty.txt");
    await fsp.writeFile(f1, "");
    await assert.rejects(() => Board.parseFromFile(f1));
    await fsp.unlink(f1);

    const f2 = path.resolve("test-baddims.txt");
    await fsp.writeFile(f2, "oops\nA\nB\n");
    await assert.rejects(() => Board.parseFromFile(f2));
    await fsp.unlink(f2);

    const f3 = path.resolve("test-badcount.txt");
    await fsp.writeFile(f3, "2x2\nA\nB\n");
    await assert.rejects(() => Board.parseFromFile(f3));
    await fsp.unlink(f3);
  });
});

/* =============================== PROBLEM 2 =============================== */

describe("Board — P2 gameplay (single-client rules)", () => {
  it("first flip is 'my' to self and 'up' to others", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    b.flipFirst({ r: 0, c: 0 }, "alice");
    const a = parseState(b.snapshot("alice"));
    const bb = parseState(b.snapshot("bob"));
    assert.match(a.at(0, 0), /^my \S+/);
    assert.match(bb.at(0, 0), /^up \S+/);
    for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) {
      if (r === 0 && c === 0) continue;
      assert.equal(a.at(r, c), "down");
      assert.equal(bb.at(r, c), "down");
    }
  });

  it("invalid coordinates rejected", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    assert.throws(() => b.flipFirst({ r: -1, c: 0 }, "alice"));
    assert.throws(() => b.flipFirst({ r: 0, c: 999 }, "alice"));
  });

  it("cannot flip the same controlled card twice (own first as second)", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    b.flipFirst({ r: 0, c: 0 }, "alice");
    assert.throws(() => b.flipSecond({ r: 0, c: 0 }, "alice"));
  });

  it("second card fails immediately if controlled by another player (2-B)", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    b.flipFirst({ r: 0, c: 0 }, "alice"); // alice controls (0,0)
    b.flipFirst({ r: 0, c: 1 }, "bob");   // bob's first elsewhere
    assert.throws(() => b.flipSecond({ r: 0, c: 0 }, "bob"));
  });

  it("non-matching pair turns down on next first (3-B)", async () => {
    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[r1, c1], [r2, c2]] = findNonMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");

    b.flipFirst({ r: r1, c: c1 }, "alice");
    b.flipSecond({ r: r2, c: c2 }, "alice"); // mismatch

    let s = parseState(b.snapshot("alice"));
    assert.notEqual(s.at(r1, c1), "down");
    assert.notEqual(s.at(r2, c2), "down");

    b.flipFirst({ r: 0, c: 0 }, "alice"); // next first → cleanup
    s = parseState(b.snapshot("alice"));
    assert.equal(s.at(r1, c1), "down");
    assert.equal(s.at(r2, c2), "down");
  });

  it("matching pair removed on next first (3-A)", async () => {
    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[ra, ca], [rb, cb]] = findMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");

    b.flipFirst({ r: ra, c: ca }, "alice");
    b.flipSecond({ r: rb, c: cb }, "alice");
    let s = parseState(b.snapshot("alice"));
    assert.match(s.at(ra, ca), /^my \S+/);
    assert.match(s.at(rb, cb), /^my \S+/);

    b.flipFirst({ r: 0, c: 0 }, "alice"); // removal
    s = parseState(b.snapshot("alice"));
    assert.equal(s.at(ra, ca), "none");
    assert.equal(s.at(rb, cb), "none");
  });
});

/* =============================== PROBLEM 3 =============================== */

describe("Board — P3 concurrency & waiting", () => {
  const T = 5000;

  it("waiter acquires after 2-E release (1-D wait + 3-B)", async function () {
    this.timeout(T);

    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[r1, c1], [r2, c2]] = findNonMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");

    await b.flipFirstAsync({ r: r1, c: c1 }, "alice");          // holds first
    const bobWait = b.flipFirstAsync({ r: r1, c: c1 }, "bob");   // waits

    await b.flipSecondAsync({ r: r2, c: c2 }, "alice");          // mismatch 2-E
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice");             // new first → 3-B release

    await bobWait;
    const s = parseState(b.snapshot("bob"));
    assert.match(s.at(r1, c1), /^my \S+/);
  });

  it("waiter gets failure after 3-A removal of matched pair", async function () {
    this.timeout(T);

    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[ra, ca], [rb, cb]] = findMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");

    await b.flipFirstAsync({ r: ra, c: ca }, "alice");
    await b.flipSecondAsync({ r: rb, c: cb }, "alice");          // matched, not removed yet

    const bobWait = b.flipFirstAsync({ r: ra, c: ca }, "bob");   // waits on card
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice");             // triggers 3-A removal

    await assert.rejects(() => bobWait);
  });

  it("FIFO for two waiters as the card is released twice", async function () {
    this.timeout(T);

    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[r1, c1], [r2, c2]] = findNonMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");

    await b.flipFirstAsync({ r: r1, c: c1 }, "alice");

    const order: string[] = [];
    const bob = b.flipFirstAsync({ r: r1, c: c1 }, "bob").then(() => order.push("bob"));
    const charlie = b.flipFirstAsync({ r: r1, c: c1 }, "charlie").then(() => order.push("charlie"));

    await b.flipSecondAsync({ r: r2, c: c2 }, "alice"); // mismatch
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice");    // release → Bob acquires
    await bob;

    await b.flipSecondAsync({ r: r2, c: c2 }, "bob");   // mismatch
    await b.flipFirstAsync({ r: 0, c: 1 }, "bob");      // release → Charlie acquires
    await charlie;

    assert.deepEqual(order, ["bob", "charlie"]);
  });

  it("second card never waits (2-B): immediate rejection when controlled", async function () {
    this.timeout(T);

    const b = await Board.parseFromFile("boards/perfect.txt");
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice"); // controlled by Alice
    await b.flipFirstAsync({ r: 1, c: 1 }, "bob");   // Bob's first elsewhere

    const t0 = Date.now();
    await assert.rejects(() => b.flipSecondAsync({ r: 0, c: 0 }, "bob"));
    assert.ok(Date.now() - t0 < 250, "must fail quickly, not wait");
  });

  it("sequential different players: both flips visible as 'up' to the other", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    b.flipFirst({ r: 0, c: 0 }, "alice");
    b.flipFirst({ r: 1, c: 0 }, "bob");
    const a = parseState(b.snapshot("alice"));
    const bb = parseState(b.snapshot("bob"));
    assert.ok(a.all.some(s => /^up /.test(s)));
    assert.ok(bb.all.some(s => /^up /.test(s)));
  });
});

/* =============================== PROBLEM 4 =============================== */

/** call board.map if present, else board.mapCards(player, f) */
async function applyMap(b: Board, f: (card: string)=>Promise<string>, player = "tester") {
  const anyB = b as any;
  if (typeof anyB.map === "function") return anyB.map(f);
  if (typeof anyB.mapCards === "function") return anyB.mapCards(player, f);
  throw new Error("Board has no map()/mapCards()");
}

describe("Board map()", () => {
  it("transforms all cards (async) without throwing", async () => {
    const b = await Board.parseFromFile("boards/ab.txt");
    const f = async (card: string) => card.toUpperCase();
    await applyMap(b, f);
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice");
    const s = parseState(b.snapshot("alice"));
    assert.match(s.all.find(x => x.startsWith("my ")) ?? "", /^my [A-Z]/);
  });

  it("maintains pairwise consistency (no transient mismatch)", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    const f = async (card: string) => "T_" + card;
    // Start map, but while it runs, we also flip two matching cards
    const p = applyMap(b, f, "alice");
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice");
    await b.flipSecondAsync({ r: 0, c: 1 }, "alice"); // these two match in perfect.txt
    await p;

    // After map: both occurrences must still match with same prefix
    const s = parseState(b.snapshot("alice"));
    const v1 = s.at(0, 0); const v2 = s.at(0, 1);
    assert.ok(/^my T_/.test(v1) || /^up T_/.test(v1));
    assert.ok(/^my T_/.test(v2) || /^up T_/.test(v2));
  });

  it("does not affect face-up/down or control state", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice"); // alice controls (0,0)
    const before = parseState(b.snapshot("alice")).at(0, 0); // "my X"

    const f = async (card: string) => "M_" + card;
    await applyMap(b, f);

    const afterAlice = parseState(b.snapshot("alice")).at(0, 0);
    const afterBob   = parseState(b.snapshot("bob")).at(0, 0);
    assert.ok(/^my M_/.test(afterAlice), "alice must still control face-up");
    assert.ok(/^up M_/.test(afterBob),   "bob must still see it face-up");
  });

  it("allows interleaving: map doesn't block flips", async function () {
    this.timeout(5000);
    const b = await Board.parseFromFile("boards/perfect.txt");

    const slow = async (card: string) => {
      await new Promise(res => setTimeout(res, 50));
      return "S_" + card;
    };
    const mapP = applyMap(b, slow);

    // While map is running, a flip must still succeed
    await b.flipFirstAsync({ r: 1, c: 1 }, "bob");
    const s = parseState(b.snapshot("bob"));
    assert.match(s.at(1, 1), /^(my|up) /);

    await mapP;
  });

  it("rejects invalid transformed card", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    const bad = async (_: string) => "invalid card with spaces";
    await assert.rejects(() => applyMap(b, bad), /invalid transformed card/);
  });

  it("handles concurrent map() calls", async function () {
    this.timeout(5000);
    const b = await Board.parseFromFile("boards/ab.txt");

    const f1 = async (c: string) => { await new Promise(r => setTimeout(r, 10)); return "X_" + c; };
    const f2 = async (c: string) => { await new Promise(r => setTimeout(r, 10)); return "Y_" + c; };

    await Promise.all([applyMap(b, f1), applyMap(b, f2)]);

    await b.flipFirstAsync({ r: 0, c: 0 }, "z");
    const s = parseState(b.snapshot("z"));
    // At least one prefix should be present after the two maps
    const val = s.all.find(x => x.startsWith("my ") || x.startsWith("up ")) ?? "";
    assert.ok(/ (X_|Y_)/.test(val), "should have been transformed by at least one map");
  });

  it("emoji example: 🌈🦄 → ☀️🍭", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    const f = async (c: string) => c === "🌈" ? "☀️" : (c === "🦄" ? "🍭" : c);
    await applyMap(b, f);
    await b.flipFirstAsync({ r: 0, c: 0 }, "alice");
    const s = parseState(b.snapshot("alice")).all.join("\n");
    assert.ok(s.includes("☀️") || s.includes("🍭"));
  });
});

/* =============================== PROBLEM 5 =============================== */

describe("Board — P5 watch() notifications", () => {
  it("watch resolves after first flip (1-B)", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    const p = b.watch("alice");
    b.flipFirst({ r: 0, c: 0 }, "alice");
    const snap = parseState(await p);
    assert.match(snap.at(0, 0), /^my /);
  });

  it("watch ignores 1-C control-only change (no premature resolution)", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    // Create a face-up, uncontrolled card via a mismatch
    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[a1, b1], [a2, b2]] = findNonMatchingPair(grid);
    b.flipFirst({ r: a1, c: b1 }, "alice");
    b.flipSecond({ r: a2, c: b2 }, "alice"); // mismatch → both face-up, controller=null

    const pending = b.watch("bob");
    // 1-C: Bob takes control of one already face-up card (no notify expected)
    b.flipFirst({ r: a1, c: b1 }, "bob");
    // Real change: Alice flips a new first elsewhere (1-B)
    b.flipFirst({ r: 0, c: 0 }, "alice");
    const snap = parseState(await pending);
    assert.match(snap.at(0, 0), /^(my |up )/);
  });

  it("watch sees removal after matched pair cleanup (3-A)", async () => {
    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[r1, c1], [r2, c2]] = findMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");
    b.flipFirst({ r: r1, c: c1 }, "alice");
    b.flipSecond({ r: r2, c: c2 }, "alice"); // matched, not removed yet
    const p = b.watch("alice");
    b.flipFirst({ r: 0, c: 0 }, "alice"); // triggers 3-A removal
    const snap = parseState(await p);
    assert.equal(snap.at(r1, c1), "none");
    assert.equal(snap.at(r2, c2), "none");
  });

  it("watch sees flip-down after mismatched cleanup (3-B)", async () => {
    const grid = await loadGridFromFile("boards/perfect.txt");
    const [[a1, b1], [a2, b2]] = findNonMatchingPair(grid);
    const b = await Board.parseFromFile("boards/perfect.txt");
    b.flipFirst({ r: a1, c: b1 }, "alice");
    b.flipSecond({ r: a2, c: b2 }, "alice"); // mismatch, pending flip-down
    const p = b.watch("alice");
    b.flipFirst({ r: 0, c: 0 }, "alice"); // triggers 3-B flip down
    const snap = parseState(await p);
    assert.equal(snap.at(a1, b1), "down");
    assert.equal(snap.at(a2, b2), "down");
  });

  it("multiple concurrent watchers all resolve on single change", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
    const w1 = b.watch("alice");
    const w2 = b.watch("bob");
    b.flipFirst({ r: 0, c: 0 }, "alice");
    const s1 = parseState(await w1);
    const s2 = parseState(await w2);
    assert.match(s1.at(0, 0), /^my|up /);
    assert.match(s2.at(0, 0), /^my|up /);
  });

  it("mapCards() triggers notify only when labels change", async () => {
    const b = await Board.parseFromFile("boards/perfect.txt");
  // Flip one card so we have a face-up reference (no watch yet)
  b.flipFirst({ r: 0, c: 0 }, "alice");
    const w1 = b.watch("alice");
    await (b as any).mapCards("alice", async (c: string) => "Z_" + c);
    const s1 = parseState(await w1);
    assert.ok(s1.all.some(x => /^my Z_|^up Z_/.test(x)), "labels should have Z_ prefix on a face-up card");

    const w2 = b.watch("alice");
    await (b as any).mapCards("alice", async (c: string) => c); // identity — no notify
    b.flipFirst({ r: 0, c: 1 }, "alice"); // real change triggers watch
    const s2 = parseState(await w2);
    assert.match(s2.at(0, 1), /^my |^up /);
  });
});
