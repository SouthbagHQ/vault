import { HTTPException } from 'hono/http-exception';
import type { Ctx, SessionUser } from '../env';

/** Throw from anywhere in a handler; the app turns it into `{ error }` JSON. */
export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 423 | 429 | 500 | 502 | 503, message: string): never {
  throw new HTTPException(status, { message });
}

/** The signed-in user, or a 401. */
export function requireUser(c: Ctx): SessionUser {
  const user = c.get('user');
  if (!user) fail(401, 'Log in to do that.');
  return user;
}

export async function body<T = Record<string, unknown>>(c: Ctx): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Trimmed string from untrusted input, cut to `max` characters. */
export function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
