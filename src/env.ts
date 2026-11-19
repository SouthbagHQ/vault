import type { Context } from 'hono';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Southbag Online Banking's Billing entrypoint (lib/banking.ts). */
  BANKING?: import('./lib/banking').BankingBilling;
  [binding: string]: unknown;
}

/** The signed-in user, as loaded from a session or API token. */
export interface SessionUser {
  id: string;
  handle: string;
  name: string;
  email: string | null;
  identity_picture: string | null;
  bearer?: boolean;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null } };
export type Ctx = Context<AppEnv>;
