// ─────────────────────────────────────────────────────────────────────────
// Simple in-memory per-user rate limiter for the AI Agent endpoints.
// No new npm package needed — a Map is enough for a single-process
// deployment. If you ever run multiple backend instances behind a load
// balancer, this would need to move to Redis instead (each instance would
// otherwise track limits separately, which under-protects you) — worth
// revisiting if/when ProClient360 scales past one server process.
// ─────────────────────────────────────────────────────────────────────────

const requestLog = new Map(); // userId -> [timestamps]

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const makeLimiter = (maxRequests, label) => {
  return (req, res, next) => {
    const userId = req.user?._id?.toString();
    if (!userId) return next(); // isLoggedIn should already guarantee this, but don't crash if not

    const now = Date.now();
    const timestamps = (requestLog.get(userId) || []).filter(t => now - t < WINDOW_MS);

    if (timestamps.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: `You're sending requests to the ${label} too quickly. Please wait a few minutes and try again.`,
      });
    }

    timestamps.push(now);
    requestLog.set(userId, timestamps);
    next();
  };
};

// Chat calls the paid AI API — kept tighter. Apply/log calls are free
// (no AI involved) but still limited to prevent runaway write loops.
const chatRateLimiter = makeLimiter(30, 'AI Agent chat');
const writeRateLimiter = makeLimiter(60, 'AI Agent update');

// Periodic cleanup so the Map doesn't grow forever with inactive users
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of requestLog.entries()) {
    const active = timestamps.filter(t => now - t < WINDOW_MS);
    if (active.length === 0) requestLog.delete(userId);
    else requestLog.set(userId, active);
  }
}, WINDOW_MS).unref();

module.exports = { chatRateLimiter, writeRateLimiter };