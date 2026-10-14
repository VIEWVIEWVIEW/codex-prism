import { useEffect, useState } from "react";
import { invoke } from "@/lib/backend";
import { visualBackend, type SourceBox } from "@/lib/visual-review";
import { usePdfNavigationStore } from "@/stores/pdf-navigation-store";

export function usePdfSourceNavigation({
  projectRoot,
  projectId,
  mainFile,
  activeFilePath,
  data,
  artifactId,
  enabled,
}: {
  projectRoot: string | null;
  projectId: string | null;
  mainFile?: string;
  activeFilePath?: string;
  data: ArrayBuffer | null;
  artifactId?: string;
  enabled: boolean;
}) {
  const request = usePdfNavigationStore((s) => s.request);
  const [location, setLocation] = useState<SourceBox | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLocation(null);
    if (
      !enabled ||
      !request ||
      request.projectRoot !== projectRoot ||
      request.filePath !== activeFilePath ||
      !data ||
      !mainFile
    )
      return;
    async function locate() {
      let result: SourceBox | null;
      if (artifactId && projectId) {
        const boxes = await visualBackend.locations(
          projectId,
          artifactId,
          request!.filePath,
          { start: request!.line, end: request!.line + 2 },
        );
        result =
          boxes.sort(
            (a, b) =>
              Math.abs(a.line - request!.line) -
                Math.abs(b.line - request!.line) ||
              a.page - b.page ||
              a.y - b.y,
          )[0] ?? null;
      } else {
        // Verify that SyncTeX belongs to the PDF actually displayed, including
        // cached roots and a PDF restored after an application restart.
        const hash = await crypto.subtle.digest("SHA-1", data!);
        if (cancelled) return;
        const pdfRevision = Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        result = await invoke<SourceBox | null>("synctex_view", {
          projectDir: projectRoot,
          mainFile,
          filePath: request!.filePath,
          line: request!.line,
          sourceLine: request!.sourceLine,
          pdfRevision,
        });
      }
      if (!cancelled) setLocation(result);
    }
    // Missing/stale SyncTeX is an ordinary unavailable location. The editor
    // still navigates, and we never start a build just to follow an outline link.
    void locate().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    request,
    projectRoot,
    projectId,
    mainFile,
    activeFilePath,
    data,
    artifactId,
    enabled,
  ]);
  return location;
}
