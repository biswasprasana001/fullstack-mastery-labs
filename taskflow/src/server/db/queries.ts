// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How does cursor-based pagination differ from LIMIT/OFFSET?"
// INTERVIEW Q: "How do you use EXPLAIN ANALYZE to diagnose slow queries?"
// INTERVIEW Q: "How do you prevent SQL injection?"
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";

// Pool = reuse connections (not create/destroy per request — expensive)
export const pool = new pg.Pool({
  connectionString: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/taskflow",
});

// ─── Types ───────────────────────────────────────────────────────────────────
export interface Task {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  created_at: Date;
  updated_at: Date;
}

// ─── INTERVIEW: Cursor-based (keyset) pagination ─────────────────────────────
//
// OFFSET pagination problem:
//   SELECT * FROM tasks LIMIT 20 OFFSET 10000
//   → DB reads 10,020 rows just to skip 10,000. Slow + inconsistent (new rows
//     shift pages, causing duplicate/skipped items between page loads).
//
// Cursor pagination:
//   Use the last row's (created_at, id) as the cursor.
//   The next page starts WHERE (created_at, id) < (cursor_ts, cursor_id)
//   This is O(log n) via the index — regardless of how many pages back you are.

export async function getTasksPage(
  userId: number,
  limit: number,
  cursor?: { createdAt: Date; id: number }
): Promise<{ tasks: Task[]; nextCursor: string | null }> {
  const params: unknown[] = [userId, limit + 1]; // fetch one extra to detect more pages

  // INTERVIEW: Parameterised queries ($1, $2) prevent SQL injection.
  // Never concatenate user input into query strings.
  const cursorClause = cursor
    ? `AND (t.created_at, t.id) < ($3, $4)`
    : "";

  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
  }

  const { rows } = await pool.query<Task>(
    `SELECT t.*
     FROM tasks t
     WHERE t.user_id = $1
     ${cursorClause}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT $2`,
    params
  );

  const hasMore = rows.length > limit;
  const tasks = hasMore ? rows.slice(0, limit) : rows;

  // Encode the cursor as base64 so it's opaque to the client
  const lastTask = tasks.at(-1);
  const nextCursor =
    hasMore && lastTask
      ? Buffer.from(JSON.stringify({ createdAt: lastTask.created_at, id: lastTask.id })).toString("base64")
      : null;

  return { tasks, nextCursor };
}

// ─── ACID Transaction example — create task and log activity atomically ──────
export async function createTaskWithLog(
  userId: number,
  title: string,
  description?: string
): Promise<Task> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // START transaction

    const { rows } = await client.query<Task>(
      `INSERT INTO tasks (user_id, title, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, title, description ?? null]
    );

    const task = rows[0];
    if (!task) throw new Error("Insert returned no rows");

    // If this second query fails, the whole transaction rolls back —
    // no orphaned task without an activity log.
    await client.query(
      `INSERT INTO activity_log (user_id, action, entity_id)
       VALUES ($1, 'task_created', $2)`,
      [userId, task.id]
    );

    await client.query("COMMIT"); // Atomically persist both inserts
    return task;
  } catch (err) {
    await client.query("ROLLBACK"); // Undo EVERYTHING if anything failed
    throw err;
  } finally {
    client.release(); // Return connection to pool
  }
}

// ─── INTERVIEW: How to read EXPLAIN ANALYZE output ──────────────────────────
//
// Run in psql:
//   EXPLAIN ANALYZE SELECT * FROM tasks WHERE user_id = 1 ORDER BY created_at DESC;
//
// Key things to look for:
//
//   Seq Scan    → reading every row (no useful index). Bad for large tables.
//   Index Scan  → using the index to find rows, then fetching from heap.
//   Index Only Scan → all needed columns are IN the index. Fastest.
//
//   "cost=0.00..8.27 rows=100"  → estimated cost and row count
//   "actual time=0.05..1.2 rows=95" → real numbers. Large gap = bad statistics.
//   "Rows Removed by Filter: 5000" → index not used for filtering — add one.
//
// After adding idx_tasks_user_created, the plan should show:
//   Index Scan using idx_tasks_user_created on tasks

