#!/usr/bin/env node
// dynaform CLI — talks to a dynaform server to create short-lived, end-to-end encrypted
// forms/secret-requests and wait for the human to fill them in.
//
// Pure Node built-ins only (global `crypto` = WebCrypto, `fs`, `fetch`) — nothing to
// `npm install`. Requires Node >= 19 (for global WebCrypto) / >= 18 (for global fetch).
//
// Crypto scheme (must match app/lib/client-crypto.ts on the server exactly):
//   ECDH P-256, public keys as raw uncompressed points (base64url), HKDF-SHA256
//   (empty salt, info "dynaform-v1") -> 32-byte key, AES-256-GCM with a random 12-byte
//   IV. The server only ever sees public keys and ciphertext; it cannot decrypt.
//
// Usage:
//   dynaform.mjs form create '<fields-json>' [title] [description]
//   dynaform.mjs form wait <id> <secret> [timeoutSeconds]
//   dynaform.mjs secret create <envVarName> [description]
//   dynaform.mjs secret wait <id> <secret> <targetFile> [timeoutSeconds]

import { webcrypto as crypto } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.DYNAFORM_URL || "https://dynaform.prcm.xyz";
const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" };
const HKDF_INFO = new TextEncoder().encode("dynaform-v1");
const KEY_DIR = path.join(tmpdir(), "dynaform-keys");
// scripts/dynaform.mjs -> skill dir is one level up; the PIN set at install time lives
// there as a plain file, sibling to SKILL.md.
const PIN_FILE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "pin");

function readPin() {
  if (process.env.DYNAFORM_PIN) return process.env.DYNAFORM_PIN;
  if (existsSync(PIN_FILE)) {
    const pin = readFileSync(PIN_FILE, "utf8").trim();
    if (pin) return pin;
  }
  return undefined;
}

function bytesToBase64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function base64urlToBytes(b64url) {
  return new Uint8Array(Buffer.from(b64url, "base64url"));
}

async function generateKeyPair() {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"]);
}

async function exportRawPublicKey(publicKey) {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return bytesToBase64url(new Uint8Array(raw));
}

async function deriveAesKey(privateKey, peerRawPublicKeyB64url) {
  const peerPublicKey = await crypto.subtle.importKey(
    "raw",
    base64urlToBytes(peerRawPublicKeyB64url),
    ECDH_PARAMS,
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptPayload(privateKey, payload) {
  const aesKey = await deriveAesKey(privateKey, payload.browserPublicKey);
  const iv = base64urlToBytes(payload.iv);
  const ciphertext = base64urlToBytes(payload.ciphertext);
  const plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plaintextBuf);
}

// --- local ephemeral key storage (this machine only, never sent to the server) ---

function keyFilePath(id) {
  return path.join(KEY_DIR, `${id}.json`);
}

async function stashPrivateKey(id, privateKey) {
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const file = keyFilePath(id);
  writeFileSync(file, JSON.stringify(jwk));
  chmodSync(file, 0o600);
}

function readStashedKeyJwk(id) {
  const file = keyFilePath(id);
  if (!existsSync(file)) {
    throw new Error(`No local key found for request ${id} (must run 'wait' on the same machine as 'create')`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function deleteStashedKey(id) {
  const file = keyFilePath(id);
  if (existsSync(file)) unlinkSync(file);
}

// --- HTTP ---

async function apiPost(urlPath, body) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${urlPath} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiGet(urlPath) {
  const res = await fetch(`${BASE_URL}${urlPath}`);
  if (!res.ok) throw new Error(`GET ${urlPath} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- commands ---

async function formCreate(fieldsJson, title, description) {
  const fields = JSON.parse(fieldsJson);
  const keyPair = await generateKeyPair();
  const publicKey = await exportRawPublicKey(keyPair.publicKey);
  const result = await apiPost("/api/forms", {
    title: title || "Input requested",
    description,
    fields,
    publicKey,
    pin: readPin(),
  });
  await stashPrivateKey(result.id, keyPair.privateKey);
  console.log(JSON.stringify({ id: result.id, secret: result.secret, url: result.url, expiresAt: result.expiresAt }));
}

async function formWait(id, secret, timeoutSeconds) {
  // Read (don't delete yet) — a "pending" result means the key is still needed for a
  // later `wait` call. Only delete once it's actually been used, or there's nothing left
  // to retrieve.
  const jwk = readStashedKeyJwk(id);
  const result = await apiGet(`/api/forms/${id}/wait?s=${encodeURIComponent(secret)}&timeout=${timeoutSeconds || 60}`);
  if (result.status !== "submitted") {
    if (result.status === "expired") deleteStashedKey(id);
    console.log(JSON.stringify({ status: result.status }));
    return;
  }
  const privateKey = await crypto.subtle.importKey("jwk", jwk, ECDH_PARAMS, false, ["deriveBits"]);
  const plaintext = await decryptPayload(privateKey, result);
  deleteStashedKey(id);
  console.log(JSON.stringify({ status: "submitted", answers: JSON.parse(plaintext) }));
}

async function secretCreate(envVarName, description) {
  const keyPair = await generateKeyPair();
  const publicKey = await exportRawPublicKey(keyPair.publicKey);
  const result = await apiPost("/api/secrets", { envVarName, description, publicKey, pin: readPin() });
  await stashPrivateKey(result.id, keyPair.privateKey);
  console.log(JSON.stringify({ id: result.id, secret: result.secret, url: result.url, expiresAt: result.expiresAt }));
}

function upsertEnvLine(targetFile, name, value) {
  let lines = [];
  if (existsSync(targetFile)) {
    lines = readFileSync(targetFile, "utf8").split("\n").filter((l) => l.length > 0);
  }
  const prefix = `${name}=`;
  const idx = lines.findIndex((l) => l.startsWith(prefix));
  const newLine = `${name}=${value}`;
  if (idx >= 0) lines[idx] = newLine;
  else lines.push(newLine);
  mkdirSync(path.dirname(path.resolve(targetFile)), { recursive: true });
  writeFileSync(targetFile, lines.join("\n") + "\n", { mode: 0o600 });
}

async function secretWait(id, secret, envVarName, targetFile, timeoutSeconds) {
  const jwk = readStashedKeyJwk(id);
  const result = await apiGet(`/api/secrets/${id}/wait?s=${encodeURIComponent(secret)}&timeout=${timeoutSeconds || 60}`);
  if (result.status !== "submitted") {
    if (result.status === "expired") deleteStashedKey(id);
    console.log(JSON.stringify({ status: result.status }));
    return;
  }
  // Decrypt and write straight to the target file; never log the plaintext value itself.
  const privateKey = await crypto.subtle.importKey("jwk", jwk, ECDH_PARAMS, false, ["deriveBits"]);
  const plaintext = await decryptPayload(privateKey, result);
  deleteStashedKey(id);
  upsertEnvLine(targetFile, envVarName, plaintext);
  console.log(JSON.stringify({ status: "submitted", writtenTo: targetFile, envVarName }));
}

async function main() {
  const [, , group, action, ...rest] = process.argv;
  if (group === "form" && action === "create") {
    await formCreate(rest[0], rest[1], rest[2]);
  } else if (group === "form" && action === "wait") {
    await formWait(rest[0], rest[1], Number(rest[2]));
  } else if (group === "secret" && action === "create") {
    await secretCreate(rest[0], rest[1]);
  } else if (group === "secret" && action === "wait") {
    await secretWait(rest[0], rest[1], rest[2], rest[3], Number(rest[4]));
  } else {
    console.error(
      "Usage:\n" +
        "  dynaform.mjs form create '<fields-json>' [title] [description]\n" +
        "  dynaform.mjs form wait <id> <secret> [timeoutSeconds]\n" +
        "  dynaform.mjs secret create <envVarName> [description]\n" +
        "  dynaform.mjs secret wait <id> <secret> <envVarName> <targetFile> [timeoutSeconds]"
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
