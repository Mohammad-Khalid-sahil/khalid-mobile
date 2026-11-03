export const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
export const today = () => iso(new Date());
export function preset(key) {
  const d = new Date(); const to = iso(d);
  if (key === "today") return { from: to, to };
  if (key === "yesterday") { d.setDate(d.getDate() - 1); return { from: iso(d), to: iso(d) }; }
  if (key === "7d") { d.setDate(d.getDate() - 6); return { from: iso(d), to }; }
  if (key === "30d") { d.setDate(d.getDate() - 29); return { from: iso(d), to }; }
  if (key === "month") { d.setDate(1); return { from: iso(d), to }; }
  if (key === "year") { d.setMonth(0, 1); return { from: iso(d), to }; }
  return { from: "", to: "" };
}
export const PRESETS = ["today", "yesterday", "7d", "30d", "month", "year"];
