// import { strict as assert } from "assert";
// import { promises as fs } from "fs";
// import * as path from "path";
// import { Board, PlayerID } from "../src/board.js";
export {};
// /** Create a temp board file with deterministic layout. */
// async function makeBoardFile(contents: string): Promise<string> {
//   const dir = path.join(process.cwd(), ".tmp-tests");
//   await fs.mkdir(dir, { recursive: true });
//   const file = path.join(dir, `b-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
//   await fs.writeFile(file, contents, "utf8");
//   return file;
// }
// /** 2x2 board: A A / B B */
// async function freshBoard(): Promise<Board> {
//   const file = await makeBoardFile(["2x2", "A", "A", "B", "B"].join("\n") + "\n");
//   return Board.parseFromFile(file);
// }
// /** Convenience wrappers — rename if your async methods differ. */
// async function first(b: Board, r: number, c: number, p: PlayerID): Promise<void> {
//   // @ts-ignore provided by your Problem 3 implementation
//   return b.flipFirstAsync({ r, c }, p);
// }
// async function second(b: Board, r: number, c: number, p: PlayerID): Promise<void> {
//   // @ts-ignore provided by your Problem 3 implementation
//   return b.flipSecondAsync({ r, c }, p);
// }
// /** Extract a spot token from a Board snapshot safely. */
// function spot(snapshot: string, r: number, c: number): string {
//   const lines = snapshot.trim().split("\n");
//   const header = lines[0] ?? "";
//   const parts = header.split("x");
//   assert.equal(parts.length, 2, `bad header in snapshot: ${header}`);
//   const rStr = parts[0] ?? "";
//   const cStr = parts[1] ?? "";
//   assert.ok(/^\d+$/.test(rStr) && /^\d+$/.test(cStr), `bad header numbers in: ${header}`);
//   const rows = Number.parseInt(rStr, 10);
//   const cols = Number.parseInt(cStr, 10);
//   assert.ok(rows >= 1 && cols >= 1, `nonpositive dims in: ${header}`);
//   const idx = 1 + r * cols + c;
//   const s = lines[idx];
//   assert.ok(typeof s === "string", `missing spot at (${r},${c})`);
//   return s as string;
// }
// describe("Board — Problem 3 concurrency", () => {
//   it("waiter acquires after 2-E release (1-D wait + release on mismatch)", async () => {
//     const b = await freshBoard();
//     await first(b, 0, 0, "alice");               // A
//     const bobWait = first(b, 0, 0, "bob");       // waits on same first card
//     // Mismatch: second on a different label (B at 1,1) should 2-E release
//     await second(b, 1, 1, "alice");
//     await bobWait; // resolves once released
//     const viewBob = b.snapshot("bob");
//     assert.equal(spot(viewBob, 0, 0).startsWith("my "), true, "bob should control (0,0)");
//   });
//   it("waiter gets 1-A after 3-A removal (matched pair removed on next first)", async () => {
//     const b = await freshBoard();
//     await first(b, 0, 0, "alice");               // A
//     await second(b, 0, 1, "alice");              // A -> matched, controlled by alice
//     const bobWait = first(b, 0, 0, "bob");       // waiting
//     // Next first move by alice triggers 3-A removal of the A pair
//    const p = first(b, 1, 1, "alice");
//     await p.catch(() => { /* outcome irrelevant */ });
//     await assert.rejects(bobWait, /1-A: empty space/, "bob should see 1-A because the card was removed");
//   });
//   it("second card never waits: 2-B immediate failure", async () => {
//     const b = await freshBoard();
//     await first(b, 0, 0, "bob");
//     await assert.rejects(
//       second(b, 0, 0, "bob"),
//       /2-B: second card is controlled/
//     );
//   });
//   it("FIFO: two waiters acquire in order when the card is released twice", async () => {
//     const b = await freshBoard();
//     await first(b, 0, 0, "alice");               // A
//     const bobWait = first(b, 0, 0, "bob");       // waiter #1
//     const charlieWait = first(b, 0, 0, "charlie"); // waiter #2
//     // 1st release: mismatch by alice (A vs B)
//     await second(b, 1, 1, "alice");
//     await bobWait; // resolves first
//     const viewBob = b.snapshot("bob");
//     assert.equal(spot(viewBob, 0, 0).startsWith("my "), true, "bob should acquire before charlie");
//     // 2nd release: bob mismatches to relinquish
//     await second(b, 1, 1, "bob");
//     await charlieWait;
//     const viewCharlie = b.snapshot("charlie");
//     assert.equal(spot(viewCharlie, 0, 0).startsWith("my "), true, "charlie acquires after bob");
//   });
// });
//# sourceMappingURL=board.concurrent.test.js.map