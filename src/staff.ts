/** Private staff area: a password sets a cookie; no accounts, nothing stored server-side. */
import type { Env } from './config';

const COOKIE = 'scg_staff';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cookie value derived from the key, so changing STAFF_KEY logs everyone out. */
const token = (key: string) => sha256(`scg-staff-v1:${key}`);

function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const staffEnabled = (env: Env) => !!env.STAFF_KEY && env.STAFF_KEY.length >= 12;

export async function isStaff(request: Request, env: Env): Promise<boolean> {
  if (!staffEnabled(env)) return false;
  const m = /(?:^|;\s*)scg_staff=([a-f0-9]{64})/.exec(request.headers.get('cookie') || '');
  return !!m && sameText(m[1], await token(env.STAFF_KEY!));
}

export async function checkKey(given: string, env: Env): Promise<boolean> {
  return staffEnabled(env) && sameText(given, env.STAFF_KEY!);
}

export async function loginCookie(env: Env): Promise<string> {
  return `${COOKIE}=${await token(env.STAFF_KEY!)}; Path=/staff; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

export const logoutCookie = () => `${COOKIE}=; Path=/staff; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
