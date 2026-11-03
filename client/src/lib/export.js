
/** rows: array of objects; cols: [{key,label}] → downloads .xlsx (opens in Excel) */
export async function exportXlsx(name, cols, rows) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.label, c.value ? c.value(r) : r[c.key]])));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(10, String(c.label).length + 2) }));
  const wb = XLSX.utils.book_new(); if (wb.Workbook === undefined) wb.Workbook = { Views: [{ RTL: document.dir === "rtl" }] };
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${name}.xlsx`);
}
export function exportCsv(name, cols, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(c.value ? c.value(r) : r[c.key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` }); document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export const printNow = () => setTimeout(() => window.print(), 50);
