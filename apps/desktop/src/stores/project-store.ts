import { migrateStorageKey } from "@/lib/legacy-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  folderId?: string | null;
}

export interface ProjectFolder {
  id: string;
  name: string;
}

interface ProjectState {
  folders: ProjectFolder[];
  folderView: string | null; // null: all projects; "unfiled": projects without a folder
  setFolderView: (id: string | null) => void;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  moveProject: (path: string, folderId: string | null) => void;
  recentProjects: RecentProject[];
  lastProjectFolder: string | null;
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
  renameRecentProject: (oldPath: string, newPath: string) => void;
  setLastProjectFolder: (path: string) => void;
}

function folderName(name: string, folders: ProjectFolder[], except?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a folder name.");
  if (
    folders.some(
      (f) => f.id !== except && f.name.toLowerCase() === trimmed.toLowerCase(),
    )
  )
    throw new Error("A folder with this name already exists.");
  return trimmed;
}

function normalizeRecentPath(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function recentProjectName(path: string): string {
  const normalized = normalizeRecentPath(path);
  return normalized.split(/[/\\]/).pop() || normalized;
}

function isSameProjectPath(a: string, b: string): boolean {
  return (
    normalizeRecentPath(a).toLowerCase() ===
    normalizeRecentPath(b).toLowerCase()
  );
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      folders: [],
      folderView: null,
      setFolderView: (id) => set({ folderView: id }),
      createFolder: (name) => {
        const normalized = folderName(name, get().folders);
        const id = crypto.randomUUID();
        set((s) => ({ folders: [...s.folders, { id, name: normalized }] }));
        return id;
      },
      renameFolder: (id, name) => {
        const normalized = folderName(name, get().folders, id);
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, name: normalized } : f,
          ),
        }));
      },
      removeFolder: (id) =>
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          recentProjects: s.recentProjects.map((p) =>
            p.folderId === id ? { ...p, folderId: null } : p,
          ),
          folderView: s.folderView === id ? "unfiled" : s.folderView,
        })),
      moveProject: (path, folderId) => {
        if (folderId && !get().folders.some((f) => f.id === folderId))
          throw new Error("Folder no longer exists.");
        set((s) => ({
          recentProjects: s.recentProjects.map((p) =>
            isSameProjectPath(p.path, path) ? { ...p, folderId } : p,
          ),
        }));
      },
      recentProjects: [],
      lastProjectFolder: null,

      setLastProjectFolder: (path) => set({ lastProjectFolder: path }),

      addRecentProject: (path) => {
        const normalizedPath = normalizeRecentPath(path);
        const name = recentProjectName(normalizedPath);
        set((state) => {
          const existing = state.recentProjects.find((p) =>
            isSameProjectPath(p.path, normalizedPath),
          );
          const folderId = existing
            ? existing.folderId
            : state.folders.find((f) => f.id === state.folderView)?.id;
          const filtered = state.recentProjects.filter(
            (p) => !isSameProjectPath(p.path, normalizedPath),
          );
          return {
            recentProjects: [
              { path: normalizedPath, name, lastOpened: Date.now(), folderId },
              ...filtered,
            ],
          };
        });
      },

      removeRecentProject: (path) => {
        set((state) => ({
          recentProjects: state.recentProjects.filter(
            (p) => !isSameProjectPath(p.path, path),
          ),
        }));
      },

      renameRecentProject: (oldPath, newPath) => {
        const normalizedNewPath = normalizeRecentPath(newPath);
        const name = recentProjectName(normalizedNewPath);
        set((state) => ({
          recentProjects: [
            {
              path: normalizedNewPath,
              name,
              lastOpened: Date.now(),
              folderId: state.recentProjects.find((p) =>
                isSameProjectPath(p.path, oldPath),
              )?.folderId,
            },
            ...state.recentProjects.filter(
              (p) =>
                !isSameProjectPath(p.path, oldPath) &&
                !isSameProjectPath(p.path, normalizedNewPath),
            ),
          ],
        }));
      },
    }),
    {
      name: migrateStorageKey("codex-prism-projects"),
      partialize: (state) => ({
        folders: state.folders,
        folderView: state.folderView,
        recentProjects: state.recentProjects,
        lastProjectFolder: state.lastProjectFolder,
      }),
    },
  ),
);
