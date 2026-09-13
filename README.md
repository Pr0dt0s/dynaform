# dynaform

A short-lived, end-to-end encrypted form/secret relay for AI coding agents. Use it when an
agent needs more from you than a yes/no chat answer — structured data, a choice from a
list, a review step, or a credential that should never be typed into chat or logged
anywhere.

It works by creating a form or a "give me a secret" request on a small hosted service,
handing you a link, and waiting for you to fill it in. Every answer is encrypted **in your
browser** before it's sent — the server only ever relays ciphertext it cannot read. A
skill script decrypts it locally, on the machine running the agent, using a private key
that never leaves it.

Built for the case of driving [Claude Code](https://claude.com/claude-code) from a phone
via remote control, where the built-in `AskUserQuestion` tool's terminal-rendered
multi-select doesn't give you sliders, tables, multi-page forms, or a safe way to hand
back a secret.

## Install the skill

```bash
curl -fsSL https://dynaform.prcm.xyz/install.sh | sh
```

Installs to `~/.claude/skills/dynaform`. Requires Node.js >= 19, no other dependencies —
see [`public/skill/SKILL.md`](public/skill/SKILL.md) for the full field-type reference and
usage.

Set `DYNAFORM_PIN` (or answer the install prompt) to choose a PIN. Every link created by
your install of the skill will require it before it opens — protects you if a link ever
leaks (a notification preview, a synced clipboard, chat history) since the URL alone is no
longer enough. **Never share that PIN with anyone** — if you're ever asked to enter a PIN
someone else gave you, that's not a legitimate dynaform link.

## Security model

- **End-to-end encryption**: an ephemeral ECDH keypair is generated locally by the skill
  script for every request; only the public half is sent to the server. Your browser
  encrypts the answer against it (AES-256-GCM) before submitting — the server stores and
  relays ciphertext only, and the private key never leaves the machine that created the
  request.
- **One-time, short-lived links**: every form/secret-request expires after ~30 minutes
  (configurable) and is deleted immediately after being read once.
- **Optional PIN gate**: see above — closes the gap where the link itself is a bearer
  token.
- **What this does *not* protect against**: a malicious *requester*. Anyone can run this
  server and ask you for a "secret" — the encryption only stops the server operator from
  reading it, not whoever created the request, since they're the intended recipient. The
  secret-submission page carries a warning about this; don't submit anything to a link you
  don't already trust the sender of.

## Self-hosting

`deploy/` has a `Dockerfile` (Next.js standalone + embedded SQLite, no separate DB
container needed) and a Traefik-based `compose.yml`. Copy `deploy/.env.example` to
`deploy/.env`, set `APP_DOMAIN` (and `CERT_RESOLVER`/`TRAEFIK_NETWORK` if you're not using
the same names), then:

```bash
docker compose -f deploy/compose.yml up -d --build
```

Not using Traefik? Drop the `labels:`/`networks:` block in `compose.yml` and add
`ports: ["3000:3000"]` instead, then put whatever reverse proxy you use in front.

## Development

```bash
npm install
npm run dev
```

No test suite yet. `npm run lint` runs ESLint; `npx tsc --noEmit` type-checks.

## License

MIT — see [LICENSE](LICENSE).
