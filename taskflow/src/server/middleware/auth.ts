// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How does Express middleware work? Why must error handlers
//              have exactly 4 parameters?"
// INTERVIEW Q: "How do you architect JWT auth with refresh tokens?"
// ─────────────────────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const ACCESS_SECRET  = process.env["JWT_SECRET"]  ?? "dev-access-secret";
const REFRESH_SECRET = process.env["REFRESH_SECRET"] ?? "dev-refresh-secret";

// ─── Token shapes ────────────────────────────────────────────────────────────
export interface TokenPayload {
  userId: number;
  email: string;
}

// ─── Token factory ───────────────────────────────────────────────────────────
export function signAccessToken(payload: TokenPayload): string {
  // Short-lived — 15 minutes. If stolen, limited damage window.
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload): string {
  // Long-lived — 7 days. Stored in HttpOnly cookie (NOT localStorage).
  // HttpOnly: JavaScript cannot read it → XSS-proof.
  // SameSite=Strict: CSRF-proof for same-origin forms.
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

// ─── Auth middleware ─────────────────────────────────────────────────────────
// Middleware signature: (req, res, next) — 3 params
// Express identifies a middleware vs error handler by parameter count.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    // 401 = "who are you?" (unauthenticated)
    // 403 = "I know who you are, but no" (unauthorized)
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as TokenPayload;
    // Attach the decoded user to the request object for downstream handlers
    (req as Request & { user: TokenPayload }).user = payload;
    next(); // pass control to the next middleware / route handler
  } catch {
    // Token is expired or tampered — client should use refresh token
    res.status(401).json({ error: "Token expired or invalid" });
  }
}

// ─── INTERVIEW: "What are the security trade-offs: HttpOnly cookie vs localStorage?"
//
// localStorage:
//  ✗ Readable by JavaScript → vulnerable to XSS attacks
//  ✓ Easy to send in Authorization header
//
// HttpOnly cookie:
//  ✓ JavaScript CANNOT read it → XSS-proof
//  ✓ Browser sends it automatically
//  ✗ Vulnerable to CSRF unless you add SameSite=Strict or a CSRF token
//
// Best practice: access token in memory (JS variable), refresh token in
// HttpOnly + SameSite=Strict cookie.

