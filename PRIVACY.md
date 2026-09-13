# Privacy Policy

This policy covers **the hosted instance at `dynaform.prcm.xyz`**, operated by Pr0dt0s. If
you're using a self-hosted instance run by someone else, this doesn't apply — that
operator is the data controller for their own deployment, not this document.

## What this server can see

- **The content you submit through a form or secret request cannot be read by this
  server.** Every answer is encrypted in your browser before it's sent (AES-256-GCM,
  keyed via ECDH with a key pair generated on the machine that created the request). The
  server only ever stores and relays ciphertext.
- **What the server does see, because it isn't encrypted:** the IP address and timestamp
  of each request; the form's title, description, and field labels (the *questions*, not
  your *answers*); for secret requests, the name of the requested variable (e.g.
  `API_KEY`) and its description; and the status of a request (pending, submitted, or
  expired).

## Retention

Every form or secret request is deleted automatically:
- after ~30 minutes if nobody submits it, or
- immediately after it's read back once by whoever created it — this service is one-time
  retrieval, not a database of past submissions.

There is no archive, backup, or export of submitted content. Once a record is deleted, the
ciphertext is gone; since only the requester ever held the decryption key, it was never
recoverable by this server to begin with.

## Accounts and tracking

There are none. No sign-up, no persistent user identifier, no analytics, no third-party
trackers. The only cookie set is a short-lived, `HttpOnly` PIN-unlock token tied to one
specific request — it grants no access beyond that single record and expires with it.

## Server logs

Standard web server/reverse-proxy access logs (IP, timestamp, requested path, status code)
are retained only as long as normal infrastructure operation requires, and are not used
for tracking individuals across requests.

## Changes

If this policy changes in a way that matters, the date below will change and the update
will be visible in this file's git history.

## Contact

Open an issue at [github.com/Pr0dt0s/dynaform](https://github.com/Pr0dt0s/dynaform/issues).

_Last updated: 2026-09-13_
