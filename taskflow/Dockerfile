# ─────────────────────────────────────────────────────────────────────────────
# INTERVIEW Q: "How do multi-stage Dockerfile builds reduce image size?"
# INTERVIEW Q: "Why must a Node.js container not run as root?"
# INTERVIEW Q: "What is the difference between CMD and ENTRYPOINT?"
# INTERVIEW Q: "Why does COPY package*.json come before COPY . ?"
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# Use a full Node image to compile TypeScript.
# This stage is DISCARDED in the final image — dev tools never ship to prod.
FROM node:20-alpine AS builder

WORKDIR /app

# INTERVIEW Q: "Why copy package files before the source code?"
# Docker builds images in LAYERS. Each instruction is a cached layer.
# If package.json didn't change, this layer is reused — npm install is SKIPPED.
# Copying source first would bust the cache on every code change.
COPY package*.json ./
RUN npm ci --ignore-scripts   # ci = clean install, reproducible from lockfile

# Now copy source (busts cache only when code changes)
COPY tsconfig.json ./
COPY src ./src
RUN npm run build             # tsc → dist/

# ─── Stage 2: Production image ───────────────────────────────────────────────
# Start from scratch — no dev dependencies, no build tools, no TypeScript.
# Final image is ~4x smaller and has a smaller attack surface.
FROM node:20-alpine AS production

WORKDIR /app

# Only install PRODUCTION dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# ─── Security: run as non-root user ──────────────────────────────────────────
# INTERVIEW Q: "Why not run as root?"
# If an attacker exploits the app, root access = full container control.
# node:alpine already has a `node` user (uid 1000).
RUN chown -R node:node /app
USER node

# Expose the port (documentation only — doesn't actually publish it)
EXPOSE 3000

# ─── CMD vs ENTRYPOINT ───────────────────────────────────────────────────────
# ENTRYPOINT: the fixed executable. Cannot be overridden at runtime (easily).
# CMD:        default arguments. Can be overridden: `docker run image npm test`
#
# Using node directly (not `npm start`) so the Node process is PID 1 and
# receives OS signals (SIGTERM) directly.
# npm start makes npm PID 1 — npm SWALLOWS SIGTERM → graceful shutdown broken.

ENTRYPOINT ["node"]
CMD ["dist/server/app.js"]

