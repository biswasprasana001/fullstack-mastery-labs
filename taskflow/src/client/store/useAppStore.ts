// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "Why doesn't Zustand need a Context Provider?"
// INTERVIEW Q: "How do atomic selectors prevent unnecessary re-renders?"
// INTERVIEW Q: "What belongs in Zustand vs TanStack Query vs local state?"
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── State shape ─────────────────────────────────────────────────────────────
interface AppState {
  // UI state (not server data — that lives in TanStack Query)
  sidebarOpen: boolean;
  statusFilter: "all" | "todo" | "in_progress" | "done";
  searchQuery: string;

  // Actions — co-located with state (Zustand convention)
  toggleSidebar: () => void;
  setStatusFilter: (filter: AppState["statusFilter"]) => void;
  setSearchQuery: (q: string) => void;
}

// ─── INTERVIEW: Why no Provider? ─────────────────────────────────────────────
//
// React Context stores state INSIDE the React tree. Every Consumer re-renders
// when ANY part of the context value changes — even if the component only cares
// about one field. This is the "context performance problem".
//
// Zustand stores state OUTSIDE React, in a plain JS module (singleton).
// Components subscribe via a selector hook. Zustand uses Object.is() to compare
// the selected slice — only re-renders if THAT slice changed.
// No Provider means no wrapping, no prop drilling, no tree pollution.

export const useAppStore = create<AppState>()(
  // persist middleware: serializes state to localStorage on every change
  // INTERVIEW Q: "Hydration mismatch with persist — how do you avoid it?"
  // → In SSR (Next.js), skip rehydration until after mount to avoid mismatch.
  persist(
    (set) => ({
      sidebarOpen: true,
      statusFilter: "all",
      searchQuery: "",

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setStatusFilter: (filter) => set({ statusFilter: filter }),
      setSearchQuery: (q) => set({ searchQuery: q }),
    }),
    {
      name: "taskflow-ui-state", // localStorage key
      partialize: (s) => ({ sidebarOpen: s.sidebarOpen }), // only persist sidebar
    }
  )
);

// ─── Atomic selectors — the key to avoiding re-renders ───────────────────────
//
// BAD: subscribes to the WHOLE store — re-renders on any change
//   const store = useAppStore();
//   const filter = store.statusFilter; // still re-renders when searchQuery changes!
//
// GOOD: select only what you need
//   const filter = useAppStore((s) => s.statusFilter);
//   const setFilter = useAppStore((s) => s.setStatusFilter);
//   → Only re-renders when statusFilter changes

// Pre-built selector hooks (best practice — encapsulates selector logic)
export const useStatusFilter = () => useAppStore((s) => s.statusFilter);
export const useSearchQuery  = () => useAppStore((s) => s.searchQuery);
export const useSidebarOpen  = () => useAppStore((s) => s.sidebarOpen);

// ─── INTERVIEW: Zustand vs Context vs TanStack Query ─────────────────────────
//
// TanStack Query → server/async state: task lists, user profiles, API data
//                  Handles loading, caching, refetching, background updates.
//
// Zustand        → global UI/client state: sidebar open, theme, filters, modals
//                  State that is shared across the tree but not from a server.
//
// useState       → local component state: form inputs, toggle, hover
//                  State that doesn't need to leave the component.
//
// Context        → rarely needed with Zustand. Still useful for DI-style values
//                  (theme object, i18n, auth context) that rarely change.

