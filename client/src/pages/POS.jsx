import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Check, CreditCard, Landmark, Minus, Plus, Printer, ScanLine, Smartphone, Trash2, Wallet, ShoppingBag } from "lucide-react";
import { useApp } from "../lib/app";
import { get, post } from "../lib/api";
import { Btn, DateField, Empty, Field, IconBtn, Input, Modal, PageHead, Select, StockBadge, useDebounced, brandColors } from "../components/ui";
import { EntityPicker, UnitPicker } from "../components/pickers";
import ShiftControl from "../components/ShiftControl";
import Invoice from "../components/Invoice";
import { printNow } from "../lib/export";

let seq = 0;
const METHODS = [["cash", Banknote], ["bank", Landmark], ["digital", CreditCard]];

export default function POS() {
  const { t, fmt, can, toast, settings } = useApp();
  const [term, setTerm] = useState(""); const dq = useDebounced(term, 250); const [cat, setCat] = useState("");
  const [products, setProducts] = useState([]); const [cats, setCats] = useState([]); const [accounts, setAccounts] = useState([]);
  const [cart, setCart] = useState([]); const [customer, setCustomer] = useState(null);
  const [payType, setPayType] = useState("cash"); const [paid, setPaid] = useState(""); const [method, setMethod] = useState("cash"); const [accountId, setAccountId] = useState("");
  const [invDiscount, setInvDiscount] = useState(""); const [dueDate, setDueDate] = useState(""); const [note, setNote] = useState("");
  const [pickFor, setPickFor] = useState(null); const [done, setDone] = useState(null); const [busy, setBusy] = useState(false);
  const input = useRef();
  const canPrice = can("sales.editPrice"), canDisc = can("sales.discount");

  useEffect(() => { get("/categories", { active: "true", limit: 50 }).then((r) => setCats(r.rows)).catch(() => {}); get("/accounts").then(setAccounts).catch(() => {}); }, []);
  useEffect(() => { get("/products", { q: dq, category: cat, status: "in", limit: 36, sort: "name" }).then((r) => setProducts(r.rows)).catch(() => {}); }, [dq, cat, done]);
  useEffect(() => { const a = accounts.filter((x) => x.type === method); setAccountId((a.find((x) => x.isDefault) || a[0] || accounts[0])?._id || ""); }, [method, accounts]);

  const add = (p, unit) => {
    if (p.kind === "phone" && !unit) return p.qty > 0 ? setPickFor(p) : toast.err({ message: t("err.UNIT_UNAVAILABLE") });
    const base = unit?.sellPrice ?? p.sell;
    setCart((c) => {
      if (p.kind !== "phone") {
        const ex = c.find((l) => l.product._id === p._id);
        if (ex) return c.map((l) => (l === ex ? { ...l, qty: p.kind === "service" ? l.qty + 1 : Math.min(p.qty, l.qty + 1) } : l));
      } else if (c.some((l) => l.unit?._id === unit._id)) return c;
      return [...c, { key: ++seq, product: p, unit, qty: 1, base, price: base, discount: 0 }];
    });
    setPickFor(null); input.current?.focus();
  };
  const upd = (key, patch) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const scan = async (e) => {
    if (e.key !== "Enter") return; const code = term.trim(); if (!code) return;
    try { const r = await get("/products/lookup", { code }); if (r.unit && r.unit.status !== "available") toast.err({ message: t("err.UNIT_UNAVAILABLE") }); else { add(r.product, r.unit); setTerm(""); } }
    catch { if (products.length === 1) { add(products[0]); setTerm(""); } else toast.err({ message: t("pos.notfound") }); }
  };

  const sub = useMemo(() => cart.reduce((a, l) => a + l.price * l.qty - (Number(l.discount) || 0), 0), [cart]);
  const disc = Math.min(sub, Math.max(0, Number(invDiscount) || 0));
  const total = Math.max(0, sub - disc);
  const paidNum = payType === "cash" ? total : payType === "credit" ? 0 : Number(paid) || 0;
  const due = total - paidNum;
  const problem = !cart.length ? "empty" : (payType !== "cash" && !customer) ? t("err.CUSTOMER_REQUIRED") : payType === "partial" && !(paidNum > 0 && paidNum < total) ? t("err.INVALID_PAID") : null;

  const submit = async () => {
    setBusy(true);
    try {
      const sale = await post("/sales", {
        customerId: customer?._id, discount: disc || undefined, payType, paid: payType === "partial" ? paidNum : undefined, method, accountId: accountId || undefined, dueDate: dueDate || undefined, note,
        items: cart.map((l) => ({ productId: l.product._id, unitId: l.unit?._id, qty: l.qty, ...(l.price !== l.base ? { price: l.price } : {}), ...(Number(l.discount) > 0 ? { discount: Number(l.discount) } : {}) })),
      });
      setDone(await get(`/sales/${sale._id}`));
      setCart([]); setCustomer(null); setPayType("cash"); setPaid(""); setInvDiscount(""); setDueDate(""); setNote("");
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  };

  return (
    <>
    <PageHead icon={ShoppingBag} title={t("nav.pos")} />
    <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[260px] flex-1"><ScanLine size={20} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-pri" />
            <input ref={input} autoFocus className="field !rounded-2xl !py-3.5 ps-12 text-base" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={scan} placeholder={t("pos.search")} aria-label={t("pos.search")} /></label>
          <ShiftControl />
        </div>
        <div className="scroll-thin mb-4 flex gap-2 overflow-x-auto pb-1">
          {[{ _id: "", name: t("all") }, ...cats].map((c) => <button key={c._id} onClick={() => setCat(c._id)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-bold transition ${cat === c._id ? "border-transparent bg-ink text-bg" : "border-line text-mute hover:text-ink"}`}>{c.name}</button>)}
        </div>
        {products.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {products.map((p) => { const [c1, c2] = brandColors(p.brand?.name); return (
              <button key={p._id} onClick={() => add(p)} className="card group relative overflow-hidden p-0 text-start transition hover:-translate-y-0.5 hover:border-pri">
                <div className="flex h-16 items-end justify-between p-3 text-white" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}><span className="ltr text-xs font-bold opacity-90">{p.brand?.name || p.category?.name}</span><Smartphone size={22} className="opacity-60" /></div>
                <div className="p-3"><div className="ltr line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight">{p.name}</div><div className="ltr mt-0.5 text-xs text-mute">{[p.storage, p.color].filter(Boolean).join(" · ")}</div><div className="mt-2 flex items-center justify-between gap-1"><span className="num whitespace-nowrap font-extrabold text-acc-ink">{fmt.money(p.sell)}</span><StockBadge p={p} /></div></div>
              </button>); })}
          </div>
        ) : <Empty icon={ShoppingBag} title={t("empty")} text={t("pos.hint")} />}
      </section>

      <aside id="cart" className="xl:sticky xl:top-20 xl:self-start">
        <div className="card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5"><h2 className="font-extrabold">{t("pos.cart")}</h2>{cart.length > 0 && <button onClick={() => setCart([])} className="text-sm font-bold text-bad">{t("pos.clear")}</button>}</div>
          <div className="scroll-thin max-h-[34vh] overflow-y-auto">
            {!cart.length ? <p className="px-5 py-10 text-center text-sm text-mute">{t("pos.cart.empty")}</p> : cart.map((l) => (
              <div key={l.key} className="border-b border-line px-5 py-3 last:border-0">
                <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="ltr truncate text-sm font-bold">{l.product.name}</div>{l.unit && <div className="num ltr text-xs text-mute">IMEI {l.unit.imei1 || l.unit.serial}</div>}</div><IconBtn icon={Trash2} label={t("delete")} onClick={() => setCart((c) => c.filter((x) => x !== l))} className="!h-8 !w-8 text-bad" /></div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {l.product.kind !== "phone" && <div className="flex items-center rounded-lg bg-soft"><button className="grid h-8 w-8 place-items-center" onClick={() => upd(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="−"><Minus size={14} /></button><input className="num w-10 bg-transparent text-center text-sm font-bold outline-none" value={l.qty} onChange={(e) => { const n = Math.floor(Number(e.target.value)) || 1; upd(l.key, { qty: l.product.kind === "service" ? Math.max(1, n) : Math.min(l.product.qty, Math.max(1, n)) }); }} aria-label={t("qty")} /><button className="grid h-8 w-8 place-items-center" onClick={() => upd(l.key, { qty: l.product.kind === "service" ? l.qty + 1 : Math.min(l.product.qty, l.qty + 1) })} aria-label="+"><Plus size={14} /></button></div>}
                  <input type="number" min="0" disabled={!canPrice} title={t("price")} aria-label={t("price")} className="field num !w-24 !py-1.5 text-sm" value={l.price} onChange={(e) => upd(l.key, { price: Number(e.target.value) })} />
                  {canDisc && <input type="number" min="0" placeholder={t("discount")} aria-label={t("discount")} className="field num !w-20 !py-1.5 text-sm" value={l.discount || ""} onChange={(e) => upd(l.key, { discount: Number(e.target.value) })} />}
                  <span className="num ms-auto font-extrabold">{fmt.num(l.price * l.qty - (Number(l.discount) || 0))}</span>
                </div>
              </div>))}
          </div>

          <div className="grid gap-3 border-t border-line bg-soft/60 p-5">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-soft p-1">{["cash", "partial", "credit"].map((k) => <button key={k} onClick={() => setPayType(k)} className={`rounded-lg py-2 text-sm font-bold transition ${payType === k ? "bg-card text-pri shadow-sm" : "text-mute"}`}>{t(`paytype.${k}`)}</button>)}</div>
            {payType !== "credit" && <div className="flex gap-2">
              <div className="flex rounded-xl bg-soft p-1">{METHODS.map(([k, I]) => <button key={k} onClick={() => setMethod(k)} aria-label={t(`method.${k}`)} title={t(`method.${k}`)} className={`grid h-9 w-10 place-items-center rounded-lg ${method === k ? "bg-card text-pri shadow-sm" : "text-mute"}`}><I size={17} /></button>)}</div>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label={t("account")}>{accounts.filter((a) => a.type === method).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}</Select>
            </div>}
            {payType === "partial" && <Field label={t("paid")}><Input type="number" min="0" className="num" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>}
            {payType !== "cash" && <><EntityPicker endpoint="/customers" value={customer} onChange={setCustomer} label={t("customer")} placeholder={t("pos.customer.req")} showBalance /><Field label={t("duedate")}><DateField value={dueDate} onChange={setDueDate} /></Field></>}
            {payType === "cash" && <EntityPicker endpoint="/customers" value={customer} onChange={setCustomer} label={t("customer")} placeholder={t("pos.customer.opt")} />}
            {canDisc && <Field label={t("pos.invdiscount")}><Input type="number" min="0" className="num" value={invDiscount} onChange={(e) => setInvDiscount(e.target.value)} /></Field>}
            <div className="grid gap-1 pt-1 text-sm">
              <div className="flex justify-between text-mute"><span>{t("subtotal")}</span><span className="num">{fmt.money(sub)}</span></div>
              {disc > 0 && <div className="flex justify-between text-mute"><span>{t("discount")}</span><span className="num">− {fmt.money(disc)}</span></div>}
              <div className="flex items-end justify-between"><span className="font-bold">{t("total")}</span><span className="num text-3xl font-extrabold text-acc-ink">{fmt.money(total)}</span></div>
              {payType !== "cash" && <div className="flex justify-between font-bold text-warn"><span>{t("due")}</span><span className="num">{fmt.money(due)}</span></div>}
            </div>
            {problem && problem !== "empty" && <p className="text-sm font-semibold text-bad">{problem}</p>}
            <Btn variant="accent" size="lg" icon={Check} loading={busy} disabled={!!problem} onClick={submit}>{t("pos.complete")}</Btn>
          </div>
        </div>
      </aside>

      {cart.length > 0 && <div className="no-print fixed inset-x-3 bottom-3 z-30 xl:hidden"><button onClick={() => document.getElementById("cart").scrollIntoView({ behavior: "smooth" })} className="flex w-full items-center justify-between rounded-2xl bg-acc px-5 py-3.5 font-extrabold text-white shadow-2xl dark:text-black"><span className="flex items-center gap-2"><ShoppingBag size={18} />{fmt.num(cart.reduce((a, l) => a + l.qty, 0))} · {t("pos.cart")}</span><span className="num">{fmt.money(total)}</span></button></div>}
      {pickFor && <UnitPicker product={pickFor} onClose={() => setPickFor(null)} onPick={(u) => add(pickFor, u)} />}
      {done && (
        <Modal size="md" title={t("pos.done")} onClose={() => setDone(null)} footer={<><Btn variant="ghost" onClick={() => setDone(null)}>{t("pos.new")}</Btn><Btn icon={Printer} onClick={printNow}>{t("print")}</Btn></>}>
          <Invoice sale={done} warranties={done.warranties} />
        </Modal>
      )}
    </div>
    </>
  );
}
