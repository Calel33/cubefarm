# Mods

Make the office yours without forking it: your company logo on the wall, your own posters, a mascot statue in the lobby,
new jukebox tunes, a theme for a holiday the office doesn't know.

A mod is a folder with a `mod.json` and the pictures and models it names. The office only ever **reads data and
pictures** from a mod: no code is loaded from it, ever. Every mod is checked when the office starts and when you press
**Reload mods**. A mod with a problem is skipped (with the reason on the console's Mods page) and the others load as
usual.

## Make your first mod in 5 minutes

1. **Copy the example in.** Open the manager's console (press `E` at your desk in the lobby's corner office, or 🧑‍💼 Console on the phone) → **🧩 Mods** → **📦 Copy the example
   mod (hello-mod) in**. It lands in your mods folder, shown on that page: `~/.cubefarm/mods/hello-mod` (or
   `<SWARM_HOME>/mods/hello-mod`). The office never opens folders for you; copy the path and open it yourself.
2. **Look at it in the office.** Ride to the lobby: the mascot statue stands in the quiet corner south of the manager's
   office, and the "Hello mod!" poster hangs over the waiting chairs by the east wall. On the jukebox, *Hello World Hop*
   takes turns with the usual songs. On the Mods page, press **Turn it on** under *Mod week*: every desk gets a mini
   mascot, the walls get string lights, people put on party hats and the jukebox plays the mod's song first.
3. **Make it yours.** Copy the `hello-mod` folder to a new name, say `acme`, and in `acme/mod.json` change the `name`.
   Replace `poster.png` with your company logo (a PNG, JPG or WebP up to 2048×2048 pixels), and swap `mascot.glb` for
   any `.glb` model (Blender, Sketchfab and most 3D tools export one; up to 5 MB).
4. **Reload.** Press **🔄 Reload mods**. Your mod appears in the list with a gallery of what it adds. If something is
   wrong, the page says what and where (`posters[0].image: "logo.png" not found`); fix it and reload.
5. **Switch the example off.** Untick it on the Mods page. Its poster, statue, song and theme leave the office at once,
   and the office remembers it's off.

To place something exactly, stand where you want it, face the wall, open the browser's console and run
`__swarmMods.here()`: it prints your `floor`, `x`, `z` and the `turn` that faces you, ready for a fixed point.

## The folder

```
~/.cubefarm/mods/
  acme/                  ← the folder's name is the mod's id: lowercase letters, digits, - and _
    mod.json             ← the manifest (below)
    logo.png             ← pictures: .png, .jpg/.jpeg, .webp
    statue.glb           ← models: .glb (binary glTF 2.0, self-contained)
    img/banner.webp      ← sub-folders are fine
```

Files are named in `mod.json` by their path inside the mod's folder. A path that leaves the folder (`../`, an absolute
path like `C:\…` or `/…`, or a link that leads elsewhere) is refused, and so is the mod's folder itself if it's a link:
copy mods in rather than linking them. The office serves a mod's files only if its loaded manifest names them.

## mod.json

```json
{
  "name": "Acme",
  "version": "1.0.0",
  "author": "Acme Inc.",
  "description": "Our logo, our mascot and our summer party.",
  "kinds": ["props", "posters", "songs", "themes"],
  "props": [],
  "posters": [],
  "songs": [],
  "themes": []
}
```

| Field | | |
| --- | --- | --- |
| `name` | required | Up to 60 characters. |
| `version` | required | Like `1.0.0`. |
| `author` | required | Up to 60 characters. |
| `description` | optional | Up to 500 characters, shown on the Mods page. |
| `kinds` | optional | Which of `props`, `posters`, `songs`, `themes` it has. If given, it must match what's there. |
| `props`, `posters`, `songs`, `themes` | optional | Lists of items, below. A mod must have at least one item. |

Unknown fields are refused, so a typo shows up as an error rather than being quietly ignored. Every item has an `id`
(lowercase letters, digits, - and _), unique within its mod; the office knows it as `mod:<mod>/<id>`.

## Where things go

Props and posters have a `place` list. Each entry is either a **named spot** or a **fixed point**.

**Named spots** are the places the holiday themes decorate. `*` at the end means all of them (`desk-*`):

| Spot | Where |
| --- | --- |
| `desk-0` … `desk-*` | office floors: each developer desk's back right corner |
| `qa-0` … `qa-*` | office floors: each QA desk's corner |
| `balcony-e-n`, `balcony-e-s`, `balcony-w-n`, `balcony-w-s`, `balcony-*` | office floors: the balconies' ends (on the floor) |
| `corner-nw`, `corner-ne`, `corner-se`, `corner-sw`, `corner-*` | every floor: the ceiling corners |
| `elevator-w`, `elevator-e`, `elevator-*` | every floor: either side of the elevator (on the floor) |
| `reception-w`, `reception-e`, `reception-*` | lobby: the reception counter's top |
| `lobby-feature` | lobby: the showpiece corner south of the manager's office (on the floor) |
| `patio` | lobby: out on the west patio |
| `manager-desk` | lobby: your desk |
| `cabinet-top` | lobby: on top of the trophy cabinet |
| `banner` | lobby: across the lobby under the ceiling |

`{ "slot": "elevator-*", "floor": "lobby" }` keeps a spot to one kind of floor. A spot holds one thing: while a
holiday theme has a decoration there (the Christmas tree in `lobby-feature`), the holiday's stays and the mod's waits;
between mods, the first by folder name gets it.

**Fixed points** put an item at the same place on every office floor or in the lobby:

```json
{ "floor": "lobby", "x": 15.97, "z": 7.55, "y": 2.3, "turn": -90 }
```

Every floor is 32 m wide and 24 m deep: `x` runs from -16 (west wall) to 16 (east wall), `z` from -12 (north wall) to 12
(south wall, where the elevator is). `y` is the height: a prop's base (default 0, the floor) or a poster's middle
(default 1.7). `turn` is in degrees: 0 faces south, 90 east, -90 west, 180 north. A poster on the east wall faces west
(`-90`) at `x` 15.97.

## Props

A prop is a `.glb` model or a few simple shapes.

```json
{
  "id": "mascot",
  "name": "Mascot statue",
  "icon": "🗿",
  "model": "mascot.glb",
  "height": 1.4,
  "footprint": [0.9, 0.9],
  "place": [{ "slot": "lobby-feature" }]
}
```

| Field | | |
| --- | --- | --- |
| `model` | either | A `.glb` file. It's scaled to `height`, stood on the floor and centred on its spot, and shaded like the rest of the office. |
| `shapes` | or | Up to 48 shapes (below). |
| `height` | optional | Metres, for a model (default 1). |
| `footprint` | optional | `[width, depth]` in metres: you can't walk through it. Without it, you can. |
| `icon` | optional | An emoji for the Mods page's gallery. |
| `place` | optional | Where it goes (above). A prop with no places is only used by its mod's theme. |

Models load when you first visit a floor with them and are kept for the session. A model that won't load shows a
grey box instead.

A shape is a `box`, `sphere`, `cylinder` or `cone`, `size` `[width, height, depth]` in metres (a sphere's is its
diameter), `at` its offset from the prop's base, `turn` in degrees about x, y and z, and a `color`:

```json
{
  "id": "mini-cube",
  "name": "Mini mascot",
  "shapes": [
    { "shape": "box", "size": [0.16, 0.16, 0.16], "at": [0, 0.08, 0], "color": "#3a86ff" },
    { "shape": "sphere", "size": [0.04, 0.04, 0.04], "at": [0, 0.2, 0], "color": "#ff5d8f" }
  ],
  "place": [{ "slot": "desk-*" }]
}
```

The front of a prop is its +z side: that's what faces out of its spot.

## Posters

```json
{ "id": "logo", "name": "Our logo", "image": "logo.png", "width": 1.2, "frame": true, "place": [{ "floor": "lobby", "x": 12.5, "z": 11.97, "y": 2.4, "turn": 180 }] }
```

| Field | | |
| --- | --- | --- |
| `image` | required | A `.png`, `.jpg`/`.jpeg` or `.webp`. Its height on the wall follows the picture's shape. |
| `width` | optional | Metres (default 1). |
| `frame` | optional | A wooden frame round it (default true). |
| `place` | optional | Where it hangs. Fixed points suit posters best. |

## Jukebox songs

Songs are written the way the jukebox's own are (`client/src/world/jukeboxSongs.ts`): no audio files, just patterns
of scale degrees, 8 steps (eighth notes) to a bar.

```json
{
  "id": "hello-world-hop",
  "title": "Hello World Hop",
  "artist": "The Example Mods",
  "station": "all",
  "mood": "uplifting",
  "bpm": 112,
  "root": 62,
  "scale": "major",
  "chords": [1, 5, 6, 4],
  "lead": "1 - 3 - 5 - 3 - | 5 - 7, - 2 - 5 - | 6 - 5 - 3 - 1 - | 4 - 3 - 2 - - -",
  "bass": "1 - 5, - 1 - 5, -",
  "comp": ". x . x . x . x",
  "drums": { "kick": "x . . . x . . .", "snare": ". . x . . . x .", "hat": "x x x x x x x x" },
  "sound": { "lead": "triangle", "bass": "sine", "chord": "keys" },
  "passes": 3,
  "color": "#3a86ff"
}
```

- `chords`: one per bar, the scale degree (1-7) it's built on. `lead` has 8 tokens for every bar: a degree `1`-`9`
  (`'` an octave up, `,` down), `-` to hold, `.` to rest; `|` between bars is ignored. `bass` (degrees from each bar's
  chord), `comp` (`x` strikes the chord) and each drum are one bar of 8, repeated.
- `scale`: `major`, `minor`, `dorian` or `mixolydian`. `root`: the lead's tonic as a MIDI note (36-84; 60 is middle C).
  `bpm` 40-220, `swing` 0-0.5, `passes` 1-8.
- `sound`: `sine`, `square`, `sawtooth`, `triangle`, or for lead and chord also `keys` (electric piano) and `pad`.
- Optional: `sevenths`, `ninths`, `mood` (`lively`, `lofi`, `ambient`, `uplifting`), `texture` (`crackle`, `warmth`,
  `wobble`, `softDrums`), `sections` (`"B": { "chords": [...], "lead": "..." }`), `form` (like `AABA`) and
  `arrangement` (`breakdown`, `build`, `sparse`).
- `station`: `all` (the default) or `focus` (the default for lofi and ambient songs). A mod's song takes turns with
  the usual songs on its station; a Focus song plays on Focus and All.

A song whose patterns don't add up (a bar with 7 steps, a note like `q`) is an error, with the bar named.

## Themes

A mod theme dresses the office like the holidays do. It shows in **Settings → Themes** beside them, with a *mod* badge:
on by its dates, switched off there one by one, or forced on with *Always*. By date, your birthday comes first, then
the mods' themes, then the holidays. Preview one with `?theme=mod:hello-mod/mod-week` in the address bar.

```json
{
  "id": "mod-week",
  "name": "Mod week",
  "emoji": "🧊",
  "dates": { "from": "10-01", "to": "10-07" },
  "decor": [{ "slots": "desk-*", "item": "mini-cube" }],
  "lights": ["#3a86ff", "#06d6a0", "#ffd166"],
  "bunting": ["#3a86ff", "#ffd166"],
  "tint": { "color": "#bde0fe", "amount": 0.08 },
  "sky": { "color": "#1b1b4a", "amount": 0.25, "fog": 0 },
  "costumes": { "dev": ["partyHat"], "qa": ["partyHat"], "ceo": ["crown"] },
  "greetings": ["🧊 Happy Mod week from the team{name}!"],
  "playlist": ["hello-world-hop"],
  "confetti": { "colors": ["#3a86ff", "#06d6a0"], "shape": "paper" }
}
```

| Field | | |
| --- | --- | --- |
| `dates` | optional | `from` and `to` as month-day, both included; `12-30` to `01-02` crosses the new year. `null` (the default): only when forced on. |
| `decor` | optional | This mod's props and posters (by id) in named spots, only while the theme is on. |
| `lights`, `bunting` | optional | String lights and little flags along the walls, in these colours. |
| `tint` | optional | Mixed into the room's light (`amount` up to 0.4). |
| `sky` | optional | Mixed into the sky and fog in the evening (`amount` up to 1, `fog` up to 0.6 brings it closer at night). |
| `costumes` | optional | What developers, QA and the CEO wear: `witchHat`, `pumpkinHead`, `vampire`, `ghost`, `catEars`, `skeleton`, `deerstalker`, `crown`, `santaHat`, `antlers`, `uglySweater`, `partyHat`, `heartBoppers`, `bunnyEars`. |
| `greetings` | optional | The CEO texts one a day while it's on; `{name}` becomes ", <your name>". |
| `playlist` | optional | This mod's songs (by id), played first on the All station. |
| `confetti` | optional | Merge confetti colours, and `paper` or `heart`. |

## Limits

| | |
| --- | --- |
| Mods | 50 (the first 50 folders by name) |
| `mod.json` | 256 KB |
| A model | 5 MB, a self-contained `.glb` (glTF 2.0) |
| A picture | 2 MB and 2048×2048 pixels; PNG, JPEG or WebP, and what its name says it is |
| Per mod | 24 props, 24 posters, 12 songs, 4 themes; 48 shapes a prop; 32 places an item |

## Switching mods on and off

Mods are on when they load. The switch on each mod's card turns it off (or back on) at once for everyone viewing the
office, and the office remembers it in `<SWARM_HOME>/mods.json`. Removing a mod: delete its folder and reload.

## Troubleshooting

- **"No mod.json in the folder"**: the manifest must sit right in the mod's folder, not a sub-folder.
- **"… must stay inside the mod's folder"**, **"points outside the mod's folder (a link?)"**: copy the file into the
  mod's folder and name it by its path there.
- **"refers to other files; export it as one self-contained .glb"**: a `.gltf` with separate `.bin` and textures won't
  do; export a single `.glb`.
- **Nothing shows where I expected**: `__swarmMods.placed` in the browser's console lists what the mods put on the
  floor you're on and where, and `__swarmMods.models` how each model loaded.
