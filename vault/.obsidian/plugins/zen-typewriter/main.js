const { Plugin } = require("obsidian");

const ENABLE = "typewriter-mode:typewriter-mode-plugin-enable";
const DISABLE = "typewriter-mode:typewriter-mode-plugin-disable";
const POPUPS = ".suggestion-container, .menu, .tooltip, .popover, .modal-container, .notice-container";

module.exports = class ZenTypewriter extends Plugin {
  onload() {
    // ProZen puts the leaf itself into browser fullscreen, so
    // fullscreenchange is the one signal for both entering and leaving
    // (Esc included).
    this.registerDomEvent(document, "fullscreenchange", () => this.sync());
    // Typewriter Mode may load after us; settle the default once ready.
    this.app.workspace.onLayoutReady(() => this.sync());

    // Only the fullscreen element and its descendants are painted, but
    // Obsidian appends popups (link suggestions, menus, tooltips) to
    // <body>. While in zen, re-home them inside the fullscreen leaf.
    this.observer = new MutationObserver((muts) => {
      const host = document.fullscreenElement;
      if (!host) return;
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1 && n.matches(POPUPS)) host.appendChild(n);
    });
    this.observer.observe(document.body, { childList: true });
  }

  onunload() {
    this.observer?.disconnect();
  }

  inZen() {
    const el = document.fullscreenElement;
    return !!el && (el.matches(".workspace-leaf") || !!el.closest(".workspace-leaf"));
  }

  sync() {
    const want = this.inZen();
    if (want === this.last) return;
    this.last = want;
    this.app.commands.executeCommandById(want ? ENABLE : DISABLE);
  }
};
