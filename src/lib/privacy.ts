/**
 * Hides guests' personal details from staff screens and the activity log.
 * Staff only ever need the last 4 digits of a mobile number to tell guests apart.
 */

/** "+919876543210" -> "••••3210". Anything too short to mask is hidden fully. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••••";
}

/** "priya.sharma@gmail.com" -> "p•••@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

// A run of 10 to 13 digits, with optional +, spaces or dashes in between.
const PHONE_RE = /\+?\d(?:[\s-]?\d){9,12}/g;
const EMAIL_RE = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi;

/** Masks any mobile number or email address found inside free text. */
export function redactText(text: string): string {
  return text.replace(EMAIL_RE, (m) => maskEmail(m)).replace(PHONE_RE, (m) => maskPhone(m));
}

/** Masks personal details inside any JSON-like value, keeping its shape. */
export function redactValue<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactValue(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v)])) as T;
  }
  return value;
}

/** How a guest is shown to staff: their name, else a masked number or email. */
export function guestLabel(g: { name?: string | null; phone?: string | null; email?: string | null }): string {
  if (g.name) return redactText(g.name);
  if (g.phone) return `Guest ${maskPhone(g.phone)}`;
  if (g.email) return `Guest ${maskEmail(g.email)}`;
  return "Guest";
}
