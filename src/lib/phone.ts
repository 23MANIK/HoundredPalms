/** Rules for Indian mobile numbers, shared by the screens and the server. */

export type PhoneCheck = { digits: string; error: string | null };

/**
 * Reads what was typed or pasted into a mobile number field.
 * - Spaces, dashes, dots and brackets are ignored.
 * - A leading +91, 91 (when 12 digits) or 0 (when 11 digits) is removed.
 * - Letters or other characters are refused with a message, not dropped.
 * - More than 10 digits is refused with a message, not cut short.
 * When there is an error, `digits` is empty and the field should keep its old value.
 */
export function readPhoneInput(raw: string): PhoneCheck {
  const trimmed = raw.trim();
  if (/[^\d\s\-().+]/.test(trimmed) || /.\+/.test(trimmed)) {
    return { digits: "", error: "A mobile number can only have digits" };
  }
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !digits.startsWith("91")) {
    return { digits: "", error: "Only Indian (+91) mobile numbers are accepted" };
  }
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length > 10) return { digits: "", error: "A mobile number has only 10 digits" };
  return { digits, error: null };
}

/** The message to show for a finished entry, or null when it is a valid number. */
export function phoneProblem(digits: string): string | null {
  if (digits.length === 0) return "Enter your 10-digit mobile number";
  if (digits.length < 10) return `Enter all 10 digits (${digits.length} so far)`;
  if (!/^[6-9]/.test(digits)) return "Indian mobile numbers start with 6, 7, 8 or 9";
  return null;
}

export const isValidPhone = (digits: string) => /^[6-9]\d{9}$/.test(digits);
