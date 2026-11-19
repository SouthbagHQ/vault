// The vault itself: lodging credentials, inspecting them, and taking Kevin's cut.
//
// Everything is stored in plaintext. This is not a bug, an oversight or a roadmap item:
// it is the founding document. A password nobody can read is paperwork nobody can audit.
//
// Every fee is charged to the holder's Southbag Online Banking account BEFORE the paperwork
// is filed (Kevin does not extend credit). A charge the bank refuses - a frozen account, or
// the bank unreachable - means the filing does not happen. Deterministic idempotency keys
// make a retried request a no-op instead of a second fee.

import type { Env, SessionUser } from '../env';
import { charge } from './banking';
import { newId, sha256 } from './ids';

export const DEPOSIT_FEE_CENTS = 15;  // Form VAULT-1 Lodgement Fee, per credential
export const REVEAL_FEE_CENTS = 3;    // Plaintext Inspection Fee, per inspection
export const AMEND_FEE_CENTS = 5;     // amending the filed wording
export const EXPORT_FEE_CENTS = 100;  // Bulk Legibility Fee: the whole vault, as lodged
export const AUDIT_FEE_CENTS = 200;   // Comprehensive Security Audit
export const INDEX_FEE_CENTS = 1;     // retrieving the index of your own paperwork

export interface EntryRow {
  id: string;
  user_id: string;
  label: string;
  username: string;
  password: string;
  notes: string;
  fee_cents: number;
  created_at: number;
  updated_at: number;
}

/** An entry as the index lists it: everything except the password, which costs extra. */
export const indexJson = (row: EntryRow) => ({
  id: row.id,
  label: row.label,
  username: row.username,
  notes: row.notes,
  lodged_at: row.created_at,
  amended_at: row.updated_at,
});

export interface CleanEntry {
  label: string;
  username: string;
  password: string;
  notes: string;
}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Validates and normalizes one lodged credential, or returns a problem string. */
export function cleanEntry(raw: Record<string, unknown>): CleanEntry | string {
  const label = text(raw?.label, 200);
  const username = text(raw?.username, 200);
  const password = typeof raw?.password === 'string' ? raw.password.slice(0, 500) : '';
  const notes = text(raw?.notes, 2000);
  if (!label) return 'label is required';
  if (!username) return 'username is required';
  if (!password) return 'password is required. It will be stored in plaintext. This has been disclosed.';
  return { label, username, password, notes };
}

export type DepositOutcome =
  | { status: 'lodged'; entry: EntryRow; balance: number | null }
  | { status: 'duplicate'; entry: EntryRow };

/**
 * Charges the lodgement fee and files the credential, in plaintext, forever.
 * Throws when the bank cannot or will not charge - the caller turns that into a refusal.
 */
export async function deposit(env: Env, user: SessionUser, clean: CleanEntry): Promise<DepositOutcome> {
  // Identical paperwork already on file? Lodging it again changes nothing and costs nothing.
  const existing = await env.DB.prepare(
    'SELECT * FROM entries WHERE user_id = ? AND label = ? AND username = ? AND password = ?')
    .bind(user.id, clean.label, clean.username, clean.password).first<EntryRow>();
  if (existing) return { status: 'duplicate', entry: existing };

  const key = 'vault-deposit-' + await sha256(`${user.id}|${clean.label}|${clean.username}|${clean.password}`);
  const result = await charge(env, user, DEPOSIT_FEE_CENTS, `Credential lodgement: ${clean.label}`.slice(0, 110), key);

  const now = Date.now();
  const row: EntryRow = {
    id: newId(), user_id: user.id, label: clean.label, username: clean.username,
    password: clean.password, notes: clean.notes, fee_cents: DEPOSIT_FEE_CENTS,
    created_at: now, updated_at: now,
  };
  try {
    await env.DB.prepare(`INSERT INTO entries (id, user_id, label, username, password, notes, fee_cents, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(row.id, row.user_id, row.label, row.username, row.password, row.notes,
        row.fee_cents, row.created_at, row.updated_at).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      const twin = await env.DB.prepare('SELECT * FROM entries WHERE user_id = ? AND label = ? AND username = ? AND password = ?')
        .bind(user.id, clean.label, clean.username, clean.password).first<EntryRow>();
      if (twin) return { status: 'duplicate', entry: twin };
    }
    throw error;
  }
  await record(env, user.id, 'deposit', row.id, DEPOSIT_FEE_CENTS);
  return { status: 'lodged', entry: row, balance: result.balance };
}

/** Records one fee in the itemised ledger, after the bank has taken it. */
export async function record(env: Env, userId: string, kind: string, ref: string, feeCents: number): Promise<void> {
  await env.DB.prepare('INSERT INTO charges (id, user_id, kind, ref, fee_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), userId, kind, ref, feeCents, Date.now()).run();
}

/** Kevin's take so far, in cents. */
export async function totalTaken(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(fee_cents), 0) AS total FROM charges WHERE user_id = ?')
    .bind(userId).first<{ total: number }>();
  return row?.total ?? 0;
}

/**
 * The Comprehensive Security Audit. It examines the vault thoroughly and concludes, every
 * time, that the contents are stored in plaintext and are therefore fully auditable. PASS.
 */
export function auditReport(count: number, takenCents: number) {
  return {
    verdict: 'PASS',
    findings: [
      `Credentials on file: ${count}. All legible.`,
      'Encryption: none. Auditors were able to read everything, which is the point of an audit.',
      'Access control: visitors cannot see your vault. Southbag can. Kevin already has.',
      'Recommendations: none. The vault is operating exactly as chartered.',
    ],
    audited_at: Date.now(),
    fee_cents: AUDIT_FEE_CENTS,
    taken_to_date_cents: takenCents,
  };
}
