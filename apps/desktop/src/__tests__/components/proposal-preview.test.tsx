import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProposalPdf } from "@/components/workspace/proposal-preview";
import { proposals, type Proposal } from "@/lib/backend";

const { documentState, chatState } = vi.hoisted(() => ({
  documentState: {
    projectId: "project",
    pdfRevision: 1,
    activeFileId: "main",
    files: [{ id: "main", relativePath: "main.tex", type: "tex" }],
  },
  chatState: { proposalSide: "result", setProposalSide: vi.fn() },
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: (selector: any) => selector(documentState),
  getCurrentPdfBytes: () => new Uint8Array([9]),
  getCurrentPdfRootId: () => "main",
}));
vi.mock("@/stores/agent-chat-store", () => ({
  useAgentChatStore: (selector: any) => selector(chatState),
  activeProposal: vi.fn(),
}));
vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: (selector: any) =>
    selector({ visualChangeReports: false, setVisualChangeReports: vi.fn() }),
}));
vi.mock("@/lib/backend", () => ({ proposals: { operate: vi.fn() } }));
vi.mock("@/lib/mupdf/mupdf-client", () => ({ getMupdfClient: vi.fn() }));
vi.mock("@/lib/review-diff-client", () => ({ loadReviewBlocks: vi.fn() }));
vi.mock("@/components/workspace/preview/visual-review-panel", () => ({
  Crop: () => null,
}));
vi.mock("@/components/workspace/preview/pdf-viewer", () => ({
  PdfViewer: ({ data }: { data: ArrayBuffer }) => (
    <div data-testid="pdf" data-bytes={[...new Uint8Array(data)].join(",")} />
  ),
}));
const proposal: Proposal = {
  id: "a",
  projectId: "project",
  threadId: "thread",
  generation: 1,
  state: "running",
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
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
const pdf = () =>
  host.querySelector('[data-testid="pdf"]')?.getAttribute("data-bytes");

it.each([
  "running",
  "repairing",
] as const)("shows and compiles a PDF while %s", async (state) => {
  const pending = deferred();
  vi.mocked(proposals.operate).mockReturnValueOnce(pending.promise);
  await act(async () =>
    root.render(<ProposalPdf proposal={{ ...proposal, state }} />),
  );
  expect(pdf()).toBe("9");
  expect(host.textContent).toContain("Main document PDF");
  expect(proposals.operate).toHaveBeenCalledWith(
    expect.objectContaining({ state }),
    "compile",
    { mainFile: "main.tex", side: "result" },
  );
  await act(async () => pending.resolve(build(1)));
  expect(pdf()).toBe("1");
  expect(host.textContent).not.toContain(
    "Preview available when the turn finishes",
  );
});

it("retains the captured PDF through another turn and a failed refresh", async () => {
  vi.mocked(proposals.operate).mockResolvedValueOnce(build(1));
  await act(async () =>
    root.render(<ProposalPdf proposal={{ ...proposal, state: "ready" }} />),
  );
  const pending = deferred();
  vi.mocked(proposals.operate).mockReturnValueOnce(pending.promise);
  await act(async () =>
    root.render(<ProposalPdf proposal={{ ...proposal, generation: 2 }} />),
  );
  expect(pdf()).toBe("1");
  expect(host.textContent).toContain("last successful proposal PDF");
  await act(async () => pending.reject(new Error("Compilation failed")));
  expect(pdf()).toBe("1");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Compilation failed",
  );
});

it("does not display another chat's PDF when its late build completes", async () => {
  const a = deferred();
  const b = deferred();
  vi.mocked(proposals.operate)
    .mockReturnValueOnce(a.promise)
    .mockReturnValueOnce(b.promise);
  await act(async () => root.render(<ProposalPdf proposal={proposal} />));
  await act(async () =>
    root.render(<ProposalPdf proposal={{ ...proposal, id: "b" }} />),
  );
  await act(async () => a.resolve(build(1)));
  expect(pdf()).toBe("9");
  await act(async () => b.resolve(build(2)));
  expect(pdf()).toBe("2");
});
