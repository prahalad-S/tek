import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, ThemeProvider } from "./app/providers";
import {
  ErrorBoundary,
  ToastProvider,
  Loading,
  EmptyState,
} from "./components/ui";
import { previewEnabled } from "./lib/supabase";
import Shell from "./app/Shell";
import Login, { PasswordPage } from "./features/Login";
const Analytics = lazy(()=>import("./features/Insights").then(m=>({default:m.Analytics})));
const Maps = lazy(()=>import("./features/Insights").then(m=>({default:m.Maps})));
const People = lazy(() => import("./features/People"));
const Teams = lazy(() => import("./features/Teams"));
const Home = lazy(() => import("./features/Home"));
const Timesheets = lazy(() => import("./features/Timesheets"));
const Projects = lazy(() => import("./features/Projects"));
const Profile = lazy(() => import("./features/Profile"));
const Calendar = lazy(() => import("./features/Calendar"));
const Documents = lazy(() =>
  import("./features/Workflows").then((m) => ({ default: m.Documents })),
);
const Leave = lazy(() =>
  import("./features/Workflows").then((m) => ({ default: m.Leave })),
);
const Approvals = lazy(() =>
  import("./features/Workflows").then((m) => ({ default: m.Approvals })),
);
const Access = lazy(() =>
  import("./features/Administration").then((m) => ({ default: m.Access })),
);
const Reports = lazy(() =>
  import("./features/Administration").then((m) => ({ default: m.Reports })),
);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
  },
});
function pages() {
  return (
    <>
      <Route path="analytics" element={<Analytics/>}/><Route path="maps" element={<Maps/>}/><Route path="access" element={<Access />} />
      <Route path="reports" element={<Reports />} />
      <Route path="home" element={<Home />} />
      <Route path="people" element={<People />} />
      <Route path="teams" element={<Teams />} />
      <Route path="timesheets" element={<Timesheets />} />
      <Route path="calendar" element={<Calendar />} />
      <Route path="projects" element={<Projects />} />
      <Route path="profile" element={<Profile />} />
      <Route path="documents" element={<Documents />} />
      <Route path="leave" element={<Leave />} />
      <Route path="approvals" element={<Approvals />} />
      <Route
        path="*"
        element={
          <EmptyState
            title="This page has moved"
            description="Use the sidebar to find your way back."
          />
        }
      />
    </>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/password" element={<PasswordPage />} />
                  <Route
                    path="/"
                    element={
                      <AuthProvider key="live">
                        <Shell />
                      </AuthProvider>
                    }
                  >
                    <Route index element={<Navigate to="home" replace />} />
                    {pages()}
                  </Route>
                  {previewEnabled && (
                    <Route
                      path="/preview"
                      element={
                        <AuthProvider key="preview" preview>
                          <Shell />
                        </AuthProvider>
                      }
                    >
                      <Route index element={<Navigate to="people" replace />} />
                      {pages()}
                    </Route>
                  )}
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
