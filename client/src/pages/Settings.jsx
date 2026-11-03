import { useState } from "react";
import { Plus, Save, Settings as Cog, Trash2, Upload, X } from "lucide-react";
import { useApp } from "../lib/app";
import { del, post, put } from "../lib/api";
import { Badge, Btn, Field, IconBtn, Input, PageHead, Select, Tabs, Textarea, useFetch } from "../components/ui";

export default function Settings() {
  const { t } = useApp(); const [tab, setTab] = useState("general");
  return (<><PageHead icon={Cog} title={t("nav.settings")} sub={t("settings.sub")} /><Tabs value={tab} onChange={setTab} tabs={[{ key: "general", label: t("set.general") }, { key: "rules", label: t("set.rules") }, { key: "catalog", label: t("set.catalog") }]} />{tab === "catalog" ? <Catalog /> : <General tab={tab} />}</>);
}

function Toggle({ label, hint, checked, onChange }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line p-4"><span><span className="block font-bold">{label}</span>{hint && <span className="mt-0.5 block text-sm text-mute">{hint}</span>}</span><input type="checkbox" role="switch" className="mt-1 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition checked:bg-pri after:block after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition checked:after:translate-x-4 rtl:checked:after:-translate-x-4" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>;
}

function General({ tab }) {
  const { t, settings, setSettings, toast } = useApp(); const [s, setS] = useState(() => JSON.parse(JSON.stringify(settings))); const [busy, setBusy] = useState(false); const [cat, setCat] = useState("");
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value }); const rule = (k) => (e) => setS({ ...s, rules: { ...s.rules, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value } });
  const logo = (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 400_000) return toast.err({ message: t("err.FILE_TOO_LARGE") }); const r = new FileReader(); r.onload = () => setS({ ...s, logo: r.result }); r.readAsDataURL(f); };
  const save = async () => { setBusy(true); try { setSettings(await put("/settings", s)); toast.ok(t("saved")); } catch (e) { toast.err(e); } finally { setBusy(false); } };
  return (
    <div className="grid max-w-4xl gap-5">
      {tab === "general" && <>
        <div className="card grid gap-4 p-6 sm:grid-cols-2"><h2 className="text-lg font-extrabold sm:col-span-2">{t("set.shop")}</h2>
          <Field label={t("set.shopName")}><Input value={s.shopName} onChange={set("shopName")} /></Field><Field label={t("phone")}><Input dir="ltr" value={s.phone} onChange={set("phone")} /></Field><Field label={t("address")} wide><Input value={s.address} onChange={set("address")} /></Field>
          <Field label={t("set.logo")}><div className="flex items-center gap-3">{s.logo && <img src={s.logo} alt="" className="h-12 w-12 rounded-xl border border-line object-contain p-1" />}<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-soft px-3 py-2 text-sm font-bold hover:bg-pri-soft"><Upload size={15} />{t("upload")}<input type="file" accept="image/*" hidden onChange={logo} /></label>{s.logo && <IconBtn icon={X} label={t("delete")} onClick={() => setS({ ...s, logo: "" })} />}</div></Field></div>
        <div className="card grid gap-4 p-6 sm:grid-cols-3"><h2 className="text-lg font-extrabold sm:col-span-3">{t("set.money")}</h2>
          <Field label={t("set.currency")}><Input dir="ltr" value={s.currency} onChange={set("currency")} /></Field><Field label={t("set.symbol")}><Input value={s.currencySymbol} onChange={set("currencySymbol")} /></Field>
          <Field label={t("set.calendar")}><Select value={s.calendar} onChange={set("calendar")}><option value="both">{t("set.cal.both")}</option><option value="persian">{t("set.cal.persian")}</option><option value="gregory">{t("set.cal.gregory")}</option></Select></Field></div>
        <div className="card grid gap-4 p-6 sm:grid-cols-2"><h2 className="text-lg font-extrabold sm:col-span-2">{t("set.receipt")}</h2>
          <Field label={t("set.paper")}><Select value={s.receiptWidth} onChange={set("receiptWidth")}><option value="80mm">{t("set.paper.80")}</option><option value="58mm">{t("set.paper.58")}</option><option value="A4">A4</option></Select></Field><Field label={t("set.prefix")}><Input dir="ltr" value={s.invoicePrefix} onChange={set("invoicePrefix")} /></Field>
          <Field label={t("set.receiptNote")} wide><Input value={s.receiptNote} onChange={set("receiptNote")} /></Field><Field label={t("set.warrantyTerms")} wide hint={t("set.warrantyTerms.hint")}><Textarea rows={3} value={s.warrantyTerms} onChange={set("warrantyTerms")} /></Field></div>
        <div className="card p-6"><h2 className="mb-3 text-lg font-extrabold">{t("set.expenseCats")}</h2><div className="mb-3 flex flex-wrap gap-2">{s.expenseCategories.map((c) => <span key={c} className="inline-flex items-center gap-1 rounded-full bg-soft py-1 pe-1 ps-3 text-sm font-semibold">{c}<button aria-label={t("delete")} onClick={() => setS({ ...s, expenseCategories: s.expenseCategories.filter((x) => x !== c) })} className="grid h-6 w-6 place-items-center rounded-full hover:bg-bad-soft hover:text-bad"><X size={13} /></button></span>)}</div>
          <div className="flex gap-2"><Input className="max-w-xs" value={cat} onChange={(e) => setCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cat.trim()) { setS({ ...s, expenseCategories: [...s.expenseCategories, cat.trim()] }); setCat(""); } }} placeholder={t("set.expenseCats.add")} /><Btn variant="soft" icon={Plus} disabled={!cat.trim()} onClick={() => { setS({ ...s, expenseCategories: [...s.expenseCategories, cat.trim()] }); setCat(""); }}>{t("add")}</Btn></div></div></>}
      {tab === "rules" && <>
        <div className="card grid gap-3 p-6"><h2 className="text-lg font-extrabold">{t("set.modules")}</h2><Toggle label={t("set.repairs")} hint={t("set.repairs.hint")} checked={s.modules.repairs} onChange={(v) => setS({ ...s, modules: { ...s.modules, repairs: v } })} /><Toggle label={t("set.autoBackup")} hint={t("set.autoBackup.hint")} checked={s.autoBackup} onChange={(v) => setS({ ...s, autoBackup: v })} /></div>
        <div className="card grid gap-3 p-6"><h2 className="text-lg font-extrabold">{t("set.rules")}</h2>
          <Toggle label={t("rule.requireShift")} hint={t("rule.requireShift.hint")} checked={s.rules.requireShift} onChange={(v) => setS({ ...s, rules: { ...s.rules, requireShift: v } })} />
          <Toggle label={t("rule.returnApproval")} hint={t("rule.returnApproval.hint")} checked={s.rules.returnNeedsApproval} onChange={(v) => setS({ ...s, rules: { ...s.rules, returnNeedsApproval: v } })} />
          <Toggle label={t("rule.overdraft")} hint={t("rule.overdraft.hint")} checked={s.rules.allowOverdraft} onChange={(v) => setS({ ...s, rules: { ...s.rules, allowOverdraft: v } })} />
          <div className="grid gap-4 pt-2 sm:grid-cols-3"><Field label={t("rule.warrantyDays")}><Input type="number" min="1" className="num" value={s.rules.warrantyAlertDays} onChange={rule("warrantyAlertDays")} /></Field><Field label={t("rule.returnWindow")} hint={t("rule.returnWindow.hint")}><Input type="number" min="0" className="num" value={s.rules.returnWindowDays} onChange={rule("returnWindowDays")} /></Field></div></div></>}
      <div><Btn icon={Save} loading={busy} onClick={save}>{t("save")}</Btn></div>
    </div>
  );
}

function Catalog() {
  const { t } = useApp();
  return <div className="grid gap-5 lg:grid-cols-2"><List title={t("nav.categories")} ep="/categories" kind /><List title={t("brand")} ep="/brands" /></div>;
}
function List({ title, ep, kind }) {
  const { t, toast } = useApp(); const [tick, setTick] = useState(0); const { data } = useFetch(ep, { limit: 200, sort: "name" }, [tick]); const [name, setName] = useState(""); const [k, setK] = useState("item");
  const act = (fn) => async () => { try { await fn(); setTick((x) => x + 1); } catch (e) { toast.err(e); } };
  const add = act(async () => { await post(ep, { name: name.trim(), ...(kind ? { kind: k } : {}) }); setName(""); });
  return (
    <div className="card p-5"><h2 className="mb-3 font-extrabold">{title}</h2>
      <div className="mb-4 flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} placeholder={t("name")} />{kind && <Select className="!w-36" value={k} onChange={(e) => setK(e.target.value)}>{["phone", "item", "service"].map((x) => <option key={x} value={x}>{t(`kind.${x}`)}</option>)}</Select>}<Btn icon={Plus} disabled={!name.trim()} onClick={add}>{t("add")}</Btn></div>
      <ul className="grid gap-1">{(data?.rows || []).map((r) => <li key={r._id} className={`flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-soft ${r.active ? "" : "opacity-50"}`}><span className="flex-1 font-semibold">{r.name}</span>{kind && <Badge tone={r.kind === "phone" ? "pri" : "neutral"}>{t(`kind.${r.kind}`)}</Badge>}
        <button className="text-sm font-bold text-pri" onClick={act(async () => { const n = prompt(t("name"), r.name); if (n && n.trim()) await put(`${ep}/${r._id}`, { name: n.trim() }); })}>{t("edit")}</button><IconBtn icon={Trash2} tone="danger" label={t("delete")} onClick={act(() => del(`${ep}/${r._id}`))} /></li>)}</ul>
    </div>
  );
}
