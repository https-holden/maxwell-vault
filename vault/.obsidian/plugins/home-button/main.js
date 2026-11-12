const { Plugin, Notice, Keymap, moment } = require("obsidian");

const HOME = "Home";
const MORNING_TEMPLATE = "Templates/Morning Pages Template.md";
const JOURNAL_FOLDER = "Journal";
// Ribbon icons kept hidden. Obsidian stores this in workspace.json, which is per device,
// so a fresh copy of the vault would show them all. Ids are "plugin:title".
const RIBBON_HIDDEN = [
  "canvas:Create new canvas",
  "daily-notes:Open today's daily note",
  "templates:Insert template",
  "command-palette:Open command palette",
  "random-note:Open random note",
  "bases:Create new base",
  "templater-obsidian:Templater",
];


module.exports = class HomeButton extends Plugin {
  onload() {
    const el = this.addRibbonIcon("home", "Home", (evt) => this.goHome(Keymap.isModEvent(evt)));
    el.addClass("home-button-ribbon");

    this.addCommand({
      id: "open-home",
      name: "Open Home",
      callback: () => this.goHome(false),
    });

    // Templater's own "insert template" hotkey needs an active Markdown editor, so from the graph,
    // a Base or a sidebar it fails with "No active editor". This command always creates a fresh note
    // in Journal/ from the template; the template script then fills the empty note in place.
    this.addCommand({
      id: "new-morning-pages",
      name: "New morning pages entry",
      callback: () => this.newMorningPages(),
    });


    this.app.workspace.onLayoutReady(() => this.hideRibbonItems());
  }

  // Private API (workspace.leftRibbon); if it changes, the ribbon just shows everything
  hideRibbonItems() {
    const ribbon = this.app.workspace.leftRibbon;
    if (!ribbon?.items) return;
    let changed = false;
    for (const item of ribbon.items) {
      if (RIBBON_HIDDEN.includes(item.id) && !item.hidden) {
        item.hidden = true;
        changed = true;
      }
    }
    if (changed) ribbon.onChange(true);
  }

  async newMorningPages() {
    const templater = this.app.plugins.plugins["templater-obsidian"]?.templater;
    if (!templater) {
      new Notice("Templater is not enabled");
      return;
    }
    const template = this.app.vault.getAbstractFileByPath(MORNING_TEMPLATE);
    if (!template) {
      new Notice(`Template "${MORNING_TEMPLATE}" not found`);
      return;
    }
    const folder = this.app.vault.getAbstractFileByPath(JOURNAL_FOLDER) ?? undefined;
    await templater.create_new_note_from_template(
      template, folder, "Morning Pages " + moment().format("HHmmss"), true
    );
  }

  async goHome(newLeaf) {
    const file = this.app.metadataCache.getFirstLinkpathDest(HOME, "");
    if (!file) {
      new Notice(`Home note "${HOME}" not found`);
      return;
    }
    // Reuse a tab that already shows the hub instead of stacking copies. Either way it opens in Reading view.
    if (!newLeaf) {
      const open = this.app.workspace
        .getLeavesOfType("markdown")
        .find((l) => l.view?.file?.path === file.path);
      if (open) {
        await this.toReading(open);
        this.app.workspace.setActiveLeaf(open, { focus: true });
        return;
      }
    }
    // Always open in the main area: when a sidebar tab (Bookmarks, Search) was the last thing clicked,
    // the "current" leaf can be that sidebar tab, and opening there replaces it with the note.
    const ws = this.app.workspace;
    let leaf = newLeaf ? null : ws.getMostRecentLeaf(ws.rootSplit);
    if (!leaf || leaf.getRoot() !== ws.rootSplit || leaf.getViewState().pinned) leaf = ws.getLeaf("tab");
    await leaf.openFile(file, { state: { mode: "preview" } });
    ws.setActiveLeaf(leaf, { focus: true });
  }

  // The hub is for reading: always land in Reading view, even on a tab left in editing
  async toReading(leaf) {
    const vs = leaf.getViewState();
    if (vs.state?.mode === "preview") return;
    await leaf.setViewState({ ...vs, state: { ...vs.state, mode: "preview" } });
  }
};
