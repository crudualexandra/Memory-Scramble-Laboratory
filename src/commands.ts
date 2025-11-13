// src/commands.ts
// Problem 2+3 glue — tiny wrappers that call the Board

import { Board } from "./board.js";

/**
 * Return a text snapshot for this player.
 * Kept async so server.ts can `await` it cleanly.
 * @param board Board instance
 * @param playerId player identifier
 */
export async function look(board: Board, playerId: string): Promise<string> {
  return board.snapshot(playerId);
}

/**
 * Flip first/second depending on player state, then return a snapshot.
 * Problem 3: use async Board ops so a first flip can WAIT if the card is controlled.
 * @param board Board instance
 * @param playerId player identifier
 * @param row row index (0-based)
 * @param column column index (0-based)
 */
export async function flip(
  board: Board,
  playerId: string,
  row: number,
  column: number
): Promise<string> {
  const pos = { r: row, c: column };
  if (board.hasFirstSelection(playerId)) {
    await board.flipSecondAsync(pos, playerId); // still must not wait on 2-B
  } else {
    await board.flipFirstAsync(pos, playerId);  // waits if controlled by another
  }
  return board.snapshot(playerId);
}

/**
 * Apply async transform to all non-removed cards. Player identity is ignored for map.
 * @param board Board instance
 * @param playerId player identifier (used only for final snapshot)
 * @param transform async function mapping card labels to new labels
 * @returns board state after transformation from playerId's perspective
 */
export async function map(
  board: Board,
  playerId: string,
  transform: (card: string) => Promise<string>
): Promise<string> {
  await board.map(transform);
  return board.snapshot(playerId);
}

// Glue for Problem 4: simply delegates to board.map(). If board.mapCards exists use it instead.
/**
 * Apply async transform to all non-removed cards. Player identity is ignored for map.
 * @param board Board instance
 * @param _playerId ignored (map independent of player)
 * @param transform async (card) => newCard
 */
/**
 * Apply async transform to all non-removed cards. Player identity is ignored for map.
 * @param board Board instance
 * @param _playerId ignored (map independent of player)
 * @param transform async (card) => newCard
 * @returns resolves when mapping is complete
 */
export async function mapTransform(board: Board, _playerId: string, transform: (card: string) => Promise<string>): Promise<void> {
  // Board now implements map(); simply delegate.
  await board.map(transform);
}

/**
 * Stub for Problem 5 (watch/long-poll). Will be implemented in Problem 5.
 */
export async function watch(board: Board, playerId: string): Promise<string> {
  return board.watch(playerId);
}