import { useState } from "react";
import { HandCoins, Pencil, Plus, UserCog } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApp } from "../lib/app";
import { del, get, post, put } from "../lib/api";
import { Badge, Btn, DataTable, DateField, Dt, Field, Input, Modal, PageHead, Select, Spinner, Stat, Textarea, useFetch } from "../components/ui";

export default function Employees() {
  const { t, fmt, can } = useApp(); const [tick, setTick] = useState(0); const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null);
  return (
    <>
      <PageHead icon={UserCog} title={t("nav.employees")} sub={t("employees.sub")} actions={can("employees.manage") && <Btn variant="accent" icon={Plus} onClick={() => setEdit({ name: "", phone: "", position: "", address: "", salary: "", startDate: "", note: "", active: true })}>{t("employee.add")}</Btn>} />
      <DataTable endpoint="/employees" exportName="employees" refreshKey={tick} onRow={(e) => setOpen(e._id)} rowClass={(e) => (e.active ? "" : "opacity-55")} columns={[
        { key: "name", label: t("name"), sort: "name", render: (e) => <span className="font-bold">{e.name}</span> }, { key: "position", label: t("employee.position") }, { key: "phone", label: t("phone"), render: (e) => <span className="num ltr text-mute">{e.phone || "—"}</span> },
        { key: "startDate", label: t("employee.start"), render: (e) => <Dt v={e.startDate} />, text: (e) => fmt.date(e.startDate) }, { key: "salary", label: t("employee.salary"), align: "end", render: (e) => <b className="num">{fmt.num(e.salary)}</b>, text: (e) => e.salary },
        { key: "adv", label: t("salary.advanceBalance"), align: "end", render: (e) => (e.advanceBalance > 0 ? <b className="num text-warn">{fmt.num(e.advanceBalance)}</b> : "—"), text: (e) => e.advanceBalance }, { key: "active", label: t("status"), render: (e) => <Badge tone={e.active ? "ok" : "neutral"}>{t(e.active ? "active" : "inactive")}</Badge>, text: (e) => (e.active ? "active" : "inactive") }]} />
      {edit && <EmpForm initial={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); setTick((x) => x + 1); }} />}
      {open && <EmpDetail id={open} onClose={() => setOpen(null)} onEdit={(e) => { setOpen(null); setEdit(e); }} onChanged={() => setTick((x) => x + 1)} />}
    </>
  );
}

function EmpForm({ initial, onClose, onDone }) {
  const { t, toast, confirm } = useApp(); const [e, setE] = useState({ ...initial, user: initial.user?._id || initial.user || "", startDate: initial.startDate?.slice(0, 10) || "" }); const isNew = !initial._id;
  const set = (k) => (x) => setE({ ...e, [k]: x.target.value });
  const run = async () => { try { await (isNew ? post("/employees", e) : put(`/employees/${e._id}`, e)); toast.ok(t("saved")); onDone(); } catch (er) { toast.err(er); } };
  const remove = async () => { const c = await confirm({ title: t("party.delete"), message: t("party.delete.msg"), danger: true }); if (!c.ok) return; try { const r = await del(`/employees/${e._id}`); toast.ok(r.deactivated ? t("party.deactivated") : t("deleted")); onDone(); } catch (er) { toast.err(er); } };
  return <Modal size="md" title={t(isNew ? "employee.add" : "edit")} onClose={onClose}><div className="grid gap-4 sm:grid-cols-2">
    <Field label={t("name")}><Input autoFocus value={e.name} onChange={set("name")} /></Field><Field label={t("employee.position")}><Input value={e.position} onChange={set("position")} /></Field><Field label={t("phone")}><Input dir="ltr" value={e.phone} onChange={set("phone")} /></Field><Field label={t("employee.salary")}><Input type="number" min="0" className="num" value={e.salary} onChange={set("salary")} /></Field>
    <Field label={t("employee.start")}><DateField value={e.startDate} onChange={(v) => setE({ ...e, startDate: v })} /></Field><Field label={t("address")}><Input value={e.address} onChange={set("address")} /></Field><Field label={t("note")} wide><Textarea value={e.note} onChange={set("note")} /></Field>
    {!isNew && <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={e.active} onChange={(x) => setE({ ...e, active: x.target.checked })} />{t("active")}</label>}
    <div className="flex gap-2 sm:col-span-2">{!isNew && <Btn variant="danger" onClick={remove}>{t("delete")}</Btn>}<Btn variant="ghost" className="ms-auto" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!e.name.trim()} onClick={run}>{t("save")}</Btn></div></div></Modal>;
}

function EmpDetail({ id, onClose, onEdit, onChanged }) {
  const { t, fmt, can } = useApp(); const { data: e } = useFetch(`/employees/${id}`, {}, []); const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); const [tick, setTick] = useState(0); const { data: sum } = useFetch(`/employees/${id}/summary`, { period }, [tick]); const [pay, setPay] = useState(null);
  const salaryParts = sum ? [{ name: "paid", value: Math.max(0, sum.paid) }, { name: "deducted", value: Math.max(0, sum.credited - sum.paid) }, { name: "remaining", value: Math.max(0, sum.remaining) }].filter((x) => x.value > 0) : [];
  return (
    <Modal size="lg" title={e?.name || "…"} onClose={onClose} footer={e && <>{can("employees.manage") && <Btn variant="ghost" icon={Pencil} onClick={() => onEdit(e)}>{t("edit")}</Btn>}{can("salaries.manage") && e.active && <><Btn variant="soft" onClick={() => setPay("advance")}>{t("salary.advance")}</Btn><Btn variant="accent" icon={HandCoins} onClick={() => setPay("salary")}>{t("salary.pay")}</Btn></>}</>}>
      {!e || !sum ? <Spinner /> : <>
        <div className="mb-4 flex items-center gap-3"><Field label={t("salary.period")}><Input type="month" className="num !w-48" value={period} onChange={(x) => setPeriod(x.target.value)} /></Field></div>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label={t("employee.salary")} value={fmt.money(sum.salary)} /><Stat tone="ok" label={t("salary.paid")} value={fmt.money(sum.paid)} sub={sum.credited > sum.paid ? `+ ${fmt.num(sum.credited - sum.paid)} ${t("salary.deducted")}` : undefined} /><Stat tone={sum.remaining ? "warn" : "ok"} label={t("salary.remaining")} value={fmt.money(sum.remaining)} /><Stat tone="acc" label={t("salary.advanceBalance")} value={fmt.money(sum.advanceBalance)} /></div>
        {sum.salary > 0 && <section className="card mb-5 overflow-hidden"><h3 className="border-b border-line px-5 py-3.5 font-extrabold">{t("salary.progressChart")}</h3><div className="h-[245px] p-3" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={salaryParts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={4} stroke="var(--card)">{salaryParts.map((x) => <Cell key={x.name} fill={{ paid: "var(--ok)", deducted: "var(--pri)", remaining: "var(--warn)" }[x.name]} />)}</Pie><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} formatter={(v, key) => [fmt.money(v), t(`salary.${key}`)]} /><Legend formatter={(key) => <span style={{ color: "var(--ink)" }}>{t(`salary.${key}`)}</span>} /></PieChart></ResponsiveContainer></div></section>}
        <DataTable endpoint="/salaries" params={{ employee: id }} refreshKey={tick} search={false} pageSize={8} columns={[{ key: "date", label: t("date"), render: (s) => <Dt v={s.date} /> }, { key: "kind", label: t("type"), render: (s) => <Badge tone={s.kind === "advance" ? "warn" : "ok"}>{t(`salary.kind.${s.kind}`)}</Badge> }, { key: "period", label: t("salary.period"), render: (s) => <span className="num">{s.period}</span> }, { key: "account", label: t("account"), render: (s) => s.account?.name },
          { key: "deduction", label: t("salary.deducted"), align: "end", render: (s) => (s.deduction ? <span className="num">{fmt.num(s.deduction)}</span> : "—") }, { key: "amount", label: t("amount"), align: "end", render: (s) => <b className="num">{fmt.num(s.amount)}</b> }]} />
      </>}
      {pay && <PayForm kind={pay} emp={e} sum={sum} period={period} onClose={() => setPay(null)} onDone={() => { setPay(null); setTick((x) => x + 1); onChanged(); }} />}
    </Modal>
  );
}
function PayForm({ kind, emp, sum, period, onClose, onDone }) {
  const { t, toast, fmt } = useApp(); const [amount, setAmount] = useState(kind === "salary" ? String(Math.max(0, sum.remaining - Math.min(sum.advanceBalance, sum.remaining))) : ""); const [ded, setDed] = useState(""); const [method, setMethod] = useState("cash"); const [note, setNote] = useState("");
  const run = async () => { try { await post("/salaries", { employeeId: emp._id, kind, amount: Number(amount) || 0, deduction: Number(ded) || 0, period, method, note }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t(kind === "salary" ? "salary.pay" : "salary.advance")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!(Number(amount) > 0 || Number(ded) > 0)} onClick={run}>{t("confirm")}</Btn></>}>
    <div className="grid gap-4"><div className="rounded-xl bg-soft p-3 text-sm">{emp.name} · {period}{kind === "salary" && <> · {t("salary.remaining")}: <b className="num">{fmt.money(sum.remaining)}</b></>}</div>
      <Field label={t("salary.cashPaid")}><Input type="number" min="0" autoFocus className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      {kind === "salary" && sum.advanceBalance > 0 && <Field label={t("salary.deduct")} hint={`${t("salary.advanceBalance")}: ${fmt.num(sum.advanceBalance)}`}><Input type="number" min="0" className="num" value={ded} onChange={(e) => setDed(e.target.value)} /></Field>}
      <Field label={t("pay.method")}><Select value={method} onChange={(e) => setMethod(e.target.value)}>{["cash", "bank", "digital"].map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</Select></Field><Field label={t("note")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field></div></Modal>;
}
