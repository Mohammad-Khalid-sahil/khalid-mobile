import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useApp } from "./lib/app";
import { post } from "./lib/api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { Btn, Field, Input, Spinner } from "./components/ui";
import { KeyRound } from "lucide-react";

const page = (f) => lazy(f);
const Dashboard = page(() => import("./pages/Dashboard"));
const POS = page(() => import("./pages/POS"));
const Sales = page(() => import("./pages/Sales"));
const Products = page(() => import("./pages/Products"));
const Brands = page(() => import("./pages/Brands"));
const Inventory = page(() => import("./pages/Inventory"));
const Purchases = page(() => import("./pages/Purchases"));
const Suppliers = page(() => import("./pages/Suppliers"));
const Customers = page(() => import("./pages/Customers"));
const Warranty = page(() => import("./pages/Warranty"));
const Repairs = page(() => import("./pages/Repairs"));
const Cashbox = page(() => import("./pages/Cashbox"));
const Expenses = page(() => import("./pages/Expenses"));
const Employees = page(() => import("./pages/Employees"));
const Reports = page(() => import("./pages/Reports"));
const Alerts = page(() => import("./pages/Alerts"));
const Users = page(() => import("./pages/Users"));
const Settings = page(() => import("./pages/Settings"));
const Backup = page(() => import("./pages/Backup"));
const Audit = page(() => import("./pages/Audit"));
const Profile = page(() => import("./pages/Profile"));

function Guard({ perm, children }) {
  const { can } = useApp();
  return can(...perm) ? children : <Navigate to="/" replace />;
}
const G = (perm, el) => <Guard perm={perm}>{el}</Guard>;

export function PasswordForm({ forced }) {
  const { t, toast, acceptSession } = useApp(); const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); if (pw !== pw2) return toast.err({ message: t("pw.mismatch") });
    setBusy(true); try { acceptSession(await post("/auth/change-password", { current: cur, password: pw })); toast.ok(t("pw.changed")); setCur(""); setPw(""); setPw2(""); } catch (er) { toast.err(er); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label={t("pw.current")}><Input type="password" dir="ltr" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></Field>
      <Field label={t("pw.new")} hint={t("pw.hint")}><Input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" /></Field>
      <Field label={t("pw.repeat")}><Input type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" /></Field>
      <Btn type="submit" loading={busy} icon={KeyRound}>{forced ? t("pw.set") : t("save")}</Btn>
    </form>
  );
}

export default function App() {
  const { booting, user, t, logout } = useApp();
  if (booting) return <div className="grid h-full place-items-center"><Spinner /></div>;
  if (!user) return <Login />;
  if (user.mustChangePassword) return (
    <div className="grid h-full place-items-center p-4"><div className="card w-full max-w-md p-8"><h1 className="text-2xl font-extrabold">{t("pw.force.title")}</h1><p className="mb-6 mt-2 text-sm text-mute">{t("pw.force.text")}</p><PasswordForm forced /><button onClick={() => logout()} className="mt-4 w-full text-sm font-semibold text-mute hover:text-ink">{t("logout")}</button></div></div>
  );
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={G(["dashboard.view"], <Dashboard />)} />
          <Route path="pos" element={G(["sales.create"], <POS />)} />
          <Route path="sales" element={G(["sales.view"], <Sales />)} />
          <Route path="products" element={G(["products.view"], <Products />)} />
          <Route path="brands" element={G(["products.view"], <Brands />)} />
          <Route path="inventory" element={G(["inventory.view"], <Inventory />)} />
          <Route path="purchases" element={G(["purchases.view"], <Purchases />)} />
          <Route path="suppliers" element={G(["suppliers.manage"], <Suppliers />)} />
          <Route path="customers" element={G(["customers.view", "debts.manage"], <Customers />)} />
          <Route path="warranty" element={G(["warranty.manage"], <Warranty />)} />
          <Route path="repairs" element={G(["repairs.manage"], <Repairs />)} />
          <Route path="cashbox" element={G(["cashbox.view", "accounts.manage"], <Cashbox />)} />
          <Route path="expenses" element={G(["expenses.manage"], <Expenses />)} />
          <Route path="employees" element={G(["employees.manage", "salaries.manage"], <Employees />)} />
          <Route path="reports" element={G(["reports.view"], <Reports />)} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="users" element={G(["users.manage"], <Users />)} />
          <Route path="settings" element={G(["settings.manage"], <Settings />)} />
          <Route path="backup" element={G(["backup.manage"], <Backup />)} />
          <Route path="audit" element={G(["audit.view"], <Audit />)} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
