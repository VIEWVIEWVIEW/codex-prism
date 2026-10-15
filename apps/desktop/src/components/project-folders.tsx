import { useState } from "react";
import { FolderIcon, PlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useProjectStore, type RecentProject } from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ProjectFolders({ onNavigate }: { onNavigate: () => void }) {
  const folders = useProjectStore((s) => s.folders);
  const view = useProjectStore((s) => s.folderView);
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(
    null,
  );
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const navigate = (id: string) => {
    useProjectStore.getState().setFolderView(id);
    onNavigate();
  };
  return (
    <>
      <div className="mt-3 flex items-center justify-between px-2 text-xs text-muted-foreground">
        <span>Folders</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="New folder"
          onClick={() => {
            setEditing({ name: "" });
            setError("");
          }}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      <button
        className={cn(
          "rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
          view === "unfiled" && "bg-muted",
        )}
        onClick={() => navigate("unfiled")}
      >
        Unfiled
      </button>
      {folders.map((folder) => (
        <div
          key={folder.id}
          className={cn(
            "group flex items-center rounded-md hover:bg-muted",
            view === folder.id && "bg-muted",
          )}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
            onClick={() => navigate(folder.id)}
          >
            <FolderIcon className="size-4 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={`Rename folder ${folder.name}`}
            onClick={() => {
              setEditing(folder);
              setError("");
            }}
          >
            <PencilIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={`Remove folder ${folder.name}`}
            onClick={() => setRemoving(folder.id)}
          >
            <Trash2Icon className="size-3" />
          </Button>
        </div>
      ))}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing) return;
              try {
                const store = useProjectStore.getState();
                if (editing.id) store.renameFolder(editing.id, editing.name);
                else navigate(store.createFolder(editing.name));
                setEditing(null);
              } catch (e) {
                setError(String(e instanceof Error ? e.message : e));
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? "Rename folder" : "New folder"}
              </DialogTitle>
              <DialogDescription>
                Organize projects in the app. Their locations on disk stay
                unchanged.
              </DialogDescription>
            </DialogHeader>
            <label className="my-4 block text-sm">
              Folder name
              <input
                autoFocus
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2"
                value={editing?.name ?? ""}
                onChange={(e) => {
                  setEditing(
                    (current) =>
                      current && { ...current, name: e.target.value },
                  );
                  setError("");
                }}
              />
            </label>
            {error && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!editing?.name.trim()}>
                {editing?.id ? "Save" : "Create folder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove folder</DialogTitle>
            <DialogDescription>
              Projects in this folder will become unfiled. No project files will
              be moved or deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) useProjectStore.getState().removeFolder(removing);
                setRemoving(null);
              }}
            >
              Remove folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectFolderSelect({ project }: { project: RecentProject }) {
  const folders = useProjectStore((s) => s.folders);
  if (!folders.length) return null;
  return (
    <select
      aria-label={`Folder for ${project.name}`}
      title="Move to folder"
      className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
      value={project.folderId ?? ""}
      onChange={(e) =>
        useProjectStore
          .getState()
          .moveProject(project.path, e.target.value || null)
      }
    >
      <option value="">Unfiled</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  );
}
