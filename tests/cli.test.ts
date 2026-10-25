import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("--pack with an unknown name exits 1 naming the pack", () => {
  // PATH alone, so a run that gets past pack validation finds no API key in its
  // environment, and the timeout ends it rather than a model call.
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--pack", "nope", "x"], {
    cwd: root,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 5000,
  });

  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /Unknown frame pack "nope"/);
});

test("--pack with no name exits 1 before any LLM call", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "x", "--pack"], {
    cwd: root,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 5000,
  });

  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /--pack needs a pack name/);
});

test("--stimulus with no word exits 1 before any LLM call", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "x", "--stimulus"], {
    cwd: root,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 5000,
  });

  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /--stimulus needs a word/);
});

test("--depth rejects values other than 1 or 2", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--depth", "3", "x"], {
    cwd: root,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 5000,
  });

  assert.equal(result.status, 1, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /--depth must be at most 2/);
});

test("--hybrids 0 and --wild 0 are accepted (zero disables, not an error)", () => {
  // Gets past flag parsing, then fails on the missing API key or the timeout;
  // either way the parse error strings must not appear.
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "--hybrids", "0", "--wild", "0", "--pack", "nope", "x"],
    { cwd: root, env: { PATH: process.env.PATH }, encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /--hybrids must|--wild must/);
  assert.match(result.stderr, /Unknown frame pack "nope"/);
});

test("--help lists every new flag", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--help"], {
    cwd: root,
    env: { PATH: process.env.PATH },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 0);
  for (const flag of ["--wild", "--hybrids", "--depth", "--stimulus", "--no-ban-obvious", "--no-stimulus", "--no-questions"]) {
    assert.ok(result.stdout.includes(flag), `help is missing ${flag}`);
  }
});
