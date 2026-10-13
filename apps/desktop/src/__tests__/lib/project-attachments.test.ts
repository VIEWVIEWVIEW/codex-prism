import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  copyFileToProject: vi.fn(),
  scanProjectFolder: vi.fn(),
}));

vi.mock("@/lib/tauri/fs", () => ({
  copyFileToProject: mocks.copyFileToProject,
  scanProjectFolder: mocks.scanProjectFolder,
}));

import {
  buildReferenceFilesSection,
  importReferenceFiles,
} from "@/lib/project-attachments";

describe("project attachment helpers", () => {
  beforeEach(() => {
    mocks.copyFileToProject.mockReset();
    mocks.scanProjectFolder.mockReset();
  });

  it("imports PDFs without creating extracted text files", async () => {
    mocks.copyFileToProject.mockResolvedValueOnce("attachments/paper.pdf");

    const files = await importReferenceFiles("C:/project", [
      "C:/source/paper.pdf",
    ]);

    expect(mocks.copyFileToProject).toHaveBeenCalledWith(
      "C:/project",
      "C:/source/paper.pdf",
      "attachments/paper.pdf",
    );
    expect(files).toEqual([
      {
        relativePath: "attachments/paper.pdf",
      },
    ]);
  });

  it("builds a prompt section that keeps PDF references as PDFs", () => {
    const section = buildReferenceFilesSection([
      { relativePath: "attachments/paper.pdf" },
      { relativePath: "attachments/data.csv" },
    ]);

    expect(section).toContain("### Reference Files");
    expect(section).toContain("`attachments/paper.pdf` (PDF)");
    expect(section).toContain("`attachments/data.csv`");
    expect(section).not.toContain("extracted text");
    expect(section).not.toContain(".pdf.txt");
  });

  it.each([
    { folders: [], files: [], destination: "prism-uploads" },
    {
      folders: ["figures", "prism-uploads"],
      files: [],
      destination: "prism-uploads",
    },
    { folders: ["assets/images"], files: [], destination: "assets/images" },
    {
      folders: ["plots"],
      files: [{ relativePath: "plots/old.png" }],
      destination: "plots",
    },
  ])("copies external images into $destination and returns the collision-safe path", async ({
    folders,
    files,
    destination,
  }) => {
    mocks.scanProjectFolder.mockResolvedValue({ folders, files });
    mocks.copyFileToProject.mockResolvedValue(`${destination}/plot (1).PNG`);
    const imported = await importReferenceFiles("/paper", [
      "/elsewhere/plot.PNG",
    ]);
    expect(mocks.copyFileToProject).toHaveBeenCalledWith(
      "/paper",
      "/elsewhere/plot.PNG",
      `${destination}/plot.PNG`,
    );
    expect(imported).toEqual([{ relativePath: `${destination}/plot (1).PNG` }]);
  });
});
