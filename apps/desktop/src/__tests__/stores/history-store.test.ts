import { beforeEach, expect, it, vi } from "vitest";
import { useHistoryStore } from "@/stores/history-store";
import { invoke } from "@/lib/backend";
vi.mock("@/lib/backend", () => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => {}),
  backend: {
    projects: { register: vi.fn(async (root: string) => ({ id: root, root })) },
  },
}));
const status = {
  includePrompt: false,
  warning: null,
  pending: 0,
  repositoryPath: "/paper/.git",
  archivePath: null,
  blockedReason: null,
};
const snap = (id: string) => ({
  id,
  message: `docs: ${id}`,
  timestamp: 1,
  changed_files: ["main.tex"],
  labels: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  useHistoryStore.getState().reset();
  vi.mocked(invoke).mockImplementation(async (cmd) =>
    cmd === "history_list"
      ? [snap("one")]
      : cmd === "history_status"
        ? status
        : null,
  );
});
it("loads commit metadata and the per-document prompt option", async () => {
  await useHistoryStore.getState().init("/paper");
  expect(useHistoryStore.getState().snapshots).toEqual([snap("one")]);
  expect(useHistoryStore.getState().status?.includePrompt).toBe(false);
  await useHistoryStore.getState().setIncludePrompt("/paper", true);
  expect(invoke).toHaveBeenCalledWith("history_set_prompt", {
    projectRoot: "/paper",
    enabled: true,
  });
});
it("discards late history responses after a project switch", async () => {
  await useHistoryStore.getState().init("/paper");
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "history_list" && args?.projectRoot === "/paper")
      return new Promise((r) => {
        finish = r;
      });
    return cmd === "history_list"
      ? [snap("new-project")]
      : cmd === "history_status"
        ? status
        : null;
  });
  const pending = useHistoryStore.getState().loadSnapshots("/paper");
  await useHistoryStore.getState().init("/other");
  finish([snap("stale")]);
  await pending;
  expect(useHistoryStore.getState().snapshots).toEqual([snap("new-project")]);
});
it("retains all commits after a restore and does not load source diffs on selection", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd) =>
    cmd === "history_list"
      ? [snap("restore"), snap("later"), snap("initial")]
      : cmd === "history_status"
        ? status
        : null,
  );
  await useHistoryStore.getState().init("/paper");
  useHistoryStore.getState().selectSnapshot("restore");
  expect(useHistoryStore.getState().snapshots).toHaveLength(3);
  expect(useHistoryStore.getState().reviewingSnapshot).toBeNull();
  expect(
    vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "history_diff"),
  ).toBe(false);
});
