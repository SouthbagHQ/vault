// Southbag Vault — one Cloudflare Worker on the free plan.
// Static files in public/ are served by Workers Assets (free, no Worker invocation). Only
// /auth/* and /api/* reach this code (see run_worker_first in wrangler.jsonc).

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './env';
import { callback, login, logout, safeReturnTo } from './lib/auth';
import api from './routes/api';

const app = new Hono<AppEnv>();

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ code: error.status, error: error.message }, error.status);
  console.error(error);
  return c.json({ code: 500, error: 'Something went wrong.' }, 500);
});
app.notFound(c => c.json({ code: 404, error: 'Not found.' }, 404));

// ── Auth ──
app.get('/auth/login', c => login(c.req.raw, c.env, safeReturnTo(c.req.query('next'))));
app.get('/auth/callback', c => callback(c.req.raw, c.env));
app.get('/auth/logout', c => logout(c.req.raw, c.env));
app.post('/auth/logout', c => logout(c.req.raw, c.env));

// ── API ──
app.route('/api', api);

// No cron janitor: the account's free plan is at its cron-trigger limit. Expired OAuth
// states are swept on every login and dead sessions are refused and removed on sight, so
// nothing depends on a scheduled sweep.
export default { fetch: app.fetch };
