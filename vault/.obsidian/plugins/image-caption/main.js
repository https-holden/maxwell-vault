const { Plugin, MarkdownRenderer, MarkdownView, Keymap, Notice, setIcon, setTooltip } = require("obsidian");
const { ViewPlugin, Decoration } = require("@codemirror/view");
const { RangeSetBuilder } = require("@codemirror/state");

// A caption is ordinary markdown: an italic line directly under a line that ends with an image.
//
//   ![[photo.jpeg|360]]
//   *The [[Barcelona Symbol]] outside the gate*
//
// Because it is real text, links in it are real links (backlinks, rename-safe). In live preview
// the caption is drawn inside the image's card and its source line is folded away until the
// cursor enters it; in reading view the image and caption are wrapped into one figure.

// ![[file|display]] and ![display](url); display holds "alt", "360" or "alt|360"
const WIKI = /!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
const MD = /!\[([^\]]*)\]\(([^)]*)\)/g;
const SIZE = /^\d+(x\d+)?$/;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|avif|svg|bmp)$/i;
const CAPTION = /^\s*([*_])(?!\1)(\S(?:.*\S)?)\1\s*$/;

function splitDisplay(display) {
  const text = display || "";
  const bar = text.lastIndexOf("|");
  const last = (bar === -1 ? text : text.slice(bar + 1)).trim();
  if (SIZE.test(last)) return { caption: bar === -1 ? "" : text.slice(0, bar).trim(), size: last };
  return { caption: text.trim(), size: "" };
}

// Every embed in a line of text, in order; `image` is false for note embeds like ![[Some note]]
function embedsIn(text, offset) {
  const matches = [];
  for (const [re, wiki] of [[WIKI, true], [MD, false]]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const target = wiki ? m[1] : m[2];
      matches.push({
        wiki,
        target,
        image: !wiki || IMAGE_EXT.test(target.split("#")[0].trim()),
        from: offset + m.index,
        to: offset + m.index + m[0].length,
        display: (wiki ? m[2] : m[1]) || "",
      });
    }
  }
  return matches.sort((a, b) => a.from - b.from);
}

// All image + caption-line pairs in the document
function scan(state) {
  const pairs = [];
  const doc = state.doc;
  for (let n = 1; n < doc.lines; n++) {
    const line = doc.line(n);
    if (!line.text.includes("![")) continue;
    const embeds = embedsIn(line.text, line.from);
    const last = embeds[embeds.length - 1];
    if (!last || !last.image || line.text.slice(last.to - line.from).trim()) continue;
    const next = doc.line(n + 1);
    const m = next.text.match(CAPTION);
    if (!m || m[2].includes(m[1])) continue; // "*a* and *b*" is a sentence, not a caption
    const textFrom = next.from + next.text.indexOf(m[2], next.text.indexOf(m[1]) + 1);
    pairs.push({
      embedFrom: last.from,
      embedTo: last.to,
      lineFrom: next.from,
      lineTo: next.to,
      textFrom,
      textTo: textFrom + m[2].length,
      text: m[2],
    });
  }
  return pairs;
}

function isLivePreview(view) {
  const root = view.dom.closest(".markdown-source-view");
  return !!root && root.classList.contains("is-live-preview");
}

function captionExtension(plugin) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.pairs = scan(view.state);
        this.decorations = this.build();
        this.schedule();
      }

      update(update) {
        if (update.docChanged) this.pairs = scan(update.state);
        this.decorations = this.build();
        this.schedule();
      }

      destroy() {
        this.view.contentDOM.querySelectorAll(".image-caption").forEach((el) => el.remove());
        this.view.contentDOM.querySelectorAll(".image-embed.has-caption").forEach((el) => el.removeClass("has-caption"));
      }

      editing(pair) {
        return this.view.state.selection.ranges.some((r) => r.from <= pair.lineTo && r.to >= pair.lineFrom);
      }

      // Style the caption's source line, folded to nothing unless the cursor is in it
      build() {
        const builder = new RangeSetBuilder();
        if (isLivePreview(this.view)) {
          for (const pair of this.pairs) {
            const cls = "image-caption-source" + (this.editing(pair) ? "" : " is-folded");
            builder.add(pair.lineFrom, pair.lineFrom, Decoration.line({ class: cls }));
          }
        }
        return builder.finish();
      }

      schedule() {
        if (this.frame) return;
        this.frame = window.requestAnimationFrame(() => {
          this.frame = null;
          this.sync();
        });
      }

      // Draw each caption inside its image widget. Obsidian owns and rebuilds those widgets,
      // so this runs after every editor update and only touches what is out of date.
      sync() {
        const view = this.view;
        if (!view.dom.isConnected) return;
        const live = isLivePreview(view);
        view.contentDOM.querySelectorAll(".image-embed").forEach((embed) => {
          let pair = null;
          if (live) {
            let pos = -1;
            try { pos = view.posAtDOM(embed); } catch (e) {}
            pair = this.pairs.find((p) => p.embedFrom === pos)
              || this.pairs.find((p) => pos > p.embedFrom && pos < p.embedTo) || null;
          }
          let caption = Array.from(embed.children).find((el) => el.classList.contains("image-caption"));
          if (!pair) {
            if (caption) caption.remove();
            embed.classList.remove("has-caption", "is-editing-caption");
            return;
          }
          if (!caption) {
            caption = embed.createDiv("image-caption");
            plugin.wireCaption(caption, view);
          }
          if (caption.dataset.source !== pair.text) {
            caption.dataset.source = pair.text;
            caption.empty();
            MarkdownRenderer.render(plugin.app, pair.text, caption, plugin.sourcePathFor(view), plugin);
          }
          caption.dataset.from = String(pair.textFrom);
          caption.dataset.to = String(pair.textTo);
          embed.classList.add("has-caption");
          embed.classList.toggle("is-editing-caption", this.editing(pair));
        });
      }
    },
    { decorations: (value) => value.decorations }
  );
}

module.exports = class ImageCaption extends Plugin {
  onload() {
    this.registerEditorExtension(captionExtension(this));
    this.registerMarkdownPostProcessor((el) => this.buildFigures(el));

    // Obsidian builds the hover buttons (Zoom in, Edit this block) per image widget; add ours the
    // first time the pointer reaches an image, so it also covers widgets that get rebuilt.
    this.registerDomEvent(document, "mouseover", (e) => this.decorate(e.target));
    this.registerEvent(this.app.workspace.on("window-open", (win) => {
      this.registerDomEvent(win.doc, "mouseover", (e) => this.decorate(e.target));
    }));
  }

  onunload() {
    document.querySelectorAll(".image-caption-button").forEach((el) => el.remove());
  }

  markdownViewFor(el) {
    return this.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((v) => v instanceof MarkdownView && v.containerEl.contains(el));
  }

  sourcePathFor(cm) {
    const view = this.markdownViewFor(cm.dom);
    return view && view.file ? view.file.path : "";
  }

  // Reading view: image, line break, italic text -> one figure
  buildFigures(el) {
    el.querySelectorAll("span.internal-embed, p > img").forEach((embed) => {
      if (embed.matches("span") && !IMAGE_EXT.test((embed.getAttribute("src") || "").split("#")[0])) return;
      if (embed.parentElement && embed.parentElement.classList.contains("image-figure")) return;
      const between = [];
      let node = embed.nextSibling;
      while (node && ((node.nodeType === 3 && !node.textContent.trim()) || (node.nodeName === "BR" && !between.some((n) => n.nodeName === "BR")))) {
        between.push(node);
        node = node.nextSibling;
      }
      if (!node || node.nodeName !== "EM") return;
      let after = node.nextSibling;
      while (after && after.nodeType === 3 && !after.textContent.trim()) after = after.nextSibling;
      if (after && after.nodeName !== "BR") return; // italic words that start a sentence, not a caption

      const figure = createSpan("image-figure");
      embed.parentElement.insertBefore(figure, embed);
      between.forEach((n) => n.remove());
      if (after) after.remove();
      node.classList.add("image-figcaption");
      figure.append(embed, node);
    });
  }

  // Clicks inside a caption drawn in live preview: links open, anything else edits the caption
  wireCaption(caption, cm) {
    caption.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    caption.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const link = e.target.closest && e.target.closest("a");
      if (link && link.classList.contains("internal-link")) {
        const href = link.getAttribute("data-href") || link.getAttribute("href");
        this.app.workspace.openLinkText(href, this.sourcePathFor(cm), Keymap.isModEvent(e));
      } else if (link && link.href) {
        window.open(link.href);
      } else {
        const to = Number(caption.dataset.to);
        cm.dispatch({ selection: { anchor: to }, scrollIntoView: true });
        cm.focus();
      }
    });
  }

  decorate(target) {
    if (!target || !target.closest) return;
    const embed = target.closest(".markdown-source-view .image-embed");
    if (!embed) return;
    const actions = embed.querySelector(".embed-actions");
    if (!actions || actions.querySelector(".image-caption-button")) return;

    const button = createDiv("embed-action image-caption-button");
    setIcon(button, "subtitles");
    setTooltip(button, "Add caption");
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.editCaption(embed);
    });
    // keep the click from selecting the image / moving the cursor into its markdown
    button.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    actions.insertBefore(button, actions.querySelector(".edit-block-button"));
  }

  // Put the cursor in the image's caption line, writing that line first if there is none
  editCaption(embed) {
    const view = this.markdownViewFor(embed);
    const cm = view && view.editor && view.editor.cm;
    if (!cm) return;
    const found = this.findEmbed(cm, embed);
    if (!found) {
      new Notice("Could not find this image's markdown.");
      return;
    }

    const existing = scan(cm.state).find((p) => p.embedFrom === found.from);
    if (existing) {
      cm.dispatch({ selection: { anchor: existing.textFrom, head: existing.textTo }, scrollIntoView: true });
      cm.focus();
      return;
    }

    // An older caption kept in the embed's display text (![[photo|caption|360]]) moves to the line
    const { caption: old, size } = splitDisplay(found.display);
    const text = found.wiki && old && !IMAGE_EXT.test(old) ? old : "Caption";
    const image = found.wiki
      ? "![[" + found.target + (size ? "|" + size : "") + "]]"
      : cm.state.doc.sliceString(found.from, found.to);

    // The image gets a line of its own so the caption can sit directly under it
    const doc = cm.state.doc;
    const line = doc.lineAt(found.from);
    const before = line.text.slice(0, found.from - line.from).trim() ? "\n\n" : "";
    const tail = doc.lineAt(found.to);
    const rest = tail.text.slice(found.to - tail.from).trim();
    const nextLine = tail.number < doc.lines ? doc.line(tail.number + 1).text.trim() : "";
    const after = rest ? "\n\n" : nextLine ? "\n" : "";

    const insert = before + image + "\n*" + text + "*" + after;
    const start = found.from + before.length + image.length + 2;
    cm.dispatch({
      changes: { from: found.from, to: found.to, insert },
      selection: { anchor: start, head: start + text.length },
      scrollIntoView: true,
    });
    cm.focus();
  }

  // The image embed in the document that this widget element was drawn from
  findEmbed(cm, embed) {
    let pos;
    try { pos = cm.posAtDOM(embed); } catch (e) { return null; }
    const line = cm.state.doc.lineAt(pos);
    const matches = embedsIn(line.text, line.from);
    if (!matches.length) return null;

    // posAtDOM gives the start of the widget's own embed. Back-to-back images share a boundary,
    // so an exact start match has to win over "the cursor is inside/next to this one".
    const exact = matches.find((m) => m.from === pos);
    if (exact) return exact;

    // Otherwise pair the nth image widget on this line with the nth image embed in its text
    const lineEl = embed.closest(".cm-line") || embed.parentElement;
    const widgets = lineEl ? Array.from(lineEl.querySelectorAll(".image-embed")) : [];
    const images = matches.filter((m) => m.image);
    const index = widgets.indexOf(embed);
    if (index !== -1 && widgets.length === images.length) return images[index];

    const distance = (m) => (pos < m.from ? m.from - pos : pos > m.to ? pos - m.to : 0);
    return matches.slice().sort((a, b) => distance(a) - distance(b))[0];
  }
};
