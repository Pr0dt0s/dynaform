"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Centered from "@/components/Centered";
import PinGate from "@/components/PinGate";
import { encryptForRecipient } from "@/lib/client-crypto";

type Schema = { envVarName: string; description: string | null; publicKey: string; status: string };

const CONFIRM_PHRASE = "SEND";

export default function SecretPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const secret = searchParams.get("s") ?? "";

  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  const [value, setValue] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function loadSchema() {
    try {
      const res = await fetch(`/api/secrets/${id}?s=${encodeURIComponent(secret)}`);
      if (res.status === 401) {
        setNeedsPin(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Schema;
      if (data.status !== "pending") {
        setError("This request was already submitted or has expired.");
        return;
      }
      setNeedsPin(false);
      setSchema(data);
    } catch {
      setError("This request doesn't exist or has expired.");
    }
  }

  useEffect(() => {
    if (!secret) {
      setError("Missing access token.");
      return;
    }
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, secret]);

  async function handleUnlock(pin: string) {
    const res = await fetch(`/api/secrets/${id}/unlock?s=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.status === 410) return { ok: false as const, burned: true };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false as const,
        error:
          body.attemptsRemaining !== undefined
            ? `Wrong PIN — ${body.attemptsRemaining} attempt(s) left before this link is destroyed.`
            : "Wrong PIN.",
      };
    }
    await loadSchema();
    return { ok: true as const };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!schema || confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = await encryptForRecipient(schema.publicKey, value);
      const res = await fetch(`/api/secrets/${id}/submit?s=${encodeURIComponent(secret)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      setValue("");
    } catch {
      setError("Could not submit. The request may have expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <Centered>
        <p className="text-red-600">{error}</p>
      </Centered>
    );
  }
  if (needsPin) {
    return (
      <Centered>
        <PinGate onUnlock={handleUnlock} />
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <p>Sent — you can close this tab. This value was encrypted in your browser and this server never saw it.</p>
      </Centered>
    );
  }
  if (!schema) {
    return (
      <Centered>
        <p>Loading…</p>
      </Centered>
    );
  }

  return (
    <Centered>
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          Dynaform is an open tool — anyone can request a secret through it, and this page
          cannot verify who created this specific request. Only continue if you already
          trust whoever sent you this link, through a channel you trust.
        </div>
        <div>
          <h1 className="text-lg font-semibold">Secret requested: {schema.envVarName}</h1>
          {schema.description && <p className="text-sm text-gray-500 mt-1">{schema.description}</p>}
          <p className="text-xs text-gray-400 mt-2">
            This value is encrypted in your browser before it&apos;s sent. The server only ever stores
            ciphertext it can&apos;t read — but whoever created this request can read it once they
            receive it, the same as if you handed it to them directly.
          </p>
        </div>
        <input
          type="password"
          autoComplete="off"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
          placeholder="Paste the secret value"
        />
        <label className="block">
          <span className="block text-sm font-medium mb-1">
            Type {CONFIRM_PHRASE} to confirm you trust this request
          </span>
          <input
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder={CONFIRM_PHRASE}
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !value || confirmText.trim().toUpperCase() !== CONFIRM_PHRASE}
          className="w-full rounded-md bg-black text-white py-2 disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send securely"}
        </button>
      </form>
    </Centered>
  );
}
