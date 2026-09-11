// Browser-side E2E encryption. Runs entirely client-side via WebCrypto — the server
// never sees plaintext, only the ciphertext + browserPublicKey this produces.
// Must match the scheme implemented in scripts/dynaform.mjs exactly: ECDH P-256,
// HKDF-SHA256 (empty salt, info "dynaform-v1"), AES-256-GCM.

const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" } as const;
const HKDF_INFO = new TextEncoder().encode("dynaform-v1");

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptForRecipient(
  recipientPublicKeyB64url: string,
  plaintext: string
): Promise<{ ciphertext: string; iv: string; browserPublicKey: string }> {
  const recipientPublicKey = await crypto.subtle.importKey(
    "raw",
    base64urlToBytes(recipientPublicKeyB64url) as BufferSource,
    ECDH_PARAMS,
    false,
    []
  );
  const ephemeralKeyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveBits"]);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientPublicKey },
    ephemeralKeyPair.privateKey,
    256
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );
  const ephemeralPublicKeyRaw = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);

  return {
    ciphertext: bytesToBase64url(new Uint8Array(ciphertextBuf)),
    iv: bytesToBase64url(iv),
    browserPublicKey: bytesToBase64url(new Uint8Array(ephemeralPublicKeyRaw)),
  };
}
