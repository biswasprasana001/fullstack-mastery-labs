// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "What are query keys? How do you structure them?"
// INTERVIEW Q: "staleTime vs gcTime — what's the difference?"
// INTERVIEW Q: "How do optimistic updates work, including rollback on failure?"
// ─────────────────────────────────────────────────────────────────────────────

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useStatusFilter, useSearchQuery } from "../store/useAppStore.js";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Task {
  id: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  created_at: string;
}

interface TasksPage { tasks: Task[]; nextCursor: string | null; }

// ─── INTERVIEW: Query key design ─────────────────────────────────────────────
//
// Query keys are arrays. Structure them from BROAD → NARROW:
//   ["tasks"]                           → all task-related cache
//   ["tasks", "list"]                   → all task lists
//   ["tasks", "list", { filter, query }] → specific filtered list
//   ["tasks", "detail", 42]             → single task
//
// This hierarchy enables targeted invalidation:
//   queryClient.invalidateQueries({ queryKey: ["tasks"] })
//   → invalidates ALL task queries (list + detail)
//   queryClient.invalidateQueries({ queryKey: ["tasks", "list"] })
//   → invalidates only list queries, not detail pages

export const taskKeys = {
  all:    ()                          => ["tasks"] as const,
  lists:  ()                          => ["tasks", "list"] as const,
  list:   (filter: string, q: string) => ["tasks", "list", { filter, q }] as const,
  detail: (id: number)                => ["tasks", "detail", id] as const,
};

// ─── INTERVIEW: staleTime vs gcTime ──────────────────────────────────────────
//
// staleTime: how long fresh data is considered "good enough" — no background
//            refetch on window focus or remount while within this window.
//            Default: 0 (always stale → refetch on every mount)
//
// gcTime:    how long UNUSED cached data stays in memory before being garbage-
//            collected (formerly cacheTime).
//            Default: 5 minutes
//
// Example: staleTime=30s, gcTime=5min
//   0s:  query runs, data cached ✓ fresh
//   25s: user switches tabs and back → still fresh, NO refetch
//   31s: user switches tabs and back → stale, background refetch fires
//   6min: user navigates away and back → cache is gone, fresh fetch

const API_BASE = "/api";

async function fetchTasksPage(
  cursor?: string,
  filter?: string,
  q?: string
): Promise<TasksPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (filter && filter !== "all") params.set("status", filter);
  if (q) params.set("q", q);

  const res = await fetch(`${API_BASE}/tasks?${params}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TasksPage>;
}

// ─── useQuery hook ────────────────────────────────────────────────────────────
export function useTasks(cursor?: string) {
  const filter = useStatusFilter();
  const search = useSearchQuery();

  return useQuery({
    queryKey: taskKeys.list(filter, search),
    queryFn: () => fetchTasksPage(cursor, filter, search),

    staleTime: 30_000,   // 30 seconds — fine for a task list
    // gcTime defaults to 5 min — cached data hangs around for navigation

    // keepPreviousData: show old page while new page loads (no flash of empty)
    placeholderData: keepPreviousData,
  });
}

// ─── Optimistic update mutation ───────────────────────────────────────────────
// INTERVIEW Q: "Walk through an optimistic update with rollback on failure."
//
// Steps:
//  1. onMutate:   snapshot old cache, apply optimistic change immediately
//  2. onError:    restore snapshot (rollback)
//  3. onSettled:  always refetch to sync with server truth

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  const filter = useStatusFilter();
  const search = useSearchQuery();
  const key = taskKeys.list(filter, search);

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Task["status"] }) => {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Task>;
    },

    // Step 1: Optimistically update the UI BEFORE the request completes
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key }); // stop any in-flight refetch

      const snapshot = qc.getQueryData<TasksPage>(key); // save current state

      // Apply optimistic change — user sees the update instantly
      qc.setQueryData<TasksPage>(key, (old) =>
        old
          ? { ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, status } : t)) }
          : old
      );

      return { snapshot }; // pass snapshot to onError via context
    },

    // Step 2: Rollback if the server rejects the mutation
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        qc.setQueryData(key, context.snapshot); // restore previous state
      }
    },

    // Step 3: Always refetch to reconcile with real server state
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// ─── useQuery deduplication ──────────────────────────────────────────────────
// INTERVIEW Q: "How does TanStack Query deduplicate simultaneous requests?"
//
// If 10 components mount and all call useQuery({ queryKey: ["tasks","list",{}] }),
// TanStack Query fires exactly ONE network request and shares the result with all 10.
// Components subscribe to the same cache entry — no duplicate fetches.
// AbortSignal: if the query key changes (e.g. filter changes), the in-flight
// request is cancelled via AbortSignal so stale data never overwrites new.

