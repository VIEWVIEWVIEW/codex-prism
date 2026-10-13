import { invoke } from "@/lib/backend";
import type { Rect } from "@/lib/mupdf/types";
import type { ReviewBlock, SourceRange } from "./review-diff";
export interface VisualMetadata {
  generation?: string;
  main?: string;
  state: "preparing" | "ready" | "unavailable" | "stale";
  before?: string;
  after?: string;
  error?: string;
}
export interface Region extends Rect {
  page: number;
  text: string;
}
export interface VisualItem {
  id: string;
  reviewRevision: string;
  beforeArtifact: string;
  afterArtifact: string;
  path: string;
  label: string;
  ranges: ReviewBlock[];
  before: Region[];
  after: Region[];
  quality: "region" | "adjacent" | "unplaced";
}
export interface SourceBox extends Rect {
  page: number;
  file: string;
  line: number;
}
function service<T>(
  projectId: string,
  operation: string,
  args = {},
): Promise<T> {
  return invoke<T>("project_service", { projectId, operation, args });
}
export const visualBackend = {
  report: (project: string) =>
    service<VisualMetadata>(project, "visual_report"),
  pdf: async (project: string, artifactId: string) =>
    new Uint8Array(
      await service<number[]>(project, "visual_pdf", { artifactId }),
    ).buffer,
  locations: (
    project: string,
    artifactId: string,
    path: string,
    range: SourceRange,
  ) =>
    service<SourceBox[]>(project, "visual_locations", {
      artifactId,
      path,
      ...range,
    }),
};
