import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TaskList, ErrorBoundary } from "./components/TaskList.js";
import { TaskForm } from "./components/TaskForm.js";
import { useAppStore, useSidebarOpen } from "./store/useAppStore.js";
import "./components/Layout.css";

// QueryClient is created OUTSIDE the component so it's not recreated on re-render
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,    // 30 s global default
      retry: 1,             // retry failed queries once before showing error
      refetchOnWindowFocus: true, // refetch when user tabs back
    },
  },
});

function App() {
  const sidebarOpen = useSidebarOpen();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  // useMutation for task creation — could also be here and passed down
  const handleCreate = (title: string, description: string) => {
    queryClient.fetchQuery({
      queryKey: ["tasks", "create"],
      queryFn: async () => {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}`,
          },
          body: JSON.stringify({ title, description }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    });
  };

  return (
    // QueryClientProvider makes the client available to all useQuery/useMutation hooks
    // No need for Zustand Provider — Zustand is module-level, no wrapping needed!
    <QueryClientProvider client={queryClient}>
      <div className={`app-grid ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <aside className="sidebar" aria-label="Sidebar navigation">
          <nav>
            <p style={{ padding: "1rem", fontWeight: 600 }}>TaskFlow</p>
          </nav>
        </aside>

        <header className="header">
          <span className="header__logo">TaskFlow</span>
          <div className="header__actions">
            <button onClick={toggleSidebar} aria-label="Toggle sidebar">
              {sidebarOpen ? "←" : "→"}
            </button>
          </div>
        </header>

        <main className="main">
          <h1>My Tasks</h1>

          <TaskForm onSubmit={handleCreate} />

          {/* Error Boundary wraps the list — if TaskList throws during render,
              the boundary catches it and shows a fallback without crashing the app */}
          <ErrorBoundary fallback={<p role="alert">Failed to load tasks.</p>}>
            <TaskList />
          </ErrorBoundary>
        </main>
      </div>

      {/* DevTools shows the cache, query states, and staleTime visually */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;

