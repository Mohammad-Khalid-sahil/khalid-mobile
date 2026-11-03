import { useState } from "react";
import { Plus, ShieldCheck, UserRound } from "lucide-react";
import { useApp } from "../lib/app";
import { post, put } from "../lib/api";
import { Badge, Btn, DataTable, Dt, Field, Input, Modal, PageHead, Select, SimpleTable, useFetch } from "../components/ui";

export default function Users() {
  const { t, user } = useApp(); const [tick, setTick] = useState(0); const [edit, setEdit] = useState(null); const { data: meta } = useFetch("/users/meta", {}, []);
  const { data: list } = useFetch("/users", {}, [tick]);
  return (
    <>
      <PageHead icon={UserRound} title={t("nav.users")} sub={t("users.sub")} actions={<Btn variant="accent" icon={Plus} onClick={() => setEdit({ name: "", username: "", password: "", role: "seller", phone: "", active: true, permissions: meta?.roles.seller })}>{t("user.add")}</Btn>} />
      <div className="card overflow-hidden"><SimpleTable rows={list || []} rowKey={(u) => u._id} cols={[
        { label: t("name"), render: (u) => <span className={u.active ? "font-bold" : "font-bold opacity-55"}>{u.name}</span> },
        { label: t("username"), render: (u) => <span className="num ltr">{u.username}</span> },
        { label: t("role"), render: (u) => <Badge tone={u.role === "admin" ? "pri" : u.role === "accountant" ? "acc" : "neutral"}>{t(`role.${u.role}`)}</Badge> },
        { label: t("status"), render: (u) => <Badge tone={u.active ? "ok" : "neutral"}>{t(u.active ? "active" : "inactive")}</Badge> },
        { label: t("user.lastLogin"), render: (u) => <Dt v={u.lastLogin} time /> },
        { label: "", align: "end", render: (u) => <Btn size="sm" variant="soft" icon={ShieldCheck} onClick={() => setEdit(u)}>{t("edit")}</Btn> },
      ]} /></div>
      {edit && meta && <Form u={edit} meta={meta} self={user._id === edit._id || user.id === edit._id} onClose={() => setEdit(null)} onDone={() => { setEdit(null); setTick((x) => x + 1); }} />}
    </>
  );
}

function Form({ u, meta, self, onClose, onDone }) {
  const { t, toast } = useApp(); const [f, setF] = useState({ ...u, password: "" }); const isNew = !u._id; const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (p) => setF({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] });
  const setRole = (role) => setF({ ...f, role, permissions: meta.roles[role] });
  const run = async () => { try { await (isNew ? post("/users", f) : put(`/users/${u._id}`, f)); toast.ok(t("saved")); onDone(); } catch (e) { toast.err(e); } };
  return (
    <Modal size="lg" title={t(isNew ? "user.add" : "edit")} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>{t("cancel")}</Btn><Btn disabled={!f.name.trim() || (isNew && (!f.username.trim() || f.password.length < 6))} onClick={run}>{t("save")}</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}><Input autoFocus value={f.name} onChange={set("name")} /></Field><Field label={t("username")}><Input dir="ltr" disabled={!isNew} value={f.username} onChange={set("username")} /></Field>
        <Field label={t("phone")}><Input dir="ltr" value={f.phone} onChange={set("phone")} /></Field><Field label={t("role")}><Select value={f.role} disabled={self} onChange={(e) => setRole(e.target.value)}>{["admin", "seller", "accountant"].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</Select></Field>
        <Field label={isNew ? t("password") : t("user.resetPw")} hint={t("pw.hint")}><Input type="password" dir="ltr" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
        {!isNew && <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold"><input type="checkbox" disabled={self} className="h-4 w-4 accent-[var(--pri)]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t("active")}</label>}
      </div>
      {f.role === "admin" ? <p className="mt-5 rounded-xl bg-pri-soft p-3 text-sm text-pri">{t("user.adminAll")}</p> : <div className="mt-5"><h3 className="mb-3 font-extrabold">{t("user.permissions")}</h3><div className="grid gap-4 md:grid-cols-2">{Object.entries(meta.groups).map(([g, perms]) => <div key={g} className="rounded-2xl border border-line p-4"><div className="mb-2 text-sm font-extrabold text-mute">{t(`permgroup.${g}`)}</div>{perms.map((p) => <label key={p} className="flex cursor-pointer items-center gap-2 py-1 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--pri)]" checked={f.permissions.includes(p)} onChange={() => toggle(p)} />{t(`perm.${p}`)}</label>)}</div>)}</div></div>}
    </Modal>
  );
}
