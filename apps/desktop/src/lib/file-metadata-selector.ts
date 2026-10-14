import { shallow } from "zustand/shallow";
import type { ProjectFile } from "@/stores/document-store";

/** Keep file-tree subscriptions stable when only editor text changes. */
export function createFileMetadataSelector() {
  let input: ProjectFile[] | undefined;
  let output: ProjectFile[] = [];
  return (state: { files: ProjectFile[] }): ProjectFile[] => {
    if (state.files === input) return output;
    input = state.files;
    const previous = new Map(output.map((file) => [file.id, file]));
    const next = state.files.map(({ content: _content, ...metadata }) => {
      const old = previous.get(metadata.id);
      return old && shallow(old, metadata) ? old : metadata;
    });
    if (!shallow(output, next)) output = next;
    return output;
  };
}
