import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  useChatPdf,
  clearChatPdfCache,
  safeChatSource,
  type ChatPdfArtifact,
} from "@/hooks/use-chat-pdf";
import { proposals, type Proposal } from "@/lib/backend";
const { documentState, chatState } = vi.hoisted(() => ({
  documentState: {
    projectId: "project",
    files: [{ id: "main", relativePath: "main.tex", content: "unchanged" }],
  },
  chatState: {
    activeTabId: "a",
    tabs: [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ],
    proposals: [] as any[],
  },
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: Object.assign((selector: any) => selector(documentState), {
    getState: () => documentState,
  }),
}));
vi.mock("@/stores/agent-chat-store", () => ({
  useAgentChatStore: Object.assign(() => chatState, {
    getState: () => chatState,
  }),
  activeProposal: () =>
    chatState.proposals.find((p) => p.id === chatState.activeTabId),
}));
vi.mock("@/lib/backend", () => ({ proposals: { operate: vi.fn() } }));
const proposal: Proposal = {
  id: "a",
  projectId: "project",
  threadId: "thread",
  generation: 1,
  state: "ready",
  conflicts: [],
  parent: null,
  changes: [],
};
const build = (byte: number) => ({
  bytes: [byte],
  artifactId: `pdf-${byte}`,
  locations: [],
});
function deferred() {
  let resolve!: (value: ReturnType<typeof build>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof build>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let root: Root;
let host: HTMLDivElement;
let current: ReturnType<typeof useChatPdf>;
function Viewer() {
  current = useChatPdf("main.tex");
  return (
    <div>
      {current.label}:{current.artifact?.bytes[0] ?? 9}:{current.error}
    </div>
  );
}
async function render() {
  await act(async () => root.render(<Viewer />));
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  clearChatPdfCache();
  documentState.projectId = "project";
  documentState.files[0].content = "unchanged";
  chatState.activeTabId = "a";
  chatState.proposals = [{ ...proposal }];
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it.each([
  "running",
  "repairing",
])("keeps the main fallback without building during %s", async (state) => {
  chatState.proposals[0].state = state;
  await render();
  expect(host.textContent).toBe("Main document:9:");
  expect(proposals.operate).not.toHaveBeenCalled();
});
it("retains its PDF through a follow-up turn and failed completion build", async () => {
  vi.mocked(proposals.operate).mockResolvedValueOnce(build(1));
  await render();
  expect(host.textContent).toBe("A:1:");
  chatState.proposals[0] = { ...proposal, generation: 2, state: "running" };
  await render();
  expect(proposals.operate).toHaveBeenCalledTimes(1);
  expect(host.textContent).toBe("A:1:");
  vi.mocked(proposals.operate).mockRejectedValueOnce(
    new Error("Compilation failed"),
  );
  chatState.proposals[0] = { ...proposal, generation: 2 };
  await render();
  expect(host.textContent).toContain("A:1:Error: Compilation failed");
});
it("caches independent PDFs and ignores late completion for the displayed chat", async () => {
  const a = deferred();
  const b = deferred();
  chatState.proposals.push({ ...proposal, id: "b", threadId: "thread-b" });
  vi.mocked(proposals.operate)
    .mockReturnValueOnce(a.promise)
    .mockReturnValueOnce(b.promise);
  await render();
  chatState.activeTabId = "b";
  await render();
  await act(async () => a.resolve(build(1)));
  expect(host.textContent).toBe("Main document:9:");
  await act(async () => b.resolve(build(2)));
  expect(host.textContent).toBe("B:2:");
  chatState.activeTabId = "a";
  await render();
  expect(host.textContent).toBe("A:1:");
  expect(proposals.operate).toHaveBeenCalledTimes(2);
});
it("drops obsolete build results and builds the completed generation", async () => {
  const old = deferred();
  vi.mocked(proposals.operate)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(build(2));
  await render();
  chatState.proposals[0] = { ...proposal, generation: 2 };
  await render();
  await act(async () => old.resolve(build(1)));
  expect(host.textContent).toBe("A:2:");
});
it("returns to main after resolution without changing another chat's cache", async () => {
  vi.mocked(proposals.operate).mockResolvedValue(build(1));
  await render();
  chatState.proposals = [];
  await render();
  expect(host.textContent).toBe("Main document:9:");
});
it("does not reuse output across projects", async () => {
  vi.mocked(proposals.operate).mockResolvedValue(build(1));
  await render();
  documentState.projectId = "other";
  await render();
  expect(host.textContent).toBe("Main document:9:");
});
it("navigates only when captured source exactly matches main source", async () => {
  const artifact: ChatPdfArtifact = {
    proposal,
    main: "main.tex",
    build: build(1),
    bytes: new Uint8Array([1]),
  };
  const box = { file: "main.tex", line: 1, page: 1, x: 0, y: 0, w: 1, h: 1 };
  vi.mocked(proposals.operate).mockResolvedValue({
    bytes: [...new TextEncoder().encode("unchanged")],
  });
  expect(await safeChatSource(artifact, box)).toEqual({
    file: "main.tex",
    line: 1,
    column: 0,
  });
  documentState.files[0].content = "accepted changes";
  expect(await safeChatSource(artifact, box)).toBeNull();
});

it("retains a chat PDF when the preview is hidden and reopened during a turn", async () => {
  vi.mocked(proposals.operate).mockResolvedValueOnce(build(1));
  await render();
  await act(async () => root.unmount());
  root = createRoot(host);
  chatState.proposals[0] = { ...proposal, generation: 2, state: "running" };
  await render();
  expect(host.textContent).toBe("A:1:");
  expect(proposals.operate).toHaveBeenCalledTimes(1);
});

it("retains the chat PDF while a repair candidate runs", async () => {
  vi.mocked(proposals.operate).mockResolvedValueOnce(build(1));
  await render();
  chatState.proposals = [
    { ...proposal, state: "original" },
    { ...proposal, id: "repair", state: "repairing", parent: "a" },
  ];
  chatState.activeTabId = "repair";
  await render();
  expect(current.artifact?.bytes[0]).toBe(1);
  expect(current.current).toBe(false);
  expect(proposals.operate).toHaveBeenCalledTimes(1);
  vi.mocked(proposals.operate).mockResolvedValueOnce(build(2));
  chatState.proposals[1] = {
    ...chatState.proposals[1],
    state: "ready",
    generation: 2,
  };
  await render();
  expect(current.artifact?.bytes[0]).toBe(2);
  expect(current.current).toBe(true);
});
