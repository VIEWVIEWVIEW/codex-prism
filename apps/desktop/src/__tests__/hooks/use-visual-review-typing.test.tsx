import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useVisualReview } from "@/hooks/use-visual-review";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { visualBackend } from "@/lib/visual-review";
import { getMupdfClient } from "@/lib/mupdf/mupdf-client";
vi.mock("@/stores/document-store", async () => {
  const { create } = await import("zustand");
  return {
    useDocumentStore: create(() => ({
      projectId: "p",
      pdfRevision: 0,
      contentGeneration: 0,
      files: [{ isDirty: false }],
    })),
  };
});
vi.mock("@/stores/settings-store", async () => {
  const { create } = await import("zustand");
  return { useSettingsStore: create(() => ({ visualChangeReports: false })) };
});
vi.mock("@/stores/agent-chat-store", async () => {
  const { create } = await import("zustand");
  return {
    useAgentChatStore: create(() => ({
      projectId: "p",
      review: { active: false, changes: [{ path: "main.tex" }] },
    })),
  };
});
vi.mock("@/lib/visual-review", () => ({
  visualBackend: { report: vi.fn(async () => ({ state: "unavailable" })) },
}));
vi.mock("@/lib/mupdf/mupdf-client", () => ({
  getMupdfClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/review-diff-client", () => ({ loadReviewBlocks: vi.fn() }));
vi.mock("@/lib/visual-regions", () => ({ mergeVisualItems: vi.fn() }));

it("ignores typing when disabled and marks unsaved edits stale without loading report artifacts", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement("div"));
  let renders = 0;
  let state = "";
  function Harness() {
    renders++;
    state = useVisualReview("main.tex").metadata.state;
    return null;
  }
  const edit = async (generation: number, isDirty = true) =>
    act(async () =>
      useDocumentStore.setState({
        contentGeneration: generation,
        files: [{ ...useDocumentStore.getState().files[0], isDirty }],
      }),
    );
  try {
    await act(async () => root.render(<Harness />));
    const initialRenders = renders;
    await edit(1);
    await edit(2);
    expect(renders).toBe(initialRenders);
    expect(getMupdfClient).not.toHaveBeenCalled();
    expect(visualBackend.report).not.toHaveBeenCalled();
    await act(async () =>
      useSettingsStore.setState({ visualChangeReports: true }),
    );
    expect(state).toBe("stale");
    const dirtyRenders = renders;
    await edit(3);
    expect(renders).toBe(dirtyRenders);
    expect(visualBackend.report).not.toHaveBeenCalled();
    await edit(3, false);
    expect(visualBackend.report).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
  }
});
