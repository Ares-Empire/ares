# Notes for Claude sessions

Read `README.md` first. This is Patrik's personal site (patrikbreeck.com), not an Empire service: no login, no API.

## Rules

- **Both languages, always.** Every text is in `content/strings.en.json` and `strings.de.json` (or `apps.json` /
  `legal/` per language). The legal pages are neutral statements with "you"/"Sie", like the Ares Empire ones.
- **Tone: a business card** (Patrik, 2026-10-26: coworkers, hiring managers and partners read it). Short,
  professional, little "I/my"; project lines say what the thing is, with a little selling ("AI-native operating
  system that runs the whole computer from inside Minecraft"). No in-jokes or pseudonym lines ("aka Ares" was cut).
  **The site presents, it doesn't report** (Patrik, 2026-10-26): never mention internal limitations (Apple's review,
  TestFlight waiting, "personal use for now", features still being built); the apps are shown as ready.
- **Nothing from other hosts**, no analytics, no cookies. Fonts and files are served from here. The Caddy block
  sends a Content-Security-Policy (`'self'` only, no inline scripts or styles): put styles in CSS files, data for
  scripts in `<script type="application/json">`, and set styles from JS through `element.style`.
- **Legal facts come from `ares-empire/docs/PRIVACY.md`** (host netcup, journald 14 days, BayLDA). The owner's name,
  address and email live in the external owner file, shared with ares-empire and aresium, never in a repo:
  `$ARES_OWNER_FILE` if set, else `~/.config/ares-empire/owner.json`. It contains exactly `name`, `street`, `city`
  (postcode and town in one line) and `email`, all non-empty strings. Use made-up details through `ARES_OWNER_FILE`
  for tests and checks (`python3 tools/check-owner.py`); never print real details. If the site starts processing
  something new (a form, an embed, a log), the privacy policy changes first, in both languages.
- **Looks:** three, switched in the header (`static/js/theme.js` sets `data-theme` on `<html>`; every colour is a token
  per look at the top of `site.css`). **Dark is the default** for every first visit, whatever the system says (Patrik,
  2026-10-26). Behind every page drifts one calm line of light (`static/js/flow.js`, colours `--flow-*` per look): keep
  it slow, steady and faint, never a show. It does not follow the pointer (it made it fast and jerky); it turns at most
  20°/s within a fixed speed range. A page can mark its content `data-flow-column` (the apps page's cards and details)
  to keep the line beside it, with a longer trail. Light and dark are the Ares apps' look (Aresium's website,
  `empire-ios` Shared/Design): glass cards, Space Grotesk, ink accents, a faint red and blue light. Red is red and gold:
  a wine-black wall lit crimson, gold-edged glass, the name in the Empire's gold text with one shine. Simple, clean and
  professional first (Patrik, 2026-10-26); the apps bring their own accents. A new colour gets a token in all three.
- **Layout of the home page** (Patrik, 2026-10-26): name and intro top left, three large tiles across the middle
  (iPhone apps, GitHub, LinkedIn), the projects small at the bottom. No separate companions page: a companion says
  "Customize us!" and opens the menu.
- **Layout of the apps page** (Patrik, 2026-11-01): one row of small cards, one per app (icon, name in its accent,
  tagline), the requestable apps first (Aresium, Arestemis, Ares Empire, then Arestoteles, Aresus: the order of
  `apps.json`); a click shows that app's details right below the row, on the same page, not in a popup: its two iPhones
  beside its text (above it on a phone). Tabs for keyboards and screen readers (`static/js/apps.js`), the address
  names the app (`/en/apps/#empire`) without new history entries; without scripts every app's details show, one below
  another. The details are `data-companions-ignore`: the companions start and stay on what never changes when another
  app is chosen (the lead, the cards).
- **Default companions per page** (`content/site.json` → `companions`, Patrik 2026-10-31): only the companions' own
  designs (critters, mythology), never brands (Clawd, Clippy, apps, games, Minecraft); each page its own set (home:
  Ares in his golden skin, Bit (the companions' face, Patrik 2026-11-02) and Pippin the hedgehog, on phones Ares
  and Bit; apps: three others), each starting on a fixed
  spot (`spots`). A click on a companion opens the menu on it. Scrolling never knocks them down (`scroll: "ride"`,
  2026-11-01): they stay on their spot and leave the screen with it. Mallow drifting down and vanishing to reappear
  elsewhere is its own way to travel, not a bug.
- **The companions are not edited here.** They are the pinned submodule `vendor/companions`, whose website embed
  `build.py` builds; changes to them go to the companions repo. The site uses only the embed's API (`window.Companions`,
  `vendor/companions/web/README.md`): `static/js/companions.js` holds the bubble and the menu and never imports engine
  files or copies engine code. What the menu needs and the API lacks goes into the embed. Their rules for looks (no
  outlines around companions, etc.) are in `vendor/companions/CLAUDE.md`.
- **Credits for the companions** (Patrik, 2026-11-02): the menu's foot has the fan-project line and a Credits view,
  made by `build.py` from `vendor/companions/NOTICE.md` (never a copy here: it changes with the companions).
- **Link previews and search** (Patrik, 2026-11-02): every page has the preview tags and its language's card
  (`tools/og-card.mjs`, run again when the name or the short line changes); imprint and privacy stay `noindex`.
- After a change: `python3 build.py`, serve `dist/` with `python3 tools/serve.py` (it sends the server's CSP), run
  `node tools/shoot.mjs <scratch dir>` and look at the pictures (phone and desktop, light and dark, German too; no
  console errors or CSP violations), then `./deploy.sh`.
