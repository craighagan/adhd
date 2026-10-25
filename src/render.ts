// Terminal renderer. Matches the output shape the original skill prescribes:
// brief → wide set (clustered) → converge (shortlist + non-obvious + traps)
// → deepened sketches → one provocation.
//
// Walls of equally-weighted prose hide the good ideas — so we use indentation,
// emphasis on the non-obvious pick, and small score chips.

import type { Idea, RunResult } from "./types.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

function chip(i: Idea): string {
  if (!i.score) return "";
  const { novelty, viability, fit } = i.score;
  return dim(`[N${novelty} V${viability} F${fit}]`);
}

// Where an idea came from, when it is not a plain frame branch.
function origin(i: Idea): string {
  switch (i.kind) {
    case "hybrid": return magenta("⚭ ");
    case "stimulus": return yellow("⚄ ");
    case "question": return cyan("? ");
    case "round2": return green("↳ ");
    default: return "";
  }
}

// Every idea that competed for the shortlist, in display order.
export function allIdeas(r: RunResult): Idea[] {
  return [
    ...r.branches.flatMap((b) => b.ideas),
    ...r.hybrids,
    ...r.secondRound.flatMap((b) => b.ideas),
  ];
}

export function renderText(r: RunResult): string {
  const out: string[] = [];

  out.push(bold("Problem: ") + r.problem);
  if (r.reframe) {
    out.push(dim(`Reframed for divergence: ${r.reframe}`));
  }
  if (r.obvious.length > 0) {
    out.push(dim(`Banned as obvious: ${r.obvious.join(" · ")}`));
  }
  if (r.stimulus) {
    out.push(dim(`Random stimulus: ${r.stimulus}`));
  }
  out.push("");

  // Wide set, by cluster.
  out.push(bold("Wide set"));
  const byCluster = new Map<string, Idea[]>();
  for (const idea of allIdeas(r)) {
    const key = idea.cluster ?? "(unclustered)";
    if (!byCluster.has(key)) byCluster.set(key, []);
    byCluster.get(key)!.push(idea);
  }
  for (const [label, ideas] of byCluster) {
    out.push("  " + cyan(label));
    for (const i of ideas) {
      out.push(`    - ${origin(i)}${i.text} ${chip(i)}`);
    }
  }
  out.push("");

  // Converge.
  out.push(bold("Converge — shortlist"));
  for (const i of r.shortlist) {
    const mark = r.nonObviousPick?.id === i.id ? green("★ non-obvious pick → ") : "  ";
    out.push(`  ${mark}${origin(i)}${i.text} ${chip(i)}`);
    if (i.rationale) out.push(`    ${dim(i.rationale)}`);
    if (i.score?.strength) out.push(`    ${green("+")} ${dim(i.score.strength)}`);
  }
  out.push("");

  if (r.traps.length > 0) {
    out.push(bold("Traps (watch-outs, not verdicts)"));
    for (const t of r.traps) {
      out.push(`  ${red("⚠")} ${t.text}`);
      out.push(`    ${dim(t.score?.trap ?? "")}`);
      if (t.score?.strength) out.push(`    ${green("+")} ${dim(t.score.strength)}`);
    }
    out.push("");
  }

  // Deepened — the "focus" / connecting-the-dots passes.
  out.push(bold("Focus — deepened branches"));
  const pool = allIdeas(r);
  for (const d of r.deepened) {
    const parent = pool.find((i) => i.id === d.ideaId);
    out.push("  " + cyan("→ " + (parent ? origin(parent) + parent.text : d.ideaId)));
    out.push("    " + d.sketch.split("\n").join("\n    "));
    if (d.childIdeas.length > 0) {
      out.push("    " + dim("branches off:"));
      for (const c of d.childIdeas) {
        out.push(`      · ${c.text}${c.rationale ? dim(" — " + c.rationale) : ""}`);
      }
    }
    out.push("");
  }

  out.push(bold("Provocation"));
  out.push("  " + yellow(r.provocation));

  const legend: string[] = [];
  if (r.hybrids.length > 0) legend.push(`${magenta("⚭")} hybrid`);
  if (r.stimulus) legend.push(`${yellow("⚄")} random stimulus`);
  if (r.branches.some((b) => b.ideas.some((i) => i.kind === "question"))) legend.push(`${cyan("?")} reframing question`);
  if (r.secondRound.length > 0) legend.push(`${green("↳")} second round`);
  if (legend.length > 0) {
    out.push("");
    out.push(dim("Legend: " + legend.join("  ")));
  }

  if (r.failedFrames.length > 0) {
    out.push("");
    out.push(bold("Partial failures"));
    for (const f of r.failedFrames) {
      out.push(`  ${red("✗")} ${f.frameId}: ${dim(f.error)}`);
    }
  }

  return out.join("\n");
}
