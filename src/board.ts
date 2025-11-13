// src/board.ts
// Board ADT for Memory Scramble — Problems 1 + 3
// - Problem 1: synchronous rules implemented (already tested)
// - Problem 3: add async waiting semantics for first-card flips (rule 1-D)
//   without removing the existing sync API.
//
// Waiting model:
//   • If a player tries to flip a FIRST card that is face-up and controlled by
//     another player, we WAIT (no busy-wait) until that card becomes available
//     (controller released or card removed). Then we retry once more.
//   • Second-card flips DO NOT wait (per spec 2-B), they fail immediately.
//
// We keep all previous methods; we add flipFirstAsync/flipSecondAsync and a
// minimal per-cell FIFO wait-queue. We also notify the queue whenever control
// is relinquished or a card is removed, so the next waiter wakes up.

import { promises as fs } from "fs";
import * as path from "path";

export type PlayerID = string;
export interface Pos { r: number; c: number; }

interface Slot {
  label: string;               // nonempty, no whitespace/newlines
  faceUp: boolean;
  controller: PlayerID | null; // who controls it, if anyone
}

type PendingOutcome =
  | { kind: "matched", first: Pos, second: Pos }
  | { kind: "mismatched", first: Pos, second: Pos }
  | null;

// Tiny Deferred helper for waiting without busy loops.
class Deferred<T> {
  public readonly promise: Promise<T>;
  public resolve!: (value: T | PromiseLike<T>) => void;
  public reject!: (reason?: unknown) => void;
  public constructor() {
    this.promise = new Promise<T>((res, rej) => { this.resolve = res; this.reject = rej; });
  }
}

/**
 * Mutable Board ADT.
 *
 * AF: rows×cols grid of spaces (`null` = empty) or Slot; firstSelection[p] remembers p's first card;
 *     pending[p] stores work to apply on p’s next first move (3-A/3-B).
 *
 * RI: grid.length == rows; each row length == cols; Slot.label matches /^[^\s\n\r]+$/u;
 *     if faceDown then controller === null; pending positions are in-bounds.
 *
 * SRE: fields are private; only string snapshots are exposed.
 */
export class Board {
  private readonly rows: number;
  private readonly cols: number;
  // never reassigned as a whole; mutated internally
  private readonly grid: (Slot | null)[][];
  private readonly firstSelection: Map<PlayerID, Pos> = new Map();
  private readonly pending: Map<PlayerID, PendingOutcome> = new Map();
  // Optional change notification hook (may be unused). If set, invoked after mutations.
  private readonly _notify?: () => void;

  // Problem 3: per-cell FIFO queues for waiters on first-card control.
  // key = "r,c", value = array of Deferred<void> to wake in order.
  private readonly waitQueues: Map<string, Deferred<void>[]> = new Map();
  // Problem 5 watchers: resolve on next real board change
  private watchers: Deferred<void>[] = [];

  private constructor(rows: number, cols: number, labels: string[]) {
    this.rows = rows;
    this.cols = cols;
    this.grid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const idx = r * cols + c;
        const label = labels[idx];
        if (label === undefined) throw new Error("Internal: missing label");
        return { label, faceUp: false, controller: null };
      })
    );
    this.checkRep();
  }

  /**
   * Parse board file (ROWxCOL header + exactly ROW*COL card lines).
   * @param filename path to board file
   * @returns a new Board
   */
  public static async parseFromFile(filename: string): Promise<Board> {
    const text = await fs.readFile(path.resolve(filename), "utf8");
    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter(l => l.length > 0);

    if (lines.length < 1) throw new Error("Malformed board: missing header");
    const header = lines[0] ?? "";
    const m = /^([0-9]+)x([0-9]+)$/.exec(header);
    if (!m) throw new Error(`Malformed header '${header}', expected ROWxCOL`);

    const rows = parseInt(m[1] ?? "0", 10);
    const cols = parseInt(m[2] ?? "0", 10);
    if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows <= 0 || cols <= 0) {
      throw new Error("Rows/cols must be positive integers");
    }

    const expected = rows * cols;
    const cards = lines.slice(1);
    if (cards.length !== expected) {
      throw new Error(`Malformed board: expected ${expected} card lines, got ${cards.length}`);
    }

    const cardRe = /^[^\s\n\r]+$/u;
    for (const c of cards) {
      if (!cardRe.test(c)) throw new Error(`Invalid card '${c}'`);
    }

    return new Board(rows, cols, cards);
  }

  /** @returns debug string */
  public toString(): string { return `Board(${this.rows}x${this.cols})`; }

  /** @param p player id @returns whether player has a first selection recorded */
  public hasFirstSelection(p: PlayerID): boolean { return this.firstSelection.has(p); }

  /**
   * Apply rules 3-A/3-B for player p before a new first flip.
   * @param p player id
   */
  public settleBeforeNewFirstMove(p: PlayerID): void {
    const outcome = this.pending.get(p) ?? null;
    if (!outcome) return;

    if (outcome.kind === "matched") {
      const a = outcome.first, b = outcome.second;
      this.setCell(a.r, a.c, null);
      this.setCell(b.r, b.c, null);
      // Removing cards may wake waiters who were queued on those cells (they will see 1-A).
      this.wakeNext(a);
      this.wakeNext(b);
      this.notifyChange();
    } else {
      const { first, second } = outcome;
      let flipped = false;
      for (const q of [first, second]) {
        const cell = this.getCell(q.r, q.c);
        if (cell !== null && cell.faceUp && cell.controller === null) {
          cell.faceUp = false;
          flipped = true;
        }
      }
      if (flipped) this.notifyChange();
    }
    this.pending.set(p, null);
    this.checkRep();
  }

  /**
   * First card attempt (1-A..1-D without waiting) — Problem 1 API (kept).
   * @param pos row/col
   * @param by player id
   */
  public flipFirst(pos: Pos, by: PlayerID): void {
    this.settleBeforeNewFirstMove(by);

    const slot = this.slotAt(pos);
    if (slot === null) throw new Error("1-A: empty space");

    if (!slot.faceUp) {
      slot.faceUp = true; slot.controller = by;       // 1-B
      this.notifyChange();
    } else if (slot.controller === null || slot.controller === by) {
      slot.controller = by;                           // 1-C
    } else {
      // Problem 1 behavior: fail (no waiting)
      throw new Error("1-D: card is controlled by another player (no waiting in Problem 1)");
    }
    this.firstSelection.set(by, pos);
    this.checkRep();
  }

  /**
   * Second card attempt (2-A..2-E) — Problem 1 API (kept).
   * @param pos row/col
   * @param by player id
   */
  public flipSecond(pos: Pos, by: PlayerID): void {
    const first = this.firstSelection.get(by);
    if (!first) throw new Error("No first card selected for this player");

    const s2 = this.within(pos) ? this.getCell(pos.r, pos.c) : null;
    if (s2 === null) { this.relinquishFirstOnly(by); throw new Error("2-A: second position is empty"); }
    if (s2.faceUp && s2.controller !== null) {
      this.relinquishFirstOnly(by); throw new Error("2-B: second card is controlled");
    }
    let turnedUp = false;
    if (!s2.faceUp) { s2.faceUp = true; turnedUp = true; }                 // 2-C

    const s1 = this.slotAt(first);
    if (!s1) throw new Error("Internal: first selection missing");

    const matched = s1.label === s2.label;
    if (matched) {
      s1.controller = by; s2.controller = by;         // 2-D
      this.pending.set(by, { kind: "matched", first, second: pos });
    } else {
      s1.controller = null; s2.controller = null;     // 2-E (relinquish immediately)
      // Wake anyone waiting for control on either card.
      this.wakeNext(first);
      this.wakeNext(pos);
      this.pending.set(by, { kind: "mismatched", first, second: pos });
    }

    if (turnedUp) this.notifyChange();
    this.firstSelection.delete(by);
    this.checkRep();
  }

  /**
   * Problem 3 — async version of first-card flip with waiting semantics.
   * Waits (no busy-wait) if the card is face-up and controlled by another player.
   * @param pos row/col
   * @param by player id
   */
  public async flipFirstAsync(pos: Pos, by: PlayerID): Promise<void> {
    this.settleBeforeNewFirstMove(by);

    // try-now -> or wait -> retry once available
    // Loop will run at most a few times because we always await a release event.
    // If the card is removed while waiting, we will throw 1-A on retry.
    // If another player acquires before us, we queue again and await.
    // This is contention, not busy waiting.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const slot = this.slotAt(pos);
      if (slot === null) throw new Error("1-A: empty space");

      if (!slot.faceUp) {
        slot.faceUp = true; slot.controller = by;     // 1-B
        this.notifyChange();
        this.firstSelection.set(by, pos);
        this.checkRep();
        return;
      }
      if (slot.controller === null || slot.controller === by) {
        slot.controller = by;                         // 1-C
        this.firstSelection.set(by, pos);
        this.checkRep();
        return;
      }

      // 1-D: controlled by another → WAIT
      await this.enqueueAndWait(pos);
      // loop back and retry after wake
    }
  }

  /**
   * Problem 3 — async wrapper for second-card flip.
   * Still MUST NOT wait per rule 2-B; simply throws on 2-A/2-B.
   * @param pos row/col
   * @param by player id
   */
  public async flipSecondAsync(pos: Pos, by: PlayerID): Promise<void> {
    this.flipSecond(pos, by);
  }

  /**
   * Snapshot for a player in required grammar.
   * @param forPlayer player id
   * @returns string snapshot
   */
  public snapshot(forPlayer: PlayerID): string {
    const out: string[] = [];
    out.push(`${this.rows}x${this.cols}`);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.getCell(r, c);
        if (cell === null) out.push("none");
        else if (!cell.faceUp) out.push("down");
        else if (cell.controller === forPlayer) out.push(`my ${cell.label}`);
        else out.push(`up ${cell.label}`);
      }
    }
    return out.join("\n") + "\n";
  }

  // ---------- helpers ----------

  private row(r: number): (Slot | null)[] {
    const row = this.grid[r];
    if (row === undefined) throw new Error("RI: row index out of bounds");
    return row;
  }

  private getCell(r: number, c: number): Slot | null {
    const row = this.row(r);
    return (row[c] ?? null);
  }

  private setCell(r: number, c: number, val: Slot | null): void {
    const row = this.row(r);
    if (c < 0 || c >= this.cols) throw new Error("RI: column index out of bounds");
    row[c] = val;
  }

  private within(p: Pos): boolean {
    return p.r >= 0 && p.r < this.rows && p.c >= 0 && p.c < this.cols;
  }

  private slotAt(p: Pos): Slot | null {
    if (!this.within(p)) throw new Error(`Out of bounds (${p.r},${p.c})`);
    return this.getCell(p.r, p.c);
  }

  private relinquishFirstOnly(by: PlayerID): void {
    const first = this.firstSelection.get(by);
    if (!first) return;
    const s1 = this.slotAt(first);
    if (s1 !== null) {
      s1.controller = null; // remain face up
      this.wakeNext(first);
    }
    this.firstSelection.delete(by);
    this.checkRep();
  }

  private checkRep(): void {
    if (this.grid.length !== this.rows) throw new Error("RI: wrong row count");
    for (const row of this.grid) {
      if (row === undefined || row.length !== this.cols) throw new Error("RI: wrong col count");
    }

    const cardRe = /^[^\s\n\r]+$/u;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.getCell(r, c);
        if (cell === null) continue;
        if (!cardRe.test(cell.label)) throw new Error("RI: bad label");
        if (!cell.faceUp && cell.controller !== null) throw new Error("RI: face-down card cannot be controlled");
      }
    }
    for (const [, out] of this.pending) {
      if (!out) continue;
      for (const p of [out.first, out.second]) {
        if (!this.within(p)) throw new Error("RI: pending pos OOB");
      }
    }
  }

  // ----- Problem 3 wait-queue utilities -----

  private key(p: Pos): string { return `${p.r},${p.c}`; }

  // Enqueue and wait until this cell becomes available (control released or removed).
  private enqueueAndWait(p: Pos): Promise<void> {
    const k = this.key(p);
    let q = this.waitQueues.get(k);
    if (q === undefined) {
      q = [];
      this.waitQueues.set(k, q);
    }
    const d = new Deferred<void>();
    q.push(d);
    return d.promise;
  }

  // Wake exactly one waiter (FIFO) when a cell becomes available.
  private wakeNext(p: Pos): void {
    const k = this.key(p);
    const q = this.waitQueues.get(k);
    if (q && q.length > 0) {
      const d = q.shift();
      if (d) d.resolve();
    }
  }

  // ----- Problem 5: watch/notify -----
  public async watch(forPlayer: PlayerID): Promise<string> {
    const d = new Deferred<void>();
    this.watchers.push(d);
    await d.promise; // resolve on next real change
    return this.snapshot(forPlayer);
  }

  private notifyChange(): void {
    if (this.watchers.length === 0) return;
    const waiters = this.watchers;
    this.watchers = [];
    for (const d of waiters) d.resolve();
  }

  /**
   * Problem 4: Change every non-removed card by applying an async transformer.
   * Requirements:
   *  - Independent of face-up/down & control (these remain unchanged).
   *  - Operations may interleave; must never transiently break pairs that matched
   *    at the start of this call (atomic commit per original value).
   *  - The transformer must be a mathematical function; we call it once per
   *    distinct original value and apply the result to all of its occurrences.
   *  - Must reject if the transformed card value is invalid (empty or contains
   *    whitespace), so boards remain renderable & unambiguous.
   *
   * @param transform async function mapping an original card label to a new label
   * @returns resolves when all applicable cards have been updated
   */
  public async map(transform: (card: string) => Promise<string>): Promise<void> {
    // === Snapshot of values and their locations at the start ===
    const rows = this.rows;
    const cols = this.cols;
    const valueAt = (r: number, c: number): string | null => {
      const cell = this.getCell(r, c);
      return cell === null ? null : String(cell.label);
    };

    type P = { r: number; c: number };
    const byValue = new Map<string, P[]>();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = valueAt(r, c);
        if (v === null) continue; // removed
        const list = byValue.get(v) ?? [];
        list.push({ r, c });
        byValue.set(v, list);
      }
    }

    // === Compute transformed values once per distinct original ===
    const entries = [...byValue.entries()];
    const results = await Promise.all(entries.map(async ([orig]) => {
      const out = await transform(orig);
      // Validate transformed card (no empty & no whitespace)
      if (typeof out !== "string" || out.length === 0 || out.trim() !== out || /\s/.test(out)) {
        throw new Error("invalid transformed card");
      }
      return [orig, out] as const;
    }));

    const mapping = new Map<string, string>(results);

    // === Commit per-orig-value atomically so pairs never go out of sync ===
    for (const [orig, positions] of entries) {
      const newVal = mapping.get(orig);
      if (newVal === undefined) continue; // should not happen
      for (const { r, c } of positions) {
        // If cell was removed in the meantime, skip; interleaving allowed.
        const cell = this.getCell(r, c);
        if (cell === null) continue;
        cell.label = newVal;
      }
    }

    // Optional notify hook (legacy)
    this._notify?.();
    this.checkRep();
  }

  // Problem 4 variant used by some tests: notifies only if labels actually changed
  public async mapCards(_player: PlayerID, transform: (card: string) => Promise<string>): Promise<void> {
    type P = { r: number; c: number };
    const byValue = new Map<string, P[]>();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.getCell(r, c);
        if (cell === null) continue;
        const list = byValue.get(cell.label) ?? [];
        list.push({ r, c });
        byValue.set(cell.label, list);
      }
    }

    const entries = [...byValue.entries()];
    const results = await Promise.all(entries.map(async ([orig]) => {
      const out = await transform(orig);
      if (typeof out !== "string" || out.length === 0 || out.trim() !== out || /\s/.test(out)) {
        throw new Error("invalid transformed card");
      }
      return [orig, out] as const;
    }));
    const mapping = new Map<string, string>(results);

    let changed = false;
    for (const [orig, positions] of entries) {
      const newVal = mapping.get(orig);
      if (newVal === undefined || newVal === orig) continue;
      for (const { r, c } of positions) {
        const cell = this.getCell(r, c);
        if (cell === null) continue;
        if (cell.label !== newVal) { cell.label = newVal; changed = true; }
      }
    }
    if (changed) this.notifyChange();
    this.checkRep();
  }
}