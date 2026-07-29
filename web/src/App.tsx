import type { ReactNode } from "react";
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.js";
import { Layout } from "./components/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { ClientsListPage } from "./pages/ClientsListPage.js";
import { ClientSpinePage } from "./pages/ClientSpinePage.js";
import { NewClientPage } from "./pages/NewClientPage.js";
import { EditClientPage } from "./pages/EditClientPage.js";
import { PrepPage } from "./pages/PrepPage.js";
import { TasksPage } from "./pages/TasksPage.js";
import { SearchPage } from "./pages/SearchPage.js";
import { OpsPage } from "./pages/OpsPage.js";
import { AIAssistantPage } from "./pages/AIAssistantPage.js";
import { VevePage } from "./pages/VevePage.js";
import { theme as C } from "./theme.js";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ fontFamily: C.sans, padding: 24, color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>
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
            path="/clients/new"
            element={
              <RequireAuth>
                <NewClientPage />
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
            path="/clients/:id/edit"
            element={
              <RequireAuth>
                <EditClientPage />
              </RequireAuth>
            }
          />
          <Route
            path="/clients/:id/prep"
            element={
              <RequireAuth>
                <PrepPage />
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
          <Route
            path="/search"
            element={
              <RequireAuth>
                <SearchPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ops"
            element={
              <RequireAuth>
                <OpsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ai-assistant"
            element={
              <RequireAuth>
                <AIAssistantPage />
              </RequireAuth>
            }
          />
          <Route
            path="/veve"
            element={
              <RequireAuth>
                <VevePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/clients" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
