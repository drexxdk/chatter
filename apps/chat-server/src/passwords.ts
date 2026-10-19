import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const passwordSchema = z.string().min(12).max(128);

const DUMMY_HASH = `scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`;

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt-v1:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  hash?: string,
): Promise<boolean> {
  const parts = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(
    hash ?? DUMMY_HASH,
  );
  if (!parts) return false;
  const key = await derive(password, parts[1]!);
  return (
    timingSafeEqual(key, Buffer.from(parts[2]!, "hex")) && hash !== undefined
  );
}
