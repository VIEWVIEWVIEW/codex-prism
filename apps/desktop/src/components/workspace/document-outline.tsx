import { memo, useEffect, useState } from "react";
import { ListIcon } from "lucide-react";
import { parseTableOfContents, type TocItem } from "@/lib/latex-outline";
import { useDocumentStore } from "@/stores/document-store";

const OutlineEntries = memo(function OutlineEntries({
  toc,
}: {
  toc: TocItem[];
}) {
  function jump(line: number) {
    const state = useDocumentStore.getState();
    const content =
      state.files.find((file) => file.id === state.activeFileId)?.content ?? "";
    const lines = content.split("\n");
    let position = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++)
      position += lines[i].length + 1;
    state.requestJumpToPosition(position);
  }
  return toc.length ? (
    toc.map((item, index) => (
      <button
        key={index}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
        style={{ paddingLeft: `${Math.max(0, item.level - 1) * 12 + 8}px` }}
        onClick={() => jump(item.line)}
      >
        {item.number && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {item.number}
          </span>
        )}
        <span className="truncate">{item.title}</span>
      </button>
    ))
  ) : (
    <div className="px-2 py-1 text-muted-foreground text-xs">
      No sections found
    </div>
  );
});

// Mount with the active file as its key so switching files updates immediately.
export function DocumentOutline() {
  const content = useDocumentStore(
    (state) =>
      state.files.find((file) => file.id === state.activeFileId)?.content ?? "",
  );
  const [toc, setToc] = useState(() => parseTableOfContents(content));
  useEffect(() => {
    // Parsing and reconciling every heading must not block the typing frame.
    const timer = setTimeout(() => setToc(parseTableOfContents(content)), 250);
    return () => clearTimeout(timer);
  }, [content]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-center gap-2 px-3">
        <ListIcon className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-xs">Outline</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <OutlineEntries toc={toc} />
      </div>
    </div>
  );
}
