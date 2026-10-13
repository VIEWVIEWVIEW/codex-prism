/** PDFs may be reference papers; only route unambiguous image uploads here. */
export function isImageUpload(path: string): boolean {
  return /\.(png|jpe?g|gif|svg|bmp|webp|eps|tiff?)$/i.test(path);
}

export function projectImageFolder(
  folders: string[],
  imagePaths: string[] = [],
): string {
  const ordered = [...folders].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
  for (const name of [
    "prism-uploads",
    "figures",
    "images",
    "graphics",
    "img",
    "figs",
  ]) {
    const existing = ordered.find(
      (folder) => folder.split("/").pop()?.toLowerCase() === name,
    );
    if (existing) return existing;
  }
  // Reuse a custom image folder, but don't treat reference attachments as figures.
  const containingImages = new Set(
    imagePaths
      .filter((path) => path.includes("/") && isImageUpload(path))
      .map((path) => path.slice(0, path.lastIndexOf("/"))),
  );
  return (
    ordered.find(
      (folder) =>
        folder !== "attachments" &&
        !folder.startsWith("attachments/") &&
        containingImages.has(folder),
    ) ?? "prism-uploads"
  );
}
