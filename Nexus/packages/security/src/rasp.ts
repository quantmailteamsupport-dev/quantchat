/**
 * rasp.ts
 * Runtime Application Self-Protection (RASP).
 * Detects debuggers, WebAssembly hook attempts, and unauthorized emulation (like Frida/Xposed).
 */

import { WasmIntegrity } from "./wasmIntegrity";

export class RASP {
  /**
   * Fires the heuristics engine upon app initialization.
   */
  static initiateSelfProtection() {
    console.log("🛡️ [RASP] Initializing Runtime Self-Protection Heuristics...");
    this.detectDebugger();
    this.detectEmulation();
    // Verify integrity of WebAssembly modules
    WasmIntegrity.verifyAll();
    console.log("🛡️ [RASP] Environment heavily secured. Wasm integrity verified.");
    console.log("🛡️ [RASP] Initializing Runtime Self-Protection Heuristics...");
    this.detectDebugger();
    this.detectEmulation();
    console.log("🛡️ [RASP] Environment heavily secured. Wasm integrity verified.");
  }

  private static detectDebugger() {
    if (typeof performance === "undefined") return;
    
    // Timing heuristic to detect if a JS debugger is attached
    const start = performance.now();
    
    // This statement will freeze the thread if devtools is open
    // eslint-disable-next-line no-debugger
    debugger; 
    
    // If the thread unfroze but took more than 50ms, a human was inspecting it.
    if (performance.now() - start > 50) {
      console.warn("[RASP] Debugger detected. Initiating safe termination.");
      // Instead of infinite loop, throw a controlled error
      this.safeTerminate();
    }
  }

  private static detectEmulation() {
    // In a prod mobile app, this uses JNI calls to check build.props, Root checks, etc.
    if (typeof window !== "undefined" && (window as any)._frida_injected) {
      console.warn("[RASP] Frida injection detected. Initiating safe termination.");
      this.safeTerminate();
    }
  }

  private static safeTerminate() {
    // Gracefully terminate the app in a controlled manner.
    // In a browser environment, we can reload or redirect.
    if (typeof window !== "undefined") {
      console.error("[RASP] Terminating application due to security violation.");
      window.location.reload();
    } else if (typeof process !== "undefined") {
      // Node/Electron environment
      console.error("[RASP] Exiting process due to security violation.");
      process.exit(1);
    }
  }

  // Retained original crashApp for backward compatibility (no longer used)
  private static crashApp() {
    // Deprecated: previously used infinite loop. Now logs and calls safeTerminate.
    console.error("[RASP] Deprecated crashApp invoked. Redirecting to safeTerminate.");
    this.safeTerminate();
  }
}
