/** Rules for staff PINs, shared by the screens and the server. */

/** True when the PIN is the same digit repeated, or a straight run like 1234 or 9876. */
function easyToGuess(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const steps = new Set<number>();
  for (let i = 1; i < pin.length; i++) steps.add(Number(pin[i]) - Number(pin[i - 1]));
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

/** The message to show for a new PIN, or null when it can be used. */
export function pinProblem(pin: string): string | null {
  if (pin.length === 0) return "Enter a PIN of 4 to 6 digits";
  if (/\D/.test(pin)) return "PIN can only have digits";
  if (pin.length < 4 || pin.length > 6) return "PIN must be 4 to 6 digits";
  if (easyToGuess(pin)) return "PIN is too easy to guess. Don't use one digit repeated (1111) or a run (1234)";
  return null;
}
