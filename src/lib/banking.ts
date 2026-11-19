// Southbag Online Banking, through a service binding (BANKING in wrangler.jsonc) to its Billing
// entrypoint - RPC between Workers, not reachable from the internet. See ../banking/worker.js.
// Banking opens an account for anyone who doesn't have one. Local dev and tests have no bank:
// with BANKING_DEV=1 (scripts/test.sh) a stand-in answers instead (charges succeed).

import type { Env } from '../env';


export interface Customer { userId: string; email: string | null; name: string }

export interface BankingBilling {
  charge(input: Customer & { amount: number; product: string; description: string; idempotencyKey?: string }): Promise<{ balance: number; opened: boolean; duplicate?: boolean }>;
}

export const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

const dev = (env: Env) => String(env.BANKING_DEV ?? '') === '1';

/**
 * Takes `amount` cents from the user's Southbag Online Banking account. Throws if the bank
 * can't be reached or refuses (frozen account). An idempotencyKey makes a retried charge a
 * no-op (duplicate: true) instead of a second debit - Banking dedupes on it.
 */
export async function charge(env: Env, user: { id: string; email: string | null; name: string }, amount: number, description: string, idempotencyKey?: string) {
  if (dev(env)) return { balance: null, opened: false, duplicate: false };
  if (!env.BANKING) throw new Error('BANKING is not bound');
  const result = await env.BANKING.charge({
    userId: user.id,
    email: user.email,
    name: user.name,
    amount,
    product: 'Southbag Vault',
    description,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  return { balance: result.balance as number | null, opened: result.opened, duplicate: result.duplicate ?? false };
}

