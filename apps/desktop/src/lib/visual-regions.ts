import type { Region, SourceBox } from "./visual-review";
import type { Rect, StructuredTextData } from "./mupdf/types";
const overlap = (a: Rect, b: Rect) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
export function renderedRegions(
  boxes: SourceBox[],
  pages: Map<number, StructuredTextData>,
): Region[] {
  const result: Region[] = [];
  for (const box of boxes) {
    if (
      ![box.x, box.y, box.w, box.h].every(Number.isFinite) ||
      box.w <= 0 ||
      box.h <= 0
    )
      continue;
    const lines =
      pages
        .get(box.page)
        ?.blocks.filter((b) => b.type === "text")
        .flatMap((b) => b.lines)
        .filter((l) => overlap(box, l.bbox)) ?? [];
    // SyncTeX also identifies non-text math/table boxes; retain their rendered crop.
    const region: Region = {
      page: box.page,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      text: lines
        .map((l) => l.text)
        .join(" ")
        .slice(0, 1200),
    };
    if (
      !result.some(
        (r) =>
          r.page === region.page &&
          Math.abs(r.x - region.x) < 1 &&
          Math.abs(r.y - region.y) < 1 &&
          Math.abs(r.w - region.w) < 1 &&
          Math.abs(r.h - region.h) < 1,
      )
    )
      result.push(region);
  }
  return result.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}
export function regionsOverlap(a: Region[], b: Region[]) {
  return a.some((x) => b.some((y) => x.page === y.page && overlap(x, y)));
}

/** Union overlapping blocks transitively while retaining their source ranges. */
export function mergeVisualItems(
  items: import("./visual-review").VisualItem[],
) {
  const merged: import("./visual-review").VisualItem[] = [];
  const unique = (regions: Region[]) =>
    regions
      .filter(
        (r, i) =>
          regions.findIndex(
            (b) =>
              b.page === r.page &&
              b.x === r.x &&
              b.y === r.y &&
              b.w === r.w &&
              b.h === r.h,
          ) === i,
      )
      .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  for (const original of items) {
    let item = {
      ...original,
      ranges: [...original.ranges],
      before: [...original.before],
      after: [...original.after],
    };
    for (let index = 0; index < merged.length; ) {
      const other = merged[index];
      if (other.path === item.path && regionsOverlap(other.after, item.after)) {
        item = {
          ...other,
          label: other.label === item.label ? item.label : "Passage modified",
          ranges: [...other.ranges, ...item.ranges],
          before: unique([...other.before, ...item.before]),
          after: unique([...other.after, ...item.after]),
          quality:
            other.quality === "region" || item.quality === "region"
              ? "region"
              : "adjacent",
        };
        merged.splice(index, 1);
        index = 0;
      } else index++;
    }
    merged.push(item);
  }
  return merged;
}
