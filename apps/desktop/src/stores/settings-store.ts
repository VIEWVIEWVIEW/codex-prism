import { migrateStorageKey } from "@/lib/legacy-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  autoRecompile: boolean;
  setAutoRecompile: (enabled: boolean) => void;
  vimMode: boolean;
  setVimMode: (enabled: boolean) => void;
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoRecompile: false,
      setAutoRecompile: (enabled) => set({ autoRecompile: enabled }),
      vimMode: false,
      setVimMode: (enabled) => set({ vimMode: enabled }),
      editorFontSize: 14,
      setEditorFontSize: (size) =>
        set({ editorFontSize: normalizeFontSize(size) }),
    }),
    {
      name: migrateStorageKey("codex-prism-settings"),
      version: 1,
      migrate: (persisted) => settingsPreferences(persisted),
      merge: (persisted, current) => ({
        ...current,
        ...settingsPreferences(persisted),
      }),
      partialize: ({ autoRecompile, vimMode, editorFontSize }) => ({
        autoRecompile,
        vimMode,
        editorFontSize,
      }),
    },
  ),
);

function normalizeFontSize(size: unknown): number {
  return typeof size === "number" && Number.isFinite(size)
    ? Math.max(10, Math.min(32, Math.round(size)))
    : 14;
}

/** Whitelist preferences so removed backend fields cannot return through hydration. */
export function settingsPreferences(value: unknown) {
  const state = (value ?? {}) as Record<string, unknown>;
  return {
    autoRecompile: state.autoRecompile === true,
    vimMode: state.vimMode === true,
    editorFontSize: normalizeFontSize(state.editorFontSize),
  };
}
