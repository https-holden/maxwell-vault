const { Plugin, PluginSettingTab, Setting, Notice, TFile, normalizePath } = require("obsidian");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Obsidian can't display HEIC (the iPhone photo format), so an iPhone photo pasted into a note shows as
// a broken embed. This converts it with macOS's own `sips`, scaled so the long side is at most
// `maxSize` pixels (a 4032px phone photo is 15 MB as PNG, about 5 MB at 2048px; notes show it at
// 224-360px anyway).
//
// Paste and drop: the HEIC never enters the vault. The converted file is saved where Obsidian would
// have put the attachment and its embed is inserted at the cursor (or drop point).
// Anything else (Finder, sync, the command): the HEIC is converted next to itself, links to it in notes
// are pointed at the new file, and the HEIC goes to the system Trash.

const DEFAULTS = { format: "png", maxSize: 2048, jpegQuality: 82 };
const HEIC = /\.(heic|heif)$/i;

module.exports = class HeicConvert extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new Settings(this));
    if (process.platform !== "darwin") return; // sips is macOS only

    this.registerEvent(this.app.workspace.on("editor-paste", (evt, editor, info) => {
      const files = evt.clipboardData && Array.from(evt.clipboardData.files);
      if (!files || !files.some((f) => HEIC.test(f.name))) return;
      evt.preventDefault();
      this.insert(files, editor, info.file, editor.getCursor("from"), editor.getCursor("to"));
    }));
    this.registerEvent(this.app.workspace.on("editor-drop", (evt, editor, info) => {
      const files = evt.dataTransfer && Array.from(evt.dataTransfer.files);
      if (!files || !files.some((f) => HEIC.test(f.name))) return;
      evt.preventDefault();
      const cm = editor.cm;
      const off = cm && cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
      const at = off != null ? editor.offsetToPos(off) : editor.getCursor();
      this.insert(files, editor, info.file, at, at);
    }));

    // Registered after layout is ready, so the create events Obsidian fires for every file at startup
    // don't count.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on("create", (file) => {
        if (file instanceof TFile && HEIC.test(file.name)) setTimeout(() => this.convertInVault(file), 500);
      }));
    });

    this.addCommand({
      id: "convert-all",
      name: "Convert every HEIC image in the vault",
      callback: async () => {
        const heics = this.app.vault.getFiles().filter((f) => HEIC.test(f.name));
        if (!heics.length) return new Notice("No HEIC images in the vault.");
        for (const f of heics) await this.convertInVault(f);
      },
    });
  }

  get ext() {
    return this.settings.format === "jpg" ? "jpg" : "png";
  }

  // Pasted/dropped files: convert HEICs, save everything as attachments, insert the embeds.
  async insert(files, editor, note, from, to) {
    const source = note ? note.path : "";
    const embeds = [];
    const notice = new Notice("Converting HEIC...", 0);
    try {
      for (const f of files) {
        let name = f.name;
        let data = await f.arrayBuffer();
        if (HEIC.test(name)) {
          data = await this.convert(Buffer.from(data));
          name = name.replace(HEIC, "." + this.ext);
        }
        const dest = await this.app.fileManager.getAvailablePathForAttachment(name, source);
        const saved = await this.app.vault.createBinary(dest, data);
        embeds.push("!" + this.app.fileManager.generateMarkdownLink(saved, source));
      }
      editor.replaceRange(embeds.join("\n"), from, to);
      editor.setCursor(editor.offsetToPos(editor.posToOffset(from) + embeds.join("\n").length));
    } catch (e) {
      console.error("heic-convert", e);
      new Notice("HEIC conversion failed: " + e.message);
    } finally {
      notice.hide();
    }
  }

  // A HEIC already in the vault: convert beside it, repoint links, trash the original.
  async convertInVault(file) {
    if (!this.app.vault.getAbstractFileByPath(file.path)) return; // already handled
    try {
      const data = await this.convert(Buffer.from(await this.app.vault.readBinary(file)));
      const folder = file.parent && file.parent.path !== "/" ? file.parent.path + "/" : "";
      let dest = normalizePath(folder + file.basename + "." + this.ext);
      if (this.app.vault.getAbstractFileByPath(dest)) dest = this.app.vault.getAvailablePath(folder + file.basename, this.ext);
      const out = await this.app.vault.createBinary(dest, data);

      // Notes that link the HEIC: swap its file name for the new one inside each link.
      const links = this.app.metadataCache.resolvedLinks;
      for (const notePath in links) {
        if (!links[notePath][file.path]) continue;
        const note = this.app.vault.getAbstractFileByPath(notePath);
        if (!(note instanceof TFile)) continue;
        await this.app.vault.process(note, (text) => text.split(file.name).join(out.name));
      }
      await this.app.vault.trash(file, true);
      new Notice(`Converted ${file.name} to ${out.name}`);
    } catch (e) {
      console.error("heic-convert", e);
      new Notice(`Could not convert ${file.name}: ${e.message}`);
    }
  }

  // HEIC bytes in, PNG/JPEG bytes out, via sips in a temp folder.
  async convert(buf) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "heic-convert-"));
    const src = path.join(dir, "in.heic");
    const dst = path.join(dir, "out." + this.ext);
    try {
      await fs.promises.writeFile(src, buf);
      const size = await sips(["-g", "pixelWidth", "-g", "pixelHeight", src]);
      const long = Math.max(...[...size.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => +m[1]));
      const args = ["-s", "format", this.ext === "jpg" ? "jpeg" : "png"];
      if (this.ext === "jpg") args.push("-s", "formatOptions", String(this.settings.jpegQuality));
      if (this.settings.maxSize > 0 && long > this.settings.maxSize) args.push("-Z", String(this.settings.maxSize));
      await sips([...args, src, "--out", dst]);
      const out = await fs.promises.readFile(dst);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    } finally {
      fs.promises.rm(dir, { recursive: true, force: true });
    }
  }
};

function sips(args) {
  return new Promise((resolve, reject) =>
    execFile("/usr/bin/sips", args, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)))
  );
}

class Settings extends PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveData(s);
    containerEl.empty();
    new Setting(containerEl)
      .setName("Format")
      .setDesc("PNG is lossless. JPEG is about a fifth of the size for photos.")
      .addDropdown((d) => d.addOptions({ png: "PNG", jpg: "JPEG" }).setValue(s.format).onChange((v) => { s.format = v; save(); }));
    new Setting(containerEl)
      .setName("Longest side (pixels)")
      .setDesc("Larger photos are scaled down to this. 0 keeps the full size.")
      .addText((t) => t.setValue(String(s.maxSize)).onChange((v) => { s.maxSize = Math.max(0, parseInt(v) || 0); save(); }));
    new Setting(containerEl)
      .setName("JPEG quality")
      .setDesc("1 to 100, only used for JPEG.")
      .addText((t) => t.setValue(String(s.jpegQuality)).onChange((v) => { s.jpegQuality = Math.min(100, Math.max(1, parseInt(v) || 82)); save(); }));
  }
}
