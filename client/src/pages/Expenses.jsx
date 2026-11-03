import { useEffect, useState } from "react";
import { Ban, BadgeDollarSign, Plus } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../lib/app";
import { get, post } from "../lib/api";
import { Badge, Btn, DataTable, DateField, Dt, Field, Input, Modal, PageHead, Select, Stat, Textarea, useFetch } from "../components/ui";
import RangePicker from "../components/RangePicker";
import { preset } from "../lib/dates";

export default function Expenses() {
  const { t, fmt, settings, toast, confirm } = useApp(); const [tick, setTick] = useState(0); const [add, setAdd] = useState(false); const [cat, setCat] = useState(""); const [r, setR] = useState({ ...preset("month"), key: "month" });
  const { data } = useFetch("/expenses", { from: r.from, to: r.to, category: cat, status: "active", limit: 1 }, [tick, r.from, r.to, cat]);
  const categoryRows = Object.entries(data?.byCategory || {}).map(([name, value]) => ({ name, value }));
  const cancel = async (e) => { const c = await confirm({ title: t("expense.cancel"), message: e.title, reason: true, danger: true }); if (!c.ok) return; try { await post(`/expenses/${e._id}/cancel`, { reason: c.reason }); toast.ok(t("saved")); setTick((x) => x + 1); } catch (er) { toast.err(er); } };
  return (
    <>
      <PageHead icon={BadgeDollarSign} title={t("nav.expenses")} sub={t("expenses.sub")} actions={<Btn variant="accent" icon={Plus} onClick={() => setAdd(true)}>{t("expense.add")}</Btn>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat tone="bad" icon={BadgeDollarSign} label={t("expenses.total")} value={fmt.money(data?.sum || 0)} /></div>
      {!!categoryRows.length && <section className="card mb-5 overflow-hidden"><h2 className="border-b border-line px-5 py-3.5 font-extrabold">{t("expenses.byCategoryChart")}</h2><div className="h-[280px] p-4" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryRows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4} stroke="var(--card)">{categoryRows.map((x, i) => <Cell key={x.name} fill={["var(--chart-start)", "var(--pri)", "var(--ok)", "var(--warn)", "var(--blue)", "var(--bad)"][i % 6]} />)}</Pie><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v) => fmt.money(v)} /><Legend formatter={(name) => <span style={{ color: "var(--ink)" }}>{name}</span>} /></PieChart></ResponsiveContainer></div></section>}
      <DataTable endpoint="/expenses" exportName="expenses" refreshKey={tick} params={{ from: r.from, to: r.to, category: cat }} searchPlaceholder={t("expenses.search")}
        filters={<><Select className="!w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">{t("category")}: {t("all")}</option>{settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}</Select><div className="w-full"><RangePicker value={r} onChange={setR} /></div></>}
        columns={[{ key: "date", label: t("date"), sort: "date", render: (e) => <Dt v={e.date} />, text: (e) => fmt.date(e.date) }, { key: "title", label: t("title"), render: (e) => <span className={`font-bold ${e.status === "cancelled" ? "line-through opacity-60" : ""}`}>{e.title}</span> }, { key: "category", label: t("category"), render: (e) => <Badge>{e.category}</Badge> },
          { key: "account", label: t("account"), render: (e) => e.account?.name, text: (e) => e.account?.name }, { key: "user", label: t("user"), render: (e) => e.user?.name, text: (e) => e.user?.name }, { key: "note", label: t("note"), render: (e) => <span className="block max-w-[200px] truncate text-mute">{e.note}</span> },
          { key: "amount", label: t("amount"), sort: "amount", align: "end", render: (e) => <b className="num">{fmt.num(e.amount)}</b>, text: (e) => e.amount },
          { key: "a", label: "", export: false, render: (e) => (e.status === "active" ? <Btn size="sm" variant="danger" icon={Ban} onClick={() => cancel(e)}>{t("cancel")}</Btn> : <Badge tone="bad">{t("status.cancelled")}</Badge>) }]} />
      {add && <ExpenseForm onClose={() => setAdd(false)} onDone={() => { setAdd(false); setTick((x) => x + 1); }} />}
    </>
  );
}
function ExpenseForm({ onClose, onDone }) {
  const { t, toast, settings } = useApp(); const [e, setE] = useState({ title: "", category: settings.expenseCategories[0], amount: "", date: "", method: "cash", note: "" }); const [accounts, setAccounts] = useState([]); const [acc, setAcc] = useState("");
  useEffect(() => { get("/accounts").then(setAccounts).catch(() => {}); }, []);
  const list = accounts.filter((a) => a.type === e.method);
  const run = async () => { try { await post("/expenses", { ...e, amount: Number(e.amount), date: e.date || undefined, accountId: acc || (list.find((a) => a.isDefault) || list[0])?._id }); toast.ok(t("saved")); onDone(); } catch (er) { toast.err(er); } };
  return <Modal size="sm" title={t("expense.add")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!e.title.trim() || !(Number(e.amount) > 0)} onClick={run}>{t("save")}</Btn></>}>
    <div className="grid gap-4"><Field label={t("title")}><Input autoFocus value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label={t("category")}><Select value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>{settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}</Select></Field><Field label={t("amount")}><Input type="number" min="0" className="num" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value })} /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label={t("pay.method")}><Select value={e.method} onChange={(x) => { setE({ ...e, method: x.target.value }); setAcc(""); }}>{["cash", "bank", "digital"].map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</Select></Field><Field label={t("account")}><Select value={acc} onChange={(x) => setAcc(x.target.value)}><option value="">{t("default")}</option>{list.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select></Field></div>
      <Field label={t("date")}><DateField value={e.date} onChange={(v) => setE({ ...e, date: v })} /></Field><Field label={t("note")}><Textarea value={e.note} onChange={(x) => setE({ ...e, note: x.target.value })} /></Field></div></Modal>;
}
