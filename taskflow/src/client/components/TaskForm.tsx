// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "Controlled vs uncontrolled components — how do you build a form?"
// INTERVIEW Q: "How does useEffect cleanup work?"
// INTERVIEW Q: "How do you architect a custom hook with abort on unmount?"
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useId } from "react";

// ─── INTERVIEW: Controlled vs Uncontrolled components ────────────────────────
//
// Controlled:   React is the single source of truth. Value stored in state.
//               Every keystroke calls setState → re-render → input reflects state.
//               Use for: validation, conditional fields, submit handling.
//
// Uncontrolled: DOM is the source of truth. Read value via ref when needed.
//               Simpler, but harder to validate on-the-fly.
//               Use for: file inputs, third-party DOM libs.

interface TaskFormProps {
  onSubmit: (title: string, description: string) => void;
  isSubmitting?: boolean;
}

export function TaskForm({ onSubmit, isSubmitting = false }: TaskFormProps) {
  // CONTROLLED inputs — React owns the value
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState("");

  // useId: generates a stable, unique ID for label-input association (accessibility)
  const titleId = useId();
  const descId  = useId();

  // INTERVIEW Q: "How does useEffect cleanup work?"
  // Scenario: validate title with a debounced API call (check for duplicates).
  // If user types fast, we don't want the old validation to land after the new one.
  // The cleanup function runs BEFORE the next effect AND on unmount.
  useEffect(() => {
    if (!title) { setTitleError(""); return; }

    // AbortController: cancel the fetch if the effect re-runs (title changed)
    // or if the component unmounts — prevents "can't update state on unmounted component"
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/check-title?q=${encodeURIComponent(title)}`, {
          signal: controller.signal, // tied to this effect's lifecycle
        });
        const { exists } = await res.json() as { exists: boolean };
        if (exists) setTitleError("A task with this title already exists");
        else setTitleError("");
      } catch (err) {
        // AbortError is expected — don't treat as a real error
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Title check failed:", err);
        }
      }
    }, 400); // debounce: 400ms after user stops typing

    // CLEANUP — runs when title changes or component unmounts
    return () => {
      clearTimeout(timer);         // cancel the debounce timer
      controller.abort();          // cancel the in-flight fetch
    };
  }, [title]); // dependency array: re-run this effect when `title` changes

  // INTERVIEW Q: "useRef vs useState — what's the difference?"
  // useRef returns a mutable container whose .current change does NOT trigger
  // a re-render. Use for: DOM refs, storing previous values, interval IDs.
  const submitCountRef = useRef(0); // track submissions without causing re-renders

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) { setTitleError("Title is required"); return; }
    if (titleError)    return; // block submit if async validation pending

    submitCountRef.current += 1;
    console.log(`Submit #${submitCountRef.current}`);

    onSubmit(title.trim(), description.trim());
    setTitle("");
    setDescription("");
  }

  return (
    // INTERVIEW Q: "How do you make forms accessible?"
    // - <label htmlFor> ties label to input — click label → focuses input
    // - aria-describedby ties error message to input for screen readers
    // - aria-invalid signals validation state to assistive tech
    // - role="alert" on error → screen reader announces it immediately
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor={titleId}>Task title</label>
        <input
          id={titleId}
          type="text"
          value={title}                              // CONTROLLED: bound to state
          onChange={(e) => setTitle(e.target.value)} // state update on each keystroke
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? `${titleId}-error` : undefined}
          placeholder="What needs to be done?"
          disabled={isSubmitting}
        />
        {titleError && (
          <span id={`${titleId}-error`} role="alert" style={{ color: "red" }}>
            {titleError}
          </span>
        )}
      </div>

      <div>
        <label htmlFor={descId}>Description (optional)</label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={isSubmitting}
        />
      </div>

      <button type="submit" disabled={isSubmitting || Boolean(titleError)}>
        {isSubmitting ? "Saving…" : "Add Task"}
      </button>
    </form>
  );
}

