<%*
const KNOWN_PLACES_FOLDER = "References"; // the places you write from live in References/ with type: known-place
const JOURNAL_FOLDER = "Journal";
const NEW_LOCATION = Symbol("new-location");

const codes = {
  "Barcelona": "BCN", "Madrid": "MAD", "Paris": "PAR", "London": "LDN",
  "New York": "NYC", "Los Angeles": "LAX", "San Francisco": "SFO",
  "Chicago": "CHI", "Lisbon": "LIS", "Berlin": "BER", "Amsterdam": "AMS",
  "Mexico City": "MEX", "Buenos Aires": "BUE", "Tokyo": "TYO", "Bangkok": "BKK"
};
const codeFor = (c) => {
  if (codes[c]) return codes[c];
  if (!c || c === "Unknown") return "XXX";
  // Strip accents (e.g. "Málaga" -> "Malaga") before taking the first 3 letters
  const plain = c.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "");
  return (plain || "XXX").slice(0, 3).toUpperCase();
};

// --- Guard: the hotkey must always produce a NEW page. If the note you're in has anything in it
// (a hub, another morning-pages entry, whatever), leave it alone and run this template in a fresh
// note instead. Only a completely empty note gets filled in place. ---
if (String(tp.file.content ?? "").trim() !== "") {
  const templateFile = tp.file.find_tfile("Templates/Morning Pages Template.md");
  const journal = app.vault.getAbstractFileByPath(JOURNAL_FOLDER) ?? undefined;
  await tp.file.create_new(templateFile, "Morning Pages " + tp.date.now("HHmmss"), true, journal);
  return;
}

// --- Give immediate feedback that the hotkey registered ---
await tp.file.rename("thinking...");

let city = "Unknown", country = "", code = "XXX", place = "", address = "";

try {
  // --- Offer a quick pick from places you've already recorded ---
  // A place with `until` (the last day you wrote there) earlier than today is retired: a festival
  // that ended, an apartment you moved out of. Its note stays for the old pages, it just isn't offered.
  const today = tp.date.now("YYYY-MM-DD");
  const isCurrent = (fm) => !fm.until || String(fm.until).slice(0, 10) >= today;
  const knownFiles = app.vault.getMarkdownFiles().filter(f => f.path.startsWith(KNOWN_PLACES_FOLDER + "/"));
  const placeFiles = new Map();
  const places = knownFiles
    .map(f => {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm) placeFiles.set(fm, f);
      return fm;
    })
    .filter(fm => fm && fm.type === "known-place" && isCurrent(fm));

  let choice = NEW_LOCATION;
  if (places.length > 0) {
    const labels = places.map(fm => fm.label || `(unlabeled) ${fm.address || fm.city || "?"}`);
    labels.push("New location...");
    const values = [...places, NEW_LOCATION];
    const picked = await tp.system.suggester(labels, values, false, "Where are you writing from?");
    // Esc means "skip the location", never "new location": no lookup, no new place note
    choice = picked ?? null;
  }

  if (choice === null) {
    // keep the Unknown/XXX defaults
  } else if (choice !== NEW_LOCATION) {
    city = choice.city || city;
    country = choice.country || country;
    code = choice.code || codeFor(city);
    place = choice.label || "";
    address = choice.address || "";
  } else {
    // --- Brand-new location: try GPS first, fall back to IP, then reverse-geocode ---
    let coords = null;
    try {
      coords = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
        );
      });
    } catch (e) { coords = null; }

    if (coords) {
      try {
        const res = await tp.obsidian.requestUrl({
          url: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lon}&zoom=18&addressdetails=1&accept-language=en`,
          headers: { "User-Agent": "ObsidianMorningPages/1.0 (personal vault script)" },
          throw: false
        });
        const a = res?.json?.address || {};
        city = a.city || a.town || a.village || a.suburb || "Unknown";
        country = a.country || "";
        address = res?.json?.display_name || "";
      } catch (e) { /* keep Unknown */ }
    } else {
      try {
        const res = await tp.obsidian.requestUrl({
          url: "http://ip-api.com/json/?fields=status,city,country",
          throw: false
        });
        if (res.status === 200 && res.json?.status === "success") {
          city = res.json.city;
          country = res.json.country;
        }
      } catch (e) { /* offline */ }
    }
    code = codeFor(city);

    // Let you confirm/correct the label and address before it's saved for next time
    // Esc on the label keeps the detected city for this page but saves no known place
    const label = await tp.system.prompt('Label this place (e.g. "My Apartment"), Esc to not save it', "", false);
    place = label || "";
    if (label !== null) address = (await tp.system.prompt("Address", address, false)) ?? address;

    // Moving: a new place with the label of a current one ("My apartment - BCN" at the new address)
    // can replace it. The old note gets `until` yesterday and its address in its name, so it drops
    // out of the picker and the plain name goes to the new place. Old pages keep their own address.
    const sameLabel = label
      ? places.find(fm => String(fm.label || "").trim().toLowerCase() === label.trim().toLowerCase())
      : null;
    if (sameLabel) {
      const replace = await tp.system.suggester(
        [`Replace it: I moved (retire ${sameLabel.label}, ${sameLabel.address || "no address"})`, "Keep both"],
        [true, false], false, `You already have "${sameLabel.label}"`);
      const oldFile = placeFiles.get(sameLabel);
      if (replace && oldFile) try {
        await app.fileManager.processFrontMatter(oldFile, fm => { fm.until = tp.date.now("YYYY-MM-DD", -1); });
        const street = String(sameLabel.address || "").split(",")[0].replace(/[\\/:*?"<>|#^\[\]]/g, "").trim()
          || `until ${tp.date.now("YYYY-MM-DD", -1)}`;
        const oldPath = `${oldFile.parent.path}/${oldFile.basename} (${street}).md`;
        if (!app.vault.getAbstractFileByPath(oldPath)) await app.fileManager.renameFile(oldFile, oldPath);
      } catch (e) { new Notice(`Morning Pages: couldn't retire ${sameLabel.label} (${e.message}).`); }
    }

    if (label !== null) try {
      if (!app.vault.getAbstractFileByPath(KNOWN_PLACES_FOLDER)) {
        await app.vault.createFolder(KNOWN_PLACES_FOLDER);
      }
      const safeName = (place || city || "New Place").replace(/[\\/:*?"<>|]/g, "");
      let newPath = `${KNOWN_PLACES_FOLDER}/${safeName}.md`;
      let n = 2;
      while (app.vault.getAbstractFileByPath(newPath)) {
        newPath = `${KNOWN_PLACES_FOLDER}/${safeName} ${n}.md`;
        n++;
      }
      const body = [
        "---",
        "categories:",
        '  - "[[Writing Spots]]"',
        "type: known-place",
        `label: ${place}`,
        `lat: ${coords ? coords.lat : ""}`,
        `lon: ${coords ? coords.lon : ""}`,
        `address: "${address.replace(/"/g, '\\"')}"`,
        `city: ${city}`,
        `country: ${country}`,
        `code: ${code}`,
        "until:",
        "---",
        ""
      ].join("\n");
      await app.vault.create(newPath, body);
    } catch (e) { /* non-critical */ }
  }
} catch (e) {
  new Notice(`Morning Pages: location step failed (${e.message}), using defaults.`);
}

const date = tp.date.now("YYYY-MM-DD");
const time = tp.date.now("HH[h]mm");
const isoTime = tp.date.now("HH:mm");

let name = `${date} ${time} ${code}`;
try {
  if (!app.vault.getAbstractFileByPath(JOURNAL_FOLDER)) await app.vault.createFolder(JOURNAL_FOLDER);
} catch (e) { /* non-critical */ }
try { await tp.file.move(`${JOURNAL_FOLDER}/${name}`); }
catch (e) { await tp.file.move(`${JOURNAL_FOLDER}/${name} ${tp.date.now("ss")}`); }

// --- After everything is inserted and renamed, drop the cursor on the last line so you can type immediately ---
tp.hooks.on_all_templates_executed(() => {
  const placeCursor = () => {
    const view = app.workspace.getActiveViewOfType(tp.obsidian.MarkdownView);
    const editor = view?.editor;
    if (!editor) return;
    const last = editor.lastLine();
    editor.setCursor({ line: last, ch: editor.getLine(last).length });
    editor.focus();
  };
  placeCursor();
  // Rename triggers a re-render that can reset the cursor; run again after it settles
  setTimeout(placeCursor, 150);
  setTimeout(placeCursor, 500);
});
-%>
---
categories:
  - "[[Morning Pages]]"
date: <% date %>
time: <% isoTime %>
city: <% city %>
country: <% country %>
location-code: <% code %>
place: <% place %>
address: <% address %>
type: morning-pages
---

<% tp.file.cursor() %>
