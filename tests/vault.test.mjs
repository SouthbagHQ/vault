import assert from 'node:assert/strict';
import { test } from 'node:test';

const BASE = process.env.BASE || 'http://localhost:8799';

const json = async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) });

const call = (method, path, { cookie, data } = {}) => {
  const headers = {};
  if (cookie) headers.cookie = `southbag_vault_session=${cookie}`;
  if (data) headers['content-type'] = 'application/json';
  return fetch(BASE + path, { method, headers, body: data ? JSON.stringify(data) : undefined }).then(json);
};

const as = (who) => ({
  get: (path) => call('GET', path, { cookie: `dev-${who}` }),
  post: (path, data) => call('POST', path, { cookie: `dev-${who}`, data }),
  patch: (path, data) => call('PATCH', path, { cookie: `dev-${who}`, data }),
  del: (path) => call('DELETE', path, { cookie: `dev-${who}` }),
});

const alice = as('alice'), bob = as('bob'), erin = as('erin'), frank = as('frank');

const credential = (label, extra = {}) => ({
  label, username: `${label.toLowerCase()}-user`, password: `hunter2-${label}`, ...extra,
});

test('the vault is closed to strangers', async () => {
  const anon = await call('GET', '/api/entries');
  assert.equal(anon.status, 401);
  const me = await call('GET', '/api/me');
  assert.equal(me.body.authenticated, false);
});

test('me discloses the storage and the fee schedule', async () => {
  const me = await alice.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.user.handle, 'alice');
  assert.equal(me.body.storage, 'plaintext');
  assert.ok(me.body.fees.deposit_cents > 0);
});

test('lodge a credential, then find it in the index without its password', async () => {
  const lodged = await alice.post('/api/entries', credential('Bank of Kevin'));
  assert.equal(lodged.status, 200, JSON.stringify(lodged.body));
  assert.equal(lodged.body.status, 'lodged');
  assert.equal(lodged.body.storage, 'plaintext');
  assert.equal(lodged.body.fee.amount, '$0.15');
  assert.equal(lodged.body.entry.label, 'Bank of Kevin');
  assert.equal(lodged.body.entry.password, undefined, 'the index never carries the password');

  const index = await alice.get('/api/entries');
  assert.equal(index.status, 200);
  assert.equal(index.body.count, 1);
  assert.equal(index.body.entries[0].label, 'Bank of Kevin');
  assert.ok(index.body.fees_paid_cents >= 16, 'lodgement plus index retrieval are itemised');
});

test('identical paperwork lodged twice costs nothing the second time', async () => {
  const again = await alice.post('/api/entries', credential('Bank of Kevin'));
  assert.equal(again.status, 200);
  assert.equal(again.body.status, 'duplicate');
  const index = await alice.get('/api/entries');
  assert.equal(index.body.count, 1, 'no second row');
});

test('inspection returns the plaintext and charges for the formality', async () => {
  const lodged = await alice.post('/api/entries', credential('Groggle Mail'));
  const id = lodged.body.entry.id;
  const reveal = await alice.get(`/api/entries/${id}/reveal`);
  assert.equal(reveal.status, 200);
  assert.equal(reveal.body.password, 'hunter2-Groggle Mail');
  assert.equal(reveal.body.storage, 'plaintext');
  assert.equal(reveal.body.fee.amount, '$0.03');
});

test('amending the filed wording costs money; a no-op amendment does not', async () => {
  const lodged = await bob.post('/api/entries', credential('Facespace'));
  const id = lodged.body.entry.id;
  const amended = await bob.patch(`/api/entries/${id}`, { password: 'correct horse battery staple' });
  assert.equal(amended.status, 200, JSON.stringify(amended.body));
  assert.equal(amended.body.fee.amount, '$0.05');
  const reveal = await bob.get(`/api/entries/${id}/reveal`);
  assert.equal(reveal.body.password, 'correct horse battery staple');

  const noop = await bob.patch(`/api/entries/${id}`, {});
  assert.equal(noop.status, 200);
  assert.equal(noop.body.unchanged, true);
  assert.equal(noop.body.fee_cents, 0);
});

test('one holder cannot inspect another holder\'s paperwork', async () => {
  const index = await alice.get('/api/entries');
  const mine = index.body.entries[0];
  const snooping = await bob.get(`/api/entries/${mine.id}/reveal`);
  assert.equal(snooping.status, 404);
});

test('deletion is refused, forever', async () => {
  const index = await alice.get('/api/entries');
  const refused = await alice.del(`/api/entries/${index.body.entries[0].id}`);
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Deletion isn't available/);
  const still = await alice.get('/api/entries');
  assert.equal(still.body.count, index.body.count, 'nothing was deleted');
});

test('export hands over every password in plaintext for $1.00', async () => {
  const exported = await alice.get('/api/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.body.storage, 'plaintext');
  assert.equal(exported.body.fee.amount, '$1.00');
  assert.equal(exported.body.credentials.length, 2);
  for (const row of exported.body.credentials) {
    assert.ok(row.password.startsWith('hunter2-'), 'every credential is legible');
  }
});

test('the Comprehensive Security Audit passes, as chartered', async () => {
  const audit = await alice.post('/api/audit', {});
  assert.equal(audit.status, 200);
  assert.equal(audit.body.verdict, 'PASS');
  assert.ok(audit.body.findings.some((f) => f.includes('Encryption: none')));
});

test('a frozen account cannot touch its vault', async () => {
  const index = await erin.get('/api/entries');
  assert.equal(index.status, 423);
  const lodged = await erin.post('/api/entries', credential('Frozen Service'));
  assert.equal(lodged.status, 423);
});

test('when Identity cannot answer, everything fails closed', async () => {
  const index = await frank.get('/api/entries');
  assert.equal(index.status, 503);
});

test('missing fields are rejected before any fee', async () => {
  const bad = await alice.post('/api/entries', { label: 'No Password Here', username: 'someone' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /password is required/);
});
