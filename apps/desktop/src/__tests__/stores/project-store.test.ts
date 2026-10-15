import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "@/stores/project-store";

describe("useProjectStore", () => {
  beforeEach(() => {
    // Reset the store between tests
    useProjectStore.setState({
      recentProjects: [],
      folders: [],
      folderView: null,
      lastProjectFolder: null,
    });
  });

  describe("addRecentProject", () => {
    it("adds a project with extracted name", () => {
      useProjectStore.getState().addRecentProject("/Users/dev/my-thesis");
      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects).toHaveLength(1);
      expect(recentProjects[0].path).toBe("/Users/dev/my-thesis");
      expect(recentProjects[0].name).toBe("my-thesis");
    });

    it("moves duplicate to front and deduplicates", () => {
      const store = useProjectStore.getState();
      store.addRecentProject("/a");
      store.addRecentProject("/b");
      store.addRecentProject("/a");
      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects).toHaveLength(2);
      expect(recentProjects[0].path).toBe("/a");
      expect(recentProjects[1].path).toBe("/b");
    });

    it("normalizes trailing separators when deduplicating", () => {
      const store = useProjectStore.getState();
      store.addRecentProject("C:\\Projects\\codex-prism\\paper\\");
      store.addRecentProject("C:\\Projects\\codex-prism\\paper");
      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects).toHaveLength(1);
      expect(recentProjects[0]).toMatchObject({
        path: "C:\\Projects\\codex-prism\\paper",
        name: "paper",
      });
    });

    it("retains all projects beyond ten entries", () => {
      const store = useProjectStore.getState();
      for (let i = 0; i < 12; i++) {
        store.addRecentProject(`/project-${i}`);
      }
      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects).toHaveLength(12);
      // Most recent should be first
      expect(recentProjects[0].path).toBe("/project-11");
    });

    it("extracts name from path correctly", () => {
      useProjectStore.getState().addRecentProject("/a/b/c/deep-folder");
      expect(useProjectStore.getState().recentProjects[0].name).toBe(
        "deep-folder",
      );
    });

    it("uses full path as name if no segments", () => {
      useProjectStore.getState().addRecentProject("standalone");
      expect(useProjectStore.getState().recentProjects[0].name).toBe(
        "standalone",
      );
    });
  });

  describe("removeRecentProject", () => {
    it("removes a project by path", () => {
      const store = useProjectStore.getState();
      store.addRecentProject("/a");
      store.addRecentProject("/b");
      store.removeRecentProject("/a");
      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects).toHaveLength(1);
      expect(recentProjects[0].path).toBe("/b");
    });
  });

  describe("renameRecentProject", () => {
    it("replaces the old recent project path with the new folder path", () => {
      const store = useProjectStore.getState();
      store.addRecentProject("/work/old");
      store.addRecentProject("/work/other");
      store.renameRecentProject("/work/old", "/work/new");

      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects[0]).toMatchObject({
        path: "/work/new",
        name: "new",
      });
      expect(
        recentProjects.some((project) => project.path === "/work/old"),
      ).toBe(false);
      expect(
        recentProjects.some((project) => project.path === "/work/other"),
      ).toBe(true);
    });

    it("matches renamed paths even when the old recent path has a trailing slash", () => {
      const store = useProjectStore.getState();
      store.addRecentProject("/work/old/");
      store.renameRecentProject("/work/old", "/work/new/");

      const { recentProjects } = useProjectStore.getState();
      expect(recentProjects).toHaveLength(1);
      expect(recentProjects[0]).toMatchObject({
        path: "/work/new",
        name: "new",
      });
    });
  });
});

describe("virtual project folders", () => {
  beforeEach(() =>
    useProjectStore.setState({
      recentProjects: [],
      folders: [],
      folderView: null,
    }),
  );
  it("preserves membership when reopening and renaming projects", () => {
    const store = useProjectStore.getState();
    const id = store.createFolder("Research");
    store.setFolderView(id);
    store.addRecentProject("/work/paper");
    store.setFolderView(null);
    store.addRecentProject("/work/paper");
    expect(useProjectStore.getState().recentProjects[0].folderId).toBe(id);
    store.renameRecentProject("/work/paper", "/work/revised");
    expect(useProjectStore.getState().recentProjects[0].folderId).toBe(id);
  });
  it("moves projects without changing paths and unfiles them when a folder is removed", () => {
    const store = useProjectStore.getState();
    store.addRecentProject("/work/paper");
    const id = store.createFolder("Research");
    store.moveProject("/work/paper", id);
    store.renameFolder(id, "Papers");
    expect(useProjectStore.getState().recentProjects[0]).toMatchObject({
      path: "/work/paper",
      folderId: id,
    });
    store.setFolderView(id);
    store.removeFolder(id);
    expect(useProjectStore.getState().recentProjects[0]).toMatchObject({
      path: "/work/paper",
      folderId: null,
    });
    expect(useProjectStore.getState().folderView).toBe("unfiled");
  });
  it("rejects empty and duplicate folder names and invalid destinations", () => {
    const store = useProjectStore.getState();
    store.createFolder(" Research ");
    expect(() => store.createFolder("research")).toThrow("already exists");
    expect(() => store.createFolder("  ")).toThrow("Enter a folder name");
    expect(() => store.moveProject("/work/paper", "missing")).toThrow(
      "no longer exists",
    );
  });
  it("persists folders and membership across hydration and accepts the old flat format", async () => {
    const store = useProjectStore.getState();
    const id = store.createFolder("Research");
    store.addRecentProject("/work/paper");
    store.moveProject("/work/paper", id);
    const storage = useProjectStore.persist.getOptions().storage!;
    const key = useProjectStore.persist.getOptions().name!;
    const saved = await storage.getItem(key);
    useProjectStore.setState({ folders: [], recentProjects: [] });
    await storage.setItem(key, saved!);
    await useProjectStore.persist.rehydrate();
    expect(useProjectStore.getState().folders).toEqual([
      { id, name: "Research" },
    ]);
    expect(useProjectStore.getState().recentProjects[0].folderId).toBe(id);
    useProjectStore.setState({ folders: [], folderView: null });
    await storage.setItem(key, {
      state: {
        recentProjects: [{ path: "/old", name: "old", lastOpened: 1 }],
        lastProjectFolder: null,
      } as any,
      version: 0,
    });
    await useProjectStore.persist.rehydrate();
    expect(useProjectStore.getState().recentProjects[0].path).toBe("/old");
    expect(useProjectStore.getState().folders).toEqual([]);
  });
});
