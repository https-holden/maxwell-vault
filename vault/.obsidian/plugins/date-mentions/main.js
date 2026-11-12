const { Plugin, PluginSettingTab, Setting, EditorSuggest } = require("obsidian");

// Notion-style relative dates: type `@` and a word, get a popup with the resolved date,
// press Enter (or Tab) to replace the `@word` with it.
//
// Understood, in order of how likely you are to want them:
//   @today  @tomorrow  @yesterday  @now (date + time)
//   @monday .. @sunday      the next one coming (today counts if it is that day)
//   @next monday / @last monday / @next week / @last week / @next month / @last month
//   @+3  @-10  @3d  @2w     that many days (or weeks) from today
//   @2026-10-01             a literal date, pass-through in your chosen format
//
// The inserted text is `moment` formatted with the settings' format (YYYY-MM-DD by default) and
// can be wrapped as a [[wikilink]] so it points at the daily note of that day. If morning pages
// were written that day, the date links to them instead (see render), so they get the backlink.

const DEFAULTS = {
  trigger: "@",
  format: "YYYY-MM-DD",
  timeFormat: "YYYY-MM-DD HH:mm",
  wikilink: false,
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

module.exports = class DateMentions extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.registerEditorSuggest(new DateSuggest(this.app, this));
    this.addSettingTab(new DateMentionsSettings(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Every candidate for a query, best match first. Each is { label, date, time? }.
  candidates(query) {
    const q = query.trim().toLowerCase().replace(/\s+/g, " ");
    const m = () => window.moment();
    const all = [
      { label: "today", date: m() },
      { label: "tomorrow", date: m().add(1, "day") },
      { label: "yesterday", date: m().subtract(1, "day") },
      { label: "now", date: m(), time: true },
    ];
    for (let i = 0; i < 7; i++) {
      const name = DAYS[i];
      const upcoming = m().day(i);
      if (upcoming.isBefore(m(), "day")) upcoming.add(7, "days");
      all.push({ label: name, date: upcoming });
      all.push({ label: "next " + name, date: upcoming.clone().add(7, "days") });
      const past = m().day(i);
      if (!past.isBefore(m(), "day")) past.subtract(7, "days");
      all.push({ label: "last " + name, date: past });
    }
    all.push(
      { label: "next week", date: m().add(1, "week") },
      { label: "last week", date: m().subtract(1, "week") },
      { label: "next month", date: m().add(1, "month") },
      { label: "last month", date: m().subtract(1, "month") },
      { label: "next year", date: m().add(1, "year") },
      { label: "last year", date: m().subtract(1, "year") },
    );

    const out = [];

    // Offsets: +3, -10, 3d, 2w, 1m, in 3 days, 3 days ago
    let r;
    if ((r = q.match(/^([+-]?)(\d+)\s*(d|days?|w|weeks?|m|months?|y|years?)?$/))) {
      const n = Number(r[2]);
      const unit = (r[3] || "d")[0] === "d" ? "day" : (r[3][0] === "w" ? "week" : (r[3][0] === "m" ? "month" : "year"));
      const back = r[1] === "-";
      const date = back ? m().subtract(n, unit) : m().add(n, unit);
      out.push({ label: `${back ? "" : "in "}${n} ${unit}${n === 1 ? "" : "s"}${back ? " ago" : ""}`, date });
    } else if ((r = q.match(/^in\s+(\d+)\s*(d|days?|w|weeks?|m|months?|y|years?)?$/))) {
      const n = Number(r[1]);
      const unit = (r[2] || "d")[0] === "d" ? "day" : (r[2][0] === "w" ? "week" : (r[2][0] === "m" ? "month" : "year"));
      out.push({ label: `in ${n} ${unit}${n === 1 ? "" : "s"}`, date: m().add(n, unit) });
    } else if ((r = q.match(/^(\d+)\s*(d|days?|w|weeks?|m|months?|y|years?)?\s+ago$/))) {
      const n = Number(r[1]);
      const unit = (r[2] || "d")[0] === "d" ? "day" : (r[2][0] === "w" ? "week" : (r[2][0] === "m" ? "month" : "year"));
      out.push({ label: `${n} ${unit}${n === 1 ? "" : "s"} ago`, date: m().subtract(n, unit) });
    }

    // Literal dates: 2026-10-01, 10-01, 10/01
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(q)) {
      const d = window.moment(q, ["YYYY-M-D", "YYYY-MM-DD"], true);
      if (d.isValid()) out.push({ label: q, date: d });
    } else if ((r = q.match(/^(\d{1,2})[-/](\d{1,2})$/))) {
      const d = window.moment(`${m().year()}-${r[1]}-${r[2]}`, ["YYYY-M-D", "YYYY-MM-DD"], true);
      if (d.isValid()) out.push({ label: d.format("D MMMM"), date: d });
    }

    if (!q) return out.concat(all.slice(0, 4));
    const starts = all.filter((c) => c.label.startsWith(q));
    const words = all.filter((c) => !c.label.startsWith(q) && c.label.split(" ").some((w) => w.startsWith(q)));
    return out.concat(starts, words).slice(0, 12);
  }

  // Morning pages written on that day (frontmatter `type: morning-pages`, matched on `date`, or the
  // filename's YYYY-MM-DD prefix when `date` is missing), earliest first.
  morningPages(date) {
    const day = date.format("YYYY-MM-DD");
    const found = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || ![].concat(fm.type || []).includes("morning-pages")) continue;
      const when = fm.date ? String(fm.date).slice(0, 10) : file.basename.slice(0, 10);
      if (when === day) found.push(file);
    }
    return found.sort((a, b) => a.basename.localeCompare(b.basename));
  }

  // The date as text. If there are morning pages that day, the date links to them instead:
  //   one:   [[2026-09-25 11h19 BCN|2026-09-25]]
  //   more:  2026-09-25 ([[2026-09-25 11h19 BCN|11h19]], [[2026-09-25 18h42 BCN|18h42]])
  // Display text is only digits, so auto-alias leaves these links alone.
  render(candidate, sourcePath) {
    const { format, timeFormat, wikilink } = this.settings;
    const text = candidate.date.format(candidate.time ? timeFormat : format);
    const pages = candidate.time ? [] : this.morningPages(candidate.date);
    const link = (file, shown) => `[[${this.app.metadataCache.fileToLinktext(file, sourcePath)}|${shown}]]`;
    if (pages.length === 1) return link(pages[0], text);
    const plain = wikilink && !candidate.time ? `[[${text}]]` : text;
    if (pages.length === 0) return plain;
    const times = pages.map((f, i) => link(f, (f.basename.match(/\d{1,2}h\d{2}/) || [String(i + 1)])[0]));
    return `${plain} (${times.join(", ")})`;
  }
};

class DateSuggest extends EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.setInstructions([
      { command: "↑↓", purpose: "choose" },
      { command: "↵", purpose: "insert date" },
      { command: "esc", purpose: "dismiss" },
    ]);
  }

  onTrigger(cursor, editor) {
    const trigger = this.plugin.settings.trigger;
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    const at = line.lastIndexOf(trigger);
    if (at < 0) return null;
    // Must be at a word boundary, so emails and mid-word @ are left alone
    if (at > 0 && /[\w.]/.test(line[at - 1])) return null;
    const query = line.slice(at + trigger.length);
    if (query.length > 24 || /[\[\]()@]/.test(query)) return null;
    // A leading space is a normal "@ " and not a mention
    if (query.startsWith(" ")) return null;
    if (this.plugin.candidates(query).length === 0) return null;
    return {
      start: { line: cursor.line, ch: at },
      end: cursor,
      query,
    };
  }

  getSuggestions(context) {
    return this.plugin.candidates(context.query);
  }

  renderSuggestion(candidate, el) {
    el.addClass("date-mention-suggestion");
    el.createDiv({ text: capitalize(candidate.label), cls: "date-mention-label" });
    let when = candidate.date.format(candidate.time ? "ddd D MMM YYYY, HH:mm" : "ddd D MMM YYYY");
    const pages = candidate.time ? 0 : this.plugin.morningPages(candidate.date).length;
    if (pages) when += pages === 1 ? " · morning pages" : ` · ${pages} morning pages`;
    el.createDiv({ text: when, cls: "date-mention-date" });
  }

  selectSuggestion(candidate) {
    const { editor, start, end, file } = this.context;
    const text = this.plugin.render(candidate, file ? file.path : "");
    const after = editor.getLine(end.line).slice(end.ch);
    const pad = after.length === 0 || /^\s/.test(after) ? "" : " ";
    editor.replaceRange(text + pad, start, end);
    editor.setCursor({ line: start.line, ch: start.ch + text.length + pad.length });
    this.close();
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

class DateMentionsSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();
    const s = this.plugin.settings;
    new Setting(this.containerEl)
      .setName("Trigger")
      .setDesc("Character that opens the date popup. Only fires at the start of a word, so emails are ignored.")
      .addText((t) => t.setValue(s.trigger).onChange(async (v) => {
        s.trigger = v || "@";
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl)
      .setName("Date format")
      .setDesc("Moment format for the inserted date. YYYY-MM-DD matches the vault's daily note names.")
      .addText((t) => t.setValue(s.format).onChange(async (v) => {
        s.format = v || DEFAULTS.format;
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl)
      .setName("Time format")
      .setDesc("Used by @now.")
      .addText((t) => t.setValue(s.timeFormat).onChange(async (v) => {
        s.timeFormat = v || DEFAULTS.timeFormat;
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl)
      .setName("Insert as wikilink")
      .setDesc("Wrap the date in [[ ]] so it links to that day's daily note.")
      .addToggle((t) => t.setValue(s.wikilink).onChange(async (v) => {
        s.wikilink = v;
        await this.plugin.saveSettings();
      }));
  }
}
