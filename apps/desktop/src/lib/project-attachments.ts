import { copyFileToProject, scanProjectFolder } from "@/lib/tauri/fs";
import { isImageUpload, projectImageFolder } from "./project-images";

export interface ImportedReferenceFile {
  relativePath: string;
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export async function importReferenceFiles(
  projectRoot: string,
  sourcePaths: string[],
  targetFolder = "attachments",
): Promise<ImportedReferenceFile[]> {
  const imported: ImportedReferenceFile[] = [];
  const scan = sourcePaths.some(isImageUpload)
    ? await scanProjectFolder(projectRoot)
    : null;
  const imageFolder = scan
    ? projectImageFolder(
        scan.folders,
        scan.files.map((file) => file.relativePath),
      )
    : "prism-uploads";

  for (const sourcePath of sourcePaths) {
    const folder = isImageUpload(sourcePath) ? imageFolder : targetFolder;
    const targetName = `${folder}/${baseName(sourcePath)}`;
    const relativePath = await copyFileToProject(
      projectRoot,
      sourcePath,
      targetName,
    );
    const reference: ImportedReferenceFile = { relativePath };
    imported.push(reference);
  }

  return imported;
}

export function buildReferenceFilesSection(
  references: ImportedReferenceFile[],
): string {
  if (references.length === 0) return "";

  const lines = references.map((reference) => {
    if (isPdfPath(reference.relativePath)) {
      return `- \`${reference.relativePath}\` (PDF)`;
    }
    return `- \`${reference.relativePath}\``;
  });

  return [
    "",
    "### Reference Files",
    lines.join("\n"),
    "",
    "Please review them and incorporate relevant information.",
    "",
  ].join("\n");
}
