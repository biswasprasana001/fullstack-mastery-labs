// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How does Node.js handle concurrent I/O on a single thread?"
// INTERVIEW Q: "How do you structure a production-ready Express app?"
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { tasksRouter } from "./routes/tasks.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// ─── INTERVIEW: Node.js concurrency model ────────────────────────────────────
//
// Node runs JS on ONE thread (the event loop). So how does it handle 10,000
// concurrent HTTP requests without creating a thread per request?
//
// Answer: libuv's async I/O.
//  • Network I/O, file I/O, DNS → delegated to the OS kernel (epoll/kqueue)
//    or libuv's thread pool (4 threads by default for file I/O, crypto, DNS)
//  • The event loop NEVER blocks waiting — it registers a callback and moves on
//  • When the OS says "data ready", the callback is queued as a microtask/macrotask
//
// What BLOCKS the event loop (avoid these!):
//  • Synchronous fs.readFileSync() on large files
//  • JSON.parse() on huge strings
//  • Heavy crypto or image processing in the main thread
//  Fix: worker_threads for CPU-heavy work, streaming for large data

export function createApp() {
  const app = express();

  // ─── Security middleware ─────────────────────────────────────────────────
  // helmet: sets secure HTTP headers (CSP, X-Frame-Options, etc.)
  app.use(helmet());

  // CORS: tells browsers which origins may call this API
  app.use(cors({
    origin: process.env["CLIENT_URL"] ?? "http://localhost:5173",
    credentials: true, // allow cookies (for HttpOnly refresh token)
  }));

  // Parse JSON bodies — 10kb limit prevents payload-based DoS
  app.use(express.json({ limit: "10kb" }));

  // ─── Routes ──────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/tasks", tasksRouter);

  // ─── Error handling (ORDER MATTERS) ─────────────────────────────────────
  // notFound must be AFTER routes (catches unmatched paths)
  // errorHandler must be LAST (must have 4 params — see errorHandler.ts)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// INTERVIEW Q: "How do you handle graceful shutdown?"
//
// Without this, SIGTERM (from Docker/k8s) kills the process immediately,
// dropping in-flight requests and leaving DB connections open.

async function main() {
  const app = createApp();
  const PORT = Number(process.env["PORT"] ?? 3000);

  const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  // npm start uses `node` which forwards SIGTERM from Docker correctly.
  // npm start via `npm start` DOES NOT — npm swallows SIGTERM.
  // Solution: use `node dist/server/app.js` directly in Dockerfile CMD.
  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received — shutting down gracefully`);

    server.close(async () => {
      // Close DB pool, Redis, Kafka consumer before exit
      const { pool } = await import("./db/queries.js");
      const { redis } = await import("./redis/cache.js");
      const { stopConsumer } = await import("./kafka/consumer.js");

      await Promise.allSettled([pool.end(), redis.quit(), stopConsumer()]);
      console.log("[Server] All connections closed. Exiting.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  // Prevent silent crashes — log and exit so the container restarts
  process.on("unhandledRejection", (reason) => {
    console.error("[Unhandled Rejection]", reason);
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    console.error("[Uncaught Exception]", err);
    process.exit(1);
  });
}

// Only run the server when this file is the entry point, not when imported in tests
if (process.argv[1]?.endsWith("app.ts") || process.argv[1]?.endsWith("app.js")) {
  main();
}

