import assert from "node:assert/strict";
import test from "node:test";

import { FRAMES, PACKS, POSTURES, selectFrames, type Frame } from "../src/frames.ts";
import { core } from "../src/packs/core.ts";

const BUILTIN_PACKS = ["core", "diagnosis", "language", "time", "formal", "human"];

function frame(id: string, tags: Frame["tags"]): Frame {
  return { id, label: id, prompt: `Think like ${id}.`, tags };
}

function ids(frames: Frame[]): string[] {
  return frames.map((f) => f.id).sort();
}

test("the core pack is FRAMES and every frame in it is well formed", () => {
  assert.equal(FRAMES, core);
  assert.equal(PACKS.core, core);
  assert.equal(new Set(core.map((f) => f.id)).size, core.length);
  for (const f of core) {
    assert.ok(f.id && f.label && f.prompt, `frame ${f.id} is missing an id, label or prompt`);
    assert.ok(f.tags.length > 0, `frame ${f.id} has no tags`);
    for (const tag of f.tags) {
      assert.ok(["code", "design", "general", "wild"].includes(tag), `frame ${f.id} has tag ${tag}`);
    }
  }
  // Packs with no wild frame borrow one from core, so core must keep one.
  assert.ok(core.some((f) => f.tags.includes("wild")));
});

test("every built-in pack is registered, well formed, and has a posture on every frame", () => {
  assert.deepEqual(Object.keys(PACKS).sort(), [...BUILTIN_PACKS].sort());
  const all = Object.values(PACKS).flat();
  assert.equal(new Set(all.map((f) => f.id)).size, all.length, "frame ids collide across packs");
  for (const f of all) {
    assert.ok(f.id && f.label && f.prompt, `frame ${f.id} is missing an id, label or prompt`);
    assert.match(f.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `frame ${f.id} is not kebab-case`);
    assert.ok(f.tags.length > 0, `frame ${f.id} has no tags`);
    assert.ok(f.posture && POSTURES.includes(f.posture), `frame ${f.id} has no valid posture`);
    assert.ok(f.prompt.length >= 80, `frame ${f.id} prompt is too thin to distort anything`);
  }
});

test("five picks from core are five distinct postures", () => {
  for (let i = 0; i < 300; i++) {
    const picked = selectFrames(5, true, ["core"]);
    assert.equal(picked.length, 5);
    assert.equal(new Set(picked.map((f) => f.posture)).size, 5, picked.map((f) => f.id).join(","));
  }
});

test("coverage repeats a posture only once every posture in the pool is taken", () => {
  const all = Object.keys(PACKS);
  for (let i = 0; i < 100; i++) {
    const picked = selectFrames(POSTURES.length + 2, false, all);
    const postures = picked.map((f) => f.posture);
    assert.equal(new Set(postures).size, POSTURES.length, postures.join(","));
  }
});

test("the wild option reserves that many wild-tagged frames", () => {
  for (let i = 0; i < 100; i++) {
    const three = selectFrames(5, true, ["core"], { wild: 3 });
    assert.ok(three.filter((f) => f.tags.includes("wild")).length >= 3);
    const all = selectFrames(4, true, ["core"], { wild: 4 });
    assert.equal(all.filter((f) => f.tags.includes("wild")).length, 4);
    // wild: 0 reserves nothing; the pool may still contain wild frames, but
    // the run is not forced to include one.
    const none = selectFrames(5, true, ["core"], { wild: 0 });
    assert.equal(none.length, 5);
  }
});

test("exclude keeps the named frames out, including the wild fallback", () => {
  const used = core.slice(0, 10).map((f) => f.id);
  for (let i = 0; i < 100; i++) {
    const picked = selectFrames(3, true, ["core"], { exclude: used });
    assert.equal(picked.length, 3);
    for (const f of picked) assert.ok(!used.includes(f.id), `picked excluded frame ${f.id}`);
  }
});

test("selectFrames pools frames from every requested pack", (t) => {
  t.after(() => {
    delete PACKS.alpha;
    delete PACKS.beta;
  });
  PACKS.alpha = [frame("a1", ["code"]), frame("a2", ["code"])];
  PACKS.beta = [frame("b1", ["code", "wild"])];

  const picked = selectFrames(10, true, ["alpha", "beta"]);

  assert.deepEqual(ids(picked), ["a1", "a2", "b1"]);
});

test("selectFrames throws on an unknown pack and names it", () => {
  assert.throws(
    () => selectFrames(3, true, ["core", "nope"]),
    (err: unknown) =>
      err instanceof Error && err.message.includes("nope") && err.message.includes("core"),
  );
});

test("selectFrames adds a core wild frame when the requested packs have none", (t) => {
  t.after(() => delete PACKS.tame);
  PACKS.tame = [frame("t1", ["code"]), frame("t2", ["design"])];
  const coreWild = core.filter((f) => f.tags.includes("wild")).map((f) => f.id);

  const picked = selectFrames(3, true, ["tame"]);

  assert.equal(picked.length, 3);
  const extra = picked.filter((f) => !PACKS.tame.includes(f));
  assert.equal(extra.length, 1);
  assert.ok(coreWild.includes(extra[0].id));
});

test("codeMode keeps every frame of a pack that has no code or design frame", (t) => {
  t.after(() => delete PACKS.prose);
  PACKS.prose = [frame("p1", ["general"]), frame("p2", ["general"]), frame("p3", ["wild"])];

  const picked = selectFrames(10, true, ["prose"]);

  assert.deepEqual(ids(picked), ["p1", "p2", "p3"]);
});

test("codeMode keeps a pack with no code or design frame whole when pooled with core", (t) => {
  t.after(() => delete PACKS.prose);
  PACKS.prose = [frame("p1", ["general"]), frame("p2", ["general"])];

  const picked = selectFrames(50, true, ["core", "prose"]);

  assert.ok(picked.some((f) => f.id === "p1") && picked.some((f) => f.id === "p2"));
});

test("selectFrames never returns a frame twice when two packs share it", (t) => {
  t.after(() => delete PACKS.shared);
  PACKS.shared = [...core, frame("s1", ["code"])];

  for (let i = 0; i < 200; i++) {
    const picked = selectFrames(50, false, ["core", "shared"]);
    assert.equal(new Set(picked.map((f) => f.id)).size, picked.length);
  }
});

test("selectFrames never returns a frame twice when a pack is named twice", () => {
  // Selection is random, so one call can miss a duplicate that most calls hit.
  for (let i = 0; i < 2000; i++) {
    const picked = selectFrames(10, false, ["core", "core"]);
    assert.equal(new Set(picked.map((f) => f.id)).size, picked.length);
  }
});

test("selectFrames throws when no pack is named", () => {
  assert.throws(() => selectFrames(5, true, []), /at least one pack/);
});

// Kept last: it checks that every test above removed the packs it added.
test("PACKS holds only the built-in packs once the other tests finish", () => {
  assert.deepEqual(Object.keys(PACKS).sort(), [...BUILTIN_PACKS].sort());
});
