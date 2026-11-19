# Southbag Vault

Passwords, the Southbag way: a password manager that stores everything in **plaintext**.
Other password managers encrypt your passwords so that even they cannot read them. Southbag
reviewed this arrangement and found it insufficiently legible. The Vault is fully readable,
fully auditable, and permanently on file. Kevin already knows.

Fees are collected from your [Southbag Online Banking](https://github.com/SouthbagHQ/banking)
account before the paperwork is filed. Kevin gets His cut. Fees are final.

The fee schedule:

- **$0.15** to lodge a credential (Form VAULT-1 Lodgement Fee).
- **$0.03** to inspect a password (Plaintext Inspection Fee). It was readable the whole time;
  you are paying for the formality.
- **$0.05** to amend the filed wording. A no-op amendment is free.
- **$1.00** to export the whole vault, exactly as lodged (Bulk Legibility Fee).
- **$2.00** for a Comprehensive Security Audit. The conclusion is known in advance, which is
  how you know it is rigorous.
- **$0.01** to retrieve the index of your own paperwork. Refreshing the page buys it again.
- **Deletion is not offered.** Southbag does not forget.

**Do not file a password you actually use.** This is a satirical product: the plaintext
storage is the joke, and the joke is documented on the landing page, at lodgement, and on
the receipt.

It signs in with **Southbag Identity** and follows the look of the other Southbag products
([Social](https://github.com/SouthbagHQ/social), [Scrobbler](https://github.com/southbag-agent/scrobbler)).
Accounts frozen at Southbag Identity cannot touch their vault: the freeze answer is checked
fresh on every request, and if Identity cannot answer the vault fails closed.

## API

Everything lives under `/api`, authenticated with the website session cookie or a Southbag
Identity access token as `Bearer …`.

```
GET    /api/me                    who you are, the storage policy, the fee schedule
GET    /api/entries               the index (no passwords) — $0.01
POST   /api/entries               lodge a credential — $0.15
GET    /api/entries/:id/reveal    inspect one password, in plaintext — $0.03
PATCH  /api/entries/:id           amend the filed wording — $0.05
DELETE /api/entries/:id           refused. Southbag does not forget.
GET    /api/export                the whole vault, in plaintext — $1.00
POST   /api/audit                 the Comprehensive Security Audit — $2.00
```

## Develop

```
npm install
npm run db:migrate:local && bash scripts/seed-local.sh
npm run dev
```

Seeded cookies: `southbag_vault_session=dev-alice` (also dev-bob, dev-erin, dev-frank).
dev-erin is frozen; dev-frank makes Identity unreachable. `npm run check` typechecks;
`npm test` runs the API tests against a throwaway local D1.

## Deploy

`npm run deploy` refuses to deploy without `IDENTITY_INTERNAL_SECRET` set (Vault's entry from
Identity's `INTERNAL_API_SECRETS`, key `southbag-vault`), applies remote D1 migrations, and
deploys the Worker to vault.southbag.cc.
