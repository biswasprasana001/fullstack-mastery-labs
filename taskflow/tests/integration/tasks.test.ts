// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How do you test Express routes in isolation with supertest?"
// INTERVIEW Q: "Why does React Testing Library prefer getByRole over test IDs?"
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/server/app.js";

// ─── Mock dependencies before importing the module under test ─────────────────
// This is a FULL MODULE MOCK — replaces the entire module with our fake.
// Use sparingly: over-mocking means tests don't catch real integration bugs.

vi.mock("../../src/server/db/queries.js", () => ({
  pool: { query: vi.fn(), end: vi.fn() },
  getTasksPage: vi.fn().mockResolvedValue({
    tasks: [
      { id: 1, title: "Write tests", status: "todo", user_id: 1, created_at: new Date(), updated_at: new Date() },
    ],
    nextCursor: null,
  }),
  createTaskWithLog: vi.fn().mockResolvedValue({
    id: 2, title: "New Task", status: "todo", user_id: 1, created_at: new Date(), updated_at: new Date(),
  }),
}));

vi.mock("../../src/server/redis/cache.js", () => ({
  redis: { quit: vi.fn() },
  getOrSetCache: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn()),
}));

// ─── Mock JWT verification so we can test without real tokens ────────────────
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn().mockReturnValue({ userId: 1, email: "test@example.com" }),
    sign: vi.fn().mockReturnValue("mock-token"),
  },
}));

// ─── Integration test — tests the full middleware chain via HTTP ──────────────
// supertest sends real HTTP requests to the Express app without binding a port.
// This tests: route matching → middleware → handler → error handler → response.

const app = createApp();

describe("GET /api/tasks", () => {
  it("returns 200 with tasks list", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", "Bearer mock-token");

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe("Write tests");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(app).get("/api/tasks");
    // 401 = unauthenticated (who are you?), not 403 (forbidden — I know who you are)
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });
});

describe("POST /api/tasks", () => {
  it("returns 201 with created task", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", "Bearer mock-token")
      .send({ title: "New Task" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("New Task");
  });

  it("returns 422 when title is missing (Zod validation)", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", "Bearer mock-token")
      .send({ title: "" }); // empty string fails min(1)

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/validation/i);
  });
});

// ─── INTERVIEW: Testing Pyramid vs Testing Trophy ───────────────────────────
//
// Testing Pyramid (classic):
//   Many unit tests (fast, isolated)
//   Fewer integration tests
//   Fewest E2E tests (slow, brittle)
//
// Testing Trophy (Kent C. Dodds):
//   Integration tests are the most valuable — they test real behavior
//   without being as slow as E2E.
//   Unit tests for pure logic (closures, utils, algorithms).
//   Few E2E for critical user journeys.
//
// Why 100% coverage ≠ bug-free:
//   Coverage measures LINES EXECUTED, not BEHAVIOR VERIFIED.
//   A test that calls every line but asserts nothing gives 100% coverage
//   while catching zero bugs.

// ─── INTERVIEW: React Testing Library — why getByRole? ─────────────────────
//
// getByRole("button", { name: "Add Task" })  ← queries like a screen reader
// vs.
// getByTestId("add-task-btn")                ← couples test to implementation
//
// Role-based queries:
//  ✓ Test what USERS see and interact with (accessible name, role)
//  ✓ Fail if you accidentally remove accessibility attributes
//  ✓ Enforce accessible HTML — if there's no role, the UI is likely inaccessible
//
// findBy* vs getBy* vs queryBy*:
//   getBy*   → throws if not found. Use for elements that must exist.
//   queryBy* → returns null if not found. Use for asserting element ABSENCE.
//   findBy*  → async, waits for element to appear. Use after async actions.

