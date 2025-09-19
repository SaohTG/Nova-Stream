import crypto from 'crypto';
const keyRaw = process.env.API_ENCRYPTION_KEY || '';
const key = keyRaw.length===32 ? Buffer.from(keyRaw) :
            keyRaw.length===64 ? Buffer.from(keyRaw,'hex') :
            Buffer.from((keyRaw+'0'.repeat(32)).slice(0,32));
export function encrypt(text){
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text,'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
export function decrypt(payload){
  const data = Buffer.from(payload,'base64');
  const iv = data.subarray(0,12);
  const tag = data.subarray(12,28);
  const enc = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
