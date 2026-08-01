/** Minimal, dependency-free CSV serializer — quotes/escapes per RFC 4180. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (cell: string | number): string => {
    const str = String(cell);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.map(escapeCell).join(","), ...rows.map((row) => row.map(escapeCell).join(","))];
  // Prepend a UTF-8 BOM so Excel opens Arabic text correctly.
  return "﻿" + lines.join("\r\n");
}
