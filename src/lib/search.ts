/**
 * Search and grouping keys for Turkish text. Lowercases with Turkish rules, folds ı/i and
 * removes accents (ş→s, ğ→g, ç→c, ö→o, ü→u) so "ibrahim", "İBRAHİM", "ISMAIL" and "ismail"
 * all meet, and trims surrounding spaces.
 */
export function searchKey(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function matchesText(text: string | null | undefined, term: string): boolean {
  const needle = searchKey(term);
  if (!needle) return true;
  return searchKey(text).includes(needle);
}

const MIN_PHONE_DIGITS = 3;

export function matchesPhone(phone: string | null | undefined, term: string): boolean {
  const needle = term.replace(/\D/g, "");
  if (!phone || needle.length < MIN_PHONE_DIGITS) return false;
  return phone.replace(/\D/g, "").includes(needle);
}
