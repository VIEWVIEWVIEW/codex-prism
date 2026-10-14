// Bound raster memory independently of CSS zoom and monitor pixel density.
export const MAX_PAGE_PIXELS = 4_000_000;
export const MAX_PAGE_DIMENSION = 4096;
export function boundedRenderScale(
  width: number,
  height: number,
  requested: number,
): number {
  if (
    ![width, height, requested].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    requested <= 0
  )
    throw new Error("Invalid PDF render dimensions");
  return Math.min(
    requested,
    Math.sqrt(MAX_PAGE_PIXELS / (width * height)),
    MAX_PAGE_DIMENSION / width,
    MAX_PAGE_DIMENSION / height,
  );
}
