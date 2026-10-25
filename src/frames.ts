import { core } from "./packs/core.js";
import { diagnosis } from "./packs/diagnosis.js";
import { language } from "./packs/language.js";
import { time } from "./packs/time.js";
import { formal } from "./packs/formal.js";
import { human } from "./packs/human.js";

// Frames push the generator into corners it wouldn't naturally go.
// Each frame is a strategy for re-asking the same engineering problem
// from a different vantage point. Pick a subset per run — don't grind all.

// A posture is the STANCE a frame takes toward the problem, independent of
// its domain vocabulary. Five transplants from five domains share one posture
// and tend to surface the same shape of idea; selection spreads picks across
// postures so a run never lands three frames on one stance.
//
//   adversarial — break it, exploit it, write its post-mortem
//   naive       — no priors, ignore convention
//   transplant  — borrow a mechanism from another field
//   operator    — a transform on the problem itself (invert, remove, dissolve)
//   extreme     — push a dimension to its limit (budget, time, scale)
//   constraint  — what must hold for this to be operable / provable
//   forensic    — reason from symptoms back to causes
export type Posture =
  | "adversarial"
  | "naive"
  | "transplant"
  | "operator"
  | "extreme"
  | "constraint"
  | "forensic";

export const POSTURES: Posture[] = [
  "adversarial",
  "naive",
  "transplant",
  "operator",
  "extreme",
  "constraint",
  "forensic",
];

export type Frame = {
  id: string;
  label: string;
  // The system prompt fragment injected into the divergent branch.
  // Written as an instruction: "you are X, generate ideas as X would."
  prompt: string;
  // Engineering domain tag — used by the orchestrator to bias frame
  // selection when the problem looks code-shaped.
  tags: ("code" | "design" | "general" | "wild")[];
  // Stance, used to spread a run's picks. Frames without one are treated
  // as their own bucket so coverage still prefers them over a repeat.
  posture?: Posture;
};

// Packs are looked up by name at selection time, so a pack added to this
// object is selectable without touching selectFrames.
export const PACKS: Record<string, Frame[]> = { core, diagnosis, language, time, formal, human };

export const FRAMES: Frame[] = core;

// Fisher-Yates shuffle — uniform distribution, unlike sort(() => Math.random() - 0.5).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type SelectOptions = {
  // Wild-tagged frames reserved per run. Default 1. Clamped to [0, n].
  wild?: number;
  // Frame ids that must not be picked (e.g. frames a first round already used).
  exclude?: string[];
};

// Greedy coverage fill: each pass takes at most one frame per posture not yet
// represented; when every remaining posture is covered, a pass may repeat.
// Input order is the randomness source, so shuffle before calling.
function fillByPosture(candidates: Frame[], picked: Frame[], n: number): Frame[] {
  const out = [...picked];
  const taken = new Set(out.map((f) => f.id));
  let remaining = candidates.filter((f) => !taken.has(f.id));
  while (out.length < n && remaining.length > 0) {
    const covered = new Set(out.map((f) => f.posture ?? `~${f.id}`));
    let pick = remaining.find((f) => !covered.has(f.posture ?? `~${f.id}`));
    if (!pick) pick = remaining[0];
    out.push(pick);
    remaining = remaining.filter((f) => f.id !== pick!.id);
  }
  return out;
}

// Pick N frames for a run. Bias toward engineering tags when codeMode is on,
// reserve `wild` slots for wild-tagged frames so divergence stays weird, and
// spread the rest across postures so five picks are five stances, not five
// domains saying the same thing.
export function selectFrames(
  n: number,
  codeMode = true,
  packs = ["core"],
  options: SelectOptions = {},
): Frame[] {
  // Without this an empty list pools nothing and the core wild fallback turns
  // it into a one-frame run.
  if (packs.length === 0) throw new Error("selectFrames needs at least one pack name");
  const named = [...new Set(packs)].map((name) => {
    if (!Object.hasOwn(PACKS, name)) {
      throw new Error(`Unknown frame pack "${name}". Available packs: ${Object.keys(PACKS).join(", ")}`);
    }
    return PACKS[name];
  });
  const excluded = new Set(options.exclude ?? []);
  // By id, so a pack that reuses another pack's frame can't put it in a run twice.
  const unique = (list: Frame[]) =>
    [...new Map(list.map((f) => [f.id, f])).values()].filter((f) => !excluded.has(f.id));
  const frames = unique(named.flat());
  // Narrowed per pack: a pack written for a non-engineering domain may have no
  // code or design frame, and narrowing it would drop it even when pooled with core.
  const pool = codeMode
    ? unique(named.flatMap((p) => {
        const engineering = p.filter((f) => f.tags.includes("code") || f.tags.includes("design"));
        return engineering.length > 0 ? engineering : p;
      }))
    : frames;
  const pooledWild = frames.filter((f) => f.tags.includes("wild"));
  const wild = pooledWild.length > 0 ? pooledWild : unique(FRAMES.filter((f) => f.tags.includes("wild")));

  const wildSlots = Math.max(0, Math.min(n, Math.floor(options.wild ?? 1)));
  // Wild picks first, spread by posture too, so two wild slots are two stances.
  const wildPicked = fillByPosture(shuffle(wild), [], wildSlots);
  return fillByPosture(shuffle(pool), wildPicked, n).slice(0, n);
}
