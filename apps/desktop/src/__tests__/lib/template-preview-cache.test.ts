import { beforeEach, expect, it, vi } from "vitest";
import { privateTemplateItem } from "@/lib/template-catalog";
import { getAllTemplates } from "@/lib/template-registry";

vi.mock("@/lib/mupdf/mupdf-client", () => ({ getMupdfClient: vi.fn() }));
const template = (id: string, revision = "one") =>
  privateTemplateItem({
    id: `private:${id}`,
    revision,
    name: id,
    description: "",
    category: "academic",
    tags: [],
    mainFile: "paper.tex",
  });
let cache: typeof import("@/lib/template-preview-cache");
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  const invoke = await import("@tauri-apps/api/core");
  vi.mocked(invoke.invoke).mockReset();
  cache = await import("@/lib/template-preview-cache");
});

it("deduplicates preview requests and returns independent buffers safe to transfer to workers", async () => {
  const invoke = await import("@tauri-apps/api/core");
  const call = vi.mocked(invoke.invoke).mockResolvedValue([37, 80, 68, 70, 45]);
  const item = template("lab");
  const [first, second] = await Promise.all([
    cache.getTemplatePdfBuffer(item),
    cache.getTemplatePdfBuffer(item),
  ]);
  expect(call).toHaveBeenCalledTimes(1);
  structuredClone(first, { transfer: [first] });
  expect(first.byteLength).toBe(0);
  expect(second.byteLength).toBe(5);
  expect((await cache.getTemplatePdfBuffer(item)).byteLength).toBe(5);
  expect(call).toHaveBeenCalledTimes(1);
});

it("prioritizes opened templates and serializes background compilation", async () => {
  const invoke = await import("@tauri-apps/api/core");
  let finish!: (bytes: number[]) => void;
  const call = vi
    .mocked(invoke.invoke)
    .mockImplementationOnce(
      () =>
        new Promise<number[]>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([1]);
  const first = cache.getTemplatePdfBuffer(template("first"));
  const second = cache.getTemplatePdfBuffer(template("second"));
  const third = cache.getTemplatePdfBuffer(template("third"));
  const priority = cache.getTemplatePdfBuffer(template("third"), true);
  expect(call).toHaveBeenCalledTimes(1);
  finish([1]);
  await Promise.all([first, second, third, priority]);
  expect(
    call.mock.calls.map(([, args]) => (args as { id: string }).id),
  ).toEqual(["private:first", "private:third", "private:second"]);
});

it("retries failed previews only explicitly or after refresh and separates source revisions", async () => {
  const invoke = await import("@tauri-apps/api/core");
  const call = vi
    .mocked(invoke.invoke)
    .mockRejectedValueOnce("Missing TeX Live")
    .mockResolvedValue([1]);
  const item = template("broken");
  await expect(cache.getTemplatePdfBuffer(item)).rejects.toBe(
    "Missing TeX Live",
  );
  await expect(cache.getTemplatePdfBuffer(item)).rejects.toThrow(
    "Missing TeX Live",
  );
  expect(call).toHaveBeenCalledTimes(1);
  cache.resetPrivatePreviewFailures();
  await cache.getTemplatePdfBuffer(item);
  await cache.getTemplatePdfBuffer(template("broken", "two"));
  await cache.getTemplatePdfBuffer(item, true, true);
  expect(call).toHaveBeenCalledTimes(4);
});

it("loads built-in previews from bundled files without a backend compile", async () => {
  const invoke = await import("@tauri-apps/api/core");
  const call = vi.mocked(invoke.invoke);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Uint8Array([1, 2])));
  const item = { ...getAllTemplates()[0], source: "builtin" as const };
  expect((await cache.getTemplatePdfBuffer(item)).byteLength).toBe(2);
  expect(fetch).toHaveBeenCalledWith(`/examples/${item.id}/main.pdf`);
  expect(call).not.toHaveBeenCalled();
});
