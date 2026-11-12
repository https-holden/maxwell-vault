---
aliases:
  - Hub
---
# Morning pages

Three pages, first thing, before you think. **Cmd+Shift+M** from anywhere, or the button.

```dataviewjs
// Same as Cmd+Shift+M: the Home Button plugin's command makes a fresh note in Journal/.
const b = dv.container.createEl("button", { text: "+ New morning pages", cls: "hub-button" });
b.onclick = () => app.commands.executeCommandById("home-button:new-morning-pages");
```

![[Morning Pages.base#Recent]]

# The novel

Everything is on [[Novel|the novel's page]]: chapters, characters, the world.

```dataviewjs
const b = dv.container.createEl("button", { text: "+ New chapter", cls: "hub-button" });
b.onclick = async () => {
  const templater = app.plugins.plugins["templater-obsidian"].templater;
  const template = app.vault.getAbstractFileByPath("Templates/Chapter Template.md");
  await templater.create_new_note_from_template(template, app.vault.getAbstractFileByPath("Novel/Chapters"), "Chapter NN", true);
};
```

```dataviewjs
const b = dv.container.createEl("button", { text: "+ New character", cls: "hub-button" });
b.onclick = async () => {
  const templater = app.plugins.plugins["templater-obsidian"].templater;
  const template = app.vault.getAbstractFileByPath("Templates/Character Template.md");
  await templater.create_new_note_from_template(template, app.vault.getAbstractFileByPath("Novel/Characters"), "New character", true);
};
```

```dataviewjs
const b = dv.container.createEl("button", { text: "+ New world entry", cls: "hub-button" });
b.onclick = async () => {
  const templater = app.plugins.plugins["templater-obsidian"].templater;
  const template = app.vault.getAbstractFileByPath("Templates/World Template.md");
  await templater.create_new_note_from_template(template, app.vault.getAbstractFileByPath("Novel/World"), "New world entry", true);
};
```

# The Artist's Way

The course lives on [[The Artist's Way]]. Week notes, exercises and artist dates hang off it.

# Help

[[Readme|How this vault works]] · Zen mode: **Cmd+Shift+P** · Find any note: **Cmd+O**
