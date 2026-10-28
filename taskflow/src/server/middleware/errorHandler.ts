// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How does the Express middleware pipeline flow?"
// INTERVIEW Q: "Why must global error-handling middleware have 4 parameters?"
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";

// ─── Application-level error class ──────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ─── 404 handler — catches any unmatched routes ──────────────────────────────
// Must be placed AFTER all route definitions in app.ts.
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Route ${req.method} ${req.path} not found`));
}

// ─── Global error handler ─────────────────────────────────────────────────────
// CRITICAL: Express detects error handlers by checking fn.length === 4.
// If you omit `err`, Express treats it as a regular middleware and SKIPS it.
// Always define all 4 parameters, even if you don't use `next`.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction // must be declared even if unused
): void {
  // Handle our known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Handle Zod validation errors (from request body parsing)
  if (err instanceof Error && err.name === "ZodError") {
    res.status(422).json({
      error: "Validation failed",
      // 422 Unprocessable Entity — the body is syntactically correct JSON
      // but semantically invalid (wrong types, missing fields).
      // 400 Bad Request — the request itself is malformed (bad JSON).
      details: JSON.parse(err.message),
    });
    return;
  }

  // Unknown errors — log and return generic 500
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "Internal server error" });
}

// ─── How the pipeline flows ─────────────────────────────────────────────────
//
//  Request → [cors] → [helmet] → [json parser] → [requireAuth] → [route handler]
//                                                                       ↓
//  Response ← [errorHandler] ← [notFound] ← next(err) or unmatched route
//
// Each middleware either:
//  a) calls next()         → passes to next middleware
//  b) calls next(err)      → jumps directly to error handler (skips regular middlewares)
//  c) sends a response     → pipeline ends

