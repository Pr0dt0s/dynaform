export const metadata = { title: "Privacy Policy — dynaform" };

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mt-2">Last updated: 2026-09-13</p>
      </div>

      <p>
        This policy covers <strong>the hosted instance at dynaform.prcm.xyz</strong>, operated by
        Pr0dt0s. If you&apos;re using a self-hosted instance run by someone else, this doesn&apos;t
        apply — that operator is the data controller for their own deployment, not this document.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What this server can see</h2>
        <p>
          <strong>The content you submit through a form or secret request cannot be read by this
          server.</strong> Every answer is encrypted in your browser before it&apos;s sent
          (AES-256-GCM, keyed via ECDH with a key pair generated on the machine that created the
          request). The server only ever stores and relays ciphertext.
        </p>
        <p>
          What the server <em>does</em> see, because it isn&apos;t encrypted: the IP address and
          timestamp of each request; the form&apos;s title, description, and field labels (the
          questions, not your answers); for secret requests, the name of the requested variable
          (e.g. <code>API_KEY</code>) and its description; and the status of a request (pending,
          submitted, or expired).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Retention</h2>
        <p>Every form or secret request is deleted automatically:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>after ~30 minutes if nobody submits it, or</li>
          <li>
            immediately after it&apos;s read back once by whoever created it — this service is
            one-time retrieval, not a database of past submissions.
          </li>
        </ul>
        <p>
          There is no archive, backup, or export of submitted content. Once a record is deleted,
          the ciphertext is gone; since only the requester ever held the decryption key, it was
          never recoverable by this server to begin with.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Accounts and tracking</h2>
        <p>
          There are none. No sign-up, no persistent user identifier, no analytics, no
          third-party trackers. The only cookie set is a short-lived, <code>HttpOnly</code>{" "}
          PIN-unlock token tied to one specific request — it grants no access beyond that single
          record and expires with it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Server logs</h2>
        <p>
          Standard web server/reverse-proxy access logs (IP, timestamp, requested path, status
          code) are retained only as long as normal infrastructure operation requires, and are
          not used for tracking individuals across requests.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Changes</h2>
        <p>
          If this policy changes in a way that matters, the date above will change and the update
          will be visible in this file&apos;s{" "}
          <a
            href="https://github.com/Pr0dt0s/dynaform/commits/main/PRIVACY.md"
            className="underline"
          >
            git history
          </a>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          Open an issue at{" "}
          <a href="https://github.com/Pr0dt0s/dynaform/issues" className="underline">
            github.com/Pr0dt0s/dynaform
          </a>
          .
        </p>
      </section>
    </div>
  );
}
