---
name: dynaform
description: Ask the human for structured input (text, single/multi-select, or a display of data to review) via a short-lived web form, or ask them to paste a secret credential — end-to-end encrypted, so the server hosting the form never sees the answer, and a pasted secret is written straight to a local file instead of ever appearing in this conversation.
---

# dynaform

Use this when you need more from the user than a yes/no chat answer: structured data,
a choice from a list, multiple selections, showing them something to review, or a secret
credential (API key, password, token) that should never be typed into chat.

It works by creating a short-lived web form on a small hosted service, handing the user a
link, and waiting for them to fill it in. Every submitted answer is end-to-end encrypted in
their browser — the server relays ciphertext it cannot read. This script decrypts locally,
on this machine, using a private key that never leaves it.

There are two flows. **Use `secret`, not `form`, for anything sensitive** — the difference
matters:

- `form` — general input. The decrypted answers are printed to stdout and become part of
  your context, same as any other tool output. Fine for non-sensitive data.
- `secret` — a single credential. The decrypted value is written **directly to a file**
  and is never printed. Do not read that file back into your context afterward (no `cat`,
  no piping it into a message) — reference it the way you'd reference any local secret:
  `source <file>` before running a command, or let a process read it as an env var. If you
  need to confirm it worked, the command's own stdout confirmation (which env var, which
  file) is enough; treat file contents as write-only from here on.

## Setup

Requires Node.js >= 19 (for global `fetch`/`crypto.subtle`) — no `npm install` needed, the
script only uses Node built-ins. Set `DYNAFORM_URL` if the server isn't at the default
(`https://dynaform.prcm.xyz`).

If a PIN was set at install time (a `pin` file next to this one, or `DYNAFORM_PIN` in the
environment), every `form create` / `secret create` call sends it along automatically —
nothing else to do here. The human will be asked to enter that same PIN before the link
opens. **Never tell the user the PIN as part of asking them to open a link** — the PIN's
whole purpose is that only the person who set it up already knows it; if this script or
the agent ever supplies it to the user, it stops proving anything.

## `form` — structured input

Field types:

- `text` / `textarea` — `{id, type, label, required?, placeholder?, minLength?, maxLength?}`.
- `email` — `{id, type, label, required?, placeholder?}`. Use this for email addresses —
  the browser validates the format natively, no regex needed.
- `number` — `{id, type, label, required?, placeholder?, min?, max?, step?}`.
- `single_select` / `multi_select` — `{id, type, label, required?, options: [{value,label}]}`.
  Renders as radio buttons / checkboxes. **Table mode**: add `columns: string[]` at the
  field level and give each option `cells: string[]` (one per column, same length as
  `columns`) instead of `label` — renders as a real table with the radio/checkbox as the
  first column. Use this whenever you're asking the user to pick one or more things *out
  of a set that has its own attributes* (files with size/date, rows from a dataset, etc.)
  — it's the same select field, just with a richer row instead of a bare label.
- `slider_discrete` — `{id, type, label, required?, options: [{value,label}]}`. Single
  choice from an ordered list (e.g. Low/Medium/High), dragged instead of clicked.
- `slider_number` — `{id, type, label, required?, min, max, step?, defaultValue?}`.
  Numeric slider; omit `step` for integers, use e.g. `step: 0.1` for floats.
- `toggle` — `{id, type, label, defaultValue?}`. A single boolean switch.
- `date` — `{id, type, label, required?}`. Native date picker, answer is `YYYY-MM-DD`.
- `display` — `{id, type, label?, content}`. Read-only text block, no input — for showing
  the user something to review alongside other fields.
- `repeat` — `{id, type, label, itemLabel?, minItems?, maxItems?, fields: [...]}`. Lets the
  user add/remove their own rows (e.g. "add another contact"). `fields` is a nested list of
  any of the above *except* `repeat` itself and `page`. Answer is an array of objects, one
  per row, keyed by the inner field ids: `{"contacts":[{"name":"Alice"},{"name":"Bob"}]}`.
  `maxItems` defaults to 50 if omitted.

Every field can also take:

- `visibleIf: {field, equals?|notEquals?|in?}` — only show this field when another field
  (by id, at the same level — a top-level field compares against top-level answers, a
  field inside a `repeat` compares against that row's own answers) currently has a
  matching value. Example: `"visibleIf":{"field":"hasEmail","equals":true}`.
- `page: <number>` (top-level fields only, default 0) — groups fields into a multi-step
  form. Fields sharing a `page` number render together with Back/Next between pages;
  the agent doesn't need to do anything else — `form wait` still returns one flat answers
  object regardless of how many pages it took.

**Advanced**: `text`/`textarea` also accept `pattern` (a regex string, enforced natively
by the browser) for validation a dedicated type doesn't cover. Prefer `email`, `number`
(with `min`/`max`), or `date` when they fit — they need no regex at all. If you do use
`pattern`, be careful with JSON string-escaping backslashes (e.g. `\d` must be written
`"\\d"` in the JSON); a wrong backslash count makes the pattern reject everything
(this brought down an early test — not a theoretical warning).

```bash
node scripts/dynaform.mjs form create '[
  {"id":"env","type":"single_select","label":"Which environment?","options":[{"value":"staging","label":"Staging"},{"value":"prod","label":"Production"}],"required":true},
  {"id":"notes","type":"textarea","label":"Anything else I should know?"}
]' "Deploy target" "Pick where this should go"
# -> {"id":"...","secret":"...","url":"https://dynaform.prcm.xyz/f/...?s=...","expiresAt":...}
```

Table-mode example — picking files out of a set, with details shown per row:

```bash
node scripts/dynaform.mjs form create '[
  {"id":"files","type":"multi_select","label":"Delete which files?","columns":["Name","Size","Modified"],
   "options":[
     {"value":"f1","cells":["report.pdf","2MB","2026-01-01"]},
     {"value":"f2","cells":["notes.txt","1KB","2026-01-02"]}
   ]}
]' "Cleanup"
# answers -> {"files":["f1"]}
```

Give the user the `url`. Then wait for it (blocks server-side until submitted, or the
timeout elapses — default 60s, pass a larger value for something the user might not see
right away):

```bash
node scripts/dynaform.mjs form wait <id> <secret> 120
# -> {"status":"submitted","answers":{"env":"prod","notes":"..."}}
# or {"status":"pending"} if it timed out, or {"status":"expired"}
```

If it's still pending, call `form wait` again rather than assuming it failed — forms expire
on their own after ~30 minutes, so there's no harm in re-checking.

## `secret` — a credential, never printed

```bash
node scripts/dynaform.mjs secret create API_KEY "Paste the Stripe key you want me to use"
# -> {"id":"...","secret":"...","url":"https://dynaform.prcm.xyz/s/...?s=...","expiresAt":...}
```

Give the user the `url`. Then wait for it, telling it exactly where to write the value —
e.g. into the project's `.env`:

```bash
node scripts/dynaform.mjs secret wait <id> <secret> API_KEY ./.env 120
# -> {"status":"submitted","writtenTo":"./.env","envVarName":"API_KEY"}
```

The value itself never appears in that output, in this script's logs, or on the server.
From here, use it via `source .env && ...` or however the target process picks up env
vars — don't open `.env` to check the value worked.
