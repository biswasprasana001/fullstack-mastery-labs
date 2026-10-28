-- ─────────────────────────────────────────────────────────────────────────────
-- INTERVIEW Q: "How do indexes work, and when would you use a composite index?"
-- INTERVIEW Q: "What are ACID properties and transactions?"
-- INTERVIEW Q: "How do you model a one-to-many and many-to-many relationship?"
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Users table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,         -- UNIQUE creates an implicit B-Tree index
  name       TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tasks table (one-to-many: one user → many tasks) ────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo','in_progress','done')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tags table (many-to-many: tasks ↔ tags via junction table) ──────────────
CREATE TABLE IF NOT EXISTS tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id INT REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INT REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)   -- composite PK prevents duplicate pairs
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- B-Tree index on (user_id, created_at) for the most common query:
--   "fetch all tasks for user X, newest first"
--
-- COLUMN ORDER MATTERS:
--   (user_id, created_at) supports: WHERE user_id = ? ORDER BY created_at
--   (created_at, user_id) would NOT support that efficiently — you must filter
--   the leftmost column first.
CREATE INDEX IF NOT EXISTS idx_tasks_user_created
  ON tasks (user_id, created_at DESC);

-- Partial index — only indexes incomplete tasks (smaller index, faster writes)
-- Use when your queries almost always filter by the same condition.
CREATE INDEX IF NOT EXISTS idx_tasks_incomplete
  ON tasks (user_id, created_at DESC)
  WHERE status != 'done';

-- ─── INTERVIEW: ACID Properties ──────────────────────────────────────────────
--
-- A — Atomicity:   All operations in a transaction succeed, or NONE do.
-- C — Consistency: DB moves from one valid state to another (constraints hold).
-- I — Isolation:   Concurrent transactions don't see each other's partial work.
-- D — Durability:  Once committed, data survives crashes (written to disk/WAL).
--
-- Example: money transfer. Without a transaction, a crash after the debit but
-- before the credit would lose money. With BEGIN/COMMIT, both happen or neither.

-- ─── Isolation levels and concurrency anomalies ──────────────────────────────
--
-- READ UNCOMMITTED: can see dirty reads (other tx's uncommitted data) — not in PG
-- READ COMMITTED:   default in Postgres. Prevents dirty reads. Still allows
--                   non-repeatable reads (same row changes between two reads).
-- REPEATABLE READ:  same row returns same value within a tx. Prevents phantom
--                   reads in PG (PG's MVCC is stricter than SQL standard).
-- SERIALIZABLE:     transactions appear to run one after another — full isolation.
--                   Slowest but safest.

