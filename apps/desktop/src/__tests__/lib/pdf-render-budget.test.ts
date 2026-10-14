import { expect, it } from "vitest";
import {
  boundedRenderScale,
  MAX_PAGE_PIXELS,
  MAX_PAGE_DIMENSION,
} from "@/lib/mupdf/render-budget";
it("bounds raster allocations at high zoom and display density without restricting CSS zoom", () => {
  for (const [width, height] of [
    [595, 842],
    [20000, 100],
    [100, 20000],
  ]) {
    const scale = boundedRenderScale(width, height, 16);
    expect(width * height * scale * scale).toBeLessThanOrEqual(
      MAX_PAGE_PIXELS + 0.01,
    );
    expect(Math.max(width, height) * scale).toBeLessThanOrEqual(
      MAX_PAGE_DIMENSION,
    );
  }
  expect(boundedRenderScale(595, 842, 1)).toBe(1);
  expect(() => boundedRenderScale(0, 842, 1)).toThrow();
});
