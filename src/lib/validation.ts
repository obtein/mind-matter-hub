/**
 * Validates Turkish TC Identity Number using checksum algorithm
 * TC identity numbers are 11 digits, starting with a non-zero digit
 */
export function isValidTCIdentity(tc: string): boolean {
  // Must be exactly 11 digits and not start with 0
  if (!/^[1-9]\d{10}$/.test(tc)) return false;

  const digits = tc.split("").map(Number);

  // First checksum: ((sum of odd positions * 7) - sum of even positions) mod 10 = 10th digit
  const sum1 = (digits[0] + digits[2] + digits[4] + digits[6] + digits[8]) * 7;
  const sum2 = digits[1] + digits[3] + digits[5] + digits[7];
  const check1 = (sum1 - sum2) % 10;

  if (check1 !== digits[9]) return false;

  // Second checksum: sum of first 10 digits mod 10 = 11th digit
  const sum3 = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  const check2 = sum3 % 10;

  return check2 === digits[10];
}

/**
 * Format TC identity input - only allow digits
 */
export function formatTCIdentity(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}
