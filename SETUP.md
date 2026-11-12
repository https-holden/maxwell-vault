# Setup instructions (for Claude)

You are helping Maxwell set up this Obsidian vault on his computer. He has never used Obsidian,
a terminal or git. Do the technical steps yourself; ask him only for decisions, and tell him
exactly what to click when something has to happen inside the Obsidian app. Use plain words.

## 1. Ask two things, one message

1. What should the vault be called? (Default: "Maxwell's Vault".)
2. What is the novel's working title? (Fine to say "don't know yet".)

## 2. Install Obsidian if it's missing

- Mac: check `/Applications/Obsidian.app`. If missing and Homebrew exists, `brew install --cask
  obsidian`; otherwise tell him to download it from obsidian.md and drag it to Applications,
  and wait.
- Windows: `winget install Obsidian.Obsidian`, or the obsidian.md download.

## 3. Copy the vault into place

Copy the `vault/` folder of this repo (including the hidden `.obsidian/` folder) to
`~/Documents/Obsidian/<vault name>/`. Never copy over an existing folder of that name: pick
another name with him. Do not put it in iCloud Drive or OneDrive (sync conflicts with
Obsidian's settings files).

Then, inside the new vault:

- Put the working title in `Novel/Novel.md` (`title:`) and as an alias.
- `git init`, commit everything ("Planted the vault"), if git is available. On a Mac without
  git, skip it rather than installing Xcode tools. Git is only Claude's undo button.

## 4. Open it in Obsidian (he clicks)

Tell him, step by step:

1. Open Obsidian → **Open folder as vault** → choose `Documents/Obsidian/<vault name>`.
2. Obsidian asks whether to trust the plugins: click **Trust author and enable plugins**. (If
   it doesn't ask: Settings (gear, bottom left) → Community plugins → **Turn on community
   plugins**.)
3. Quit Obsidian fully (Cmd+Q) and open it again, so every plugin loads.
4. Click the house icon at the top of the left bar. He should see Home with three buttons.
5. Press **Cmd+Shift+M**, press Esc at the location question, type a line, then
   **Cmd+Shift+P** for zen mode and Esc to leave. If the location question appears and a page
   lands in `Journal/`, everything works. He can delete that test page (right-click → Delete).

If a button shows code instead of a button, Dataview isn't on: Settings → Community plugins →
turn on Dataview. If Cmd+Shift+M does nothing, check Templater and Home Button are on there.

## 5. Bring in his existing work

Ask him to put his chapters and any world-building files (Word docs, Google Docs downloaded as
.docx, notes, exported Claude chats) into the vault's `Inbox` folder. Opening it: in Finder,
`Documents/Obsidian/<vault name>/Inbox`. Then follow "Bringing things in" in the vault's
`CLAUDE.md`. If his world-building lives in claude.ai chats, he can open each chat and copy it
into a text file in the Inbox, or paste it to you directly.

## 6. Finish

Tell him where things are in three lines: Home (house icon), Cmd+Shift+M for morning pages,
Cmd+Shift+P for zen mode, and that `Readme` in the vault explains the rest. From now on, he
should open Claude Code in the vault folder for anything vault-related, so it reads the
vault's `CLAUDE.md`.
