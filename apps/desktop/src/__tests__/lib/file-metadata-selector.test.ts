import { expect, it } from "vitest";
import { createFileMetadataSelector } from "@/lib/file-metadata-selector";
import type { ProjectFile } from "@/stores/document-store";

it("keeps file-tree metadata stable across typing, but reflects file operations and save status", () => {
  const select = createFileMetadataSelector();
  const file: ProjectFile = {
    id: "main.tex",
    name: "main.tex",
    relativePath: "main.tex",
    ref: { projectId: "p", path: "main.tex" },
    type: "tex",
    content: "original",
    isDirty: true,
  };
  const first = select({ files: [file] });
  expect(first[0].content).toBeUndefined();
  expect(select({ files: [{ ...file, content: "typed" }] })).toBe(first);
  const saved = select({
    files: [{ ...file, content: "typed", isDirty: false }],
  });
  expect(saved).not.toBe(first);
  expect(saved[0].isDirty).toBe(false);
  const renamed = select({ files: [{ ...file, name: "renamed.tex" }] });
  expect(renamed[0].name).toBe("renamed.tex");
  expect(select({ files: [] })).toEqual([]);
});
