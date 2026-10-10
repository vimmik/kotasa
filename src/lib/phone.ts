/**
 * Normalise a Sri Lankan mobile number to 94XXXXXXXXX.
 * Accepts 0771234567, 771234567, +94771234567, 94 77 123 4567 ...
 * Returns null if it doesn't look like a valid number.
 */
export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  let local: string;
  if (digits.length === 11 && digits.startsWith("94")) local = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith("0")) local = digits.slice(1);
  else if (digits.length === 9) local = digits;
  else return null;
  if (!/^7\d{8}$/.test(local)) return null;
  return `94${local}`;
}

export function displayPhone(p: string | null | undefined) {
  if (!p) return "";
  return p.startsWith("94") ? `0${p.slice(2)}` : p;
}

/** Login is phone + PIN. Supabase Auth needs an email, so we derive one from the phone. */
export function phoneToAuthEmail(phone94: string) {
  const domain = process.env.AUTH_EMAIL_DOMAIN || "kotasa.local";
  return `${phone94}@${domain}`;
}

export function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin);
}
