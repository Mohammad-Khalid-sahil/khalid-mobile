import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ban, HandCoins, Printer, Receipt, Undo2 } from "lucide-react";
import { useApp } from "../lib/app";
import { del, get, post } from "../lib/api";
import { Badge, Btn, DataTable, Dt, Modal, PageHead, Select, Spinner, Tabs, useFetch } from "../components/ui";
import RangePicker from "../components/RangePicker";
import Invoice from "../components/Invoice";
import PaymentModal from "../components/PaymentModal";
import ReturnModal from "../components/ReturnModal";
import { printNow } from "../lib/export";

export default function Sales() {
  const { t, fmt, can, toast, confirm } = useApp();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState("sales"); const [open, setOpen] = useState(sp.get("id")); const [tick, setTick] = useState(0);
  const [f, setF] = useState({ status: "", payType: "", due: "" }); const [r, setR] = useState({ from: "", to: "", key: "" });
  const refresh = () => setTick((x) => x + 1);

  const cols = [
    { key: "no", label: t("inv.no"), sort: "no", render: (s) => <span className="num ltr font-bold">{s.no}</span> },
    { key: "date", label: t("date"), sort: "date", render: (s) => <Dt v={s.date} time />, text: (s) => fmt.date(s.date, true) },
    { key: "customerName", label: t("customer"), render: (s) => s.customer?.name || s.customerName || <span className="text-mute">{t("walkin")}</span>, text: (s) => s.customer?.name || s.customerName },
    { key: "items", label: t("items"), render: (s) => <span className="ltr block max-w-[220px] truncate text-mute">{s.items.map((i) => i.name).join("، ")}</span>, text: (s) => s.items.map((i) => `${i.name}${i.imei ? ` (${i.imei})` : ""}`).join("; ") },
    { key: "seller", label: t("inv.seller"), render: (s) => s.user?.name, text: (s) => s.user?.name },
    { key: "total", label: t("total"), sort: "total", align: "end", render: (s) => <b className="num">{fmt.num(s.total)}</b>, text: (s) => s.total },
    { key: "paid", label: t("paid"), align: "end", render: (s) => <span className="num">{fmt.num(s.paid)}</span> },
    { key: "due", label: t("due"), sort: "due", align: "end", render: (s) => (s.due > 0 ? <b className="num text-warn">{fmt.num(s.due)}</b> : <span className="text-mute">—</span>), text: (s) => s.due },
    { key: "status", label: t("status"), render: (s) => (s.status === "cancelled" ? <Badge tone="bad">{t("status.cancelled")}</Badge> : s.returnedTotal > 0 ? <Badge tone="warn">{t("status.returned")}</Badge> : <Badge tone={s.payType === "cash" ? "ok" : "acc"}>{t(`paytype.${s.payType}`)}</Badge>), text: (s) => s.status },
  ];

  return (
    <>
      <PageHead icon={Receipt} title={t("nav.sales")} sub={t("sales.sub")} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "sales", label: t("sales.invoices") }, { key: "returns", label: t("sales.returns") }]} />
      {tab === "sales" ? (
        <DataTable endpoint="/sales" exportName="sales" params={{ ...f, from: r.from, to: r.to }} refreshKey={tick} searchPlaceholder={t("sales.search")} columns={cols} onRow={(s) => setOpen(s._id)} rowClass={(s) => (s.status === "cancelled" ? "opacity-55" : "")}
          filters={<>
            <Select className="!w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label={t("status")}><option value="">{t("status")}: {t("all")}</option><option value="completed">{t("status.completed")}</option><option value="cancelled">{t("status.cancelled")}</option></Select>
            <Select className="!w-auto" value={f.payType} onChange={(e) => setF({ ...f, payType: e.target.value })} aria-label={t("pay.type")}><option value="">{t("pay.type")}: {t("all")}</option>{["cash", "partial", "credit"].map((k) => <option key={k} value={k}>{t(`paytype.${k}`)}</option>)}</Select>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={f.due === "1"} onChange={(e) => setF({ ...f, due: e.target.checked ? "1" : "" })} />{t("sales.onlyDue")}</label>
            <div className="w-full"><RangePicker value={r.key ? r : { ...r, key: "" }} onChange={setR} /></div>
          </>} />
      ) : <Returns tick={tick} refresh={refresh} />}
      {open && <InvoiceModal id={open} onClose={() => { setOpen(null); sp.delete("id"); setSp(sp); }} onChange={refresh} />}
    </>
  );
}

export function InvoiceModal({ id, onClose, onChange }) {
  const { t, can, toast, confirm } = useApp(); const { data: s, reload } = useFetch(`/sales/${id}`, {}, []); const [pay, setPay] = useState(false); const [ret, setRet] = useState(false);
  const cancel = async () => {
    const c = await confirm({ title: t("sales.cancel.title", { no: s.no }), message: t("sales.cancel.msg"), reason: true, danger: true, confirmLabel: t("sales.cancel") });
    if (!c.ok) return; try { await post(`/sales/${id}/cancel`, { reason: c.reason }); toast.ok(t("saved")); reload(); onChange?.(); } catch (e) { toast.err(e); }
  };
  const done = () => { reload(); onChange?.(); };
  return (
    <Modal size="md" title={s ? s.no : "…"} onClose={onClose}
      footer={s && <>
        {s.status === "completed" && can("sales.cancel") && !s.returnedTotal && <Btn variant="danger" icon={Ban} onClick={cancel}>{t("sales.cancel")}</Btn>}
        {s.status === "completed" && can("sales.return") && <Btn variant="soft" icon={Undo2} onClick={() => setRet(true)}>{t("ret.title")}</Btn>}
        {s.status === "completed" && s.due > 0 && s.customer && can("debts.manage") && <Btn variant="accent" icon={HandCoins} onClick={() => setPay(true)}>{t("pay.receive")}</Btn>}
        <Btn icon={Printer} onClick={printNow}>{t("print")}</Btn></>}>
      {!s ? <Spinner /> : <>
        {s.status === "cancelled" && <div className="mb-3 rounded-xl bg-bad-soft p-3 text-sm font-semibold text-bad">{t("status.cancelled")}: {s.cancelReason}</div>}
        <Invoice sale={s} returns={s.returns} warranties={s.warranties} />
      </>}
      {pay && s && <PaymentModal party="customer" entity={{ ...s.customer, balance: s.due }} onClose={() => setPay(false)} onDone={done} />}
      {ret && s && <ReturnModal sale={s} onClose={() => setRet(false)} onDone={done} />}
    </Modal>
  );
}

function Returns({ tick, refresh }) {
  const { t, fmt, can, toast, confirm } = useApp();
  const act = async (r, kind) => {
    const c = await confirm({ title: t(kind === "approve" ? "ret.approve" : "ret.reject"), message: r.no, reason: kind === "reject", danger: kind === "reject" });
    if (!c.ok) return; try { await post(`/sales/returns/${r._id}/${kind}`, { reason: c.reason }); toast.ok(t("saved")); refresh(); } catch (e) { toast.err(e); }
  };
  return (
    <DataTable endpoint="/sales/returns/list" refreshKey={tick} search={false} columns={[
      { key: "no", label: t("inv.no"), render: (r) => <span className="num ltr font-bold">{r.no}</span> },
      { key: "sale", label: t("nav.sales"), render: (r) => <span className="num ltr">{r.sale?.no}</span> },
      { key: "date", label: t("date"), render: (r) => <Dt v={r.date} time /> },
      { key: "type", label: t("type"), render: (r) => <Badge tone={r.type === "exchange" ? "pri" : "neutral"}>{t(r.type === "exchange" ? "ret.exchange" : "ret.return")}</Badge> },
      { key: "items", label: t("items"), render: (r) => <span className="ltr block max-w-[240px] truncate">{r.items.map((i) => i.name).join("، ")}</span> },
      { key: "refundValue", label: t("ret.refundValue"), align: "end", render: (r) => <b className="num">{fmt.num(r.refundValue)}</b> },
      { key: "reason", label: t("reason"), render: (r) => <span className="block max-w-[200px] truncate text-mute">{r.reason}</span> },
      { key: "status", label: t("status"), render: (r) => <Badge tone={r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : "bad"}>{t(`ret.status.${r.status}`)}</Badge> },
      { key: "a", label: "", render: (r) => r.status === "pending" && can("sales.approveReturn") && <div className="flex gap-1"><Btn size="sm" onClick={() => act(r, "approve")}>{t("ret.approve")}</Btn><Btn size="sm" variant="danger" onClick={() => act(r, "reject")}>{t("ret.reject")}</Btn></div> },
    ]} />
  );
}
