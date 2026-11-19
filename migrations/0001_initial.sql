-- Southbag Vault: a password manager that stores everything in plaintext.
-- That is the product. Other password managers encrypt your passwords so even they cannot
-- read them; Southbag reviewed this arrangement and found it insufficiently legible.

CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- Southbag Identity sub
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  identity_picture TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The first login from an origin registers a public PKCE client with Southbag Identity
-- (dynamic client registration) and remembers it here. See src/lib/auth.ts.
CREATE TABLE oauth_clients (
  origin TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL DEFAULT '',
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_to TEXT,
  expires_at INTEGER NOT NULL
);

-- Sessions are opaque random tokens; only the hash is stored. The vault contents are
-- plaintext; the session tokens are not. Southbag protects what it cares about.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One row per filed credential. Every column is plaintext, by design: label, username,
-- password and notes are stored exactly as lodged. The lodgement fee is charged to the
-- holder's Southbag Online Banking account BEFORE the row is written; fee_cents records
-- what was taken.
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,              -- the site or service, as filed
  username TEXT NOT NULL,
  password TEXT NOT NULL,           -- plaintext. This is the feature.
  notes TEXT NOT NULL DEFAULT '',
  fee_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX entries_user ON entries(user_id, created_at DESC);

-- One row per fee taken: lodgements, inspections, amendments, exports, audits and index
-- retrievals, so the dashboard can total everything Kevin has taken.
CREATE TABLE charges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- deposit | reveal | amend | export | audit | index
  ref TEXT NOT NULL DEFAULT '',     -- entry id or endpoint, for the itemised record
  fee_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX charges_user ON charges(user_id, created_at DESC);
