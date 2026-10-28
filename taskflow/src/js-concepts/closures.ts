// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "What is a closure? Give a real-world use and a classic gotcha."
// INTERVIEW Q: "How do you implement debounce?"
// INTERVIEW Q: "How do closures cause stale state / memory leaks?"
//
// Run:  npx tsx src/js-concepts/closures.ts
// ─────────────────────────────────────────────────────────────────────────────

// ─── 1. What IS a closure? ──────────────────────────────────────────────────
// A closure is a function that REMEMBERS the variables from its outer scope
// even after that outer scope has finished executing.

export function makeCounter(start: number) {
  let count = start; // `count` lives in the heap — the inner fn holds a reference

  return {
    increment: () => ++count,
    decrement: () => --count,
    value: () => count,
  };
}

const counter = makeCounter(0);
counter.increment();
counter.increment();
counter.increment();
console.log("Counter:", counter.value()); // 3
// `count` is kept alive by the closure even though makeCounter() has returned.

// ─── 2. Classic Gotcha — var inside a loop ──────────────────────────────────
// Interview favourite: "What does this print?"

console.log("\n--- var gotcha (prints 3, 3, 3) ---");
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log("var loop i:", i), 0);
}
// Prints 3, 3, 3 — all callbacks close over THE SAME `i` (function-scoped var).
// By the time the callbacks fire, the loop has finished and i === 3.

console.log("\n--- let fix (prints 0, 1, 2) ---");
for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log("let loop j:", j), 0);
}
// Prints 0, 1, 2 — `let` is BLOCK-scoped, so each iteration gets its own `j`.

// ─── 3. Real-world use — Debounce ───────────────────────────────────────────
// INTERVIEW Q: "Implement debounce with an optional leading-edge execution."
//
// Debounce: delays execution until the user stops calling for `wait` ms.
// Throttle: executes AT MOST once every `wait` ms.
// Use debounce for search inputs; use throttle for scroll/resize handlers.

function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  wait: number,
  immediate = false // leading-edge: fire on the FIRST call, not the last
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function (...args: T) {
    const callNow = immediate && !timer; // true only on the first call

    // Clear the previous timer — this is the "debounce" effect
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null; // reset so next call can be "first" again
      if (!immediate) fn(...args); // trailing-edge: fire after silence
    }, wait);

    if (callNow) fn(...args); // leading-edge: fire immediately
  };
}

// Simulate a search input that fires on every keystroke
const onSearch = debounce((query: string) => {
  console.log(`API call with: "${query}"`);
}, 300);

// Only the LAST call fires (after 300 ms of silence)
onSearch("r");
onSearch("re");
onSearch("rea");
onSearch("reac");
onSearch("react"); // ← only this one triggers the API call

// ─── 4. Stale closure inside useEffect / setInterval ────────────────────────
// INTERVIEW Q: "A setInterval inside useEffect keeps showing stale state. Why?"
//
// Demonstration (plain JS, same concept as React):

function staleClosureDemo() {
  let count = 0;

  // This interval closes over `count` at the time it was created (0).
  // Even if `count` changes later, the interval always sees the OLD value.
  const badInterval = setInterval(() => {
    // Stale! `count` is always 0 inside here because the closure captured
    // the initial binding, not a live reference to the variable.
    console.log("stale count:", count);
    clearInterval(badInterval);
  }, 10);

  count = 99; // Too late — the closure already captured count = 0
}

staleClosureDemo();
// Fix in React: use a ref (useRef) so the interval always reads the current value,
// or put count in the useEffect dependency array to re-register the interval.
