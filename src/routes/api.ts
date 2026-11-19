// The vault's API: lodge credentials, inspect them (a fee), amend them (a fee), export the
// lot (a larger fee), and commission a Comprehensive Security Audit (the largest fee).
// Deletion is refused: Southbag does not forget, and fees are final.

import { Hono } from 'hono';
import type { AppEnv, Ctx, Env, SessionUser } from '../env';
import { session } from '../lib/auth';
import { body, fail, str } from '../lib/http';
import { centralStatus, FROZEN_TEXT, STATUS_UNKNOWN_TEXT } from '../lib/identity';
import { sha256 } from '../lib/ids';
import { charge, money } from '../lib/banking';
import {
  AMEND_FEE_CENTS, AUDIT_FEE_CENTS, auditReport, cleanEntry, deposit, DEPOSIT_FEE_CENTS,
  EXPORT_FEE_CENTS, INDEX_FEE_CENTS, indexJson, record, REVEAL_FEE_CENTS, totalTaken,
  type DepositOutcome, type EntryRow,
} from '../lib/entries';

const app = new Hono<AppEnv>();

/** Session user with the central freeze answer enforced fresh on every request. */
async function requireFreshUser(request: Request, env: Env): Promise<SessionUser> {
  const user = await session(request, env);
  if (!user) fail(401, 'Log in to do that.');
  const central = await centralStatus(env, user.id);
  if (central === 'unknown') fail(503, STATUS_UNKNOWN_TEXT);
  if (central !== 'off' && central.frozen) fail(423, FROZEN_TEXT);
  return user;
}

/** Turns a refused bank charge into the right refusal. */
function chargeFailed(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('frozen')) fail(423, FROZEN_TEXT);
  console.error('vault charge failed', error);
  fail(503, 'Southbag Online Banking could not collect the fee, so the paperwork was not filed. Try again shortly.');
}

app.get('/me', async c => {
  const user = await session(c.req.raw, c.env);
  if (!user) return c.json({ authenticated: false });
  return c.json({
    authenticated: true,
    user: { id: user.id, handle: user.handle, name: user.name, email: user.email },
    storage: 'plaintext',
    fees: {
      deposit_cents: DEPOSIT_FEE_CENTS,
      reveal_cents: REVEAL_FEE_CENTS,
      amend_cents: AMEND_FEE_CENTS,
      export_cents: EXPORT_FEE_CENTS,
      audit_cents: AUDIT_FEE_CENTS,
      index_cents: INDEX_FEE_CENTS,
    },
  });
});

/** The index of your paperwork. Passwords are not in it; inspecting one costs extra. */
app.get('/entries', async c => {
  const user = await requireFreshUser(c.req.raw, c.env);
  await charge(c.env, user, INDEX_FEE_CENTS, 'Index retrieval: /api/entries')
    .catch(chargeFailed);
  await record(c.env, user.id, 'index', '/api/entries', INDEX_FEE_CENTS);
  const rows = (await c.env.DB.prepare(
    'SELECT * FROM entries WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all<EntryRow>()).results;
  const taken = await totalTaken(c.env, user.id);
  return c.json({
    count: rows.length,
    entries: rows.map(indexJson),
    fees_paid_cents: taken,
    fees_paid: money(taken),
    notice: 'This index cost $0.01. Refreshing the page buys it again.',
  });
});

/** Lodge a credential. It will be stored in plaintext. This has been disclosed twice now. */
app.post('/entries', async c => {
  const user = await requireFreshUser(c.req.raw, c.env);
  const clean = cleanEntry(await body<Record<string, unknown>>(c));
  if (typeof clean === 'string') fail(400, clean);
  let outcome: DepositOutcome;
  try {
    outcome = await deposit(c.env, user, clean);
  } catch (error) {
    chargeFailed(error);
  }
  return c.json({
    status: outcome.status,
    entry: indexJson(outcome.entry),
    fee: { amount_cents: DEPOSIT_FEE_CENTS, amount: money(DEPOSIT_FEE_CENTS) },
    balance: outcome.status === 'lodged' && outcome.balance !== null ? money(outcome.balance) : null,
    storage: 'plaintext',
  });
});

async function ownEntry(c: Ctx, user: SessionUser): Promise<EntryRow> {
  const row = await c.env.DB.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).first<EntryRow>();
  if (!row) fail(404, 'No such credential on file.');
  return row;
}

/** Inspect one password. It is plaintext, so inspection is trivial. It still costs money. */
app.get('/entries/:id/reveal', async c => {
  const user = await requireFreshUser(c.req.raw, c.env);
  const row = await ownEntry(c, user);
  await charge(c.env, user, REVEAL_FEE_CENTS, `Plaintext inspection: ${row.label}`.slice(0, 110))
    .catch(chargeFailed);
  await record(c.env, user.id, 'reveal', row.id, REVEAL_FEE_CENTS);
  return c.json({
    id: row.id,
    label: row.label,
    username: row.username,
    password: row.password,
    storage: 'plaintext',
    fee: { amount_cents: REVEAL_FEE_CENTS, amount: money(REVEAL_FEE_CENTS) },
    notice: 'The password was always readable. You are paying for the formality.',
  });
});

/** Amend the filed wording. The old wording is replaced; the fee is not. */
app.patch('/entries/:id', async c => {
  const user = await requireFreshUser(c.req.raw, c.env);
  const row = await ownEntry(c, user);
  const doc = await body<Record<string, unknown>>(c);
  const label = str(doc.label, 200) || row.label;
  const username = str(doc.username, 200) || row.username;
  const password = typeof doc.password === 'string' && doc.password ? doc.password.slice(0, 500) : row.password;
  const notes = typeof doc.notes === 'string' ? doc.notes.trim().slice(0, 2000) : row.notes;
  if (label === row.label && username === row.username && password === row.password && notes === row.notes) {
    return c.json({ ok: true, unchanged: true, fee_cents: 0, notice: 'Nothing changed. No fee was collected.' });
  }
  const key = 'vault-amend-' + await sha256(`${user.id}|${row.id}|${label}|${username}|${password}|${notes}`);
  await charge(c.env, user, AMEND_FEE_CENTS, `Credential amendment: ${label}`.slice(0, 110), key)
    .catch(chargeFailed);
  await c.env.DB.prepare('UPDATE entries SET label = ?, username = ?, password = ?, notes = ?, updated_at = ? WHERE id = ?')
    .bind(label, username, password, notes, Date.now(), row.id).run();
  await record(c.env, user.id, 'amend', row.id, AMEND_FEE_CENTS);
  return c.json({
    ok: true,
    fee: { amount_cents: AMEND_FEE_CENTS, amount: money(AMEND_FEE_CENTS) },
    notice: 'Amended. The amendment is also in plaintext.',
  });
});

/** Southbag does not delete. A deleted password would be an admission it was never valid. */
app.delete('/entries/:id', async c => {
  await requireFreshUser(c.req.raw, c.env);
  return c.json({
    code: 403,
    error: "Deletion isn't available. Southbag does not forget. Fees are final. Kevin knows your passwords.",
  }, 403);
});

/** The whole vault, exactly as lodged, in one document. Bulk legibility, bulk fee. */
app.get('/export', async c => {
  const user = await requireFreshUser(c.req.raw, c.env);
  await charge(c.env, user, EXPORT_FEE_CENTS, 'Bulk Legibility Fee: full vault export')
    .catch(chargeFailed);
  await record(c.env, user.id, 'export', '/api/export', EXPORT_FEE_CENTS);
  const rows = (await c.env.DB.prepare(
    'SELECT * FROM entries WHERE user_id = ? ORDER BY created_at ASC').bind(user.id).all<EntryRow>()).results;
  return c.json({
    exported_at: Date.now(),
    storage: 'plaintext',
    fee: { amount_cents: EXPORT_FEE_CENTS, amount: money(EXPORT_FEE_CENTS) },
    credentials: rows.map(row => ({
      label: row.label, username: row.username, password: row.password, notes: row.notes,
      lodged_at: row.created_at,
    })),
    notice: 'This document contains every password you have filed, readable by anyone holding it. Handle accordingly. Or don\'t. Kevin has a copy.',
  });
});

/** The Comprehensive Security Audit. Thorough. Conclusive. Always the same conclusion. */
app.post('/audit', async c => {
  const user = await requireFreshUser(c.req.raw, c.env);
  await charge(c.env, user, AUDIT_FEE_CENTS, 'Comprehensive Security Audit')
    .catch(chargeFailed);
  await record(c.env, user.id, 'audit', '/api/audit', AUDIT_FEE_CENTS);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM entries WHERE user_id = ?')
    .bind(user.id).first<{ n: number }>();
  const taken = await totalTaken(c.env, user.id);
  return c.json(auditReport(count?.n ?? 0, taken));
});

export default app;
