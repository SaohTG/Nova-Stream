// api/src/lib/crypto.js
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

/**
 * Chiffre une chaîne UTF-8 avec AES-256-GCM.
 * @param {string} plaintext
 * @param {string} hexKey - clé hex 64 chars (32 octets)
 * @returns {Promise<string>} base64(iv[12] + tag[16] + ciphertext)
 */
export async function encrypt(plaintext, hexKey) {
  if (!hexKey || hexKey.length !== 64) {
    throw new Error("API_ENCRYPTION_KEY must be 64 hex chars (32 bytes).");
  }
  const key = Buffer.from(hexKey, "hex");
  const iv = randomBytes(12); // recommandé pour GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  // format: iv || tag || ciphertext  -> base64
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Déchiffre une charge produite par encrypt().
 * @param {string} payloadBase64 - base64(iv[12] + tag[16] + ciphertext)
 * @param {string} hexKey - clé hex 64 chars (32 octets)
 * @returns {Promise<string>} plaintext UTF-8
 */
export async function decrypt(payloadBase64, hexKey) {
  if (!hexKey || hexKey.length !== 64) {
    throw new Error("API_ENCRYPTION_KEY must be 64 hex chars (32 bytes).");
  }
  const key = Buffer.from(hexKey, "hex");
  const buf = Buffer.from(payloadBase64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
