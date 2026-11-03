import { useState } from "react";
import { useApp } from "../lib/app";
import { put } from "../lib/api";
import { Btn, Field, Input, PageHead } from "../components/ui";
import { PasswordForm } from "../App";
import { UserRound } from "lucide-react";

export default function Profile() {
  const { t, user, setUser, toast, logout } = useApp(); const [name, setName] = useState(user.name); const [phone, setPhone] = useState(user.phone || "");
  const save = async (e) => { e.preventDefault(); try { setUser({ ...user, ...(await put("/auth/me", { name, phone })) }); toast.ok(t("saved")); } catch (er) { toast.err(er); } };
  return (
    <>
      <PageHead icon={UserRound} title={t("nav.profile")} sub={`${user.username} · ${t(`role.${user.role}`)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={save} className="card grid gap-4 p-6"><h2 className="text-lg font-extrabold">{t("profile.info")}</h2>
          <Field label={t("name")}><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label={t("phone")}><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Btn type="submit">{t("save")}</Btn>
        </form>
        <div className="card p-6"><h2 className="mb-4 text-lg font-extrabold">{t("pw.change")}</h2><PasswordForm /></div>
      </div>
      <Btn variant="danger" className="mt-6" onClick={() => logout()}>{t("logout")}</Btn>
    </>
  );
}
