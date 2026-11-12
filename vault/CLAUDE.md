# Maxwell's vault

An Obsidian vault for two things: **morning pages** (The Artist's Way) and **a fantasy novel**
with a large invented world (minotaurs, elves and more). Maxwell is new to Obsidian. He uses
Claude to bring material in, file it, and think through the world with him.

This file is what Claude reads first. `Readme.md` is the human guide. `Novel/CLAUDE.md` is the
story guide: read it before any work on the book.

## Vault map

Folders say what a note *is*; the `categories` property says what list it shows up in. Don't
add top-level folders.

| Path | What lives there | What doesn't |
|---|---|---|
| `Home.md` | The start page (the house icon opens it): new-note buttons, recent morning pages, links. | Content. It only links and embeds. |
| `Journal/` | Morning pages only, one note per sitting, named `YYYY-MM-DD HHhMM CODE` by the Cmd+Shift+M script. | Anything else. |
| `Notes/` | Everything Maxwell writes that is not a morning page or the book: Artist's Way week notes and exercises, ideas, lists. The default place for new notes. | The novel's material. |
| `References/` | Real-world things: the places he writes from (`type: known-place`, made by the morning pages script), books. | Fiction. |
| `Novel/` | The book. `Novel.md` is its hub. Structure in `Novel/CLAUDE.md`: `Chapters/`, `Characters/`, `World/`, `Notes/`, `Drafts/`, `Sources/`. | Real-life notes. |
| `Inbox/` | Files waiting to be brought in. Hidden from Obsidian. Empty after each import. | Anything kept. |
| `Categories/` | One page per list: a sentence and an embedded Base. | Notes. |
| `Templates/` | One template per kind of note; `Templates/Bases/` one `.base` per list. | |
| `Attachments/` | Every image and file, flat (maps, art, moodboards). | Subfolders. |

## Kinds of note

| Kind | Template | Folder | Key properties |
|---|---|---|---|
| Morning pages | Morning Pages (Templater script) | `Journal/` | `date`, `time`, `city`, `place`, `type: morning-pages` |
| Artist's Way week / exercise / artist date | Artist's Way Week / Exercise / Artist Date | `Notes/` | `week`, `theme`, `start`, `end`; weeks are named `Week NN - Theme` |
| Chapter | Chapter | `Novel/Chapters/` | `chapter` (number), `status` (outline, draft, revised, final), `pov`, `summary`, `characters`, `places` (lists of links) |
| Character | Character | `Novel/Characters/` | `tier` (Lead, Important, Minor), `race`, `faction` (links to World notes), `home`, `status`, `aliases` |
| World entry | World | `Novel/World/` | `type` (Place, People, Creature, Faction, Event, Magic, Religion, Language, Lore, Item), `region` (link), `era`, `year` (number, for the timeline), `status`, `aliases` |

`status` on characters and world entries is **idea**, **draft** or **canon**. Only Maxwell
makes something canon. The World Base has a "Not canon yet" view.

Every property a Base shows is in the template, even when empty. A new property goes in the
template and in `.obsidian/types.json` the same day.

## How Claude works here

- **Maxwell's words are his.** Never rewrite, tidy or "improve" prose in `Novel/Chapters/` or
  anything in `Journal/` unless he asks for that exact edit. Suggestions go in chat or in a
  note in `Novel/Notes/`.
- **Morning pages are private.** Don't read, quote or summarise them unless he asks you to.
- **Say how before you do.** For anything bigger than one obvious edit, list the steps as a
  numbered list and wait for a go. He approves, skips or changes by number.
- **Canon is his call.** When you brainstorm world-building, new facts go into notes with
  `status: idea`, and the chat says so. Never contradict a `canon` note; if an idea would,
  say which note and ask.
- **Link, don't repeat.** A fact lives in one note; everywhere else links to it. In notes
  (not chapter prose), link a character, place or people on its first mention:
  `[[Thornhold]]`, `[[Brakka Ironhorn|Brakka]]`.
- **Chapters stay clean.** No links inside chapter prose. Who and where a chapter touches goes
  in its `characters` and `places` properties, which gives every character and place a
  "Linked here" list of the chapters it is in.
- Plain language with him. He is new to Obsidian: name the button or the key, not the
  setting's internal id.
- If the Obsidian skills are installed (`obsidian:obsidian-markdown`, `obsidian:obsidian-bases`),
  load them before writing notes or touching a `.base`.
- If the vault is a git repository, commit at the end of a session that changed files, with
  a one-line message. Git is the undo; nothing is ever deleted for good.

## Bringing things in (the Inbox)

When Maxwell says "bring in what's in the Inbox" (or hands you files):

1. **Look first.** List every file in `Inbox/` with what you think it is (chapter, world notes,
   a Claude chat, morning pages, something else) and where it would go. Wait for a go.
2. **Keep the original.** Copy each file as it was into `Novel/Sources/` (book material) before
   anything else. Never edit or delete a file there.
3. **Chapters.** Convert to Markdown with the text exactly as written (on a Mac, `textutil
   -convert txt` handles .docx/.rtf/.pages exports; `pandoc` if installed keeps italics). One
   note per chapter, `Novel/Chapters/Chapter 01 - Title.md`, from the Chapter template: fill
   `chapter`, `status: draft`, a one-line `summary`, `pov`, and the `characters` and `places`
   lists. Italics and scene breaks survive; nothing else changes.
4. **The world.** Read the chapters and world material, then propose, as one numbered list,
   the characters and world entries to create: name, kind, one line each, and which chapters
   they appear in. Facts taken from the chapters or from his own notes are `status: canon`
   unless he says otherwise; things only Claude suggested in an old chat are `status: idea`.
   On a go, create them from the templates, with an "Appears in" list of chapter links.
5. **Claude chats.** An exported chat about the world is a source, not canon. Pull out the
   decisions Maxwell made (into the matching notes, `canon`) and the open ideas (`idea`), and
   list the contradictions you found between chats or with the chapters for him to settle.
6. **The story guide.** Fill in or update `Novel/CLAUDE.md` from what you learned: the story
   in a paragraph, tone, rules of the world, names. Show him the draft before saving.
7. **Old morning pages** go to `Journal/` with `categories: [[Morning Pages]]`,
   `type: morning-pages`, and `date` / `time` from the original.
8. Empty `Inbox/`, and end with a short report: what was made, what needs his decision.

## Working on the world with him

When he wants to think something through (a culture, a war, a magic system), read
`Novel/CLAUDE.md` and the notes the topic links to first, so the answer fits what already
exists. When the conversation settles something, offer to write it into the notes as a
numbered list of changes. Keep the World Base's `year` filled on events so the History view
stays a working timeline.
