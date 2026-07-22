import type { ReactNode } from "react";
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.js";
import { Layout } from "./components/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ClientsListPage } from "./pages/ClientsListPage.js";
import { ClientSpinePage } from "./pages/ClientSpinePage.js";
import { TasksPage } from "./pages/TasksPage.js";
import { theme as C } from "./theme.js";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ fontFamily: C.sans, padding: 24, color: C.inkSoft, fontSize: 13 }}>Loading…</div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/clients"
            element={
              <RequireAuth>
                <ClientsListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <RequireAuth>
                <ClientSpinePage />
              </RequireAuth>
            }
          />
          <Route
            path="/tasks"
            element={
              <RequireAuth>
                <TasksPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/clients" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
