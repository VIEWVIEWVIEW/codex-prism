import { useSettingsStore } from "@/stores/settings-store";
import { getMupdfClient } from "@/lib/mupdf/mupdf-client";
import { loadReviewBlocks } from "@/lib/review-diff-client";
import { Crop } from "./preview/visual-review-panel";
import type { SourceBox, Region } from "@/lib/visual-review";
interface ProposalBuild {
  bytes: number[];
  artifactId: string;
  locations: SourceBox[];
}
import { useEffect, useState } from "react";
import { activeProposal, useAgentChatStore } from "@/stores/agent-chat-store";
import { proposals, type Proposal } from "@/lib/backend";
import { PdfViewer } from "./preview/pdf-viewer";
import { useDocumentStore } from "@/stores/document-store";

export function ProposalSource({ proposal }: { proposal: Proposal }) {
  const side = useAgentChatStore((s) => s.proposalSide);
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState(proposal.changes[0]?.path ?? "main.tex");
  const [text, setText] = useState("");
  const [line, setLine] = useState<number | null>(null);
  useEffect(() => {
    const jump = (event: Event) => {
      const d = (event as CustomEvent).detail;
      if (
        d.proposalId === proposal.id &&
        d.generation === proposal.generation
      ) {
        setPath(d.path);
        setLine(d.line);
      }
    };
    window.addEventListener("proposal-source", jump);
    return () => window.removeEventListener("proposal-source", jump);
  }, [proposal.id, proposal.generation]);
  useEffect(() => {
    if (line)
      document
        .getElementById(`proposal-line-${proposal.id}-${line}`)
        ?.scrollIntoView({ block: "center" });
  }, [text, line, proposal.id]);
  useEffect(() => {
    let current = true;
    setText("");
    proposals
      .operate<{ files: string[]; bytes: number[] | null }>(proposal, "read", {
        path,
        side,
      })
      .then((result) => {
        if (!current) return;
        setFiles(result.files);
        const bytes = result.bytes;
        setText(
          bytes
            ? bytes.includes(0)
              ? "Binary asset"
              : new TextDecoder().decode(new Uint8Array(bytes))
            : "File absent from this snapshot",
        );
      })
      .catch((e) => {
        if (current) setText(String(e));
      });
    return () => {
      current = false;
    };
  }, [proposal.id, proposal.generation, path, side]);
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="Proposal source"
    >
      <select
        aria-label="Proposal file"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        className="border-b bg-background p-2 text-sm"
      >
        {Array.from(new Set([path, ...files])).map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-xs">
        {text.split("\n").map((text, i) => (
          <div
            id={`proposal-line-${proposal.id}-${i + 1}`}
            key={i}
            className={line === i + 1 ? "bg-yellow-100 text-black" : ""}
          >
            {text || " "}
          </div>
        ))}
      </pre>
    </section>
  );
}

export function ProposalPdf({ proposal }: { proposal: Proposal }) {
  const defaultMain = useDocumentStore(
    (s) =>
      s.files.find((f) => f.id === s.activeFileId && f.type === "tex")
        ?.relativePath ??
      s.files.find((f) => f.type === "tex")?.relativePath ??
      "main.tex",
  );
  const [main, setMain] = useState(defaultMain);
  const side = useAgentChatStore((s) => s.proposalSide);
  const setSide = useAgentChatStore((s) => s.setProposalSide);
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [scale, setScale] = useState(1);
  const [build, setBuild] = useState<ProposalBuild | null>(null);
  const reports = useSettingsStore((s) => s.visualChangeReports);
  const setReports = useSettingsStore((s) => s.setVisualChangeReports);
  useEffect(() => {
    let current = true;
    setPdf(null);
    setBuild(null);
    setError(null);
    if (["running", "repairing"].includes(proposal.state)) return;
    proposals
      .operate<ProposalBuild>(proposal, "compile", { mainFile: main, side })
      .then((result) => {
        if (current) {
          setPdf(new Uint8Array(result.bytes).buffer);
          setBuild(result);
        }
      })
      .catch((e) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [proposal.id, proposal.generation, proposal.state, main, side, attempt]);
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Proposal PDF">
      <div className="flex flex-wrap gap-2 border-b p-2 text-xs">
        <input
          aria-label="Proposal main document"
          value={main}
          onChange={(e) => setMain(e.target.value)}
          className="w-40 bg-background"
        />
        <select
          aria-label="Proposal comparison"
          value={side}
          onChange={(e) => setSide(e.target.value as "base" | "result")}
          className="bg-background"
        >
          <option value="result">Proposal result</option>
          <option value="base">Original base</option>
        </select>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Recompile
        </button>
        <label>
          <input
            type="checkbox"
            checked={reports}
            onChange={(e) => setReports(e.target.checked)}
          />{" "}
          Visual report
        </label>
      </div>
      {error && (
        <button
          type="button"
          className="p-2 text-xs underline"
          onClick={() =>
            void useAgentChatStore
              .getState()
              .sendPrompt(
                `Fix compilation of ${main} in this proposal. Compiler diagnostics:\n${error}`,
              )
          }
        >
          Fix with agent
        </button>
      )}
      {error ? (
        <pre
          role="alert"
          className="overflow-auto whitespace-pre-wrap p-3 text-xs"
        >
          {error}
        </pre>
      ) : pdf ? (
        <PdfViewer
          key={`${proposal.id}:${proposal.generation}:${side}`}
          data={pdf}
          artifactId={`${proposal.id}:${proposal.generation}:${side}`}
          scale={scale}
          onScaleChange={setScale}
          onSynctexClick={(page, x, y) => {
            const boxes = build?.locations.filter((b) => b.page === page) ?? [];
            boxes.sort(
              (a, b) =>
                Math.abs(a.y - y) +
                Math.abs(a.x - x) -
                Math.abs(b.y - y) -
                Math.abs(b.x - x),
            );
            if (boxes[0])
              window.dispatchEvent(
                new CustomEvent("proposal-source", {
                  detail: {
                    proposalId: proposal.id,
                    generation: proposal.generation,
                    path: boxes[0].file,
                    line: boxes[0].line,
                  },
                }),
              );
          }}
        />
      ) : (
        <p className="p-4 text-sm">
          {["running", "repairing"].includes(proposal.state)
            ? "Agent is editing this proposal. Preview available when the turn finishes."
            : "Compiling proposal…"}
        </p>
      )}
      {reports && build && side === "result" && (
        <ProposalReport proposal={proposal} main={main} result={build} />
      )}
    </section>
  );
}

export function ProposalBar() {
  const state = useAgentChatStore();
  const p = activeProposal(state);
  if (!state.proposals.length) return null;
  const title = state.tabs.find((t) => t.id === state.activeTabId)?.title;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
      <strong>
        {p && !state.viewMain ? `Proposal · ${title}` : "Main document"}
      </strong>
      <span>
        {state.proposals.filter((p) => p.state !== "original").length}{" "}
        unresolved proposals
      </span>
      {state.proposals
        .filter((p) => !p.threadId && p.chatId)
        .map((orphan) => (
          <button
            type="button"
            key={orphan.id}
            className="underline"
            onClick={() => {
              const id = orphan.chatId!;
              if (!state.tabs.some((t) => t.id === id))
                useAgentChatStore.setState((s) => ({
                  tabs: [
                    ...s.tabs,
                    {
                      ...s.tabs[0],
                      id,
                      title: "Recovered proposal",
                      sessionId: null,
                      isStreaming: false,
                      messages: [],
                    },
                  ],
                }));
              useAgentChatStore.getState().setActiveTab(id);
            }}
          >
            Recover interrupted chat
          </button>
        ))}
      {p && (
        <button
          type="button"
          className="underline"
          onClick={() => state.setViewMain(!state.viewMain)}
        >
          {state.viewMain ? "View proposal" : "View main document"}
        </button>
      )}
    </div>
  );
}

function ProposalReport({
  proposal,
  main,
  result,
}: {
  proposal: Proposal;
  main: string;
  result: ProposalBuild;
}) {
  const [report, setReport] = useState<{
    before: number;
    after: number;
    cards: { path: string; before: Region[]; after: Region[] }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    const opened: number[] = [];
    const client = getMupdfClient();
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const base = await proposals.operate<ProposalBuild>(
          proposal,
          "compile",
          { mainFile: main, side: "base" },
        );
        const before = await client.openDocument(
          new Uint8Array(base.bytes).buffer,
        );
        opened.push(before);
        const after = await client.openDocument(
          new Uint8Array(result.bytes).buffer,
        );
        opened.push(after);
        const cards = [];
        for (const change of proposal.changes) {
          if (abort.signal.aborted) return;
          const blocks = change.binary
            ? []
            : await loadReviewBlocks(
                change.oldContent ?? "",
                change.newContent ?? "",
                abort.signal,
              );
          const locate = (locations: SourceBox[], side: "before" | "after") =>
            locations.filter(
              (b) =>
                b.file === change.path &&
                blocks.some((block) => {
                  const r = block[side];
                  return r && b.line >= r.start && b.line <= r.end;
                }),
            );
          cards.push({
            path: change.path,
            before: await client.reviewRegions(
              before,
              locate(base.locations, "before"),
            ),
            after: await client.reviewRegions(
              after,
              locate(result.locations, "after"),
            ),
          });
        }
        if (!abort.signal.aborted) setReport({ before, after, cards });
      } catch (e) {
        if (!abort.signal.aborted) setError(String(e));
      } finally {
        if (abort.signal.aborted)
          for (const id of opened.splice(0)) void client.closeDocument(id);
      }
    })();
    return () => {
      abort.abort();
      for (const id of opened.splice(0)) void client.closeDocument(id);
    };
  }, [proposal.id, proposal.generation, main, result]);
  return (
    <div
      role="region"
      aria-label="Proposal visual report"
      className="max-h-64 shrink-0 overflow-auto border-t p-2 text-xs"
    >
      <strong>Visual changes · immutable base → proposal</strong>
      {error ? (
        <p role="alert">{error}</p>
      ) : report ? (
        report.cards.map((card, i) => (
          <div key={i}>
            <p>{card.path}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                {card.before.length
                  ? card.before.map((r, j) => (
                      <Crop key={j} doc={report.before} region={r} />
                    ))
                  : "No mapped baseline region"}
              </div>
              <div>
                {card.after.length
                  ? card.after.map((r, j) => (
                      <Crop key={j} doc={report.after} region={r} />
                    ))
                  : "No mapped result region"}
              </div>
            </div>
          </div>
        ))
      ) : (
        <p>Preparing visual report…</p>
      )}
    </div>
  );
}
