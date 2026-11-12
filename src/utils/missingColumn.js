// "This column is not in the database yet" — the two ways PostgREST says it.
//
//   42703     a SELECT names an unknown column (Postgres undefined_column)
//   PGRST204  an INSERT / UPDATE names one ("not found in the schema cache")
//
// Code that reads or writes a column from a migration that may not be applied
// yet checks this and degrades, instead of failing the whole request (see
// migrations/contact_reports_contact_id.sql). A leaf module, so a form can use
// it without importing a page's logic.
const MISSING_COLUMN_CODES = ['42703', 'PGRST204'];

export const isMissingColumn = (error) => !!error && MISSING_COLUMN_CODES.includes(String(error.code));
