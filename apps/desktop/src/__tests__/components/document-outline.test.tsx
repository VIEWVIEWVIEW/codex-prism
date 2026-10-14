import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DocumentOutline } from "@/components/workspace/document-outline";
import { useDocumentStore } from "@/stores/document-store";
vi.mock("@/stores/document-store", async () => {
  const { create } = await import("zustand");
  return {
    useDocumentStore: create(() => ({
      activeFileId: "main.tex",
      files: [{ id: "main.tex", content: "\\section{Original}" }],
      requestJumpToPosition: vi.fn(),
    })),
  };
});
it("shows headings immediately on open, then updates after typing pauses", () => {
  vi.useFakeTimers();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  const edit = (content: string) =>
    act(() =>
      useDocumentStore.setState({
        files: [{ ...useDocumentStore.getState().files[0], content }],
      }),
    );
  try {
    act(() => root.render(<DocumentOutline />));
    expect(host.textContent).toContain("1Original");
    edit("\\section{First edit}");
    act(() => vi.advanceTimersByTime(249));
    expect(host.textContent).toContain("Original");
    edit("% comment\n\\section{Latest edit}");
    act(() => vi.advanceTimersByTime(249));
    expect(host.textContent).toContain("Original");
    act(() => vi.advanceTimersByTime(1));
    expect(host.textContent).toContain("1Latest edit");
    act(() => host.querySelector("button")!.click());
    expect(
      useDocumentStore.getState().requestJumpToPosition,
    ).toHaveBeenCalledWith(10);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});
