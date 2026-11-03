import { useMemo, useState } from "react";
import { useApp } from "../lib/app";
import { get, post } from "../lib/api";
import { Badge, Btn, Field, Input, Modal, Select, Textarea, useDebounced } from "./ui";
import { UnitPicker } from "./pickers";
import { Plus, Trash2 } from "lucide-react";

/** Return or exchange against an original invoice. Each returned line gets a condition; only "sellable" goods go back on the shelf. */
export default function ReturnModal({ sale, onClose, onDone }) {
  const { t, fmt, toast, can } = useApp();
  const [sel, setSel] = useState({}); const [reason, setReason] = useState(""); const [newItems, setNewItems] = useState([]);
  const [term, setTerm] = useState(""); const dq = useDebounced(term); const [found, setFound] = useState([]); const [pick, setPick] = useState(null);
  const [payType, setPayType] = useState("cash"); const [paid, setPaid] = useState(""); const [method, setMethod] = useState("cash"); const [busy, setBusy] = useState(false);
  const lines = sale.items.filter((i) => i.qty - i.returnedQty > 0);
  const refund = useMemo(() => lines.reduce((a, i) => (sel[i._id]?.on ? a + (i.net / i.qty) * (i.unit ? 1 : sel[i._id].qty) : a), 0), [sel]);
  const newTotal = newItems.reduce((a, n) => a + n.price * n.qty, 0);
  const diff = newTotal - refund;
  const search = async (v) => { setTerm(v); if (v.length < 2) return setFound([]); try { setFound((await get("/products", { q: v, status: "in", limit: 6 })).rows); } catch {} };
  const addNew = (p, unit) => { setNewItems((x) => [...x, { key: Math.random(), product: p, unit, qty: 1, price: unit?.sellPrice ?? p.sell }]); setFound([]); setTerm(""); setPick(null); };
  const chosen = lines.filter((i) => sel[i._id]?.on);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await post("/sales/returns", { saleId: sale._id, reason, payType: diff > 0 ? payType : "cash", paid: payType === "partial" ? Number(paid) : undefined, method,
        items: chosen.map((i) => ({ saleItemId: i._id, qty: sel[i._id].qty, condition: sel[i._id].condition })),
        newItems: newItems.map((n) => ({ productId: n.product._id, unitId: n.unit?._id, qty: n.qty, ...(n.price !== (n.unit?.sellPrice ?? n.product.sell) ? { price: n.price } : {}) })) });
      toast.ok(r.status === "pending" ? t("ret.pending") : t("saved")); onDone(); onClose();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  };
  return (
    <Modal size="lg" title={`${t("ret.title")} — ${sale.no}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn loading={busy} disabled={!chosen.length || !reason.trim()} onClick={submit}>{t(newItems.length ? "ret.exchange" : "ret.return")}</Btn></>}>
      <div className="grid gap-5">
        <div>
          <h3 className="mb-2 font-extrabold">{t("ret.items")}</h3>
          <div className="grid gap-2">{lines.map((i) => { const s = sel[i._id] || { on: false, qty: 1, condition: "sellable" }; return (
            <div key={i._id} className={`rounded-xl border p-3 ${s.on ? "border-pri bg-pri-soft/40" : "border-line"}`}>
              <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={s.on} onChange={(e) => setSel({ ...sel, [i._id]: { ...s, on: e.target.checked } })} /><div className="min-w-0 flex-1"><div className="ltr truncate font-bold">{i.name}</div>{i.imei && <div className="num ltr text-xs text-mute">IMEI {i.imei}</div>}</div><span className="num font-bold">{fmt.money(i.net / i.qty)}</span></label>
              {s.on && <div className="mt-3 flex flex-wrap gap-3">
                {!i.unit && <Field label={`${t("qty")} (≤ ${fmt.num(i.qty - i.returnedQty)})`}><Input type="number" min="1" max={i.qty - i.returnedQty} className="num !w-24" value={s.qty} onChange={(e) => setSel({ ...sel, [i._id]: { ...s, qty: Math.min(i.qty - i.returnedQty, Math.max(1, Number(e.target.value) || 1)) } })} /></Field>}
                <Field label={t("ret.condition")}><Select value={s.condition} onChange={(e) => setSel({ ...sel, [i._id]: { ...s, condition: e.target.value } })}>{["sellable", "defective", "review"].map((c) => <option key={c} value={c}>{t(`ret.cond.${c}`)}</option>)}</Select></Field>
              </div>}
            </div>); })}</div>
        </div>
        <Field label={t("reason")}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div>
          <h3 className="mb-1 font-extrabold">{t("ret.newItems")}</h3><p className="mb-2 text-sm text-mute">{t("ret.newItems.hint")}</p>
          <div className="relative"><input className="field" placeholder={t("pos.search")} value={term} onChange={(e) => search(e.target.value)} />
            {found.length > 0 && <div className="pop card absolute inset-x-0 top-full z-20 mt-1 p-1">{found.map((p) => <button key={p._id} className="flex w-full justify-between rounded-lg px-3 py-2 text-start hover:bg-soft" onClick={() => (p.kind === "phone" ? setPick(p) : addNew(p))}><span className="ltr font-semibold">{p.name}</span><span className="num text-sm text-mute">{fmt.money(p.sell)}</span></button>)}</div>}</div>
          {newItems.map((n) => <div key={n.key} className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2"><div className="min-w-0 flex-1"><div className="ltr truncate font-bold">{n.product.name}</div>{n.unit && <div className="num ltr text-xs text-mute">IMEI {n.unit.imei1}</div>}</div>{!n.unit && <Input type="number" min="1" className="num !w-20" value={n.qty} onChange={(e) => setNewItems((x) => x.map((y) => (y === n ? { ...y, qty: Math.max(1, Number(e.target.value) || 1) } : y)))} />}<span className="num font-bold">{fmt.num(n.price * n.qty)}</span><button onClick={() => setNewItems((x) => x.filter((y) => y !== n))} className="text-bad" aria-label={t("delete")}><Trash2 size={16} /></button></div>)}
        </div>
        <div className="grid gap-1 rounded-xl bg-soft p-4 text-sm">
          <div className="flex justify-between"><span>{t("ret.refundValue")}</span><b className="num">{fmt.money(refund)}</b></div>
          {newItems.length > 0 && <div className="flex justify-between"><span>{t("ret.newTotal")}</span><b className="num">{fmt.money(newTotal)}</b></div>}
          <div className="flex justify-between text-base"><span className="font-bold">{diff > 0 ? t("ret.customerPays") : t("ret.shopRefunds")}</span><b className={`num ${diff > 0 ? "text-acc-ink" : "text-ok"}`}>{fmt.money(Math.abs(diff))}</b></div>
          <p className="text-xs text-mute">{t("ret.debtNote")}</p>
        </div>
        {diff > 0 && <div className="grid gap-3 sm:grid-cols-3"><Field label={t("pay.type")}><Select value={payType} onChange={(e) => setPayType(e.target.value)}>{["cash", "partial", "credit"].map((k) => <option key={k} value={k}>{t(`paytype.${k}`)}</option>)}</Select></Field>{payType === "partial" && <Field label={t("paid")}><Input type="number" className="num" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>}</div>}
      </div>
      {pick && <UnitPicker product={pick} onClose={() => setPick(null)} onPick={(u) => addNew(pick, u)} />}
    </Modal>
  );
}
