import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentChatDrawer } from "@/components/agent-chat/agent-chat-drawer";
import { useAgentSetupStore } from "@/stores/agent-setup-store";
import { useAgentChatStore } from "@/stores/agent-chat-store";

vi.mock("@/stores/agent-chat-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/stores/agent-chat-store")>()),
  ensureAgentEvents: vi.fn(async () => {}),
}));

it("mounts the document chat drawer with real store hooks and updates selected state", async () => {
  const check = vi
    .spyOn(useAgentSetupStore.getState(), "checkStatus")
    .mockResolvedValue(undefined);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AgentChatDrawer />));
    expect(container.textContent).toContain("What would you like to work on?");
    await act(async () =>
      useAgentChatStore.setState({ error: "Test connection error" }),
    );
    expect(container.textContent).toContain("Test connection error");
  } finally {
    await act(async () => root.unmount());
    useAgentChatStore.setState({ error: null });
    check.mockRestore();
  }
});

it("continues a list with Shift+Enter and sends its Markdown unchanged with Enter", async () => {
  const originalChat = useAgentChatStore.getState();
  const originalSetup = useAgentSetupStore.getState();
  const sendPrompt = vi.fn(async () => {});
  useAgentSetupStore.setState({ status: "ready", checkStatus: vi.fn(async () => {}) });
  useAgentChatStore.setState({
    locked: false,
    sendPrompt,
    tabs: originalChat.tabs.map(t => ({ ...t, draft: "- First", isStreaming: false })),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AgentChatDrawer />));
    const field = container.querySelector("textarea")!;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
    const shiftEnter = () => field.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", shiftKey: true, bubbles: true, cancelable: true,
    }));
    await act(async () => { shiftEnter(); });
    expect(field.value).toBe("- First\n- ");
    expect(field.selectionStart).toBe(field.value.length);
    expect(sendPrompt).not.toHaveBeenCalled();
    await act(async () => { shiftEnter(); });
    expect(field.value).toBe("- First\n");
    await act(async () => { field.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", bubbles: true, cancelable: true,
    })); });
    expect(sendPrompt).toHaveBeenCalledWith("- First\n");
    expect(field.value).toBe("");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    useAgentChatStore.setState(originalChat);
    useAgentSetupStore.setState(originalSetup);
  }
});
