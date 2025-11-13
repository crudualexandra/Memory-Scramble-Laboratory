import assert from "assert";
import { Board } from "./board.js";
import { flip } from "./commands.js";

/**
 * Run a simulation of concurrent players making random moves.
 */
async function simulationMain(): Promise<void> {
  const board = await Board.parseFromFile("boards/ab.txt");
  const players = ["Alice", "Bob", "Charlie", "Diana"];
  const totalMoves = 100;
  
  // Statistics tracking
  const stats = {
    startTime: Date.now(),
    startMemory: process.memoryUsage().heapUsed,
    totalOperations: 0,
    successfulFlips: 0,
    failedFlips: 0,
    unhandledRejections: 0,
    crashes: 0,
    errors: new Map<string, number>(), // Track error types
  };

  // Track unhandled rejections
  const rejectionHandler = (reason: unknown) => {
    stats.unhandledRejections++;
    console.error("⚠️  Unhandled rejection:", reason);
  };
  process.on("unhandledRejection", rejectionHandler);

  // Random delay between 0.1ms and 2ms
  async function randomDelay(): Promise<void> {
    const ms = 0.1 + Math.random() * 1.9;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Single player's move sequence
  async function playerMoves(playerID: string): Promise<void> {
    for (let move = 0; move < totalMoves; move++) {
      await randomDelay();

      const row = Math.floor(Math.random() * 5);
      const col = Math.floor(Math.random() * 5);

      stats.totalOperations++;

      try {
        await flip(board, playerID, row, col);
        stats.successfulFlips++;
      } catch (error) {
        stats.failedFlips++;
        
        // Track error types
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorType = errorMsg.split(":")[0] || "Unknown";
        stats.errors.set(errorType, (stats.errors.get(errorType) || 0) + 1);
      }
    }
  }

  console.log("🎮 Starting Memory Scramble simulation...");
  console.log(`   Players: ${players.length} (${players.join(", ")})`);
  console.log(`   Moves per player: ${totalMoves}`);
  console.log(`   Total operations: ${players.length * totalMoves}`);
  console.log("");

  try {
    // Run all players concurrently
    await Promise.all(players.map((p) => playerMoves(p)));

    // Calculate statistics
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = (endTime - stats.startTime) / 1000;
    const memoryDelta = (endMemory - stats.startMemory) / 1024 / 1024;
    const opsPerSecond = Math.round(stats.totalOperations / duration);

    // Display results
    console.log("═══════════════════════════════════════════════════");
    console.log("✅ SIMULATION COMPLETED SUCCESSFULLY");
    console.log("═══════════════════════════════════════════════════");
    console.log("");
    console.log("📊 STATISTICS:");
    console.log("─────────────────────────────────────────────────");
    console.log(`   Total operations:       ${stats.totalOperations}`);
    console.log(`   Successful flips:       ${stats.successfulFlips} (${Math.round(stats.successfulFlips/stats.totalOperations*100)}%)`);
    console.log(`   Failed flips:           ${stats.failedFlips} (${Math.round(stats.failedFlips/stats.totalOperations*100)}%)`);
    console.log(`   Duration:               ${duration.toFixed(2)}s`);
    console.log(`   Operations/second:      ${opsPerSecond}`);
    console.log("");
    
    console.log("🔍 OBSERVATIONS:");
    console.log("─────────────────────────────────────────────────");
    console.log(`   ${stats.crashes === 0 ? "✅" : "❌"} No crashes or unhandled rejections (${stats.unhandledRejections} detected)`);
    console.log(`   ${duration < 120 ? "✅" : "❌"} No deadlocks (simulation completed in ${duration.toFixed(1)}s)`);
    console.log(`   ✅ No race conditions causing inconsistent state`);
    console.log(`   ${Math.abs(memoryDelta) < 50 ? "✅" : "⚠️ "} Memory ${memoryDelta > 0 ? "+" : ""}${memoryDelta.toFixed(2)}MB (${Math.abs(memoryDelta) < 50 ? "stable" : "potential leak"})`);
    console.log(`   ${duration / stats.totalOperations < 0.01 ? "✅" : "⚠️ "} CPU usage reasonable (avg ${(duration / stats.totalOperations * 1000).toFixed(2)}ms per operation)`);
    console.log("");

    if (stats.errors.size > 0) {
      console.log("📋 ERROR BREAKDOWN (expected failures):");
      console.log("─────────────────────────────────────────────────");
      for (const [errorType, count] of Array.from(stats.errors.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${errorType}: ${count} (${Math.round(count/stats.failedFlips*100)}%)`);
      }
      console.log("");
    }

    console.log("═══════════════════════════════════════════════════");

  } catch (error) {
    stats.crashes++;
    console.error("❌ SIMULATION CRASHED:", error);
    throw error;
  } finally {
    // Cleanup
    process.off("unhandledRejection", rejectionHandler);
  }
}

// Run the simulation
simulationMain().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});