import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ban, ClipboardPaste, Plus, Trash2, Truck } from "lucide-react";
import { useApp } from "../lib/app";
import { get, patch, post } from "../lib/api";
import { Badge, Btn, DataTable, DateField, Dt, Field, IconBtn, Input, Modal, PageHead, Select, Spinner, Textarea, useDebounced, useFetch } from "../components/ui";
import { EntityPicker } from "../components/pickers";
import RangePicker from "../components/RangePicker";

export default function Purchases() {
  const { t, fmt, can } = useApp(); const [sp, setSp] = useSearchParams();
  const [form, setForm] = useState(sp.get("new") === "1"); const [open, setOpen] = useState(null); const [tick, setTick] = useState(0); const [f, setF] = useState({ status: "", payType: "", due: "" }); const [r, setR] = useState({ from: "", to: "", key: "" });
  return (
    <>
      <PageHead icon={Truck} title={t("nav.purchases")} sub={t("purchases.sub")} actions={can("purchases.create") && <Btn variant="accent" icon={Plus} onClick={() => setForm(true)}>{t("purchase.new")}</Btn>} />
      <DataTable endpoint="/purchases" exportName="purchases" params={{ ...f, from: r.from, to: r.to }} refreshKey={tick} searchPlaceholder={t("purchases.search")} onRow={(p) => setOpen(p._id)} rowClass={(p) => (p.status === "cancelled" ? "opacity-55" : "")}
        filters={<><Select className="!w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">{t("status")}: {t("all")}</option><option value="completed">{t("status.completed")}</option><option value="cancelled">{t("status.cancelled")}</option></Select>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={f.due === "1"} onChange={(e) => setF({ ...f, due: e.target.checked ? "1" : "" })} />{t("sales.onlyDue")}</label><div className="w-full"><RangePicker value={r} onChange={setR} /></div></>}
        columns={[
          { key: "no", label: t("inv.no"), sort: "no", render: (p) => <span className="num ltr font-bold">{p.no}</span> }, { key: "date", label: t("date"), sort: "date", render: (p) => <Dt v={p.date} />, text: (p) => fmt.date(p.date) },
          { key: "supplier", label: t("supplier"), render: (p) => p.supplier?.name || `${p.sellerName} (${t("purchase.buyback")})`, text: (p) => p.supplier?.name || p.sellerName }, { key: "billNo", label: t("purchase.billNo"), render: (p) => <span className="num ltr text-mute">{p.billNo || "—"}</span> },
          { key: "items", label: t("items"), render: (p) => <span className="ltr block max-w-[220px] truncate text-mute">{p.items.map((i) => `${i.name} ×${i.qty}`).join("، ")}</span>, text: (p) => p.items.map((i) => `${i.name} x${i.qty}`).join("; ") },
          { key: "total", label: t("total"), sort: "total", align: "end", render: (p) => <b className="num">{fmt.num(p.total)}</b>, text: (p) => p.total }, { key: "paid", label: t("paid"), align: "end", render: (p) => <span className="num">{fmt.num(p.paid)}</span> },
          { key: "due", label: t("due"), sort: "due", align: "end", render: (p) => (p.due > 0 ? <b className="num text-warn">{fmt.num(p.due)}</b> : "—"), text: (p) => p.due },
          { key: "status", label: t("status"), render: (p) => (p.status === "cancelled" ? <Badge tone="bad">{t("status.cancelled")}</Badge> : <Badge tone={p.payType === "cash" ? "ok" : "acc"}>{t(`paytype.${p.payType}`)}</Badge>), text: (p) => p.status }]} />
      {form && <PurchaseForm onClose={() => { setForm(false); sp.delete("new"); setSp(sp); }} onDone={() => { setForm(false); sp.delete("new"); setSp(sp); setTick((x) => x + 1); }} />}
      {open && <PurchaseDetail id={open} onClose={() => setOpen(null)} onChange={() => setTick((x) => x + 1)} />}
    </>
  );
}

function PurchaseForm({ onClose, onDone }) {
  const { t, fmt, toast, user } = useApp();
  const [supplier, setSupplier] = useState(null); const [buyback, setBuyback] = useState(false); const [seller, setSeller] = useState({ name: "", phone: "" }); const [billNo, setBillNo] = useState(""); const [date, setDate] = useState(""); const [note, setNote] = useState("");
  const [items, setItems] = useState([]); const [discount, setDiscount] = useState(""); const [payType, setPayType] = useState("cash"); const [paid, setPaid] = useState(""); const [method, setMethod] = useState("cash"); const [accounts, setAccounts] = useState([]); const [accountId, setAccountId] = useState(""); const [allowDup, setAllowDup] = useState(false); const [busy, setBusy] = useState(false);
  const [term, setTerm] = useState(""); const dq = useDebounced(term); const [found, setFound] = useState([]); const [paste, setPaste] = useState(null);
  useEffect(() => { get("/accounts").then(setAccounts).catch(() => {}); }, []);
  useEffect(() => { const a = accounts.filter((x) => x.type === method); setAccountId((a.find((x) => x.isDefault) || a[0])?._id || ""); }, [method, accounts]);
  useEffect(() => { if (dq.length < 1) return setFound([]); get("/products", { q: dq, limit: 8 }).then((r) => setFound(r.rows.filter((p) => p.kind !== "service"))).catch(() => {}); }, [dq]);
  const add = (p) => { setItems((x) => [...x, { key: Math.random(), product: p, qty: 1, unitPrice: p.buy || "", discount: "", units: p.kind === "phone" ? [{ imei1: "", imei2: "", serial: "" }] : [] }]); setTerm(""); setFound([]); };
  const upd = (k, patch) => setItems((x) => x.map((i) => (i.key === k ? { ...i, ...patch } : i)));
  const qtyOf = (i) => (i.product.kind === "phone" ? i.units.length : Number(i.qty) || 0);
  const lineTotal = (i) => Math.max(0, (Number(i.unitPrice) || 0) * qtyOf(i) - (Number(i.discount) || 0));
  const sub = useMemo(() => items.reduce((a, i) => a + lineTotal(i), 0), [items]);
  const total = Math.max(0, sub - (Number(discount) || 0)); const paidNum = payType === "cash" ? total : payType === "credit" ? 0 : Number(paid) || 0; const due = total - paidNum;
  const unitsOk = items.every((i) => i.product.kind !== "phone" || (i.units.length > 0 && i.units.every((u) => u.imei1.trim() || u.serial.trim())));
  const partyOk = supplier || (buyback && seller.name.trim() && payType === "cash");
  const ok = items.length > 0 && items.every((i) => qtyOf(i) > 0 && i.unitPrice !== "") && unitsOk && partyOk && (payType !== "partial" || (paidNum > 0 && paidNum < total));
  const doPaste = () => { const rows = paste.text.split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [a, b] = l.split(/[\s,;\t]+/); return { imei1: a || "", imei2: b || "", serial: "" }; }); upd(paste.key, { units: [...items.find((i) => i.key === paste.key).units.filter((u) => u.imei1 || u.serial), ...rows] }); setPaste(null); };
  const submit = async () => {
    setBusy(true);
    try {
      await post("/purchases", { supplierId: supplier?._id, sellerName: buyback ? seller.name : "", sellerPhone: buyback ? seller.phone : "", billNo, date: date || undefined, note, discount: Number(discount) || undefined, payType, paid: payType === "partial" ? paidNum : undefined, method, accountId: accountId || undefined, allowDuplicateImei: allowDup,
        items: items.map((i) => ({ productId: i.product._id, qty: qtyOf(i), unitPrice: Number(i.unitPrice), discount: Number(i.discount) || 0, units: i.units })) });
      toast.ok(t("saved")); onDone();
    } catch (e) { toast.err(e); setBusy(false); }
  };
  return (
    <Modal size="xl" title={t("purchase.new")} onClose={onClose} footer={<><div className="me-auto text-sm"><span className="text-mute">{t("total")}: </span><b className="num text-lg text-acc-ink">{fmt.money(total)}</b>{payType !== "cash" && <span className="ms-3 font-bold text-warn">{t("due")}: <span className="num">{fmt.money(due)}</span></span>}</div><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn variant="accent" loading={busy} disabled={!ok} onClick={submit}>{t("purchase.confirm")}</Btn></>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-4">
          <div className="relative"><Input placeholder={t("purchase.addProduct")} value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
            {found.length > 0 && <div className="pop card absolute inset-x-0 top-full z-20 mt-1 p-1">{found.map((p) => <button key={p._id} onClick={() => add(p)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start hover:bg-soft"><span className="ltr font-semibold">{p.name}</span><Badge tone={p.kind === "phone" ? "pri" : "neutral"}>{t(`kind.${p.kind}`)}</Badge></button>)}</div>}</div>
          {!items.length && <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-mute">{t("purchase.empty")}</p>}
          {items.map((i) => (
            <div key={i.key} className="rounded-2xl border border-line p-4">
              <div className="mb-3 flex items-center gap-2"><div className="ltr min-w-0 flex-1 truncate font-extrabold">{i.product.name}</div><IconBtn icon={Trash2} tone="danger" label={t("delete")} onClick={() => setItems((x) => x.filter((y) => y !== i))} /></div>
              <div className="grid grid-cols-3 gap-3">
                {i.product.kind === "item" ? <Field label={t("qty")}><Input type="number" min="1" className="num" value={i.qty} onChange={(e) => upd(i.key, { qty: e.target.value })} /></Field> : <Field label={t("qty")}><div className="field num font-bold">{fmt.num(i.units.length)}</div></Field>}
                <Field label={t("unitPrice")}><Input type="number" min="0" className="num" value={i.unitPrice} onChange={(e) => upd(i.key, { unitPrice: e.target.value })} /></Field>
                <Field label={t("discount")}><Input type="number" min="0" className="num" value={i.discount} onChange={(e) => upd(i.key, { discount: e.target.value })} /></Field>
              </div>
              {i.product.kind === "phone" && <div className="mt-3 grid gap-2">
                {i.units.map((u, k) => <div key={k} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  {["imei1", "imei2", "serial"].map((f) => <Input key={f} dir="ltr" className="num !py-2 text-sm" placeholder={f === "imei1" ? "IMEI" : f === "imei2" ? "IMEI 2" : t("serial")} value={u[f]} onChange={(e) => upd(i.key, { units: i.units.map((x, j) => (j === k ? { ...x, [f]: e.target.value } : x)) })} />)}
                  <IconBtn icon={Trash2} label={t("delete")} onClick={() => upd(i.key, { units: i.units.filter((_, j) => j !== k) })} /></div>)}
                <div className="flex gap-2"><Btn size="sm" variant="soft" icon={Plus} onClick={() => upd(i.key, { units: [...i.units, { imei1: "", imei2: "", serial: "" }] })}>{t("purchase.addUnit")}</Btn><Btn size="sm" variant="soft" icon={ClipboardPaste} onClick={() => setPaste({ key: i.key, text: "" })}>{t("purchase.pasteImei")}</Btn></div></div>}
              <div className="num mt-3 text-end text-sm font-bold">{fmt.money(lineTotal(i))}</div>
            </div>))}
        </div>
        <div className="grid content-start gap-4 rounded-2xl bg-soft p-4">
          <div className="flex rounded-xl bg-card p-1"><button onClick={() => setBuyback(false)} className={`flex-1 rounded-lg py-2 text-sm font-bold ${!buyback ? "bg-pri text-on-pri" : "text-mute"}`}>{t("supplier")}</button><button onClick={() => { setBuyback(true); setPayType("cash"); }} className={`flex-1 rounded-lg py-2 text-sm font-bold ${buyback ? "bg-pri text-on-pri" : "text-mute"}`}>{t("purchase.buyback")}</button></div>
          {!buyback ? <EntityPicker endpoint="/suppliers" value={supplier} onChange={setSupplier} label={t("supplier")} placeholder={t("purchase.pickSupplier")} showBalance /> : <><Field label={t("name")}><Input value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} /></Field><Field label={t("phone")}><Input dir="ltr" value={seller.phone} onChange={(e) => setSeller({ ...seller, phone: e.target.value })} /></Field></>}
          <Field label={t("purchase.billNo")}><Input dir="ltr" value={billNo} onChange={(e) => setBillNo(e.target.value)} /></Field>
          <Field label={t("date")} hint={t("purchase.date.hint")}><DateField value={date} onChange={setDate} /></Field>
          <Field label={t("discount")}><Input type="number" min="0" className="num" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-card p-1">{(buyback ? ["cash"] : ["cash", "partial", "credit"]).map((k) => <button key={k} onClick={() => setPayType(k)} className={`rounded-lg py-2 text-sm font-bold ${payType === k ? "bg-pri text-on-pri" : "text-mute"}`}>{t(`paytype.${k}`)}</button>)}</div>
          {payType === "partial" && <Field label={t("paid")}><Input type="number" min="0" className="num" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>}
          {payType !== "credit" && <div className="grid grid-cols-2 gap-2"><Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t("pay.method")}>{["cash", "bank", "digital"].map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</Select><Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label={t("account")}>{accounts.filter((a) => a.type === method).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select></div>}
          <Field label={t("note")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {user.role === "admin" && <label className="flex items-start gap-2 text-xs text-mute"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--pri)]" checked={allowDup} onChange={(e) => setAllowDup(e.target.checked)} />{t("unit.allowDup")}</label>}
        </div>
      </div>
      {paste && <Modal size="sm" title={t("purchase.pasteImei")} onClose={() => setPaste(null)} footer={<><Btn variant="ghost" onClick={() => setPaste(null)}>{t("cancel")}</Btn><Btn onClick={doPaste}>{t("add")}</Btn></>}><p className="mb-2 text-sm text-mute">{t("purchase.pasteImei.hint")}</p><Textarea autoFocus rows={8} dir="ltr" className="num" value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} /></Modal>}
    </Modal>
  );
}

function PurchaseDetail({ id, onClose, onChange }) {
  const { t, fmt, can, toast, confirm } = useApp(); const { data: p, reload } = useFetch(`/purchases/${id}`, {}, []);
  const cancel = async () => { const c = await confirm({ title: t("purchase.cancel.title", { no: p.no }), message: t("purchase.cancel.msg"), reason: true, danger: true, confirmLabel: t("purchase.cancel") }); if (!c.ok) return; try { await post(`/purchases/${id}/cancel`, { reason: c.reason }); toast.ok(t("saved")); reload(); onChange(); } catch (e) { toast.err(e); } };
  const edit = async () => { const c = await confirm({ title: t("purchase.editMeta"), message: t("purchase.editMeta.msg"), reason: true }); if (!c.ok) return; try { await patch(`/purchases/${id}`, { billNo: p.billNo, note: p.note, reason: c.reason }); toast.ok(t("saved")); } catch (e) { toast.err(e); } };
  return (
    <Modal size="md" title={p ? p.no : "…"} onClose={onClose} footer={p && p.status === "completed" && can("purchases.cancel") && <Btn variant="danger" icon={Ban} onClick={cancel}>{t("purchase.cancel")}</Btn>}>
      {!p ? <Spinner /> : <div className="grid gap-4">
        {p.status === "cancelled" && <div className="rounded-xl bg-bad-soft p-3 text-sm font-semibold text-bad">{t("status.cancelled")}: {p.cancelReason}</div>}
        <div className="grid grid-cols-2 gap-3 text-sm"><div><span className="text-mute">{t("supplier")}: </span><b>{p.supplier?.name || p.sellerName}</b></div><div><span className="text-mute">{t("date")}: </span><Dt v={p.date} /></div><div><span className="text-mute">{t("purchase.billNo")}: </span><b className="num ltr">{p.billNo || "—"}</b></div><div><span className="text-mute">{t("user")}: </span><b>{p.user?.name}</b></div></div>
        {p.items.map((i, k) => <div key={k} className="rounded-xl border border-line p-3"><div className="flex justify-between"><b className="ltr">{i.name}</b><span className="num">{fmt.num(i.qty)} × {fmt.num(i.unitPrice)} = <b>{fmt.num(i.total)}</b></span></div>{i.units?.length > 0 && <div className="num ltr mt-2 flex flex-wrap gap-1.5 text-xs">{i.units.map((u) => <span key={u._id} className="rounded-lg bg-soft px-2 py-1">{u.imei1 || u.serial}{u.status !== "available" && <span className="ms-1 text-mute">({t(`unit.${u.status}`)})</span>}</span>)}</div>}</div>)}
        <div className="grid gap-1 rounded-xl bg-soft p-4 text-sm"><div className="flex justify-between"><span>{t("total")}</span><b className="num">{fmt.money(p.total)}</b></div><div className="flex justify-between"><span>{t("paid")}</span><b className="num">{fmt.money(p.paid)}</b></div><div className="flex justify-between text-warn"><span>{t("due")}</span><b className="num">{fmt.money(p.due)}</b></div></div>
        {p.note && <p className="text-sm text-mute">{p.note}</p>}
      </div>}
    </Modal>
  );
}
