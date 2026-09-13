import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { generateId, generateSecret, hashSecret, verifySecret } from "./secret-token";
import type { EncryptedPayload, FormField, ResolveResult } from "./types";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "dynaform.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Wrong PINs are capped, not slow-hashed — capping attempts server-side is what actually
// stops guessing (the hash never leaves this process), and it lets a leaked link expire
// itself the same way an expired TTL already does.
const MAX_PIN_ATTEMPTS = 5;

db.exec(`
  CREATE TABLE IF NOT EXISTS forms (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    fields_json TEXT NOT NULL,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    ciphertext TEXT,
    iv TEXT,
    browser_public_key TEXT,
    pin_hash TEXT,
    pin_attempts INTEGER NOT NULL DEFAULT 0,
    unlock_token_hash TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    env_var_name TEXT NOT NULL,
    description TEXT,
    public_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    ciphertext TEXT,
    iv TEXT,
    browser_public_key TEXT,
    pin_hash TEXT,
    pin_attempts INTEGER NOT NULL DEFAULT 0,
    unlock_token_hash TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// CREATE TABLE IF NOT EXISTS above only helps on a brand-new database — an existing one
// (e.g. a deployment from before the PIN feature) keeps its old columns forever otherwise.
// ADD COLUMN IF NOT EXISTS (SQLite 3.35+, well within what better-sqlite3 bundles) makes
// picking up new columns idempotent and safe to run on every boot.
for (const table of ["forms", "secrets"]) {
  db.exec(`
    ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS pin_hash TEXT;
    ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS pin_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS unlock_token_hash TEXT;
  `);
}

function ttlMs(): number {
  const minutes = Number(process.env.FORM_TTL_MINUTES) || 30;
  return minutes * 60 * 1000;
}

type PinGate = { pin_hash: string | null; unlock_token_hash: string | null };

function isUnlocked(row: PinGate, unlockToken: string | null): boolean {
  if (!row.pin_hash) return true;
  if (!unlockToken || !row.unlock_token_hash) return false;
  return verifySecret(unlockToken, row.unlock_token_hash);
}

export type RenderResult<T> = ({ ok: true } & T) | { ok: false; reason: "not_found" | "locked" };

export type UnlockResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "no_pin_required" | "burned" }
  | { ok: false; reason: "wrong_pin"; attemptsRemaining: number };

// ---------- forms ----------

export interface FormRow {
  id: string;
  secret_hash: string;
  title: string;
  description: string | null;
  fields_json: string;
  public_key: string;
  status: string;
  ciphertext: string | null;
  iv: string | null;
  browser_public_key: string | null;
  pin_hash: string | null;
  pin_attempts: number;
  unlock_token_hash: string | null;
  created_at: number;
  expires_at: number;
}

export function createForm(input: {
  title: string;
  description?: string;
  fields: FormField[];
  publicKey: string;
  pin?: string;
}): { id: string; secret: string; expiresAt: number } {
  const id = generateId();
  const secret = generateSecret();
  const now = Date.now();
  const expiresAt = now + ttlMs();
  db.prepare(
    `INSERT INTO forms (id, secret_hash, title, description, fields_json, public_key, pin_hash, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    hashSecret(secret),
    input.title,
    input.description ?? null,
    JSON.stringify(input.fields),
    input.publicKey,
    input.pin ? hashSecret(input.pin) : null,
    now,
    expiresAt
  );
  return { id, secret, expiresAt };
}

function loadForm(id: string, secret: string): FormRow | null {
  const row = db.prepare(`SELECT * FROM forms WHERE id = ?`).get(id) as FormRow | undefined;
  if (!row) return null;
  if (!verifySecret(secret, row.secret_hash)) return null;
  if (row.status === "pending" && Date.now() > row.expires_at) {
    db.prepare(`DELETE FROM forms WHERE id = ?`).run(id);
    return null;
  }
  return row;
}

export function getFormForRender(
  id: string,
  secret: string,
  unlockToken: string | null
): RenderResult<{ title: string; description: string | null; fields: FormField[]; publicKey: string; status: string }> {
  const row = loadForm(id, secret);
  if (!row) return { ok: false, reason: "not_found" };
  if (!isUnlocked(row, unlockToken)) return { ok: false, reason: "locked" };
  return {
    ok: true,
    title: row.title,
    description: row.description,
    fields: JSON.parse(row.fields_json),
    publicKey: row.public_key,
    status: row.status,
  };
}

export function unlockForm(id: string, secret: string, pin: string): UnlockResult {
  const row = loadForm(id, secret);
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.pin_hash) return { ok: false, reason: "no_pin_required" };
  if (!verifySecret(pin, row.pin_hash)) {
    const attempts = row.pin_attempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      db.prepare(`DELETE FROM forms WHERE id = ?`).run(id);
      return { ok: false, reason: "burned" };
    }
    db.prepare(`UPDATE forms SET pin_attempts = ? WHERE id = ?`).run(attempts, id);
    return { ok: false, reason: "wrong_pin", attemptsRemaining: MAX_PIN_ATTEMPTS - attempts };
  }
  const token = generateSecret();
  db.prepare(`UPDATE forms SET unlock_token_hash = ? WHERE id = ?`).run(hashSecret(token), id);
  return { ok: true, token };
}

export function submitForm(id: string, secret: string, unlockToken: string | null, payload: EncryptedPayload): boolean {
  const row = loadForm(id, secret);
  if (!row || row.status !== "pending") return false;
  if (!isUnlocked(row, unlockToken)) return false;
  db.prepare(
    `UPDATE forms SET status = 'submitted', ciphertext = ?, iv = ?, browser_public_key = ? WHERE id = ?`
  ).run(payload.ciphertext, payload.iv, payload.browserPublicKey, id);
  return true;
}

export function resolveForm(id: string, secret: string): ResolveResult {
  const row = loadForm(id, secret);
  if (!row) return { status: "expired" };
  if (row.status === "pending") return { status: "pending" };
  // submitted (or any other terminal state): one-time retrieval, then delete.
  db.prepare(`DELETE FROM forms WHERE id = ?`).run(id);
  return {
    status: "submitted",
    ciphertext: row.ciphertext!,
    iv: row.iv!,
    browserPublicKey: row.browser_public_key!,
  };
}

// ---------- secrets ----------

export interface SecretRow {
  id: string;
  secret_hash: string;
  env_var_name: string;
  description: string | null;
  public_key: string;
  status: string;
  ciphertext: string | null;
  iv: string | null;
  browser_public_key: string | null;
  pin_hash: string | null;
  pin_attempts: number;
  unlock_token_hash: string | null;
  created_at: number;
  expires_at: number;
}

export function createSecretRequest(input: {
  envVarName: string;
  description?: string;
  publicKey: string;
  pin?: string;
}): { id: string; secret: string; expiresAt: number } {
  const id = generateId();
  const secret = generateSecret();
  const now = Date.now();
  const expiresAt = now + ttlMs();
  db.prepare(
    `INSERT INTO secrets (id, secret_hash, env_var_name, description, public_key, pin_hash, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    hashSecret(secret),
    input.envVarName,
    input.description ?? null,
    input.publicKey,
    input.pin ? hashSecret(input.pin) : null,
    now,
    expiresAt
  );
  return { id, secret, expiresAt };
}

function loadSecret(id: string, secret: string): SecretRow | null {
  const row = db.prepare(`SELECT * FROM secrets WHERE id = ?`).get(id) as SecretRow | undefined;
  if (!row) return null;
  if (!verifySecret(secret, row.secret_hash)) return null;
  if (row.status === "pending" && Date.now() > row.expires_at) {
    db.prepare(`DELETE FROM secrets WHERE id = ?`).run(id);
    return null;
  }
  return row;
}

export function getSecretForRender(
  id: string,
  secret: string,
  unlockToken: string | null
): RenderResult<{ envVarName: string; description: string | null; publicKey: string; status: string }> {
  const row = loadSecret(id, secret);
  if (!row) return { ok: false, reason: "not_found" };
  if (!isUnlocked(row, unlockToken)) return { ok: false, reason: "locked" };
  return {
    ok: true,
    envVarName: row.env_var_name,
    description: row.description,
    publicKey: row.public_key,
    status: row.status,
  };
}

export function unlockSecret(id: string, secret: string, pin: string): UnlockResult {
  const row = loadSecret(id, secret);
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.pin_hash) return { ok: false, reason: "no_pin_required" };
  if (!verifySecret(pin, row.pin_hash)) {
    const attempts = row.pin_attempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      db.prepare(`DELETE FROM secrets WHERE id = ?`).run(id);
      return { ok: false, reason: "burned" };
    }
    db.prepare(`UPDATE secrets SET pin_attempts = ? WHERE id = ?`).run(attempts, id);
    return { ok: false, reason: "wrong_pin", attemptsRemaining: MAX_PIN_ATTEMPTS - attempts };
  }
  const token = generateSecret();
  db.prepare(`UPDATE secrets SET unlock_token_hash = ? WHERE id = ?`).run(hashSecret(token), id);
  return { ok: true, token };
}

export function submitSecret(id: string, secret: string, unlockToken: string | null, payload: EncryptedPayload): boolean {
  const row = loadSecret(id, secret);
  if (!row || row.status !== "pending") return false;
  if (!isUnlocked(row, unlockToken)) return false;
  db.prepare(
    `UPDATE secrets SET status = 'submitted', ciphertext = ?, iv = ?, browser_public_key = ? WHERE id = ?`
  ).run(payload.ciphertext, payload.iv, payload.browserPublicKey, id);
  return true;
}

export function resolveSecret(id: string, secret: string): ResolveResult {
  const row = loadSecret(id, secret);
  if (!row) return { status: "expired" };
  if (row.status === "pending") return { status: "pending" };
  db.prepare(`DELETE FROM secrets WHERE id = ?`).run(id);
  return {
    status: "submitted",
    ciphertext: row.ciphertext!,
    iv: row.iv!,
    browserPublicKey: row.browser_public_key!,
  };
}
