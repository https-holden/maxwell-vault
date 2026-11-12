# How this vault works

Obsidian is a writing app that keeps every note as a plain text file in one folder on your
computer (the *vault*). Nothing is in the cloud unless you put it there. Notes link to each
other with `[[double square brackets]]`, and that's most of the magic.

The house icon at the top left always takes you back to [[Home]].

## The keys you need

| Key | Does |
|---|---|
| **Cmd+Shift+M** | New morning pages, from anywhere |
| **Cmd+Shift+P** | Zen mode on and off (Esc also leaves) |
| **Cmd+Shift+H** | Home |
| **Cmd+O** | Jump to any note by typing part of its name |
| **Cmd+P** | Every command Obsidian has, searchable |
| **Cmd+Shift+T** | Insert a template into the note you're in |
| **Cmd+E** | Switch a note between reading and editing |
| `[[` | Start a link: type a few words of a note's name and pick it |
| `@today` | Type `@` and a word (`@today`, `@fri`, `@next week`) to drop in a date |

On Windows, Ctrl instead of Cmd.

## Morning pages

Press **Cmd+Shift+M**. It asks where you are writing from: pick a place, choose "New
location..." to add one (it finds where you are and lets you name it, like "Kitchen table"), or
press Esc to skip. Then it makes the page in `Journal/`, named with the date, time and a
three-letter place code, and puts the cursor ready to type.

Press **Cmd+Shift+P** for zen mode: the page fills the screen, everything else disappears, the
line you're on stays in the middle of the screen and the paragraphs around it fade. The word
count sits at the bottom right. At **750 words** (about three pages) the screen glows softly
for a moment. That's the goal; keep going if you want.

Spell check is **off** on purpose, so red squiggles don't pull you out of the flow. To turn it
on: Settings (gear, bottom left) → Editor → Spellcheck.

All your entries: [[Morning Pages]].

## The novel

Everything is on [[Novel]]: the chapters in order, the characters, and the world, each as a
table you can sort and filter (click the view name at the top of a table to switch, for
example from *All* to *History* or *Not canon yet*).

- **Chapters** are in `Novel/Chapters/`, one note each. Zen mode works here too. For a word
  goal on a chapter, give it a `word-goal` property (say 3000) and it glows when you get there.
- **Characters** are in `Novel/Characters/`. `tier` says how big their part is.
- **The world** is in `Novel/World/`: every place, people (minotaurs, elves...), creature,
  faction, war, magic system, religion, language and object. `type` says which. Events with a
  `year` line up in the *History* view, which is your timeline.
- `status` on a character or world note is **idea**, **draft** or **canon**. Canon means it's
  true in the book. Claude never makes something canon without you.
- Maps, art and moodboards: drag images into a note. For a moodboard or a map board, make a
  Canvas (right-click a folder → New canvas) and drop images and notes onto it.

The New chapter, New character and New world entry buttons are on [[Home]].

## Working with Claude

Claude Code can open this vault and do the filing for you. Things to say:

- "Bring in what's in the Inbox." (Put Word docs, exported Google Docs, old notes or Claude
  chats in the `Inbox` folder first. Obsidian hides that folder.)
- "Let's work out how minotaur clans pass down leadership." Claude reads what you already
  have first, and offers to write what you decide into the notes.
- "What have I said about the elven calendar?" / "Does chapter 3 contradict anything?"
- "Make Brakka canon." / "Add the Siege of Thornhold to the timeline."

Claude never rewrites your chapters or your morning pages unless you ask for that exact
change, and it always lists what it's about to do and waits for your go.

## The Artist's Way

The course hub is [[The Artist's Way]]. Make one note per week from the *Artist's Way Week
Template* and name it `Week 01 - Recovering a Sense of Safety` (and so on), so it shows in the
weeks table. A task that needs writing gets its own page from the *Artist's Way Exercise
Template*: instructions at the top, your answer under **Response**.

## Small helpers already on

- **Zen mode (ProZen) and Typewriter Mode**: full screen, centred line, faded paragraphs. The
  typewriter effects only switch on while you're in zen mode.
- **Word Goal Glow**: the soft glow at the goal. Change goals in Settings → Word Goal Glow, or
  give one note its own with a `word-goal` property.
- **Link Search**: the `[[` popup matches whole words in any order (`iron brakka` finds
  "Brakka Ironhorn").
- **Auto Alias**: write `[[Brakka Ironhorn|Brakka]]` once and from then on `[[Brakka` finds
  her. If the note doesn't exist yet, it is made for you.
- **Date Mentions**: the `@today` trick.
- **Quiet Properties**: the box of properties at the top of a note shows only the important
  ones; click "Show more" for the rest.
- **Resting View**: notes open looking finished; click into the text to edit.
- **Sticky Bullets**: in a long list, the bullets above you stay pinned at the top.
- **Image Caption**, **HEIC Convert** (iPhone photos become normal images when pasted),
  **Canvas Send to Back**, **Manual Modified** (a `modified` date that only changes when you
  type).
- **Templater** and **Dataview** run the morning pages script and the buttons. Leave them on.

The look is the **Analog** theme: parchment and serif with a violet accent, light and dark
(Settings → Appearance → Base color scheme).
