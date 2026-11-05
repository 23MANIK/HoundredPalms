/** Guards that only apply on the live site. */

/** True only on the production deployment (hundred-palms.vercel.app). */
export function isLiveSite() {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Placeholder numbers such as 9999999999 are for local and CI test data. On the
 * live site they can't sign in or be given a staff login, so a shared default
 * account can never work there.
 */
export function isPlaceholderPhone(phone: string) {
  return /^(\d)\1{9}$/.test(phone.replace(/\D/g, "").slice(-10));
}
