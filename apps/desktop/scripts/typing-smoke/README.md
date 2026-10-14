# Editor typing smoke test

This isolated fixture renders the real editor, sidebar and PDF preview with a
219 KB synthetic LaTeX document (300 sections). Backend calls and saves are
stubbed; it never opens or edits a user's project. It exercises 40 CodeMirror
insert transactions, checks immediate store synchronization and undo/redo, and
reports dispatch-to-next-animation-frame timings and React render durations.
These are diagnostic measurements, not hard performance assertions.

Run the fixture server:

```sh
corepack pnpm --filter @codex-prism/desktop exec vite --port 1438
```

Then on Linux with GTK 3 and WebKit2GTK 4.1 Python bindings installed:

```sh
/usr/bin/python3 apps/desktop/scripts/typing-smoke/webkit.py
```

To also exercise an unchanged PDF preview, copy a test PDF to `fixture.pdf` in
this directory (ignored by Git) and pass `--pdf`. Run timings without concurrent
builds/tests. Restart the server after source changes if watching is disabled.
