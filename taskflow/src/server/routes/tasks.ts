// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "What is the REST API route design, idempotency, and status codes?"
// INTERVIEW Q: "Why do CORS preflight OPTIONS requests happen?"
// INTERVIEW Q: "How does GraphQL N+1 work, and how does DataLoader fix it?"
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth, TokenPayload } from "../middleware/auth.js";
import { getTasksPage, createTaskWithLog, pool } from "../db/queries.js";
import { AppError } from "../middleware/errorHandler.js";
import { getOrSetCache } from "../redis/cache.js";

export const tasksRouter = Router();

// All task routes require authentication
tasksRouter.use(requireAuth);

type AuthRequest = Request & { user: TokenPayload };

// ─── Validation schema (Zod) ─────────────────────────────────────────────────
const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
});

// ─── HTTP Method Idempotency ─────────────────────────────────────────────────
//
// GET    → idempotent + safe (no side effects)
// PUT    → idempotent (same result every call, replaces the whole resource)
// PATCH  → NOT idempotent by convention (partial update, order matters)
// DELETE → idempotent (deleting twice = same end state: resource gone)
// POST   → NOT idempotent (each call creates a new resource)
//
// Idempotency-Key header: for POST (e.g. payments), clients send a unique key.
// The server stores key→result and returns the stored result on duplicates.

// GET /tasks?cursor=xxx&limit=20
// Safe, idempotent — no state change
tasksRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req as AuthRequest;
    const limit = Math.min(Number(req.query["limit"]) || 20, 100);
    const cursorParam = req.query["cursor"] as string | undefined;

    let cursor: { createdAt: Date; id: number } | undefined;
    if (cursorParam) {
      const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString());
      cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
    }

    const cacheKey = `tasks:${user.userId}:${cursorParam ?? "first"}:${limit}`;

    // Cache-aside: try cache first, fall back to DB, then populate cache
    const result = await getOrSetCache(cacheKey, 30, () =>
      getTasksPage(user.userId, limit, cursor)
    );

    // 200 OK — success with body
    res.status(200).json(result);
  } catch (err) {
    next(err); // pass to 4-param error handler
  }
});

// POST /tasks — creates a new task (NOT idempotent)
// Status codes:
//   201 Created  — resource was created (include Location header ideally)
//   400 Bad Request — malformed JSON body
//   422 Unprocessable Entity — valid JSON but invalid fields
tasksRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req as AuthRequest;
    const body = CreateTaskSchema.parse(req.body); // throws ZodError if invalid → 422

    const task = await createTaskWithLog(user.userId, body.title, body.description);

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// PATCH /tasks/:id — partial update (we only change provided fields)
tasksRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req as AuthRequest;
    const taskId = Number(req.params["id"]);
    const body = UpdateTaskSchema.parse(req.body);

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.title !== undefined)       { setClauses.push(`title = $${idx++}`);       params.push(body.title); }
    if (body.description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(body.description); }
    if (body.status !== undefined)      { setClauses.push(`status = $${idx++}`);       params.push(body.status); }

    if (setClauses.length === 0) {
      throw new AppError(400, "No fields to update");
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(taskId, user.userId);

    const { rows } = await pool.query(
      `UPDATE tasks SET ${setClauses.join(", ")}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING *`,
      params
    );

    if (!rows[0]) throw new AppError(404, "Task not found");

    res.status(200).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /tasks/:id — idempotent (deleting a missing resource returns 404 or 204)
tasksRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req as AuthRequest;
    const taskId = Number(req.params["id"]);

    const { rowCount } = await pool.query(
      `DELETE FROM tasks WHERE id = $1 AND user_id = $2`,
      [taskId, user.userId]
    );

    if (!rowCount) throw new AppError(404, "Task not found");

    // 204 No Content — success with no body (common for DELETE)
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── INTERVIEW: CORS preflight ───────────────────────────────────────────────
//
// Browsers send an OPTIONS preflight BEFORE the real request when:
//   • The method is not GET/POST/HEAD
//   • Custom headers are present (e.g. Authorization)
//   • Content-Type is application/json
//
// The server must respond with:
//   Access-Control-Allow-Origin: https://app.example.com
//   Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
//   Access-Control-Allow-Headers: Authorization, Content-Type
//
// This is configured once via the `cors` middleware in app.ts.

// ─── INTERVIEW: GraphQL N+1 problem ─────────────────────────────────────────
//
// Problem: If you fetch 10 posts and each resolver fetches the author separately:
//   SELECT * FROM posts                 → 1 query
//   SELECT * FROM users WHERE id = ?    → 10 queries (one per post)
//   Total: 11 queries (N+1 where N=10)
//
// DataLoader fix:
//   DataLoader batches all the id lookups that happen in a single event-loop tick
//   into ONE query:
//   SELECT * FROM users WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
//   Then distributes results back to each resolver.
//
// DataLoader also caches within the request — duplicate IDs = one DB hit.
//
// In REST, the equivalent is an ORM with eager loading (.include()) or a
// single JOIN query instead of per-row sub-queries.

