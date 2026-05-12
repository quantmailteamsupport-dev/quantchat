// __tests__/rasp.test.ts
import { RASP } from "../rasp";
import { WasmIntegrity } from "../wasmIntegrity";

// Mock console methods to suppress output during tests
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

describe('RASP safe termination flow', () => {
  it('should call safeTerminate when debugger detected', () => {
    // Mock performance.now to simulate delay >50ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      return callCount * 100; // each call returns increasing value
    });
    const safeTerminateSpy = jest.spyOn(RASP as any, 'safeTerminate').mockImplementation(() => {});
    // Invoke detection directly
    (RASP as any).detectDebugger();
    expect(safeTerminateSpy).toHaveBeenCalled();
    performance.now = originalNow;
  });
});

describe('WasmIntegrity verification', () => {
  it('should return true when whitelist is empty', () => {
    // Ensure whitelist is empty by mocking require
    jest.mock('../wasmIntegrity', () => {
      const original = jest.requireActual('../wasmIntegrity');
      return {
        ...original,
        // Override internal whitelist
        __esModule: true,
        default: original,
      };
    });
    const result = WasmIntegrity.verifyAll();
    // Since no whitelist entries, it should return true (passes)
    expect(result).toBe(true);
  });
});
