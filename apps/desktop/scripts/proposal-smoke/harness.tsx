import { createRoot } from "react-dom/client";
import "../../src/styles/globals.css";
import {
  ProposalBar,
  ProposalSource,
  ProposalPdf,
} from "../../src/components/workspace/proposal-preview";
import { ProposedChangesPanel } from "../../src/components/agent-chat/proposed-changes-panel";
import {
  useAgentChatStore,
  activeProposal,
  ensureAgentEvents,
} from "../../src/stores/agent-chat-store";
import { useDocumentStore } from "../../src/stores/document-store";
import { useSettingsStore } from "../../src/stores/settings-store";
import { proposals } from "../../src/lib/backend";
const callbacks = new Map<number, (value: unknown) => void>();
const listeners = new Map<string, number>();
async function call(command: string, args: Record<string, unknown> = {}) {
  if (command === "plugin:event|listen") {
    listeners.set(String(args.event), Number(args.handler));
    return 1;
  }
  const response = await fetch("http://127.0.0.1:19372", {
    method: "POST",
    body: JSON.stringify({ command, args }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result.value;
}
(window as any).__TAURI_INTERNALS__ = {
  invoke: call,
  transformCallback: (fn: any) => {
    const id = callbacks.size + 1;
    callbacks.set(id, fn);
    return id;
  },
};
const { project, source } = await call("fixture");
useDocumentStore.setState({
  projectId: project.id,
  projectRoot: project.root,
  activeFileId: "main.tex",
  files: [
    {
      id: "main.tex",
      name: "main.tex",
      relativePath: "main.tex",
      ref: { projectId: project.id, path: "main.tex" },
      type: "tex",
      content: source,
      isDirty: false,
    },
  ],
  initialized: true,
});
useAgentChatStore.setState({
  projectId: project.id,
  activeProjectPath: project.root,
});
useSettingsStore.setState({ visualChangeReports: false, autoRecompile: false });
await ensureAgentEvents();
setInterval(async () => {
  for (const event of await call("events"))
    callbacks.get(listeners.get(event.event)!)?.({ ...event, id: 1 });
}, 100);
function Harness() {
  const s = useAgentChatStore();
  const p = activeProposal(s);
  return (
    <div className="flex h-screen flex-col">
      <ProposalBar />
      <nav>
        {s.tabs.map((t) => (
          <button
            key={t.id}
            className="p-3"
            onClick={() => s.setActiveTab(t.id)}
          >
            {t.title}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1">
        <div className="w-1/2">
          {p && <ProposalSource key={`${p.id}:${p.generation}`} proposal={p} />}
        </div>
        <div className="w-1/2">
          {p && <ProposalPdf key={p.id} proposal={p} />}
        </div>
      </div>
      <ProposedChangesPanel />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
const wait = async (predicate: () => boolean) => {
  for (let n = 0; n < 300; n++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("UI wait timed out: " + document.body.innerText);
};
const text = async () =>
  new TextDecoder().decode(
    new Uint8Array((await call("project_read", { path: "main.tex" })).bytes),
  );
(window as any).runSmoke = async () => {
  const send = async (name: string) => {
    const s = useAgentChatStore.getState();
    const id = s.activeTabId;
    await s.sendPrompt(name);
    return id;
  };
  const a = await send("A");
  useAgentChatStore.getState().createTab();
  const b = await send("B");
  if (!(await text()).includes("Original passage"))
    throw new Error("Main changed during execution");
  if (
    useAgentChatStore.getState().proposals.filter((p) => p.state === "running")
      .length !== 2
  )
    throw new Error("Both chats must run concurrently");
  await useAgentChatStore.getState().cancelExecution();
  useAgentChatStore.getState().setActiveTab(a);
  await useAgentChatStore.getState().cancelExecution();
  await wait(() =>
    useAgentChatStore.getState().proposals.every((p) => p.state !== "running"),
  );
  await wait(
    () =>
      !!document.querySelector(".mupdf-text-layer") &&
      document.body.innerText.includes("A passage"),
  );
  useAgentChatStore.getState().setActiveTab(b);
  await wait(
    () =>
      !!document.querySelector(".mupdf-text-layer") &&
      document.body.innerText.includes("B passage"),
  );
  if (
    document
      .querySelector('[aria-label="Proposal source"]')
      ?.textContent?.includes("A passage")
  )
    throw new Error("Wrong source in B");
  useAgentChatStore.getState().setProposalSide("base");
  await wait(
    () =>
      !!document.querySelector(".mupdf-text-layer") &&
      !!document
        .querySelector('[aria-label="Proposal source"]')
        ?.textContent?.includes("Original passage"),
  );
  useAgentChatStore.getState().setProposalSide("result");
  await wait(
    () =>
      !!document.querySelector(".mupdf-text-layer") &&
      !!document
        .querySelector('[aria-label="Proposal source"]')
        ?.textContent?.includes("B passage"),
  );
  useSettingsStore.setState({ visualChangeReports: true });
  await wait(
    () => !!document.querySelector('[aria-label="Proposal visual report"] img'),
  );
  useSettingsStore.setState({ visualChangeReports: false });
  useAgentChatStore.getState().setActiveTab(a);
  await useAgentChatStore.getState().decideProposal("apply");
  useAgentChatStore.getState().setActiveTab(b);
  await useAgentChatStore.getState().decideProposal("apply");
  if (activeProposal(useAgentChatStore.getState())?.state !== "conflicts")
    throw new Error("Expected conflict");
  if (!(await text()).includes("A passage"))
    throw new Error("Conflict changed main");
  await useAgentChatStore.getState().decideProposal("repair");
  await useAgentChatStore.getState().cancelExecution();
  await wait(
    () => activeProposal(useAgentChatStore.getState())?.state === "interrupted",
  );
  await wait(
    () =>
      !!document.querySelector(".mupdf-text-layer") &&
      document.body.innerText.includes("Repaired A and B passage"),
  );
  await useAgentChatStore.getState().decideProposal("apply");
  if (!(await text()).includes("Repaired A and B passage"))
    throw new Error("Repair not applied");
  if ((await proposals.list(project.id)).length)
    throw new Error("Unresolved proposals remain");
  return {
    ok: true,
    steps:
      "two running chats → isolated source/PDF → apply A → conflict B → agent repair → apply",
    history: await call("git_log"),
  };
};
