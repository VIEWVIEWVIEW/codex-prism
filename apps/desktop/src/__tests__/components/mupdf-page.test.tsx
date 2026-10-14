import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MupdfPage } from "@/components/workspace/preview/mupdf-page";
const client = vi.hoisted(() => ({
  drawPage: vi.fn(),
  getPageText: vi.fn(async () => ({ blocks: [] })),
  getPageLinks: vi.fn(async () => []),
}));
vi.mock("@/lib/mupdf/mupdf-client", () => ({ getMupdfClient: () => client }));
it("coalesces zoom renders, rejects obsolete results and releases offscreen canvases", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const bitmap = { close: vi.fn() };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap),
  );
  const drawImage = vi.fn();
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ drawImage } as any);
  const replies: Array<(image: ImageData) => void> = [];
  client.drawPage.mockImplementation(
    () => new Promise((resolve) => replies.push(resolve)),
  );
  const host = document.createElement("div");
  const root = createRoot(host);
  let props = {
    docId: 1,
    pageIndex: 0,
    scale: 1,
    pageWidth: 595,
    pageHeight: 842,
    isVisible: true,
  };
  const render = async (update = {}) => {
    props = { ...props, ...update };
    await act(async () => root.render(<MupdfPage {...props} />));
  };
  try {
    await render();
    for (const scale of [2, 3, 4]) {
      await render({ scale });
      await act(async () => vi.advanceTimersByTime(300));
    }
    expect(client.drawPage).toHaveBeenCalledTimes(1);
    await act(async () => replies[0]({ width: 100, height: 200 } as ImageData));
    expect(drawImage).not.toHaveBeenCalled();
    expect(client.drawPage).toHaveBeenCalledTimes(2);
    expect(client.drawPage).toHaveBeenLastCalledWith(1, 0, 4 * 72);
    await act(async () => replies[1]({ width: 100, height: 200 } as ImageData));
    expect(host.querySelector("canvas")!.width).toBe(100);
    expect(drawImage).toHaveBeenCalledTimes(1);
    await render({ isVisible: false });
    expect(host.querySelector("canvas")!.width).toBe(0);
    expect(host.querySelector("canvas")!.height).toBe(0);
    await render({ isVisible: true });
    expect(client.drawPage).toHaveBeenCalledTimes(3);
    await render({ isVisible: false });
    await act(async () => replies[2]({ width: 100, height: 200 } as ImageData));
    expect(host.querySelector("canvas")!.width).toBe(0);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    context.mockRestore();
  }
});
