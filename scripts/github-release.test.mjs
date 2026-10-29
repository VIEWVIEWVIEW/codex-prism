import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { assemble, uploadDraft } from "./github-release.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "prism-github-release-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, "artifacts"),
    output = join(dir, "release");
  for (const [platform, names] of [
    ["linux-x64", ["app.deb", "app.AppImage"]],
    ["windows-x64", ["app-setup.exe"]],
    ["macos-arm64", ["app.dmg"]],
  ]) {
    const folder = join(input, `codex-prism-${platform}`);
    await mkdir(folder, { recursive: true });
    for (const name of names)
      await writeFile(join(folder, name), `bytes:${name}`);
  }
  return {
    input,
    output,
    options: { version: "1.6.2", commit: "abc123", notes: "Release notes\n" },
  };
}

test("assembles all platforms with distinct names, source commit, and verified checksums", async (t) => {
  const { input, output, options } = await fixture(t);
  const files = await assemble(input, output, options);
  assert.equal(files.length, 7);
  assert.ok(files.some((p) => p.endsWith("windows-x86_64-setup.exe")));
  assert.ok(files.some((p) => p.endsWith("macos-arm64.dmg")));
  const manifest = JSON.parse(await readFile(join(output, "release.json")));
  assert.equal(manifest.commit, options.commit);
  for (const line of (await readFile(join(output, "SHA256SUMS"), "utf8"))
    .trim()
    .split("\n")) {
    const [hash, name] = line.split("  ");
    assert.equal(
      hash,
      createHash("sha256")
        .update(await readFile(join(output, name)))
        .digest("hex"),
    );
  }
});

test("missing or duplicate platform packages prevent release assembly", async (t) => {
  const { input, output, options } = await fixture(t);
  const installer = join(input, "codex-prism-windows-x64", "app-setup.exe");
  await rm(installer);
  await assert.rejects(
    assemble(input, output, options),
    /Expected one -setup.exe/,
  );
  await writeFile(installer, "one");
  await writeFile(
    join(input, "codex-prism-windows-x64", "other-setup.exe"),
    "two",
  );
  await assert.rejects(assemble(input, output, options), /found 2/);
});

test("draft retries reuse identical assets and reject changed or published assets", async (t) => {
  const { input, output, options } = await fixture(t);
  const files = await assemble(input, output, options);
  const assets = await Promise.all(
    files.map(async (path) => ({
      name: basename(path),
      digest: `sha256:${createHash("sha256")
        .update(await readFile(path))
        .digest("hex")}`,
    })),
  );
  const release = {
    tag_name: "v1.6.2",
    draft: true,
    assets,
    html_url: "https://example.test/draft",
  };
  const calls = [];
  const run = (args) => {
    calls.push(args);
    return JSON.stringify([[release]]);
  };
  assert.equal(
    await uploadDraft("v1.6.2", files, { repo: "owner/repo", run }),
    release.html_url,
  );
  assert.equal(calls.length, 1);
  release.assets[0].digest = "sha256:different";
  await assert.rejects(
    uploadDraft("v1.6.2", files, { repo: "owner/repo", run }),
    /different or unverifiable/,
  );
  assert.ok(calls.every((args) => args[0] === "api"));
  release.draft = false;
  await assert.rejects(
    uploadDraft("v1.6.2", files, { repo: "owner/repo", run }),
    /published release/,
  );
});

test("creates only a draft for an existing tag; authentication errors do not create releases", async (t) => {
  const { input, output, options } = await fixture(t);
  const files = await assemble(input, output, options);
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (calls.length === 1) return "[[]]";
    return JSON.stringify([
      [{ tag_name: "v1.6.2-rc.1", draft: true, assets: [], html_url: "draft" }],
    ]);
  };
  await uploadDraft("v1.6.2-rc.1", files, { repo: "owner/repo", run });
  assert.ok(
    calls[1].includes("--draft") &&
      calls[1].includes("--verify-tag") &&
      calls[1].includes("--prerelease"),
  );
  assert.equal(
    calls.filter((args) => args[1] === "upload").length,
    files.length,
  );
  await assert.rejects(
    uploadDraft("v1.6.2", files, {
      repo: "owner/repo",
      run: () => {
        throw Object.assign(new Error("unauthorized"), { stderr: "HTTP 401" });
      },
    }),
    /unauthorized/,
  );
});
