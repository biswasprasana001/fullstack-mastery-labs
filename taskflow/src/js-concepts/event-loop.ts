// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "In what order do synchronous code, process.nextTick, Promise
//              microtasks, setTimeout, and setImmediate execute?"
//
// Run:  npx tsx src/js-concepts/event-loop.ts
// ─────────────────────────────────────────────────────────────────────────────

// The Node.js event loop has these phases (simplified):
//
//  ┌──────────────────────────────────────┐
//  │           Call Stack (sync)           │  ← runs FIRST, to completion
//  └──────────────────────────────────────┘
//                     ↓
//  ┌──────────────────────────────────────┐
//  │      Microtask Queue                  │  ← drained AFTER each task
//  │  1. process.nextTick callbacks        │  ← highest priority microtask
//  │  2. Promise .then / .catch / .finally │  ← second
//  └──────────────────────────────────────┘
//                     ↓
//  ┌──────────────────────────────────────┐
//  │      Macrotask Queue (one per tick)   │
//  │  3. setTimeout / setInterval          │
//  │  4. setImmediate (check phase)        │
//  └──────────────────────────────────────┘

console.log("1. SYNC — call stack runs first");

// process.nextTick is the highest-priority microtask (Node-only)
process.nextTick(() => console.log("3. nextTick — top of microtask queue"));

// Promise.then is a standard microtask (works in browser + Node)
Promise.resolve().then(() => console.log("4. Promise.then — microtask queue"));

// setTimeout with 0ms delay is a macrotask — runs AFTER all microtasks
setTimeout(() => console.log("5. setTimeout(0) — macrotask"), 0);

// setImmediate fires in the "check" phase, after I/O, after setTimeout in many cases
setImmediate(() => console.log("6. setImmediate — check phase macrotask"));

console.log("2. SYNC — still synchronous, call stack not empty yet");

// Expected output order:
// 1. SYNC — call stack runs first
// 2. SYNC — still synchronous, call stack not empty yet
// 3. nextTick — top of microtask queue
// 4. Promise.then — microtask queue
// 5. setTimeout(0) — macrotask          (or 6 then 5 — order can vary)
// 6. setImmediate — check phase macrotask

// ─── Why this matters in interviews ────────────────────────────────────────
// Interviewers give you this exact snippet and ask for the output order.
// Key rules to remember:
//  • Microtasks (nextTick, Promises) ALWAYS drain before the next macrotask.
//  • nextTick > Promise.then within microtasks.
//  • setTimeout(0) vs setImmediate: order is non-deterministic outside I/O;
//    inside an I/O callback, setImmediate always fires first.

// ─── Bonus: async/await is syntactic sugar for Promise chains ───────────────
async function fetchUser(id: number): Promise<string> {
  // `await` suspends here, letting other microtasks/macrotasks run.
  // The code AFTER await goes into the microtask queue (like .then).
  const result = await Promise.resolve(`User #${id}`);
  return result;
}

fetchUser(42).then((name) => console.log(`7. async/await resolved: ${name}`));

