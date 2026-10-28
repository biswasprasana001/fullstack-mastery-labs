// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "stub vs spy vs full module mock — when does over-mocking hurt?"
// INTERVIEW Q: "Why does React Testing Library query by role, not test IDs?"
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCounter } from "../../src/js-concepts/closures.js";

// ─── Unit test: pure function — no mocking needed ────────────────────────────
describe("makeCounter", () => {
  it("starts at the given value", () => {
    const c = makeCounter(5);
    expect(c.value()).toBe(5);
  });

  it("increments correctly", () => {
    const c = makeCounter(0);
    c.increment();
    c.increment();
    expect(c.value()).toBe(2);
  });

  it("each counter has independent state (closure isolation)", () => {
    const a = makeCounter(0);
    const b = makeCounter(10);
    a.increment();
    // b is unaffected — each call to makeCounter creates a new closure scope
    expect(b.value()).toBe(10);
  });
});

// ─── INTERVIEW: stub vs spy vs mock ─────────────────────────────────────────
//
// Stub:  A replacement that returns a fixed value. "Just make this work."
//        Use when: you don't care HOW it was called, just what it returns.
//
// Spy:   Wraps the REAL implementation and records calls.
//        Use when: you want to verify the function was called with the right args.
//
// Mock:  Replaces an entire module with a fake. Can control return values + track calls.
//        Use when: you need to isolate a unit from its dependencies.
//
// Over-mocking: mocking too much means you're testing your mocks, not your code.
//   Sign: tests pass even when production code is wrong.
//   Fix:  prefer integration tests for I/O boundaries; unit tests for pure logic.

describe("spy example", () => {
  it("tracks how many times a function was called", () => {
    const logger = { log: (msg: string) => console.log(msg) };

    // vi.spyOn wraps the real `log` — still runs, but we can assert on it
    const spy = vi.spyOn(logger, "log");

    logger.log("hello");
    logger.log("world");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith("hello");

    spy.mockRestore(); // restore original function
  });
});

describe("stub example", () => {
  it("returns a fixed value without running real logic", () => {
    const fetchUser = vi.fn().mockResolvedValue({ id: 1, name: "Alice" });

    // We're testing code that USES fetchUser, not fetchUser itself
    async function displayUser(id: number) {
      const user = await fetchUser(id);
      return `Hello, ${(user as { name: string }).name}`;
    }

    return expect(displayUser(1)).resolves.toBe("Hello, Alice");
  });
});

// ─── Debounce test with fake timers ──────────────────────────────────────────
// INTERVIEW Q: "How do you test code that depends on timers?"
describe("debounce", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("only calls the function once after the wait period", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    debounced();
    debounced(); // rapid calls

    expect(fn).not.toHaveBeenCalled(); // not called yet — timer pending

    vi.advanceTimersByTime(300); // fast-forward 300ms

    expect(fn).toHaveBeenCalledTimes(1); // called exactly once
  });
});

// Inline debounce for test (avoids import complexity)
function debounce<T extends unknown[]>(fn: (...args: T) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

