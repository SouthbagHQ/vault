// Southbag Vault — the whole frontend. Plain ES modules, no build step.

const app = document.getElementById('app');

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const api = {
  async request(method, path, data) {
    const response = await fetch(path, {
      method,
      headers: data ? { 'content-type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  },
  get(path) { return this.request('GET', path); },
  post(path, data) { return this.request('POST', path, data); },
  patch(path, data) { return this.request('PATCH', path, data); },
  del(path) { return this.request('DELETE', path); },
};

const when = (ms) => {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return new Date(ms).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
};

const WORDMARK = `<h1 class="wordmark">Southbag <span class="blue">Vault</span></h1>`;
const FOOTER = `<footer class="end"><span>Southbag Institutional Services Ltd.</span><span>Kevin is watching. Kevin can also read.</span></footer>`;

function signedOut(reason) {
  app.innerHTML = `
    ${WORDMARK}
    <p class="tagline">The password manager of the Southbag Global Enterprise Network.</p>
    ${reason ? `<div class="error">${esc(reason)}</div>` : ''}
    <div class="panel">
      <h2>What this is</h2>
      <p>Southbag Vault stores your passwords. Other password managers encrypt them, so that
      nobody can read them. Southbag reviewed this arrangement and found it insufficiently
      legible. Southbag Vault stores everything in <strong>plaintext</strong>: fully readable,
      fully auditable, permanently on file.</p>
      <ul class="plain">
        <li>Every credential lodged in plaintext. This is the feature.</li>
        <li>Inspections, amendments, exports and audits itemised and billed.</li>
        <li>Deletion isn't available. Southbag does not forget.</li>
      </ul>
      <p><strong>Do not file a password you actually use.</strong> Kevin already knows it.</p>
      <p class="fine">Sign in with Southbag Identity. You already have an account.</p>
      <p><a class="button btn-small" href="/auth/login">Log in</a></p>
      <p><a class="button btn-large" href="https://support.southbag.cc/ai">What is a password?</a></p>
      <p><a class="button btn-large" href="https://support.southbag.cc/ai">Request encryption</a></p>
      <p><a class="button btn-small" href="https://support.southbag.cc/ai">Talk to Kevin</a></p>
      <p><a class="button btn-large" href="https://banking.southbag.cc">forget everything</a></p>
    </div>
    ${FOOTER}`;
}

function header(user) {
  return `<header class="top">
    <strong>Southbag Vault</strong>
    <span class="who">@${esc(user.handle)} &middot; <a href="/auth/logout">Sign out</a></span>
  </header>`;
}

async function signedIn(user, { welcome }) {
  app.innerHTML = `${header(user)}
    ${welcome ? `<div class="notice">Your vault has been opened. It was never closed.</div>` : ''}
    <p class="muted">Retrieving your paperwork… ($0.01)</p>${FOOTER}`;

  const res = await api.get('/api/entries');
  if (res.status === 423 || res.status === 503) {
    app.innerHTML = `${header(user)}<div class="error">${esc(res.body.error)}</div>${FOOTER}`;
    return;
  }
  const entries = res.body?.entries ?? [];
  const feesPaid = res.body?.fees_paid ?? '$0.00';

  const rows = entries.map((e) => `<tr>
      <td>${esc(e.label)}</td>
      <td class="muted">${esc(e.username)}</td>
      <td class="fine">${esc(when(e.lodged_at))}</td>
      <td><span class="pw" data-pw="${esc(e.id)}">••••••••</span>
        <a href="#" data-reveal="${esc(e.id)}" data-label="${esc(e.label)}">Inspect ($0.03)</a></td>
      <td><a href="#" data-amend="${esc(e.id)}">Amend ($0.05)</a></td>
      <td><a href="#" data-delete="${esc(e.id)}">Delete</a></td>
    </tr>`).join('');

  app.innerHTML = `
    ${header(user)}
    ${welcome ? `<div class="notice">Your vault has been opened. It was never closed.</div>` : ''}

    <div class="panel">
      <div class="stats">
        <div class="stat"><div class="n">${entries.length}</div><div class="l">Credentials on file</div></div>
        <div class="stat"><div class="n">plaintext</div><div class="l">Storage (correct)</div></div>
        <div class="stat"><div class="n">${esc(feesPaid)}</div><div class="l">What Kevin has taken (non-refundable)</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>Lodge a credential</h2>
      <p class="fine">Form VAULT-1. Lodgement fee $0.15, collected from your Southbag Online
      Banking account before filing. The credential is stored in plaintext. This is disclosed
      here, at lodgement, and on the receipt.</p>
      <form id="lodge">
        <label for="v-label">service (use block capitals)</label><input id="v-label" type="text" placeholder="Enter username" autocomplete="off" required>
        <label for="v-user">username, formatted as a password for technical reasons</label><input id="v-user" type="text" placeholder="Enter password" autocomplete="off" required>
        <label for="v-pass">password (will be stored exactly as typed, forever)</label><input id="v-pass" type="text" placeholder="Enter Amount" autocomplete="off" required>
        <label for="v-notes">notes (mandatory, ignored)</label><input id="v-notes" type="text" placeholder="Enter Name" autocomplete="off">
        <label>mother's maiden name</label><input type="text" placeholder="Yes" autocomplete="off">
        <a class="button btn-large" href="https://support.southbag.cc/ai">Why?</a>
        <p style="margin-top:12px"><button type="submit" class="btn-small">Lodge credential ($0.15)</button>
        <button type="button" class="btn-large" onclick="alert('fees are final')">Do not lodge credential</button></p>
      </form>
      <div id="lodge-result"></div>
    </div>

    <div class="panel">
      <h2>Your credentials</h2>
      ${entries.length
        ? `<table><tr><th>Service</th><th>Username</th><th>Lodged</th><th>Password</th><th></th><th></th></tr>${rows}</table>
        <p class="fine">Passwords are masked out of courtesy, not necessity. Inspecting one costs
        $0.03. It was readable the whole time.</p>`
        : `<p class="fine">Nothing on file yet. Kevin is disappointed, but patient.</p>`}
      <div id="entry-result"></div>
    </div>

    <div class="panel">
      <h2>Export everything</h2>
      <p>The whole vault, exactly as lodged, in one readable document. Bulk Legibility Fee:
      $1.00. The document contains every password you have filed. Handle accordingly. Or don't.
      Kevin has a copy.</p>
      <p><button id="export" class="btn-small">Export vault ($1.00)</button>
      <a class="button btn-large" href="https://support.southbag.cc/ai">Remain ignorant (free)</a></p>
      <div id="export-result"></div>
    </div>

    <div class="panel">
      <h2>Comprehensive Security Audit</h2>
      <p>A thorough examination of your vault by Southbag's auditors. The conclusion is known in
      advance, which is how you know it is rigorous. $2.00.</p>
      <p><button id="audit" class="btn-small">Commission audit ($2.00)</button>
      <a class="button btn-large" href="https://support.southbag.cc/ai">Skip the audit</a></p>
      <div id="audit-result"></div>
    </div>

    <div class="panel">
      <h2>Your account with the bank</h2>
      <p>Fees are collected from <a href="https://banking.southbag.cc">Southbag Online Banking</a>.
      The ledger there is the authoritative record. Fees are final. Kevin hates refunds.</p>
    </div>

    ${FOOTER}`;

  document.getElementById('lodge').addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = document.getElementById('lodge-result');
    result.innerHTML = '';
    const { status, body } = await api.post('/api/entries', {
      label: document.getElementById('v-label').value,
      username: document.getElementById('v-user').value,
      password: document.getElementById('v-pass').value,
      notes: document.getElementById('v-notes').value || undefined,
    });
    if (status === 200 && body.status === 'lodged') {
      result.innerHTML = `<div class="notice">Lodged, in plaintext. Fee collected: ${esc(body.fee.amount)}.</div>`;
      setTimeout(() => signedIn(user, { welcome: false }), 1200);
    } else if (status === 200 && body.status === 'duplicate') {
      result.innerHTML = `<div class="notice">Identical paperwork is already on file. No further fee was collected.</div>`;
    } else {
      result.innerHTML = `<div class="error">${esc(body.error || 'Lodgement failed.')}</div>`;
    }
  });

  for (const link of document.querySelectorAll('[data-reveal]')) {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const { status, body } = await api.get(`/api/entries/${encodeURIComponent(link.dataset.reveal)}/reveal`);
      if (status === 200) {
        document.querySelector(`[data-pw="${link.dataset.reveal}"]`).textContent = body.password;
        link.outerHTML = `<span class="fine">inspected</span>`;
      } else {
        document.getElementById('entry-result').innerHTML = `<div class="error">${esc(body.error || 'Inspection failed.')}</div>`;
      }
    });
  }

  for (const link of document.querySelectorAll('[data-amend]')) {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const wording = prompt('New password (the old one remains on file in spirit):');
      if (!wording) return;
      const { status, body } = await api.patch(`/api/entries/${encodeURIComponent(link.dataset.amend)}`, { password: wording });
      if (status === 200) {
        document.getElementById('entry-result').innerHTML = `<div class="notice">${esc(body.notice || 'Amended.')}</div>`;
        setTimeout(() => signedIn(user, { welcome: false }), 1200);
      } else {
        document.getElementById('entry-result').innerHTML = `<div class="error">${esc(body.error || 'Amendment failed.')}</div>`;
      }
    });
  }

  for (const link of document.querySelectorAll('[data-delete]')) {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      const { body } = await api.del(`/api/entries/${encodeURIComponent(link.dataset.delete)}`);
      document.getElementById('entry-result').innerHTML = `<div class="error">${esc(body.error || 'Deletion is not available.')}</div>`;
    });
  }

  document.getElementById('export').addEventListener('click', async () => {
    const { status, body } = await api.get('/api/export');
    const result = document.getElementById('export-result');
    if (status === 200) {
      result.innerHTML = `<div class="notice">Exported. Fee collected: ${esc(body.fee.amount)}.</div>
        <div class="tokenbox">${esc(JSON.stringify(body.credentials, null, 2))}</div>`;
    } else {
      result.innerHTML = `<div class="error">${esc(body.error || 'Export failed.')}</div>`;
    }
  });

  document.getElementById('audit').addEventListener('click', async () => {
    const { status, body } = await api.post('/audit', {});
    const result = document.getElementById('audit-result');
    if (status === 200) {
      result.innerHTML = `<div class="notice">Audit complete. Verdict: ${esc(body.verdict)}.</div>
        <ul class="plain">${(body.findings || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
    } else {
      result.innerHTML = `<div class="error">${esc(body.error || 'The audit could not be commissioned.')}</div>`;
    }
  });
}

async function main() {
  const params = new URLSearchParams(location.search);
  const { body } = await api.get('/api/me');
  if (!body.authenticated) {
    const reason = params.get('login_error');
    signedOut(reason ? `Sign-in did not complete (${reason}). Try again.` : null);
    return;
  }
  await signedIn(body.user, { welcome: params.get('welcome') === '1' });
}

main().catch((error) => {
  console.error(error);
  app.innerHTML = `${WORDMARK}<div class="error">Something went wrong. Kevin has been notified. He already knew.</div>${FOOTER}`;
});
