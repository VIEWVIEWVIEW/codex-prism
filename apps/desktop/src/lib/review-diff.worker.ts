import { reviewDiff, reviewBlocks } from "./review-diff";

self.onmessage = (
  event: MessageEvent<{ before: string; after: string; blocks?: boolean }>,
) => {
  try {
    if (event.data.blocks) {
      self.postMessage({
        blocks: reviewBlocks(event.data.before, event.data.after),
      });
      return;
    }
    self.postMessage({ rows: reviewDiff(event.data.before, event.data.after) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
