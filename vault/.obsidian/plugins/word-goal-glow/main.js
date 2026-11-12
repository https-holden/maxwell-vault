'use strict';
const obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
  defaultGoal: 0,                 // 0 = no goal unless a rule or property applies
  frontmatterKey: 'word-goal',
  rules: [
    { folder: 'Journal', goal: 750 },
    { folder: 'Projects/Desert Girl', goal: 1000 },
  ],
  duration: 4,                    // seconds
  colorLight: 'rgba(82, 39, 186, 0.45)',   // Violet Bone ultraviolet #5227ba
  colorDark: 'rgba(163, 155, 242, 0.50)',  // lifted violet #a39bf2
  showStatusBar: true,
  showNotice: false,
  hysteresis: 25,                 // words below goal before it can fire again
};

function countWords(text) {
  // strip YAML frontmatter
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) text = text.slice(end + 4);
  }
  // strip the Sky Ephemeris block (```sky ... ```): the sky is not the writing
  text = text.replace(/^```sky[^\n]*\n[\s\S]*?^```[ \t]*$/gmu, '');
  // comments are not the writing either
  text = text.replace(/%%[\s\S]*?%%/g, '').replace(/<!--[\s\S]*?-->/g, '');
  // links count as the text you see: [[target|shown]] -> shown, [text](url) -> text;
  // embeds (![[...]], ![alt](url)) and bare URLs count as nothing
  text = text.replace(/!\[\[[^\]\n]*\]\]/g, ' ')
    .replace(/\[\[([^\]|\n]*)(?:\|([^\]\n]*))?\]\]/g, (_, target, shown) => ' ' + (shown ?? target) + ' ')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, ' $1 ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ');
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return m ? m.length : 0;
}

class WordGoalGlowPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.reached = new Map();   // file path -> boolean
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('wgg-status');

    const check = obsidian.debounce(() => this.check(), 300, true);
    this.registerEvent(this.app.workspace.on('editor-change', check));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.onOpen()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.onOpen()));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      const active = this.app.workspace.getActiveFile();
      if (active && file.path === active.path) check();
    }));

    this.addCommand({ id: 'preview-glow', name: 'Preview the glow', callback: () => this.glow() });
    this.addCommand({ id: 'reset-note', name: 'Reset goal for this note (glow again on next crossing)', callback: () => {
      const f = this.app.workspace.getActiveFile();
      if (f) { this.reached.delete(f.path); new obsidian.Notice('Word goal reset'); }
    }});
    this.addCommand({ id: 'set-note-goal', name: 'Set word goal for this note', callback: () => this.promptGoal() });

    // ProZen fullscreens the leaf, which hides the status bar, so zen gets its own counter
    this.registerDomEvent(document, 'fullscreenchange', () => this.onOpen());

    this.addSettingTab(new WordGoalGlowSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.onOpen());
  }

  onunload() { document.querySelectorAll('.wgg-overlay, .wgg-zen-count').forEach(e => e.remove()); document.body.removeClass('wgg-own-count'); }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); this.check(); }

  activeView() { return this.app.workspace.getActiveViewOfType(obsidian.MarkdownView); }

  // Artist's Way assignment pages (`type: exercise`) carry the book's instructions above `## Response`;
  // only the response is the writing, so only it is counted, and the count replaces core's word count.
  isExercise(file) {
    const fm = file && this.app.metadataCache.getFileCache(file)?.frontmatter;
    return !!fm && [].concat(fm.type ?? []).some(t => String(t) === 'exercise');
  }

  wordsIn(file, text) {
    if (this.isExercise(file)) {
      const m = text.match(/^## Response[ \t]*$/m);
      text = m ? text.slice(m.index + m[0].length) : '';
    }
    return countWords(text);
  }

  goalFor(file) {
    if (!file) return 0;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const key = this.settings.frontmatterKey;
    if (fm && fm[key] !== undefined && fm[key] !== null && fm[key] !== '') {
      const g = Number(fm[key]);
      return isNaN(g) ? 0 : g;
    }
    let best = null;
    for (const r of this.settings.rules) {
      const folder = (r.folder || '').replace(/^\/+|\/+$/g, '');
      if (!folder) continue;
      if (file.path === folder || file.path.startsWith(folder + '/')) {
        if (!best || folder.length > best.folder.length) best = { folder, goal: Number(r.goal) || 0 };
      }
    }
    return best ? best.goal : (Number(this.settings.defaultGoal) || 0);
  }

  // On opening a note that is already past its goal, don't fire; just mark it reached.
  onOpen() {
    const view = this.activeView();
    const file = view?.file;
    if (!file) { this.statusEl.setText(''); this.updateZen(0, 0); document.body.removeClass('wgg-own-count'); return; }
    const goal = this.goalFor(file);
    const words = this.wordsIn(file, view.editor.getValue());
    if (goal > 0 && !this.reached.has(file.path)) this.reached.set(file.path, words >= goal);
    this.updateStatus(words, goal, file);
  }

  check() {
    const view = this.activeView();
    const file = view?.file;
    if (!file) return;
    const goal = this.goalFor(file);
    const words = this.wordsIn(file, view.editor.getValue());
    this.updateStatus(words, goal, file);
    if (goal <= 0) return;
    const was = this.reached.get(file.path) || false;
    if (!was && words >= goal) {
      this.reached.set(file.path, true);
      this.glow(view);
      if (this.settings.showNotice) new obsidian.Notice(`${goal} words. Goal reached.`);
    } else if (was && words < goal - this.settings.hysteresis) {
      this.reached.set(file.path, false);
    }
  }

  updateStatus(words, goal, file) {
    this.updateZen(words, goal);
    const own = this.isExercise(file);
    document.body.toggleClass('wgg-own-count', own);
    if (own && goal <= 0) { this.statusEl.setText(`${words} ${words === 1 ? 'word' : 'words'}`); this.statusEl.removeClass('wgg-reached'); return; }
    if (!this.settings.showStatusBar || goal <= 0) { this.statusEl.setText(''); this.statusEl.removeClass('wgg-reached'); return; }
    this.statusEl.setText(`${words} / ${goal}`);
    this.statusEl.toggleClass('wgg-reached', words >= goal);
  }

  // Bottom-right "words / goal" inside the fullscreen leaf, only while in zen and the note has a goal.
  updateZen(words, goal) {
    const host = document.fullscreenElement;
    const inZen = !!host && !!host.closest('.workspace-leaf');
    document.querySelectorAll('.wgg-zen-count').forEach(e => { if (!inZen || goal <= 0 || e.parentElement !== host) e.remove(); });
    if (!inZen || goal <= 0) return;
    let el = host.querySelector(':scope > .wgg-zen-count');
    if (!el) el = host.createDiv({ cls: 'wgg-zen-count' });
    el.setText(`${words} / ${goal}`);
    el.toggleClass('wgg-reached', words >= goal);
  }

  glow(view) {
    view = view || this.activeView();
    // The overlay lives inside the leaf so it is visible when ProZen fullscreens the leaf.
    const host = view ? view.containerEl : document.body;
    let overlay = host.querySelector(':scope > .wgg-overlay');
    if (!overlay) { overlay = host.createDiv({ cls: 'wgg-overlay' }); }
    overlay.style.setProperty('--wgg-color-light', this.settings.colorLight);
    overlay.style.setProperty('--wgg-color-dark', this.settings.colorDark);
    overlay.style.setProperty('--wgg-duration', `${this.settings.duration}s`);
    overlay.removeClass('wgg-active');
    void overlay.offsetWidth; // restart animation
    overlay.addClass('wgg-active');
    window.setTimeout(() => overlay.remove(), this.settings.duration * 1000 + 200);
  }

  async promptGoal() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const modal = new GoalModal(this.app, this.goalFor(file), async (goal) => {
      await this.app.fileManager.processFrontMatter(file, (fm) => { fm[this.settings.frontmatterKey] = goal; });
      this.reached.delete(file.path);
      new obsidian.Notice(`Word goal for this note: ${goal}`);
    });
    modal.open();
  }
}

class GoalModal extends obsidian.Modal {
  constructor(app, current, onSubmit) { super(app); this.current = current; this.onSubmit = onSubmit; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Word goal for this note' });
    const input = contentEl.createEl('input', { type: 'number', value: String(this.current || 750) });
    input.style.width = '100%';
    const submit = () => { const g = parseInt(input.value, 10); if (!isNaN(g)) { this.onSubmit(g); this.close(); } };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const btn = contentEl.createEl('button', { text: 'Save', cls: 'mod-cta' });
    btn.style.marginTop = '12px';
    btn.addEventListener('click', submit);
    input.focus(); input.select();
  }
  onClose() { this.contentEl.empty(); }
}

class WordGoalGlowSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Word Goal Glow' });
    containerEl.createEl('p', { text: 'A goal is found in this order: the note\'s word-goal property, then the most specific folder rule, then the default. Set the property to 0 to turn the goal off for one note.' });

    new obsidian.Setting(containerEl).setName('Default goal').setDesc('Applies to notes with no rule or property. 0 = none.')
      .addText(t => t.setValue(String(s.defaultGoal)).onChange(async v => { s.defaultGoal = parseInt(v, 10) || 0; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName('Frontmatter property').setDesc('Per-note override, e.g. word-goal: 500')
      .addText(t => t.setValue(s.frontmatterKey).onChange(async v => { s.frontmatterKey = v.trim() || 'word-goal'; await this.plugin.saveSettings(); }));

    containerEl.createEl('h3', { text: 'Folder rules' });
    containerEl.createEl('p', { text: 'Vault-relative folder path and the goal for notes inside it. Deeper folders win.' });
    const rulesEl = containerEl.createDiv();
    const render = () => {
      rulesEl.empty();
      s.rules.forEach((r, i) => {
        const row = rulesEl.createDiv({ cls: 'wgg-rule' });
        const f = row.createEl('input', { type: 'text', value: r.folder, placeholder: 'Folder, e.g. Journal' });
        const g = row.createEl('input', { type: 'number', value: String(r.goal), placeholder: 'Goal' });
        const del = row.createEl('button', { text: 'Remove' });
        f.addEventListener('change', async () => { r.folder = f.value.trim(); await this.plugin.saveSettings(); });
        g.addEventListener('change', async () => { r.goal = parseInt(g.value, 10) || 0; await this.plugin.saveSettings(); });
        del.addEventListener('click', async () => { s.rules.splice(i, 1); await this.plugin.saveSettings(); render(); });
      });
      const add = rulesEl.createEl('button', { text: 'Add rule' });
      add.addEventListener('click', () => { s.rules.push({ folder: '', goal: 1000 }); render(); });
    };
    render();

    containerEl.createEl('h3', { text: 'Glow' });
    new obsidian.Setting(containerEl).setName('Duration (seconds)')
      .addSlider(sl => sl.setLimits(1, 10, 0.5).setValue(s.duration).setDynamicTooltip().onChange(async v => { s.duration = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName('Color in light theme').setDesc('Any CSS color, e.g. rgba(82,39,186,0.45)')
      .addText(t => t.setValue(s.colorLight).onChange(async v => { s.colorLight = v.trim(); await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName('Color in dark theme')
      .addText(t => t.setValue(s.colorDark).onChange(async v => { s.colorDark = v.trim(); await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName('Preview').addButton(b => b.setButtonText('Glow now').onClick(() => this.plugin.glow()));

    containerEl.createEl('h3', { text: 'Other' });
    new obsidian.Setting(containerEl).setName('Show "words / goal" in the status bar')
      .addToggle(t => t.setValue(s.showStatusBar).onChange(async v => { s.showStatusBar = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName('Also show a notice when the goal is reached')
      .addToggle(t => t.setValue(s.showNotice).onChange(async v => { s.showNotice = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName('Re-arm margin (words)').setDesc('The glow fires once per crossing. If the count drops this many words below the goal, it can fire again.')
      .addText(t => t.setValue(String(s.hysteresis)).onChange(async v => { s.hysteresis = parseInt(v, 10) || 0; await this.plugin.saveSettings(); }));
  }
}

module.exports = WordGoalGlowPlugin;
