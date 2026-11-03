import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useApp } from "../lib/app";
import { Badge, DataTable, Dt, Modal, PageHead, Select } from "../components/ui";
import RangePicker from "../components/RangePicker";

const MODULES = ["sales", "purchases", "returns", "products", "inventory", "cashbox", "expenses", "salaries", "employees", "customers", "suppliers", "warranty", "repairs", "users", "settings", "backup", "auth", "accounts"];
export default function Audit() {
  const { t, fmt } = useApp(); const [f, setF] = useState({ module: "" }); const [r, setR] = useState({ from: "", to: "", key: "" }); const [open, setOpen] = useState(null);
  return (
    <>
      <PageHead icon={ScrollText} title={t("nav.audit")} sub={t("audit.sub")} />
      <DataTable endpoint="/audit" exportName="audit-log" params={{ ...f, from: r.from, to: r.to }} pageSize={30} onRow={setOpen} searchPlaceholder={t("audit.search")}
        filters={<><Select className="!w-auto" value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })}><option value="">{t("audit.module")}: {t("all")}</option>{MODULES.map((m) => <option key={m} value={m}>{m}</option>)}</Select><div className="w-full"><RangePicker value={r} onChange={setR} /></div></>}
        columns={[{ key: "at", label: t("date"), render: (a) => <Dt v={a.at} time />, text: (a) => fmt.date(a.at, true) }, { key: "userName", label: t("user") }, { key: "module", label: t("audit.module"), render: (a) => <Badge tone="pri">{a.module}</Badge> }, { key: "action", label: t("audit.action"), render: (a) => <Badge tone={["cancel", "delete", "adjust", "count"].includes(a.action) ? "warn" : "neutral"}>{a.action}</Badge> },
          { key: "refNo", label: t("reference"), render: (a) => <span className="num ltr">{a.refNo || "—"}</span> }, { key: "reason", label: t("reason"), render: (a) => <span className="block max-w-[260px] truncate text-mute">{a.reason}</span> }]} />
      {open && <Modal size="md" title={`${open.module} · ${open.action}`} onClose={() => setOpen(null)}><div className="grid gap-3 text-sm"><div><b>{open.userName}</b> · <Dt v={open.at} time /></div>{open.reason && <p className="rounded-xl bg-soft p-3">{open.reason}</p>}{["before", "after"].map((k) => open[k] && <div key={k}><div className="mb-1 font-bold text-mute">{t(`audit.${k}`)}</div><pre dir="ltr" className="scroll-thin overflow-x-auto rounded-xl bg-soft p-3 text-xs">{JSON.stringify(open[k], null, 2)}</pre></div>)}</div></Modal>}
    </>
  );
}
