import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectPicker } from "@/components/project-picker";

const { invoke, skillsOpened, agent, python } = vi.hoisted(() => ({
  invoke: vi.fn(),
  skillsOpened: vi.fn(),
  agent: { status: "ready", checkStatus: vi.fn() },
  python: {
    status: "ready",
    version: "test",
    isInstalling: false,
    checkStatus: vi.fn(),
    install: vi.fn(),
    _finishInstall: vi.fn(),
  },
}));
vi.mock("@/lib/backend", () => ({
  invoke,
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "1.6.0"),
}));
vi.mock("@/stores/agent-setup-store", () => ({
  useAgentSetupStore: (select: (s: typeof agent) => unknown) => select(agent),
}));
vi.mock("@/stores/uv-setup-store", () => ({
  useUvSetupStore: (select: (s: typeof python) => unknown) => select(python),
}));
vi.mock("@/stores/document-store", () => ({
  useDocumentStore: (select: (s: unknown) => unknown) =>
    select({ openProject: vi.fn() }),
}));
vi.mock("@/components/project-wizard", () => ({ ProjectWizard: () => null }));
vi.mock("@/components/agent-setup", () => ({ AgentSetup: () => null }));
vi.mock("@/components/latex-setup", () => ({ LatexSetup: () => null }));
vi.mock("@/components/scientific-skills/scientific-skills-onboarding", () => ({
  ScientificSkillsOnboarding: ({ onClose }: { onClose: () => void }) => {
    skillsOpened();
    return <button onClick={onClose}>Close skill selection</button>;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

it.each([false, true])(
  "opens skills only on request and refreshes status on close (installed: %s)",
  async (installed) => {
    let skillCount = installed ? 2 : 0;
    invoke.mockImplementation(async (command: string) => {
      if (command === "list_default_projects") return [];
      if (command === "check_skills_installed") {
        return { installed: skillCount > 0, skill_count: skillCount, location: "" };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const click = async (label: string) => {
      const button = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === label,
      );
      expect(button, label).toBeDefined();
      await act(async () => button!.click());
    };
    try {
      await act(async () => root.render(<ProjectPicker />));
      expect(skillsOpened).not.toHaveBeenCalled();
      await click("Settings");
      expect(skillsOpened).not.toHaveBeenCalled();
      const environment = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Python / Skills"),
      )!;
      await act(async () => environment.click());
      expect(host.textContent).toContain("Scientific Skills");
      expect(skillsOpened).not.toHaveBeenCalled();
      await click(installed ? "Manage" : "Install");
      await vi.waitFor(() => expect(skillsOpened).toHaveBeenCalled());
      skillCount = 3;
      await click("Close skill selection");
      expect(host.textContent).toContain("3 skills");
      expect(host.textContent).not.toContain("Close skill selection");
      expect(invoke.mock.calls.map(([command]) => command)).toEqual([
        "list_default_projects",
        "check_skills_installed",
        "check_skills_installed",
      ]);
      expect(python.install).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
