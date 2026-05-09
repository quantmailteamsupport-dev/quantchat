// wasmIntegrity.ts
// Simple utility to verify integrity of loaded WebAssembly modules.
// In a production build, this would compare SHA-256 hashes of .wasm binaries
// against a whitelist defined in wasmHashes.json.

import { readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";

// Load whitelist of hashes (module name -> sha256 hex)
let whitelist: Record<string, string> = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  whitelist = require("./wasmHashes.json");
} catch (e) {
  console.warn("[WasmIntegrity] No whitelist file found, skipping verification.");
}

export class WasmIntegrity {
  /** Verify a single .wasm file against the whitelist */
  static verifyModule(modulePath: string): boolean {
    const name = path.basename(modulePath);
    if (!whitelist[name]) {
      console.warn(`[WasmIntegrity] No hash entry for ${name}, skipping verification.`);
      return true; // treat as pass if not listed
    }
    const data = readFileSync(modulePath);
    const hash = createHash("sha256").update(data).digest("hex");
    const expected = whitelist[name];
    if (hash !== expected) {
      console.error(`[WasmIntegrity] Hash mismatch for ${name}: expected ${expected}, got ${hash}`);
      return false;
    }
    console.log(`[WasmIntegrity] Verified ${name}`);
    return true;
  }

  /** Scan common Wasm directories and verify all modules */
  static verifyAll(): boolean {
    // Example directories – adjust as needed for the project
    const dirs = [
      path.resolve(__dirname, "../../node_modules/prisma/build"),
    ];
    let allGood = true;
    for (const dir of dirs) {
      try {
        const files = require("fs").readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.wasm')) {
            const fullPath = path.join(dir, file);
            const ok = this.verifyModule(fullPath);
            if (!ok) allGood = false;
          }
        }
      } catch (e) {
        console.warn(`[WasmIntegrity] Could not read directory ${dir}: ${e}`);
      }
    }
    return allGood;
  }
}
