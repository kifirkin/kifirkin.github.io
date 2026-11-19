#!/usr/bin/env node
// check-facts.mjs — re-read the names index.html prints against the tree that decides them.
//
// The page promises that every claim names the file that decides it. A name moves
// as readily as a number: a provider id is renamed, two tools become one, a skill
// directory changes its name, a settings path stops resolving. Each row below
// reads the deciding file in a pi-braid checkout and compares it to the sentence
// in the page, so a stale name fails here instead of aging quietly in prose.
//
// A row whose source cannot be read is reported unchecked and is never counted as
// a pass. Nothing here uses the network, and nothing writes.
//
//   node check-facts.mjs [--file index.html] [--source ../pi-braid]
//                        [--pi <pi-core package dir>] [--contract <deck-gate.mjs>]
//
// Exit 0 every row checked and holds; 1 a claim moved; 2 the page is unreadable;
// 3 at least one row could not be checked.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();

// ── Arguments ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { file: join(HERE, "index.html"), source: null, pi: null, contract: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--file") opts.file = value, i++;
    else if (flag === "--source") opts.source = value, i++;
    else if (flag === "--pi") opts.pi = value, i++;
    else if (flag === "--contract") opts.contract = value, i++;
    else if (flag === "--help" || flag === "-h") { console.log(usage()); process.exit(0); }
    else { console.error(`unknown argument ${flag}\n\n${usage()}`); process.exit(64); }
  }
  return opts;
}

function usage() {
  return "usage: node check-facts.mjs [--file index.html] [--source ../pi-braid] [--pi <pi-core package dir>] [--contract <deck-gate.mjs>]";
}

// The checkout is a sibling by default because that is where a reader of this
// page keeps it; the environment variable is for a machine that keeps it
// elsewhere. Neither is a guess the gate can hide: a missing checkout fails.
function findSource(opts) {
  if (opts.source) return resolve(opts.source);
  if (process.env.BRAID_SOURCE) return resolve(process.env.BRAID_SOURCE);
  return resolve(HERE, "..", "pi-braid");
}

// pi's own resolver is the instrument for a settings path: a path is correct
// here only if the function pi runs on it says so. Release directories are
// version-named, so the newest sort last.
function findPi(opts) {
  if (opts.pi) return resolve(opts.pi);
  if (process.env.PI_CORE) return resolve(process.env.PI_CORE);
  const releases = join(HOME, ".pi/agent/install/releases");
  if (!existsSync(releases)) return null;
  const candidates = readdirSync(releases)
    .sort()
    .map((name) => join(releases, name, "node_modules/@earendil-works/pi-coding-agent"))
    .filter((dir) => existsSync(join(dir, "dist/utils/paths.js")));
  return candidates.length ? candidates.at(-1) : null;
}

// ── Reading the page ─────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
const deckDir = dirname(resolve(opts.file));
let html;
try {
  html = readFileSync(opts.file, "utf8");
} catch (error) {
  console.error(`FAIL: cannot read ${opts.file} (${error.message})`);
  process.exit(2);
}

const lineAt = (index) => html.slice(0, index).split("\n").length;
const lineOf = (fragment) => {
  const at = html.indexOf(fragment);
  return at < 0 ? null : lineAt(at);
};
const lineOfPattern = (pattern) => {
  const match = html.match(pattern);
  return match && match.index !== undefined ? lineAt(match.index) : null;
};
const readText = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
const relativeTo = (root, path) => path.startsWith(root) ? path.slice(root.length + 1) : path;

// The library index is one section. `.tn` also labels the native tool grid, so the
// selector is scoped to the section rather than matched across the page: a class
// name alone would call four tools skills.
const SKILLS_SECTION = (() => {
  const open = html.indexOf('<section class="spread" id="skills">');
  if (open < 0) return "";
  const close = html.indexOf("</section>", open);
  return close < 0 ? html.slice(open) : html.slice(open, close);
})();
const listedSkills = () =>
  [...SKILLS_SECTION.matchAll(/<span class="tn">([^<]*)<\/span>/g)].flatMap((row) =>
    row[1].split(",").map((name) => name.trim()).filter(Boolean),
  );

// A section's own slice, for the rows whose claim is local: a class name used
// elsewhere on the page would otherwise answer for text the row never read.
const sectionHtml = (id) => {
  const open = html.indexOf(`<section class="spread" id="${id}">`);
  if (open < 0) return "";
  const close = html.indexOf("</section>", open);
  return close < 0 ? html.slice(open) : html.slice(open, close);
};

// Languages are held to one count by the page's own contract: a correction in
// one language only leaves the other lying. This is not a claim about the
// repository, so it is reported as a document invariant beside the rows.
const spanCount = (lang) => (html.match(new RegExp(`class="lang-${lang}"`, "g")) || []).length;

// ── Rows ─────────────────────────────────────────────────────────────────────
// Each row returns ok(detail), moved(expected, found) or unchecked(reason).
// `expected` states what the deciding file says; `found` states what the page
// prints. A reader can settle a failure without re-running the gate.

const ok = (detail) => ({ state: "ok", detail });
const moved = (expected, found) => ({ state: "moved", expected, found });
const unchecked = (reason) => ({ state: "unchecked", reason });

const ROWS = [
  {
    // A provider id is the name a user's settings reference. Renaming it breaks
    // configs silently, so the page must print the id the package registers.
    id: "provider-id",
    claim: "the providers paragraph names the gateway by the id the package registers",
    anchor: "Venice models through the",
    section: "suite",
    check(ctx) {
      const file = join(ctx.source, "packages/providers/ring-lifecycle.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const match = src.match(/export const AGENT_ZERO_ID: ProviderId = "([^"]+)"/);
      if (!match) return unchecked(`no AGENT_ZERO_ID declaration in ${relativeTo(ctx.source, file)}`);
      const id = match[1];
      const missing = [];
      if (!ctx.html.includes(`the ${id} gateway`)) missing.push(`the English sentence does not name "the ${id} gateway"`);
      if (!ctx.html.includes(`шлюз ${id}`)) missing.push(`the Russian sentence does not name "шлюз ${id}"`);
      if (missing.length) return moved(`the gateway registers as "${id}" (${relativeTo(ctx.source, file)})`, missing.join("; "));
      return ok(`gateway id "${id}" from ${relativeTo(ctx.source, file)}`);
    },
  },
  {
    // The page's sentence says how many tools carry the check: a second tool
    // would make "one tool" false, and a renamed tool would make the name false.
    id: "topic-drift-tool",
    claim: "the topic-drift sentence names one tool and the actions that tool takes",
    anchor: "topic_drift",
    section: "calibration",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/cognitive/topic-drift/index.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const tools = [...src.matchAll(/^\s*name: "([a-z0-9_]+)",$/gm)].map((m) => m[1]);
      if (tools.length === 0) return unchecked(`no tool definition found in ${relativeTo(ctx.source, file)}`);
      const actions = [...new Set([...src.matchAll(/action=([a-z]+)/g)].map((m) => m[1]))];
      const missing = [];
      if (!new RegExp(`\\b(one|single) tool\\b`, "i").test(ctx.html)) missing.push("the page does not say the check is one tool");
      if (!/один инструмент/i.test(ctx.html)) missing.push("the Russian sentence does not say the check is one tool");
      for (const name of tools) if (!ctx.html.includes(name)) missing.push(`the page does not name the tool ${name}`);
      for (const action of actions) if (!ctx.html.includes(`action=${action}`)) missing.push(`the page does not name action=${action}`);
      if (tools.length !== 1) missing.push(`the extension now holds ${tools.length} tools (${tools.join(", ")})`);
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: ${tools.length} tool(s) [${tools.join(", ")}], actions [${actions.join(", ")}]`, missing.join("; "));
      return ok(`one tool "${tools[0]}", actions ${actions.map((a) => `action=${a}`).join(" and ")}`);
    },
  },
  {
    // The memory tool reaches three stores through different actions. Saying one
    // action crosses all three is the failure this row exists to catch.
    id: "memory-actions",
    claim: "the memory sentence names the action that reads each store",
    anchor: "reads the semantic store",
    section: "memory",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/memory/memory-agent-bridge/memory-tool.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const block = src.match(/action:\s*StringEnum\(\s*\[([\s\S]*?)\]\s*,/);
      if (!block) return unchecked(`no action enum in ${relativeTo(ctx.source, file)}`);
      const actions = new Set([...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
      const required = ["recall_search", "episodes_search", "heuristics_list"];
      const absent = required.filter((action) => !actions.has(action));
      if (absent.length) return unchecked(`the action enum no longer holds ${absent.join(", ")} (${relativeTo(ctx.source, file)})`);
      const missing = [];
      for (const action of required) if (!ctx.html.includes(action)) missing.push(`the page does not name ${action}`);
      for (const stale of ["All three stores are cross-searchable", "Все три хранилища доступны для кросс-поиска"]) {
        if (ctx.html.includes(stale)) missing.push(`the page still says ${JSON.stringify(stale)}`);
      }
      if (missing.length) return moved(`one action per store: ${required.join(", ")} (${relativeTo(ctx.source, file)})`, missing.join("; "));
      return ok(`${required.length} actions named, one per store`);
    },
  },
  {
    // Authoring and measuring are separate procedures. The page attributed both
    // to one skill; the row reads which skill owns the file.
    id: "skill-split",
    claim: "the meta-improvement sentence leaves writing a skill to skill-authoring",
    anchor: "skill-authoring writes",
    section: "longloop",
    check(ctx) {
      const core = join(ctx.source, "packages/core/skills");
      const meta = readText(join(core, "meta-improvement/SKILL.md"));
      const author = readText(join(core, "skill-authoring/SKILL.md"));
      if (meta === null || author === null) return unchecked(`cannot read both ${relativeTo(ctx.source, core)}/meta-improvement/SKILL.md and skill-authoring/SKILL.md`);
      if (!/not for authoring/i.test(meta)) return unchecked("meta-improvement's description no longer says what it does not do, so the split cannot be read from it");
      const missing = [];
      if (!ctx.html.includes("meta-improvement")) missing.push("the page does not name meta-improvement");
      if (!ctx.html.includes("skill-authoring")) missing.push("the page does not name skill-authoring");
      for (const stale of ["meta-improvement creates and revises skills", "meta-improvement создаёт и пересматривает навыки"]) {
        if (ctx.html.includes(stale)) missing.push(`the page still says ${JSON.stringify(stale)}`);
      }
      if (missing.length) return moved("meta-improvement measures; skill-authoring writes the file (packages/core/skills/*/SKILL.md)", missing.join("; "));
      return ok("both procedures named, and the measuring one still disclaims authoring");
    },
  },
  {
    // A skill index is prose that names directories. Every name must resolve, or
    // a reader is sent to a skill that does not exist.
    id: "skill-names",
    claim: "every skill the index prints is a directory in one of the two packs",
    anchor: "The index below is a selection",
    section: "skills",
    check(ctx) {
      const core = join(ctx.source, "packages/core/skills");
      const satellite = join(ctx.source, "packages/skills/skills");
      if (!existsSync(core) || !existsSync(satellite)) return unchecked(`cannot read ${relativeTo(ctx.source, core)} and ${relativeTo(ctx.source, satellite)}`);
      const dirs = (root) => readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
      const known = new Set([...dirs(core), ...dirs(satellite).filter((name) => name !== "_shared")]);
      const listed = listedSkills();
      if (listed.length === 0) return unchecked("the page prints no skill index");
      const missing = [];
      for (const name of listed) {
        if (!known.has(name)) missing.push(`${name} (line ${lineOfPattern(new RegExp(`<span class="tn">[^<]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^<]*<\\/span>`))})`);
      }
      if (missing.length) return moved(`directories in ${relativeTo(ctx.source, core)} and ${relativeTo(ctx.source, satellite)}`, `names that resolve to no directory: ${missing.join(", ")}`);
      return ok(`${listed.length} names, all resolving to a directory`);
    },
  },
  {
    // The page used to imply its index was the whole library, so the sentence
    // must call itself a selection, and the census is what decides whether that
    // is still the true word.
    id: "skill-census",
    claim: "the index calls itself a selection, and the two packs hold more procedures than it lists",
    anchor: "The index below is a selection",
    section: "skills",
    check(ctx) {
      const core = join(ctx.source, "packages/core/skills");
      const satellite = join(ctx.source, "packages/skills/skills");
      if (!existsSync(core) || !existsSync(satellite)) return unchecked(`cannot read ${relativeTo(ctx.source, core)} and ${relativeTo(ctx.source, satellite)}`);
      const count = (root, skip) => readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !skip.includes(e.name)).length;
      const census = count(core, []) + count(satellite, ["_shared"]);
      const listed = listedSkills().length;
      const missing = [];
      if (!/selection, not a census/.test(ctx.html)) missing.push("the English lede does not call the index a selection");
      if (!/выборка, а не перепись/.test(ctx.html)) missing.push("the Russian lede does not call the index a selection");
      if (listed >= census) missing.push(`the index lists ${listed} of ${census} procedures, so "selection" is no longer true`);
      if (missing.length) return moved(`the two packs hold ${census} procedure directories; the index lists ${listed}`, missing.join("; "));
      return ok(`${listed} listed of ${census} directories, so the index is a selection`);
    },
  },
  {
    // A settings path is correct when pi's own resolver returns a path that
    // exists. `file:` is not a scheme the resolver strips; a leading `~` is.
    id: "install-path",
    claim: "the settings snippet holds path forms pi resolves",
    anchor: "\"packages\"",
    section: "install",
    check(ctx) {
      const snippet = ctx.html.match(/<pre class="shell" style="margin-top:1rem">([\s\S]*?)<\/pre>/);
      if (!snippet) return unchecked("the page carries no settings snippet");
      const text = snippet[1].replace(/<[^>]*>/g, "");
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return moved("a settings snippet that parses as JSON", `it does not parse: ${error.message}`);
      }
      const entries = Array.isArray(parsed.packages) ? parsed.packages : null;
      if (!entries || entries.length === 0) return moved("a non-empty packages array", "the snippet declares no packages");
      if (!ctx.resolvePath) return unchecked("pi's resolver was not found, so no path can be settled");
      const missing = [];
      for (const entry of entries) {
        if (typeof entry !== "string") { missing.push(`${JSON.stringify(entry)} is not a string`); continue; }
        if (/^file:/i.test(entry)) {
          missing.push(`${JSON.stringify(entry)}: pi strips file: only for a file:// URL, so this resolves to a path under the agent directory`);
        }
        const resolved = ctx.resolvePath(entry, ctx.agentDir, { homeDir: HOME, trim: true });
        const expected = entry.startsWith("~/") ? join(HOME, entry.slice(2)) : entry;
        if (entry.startsWith("~/") && resolved !== expected) missing.push(`${JSON.stringify(entry)} resolves to ${resolved}, not ${expected}`);
        if (resolved.includes("file:")) missing.push(`${JSON.stringify(entry)} resolves to ${resolved}, which contains the unparsed scheme`);
        const parts = entry.replace(/^~\//, "").split("/");
        if (parts[1] !== "packages") missing.push(`${JSON.stringify(entry)} points at no workspace under the checkout`);
        else if (!existsSync(join(ctx.source, "packages", parts[2]))) missing.push(`${JSON.stringify(entry)}: this checkout has no packages/${parts[2]}`);
      }
      if (missing.length) return moved("entries pi resolves to a checkout's packages/core and packages/skills", missing.join("; "));
      return ok(`${entries.length} entries resolve through pi's own resolvePath`);
    },
  },
  {
    // The page describes the render gate that measured it. The count of viewports
    // is read from that gate, which lives on a build branch of this repository
    // rather than in the published tree.
    id: "render-probes",
    claim: "the probes line states the viewport count the render gate measured",
    anchor: "render probes at",
    section: "built",
    check(ctx) {
      const found = renderGate(ctx);
      if (found.state) return found;
      const count = found.viewports.length;
      const desktop = found.viewports.filter((name) => name.startsWith("desktop")).length;
      const missing = [];
      const enCount = EN_NUMBER[count];
      const enDesktop = EN_NUMBER[desktop];
      if (!enCount || !enDesktop) return unchecked(`the render gate measures ${count} viewports (${desktop} desktop), and this gate has no word for that count`);
      if (!ctx.html.includes(`at ${enCount} viewport`)) missing.push(`the English line does not say "at ${enCount} viewport(s)"`);
      if (!ctx.html.includes(`${enDesktop} desktop width`)) missing.push(`the English line does not say "${enDesktop} desktop width(s)"`);
      if (!ctx.html.includes("tablet") || !ctx.html.includes("phone")) missing.push("the English line does not name tablet and phone");
      const ruLoc = RU_LOCATIVE[count];
      const ruNom = RU_NOMINATIVE[desktop];
      if (!ruLoc || !ruNom) return unchecked(`the render gate measures ${count} viewports (${desktop} desktop), and this gate has no Russian word for that count`);
      if (!ctx.html.includes(`на ${ruLoc} вьюпорт`)) missing.push(`the Russian line does not say "на ${ruLoc} вьюпорт(ах)"`);
      if (!ctx.html.includes(`${ruNom} ширины десктопа`)) missing.push(`the Russian line does not say "${ruNom} ширины десктопа"`);
      if (!ctx.html.includes("планшет") || !ctx.html.includes("телефон")) missing.push("the Russian line does not name планшет and телефон");
      if (missing.length) return moved(`the render gate measured ${count} viewports, ${desktop} of them desktop (${found.from})`, missing.join("; "));
      return ok(`${count} viewports, ${desktop} desktop, from ${found.from}`);
    },
  },
  {
    // The page prints three setting keys that decide what may enter the window,
    // and the rule that keeps the promise honest: a body is replaced only after
    // its flush is verified. Both halves are read, because a renamed key is as
    // stale as a rule that quietly stopped holding.
    id: "context-caps",
    claim: "the caps cells name the settings that decide them, and the stub follows a verified flush",
    anchor: "rules what one tool result may cost the window",
    section: "context",
    check(ctx) {
      const settings = join(ctx.source, "packages/core/src/lib/config/braid-settings.ts");
      const capture = join(ctx.source, "packages/core/src/extensions/memory/context-manager/handlers/toolresult-capture-cap.ts");
      const settingsSrc = readText(settings);
      const captureSrc = readText(capture);
      if (settingsSrc === null || captureSrc === null) return unchecked(`cannot read ${relativeTo(ctx.source, settings)} or ${relativeTo(ctx.source, capture)}`);
      const keys = ["braid.context.toolResultSizeCap", "braid.context.staleToolResultOffload", "braid.context.contextEmergencyOffload"];
      const missing = [];
      for (const key of keys) {
        if (!settingsSrc.includes(key)) missing.push(`${key} is not read in ${relativeTo(ctx.source, settings)}`);
        if (!ctx.html.includes(key)) missing.push(`the page does not name ${key}`);
      }
      // The rule is stated in prose, so the read strips the comment markers and
      // the line wrapping a source file breaks it with rather than requiring one
      // physical line.
      const captureProse = captureSrc.replace(/\/\/\s*/g, " ").replace(/\s+/g, " ");
      if (!/never stub without a verified flush/i.test(captureProse)) missing.push(`${relativeTo(ctx.source, capture)} no longer states the verified-flush rule`);
      if (!/stub that names the file/.test(ctx.html)) missing.push("the English cell does not say the stub names the file");
      if (!/заглушкой с именем файла/.test(ctx.html)) missing.push("the Russian cell does not say the stub names the file");
      if (missing.length) return moved(`cap keys ${keys.join(", ")} in ${relativeTo(ctx.source, settings)}, a capture cap that stubs only after a verified flush`, missing.join("; "));
      return ok(`${keys.length} cap keys read, and the verified-flush rule still holds`);
    },
  },
  {
    // A shell-free call bounds what it hands back. The page names the parameter
    // that does it and what a shortened stream reports; the tool is read for
    // those names, because a rename there leaves the sentence describing nothing.
    id: "run-output-cap",
    claim: "the run sentence names the tool's byte cap and what a truncated stream reports",
    anchor: "bounded at",
    section: "context",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/core/run-tool/index.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const missing = [];
      for (const name of ["argv", "max_output_bytes", "dropped_bytes"]) {
        if (!src.includes(name)) missing.push(`${relativeTo(ctx.source, file)} no longer declares ${name}`);
      }
      if (!ctx.html.includes("max_output_bytes")) missing.push("the page does not name max_output_bytes");
      if (!/keeps its head and its tail/.test(ctx.html)) missing.push("the English cell does not say a truncated stream keeps its head and tail");
      if (!/сохраняет начало и конец/.test(ctx.html)) missing.push("the Russian cell does not say a truncated stream keeps its head and tail");
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: argv, max_output_bytes, dropped_bytes`, missing.join("; "));
      return ok("argv, max_output_bytes and dropped_bytes, all three printed");
    },
  },
  {
    // The report's token classes are its whole arithmetic, and the page states the
    // attribution rule as the reason to trust a total. Both are read where they
    // are written: a dropped class or a changed rule makes the sentence wrong.
    id: "session-cost",
    claim: "the cost cell names the script, its token classes and the attribution rule the script applies",
    anchor: "splits its tokens by class",
    section: "context",
    check(ctx) {
      const file = join(ctx.source, "packages/core/scripts/session-cost-report.mjs");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const section = sectionHtml("context");
      const classes = ["input", "cacheRead", "cacheWrite", "output"];
      const missing = [];
      if (!section.includes("packages/core/scripts/session-cost-report.mjs")) missing.push("the page does not name the script");
      for (const field of classes) {
        if (!src.includes(field)) missing.push(`${relativeTo(ctx.source, file)} no longer records ${field}`);
        if (!section.includes(field)) missing.push(`the page does not print the class ${field}`);
      }
      if (!/proportional to the number of characters/.test(src)) missing.push(`${relativeTo(ctx.source, file)} no longer states its proportional attribution rule`);
      if (!/in proportion to the characters/.test(ctx.html)) missing.push("the English cell does not state the proportional rule");
      if (!/пропорционально их символам/.test(ctx.html)) missing.push("the Russian cell does not state the proportional rule");
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: classes ${classes.join("/")}, proportional attribution`, missing.join("; "));
      return ok(`classes ${classes.join("/")}, and the proportional rule stated in both languages`);
    },
  },
  {
    // The compression sentence lists the accepted modes by name, so the enum is the
    // deciding file in both directions: a mode added there is missing from the page,
    // and a mode the page prints that the tool does not accept is a door that does
    // not open. The near-ceiling refusal is read beside it.
    id: "compress-modes",
    claim: "the compression sentence names the modes the tool accepts, and no others",
    anchor: "takes <span class=\"mono\">action=compact</span>",
    section: "context",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/memory/context-manager/handlers/tools/context-compress.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const block = src.match(/enum:\s*\[([^\]]+)\]/);
      if (!block) return unchecked(`no action enum in ${relativeTo(ctx.source, file)}`);
      const modes = [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      const section = sectionHtml("context");
      const missing = [];
      for (const mode of modes) if (!section.includes(`action=${mode}`)) missing.push(`the page does not name action=${mode}`);
      for (const mode of new Set([...section.matchAll(/action=([a-z_]+)/g)].map((m) => m[1]))) {
        if (!modes.includes(mode)) missing.push(`the page prints action=${mode}, which the tool does not accept`);
      }
      if (!/suggestion:\s*\{\s*tool:\s*"context_compress",\s*action:\s*"slide"\s*\}/.test(src)) missing.push(`${relativeTo(ctx.source, file)} no longer offers the deterministic mode at the ceiling`);
      if (!/refuses a model-driven compaction/.test(ctx.html)) missing.push("the English paragraph does not state the refusal");
      if (!/отказывает в сжатии моделью/.test(ctx.html)) missing.push("the Russian paragraph does not state the refusal");
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: ${modes.join(", ")}, and a slide suggestion at the ceiling`, missing.join("; "));
      return ok(`${modes.map((m) => `action=${m}`).join(", ")}, and the ceiling refusal`);
    },
  },
  {
    // The page promises one envelope per turn. That is a fixed detail of the tick
    // rather than a count, so it is read where the merge is written.
    id: "lifecycle-envelope",
    claim: "the lifecycle line states the per-turn merge, and the tick still merges",
    anchor: "one whisper envelope",
    section: "context",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/memory/context-lifecycle/index.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const missing = [];
      if (!src.includes("merged_proposals")) missing.push(`${relativeTo(ctx.source, file)} no longer merges a tick's proposals`);
      if (!/one whisper envelope/.test(ctx.html)) missing.push("the English line does not say one envelope");
      if (!/в одном конверте шёпота/.test(ctx.html)) missing.push("the Russian line does not say one envelope");
      if (missing.length) return moved(`merged_proposals in ${relativeTo(ctx.source, file)}`, missing.join("; "));
      return ok("merged_proposals present, and the page says one envelope per turn");
    },
  },
  {
    // The registry's vocabularies are named on the page and rendered from one
    // table, so each role string is read from that table. The two devices the
    // paragraph promises beside them - an exactly-once admission and a population
    // read before a merge - are read where they are implemented.
    id: "orchestrator-vocabularies",
    claim: "the worker paragraph names the lifecycle vocabularies and the devices that refuse a bad close",
    anchor: "keeps its vocabularies apart",
    section: "pool",
    check(ctx) {
      const lib = join(ctx.source, "packages/core/src/lib/orchestrator/workers.ts");
      const tool = join(ctx.source, "packages/core/src/extensions/orchestrator/index.ts");
      const libSrc = readText(lib);
      const toolSrc = readText(tool);
      if (libSrc === null || toolSrc === null) return unchecked(`cannot read ${relativeTo(ctx.source, lib)} or ${relativeTo(ctx.source, tool)}`);
      const block = libSrc.match(/export const WORKER_STATUS_LAYERS[\s\S]*?\n\];/);
      if (!block) return unchecked(`no WORKER_STATUS_LAYERS table in ${relativeTo(ctx.source, lib)}`);
      const roles = [...block[0].matchAll(/role:\s*"([a-z ]+)"/g)].map((m) => m[1]);
      if (roles.length === 0) return unchecked(`WORKER_STATUS_LAYERS declares no role row in ${relativeTo(ctx.source, lib)}`);
      const missing = [];
      for (const role of roles) if (!ctx.html.includes(role)) missing.push(`the page does not name the vocabulary "${role}"`);
      if (!/exactly-once/.test(toolSrc)) missing.push(`${relativeTo(ctx.source, tool)} no longer states exactly-once admission`);
      if (!ctx.html.includes("exactly-once")) missing.push("the page does not say an admission is exactly-once");
      if (!/compared against the census/.test(toolSrc)) missing.push(`${relativeTo(ctx.source, tool)} no longer documents the census read`);
      if (!/census of the revision it names/.test(ctx.html)) missing.push("the page does not say the file row is read against the revision's census");
      if (missing.length) return moved(`vocabularies ${roles.join(", ")} from ${relativeTo(ctx.source, lib)}`, missing.join("; "));
      return ok(`${roles.join(", ")} named; exactly-once and the census read intact`);
    },
  },
  {
    // The adoption cell names the counters, so the interface that returns them is
    // the deciding file. The durable file's name and the tool that serves it are
    // read too: a counter is only evidence if both still exist.
    id: "skill-counters",
    claim: "the adoption cell names the counter surface, its durable file and the counters it returns",
    anchor: "durable per-skill record",
    section: "longloop",
    check(ctx) {
      const auto = join(ctx.source, "packages/core/src/extensions/core/skills-tool/auto-inject.ts");
      const tool = join(ctx.source, "packages/core/src/extensions/core/skills-tool/index.ts");
      const paths = join(ctx.source, "packages/core/src/lib/config/braid-paths.ts");
      const autoSrc = readText(auto);
      const toolSrc = readText(tool);
      const pathsSrc = readText(paths);
      if (autoSrc === null || toolSrc === null || pathsSrc === null) return unchecked(`cannot read ${relativeTo(ctx.source, auto)}, ${relativeTo(ctx.source, tool)} or ${relativeTo(ctx.source, paths)}`);
      const iface = autoSrc.match(/export interface DurableSkillStats \{([\s\S]*?)\n\}/);
      if (!iface) return unchecked(`no DurableSkillStats interface in ${relativeTo(ctx.source, auto)}`);
      const declared = new Set([...iface[1].matchAll(/^\s*([a-z][A-Za-z]*):/gm)].map((m) => m[1]));
      const counters = ["suggested", "loaded", "claimed", "actual", "reloads"];
      const missing = [];
      for (const counter of counters) {
        if (!declared.has(counter)) missing.push(`DurableSkillStats no longer declares ${counter}`);
        if (!ctx.html.includes(counter)) missing.push(`the page does not name the counter ${counter}`);
      }
      if (!toolSrc.includes("skill_stats")) missing.push(`${relativeTo(ctx.source, tool)} no longer registers skill_stats`);
      if (!pathsSrc.includes("skills-usage.json")) missing.push(`${relativeTo(ctx.source, paths)} no longer names skills-usage.json`);
      for (const name of ["skill_stats", "skills-usage.json"]) if (!ctx.html.includes(name)) missing.push(`the page does not name ${name}`);
      if (missing.length) return moved(`skill_stats, skills-usage.json, counters ${counters.join("/")}`, missing.join("; "));
      return ok(`skill_stats, skills-usage.json and the counters ${counters.join("/")}`);
    },
  },
  {
    // The verdict list is a closed vocabulary the packs actually use. Printing a
    // value no directory carries sends a reader looking for nothing; leaving one
    // out hides a bucket that exists. The tombstone sentence is read from the
    // tombstone, because a merged skill that stops naming its successor is how a
    // reader ends up nowhere.
    id: "skill-verdicts",
    claim: "the verdict list is the set the two packs use, and the merged one still names its successor",
    anchor: "carries a verdict in its front matter",
    section: "skills",
    check(ctx) {
      const roots = [join(ctx.source, "packages/core/skills"), join(ctx.source, "packages/skills/skills")];
      const used = new Set();
      for (const root of roots) {
        if (!existsSync(root)) return unchecked(`cannot read ${relativeTo(ctx.source, root)}`);
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const src = readText(join(root, entry.name, "SKILL.md"));
          const match = src && src.match(/^verdict:\s*([A-Z]+)\s*$/m);
          if (match) used.add(match[1]);
        }
      }
      if (used.size === 0) return unchecked("no SKILL.md in either pack states a verdict");
      const en = ctx.html.match(/verdict in its front matter \(([^)]+)\)/);
      const ru = ctx.html.match(/вердикт во фронтматтере \(([^)]+)\)/);
      if (!en) return moved(`verdicts in use: ${[...used].sort().join(", ")}`, "the English sentence prints no verdict list");
      const printed = en[1].split(",").map((value) => value.trim());
      const missing = [];
      for (const value of used) if (!printed.includes(value)) missing.push(`${value} is used by a skill and not printed`);
      for (const value of printed) if (!used.has(value)) missing.push(`${value} is printed and no skill carries it`);
      if (!ru) missing.push("the Russian sentence prints no verdict list");
      else for (const value of printed) if (!ru[1].includes(value)) missing.push(`the Russian list omits ${value}`);
      const tomb = readText(join(ctx.source, "packages/core/skills/code-search/SKILL.md"));
      if (tomb === null) missing.push("packages/core/skills/code-search/SKILL.md is gone, so the tombstone sentence is stale");
      else {
        if (!/^status:\s*merged\s*$/m.test(tomb)) missing.push("code-search no longer declares status: merged");
        if (!/^successor:\s*code-refactoring\s*$/m.test(tomb)) missing.push("code-search no longer names code-refactoring as its successor");
      }
      for (const name of ["code-search", "code-refactoring"]) if (!ctx.html.includes(name)) missing.push(`the page does not name ${name}`);
      if (missing.length) return moved(`verdicts in use: ${[...used].sort().join(", ")}`, missing.join("; "));
      return ok(`${[...used].sort().join(", ")} printed in both languages; code-search merged into code-refactoring`);
    },
  },
  {
    // The catalog read is described by what it answers and what it prices. The
    // tool's own description carries the price fields, so the row reads it and
    // requires the page to print the fields it claims.
    id: "list-skills-reach",
    claim: "the library note names the catalog read and the price it returns",
    anchor: "answers the whole catalog with each skill's reach",
    section: "skills",
    check(ctx) {
      const file = join(ctx.source, "packages/core/src/extensions/core/skills-tool/index.ts");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const missing = [];
      if (!src.includes('name: "list_skills"')) missing.push(`${relativeTo(ctx.source, file)} no longer defines list_skills`);
      const priced = ["reachable", "lines", "bytes", "estTokens", "sectionCount"];
      for (const field of priced) if (!src.includes(field)) missing.push(`the tool no longer prices ${field}`);
      for (const field of ["list_skills", "reach", "lines", "bytes", "estTokens"]) {
        if (!ctx.html.includes(field)) missing.push(`the page does not name ${field}`);
      }
      if (!/section map/.test(ctx.html)) missing.push("the English note does not name the section map");
      if (!/картой разделов/.test(ctx.html)) missing.push("the Russian note does not name the section map");
      if (missing.length) return moved(`list_skills pricing ${priced.join(", ")} in ${relativeTo(ctx.source, file)}`, missing.join("; "));
      return ok(`list_skills, priced by ${priced.join(", ")}`);
    },
  },
  {
    // A suggestion is decided by a model call, and the page says so. The ranker is
    // the deciding file: its caps, its counters and the call site are read, because
    // a page that promises a model decision would be describing a path that a
    // silent fallback to phrase matching would quietly replace.
    id: "suggestion-ranker",
    claim: "the delivery sentence names the utility model, and the ranker is still the path a suggestion takes",
    anchor: "A delivery is a decision, not a phrase match",
    section: "longloop",
    check(ctx) {
      const ranker = join(ctx.source, "packages/core/src/extensions/core/skills-tool/ranker.ts");
      const auto = join(ctx.source, "packages/core/src/extensions/core/skills-tool/auto-inject.ts");
      const rankerSrc = readText(ranker);
      const autoSrc = readText(auto);
      if (rankerSrc === null || autoSrc === null) return unchecked(`cannot read ${relativeTo(ctx.source, ranker)} or ${relativeTo(ctx.source, auto)}`);
      const missing = [];
      for (const name of ["RANKER_PROMPT_CHARS", "RANKER_MIN_PROMPT_CHARS", "RANKER_LIMIT"]) {
        if (!rankerSrc.includes(name)) missing.push(`${relativeTo(ctx.source, ranker)} no longer declares ${name}`);
      }
      for (const counter of ["ranked", "rankedCached", "rankedFailed", "lastFailure"]) {
        if (!rankerSrc.includes(counter)) missing.push(`${relativeTo(ctx.source, ranker)} no longer counts ${counter}`);
      }
      if (!/import \{ rankSkills \} from "\.\/ranker\.js"/.test(autoSrc)) missing.push(`${relativeTo(ctx.source, auto)} no longer imports the ranker`);
      if (!/await rankSkills\(/.test(autoSrc)) missing.push(`${relativeTo(ctx.source, auto)} no longer asks the ranker`);
      const section = sectionHtml("longloop");
      if (!/utility model/.test(section)) missing.push("the English cell does not name the utility model");
      if (!/utility-модели/.test(section)) missing.push("the Russian cell does not name the utility model");
      if (!/ranker/.test(section)) missing.push("the cell does not name the ranker's counters");
      if (!/goes silent/.test(section) || !/молчит/.test(section)) missing.push("the cell does not say a run without a model is silent");
      if (missing.length) return moved(`${relativeTo(ctx.source, ranker)}: rankSkills, its caps and its counters`, missing.join("; "));
      return ok("rankSkills at the call site, its caps and counters; the page says a model decides");
    },
  },
  {
    // The control cell makes three promises about the channel. Each is a file or a
    // call in the telegram package: the placement record, the chat-keyed tracker,
    // and the identity line every outbound body carries.
    id: "telegram-control",
    claim: "the control cell names the record a restart edits, the chat key and the sender line",
    anchor: "The message that carries it is a record on disk",
    section: "channel",
    check(ctx) {
      const paths = join(ctx.source, "packages/telegram/src/lib/state-paths.ts");
      const live = join(ctx.source, "packages/telegram/src/lib/notify/live-update.ts");
      const identity = join(ctx.source, "packages/telegram/src/lib/identity.ts");
      const outbound = join(ctx.source, "packages/telegram/src/lib/notify/outbound.ts");
      const sources = [paths, live, identity, outbound].map((file) => [file, readText(file)]);
      const unreadable = sources.filter(([, text]) => text === null).map(([file]) => relativeTo(ctx.source, file));
      if (unreadable.length) return unchecked(`cannot read ${unreadable.join(", ")}`);
      const [pathsSrc, liveSrc, identitySrc, outboundSrc] = sources.map(([, text]) => text);
      const missing = [];
      if (!pathsSrc.includes("control-message.json")) missing.push(`${relativeTo(ctx.source, paths)} no longer names control-message.json`);
      if (!/keyed by CHAT/.test(liveSrc)) missing.push(`${relativeTo(ctx.source, live)} no longer keys the tracked message by chat`);
      if (!/holders/.test(liveSrc)) missing.push(`${relativeTo(ctx.source, live)} no longer refcounts the holders`);
      if (!identitySrc.includes("renderIdentityLine")) missing.push(`${relativeTo(ctx.source, identity)} no longer renders the identity line`);
      if (!outboundSrc.includes("attachIdentity")) missing.push(`${relativeTo(ctx.source, outbound)} no longer attaches the identity line`);
      if (!/record on disk/.test(ctx.html)) missing.push("the English cell does not say the control is a record on disk");
      if (!/запись на диске/.test(ctx.html)) missing.push("the Russian cell does not say the control is a record on disk");
      if (!/keyed by chat/.test(ctx.html)) missing.push("the English cell does not say the progress message is keyed by chat");
      if (!/привязано к чату/.test(ctx.html)) missing.push("the Russian cell does not say the progress message is keyed by chat");
      if (!/naming the process that sent it/.test(ctx.html)) missing.push("the English cell does not say the sender is named");
      if (!/именем процесса, который его отправил/.test(ctx.html)) missing.push("the Russian cell does not say the sender is named");
      if (missing.length) return moved(`control-message.json, a chat-keyed tracker and attachIdentity in packages/telegram/src/lib`, missing.join("; "));
      return ok("placement record, chat-keyed tracker and identity line, all intact");
    },
  },
  {
    // The suite table names packages. A name that no workspace declares is a
    // package a reader cannot install, and a workspace the page never names is a
    // part of the suite the page forgot.
    id: "package-names",
    claim: "every package the page names is a workspace the root manifest declares, and every workspace is named",
    anchor: "A core and its satellites",
    section: "suite",
    check(ctx) {
      const root = readText(join(ctx.source, "package.json"));
      if (root === null) return unchecked(`cannot read ${relativeTo(ctx.source, join(ctx.source, "package.json"))}`);
      let manifest;
      try {
        manifest = JSON.parse(root);
      } catch (error) {
        return unchecked(`the root package.json does not parse: ${error.message}`);
      }
      const dirs = Array.isArray(manifest.workspaces) ? manifest.workspaces : [];
      if (dirs.length === 0) return unchecked("the root manifest declares no workspaces");
      const names = new Set();
      for (const dir of dirs) {
        const text = readText(join(ctx.source, dir, "package.json"));
        if (text === null) return unchecked(`cannot read ${dir}/package.json`);
        try {
          names.add(JSON.parse(text).name);
        } catch (error) {
          return unchecked(`${dir}/package.json does not parse: ${error.message}`);
        }
      }
      const printed = new Set([...ctx.html.matchAll(/\bpi-braid(?:-[a-z]+)?\b/g)].map((match) => match[0]));
      const missing = [];
      for (const name of printed) if (!names.has(name) && name !== manifest.name) missing.push(`the page names ${name}, which no workspace declares`);
      for (const name of names) if (!printed.has(name)) missing.push(`the workspace ${name} is not named on the page`);
      if (missing.length) return moved(`${relativeTo(ctx.source, join(ctx.source, "package.json"))}: ${[...names].sort().join(", ")}`, missing.join("; "));
      return ok(`${names.size} workspace names, all printed and all accounted for`);
    },
  },
  {
    // The page says CI runs the same chain the desk runs, and that a check living
    // outside the chain fails the build. The workflow and the gate that polices it
    // are read together: either alone would pass while the claim was false.
    id: "release-chain",
    claim: "the chain cell names the script CI runs, and the workflow runs no check of its own",
    anchor: "is the gate: lint, types",
    section: "release",
    check(ctx) {
      const ci = join(ctx.source, ".github/workflows/ci.yml");
      const chain = join(ctx.source, "packages/core/scripts/check-ci-chain.mjs");
      const ciSrc = readText(ci);
      const chainSrc = readText(chain);
      if (ciSrc === null || chainSrc === null) return unchecked(`cannot read ${relativeTo(ctx.source, ci)} or ${relativeTo(ctx.source, chain)}`);
      const runs = [...ciSrc.matchAll(/^\s*(?:-\s+)?run:\s*(.+)$/gm)].map((match) => match[1].trim());
      const missing = [];
      if (!runs.includes("npm run ci:check")) missing.push(`${relativeTo(ctx.source, ci)} no longer runs "npm run ci:check"`);
      for (const line of runs) {
        if (line === "npm run ci:check" || line.startsWith("npm ci") || line.startsWith("sudo apt-get install")) continue;
        missing.push(`${relativeTo(ctx.source, ci)} runs a command outside the chain: ${line}`);
      }
      if (!/ci:check/.test(chainSrc)) missing.push(`${relativeTo(ctx.source, chain)} no longer polices the chain`);
      if (!ctx.html.includes("npm run ci:check")) missing.push("the page does not name npm run ci:check");
      if (!/added to the workflow instead of the chain fails the build/.test(ctx.html)) missing.push("the English cell does not state the workflow-only check rule");
      if (!/добавленная в воркфлоу вместо цепочки, роняет сборку/.test(ctx.html)) missing.push("the Russian cell does not state the workflow-only check rule");
      if (missing.length) return moved(`${relativeTo(ctx.source, ci)} runs npm run ci:check; ${relativeTo(ctx.source, chain)} refuses a re-listed check`, missing.join("; "));
      return ok(`the workflow runs the chain only, and the chain gate reads it`);
    },
  },
  {
    // Trusted publishing is a property of the workflow, not a policy statement:
    // the permission block and the tag rule are the parts of it a reader can see.
    id: "release-oidc",
    claim: "the publish note names the credential exchange and the tag rule",
    anchor: "mints its credential from the run itself",
    section: "release",
    check(ctx) {
      const file = join(ctx.source, ".github/workflows/publish.yml");
      const src = readText(file);
      if (src === null) return unchecked(`cannot read ${file}`);
      const missing = [];
      if (!/id-token:\s*write/.test(src)) missing.push(`${relativeTo(ctx.source, file)} no longer requests the OIDC identity`);
      if (!/OIDC|trusted publishing/i.test(src)) missing.push(`${relativeTo(ctx.source, file)} no longer describes trusted publishing`);
      if (!/\$\{GITHUB_REF_NAME\}" != "v\$\{core\}/.test(src)) missing.push(`${relativeTo(ctx.source, file)} no longer refuses a tag that does not name the core version`);
      if (!/OIDC/.test(ctx.html)) missing.push("the page does not name OIDC");
      if (!/refuses a tag that does not/.test(ctx.html)) missing.push("the English cell does not state the tag rule");
      if (!/отказывает тегу, который её не называет/.test(ctx.html)) missing.push("the Russian cell does not state the tag rule");
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: id-token: write, trusted publishing, the tag check`, missing.join("; "));
      return ok("OIDC permission, trusted publishing and the tag check, all present");
    },
  },
  {
    // The ledger is a file whose shape is the promise: a commit and a per-file
    // digest for each published version. The page says what the ledger buys, so
    // the row reads the ledger's own entries and the script that compares them.
    id: "release-ledger",
    claim: "the ledger cell states what the file holds, and the file holds it",
    anchor: "release-ledger.json</span> holds",
    section: "release",
    check(ctx) {
      const file = join(ctx.source, "release-ledger.json");
      const text = readText(file);
      if (text === null) return unchecked(`cannot read ${file}`);
      let ledger;
      try {
        ledger = JSON.parse(text);
      } catch (error) {
        return moved("a ledger that parses as JSON", `it does not parse: ${error.message}`);
      }
      const entries = ledger && typeof ledger.entries === "object" && ledger.entries !== null ? Object.entries(ledger.entries) : [];
      if (entries.length === 0) return moved("ledger entries keyed by name@version", "the ledger holds no entry");
      const missing = [];
      const [key, entry] = entries[0];
      if (!/^[0-9a-f]{40}$/.test(entry.released_from || "")) missing.push(`the entry ${key} carries no commit`);
      const files = entry.files && typeof entry.files === "object" ? Object.entries(entry.files) : [];
      if (files.length === 0) missing.push(`the entry ${key} carries no per-file digest`);
      else if (!files.every(([, digest]) => /^[0-9a-f]{64}$/.test(digest))) missing.push(`an entry under ${key} carries a digest that is not a sha256`);
      const content = readText(join(ctx.source, "packages/core/scripts/check-release-content.mjs"));
      if (content === null) missing.push("packages/core/scripts/check-release-content.mjs is gone");
      const publish = readText(join(ctx.source, ".github/workflows/publish.yml"));
      if (publish === null) missing.push(".github/workflows/publish.yml is gone");
      else if (!publish.includes("--require-recorded")) missing.push("the publish workflow no longer requires a recorded version");
      if (!ctx.html.includes("release-ledger.json")) missing.push("the page does not name release-ledger.json");
      if (!/registry's own answer/.test(ctx.html)) missing.push("the English cell does not state the read-back");
      if (!/ответ самого реестра/.test(ctx.html)) missing.push("the Russian cell does not state the read-back");
      if (missing.length) return moved(`${relativeTo(ctx.source, file)}: ${entries.length} entries, each with a commit and a per-file digest`, missing.join("; "));
      return ok(`${entries.length} entries with a commit and per-file digests; publish reads a version back`);
    },
  },
  {
    // The sources table is the page's index of deciding files. A path that does
    // not exist sends a reader to a file that never answered, which is the failure
    // the table exists to prevent.
    id: "sources-exist",
    claim: "every file the sources table names exists in the checkout",
    anchor: "The deck points; the repository answers",
    section: "sources",
    check(ctx) {
      const section = sectionHtml("sources");
      if (!section) return unchecked("the page has no sources section");
      const printed = [...new Set([...section.matchAll(/<span class="mono">([^<]+)<\/span>/g)].map((match) => match[1].trim()))];
      const paths = printed.filter((entry) => !entry.includes("*") && !entry.includes(" "));
      if (paths.length === 0) return unchecked("the sources table prints no path");
      const missing = paths.filter((entry) => !existsSync(join(ctx.source, entry)));
      if (missing.length) return moved(`paths under ${ctx.source}`, `named but absent: ${missing.join(", ")}`);
      return ok(`${paths.length} paths, all present`);
    },
  },
  {
    // The page's closing promise is a claim about its own claims. Its first half
    // is checkable: the rows above are the claims, and each one is either read or
    // named unchecked. Its second half is the script that does the reading.
    id: "end-self-claim",
    claim: "the closing lede states what the page can promise, and the rows above keep it",
    anchor: "A name can move as well as a number",
    section: "end",
    check(ctx, prior) {
      const missing = [];
      if (!ctx.html.includes("Every claim names the file that decides it")) missing.push("the closing lede does not say the claim names its file");
      if (!/script beside this page/.test(ctx.html)) missing.push("the closing lede names no script beside the page");
      if (ctx.html.includes("carry paths instead of figures")) missing.push("the closing lede still says a path never moves");
      const contradicted = prior.filter((row) => row.result.state === "moved").map((row) => row.id);
      if (contradicted.length) missing.push(`the rows above contradict it: ${contradicted.join(", ")}`);
      if (missing.length) return moved("a promise the rows above can keep", missing.join("; "));
      return ok(`${prior.length} rows above hold`);
    },
  },
  {
    // The head describes the page to a search engine. It carried the same
    // absolute promise as the closing lede, so it carries the same correction.
    id: "head-self-claim",
    claim: "the page description promises only what the page can show",
    anchor: "A presentation about Braid",
    section: null,
    check(ctx, prior) {
      const description = ctx.html.match(/<meta name="description" content="([^"]*)">/);
      if (!description) return unchecked("the page carries no meta description");
      const missing = [];
      if (!description[1].includes("Every claim names the file")) missing.push("the description does not say the claim names its file");
      if (!/script beside this page/.test(description[1])) missing.push("the description names no script beside the page");
      const contradicted = prior.filter((row) => row.result.state === "moved").map((row) => row.id);
      if (contradicted.length) missing.push(`the rows above contradict it: ${contradicted.join(", ")}`);
      if (missing.length) return moved("a description that promises only what the rows can show", missing.join("; "));
      return ok(`${prior.length} rows above hold`);
    },
  },
];

const EN_NUMBER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const RU_LOCATIVE = [null, "одном", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми", "девяти", "десяти", "одиннадцати", "двенадцати"];
const RU_NOMINATIVE = [null, "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять", "десять", "одиннадцать", "двенадцать"];

// The render gate is not shipped: the published tree is the page and the checks
// that read it. The gate that measured the page lives on a build branch, so this
// reads the object without checking anything out. Two branches that disagree
// about the viewport list leave the row unsettled rather than picking one.
function renderGate(ctx) {
  if (ctx.contractPath) {
    const text = readText(ctx.contractPath);
    if (text === null) return unchecked(`cannot read ${ctx.contractPath}`);
    return parseViewports(text, ctx.contractPath);
  }
  const refs = spawnSync("git", ["-C", ctx.deckDir, "for-each-ref", "--format=%(refname)", "refs/heads"], { encoding: "utf8" });
  if (refs.status !== 0) return unchecked("this working tree is not a git repository, so no build branch can be read");
  const found = [];
  for (const ref of refs.stdout.split("\n").filter(Boolean)) {
    const exists = spawnSync("git", ["-C", ctx.deckDir, "cat-file", "-e", `${ref}:scripts/deck-gate.mjs`]);
    if (exists.status !== 0) continue;
    const show = spawnSync("git", ["-C", ctx.deckDir, "show", `${ref}:scripts/deck-gate.mjs`], { encoding: "utf8" });
    if (show.status === 0) found.push(parseViewports(show.stdout, `${ref}:scripts/deck-gate.mjs`));
  }
  if (found.length === 0) return unchecked("no local branch carries scripts/deck-gate.mjs; pass --contract <file> to name the render gate to read");
  if (found.some((entry) => entry.state)) return found.find((entry) => entry.state);
  const shapes = new Set(found.map((entry) => entry.viewports.join(",")));
  if (shapes.size > 1) return unchecked(`the build branches disagree about the viewport list (${[...shapes].join(" vs ")})`);
  return found[0];
}

function parseViewports(text, from) {
  const block = text.match(/viewports:\s*\[([\s\S]*?)\]/);
  if (!block) return unchecked(`no viewports array in ${from}`);
  const viewports = [...block[1].matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (viewports.length === 0) return unchecked(`the viewports array in ${from} names none`);
  return { viewports, from };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const source = findSource(opts);
const pi = findPi(opts);
const ctx = {
  html,
  deckDir,
  source,
  pi,
  contractPath: opts.contract ? resolve(opts.contract) : null,
  agentDir: process.env.PI_CODING_AGENT_DIR ? resolve(process.env.PI_CODING_AGENT_DIR) : join(HOME, ".pi/agent"),
  resolvePath: null,
};
if (pi && existsSync(join(pi, "dist/utils/paths.js"))) {
  try {
    const paths = await import(pathToFileURL(join(pi, "dist/utils/paths.js")).href);
    ctx.resolvePath = paths.resolvePath ?? null;
  } catch {
    ctx.resolvePath = null;
  }
}

const results = [];
for (const row of ROWS) {
  const prior = results.map((entry) => ({ id: entry.id, result: entry.result }));
  let result;
  try {
    result = await row.check(ctx, prior);
  } catch (error) {
    result = unchecked(`${error && error.message ? error.message : error}`);
  }
  results.push({ id: row.id, claim: row.claim, line: locate(row), result });
}

// A failure has to be findable. The sentence's own line is used when its text is
// still on the page; when the text a row looks for is what went missing, the
// enclosing spread's opening line is the next honest answer, and it says so.
function locate(row) {
  const direct = lineOf(row.anchor);
  if (direct !== null) return `line ${direct}`;
  if (row.section) {
    const head = lineOf(`<section class="spread" id="${row.section}">`);
    if (head !== null) return `line ${head} (section head)`;
  }
  return "line ?";
}

// ── Report ───────────────────────────────────────────────────────────────────

const bytes = statSync(opts.file).size;
console.log(`file:   ${opts.file} (${bytes} bytes, ${html.split("\n").length} lines)`);
console.log(`source: ${source}${existsSync(source) ? "" : "  (missing)"}`);
console.log(`pi:     ${pi ?? "(not found; the settings row cannot settle a path)"}`);
console.log("");
for (const entry of results) {
  const where = entry.line;
  if (entry.result.state === "ok") {
    console.log(`  ok         ${entry.id.padEnd(15)} ${where.padEnd(10)} ${entry.result.detail}`);
  } else if (entry.result.state === "moved") {
    console.log(`  FAIL       ${entry.id.padEnd(15)} ${where.padEnd(10)} ${entry.claim}`);
    console.log(`             expected: ${entry.result.expected}`);
    console.log(`             found:    ${entry.result.found}`);
  } else {
    console.log(`  unchecked  ${entry.id.padEnd(15)} ${where.padEnd(10)} ${entry.result.reason}`);
  }
}

const en = spanCount("en");
const ru = spanCount("ru");
console.log("");
console.log(`document: ${en} lang-en spans, ${ru} lang-ru spans${en === ru ? " (parity holds)" : " (PARITY BROKEN)"}`);

const checked = results.filter((entry) => entry.result.state === "ok").length;
const failures = results.filter((entry) => entry.result.state === "moved");
const unknown = results.filter((entry) => entry.result.state === "unchecked");
console.log(`checked ${checked} of ${results.length} claims, ${failures.length} moved, ${unknown.length} unchecked`);

if (failures.length > 0 || en !== ru) {
  console.log("RESULT: FAIL");
  process.exit(1);
}
if (unknown.length > 0) {
  console.log("RESULT: UNCHECKED");
  process.exit(3);
}
console.log("RESULT: PASS");
