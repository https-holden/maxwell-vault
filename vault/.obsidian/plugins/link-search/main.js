const { Plugin } = require("obsidian");

// Obsidian's [[ popup matches note names fuzzily: the letters you type only have to appear in order,
// anywhere. "ammends" therefore matches any long name that happens to contain a, m, m, e, n, d, s,
// and a sentence accidentally wrapped in [[ ]] turns up for almost every query.
//
// This swaps that matcher for word search: the query is split on spaces and every word has to appear
// in the name (or alias) as a substring, in any order, ignoring case. "env var" finds
// "Environment variables" and "Variables of the environment", not "every evening".
//
// Only the note-name step is replaced. Headings (#), blocks (^), display text (|) and the empty query
// (recent notes) are Obsidian's own. It patches the link suggester's shared prototype, so the editor
// and every other [[ popup that uses it behave the same; unloading the plugin puts the original back.
//
// Recency: every note picked from the popup is remembered (data.json, last few picks per note). Notes
// picked lately get a score boost that fades over days, so a note linked three times today sits at the
// top of its matches, and on the empty query recently linked notes come before recently edited ones.

const KEEP_USES = 8; // picks remembered per note
const MAX_NOTES = 300; // notes remembered at all
const HALF_LIFE_DAYS = 3; // a pick's boost halves every this many days
const BOOST_PER_USE = 4; // a pick made just now
const BOOST_MAX = 9; // under the +10 of typing the exact name, so an exact name still wins
const DAY = 86400000;

module.exports = class LinkSearch extends Plugin {
  async onload() {
    this.recent = ((await this.loadData()) || {}).recent || {};
    this.registerEvent(this.app.vault.on("rename", (file, old) => this.moved(old, file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.moved(file.path, null)));
    this.app.workspace.onLayoutReady(() => this.patch());
  }

  onunload() {
    if (this.proto && this.original) this.proto.getFileSuggestions = this.original;
    if (this.selProto && this.originalSelect) this.selProto.selectSuggestion = this.originalSelect;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveData({ recent: this.recent }); }
  }

  // Recency boost for a path: each remembered pick adds BOOST_PER_USE, halving every HALF_LIFE_DAYS.
  boost(path, now) {
    const uses = this.recent[path];
    if (!uses) return 0;
    let b = 0;
    for (const t of uses) b += BOOST_PER_USE * Math.pow(0.5, (now - t) / DAY / HALF_LIFE_DAYS);
    return Math.min(b, BOOST_MAX);
  }

  used(path) {
    const uses = (this.recent[path] || []).concat(Date.now()).slice(-KEEP_USES);
    delete this.recent[path]; // re-insert so key order is oldest-first for pruning
    this.recent[path] = uses;
    const keys = Object.keys(this.recent);
    for (let i = 0; i < keys.length - MAX_NOTES; i++) delete this.recent[keys[i]];
    this.save();
  }

  moved(from, to) {
    if (!this.recent[from]) return;
    if (to) this.recent[to] = this.recent[from];
    delete this.recent[from];
    this.save();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveData({ recent: this.recent }); }, 2000);
  }

  patch() {
    const suggester = this.app.workspace.editorSuggest.suggests.find(
      (s) => s.suggestManager && typeof s.suggestManager.getFileSuggestions === "function"
    );
    if (!suggester) {
      console.warn("link-search: Obsidian's link suggester not found; leaving the popup as it is");
      return;
    }
    const proto = Object.getPrototypeOf(suggester.suggestManager);
    const original = proto.getFileSuggestions;
    const app = this.app;
    const plugin = this;
    this.proto = proto;
    this.original = original;
    proto.getFileSuggestions = async function (runnable, query) {
      const now = Date.now();
      if (!query.trim()) {
        // Obsidian scores the empty query by mtime; recently picked notes go above all of those.
        const out = await original.call(this, runnable, query);
        for (const r of out) {
          const b = plugin.boost(r.file ? r.file.path : r.path, now);
          if (b > 0.05) r.score = 1e14 + b;
        }
        return out;
      }
      const list = this.fileSuggestions || (this.fileSuggestions = app.metadataCache.getLinkSuggestions());
      return search(app, runnable, list, query, (path) => plugin.boost(path, now));
    };

    // Remember what gets picked. Headings and blocks count for their note.
    const selProto = Object.getPrototypeOf(suggester);
    const originalSelect = selProto.selectSuggestion;
    this.selProto = selProto;
    this.originalSelect = originalSelect;
    selProto.selectSuggestion = function (value, evt) {
      try {
        const path = value && (value.file ? value.file.path : value.type === "linktext" ? value.path : null);
        if (path) plugin.used(path);
      } catch (e) {
        console.warn("link-search: could not record pick", e);
      }
      return originalSelect.call(this, value, evt);
    };
  }
};

// Same result shapes as Obsidian's own getFileSuggestions, so its renderer and inserter work unchanged.
// `matches` index into what the renderer highlights: the alias for aliases, the link path otherwise.
function search(app, runnable, list, query, boost) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const item of list) {
    if (runnable && runnable.isCancelled && runnable.isCancelled()) return out;
    const file = item.file;
    if (!file) {
      const m = match(item.path, words);
      if (m) out.push({ type: "linktext", path: item.path, score: m.score - 0.5 + boost(item.path), matches: m.matches });
      continue;
    }
    const ignored = app.metadataCache.isUserIgnored(file.path);
    const penalty = (ignored ? -10 : 0) + boost(file.path);
    if (item.alias) {
      const m = match(item.alias, words);
      if (m) out.push({ type: "alias", alias: item.alias, file, path: item.path, score: m.score + penalty, matches: m.matches, downranked: ignored });
      continue;
    }
    // The note's own name first; the folder only counts if the name alone doesn't have every word.
    const base = item.path.slice(item.path.lastIndexOf("/") + 1);
    const offset = item.path.length - base.length;
    let m = match(base, words);
    if (m) m.matches = m.matches.map(([a, b]) => [a + offset, b + offset]);
    else if ((m = match(item.path, words))) m.score -= 1;
    if (m) out.push({ type: "file", file, path: item.path, score: m.score + penalty, matches: m.matches, downranked: ignored });
  }
  return out;
}

// Every word must be in `text`. Higher score is better: the whole name typed exactly, then words that
// start the name, then words that start a word in it, then shorter names.
function match(text, words) {
  const lower = text.toLowerCase();
  let score = 0;
  const ranges = [];
  for (const w of words) {
    const at = wordStart(lower, w);
    const i = at >= 0 ? at : lower.indexOf(w);
    if (i < 0) return null;
    score += i === 0 ? 3 : at >= 0 ? 2 : 0;
    ranges.push([i, i + w.length]);
  }
  if (lower === words.join(" ")) score += 10;
  score -= text.length / 1000;
  return { score, matches: merge(ranges) };
}

// First place `w` occurs at the start of a word in `lower`, or -1.
function wordStart(lower, w) {
  for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(lower[i - 1])) return i;
  }
  return -1;
}

function merge(ranges) {
  ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}
