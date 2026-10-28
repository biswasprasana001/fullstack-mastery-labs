// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "type vs interface in TypeScript — when do you use each?"
// INTERVIEW Q: "What are generics, unknown, any, never, and utility types?"
// INTERVIEW Q: "How do discriminated unions and type guards work?"
// ─────────────────────────────────────────────────────────────────────────────

// ─── 1. interface vs type ───────────────────────────────────────────────────
//
// interface:  for object shapes. Supports DECLARATION MERGING (two interfaces
//             with the same name automatically merge — useful for extending
//             third-party types).
//
// type:       for everything else — unions, tuples, mapped types, primitives.
//             Cannot be merged, but can express things interface cannot.

interface User {
  id: number;
  name: string;
  email: string;
}

// Declaration merging — you can ADD fields to an existing interface
interface User {
  createdAt: Date; // merged in; `type` cannot do this
}

// type alias — union, tuple, literal types
type Status = "todo" | "in_progress" | "done"; // union — interface can't do this
type Pair = [string, number];                    // tuple — interface can't do this
type UserWithStatus = User & { status: Status }; // intersection

// Rule of thumb: use interface for object shapes in APIs; use type for unions,
// tuples, and when composing complex derived types.

// ─── 2. Generics — write once, use for any type ─────────────────────────────
// INTERVIEW Q: "Write a typed function that returns the first element of any array."

function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const firstNum = first([1, 2, 3]);   // inferred: number | undefined
const firstStr = first(["a", "b"]);  // inferred: string | undefined

// Generic constraint — T must have an `id` field
function findById<T extends { id: number }>(items: T[], id: number): T | undefined {
  return items.find((item) => item.id === id);
}

// ─── 3. Utility types — derive new types from existing ones ─────────────────
type CreateTaskDTO = Omit<UserWithStatus, "id" | "createdAt">; // remove fields
type PartialUser = Partial<User>;                               // all fields optional
type ReadonlyUser = Readonly<User>;                             // no mutation allowed
type UserRecord = Record<string, User>;                         // string-keyed map
type UserName = Pick<User, "name" | "email">;                  // keep only these

// ReturnType — infer what a function returns
function getTask() {
  return { id: 1, title: "Write tests", status: "todo" as Status };
}
type Task = ReturnType<typeof getTask>; // { id: number; title: string; status: Status }

// ─── 4. unknown vs any vs never ─────────────────────────────────────────────
//
// any:     opts OUT of type checking. Anything goes. Avoid — defeats TypeScript.
// unknown: type-safe alternative to any. You MUST narrow it before using it.
// never:   a value that can NEVER exist. Used for exhaustive checks and errors.

function parseJson(raw: string): unknown {
  return JSON.parse(raw); // returns unknown — we don't know the shape yet
}

const parsed = parseJson('{"id": 1}');

// Must narrow `unknown` before using it
if (typeof parsed === "object" && parsed !== null && "id" in parsed) {
  console.log("safe id:", (parsed as { id: number }).id);
}

// never — exhaustive union check. If you add a new Status and forget to handle
// it, TypeScript will error here at compile time.
function assertNever(x: never): never {
  throw new Error(`Unhandled status: ${JSON.stringify(x)}`);
}

function getLabel(status: Status): string {
  switch (status) {
    case "todo":        return "To Do";
    case "in_progress": return "In Progress";
    case "done":        return "Done";
    default:            return assertNever(status); // compile error if Status grows
  }
}

// ─── 5. Discriminated unions + type guards ──────────────────────────────────
// INTERVIEW Q: "How do you safely handle polymorphic API responses?"

type ApiSuccess<T> = { ok: true; data: T };
type ApiError    = { ok: false; error: string; statusCode: number };
type ApiResponse<T> = ApiSuccess<T> | ApiError;

// User-defined type guard — `param is Type` syntax
function isSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.ok === true; // the DISCRIMINANT field
}

function handleResponse<T>(res: ApiResponse<T>): T {
  if (isSuccess(res)) {
    return res.data; // TypeScript knows res is ApiSuccess<T> here
  }
  // TypeScript knows res is ApiError here
  throw new Error(`[${res.statusCode}] ${res.error}`);
}

// Export to keep TypeScript happy
export { User, Status, Task, getLabel, handleResponse, findById, first };

