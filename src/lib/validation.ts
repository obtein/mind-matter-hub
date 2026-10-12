/** Input validation shared by the patient forms. Pure functions, unit-tested. */

export const MIN_BIRTH_YEAR = 1900;

export function validatePhone(phone: string): boolean {
  if (!phone) return true;
  return /^[0-9\s\-+()]{6,20}$/.test(phone);
}

/**
 * Returns a Turkish error message, or null when the value is acceptable.
 * Empty is allowed (birth date is optional). The year must be between 1900 and today,
 * so a typo such as 20022 can never reach the database again.
 */
export function validateDateOfBirth(dob: string, today: Date = new Date()): string | null {
  if (!dob) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return "Geçersiz doğum tarihi";

  const year = Number(dob.slice(0, 4));
  const currentYear = today.getFullYear();
  if (year < MIN_BIRTH_YEAR || year > currentYear) {
    return `Doğum yılı ${MIN_BIRTH_YEAR} ile ${currentYear} arasında olmalıdır`;
  }

  const parsed = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob) {
    return "Geçersiz doğum tarihi";
  }
  if (dob > today.toISOString().slice(0, 10)) {
    return "Doğum tarihi gelecekte olamaz";
  }
  return null;
}
