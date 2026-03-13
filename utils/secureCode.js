import crypto from 'crypto';

const deriveKey = () => {
  const secret = process.env.PICKUP_CODE_SECRET || process.env.JWT_SECRET || 'fallback-pickup-secret';
  return crypto.createHash('sha256').update(secret).digest();
};

export const encryptCode = (plainText) => {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
};

export const decryptCode = (payload) => {
  if (!payload) return null;
  const [ivB64, tagB64, encryptedB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) return null;

  const key = deriveKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
