// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "What causes a React component to re-render?"
// INTERVIEW Q: "Why do keys matter in list reconciliation?"
// INTERVIEW Q: "When do React.memo and useCallback actually help?"
// INTERVIEW Q: "How does Error Boundary work, and what doesn't it catch?"
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, memo, Component, type ReactNode } from "react";
import { useTasks, useUpdateTaskStatus } from "../hooks/useTasks.js";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Task {
  id: number;
  title: string;
  status: "todo" | "in_progress" | "done";
}

// ─── INTERVIEW: What triggers a re-render? ───────────────────────────────────
//
// A component re-renders when:
//  1. Its own state changes (useState / useReducer)
//  2. A context it consumes changes
//  3. Its PARENT re-renders (unless wrapped in React.memo)
//  4. A hook it uses returns a new value

// ─── Error Boundary ──────────────────────────────────────────────────────────
// INTERVIEW Q: "How do Error Boundaries work, and what don't they catch?"
//
// Error Boundaries are CLASS components — only they can implement
// componentDidCatch / getDerivedStateFromError.
// They catch errors thrown during RENDER and in lifecycle methods of children.
//
// They do NOT catch:
//  - Errors inside async callbacks (setTimeout, fetch .then, event handlers)
//  - Errors in the Error Boundary itself
//  - Server-side rendering errors
//  Fix for async: wrap in try/catch and call setState to trigger the boundary.

interface ErrorBoundaryState { hasError: boolean; message: string }

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", err, info.componentStack);
    // In production: send to Sentry / Datadog here
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role="alert" className="error-banner">
          Something went wrong: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── TaskItem — memoized to prevent parent-triggered re-renders ───────────────
// INTERVIEW Q: "When does React.memo genuinely help vs when is it pointless?"
//
// React.memo wraps a component and does a SHALLOW comparison of props.
// Re-renders only if a prop actually changed.
//
// Helpful when: parent re-renders often, component is expensive to render,
//               and props are stable (primitive values or memoized objects/fns).
//
// Pointless when: props change on every parent render anyway (unstable refs),
//                 or the component is trivially cheap to render.

interface TaskItemProps {
  task: Task;
  onStatusChange: (id: number, status: Task["status"]) => void; // must be stable!
}

const TaskItem = memo(function TaskItem({ task, onStatusChange }: TaskItemProps) {
  console.log(`[Render] TaskItem #${task.id}`); // Uncomment to see render count

  return (
    <li key={task.id} className="task-item">
      <span>{task.title}</span>
      <select
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value as Task["status"])}
        aria-label={`Status for ${task.title}`}
      >
        <option value="todo">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
      </select>
    </li>
  );
});

// ─── TaskList — the parent component ─────────────────────────────────────────
export function TaskList() {
  const { data, isLoading, isError, error } = useTasks();
  const { mutate: updateStatus } = useUpdateTaskStatus();

  // INTERVIEW Q: "Why use useCallback here?"
  // Without useCallback, `handleStatusChange` is a NEW function reference on
  // every render of TaskList. React.memo on TaskItem compares props shallowly —
  // a new function reference = TaskItem re-renders even if tasks didn't change.
  // useCallback memoizes the function so TaskItem sees the SAME reference.
  const handleStatusChange = useCallback(
    (id: number, status: Task["status"]) => updateStatus({ id, status }),
    [updateStatus] // stable — useMutation returns a stable mutate fn
  );

  if (isLoading) return <p role="status">Loading tasks…</p>;
  if (isError)   return <p role="alert">Error: {(error as Error).message}</p>;

  const tasks = data?.tasks ?? [];

  if (tasks.length === 0) return <p>No tasks found. Create one!</p>;

  return (
    // INTERVIEW Q: "Why are stable keys important?"
    // React uses keys to match OLD virtual DOM nodes to NEW ones (reconciliation).
    //
    // Array index as key:  [a,b,c] → remove b → [a,c]
    //   index 0→a, 1→c    React thinks index-1 changed (was b, now c) — wrong!
    //   React will reuse the b DOM node and patch it to look like c — state corruption.
    //
    // Stable unique ID:    key={task.id} → React knows exactly which node was removed
    //   Correctly unmounts b, keeps a and c untouched.
    <ul aria-label="Task list">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onStatusChange={handleStatusChange} />
      ))}
    </ul>
  );
}

