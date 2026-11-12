export type Cell = string | number | null | undefined;

/**
 * Rows to CSV text for Excel/Sheets. Text that starts like a formula (= + - @) gets a leading
 * apostrophe so a spreadsheet shows it instead of running it; numbers are left as numbers. Starts
 * with a BOM so Excel reads Sinhala/Tamil names as UTF-8.
 */
export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
