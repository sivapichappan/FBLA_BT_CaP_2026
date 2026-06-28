/**
 * Tiny, dependency-free download helpers shared by both reports (owner + user).
 * The schema-specific flattening (which rows go in the CSV) stays in each report
 * page; this module only owns the mechanics: quoting, Blob creation, and the
 * click-to-download dance. Hand-rolled so every byte is defensible in Q&A (§18).
 */

/** Trigger a browser download of `content` under `filename`. */
function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Render a grid of rows as CSV. Every cell is quoted and embedded quotes are
 * doubled (RFC 4180), so commas in names/titles never break a column.
 */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}

/** Download `rows` as a .csv file. */
export function downloadCsv(
  filename: string,
  rows: (string | number)[][],
): void {
  download(filename, toCsv(rows), "text/csv;charset=utf-8");
}

/** Download any serializable value as pretty-printed .json. */
export function downloadJson(filename: string, data: unknown): void {
  download(filename, JSON.stringify(data, null, 2), "application/json");
}

/** Cents → "$1,234" (whole dollars; reports never show partial cents). */
export function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}
