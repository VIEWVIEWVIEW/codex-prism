import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EnvironmentOnboarding } from "@/components/environment-onboarding";
const { state, skillsOpened, invoke } = vi.hoisted(() => ({
  skillsOpened: vi.fn(),
  invoke: vi.fn(),
  state: { status: "ready", checkStatus: vi.fn(async () => {}) },
}));
vi.mock("@/stores/agent-setup-store", () => ({
  useAgentSetupStore: (select: any) => select(state),
}));
vi.mock("@/components/agent-setup", () => ({
  AgentSetup: () => <div>Codex connection</div>,
}));
vi.mock("@/stores/uv-setup-store", () => {
  throw new Error("Startup must not load Python setup");
});
vi.mock("@/lib/backend", () => ({ invoke }));
vi.mock("@/components/scientific-skills/scientific-skills-onboarding", () => ({
  ScientificSkillsOnboarding: skillsOpened,
}));
afterEach(() => vi.clearAllMocks());

it.each(["error", "not-authenticated"])("requires no Python or skills setup when Codex is %s", async (status) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.status = status;
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<EnvironmentOnboarding />));
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === "Done",
  )!;
  expect(button.disabled).toBe(true);
  expect(document.body.textContent).toContain("Settings → Environment → Scientific Skills");
  state.status = "ready";
  await act(async () => root.render(<EnvironmentOnboarding />));
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(skillsOpened).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  act(() => root.unmount());
  const restarted = createRoot(host);
  await act(async () => restarted.render(<EnvironmentOnboarding />));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(skillsOpened).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  act(() => restarted.unmount());
});

it("does not prompt on a fresh launch when Codex is already connected", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.status = "checking";
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<EnvironmentOnboarding />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    state.status = "ready";
    await act(async () => root.render(<EnvironmentOnboarding />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(skillsOpened).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});
