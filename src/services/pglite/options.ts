import { types, type PGliteOptions } from "@electric-sql/pglite";

/**
 * DATE columns (date_of_birth) stay "YYYY-MM-DD" strings. PGlite's default turns them into
 * JS Dates, which the forms and <input type="date"> cannot use.
 */
export const PGLITE_OPTIONS: PGliteOptions = {
  parsers: {
    [types.DATE]: (value: string) => value,
  },
};
