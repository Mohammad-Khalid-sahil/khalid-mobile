import { useState } from "react";
import { Boxes, ClipboardCheck, ScanLine, SlidersHorizontal } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../lib/app";
import { post } from "../lib/api";
import { Badge, Btn, DataTable, Dt, ExportMenu, Field, Input, Modal, PageHead, Select, SimpleTable, Spinner, Stat, StockBadge, Tabs, Textarea, useFetch } from "../components/ui";

export default function Inventory() {
  const { t, can } = useApp(); const [tab, setTab] = useState("stock");
  return (
    <>
      <PageHead icon={Boxes} title={t("nav.inventory")} sub={t("inv.sub")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "stock", label: t("inv.tab.stock") }, { key: "phones", label: t("inv.tab.phones") }, { key: "moves", label: t("inv.tab.moves") }, ...(can("inventory.adjust") ? [{ key: "count", label: t("inv.tab.count") }] : [])]} />
      {tab === "stock" && <Stock />}{tab === "phones" && <Phones />}{tab === "moves" && <Moves />}{tab === "count" && <Count />}
    </>
  );
}

function Stock() {
  const { t, fmt, can } = useApp(); const [filter, setFilter] = useState(""); const { data, loading, reload } = useFetch("/reports/inventory", { filter }, []); const [adj, setAdj] = useState(null);
  if (!data) return <Spinner />;
  const cost = data.totals.value !== undefined;
  const stockHealth = [
    { name: t("stock.in"), value: data.rows.filter((x) => x.status === "in").length, color: "var(--ok)" },
    { name: t("stock.low"), value: data.rows.filter((x) => x.status === "low").length, color: "var(--warn)" },
    { name: t("stock.out"), value: data.rows.filter((x) => x.status === "out").length, color: "var(--bad)" },
  ].filter((x) => x.value > 0);
  const cols = [
    { label: t("product"), render: (r) => <span className="ltr font-bold">{r.name}</span> }, { label: t("brand"), render: (r) => r.brand || "—" }, { label: t("category"), render: (r) => r.category || "—" },
    { label: t("stock"), align: "end", render: (r) => <StockBadge p={{ qty: r.qty, minStock: r.minStock, kind: r.kind }} /> }, { label: t("inv.defective"), align: "end", render: (r) => (r.defective ? <Badge tone="bad">{fmt.num(r.defective)}</Badge> : "—") },
    ...(cost ? [{ label: t("inv.value"), align: "end", render: (r) => fmt.num(r.value) }] : []), { label: t("sellPrice"), align: "end", render: (r) => fmt.num(r.sell) },
    ...(can("inventory.adjust") ? [{ label: "", render: (r) => r.kind === "item" && <Btn size="sm" variant="soft" icon={SlidersHorizontal} onClick={() => setAdj(r)}>{t("inv.adjust")}</Btn> }] : []),
  ];
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label={t("inv.units")} value={fmt.num(data.totals.units)} icon={Boxes} />{cost && <Stat tone="acc" label={t("inv.valueBuy")} value={fmt.money(data.totals.value)} />}<Stat tone="ok" label={t("inv.valueRetail")} value={fmt.money(data.totals.retail)} /><Stat tone={data.totals.defective || data.flaggedImei ? "bad" : "pri"} label={t("inv.defective")} value={fmt.num(data.totals.defective)} sub={data.flaggedImei ? `${fmt.num(data.flaggedImei)} ${t("unit.flagged")}` : undefined} /></div>
      {stockHealth.length > 0 && <section className="card mb-5 overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t("inv.stockHealth")}</h2><div className="h-[230px] p-3" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stockHealth} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={4} stroke="var(--card)">{stockHealth.map((x) => <Cell key={x.name} fill={x.color} />)}</Pie><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v) => fmt.num(v)} /><Legend formatter={(name) => <span style={{ color: "var(--ink)" }}>{name}</span>} /></PieChart></ResponsiveContainer></div></section>}
      <div className="card overflow-hidden">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line p-3"><Select className="!w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">{t("all")}</option><option value="low">{t("stock.low")}</option><option value="out">{t("stock.out")}</option></Select><div className="ms-auto"><ExportMenu name="inventory" cols={[{ label: t("product"), key: "name" }, { label: t("brand"), key: "brand" }, { label: t("category"), key: "category" }, { label: t("stock"), key: "qty" }, { label: t("inv.defective"), key: "defective" }, ...(cost ? [{ label: t("buyPrice"), key: "buy" }, { label: t("inv.value"), key: "value" }] : []), { label: t("sellPrice"), key: "sell" }]} getRows={async () => data.rows} /></div></div>
        <SimpleTable cols={cols} rows={data.rows} rowKey={(r) => r.id} />
      </div>
      {adj && <Adjust p={adj} onClose={() => setAdj(null)} onDone={() => { setAdj(null); reload(); }} />}
    </>
  );
}

function Adjust({ p, onClose, onDone }) {
  const { t, toast, fmt } = useApp(); const [mode, setMode] = useState("set"); const [v, setV] = useState(String(p.qty)); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { if (mode === "set") await post("/inventory/adjust", { productId: p.id, newQty: v, reason }); else if (mode === "add") await post("/inventory/adjust", { productId: p.id, delta: v, reason }); else await post("/inventory/defect", { productId: p.id, qty: v, to: mode === "defect" ? "defective" : "sellable", reason }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); setBusy(false); } };
  return (
    <Modal size="sm" title={`${t("inv.adjust")} — ${p.name}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn loading={busy} disabled={!reason.trim() || v === ""} onClick={run}>{t("confirm")}</Btn></>}>
      <div className="grid gap-4"><div className="rounded-xl bg-soft p-3 text-sm">{t("stock")}: <b className="num">{fmt.num(p.qty)}</b> · {t("inv.defective")}: <b className="num">{fmt.num(p.defective)}</b></div>
        <Field label={t("inv.adjust.mode")}><Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="set">{t("inv.mode.set")}</option><option value="add">{t("inv.mode.add")}</option><option value="defect">{t("inv.mode.defect")}</option><option value="restore">{t("inv.mode.restore")}</option></Select></Field>
        <Field label={mode === "set" ? t("inv.newQty") : t("qty")}><Input type="number" className="num" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Field label={t("reason")}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
    </Modal>
  );
}

function Phones() {
  const { t, fmt, can, toast } = useApp(); const [status, setStatus] = useState(""); const [tick, setTick] = useState(0); const [chg, setChg] = useState(null);
  return (
    <>
      <DataTable endpoint="/units" exportName="phones-imei" params={{ status }} refreshKey={tick} searchPlaceholder={t("unit.search")}
        filters={<Select className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("status")}: {t("all")}</option>{["available", "sold", "defective", "review", "lost", "cancelled"].map((k) => <option key={k} value={k}>{t(`unit.${k}`)}</option>)}</Select>}
        columns={[
          { key: "imei1", label: "IMEI", render: (u) => <span className="num ltr font-bold">{u.imei1 || "—"}</span> }, { key: "imei2", label: "IMEI 2", render: (u) => <span className="num ltr text-mute">{u.imei2 || "—"}</span> },
          { key: "serial", label: t("serial"), render: (u) => <span className="num ltr text-mute">{u.serial || "—"}</span> }, { key: "p", label: t("product"), render: (u) => <span className="ltr font-semibold">{u.product?.name}</span>, text: (u) => u.product?.name },
          { key: "condition", label: t("condition"), render: (u) => t(`cond.${u.condition}`), text: (u) => u.condition },
          { key: "status", label: t("status"), render: (u) => <span className="flex items-center gap-1.5"><Badge tone={u.status === "available" ? "ok" : u.status === "sold" ? "neutral" : "warn"}>{t(`unit.${u.status}`)}</Badge>{u.flagged && <Badge tone="bad">{t("unit.flagged")}</Badge>}</span>, text: (u) => u.status },
          { key: "purchasedAt", label: t("date"), render: (u) => <Dt v={u.purchasedAt || u.createdAt} />, text: (u) => fmt.date(u.purchasedAt || u.createdAt) },
          ...(can("inventory.adjust") ? [{ key: "a", label: "", export: false, render: (u) => !["sold", "cancelled"].includes(u.status) && <Btn size="sm" variant="soft" onClick={() => setChg(u)}>{t("unit.changeStatus")}</Btn> }] : []),
        ]} />
      {chg && <UnitStatus u={chg} onClose={() => setChg(null)} onDone={() => { setChg(null); setTick((x) => x + 1); }} />}
    </>
  );
}
function UnitStatus({ u, onClose, onDone }) {
  const { t, toast } = useApp(); const [s, setS] = useState(u.status === "available" ? "defective" : "available"); const [reason, setReason] = useState("");
  const run = async () => { try { await post("/inventory/unit-status", { unitId: u._id, status: s, reason }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={`${t("unit.changeStatus")} — ${u.imei1 || u.serial}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!reason.trim()} onClick={run}>{t("confirm")}</Btn></>}>
    <div className="grid gap-4"><Field label={t("status")}><Select value={s} onChange={(e) => setS(e.target.value)}>{["available", "defective", "review", "lost"].filter((x) => x !== u.status).map((k) => <option key={k} value={k}>{t(`unit.${k}`)}</option>)}</Select></Field><Field label={t("reason")}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div></Modal>;
}

function Moves() {
  const { t, fmt } = useApp();
  return <DataTable endpoint="/inventory/movements" exportName="stock-movements" search={false} columns={[
    { key: "at", label: t("date"), sort: "at", render: (m) => <Dt v={m.at} time />, text: (m) => fmt.date(m.at, true) },
    { key: "p", label: t("product"), render: (m) => <span className="ltr font-semibold">{m.product?.name}{m.unit && <span className="num block text-xs font-normal text-mute">{m.unit.imei1 || m.unit.serial}</span>}</span>, text: (m) => `${m.product?.name || ""} ${m.unit?.imei1 || ""}` },
    { key: "type", label: t("type"), render: (m) => <Badge tone={m.qty > 0 ? "ok" : m.qty < 0 ? "bad" : "neutral"}>{t(`move.${m.type}`)}</Badge>, text: (m) => t(`move.${m.type}`) },
    { key: "qty", label: t("qty"), sort: "qty", align: "end", render: (m) => <b className={`num ${m.qty > 0 ? "text-ok" : m.qty < 0 ? "text-bad" : ""}`}>{m.qty > 0 ? "+" : ""}{fmt.num(m.qty)}</b>, text: (m) => m.qty },
    { key: "ref", label: t("reference"), render: (m) => <span className="num ltr">{m.ref?.no || m.reason}</span>, text: (m) => m.ref?.no || m.reason }, { key: "reason", label: t("reason"), render: (m) => <span className="block max-w-[220px] truncate text-mute">{m.reason}</span> },
    { key: "u", label: t("user"), render: (m) => m.user?.name, text: (m) => m.user?.name }]} />;
}

function Count() {
  const { t, fmt, toast } = useApp(); const { data } = useFetch("/reports/inventory", {}, []); const [vals, setVals] = useState({}); const [reason, setReason] = useState(""); const [res, setRes] = useState(null); const [codes, setCodes] = useState(""); const [scan, setScan] = useState(null);
  const items = (data?.rows || []).filter((r) => r.kind === "item");
  const run = async (apply) => { try { const r = await post("/inventory/count", { reason: reason || "count", apply, items: Object.entries(vals).filter(([, v]) => v !== "").map(([productId, counted]) => ({ productId, counted })) }); setRes(r); if (apply) { toast.ok(t("saved")); setVals({}); } } catch (e) { toast.err(e); } };
  const runScan = async () => { try { setScan(await post("/inventory/imei-count", { codes: codes.split(/[\s,;]+/).filter(Boolean) })); } catch (e) { toast.err(e); } };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="card p-5"><h3 className="mb-1 flex items-center gap-2 font-extrabold"><ClipboardCheck size={18} />{t("count.items")}</h3><p className="mb-4 text-sm text-mute">{t("count.items.hint")}</p>
        <div className="scroll-thin max-h-[420px] overflow-y-auto"><table className="w-full text-sm"><tbody>{items.map((r) => <tr key={r.id} className="border-t border-line"><td className="ltr py-2 font-semibold">{r.name}</td><td className="num px-2 text-end text-mute">{fmt.num(r.qty)}</td><td className="w-28 py-1.5"><Input type="number" min="0" className="num !py-1.5" placeholder={t("count.counted")} value={vals[r.id] ?? ""} onChange={(e) => setVals({ ...vals, [r.id]: e.target.value })} /></td></tr>)}</tbody></table></div>
        <div className="mt-4 grid gap-3"><Field label={t("reason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("count.reason.ph")} /></Field><div className="flex gap-2"><Btn variant="soft" onClick={() => run(false)}>{t("count.preview")}</Btn><Btn disabled={!reason.trim() || !Object.values(vals).some((v) => v !== "")} onClick={() => run(true)}>{t("count.apply")}</Btn></div></div>
        {res && <div className="mt-4"><SimpleTable cols={[{ label: t("product"), render: (r) => <span className="ltr">{r.name}</span> }, { label: t("count.system"), key: "system", align: "end" }, { label: t("count.counted"), key: "counted", align: "end" }, { label: t("count.diff"), align: "end", render: (r) => <b className={r.diff ? (r.diff > 0 ? "text-ok" : "text-bad") : ""}>{r.diff > 0 ? "+" : ""}{fmt.num(r.diff)}</b> }]} rows={res.rows} /></div>}
      </div>
      <div className="card p-5"><h3 className="mb-1 flex items-center gap-2 font-extrabold"><ScanLine size={18} />{t("count.phones")}</h3><p className="mb-4 text-sm text-mute">{t("count.phones.hint")}</p>
        <Textarea rows={6} dir="ltr" className="num" value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="350000000000001&#10;350000000000002" /><Btn className="mt-3" onClick={runScan}>{t("count.compare")}</Btn>
        {scan && <div className="mt-4 grid gap-3 text-sm"><div className="flex gap-2"><Badge tone="ok">{t("count.expected")}: {fmt.num(scan.expected)}</Badge><Badge tone="pri">{t("count.scanned")}: {fmt.num(scan.scanned)}</Badge></div>
          <div><b className="text-bad">{t("count.missing")} ({fmt.num(scan.missing.length)})</b><ul className="mt-1 grid gap-1">{scan.missing.map((u) => <li key={u._id} className="ltr flex justify-between rounded-lg bg-bad-soft px-3 py-1.5"><span className="num">{u.imei1 || u.serial}</span><span>{u.product?.name}</span></li>)}</ul></div>
          {scan.unknown.length > 0 && <div><b className="text-warn">{t("count.unknown")} ({fmt.num(scan.unknown.length)})</b><p className="num ltr mt-1 rounded-lg bg-warn-soft px-3 py-1.5">{scan.unknown.join("  ")}</p></div>}</div>}
      </div>
    </div>
  );
}
