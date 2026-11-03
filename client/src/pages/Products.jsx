import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, Pencil, Plus, Rows3, ScanLine, Smartphone, Trash2, Upload } from "lucide-react";
import { useApp } from "../lib/app";
import { del, get, post, put } from "../lib/api";
import { Badge, Btn, DataTable, Empty, Field, IconBtn, Input, Modal, PageHead, PhoneCard, Pagination, Select, SearchBox, Spinner, StockBadge, Tabs, Textarea, useDebounced, useFetch } from "../components/ui";

const BLANK = { name: "", kind: "item", brand: "", category: "", barcode: "", color: "", storage: "", ram: "", condition: "new", buy: 0, sell: 0, qty: 0, minStock: 3, warrantyMonths: 0, description: "", image: "", active: true };

export default function Products() {
  const { t, fmt, can, toast, confirm } = useApp(); const [sp] = useSearchParams(); const initialQ = sp.get("q") || "";
  const [view, setView] = useState("shelf"); const [tick, setTick] = useState(0); const [edit, setEdit] = useState(null); const [detail, setDetail] = useState(null);
  const [f, setF] = useState({ brand: "", category: "", kind: "", status: "", condition: "", min: "", max: "", active: "true" });
  const brands = useFetch("/brands", { limit: 100, active: "true", sort: "name" }, []); const cats = useFetch("/categories", { limit: 100, active: "true", sort: "name" }, []);
  const showCost = can("products.viewCost"); const canEdit = can("products.edit");
  const refresh = () => setTick((x) => x + 1);

  const cols = [
    { key: "name", label: t("product"), sort: "name", render: (p) => <div className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${p.kind === "phone" ? "bg-pri-soft text-pri" : "bg-soft text-mute"}`}><Smartphone size={17} /></span><div className="min-w-0"><div className="ltr truncate font-bold">{p.name}</div><div className="ltr text-xs text-mute">{[p.brand?.name, p.storage, p.color].filter(Boolean).join(" · ")}</div></div></div>, text: (p) => p.name },
    { key: "category", label: t("category"), render: (p) => p.category?.name || "—", text: (p) => p.category?.name },
    { key: "kind", label: t("type"), render: (p) => <Badge tone={p.kind === "phone" ? "pri" : "neutral"}>{t(`kind.${p.kind}`)}</Badge>, text: (p) => t(`kind.${p.kind}`) },
    { key: "condition", label: t("condition"), render: (p) => (p.condition === "new" ? <span className="text-mute">{t("cond.new")}</span> : <Badge tone="warn">{t(`cond.${p.condition}`)}</Badge>), text: (p) => t(`cond.${p.condition}`) },
    { key: "qty", label: t("stock"), sort: "qty", render: (p) => <StockBadge p={p} />, text: (p) => (p.kind === "service" ? "" : p.qty) },
    ...(showCost ? [{ key: "buy", label: t("buyPrice"), sort: "buy", align: "end", render: (p) => <span className="num">{p.buy ? fmt.num(p.buy) : <span className="text-warn">—</span>}</span> }] : []),
    { key: "sell", label: t("sellPrice"), sort: "sell", align: "end", render: (p) => <b className="num">{fmt.num(p.sell)}</b> },
    ...(canEdit ? [{ key: "a", label: "", export: false, render: (p) => <IconBtn icon={Pencil} label={t("edit")} onClick={(e) => { e.stopPropagation(); setEdit(p); }} /> }] : []),
  ];
  const filters = (
    <>
      <Select className="!w-auto" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label={t("category")}><option value="">{t("category")}: {t("all")}</option>{cats.data?.rows.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
      <Select className="!w-auto" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} aria-label={t("brand")}><option value="">{t("brand")}: {t("all")}</option>{brands.data?.rows.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
      <Select className="!w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={t("stock")}><option value="">{t("stock")}: {t("all")}</option><option value="in">{t("stock.in")}</option><option value="low">{t("stock.low")}</option><option value="out">{t("stock.out")}</option></Select>
      <Select className="!w-auto" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label={t("type")}><option value="">{t("type")}: {t("all")}</option>{["phone", "item", "service"].map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}</Select>
      <Select className="!w-auto" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} aria-label={t("condition")}><option value="">{t("condition")}: {t("all")}</option>{["new", "used", "refurbished", "defective"].map((k) => <option key={k} value={k}>{t(`cond.${k}`)}</option>)}</Select>
      <Input type="number" className="num !w-28" placeholder={t("price.min")} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /><Input type="number" className="num !w-28" placeholder={t("price.max")} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={f.active === "all"} onChange={(e) => setF({ ...f, active: e.target.checked ? "all" : "true" })} />{t("inactive.show")}</label>
    </>
  );
  return (
    <>
      <PageHead icon={Smartphone} title={t("nav.products")} sub={t("products.sub")} actions={<>
        <div className="flex rounded-xl bg-soft p-1"><button aria-label={t("view.table")} aria-pressed={view === "table"} onClick={() => setView("table")} className={`grid h-9 w-10 place-items-center rounded-lg ${view === "table" ? "bg-card text-pri shadow-sm" : "text-mute"}`}><Rows3 size={17} /></button><button aria-label={t("view.shelf")} aria-pressed={view === "shelf"} onClick={() => setView("shelf")} className={`grid h-9 w-10 place-items-center rounded-lg ${view === "shelf" ? "bg-card text-pri shadow-sm" : "text-mute"}`}><LayoutGrid size={17} /></button></div>
        {canEdit && <Btn variant="accent" icon={Plus} onClick={() => setEdit({ ...BLANK })}>{t("product.add")}</Btn>}</>} />
      {view === "table" ? <DataTable endpoint="/products" initialQ={initialQ} exportName="products" params={f} refreshKey={tick} searchPlaceholder={t("products.search")} filters={filters} columns={cols} onRow={setDetail} rowClass={(p) => (p.active ? "" : "opacity-50")} />
        : <Shelf f={f} filters={filters} tick={tick} onPick={setDetail} />}
      {edit && <ProductForm initial={edit} brands={brands.data?.rows || []} cats={cats.data?.rows || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} showCost={showCost} />}
      {detail && <Detail id={detail._id} onClose={() => setDetail(null)} onEdit={(p) => { setDetail(null); setEdit(p); }} onChanged={refresh} />}
    </>
  );
}

function Shelf({ f, filters, tick, onPick }) {
  const { t } = useApp(); const [q, setQ] = useState(""); const dq = useDebounced(q); const [page, setPage] = useState(1); const [res, setRes] = useState(null);
  useEffect(() => setPage(1), [dq, JSON.stringify(f)]);
  useEffect(() => { get("/products", { ...f, q: dq, page, limit: 24 }).then(setRes).catch(() => {}); }, [dq, page, JSON.stringify(f), tick]);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2"><SearchBox value={q} onChange={setQ} placeholder={t("products.search")} />{filters}</div>
      {!res ? <Spinner /> : !res.rows.length ? <Empty title={t("empty")} /> : <div className="shelf space-y-8 pb-6">
        {[["phone", res.rows.filter((p) => p.kind === "phone")], ["other", res.rows.filter((p) => p.kind !== "phone")]].map(([group, rows]) => rows.length > 0 && <section key={group} aria-label={t(`products.${group}`)}>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-ink"><span>{t(`products.${group}`)}</span><span className="num rounded-full bg-soft px-2 py-0.5 text-xs text-mute">{rows.length}</span></h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] justify-items-center gap-x-5 gap-y-9 pb-2 pt-1">{rows.map((p) => <PhoneCard key={p._id} p={p} onClick={() => onPick(p)} />)}</div>
        </section>)}
      </div>}
      {res && <div className="card mt-6"><Pagination page={page} pages={res.pages} total={res.total} onPage={setPage} /></div>}
    </div>
  );
}

function ProductForm({ initial, brands, cats, onClose, onSaved, showCost }) {
  const { t, toast, confirm, fmt } = useApp(); const [p, setP] = useState({ ...initial, brand: initial.brand?._id || initial.brand || "", category: initial.category?._id || initial.category || "" }); const [busy, setBusy] = useState(false); const [scanInput, setScanInput] = useState("");
  const isNew = !initial._id; const set = (k) => (e) => setP({ ...p, [k]: e.target.type === "number" ? e.target.value : e.target.value });
  const onCat = (e) => { const c = cats.find((x) => x._id === e.target.value); setP({ ...p, category: e.target.value, ...(isNew && c ? { kind: c.kind } : {}) }); };
  const img = (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 400_000) return toast.err({ message: t("err.FILE_TOO_LARGE") }); const r = new FileReader(); r.onload = () => setP({ ...p, image: r.result }); r.readAsDataURL(file); };
  const save = async (e) => { e.preventDefault(); const identifiers = String(p.openingIdentifiers || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (isNew && phone && identifiers.length !== Number(p.qty || 0)) { toast.err({ message: t("unit.identifierCount", { count: p.qty || 0 }) }); return; } const payload = isNew && phone ? { ...p, openingUnits: identifiers.map((value) => /^\d{14,16}$/.test(value) ? { imei1: value } : { serial: value }) } : p; setBusy(true); try { await (isNew ? post("/products", payload) : put(`/products/${p._id}`, payload)); toast.ok(t("saved")); onSaved(); } catch (er) { toast.err(er); setBusy(false); } };
  const setOpeningQty = (e) => setP({ ...p, qty: e.target.value });
  const acceptScan = (e) => { if (e.key !== "Enter") return; e.preventDefault(); const code = scanInput.trim(); if (!code) return; const identifiers = String(p.openingIdentifiers || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (identifiers.includes(code)) { toast.err({ message: t("err.IMEI_DUPLICATE") }); setScanInput(""); return; } if (identifiers.length >= Number(p.qty || 0)) { toast.err({ message: t("unit.scanComplete") }); setScanInput(""); return; } setP({ ...p, openingIdentifiers: [...identifiers, code].join("\n") }); setScanInput(""); };
  const remove = async () => { const c = await confirm({ title: t("product.delete"), message: t("product.delete.msg"), danger: true }); if (!c.ok) return; try { const r = await del(`/products/${p._id}`); toast.ok(r.deactivated ? t("product.deactivated") : t("deleted")); onSaved(); } catch (er) { toast.err(er); } };
  const phone = p.kind === "phone";
  return (
    <Modal size="lg" title={isNew ? t("product.add") : t("product.edit")} onClose={onClose}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")} wide><Input required dir="ltr" value={p.name} onChange={set("name")} placeholder="Galaxy A55" /></Field>
        <Field label={t("category")}><Select value={p.category} onChange={onCat}><option value="">—</option>{cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
        <Field label={t("type")} hint={t(`kind.${p.kind}.hint`)}><Select value={p.kind} disabled={!isNew} onChange={set("kind")}>{["phone", "item", "service"].map((k) => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}</Select></Field>
        <Field label={t("brand")}><Select value={p.brand} onChange={set("brand")}><option value="">—</option>{brands.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
        <Field label={t("barcode")}><div className="relative"><ScanLine size={16} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-mute" /><Input dir="ltr" value={p.barcode} onChange={set("barcode")} /></div></Field>
        {phone && <><Field label={t("storage")}><Input dir="ltr" value={p.storage} onChange={set("storage")} placeholder="128GB" /></Field><Field label="RAM"><Input dir="ltr" value={p.ram} onChange={set("ram")} placeholder="8GB" /></Field></>}
        <Field label={t("color")}><Input dir="ltr" value={p.color} onChange={set("color")} /></Field>
        <Field label={t("condition")}><Select value={p.condition} onChange={set("condition")}>{["new", "used", "refurbished", "defective"].map((k) => <option key={k} value={k}>{t(`cond.${k}`)}</option>)}</Select></Field>
        {showCost && <Field label={t("buyPrice")} hint={phone ? t("buy.phone.hint") : undefined}><Input type="number" min="0" className="num" value={p.buy} onChange={set("buy")} /></Field>}
        <Field label={t("sellPrice")}><Input type="number" min="0" className="num" value={p.sell} onChange={set("sell")} /></Field>
        {isNew && p.kind !== "service" && <Field label={t("stock.opening")}><Input type="number" min="0" step="1" className="num" value={p.qty} onChange={setOpeningQty} /></Field>}
        {isNew && phone && Number(p.qty) > 0 && <div className="grid gap-3 rounded-2xl border border-line bg-soft p-4 sm:col-span-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-bold">{t("unit.openingIdentifiers")}</div><p className="mt-1 text-xs text-mute">{t("unit.scannerHint")}</p></div><Badge tone={String(p.openingIdentifiers || "").split(/\r?\n/).filter((x) => x.trim()).length === Number(p.qty) ? "ok" : "warn"}>{fmt.num(String(p.openingIdentifiers || "").split(/\r?\n/).filter((x) => x.trim()).length)} / {fmt.num(Number(p.qty) || 0)}</Badge></div><label className="relative"><ScanLine size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-pri" /><Input dir="ltr" autoFocus className="ps-10 font-mono" value={scanInput} onChange={(e) => setScanInput(e.target.value)} onKeyDown={acceptScan} placeholder={t("unit.scanPlaceholder")} aria-label={t("unit.scanPlaceholder")} /></label>{p.openingIdentifiers && <div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-xs text-mute" dir="ltr">{String(p.openingIdentifiers).split(/\r?\n/).filter(Boolean).slice(-2).join(" · ")}</span><Btn type="button" size="sm" variant="ghost" onClick={() => setP({ ...p, openingIdentifiers: "" })}>{t("unit.clearScans")}</Btn></div>}</div>}
        {p.kind !== "service" && <Field label={t("minStock")}><Input type="number" min="0" className="num" value={p.minStock} onChange={set("minStock")} /></Field>}
        <Field label={`${t("warranty")} (${t("months")})`}><Input type="number" min="0" className="num" value={p.warrantyMonths} onChange={set("warrantyMonths")} /></Field>
        <Field label={t("image")}><div className="flex items-center gap-3">{p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}<label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-soft px-3 py-2 text-sm font-bold hover:bg-pri-soft"><Upload size={15} />{t("upload")}<input type="file" accept="image/*" hidden onChange={img} /></label></div></Field>
        <Field label={t("description")} wide><Textarea value={p.description} onChange={set("description")} /></Field>
        {!isNew && <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />{t("active")}</label>}
        <div className="flex items-center gap-2 sm:col-span-2">{!isNew && <Btn variant="danger" icon={Trash2} onClick={remove}>{t("delete")}</Btn>}<Btn variant="ghost" className="ms-auto" onClick={onClose}>{t("cancel")}</Btn><Btn type="submit" loading={busy}>{t("save")}</Btn></div>
      </form>
    </Modal>
  );
}

function Detail({ id, onClose, onEdit, onChanged }) {
  const { t, fmt, can } = useApp(); const { data: p, reload } = useFetch(`/products/${id}`, {}, []); const [tab, setTab] = useState("units"); const [add, setAdd] = useState(false);
  if (!p) return <Modal title="…" onClose={onClose}><Spinner /></Modal>;
  return (
    <Modal size="lg" title={p.name} onClose={onClose} footer={can("products.edit") && <Btn icon={Pencil} onClick={() => onEdit(p)}>{t("edit")}</Btn>}>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-soft p-3"><div className="text-xs text-mute">{t("sellPrice")}</div><div className="num font-extrabold">{fmt.money(p.sell)}</div></div>
        {p.buy !== undefined && <div className="rounded-xl bg-soft p-3"><div className="text-xs text-mute">{p.kind === "item" ? t("buy.avg") : t("buyPrice")}</div><div className="num font-extrabold">{p.buy ? fmt.money(p.buy) : "—"}</div></div>}
        <div className="rounded-xl bg-soft p-3"><div className="text-xs text-mute">{t("stock")}</div><div className="num font-extrabold">{p.kind === "service" ? "∞" : fmt.num(p.qty)}</div></div>
        <div className="rounded-xl bg-soft p-3"><div className="text-xs text-mute">{t("warranty")}</div><div className="num font-extrabold">{p.warrantyMonths ? `${fmt.num(p.warrantyMonths)} ${t("months")}` : t("none")}</div></div>
      </div>
      {p.kind === "phone" && <>
        <div className="mb-3 flex flex-wrap items-center gap-2">{Object.entries(p.unitCounts || {}).map(([k, n]) => <Badge key={k} tone={k === "available" ? "ok" : k === "sold" ? "neutral" : "warn"}>{t(`unit.${k}`)}: {fmt.num(n)}</Badge>)}{can("products.edit") && <Btn size="sm" variant="soft" icon={Plus} className="ms-auto" onClick={() => setAdd(true)}>{t("unit.addOpening")}</Btn>}</div>
        <DataTable endpoint="/units" params={{ product: id }} pageSize={10} refreshKey={tab} searchPlaceholder={t("unit.search")} columns={[
          { key: "imei1", label: "IMEI", render: (u) => <span className="num ltr font-bold">{u.imei1 || "—"}</span> }, { key: "imei2", label: "IMEI 2", render: (u) => <span className="num ltr text-mute">{u.imei2 || "—"}</span> },
          { key: "serial", label: t("serial"), render: (u) => <span className="num ltr text-mute">{u.serial || "—"}</span> }, { key: "color", label: t("color") },
          { key: "status", label: t("status"), render: (u) => <Badge tone={u.status === "available" ? "ok" : u.status === "sold" ? "neutral" : "warn"}>{t(`unit.${u.status}`)}</Badge> },
          ...(p.buy !== undefined ? [{ key: "buyPrice", label: t("buyPrice"), align: "end", render: (u) => <span className="num">{fmt.num(u.buyPrice)}</span> }] : []),
          { key: "f", label: "", render: (u) => u.flagged && <Badge tone="bad">{t("unit.flagged")}</Badge> }]} />
      </>}
      {p.description && <p className="mt-4 text-sm text-mute">{p.description}</p>}
      {add && <OpeningUnit product={p} onClose={() => setAdd(false)} onDone={() => { setAdd(false); reload(); setTab(Math.random()); onChanged(); }} />}
    </Modal>
  );
}

function OpeningUnit({ product, onClose, onDone }) {
  const { t, toast, user } = useApp(); const [u, setU] = useState({ imei1: "", imei2: "", serial: "", buyPrice: product.buy || "", color: product.color }); const [dup, setDup] = useState(false);
  const save = async () => { try { await post(`/products/${product._id}/units`, { ...u, allowDuplicateImei: dup }); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return <Modal size="sm" title={t("unit.addOpening")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn onClick={save}>{t("save")}</Btn></>}>
    <div className="grid gap-3"><Field label="IMEI"><Input dir="ltr" className="num" autoFocus value={u.imei1} onChange={(e) => setU({ ...u, imei1: e.target.value })} /></Field><Field label="IMEI 2"><Input dir="ltr" className="num" value={u.imei2} onChange={(e) => setU({ ...u, imei2: e.target.value })} /></Field><Field label={t("serial")}><Input dir="ltr" value={u.serial} onChange={(e) => setU({ ...u, serial: e.target.value })} /></Field><Field label={t("buyPrice")}><Input type="number" className="num" value={u.buyPrice} onChange={(e) => setU({ ...u, buyPrice: e.target.value })} /></Field>
      {user.role === "admin" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={dup} onChange={(e) => setDup(e.target.checked)} />{t("unit.allowDup")}</label>}</div></Modal>;
}
