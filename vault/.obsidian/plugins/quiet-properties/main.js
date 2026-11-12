const { Plugin, PluginSettingTab, Setting, MarkdownView } = require("obsidian");

// Notion-style properties box. A short list of keys stays visible; every other property, and a
// kept one with no value, is hidden behind a "Show N more" row under the box. Clicking the row
// (or the command) reveals everything, empties included so they can be filled; clicking again
// hides them. Each note starts hidden when opened. Display only: the frontmatter is never touched,
// so Bases, scripts and templates see every property as before.
//
// Obsidian redraws the properties box on every edit, so the tagging is redone from a
// MutationObserver on each box, not once per note.

const DEFAULTS = {
  visible: ["topics", "people", "rating", "start", "end"],
  excludeFolders: ["Templates"],
};

module.exports = class QuietProperties extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.observed = new WeakMap(); // container -> MutationObserver
    this.paths = new WeakMap(); // container -> path it was last tagged for

    const refresh = () => this.refreshAll();
    this.app.workspace.onLayoutReady(refresh);
    this.registerEvent(this.app.workspace.on("layout-change", refresh));
    this.registerEvent(this.app.workspace.on("file-open", refresh));
    this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
    this.registerEvent(this.app.metadataCache.on("changed", refresh));

    this.addCommand({
      id: "toggle",
      name: "Show or hide the hidden properties",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        view.containerEl.querySelectorAll(".metadata-container.qp-on").forEach((c) => this.toggle(c));
      },
    });

    this.addSettingTab(new QuietPropertiesSettings(this.app, this));
  }

  onunload() {
    document.querySelectorAll(".metadata-container").forEach((c) => {
      this.observed.get(c)?.disconnect();
      this.clear(c);
    });
  }

  refreshAll() {
    if (this.pending) return;
    // a timer, not requestAnimationFrame: frames don't run while the window is in the background
    this.pending = window.setTimeout(() => {
      this.pending = null;
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
        const view = leaf.view;
        view.containerEl.querySelectorAll(".metadata-container").forEach((c) => this.tag(c, view.file));
      });
    }, 0);
  }

  excluded(file) {
    return !file || this.settings.excludeFolders.some((f) => file.path === f || file.path.startsWith(f + "/"));
  }

  clear(container) {
    container.classList.remove("qp-on", "qp-open");
    container.querySelectorAll(".qp-hidden").forEach((el) => el.classList.remove("qp-hidden"));
    container.querySelector(".qp-toggle")?.remove();
  }

  observe(container, file) {
    if (this.observed.has(container)) return;
    const obs = new MutationObserver((records) => {
      // ignore our own row being added or relabelled
      if (records.every((r) => r.target.closest?.(".qp-toggle") || [...r.addedNodes, ...r.removedNodes].every((n) => n.classList?.contains("qp-toggle")))) return;
      this.refreshAll();
    });
    obs.observe(container, { childList: true, subtree: true });
    this.observed.set(container, obs);
    this.register(() => obs.disconnect());
  }

  tag(container, file) {
    if (this.excluded(file)) return this.clear(container);
    this.observe(container, file);

    // a different note in the same box starts hidden again
    if (this.paths.get(container) !== file.path) {
      container.classList.remove("qp-open");
      this.paths.set(container, file.path);
    }
    container.classList.add("qp-on");

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const keep = new Set(this.settings.visible);
    let hidden = 0;
    container.querySelectorAll(".metadata-property").forEach((el) => {
      const key = el.dataset.propertyKey;
      const hide = key !== undefined && (!keep.has(key) || isEmpty(fm[key])) && !el.contains(document.activeElement);
      el.classList.toggle("qp-hidden", hide);
      if (hide) hidden++;
    });

    let row = container.querySelector(".qp-toggle");
    if (!hidden) return row?.remove();
    if (!row) {
      row = createDiv({ cls: "qp-toggle" });
      row.addEventListener("click", () => this.toggle(container));
      const content = container.querySelector(".metadata-content");
      content?.insertBefore(row, content.querySelector(".metadata-add-button")); // null appends
      // adding a property while folded would add it out of sight
      container.querySelector(".metadata-add-button")?.addEventListener("click", () => container.classList.add("qp-open"), true);
    }
    const label = container.classList.contains("qp-open") ? `Hide ${hidden}` : `Show ${hidden} more`;
    if (row.textContent !== label) row.textContent = label;
  }

  toggle(container) {
    container.classList.toggle("qp-open");
    this.refreshAll();
  }
};

function isEmpty(v) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

class QuietPropertiesSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    const list = (name, desc, key) =>
      new Setting(containerEl).setName(name).setDesc(desc).addTextArea((t) =>
        t.setValue(s[key].join(", ")).onChange(async (v) => {
          s[key] = v.split(",").map((x) => x.trim()).filter(Boolean);
          await this.plugin.saveData(s);
          this.plugin.refreshAll();
        }));
    list("Always visible", "Property names shown without revealing, when they have a value. Comma separated.", "visible");
    list("Excluded folders", "Notes in these folders show every property. Comma separated.", "excludeFolders");
  }
}
