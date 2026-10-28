// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "Compare Promise.all, Promise.allSettled, Promise.race, Promise.any"
// INTERVIEW Q: "What is the difference between a Promise, async/await, callback?"
//
// Run:  npx tsx src/js-concepts/promises.ts
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helper: simulates an API call that resolves or rejects ─────────────────
function fakeApi(name: string, ms: number, fail = false): Promise<string> {
  return new Promise((resolve, reject) =>
    setTimeout(
      () => (fail ? reject(new Error(`${name} failed`)) : resolve(`${name} OK`)),
      ms
    )
  );
}

// ─── 1. Promise.all — ALL must succeed, else rejects on first failure ────────
// Use when: you need ALL results and a single failure means the whole operation fails.
async function demoAll() {
  try {
    const results = await Promise.all([
      fakeApi("users", 100),
      fakeApi("posts", 200),
      fakeApi("comments", 50),
    ]);
    console.log("Promise.all success:", results);
    // ['users OK', 'posts OK', 'comments OK'] — all resolved
  } catch (err) {
    console.log("Promise.all failed early:", (err as Error).message);
    // If ANY rejects, the catch runs immediately — other promises still run
    // but their results are IGNORED.
  }
}

// ─── 2. Promise.allSettled — waits for ALL, never rejects ───────────────────
// Use when: you want every result regardless of failures (e.g. bulk email send).
async function demoAllSettled() {
  const results = await Promise.allSettled([
    fakeApi("users", 100),
    fakeApi("posts", 200, true), // this one fails
    fakeApi("comments", 50),
  ]);

  results.forEach((r) => {
    if (r.status === "fulfilled") console.log("✓", r.value);
    else console.log("✗", r.reason.message);
  });
  // ✓ users OK
  // ✗ posts failed
  // ✓ comments OK
}

// ─── 3. Promise.race — resolves/rejects with FIRST to settle ────────────────
// Use when: you need a timeout mechanism or want the fastest response.
async function demoRace() {
  const TIMEOUT_MS = 150;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out")), TIMEOUT_MS)
  );

  try {
    const result = await Promise.race([
      fakeApi("slowEndpoint", 500), // too slow
      timeout,                      // fires at 150ms
    ]);
    console.log("Promise.race:", result);
  } catch (err) {
    console.log("Promise.race timed out:", (err as Error).message);
    // "Request timed out" — the timeout won the race
  }
}

// ─── 4. Promise.any — first SUCCESSFUL resolution wins, ignores rejections ──
// Use when: you have multiple fallback sources (CDN replicas, mirror servers).
// Rejects only if ALL promises reject (AggregateError).
async function demoAny() {
  try {
    const result = await Promise.any([
      fakeApi("mirror1", 300, true), // fails
      fakeApi("mirror2", 100),       // succeeds — wins!
      fakeApi("mirror3", 200),
    ]);
    console.log("Promise.any first success:", result); // "mirror2 OK"
  } catch (err) {
    console.log("Promise.any all failed:", err);
  }
}

// ─── 5. async/await vs callbacks vs raw Promises ────────────────────────────
// Callbacks: inversion of control — you pass a fn for THEM to call.
//            Leads to "callback hell" when chained.

// Raw Promises: chainable with .then/.catch — better but still verbose.
function withCallback(cb: (err: Error | null, data?: string) => void) {
  setTimeout(() => cb(null, "data"), 100);
}
withCallback((err, data) => {
  if (err) return console.error(err);
  console.log("callback style:", data);
});

// async/await: syntactic sugar over Promises. Makes async code READ like sync.
// `await` pauses the async function and puts the rest in the microtask queue.
async function withAsync() {
  const data = await fakeApi("resource", 50);
  console.log("async/await style:", data);
  // What if you forget `await`? You get a Promise object, not the resolved value!
  const oops = fakeApi("resource", 50); // Promise<string>, not string
  console.log("forgot await:", oops);   // Promise { <pending> }
}

// Run all demos
(async () => {
  await demoAll();
  await demoAllSettled();
  await demoRace();
  await demoAny();
  await withAsync();
})();

