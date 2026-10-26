import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { usePdfSourceNavigation } from "@/hooks/use-pdf-source-navigation";
import { usePdfNavigationStore } from "@/stores/pdf-navigation-store";
import { invoke } from "@/lib/backend";
import { visualBackend, type SourceBox } from "@/lib/visual-review";
vi.mock("@/lib/backend", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/visual-review", () => ({
  visualBackend: { locations: vi.fn() },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  usePdfNavigationStore.setState({ request: null });
});
it("navigates the displayed PDF and discards obsolete outline lookups", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("crypto", {
    subtle: { digest: vi.fn(async () => new Uint8Array([1, 2]).buffer) },
  });
  const root = createRoot(document.createElement("div"));
  let result: SourceBox | null = null;
  let props = {
    projectRoot: "/paper",
    projectId: "p",
    mainFile: "main.tex",
    activeFilePath: "chapter.tex",
    data: new ArrayBuffer(10),
    enabled: true,
    artifactId: undefined as string | undefined,
  };
  function Harness() {
    result = usePdfSourceNavigation(props);
    return null;
  }
  const box = (page: number): SourceBox => ({
    page,
    line: 2,
    file: "chapter.tex",
    x: 20,
    y: 100,
    w: 100,
    h: 10,
  });
  let finishOld!: (value: SourceBox) => void;
  vi.mocked(invoke)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve as typeof finishOld;
        }),
    )
    .mockResolvedValueOnce(box(4));
  const click = () =>
    act(async () =>
      usePdfNavigationStore.getState().navigate({
        projectRoot: "/paper",
        filePath: "chapter.tex",
        line: 2,
        sourceLine: "\\section{Results}",
      }),
    );
  try {
    await act(async () => root.render(<Harness />));
    await click();
    expect(invoke).toHaveBeenLastCalledWith(
      "synctex_view",
      expect.objectContaining({
        mainFile: "main.tex",
        filePath: "chapter.tex",
        pdfRevision: "0102",
        line: 2,
      }),
    );
    await click();
    expect(result).toMatchObject({ page: 4 });
    await act(async () => finishOld(box(1)));
    expect(result).toMatchObject({ page: 4 });
    props = { ...props, artifactId: "after-artifact" };
    vi.mocked(visualBackend.locations).mockResolvedValue([box(5)]);
    await act(async () => root.render(<Harness />));
    expect(visualBackend.locations).toHaveBeenCalledWith(
      "p",
      "after-artifact",
      "chapter.tex",
      { start: 1, end: 4 },
    );
    expect(result).toMatchObject({ page: 5 });
    props = { ...props, projectRoot: "/different" };
    await act(async () => root.render(<Harness />));
    expect(result).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
  }
});
