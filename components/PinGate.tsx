"use client";

import { useState, type FormEvent } from "react";

type UnlockOutcome = { ok: true } | { ok: false; burned?: boolean; error?: string };

export default function PinGate({ onUnlock }: { onUnlock: (pin: string) => Promise<UnlockOutcome> }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [burned, setBurned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await onUnlock(pin);
    setSubmitting(false);
    if (!result.ok) {
      if (result.burned) {
        setBurned(true);
      } else {
        setError(result.error ?? "Wrong PIN.");
        setPin("");
      }
    }
  }

  if (burned) {
    return (
      <p className="text-red-600 text-sm max-w-sm">
        Too many wrong attempts — this link has been destroyed and can no longer be used.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <strong>Never enter a PIN someone else gave you.</strong> You should only ever type in
        a PIN you created yourself. If someone sent you this link along with a PIN, this is
        not a legitimate request — close this page.
      </div>
      <label className="block">
        <span className="block text-sm font-medium mb-1">Enter your PIN to continue</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !pin}
        className="w-full rounded-md bg-black text-white py-2 disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
