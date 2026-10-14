import { getMupdfClient } from "../../src/lib/mupdf/mupdf-client";
import { createRoot } from "react-dom/client";
import "../../src/styles/globals.css";
import { PdfPreview } from "../../src/components/workspace/preview/pdf-preview";
import { useDocumentStore } from "../../src/stores/document-store";
import { useAgentChatStore } from "../../src/stores/agent-chat-store";
import { useSettingsStore } from "../../src/stores/settings-store";
import { HistoryPanel } from "../../src/components/workspace/history-panel";
import { ProposedChangesPanel } from "../../src/components/agent-chat/proposed-changes-panel";
import { useHistoryStore } from "../../src/stores/history-store";
const historyMode = new URLSearchParams(location.search).has("history");
const callbacks = new Map<number, (value: unknown) => void>();
const listeners = new Map<string, number>();
let completedCompiles = 0;
const call = async (command: string, args: Record<string, unknown> = {}) => {
  if (command === "plugin:event|listen") {
    listeners.set(String(args.event), Number(args.handler));
    return 1;
  }
  const response = await fetch("http://127.0.0.1:19371", {
    method: "POST",
    body: JSON.stringify({ command, args }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  if (command === "project_service" && args.operation === "compile_latex")
    completedCompiles++;
  return result.value;
};
(window as any).__TAURI_INTERNALS__ = {
  invoke: call,
  transformCallback: (fn: (value: unknown) => void) => {
    const id = callbacks.size + 1;
    callbacks.set(id, fn);
    return id;
  },
};
if (historyMode)
  setInterval(async () => {
    for (const event of await call("events"))
      callbacks.get(listeners.get(event.event)!)?.({ ...event, id: 1 });
  }, 300);
const { project, source } = await call("fixture");
const file = {
  id: "main.tex",
  name: "main.tex",
  relativePath: "main.tex",
  ref: { projectId: project.id, path: "main.tex" },
  type: "tex" as const,
  content: source,
  isDirty: false,
};
useDocumentStore.setState({
  projectId: project.id,
  projectRoot: project.root,
  activeFileId: "main.tex",
  files: [file],
  content: source,
  initialized: true,
});
useAgentChatStore.setState({
  projectId: project.id,
  review: { active: false, changes: [] },
});
useSettingsStore.setState({
  visualChangeReports: true,
  autoRecompile: new URLSearchParams(location.search).get("auto") !== "off",
});
(window as any).smoke = {
  call,
  history: () => useHistoryStore.getState().snapshots,
  initial: () => useHistoryStore.getState().snapshots.at(-1),
  async restart() {
    await call("restart");
    await useHistoryStore.getState().loadSnapshots(project.root);
  },
  compiling: () => useDocumentStore.getState().isCompiling,
  compilationCount: () => completedCompiles,
  autoCompiledPendingReview: () =>
    completedCompiles > 0 &&
    !useDocumentStore.getState().isCompiling &&
    useAgentChatStore.getState().locked &&
    !useAgentChatStore.getState().review.active,
  async edit() {
    completedCompiles = 0;
    await call("edit");
    await new Promise((r) => setTimeout(r, 200));
    await useAgentChatStore.getState().refreshReview();
    await useDocumentStore.getState().refreshFiles();
  },
  async read() {
    return call("project_read", { path: "main.tex" });
  },
};
createRoot(document.getElementById("root")!).render(
  historyMode ? (
    <div style={{ height: "100vh", display: "flex" }}>
      <div style={{ width: 440 }}>
        <HistoryPanel />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ProposedChangesPanel />
        <PdfPreview />
      </div>
    </div>
  ) : (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <PdfPreview />
    </div>
  ),
);

(window as any).smoke.performance = async () => {
  const metrics = [];
  for (const name of ["large", "long"]) {
    const bytes = new Uint8Array(await call("performance", { name }));
    const client = getMupdfClient();
    const start = performance.now();
    let pages = 0;
    for (let repeat = 0; repeat < 4; repeat++) {
      const doc = await client.openDocument(bytes.buffer.slice(0));
      pages = await client.countPages(doc);
      for (const page of [0, Math.floor(pages / 2), pages - 1]) {
        await client.getPageText(doc, page);
        await client.drawPage(doc, page, 72);
      }
      await client.closeDocument(doc);
    }
    useDocumentStore.getState().setPdfData(bytes, "main.tex");
    await new Promise((r) => setTimeout(r, 500));
    const page = document.querySelector(
      `.mupdf-page[data-page-number="${pages}"]`,
    );
    page?.scrollIntoView();
    await new Promise((r) => requestAnimationFrame(r));
    metrics.push({
      name,
      bytes: bytes.length,
      pages,
      ms: Math.round(performance.now() - start),
    });
  }
  return metrics;
};
