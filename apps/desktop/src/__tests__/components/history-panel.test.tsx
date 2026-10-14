import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HistoryPanel } from "@/components/workspace/history-panel";
const { history, doc, chat } = vi.hoisted(() => ({
  history: {
    snapshots: [
      {
        id: "abc12345",
        message: "docs(agent): accept changes\n\nPrompt body",
        timestamp: 100,
        labels: [],
        changed_files: ["main.tex"],
      },
    ],
    status: { includePrompt: false, repositoryPath: "/paper/.git" },
    selectedSnapshotId: null,
    isLoading: false,
    isRestoring: false,
    error: null,
    init: vi.fn(async () => {}),
    loadSnapshots: vi.fn(async () => {}),
    selectSnapshot: vi.fn(),
    setIncludePrompt: vi.fn(async () => {}),
  },
  doc: { projectRoot: "/paper" },
  chat: { locked: true },
}));
vi.mock("@/stores/history-store", () => ({
  useHistoryStore: Object.assign(() => history, { getState: () => history }),
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: Object.assign((f: any) => f(doc), { getState: () => doc }),
  getCurrentPdfRootId: vi.fn(),
}));
vi.mock("@/stores/agent-chat-store", () => ({
  useAgentChatStore: (f: any) => f(chat),
}));
vi.mock("@/lib/latex-compiler", () => ({
  compileLatex: vi.fn(),
  resolveCompileTarget: vi.fn(),
  formatCompileError: String,
}));
it("shows compact commit subjects and an unchecked prompt toggle; pending review blocks checkpoints", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<HistoryPanel />));
    expect(host.textContent).toContain("docs(agent): accept changes");
    expect(host.textContent).not.toContain("Prompt body");
    const checkbox = host.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(checkbox.checked).toBe(false);
    const checkpoint = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save checkpoint"),
    )!;
    expect(checkpoint.disabled).toBe(true);
    await act(async () => checkbox.click());
    expect(history.setIncludePrompt).toHaveBeenCalledWith("/paper", true);
  } finally {
    await act(async () => root.unmount());
  }
});
