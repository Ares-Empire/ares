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
  address and email live once here, in `content/site.json`, and also in the Ares Empire pages (`ares-empire/web/legal/`):
  a change goes to both. If the site starts processing something new (a form, an embed, a log), the privacy policy
  changes first, in both languages.
- **Looks:** three, switched in the header (`static/js/theme.js` sets `data-theme` on `<html>`; every colour is a token
  per look at the top of `site.css`). **Dark is the default** for every first visit, whatever the system says (Patrik,
  2026-10-26). Behind every page drifts one calm line of light (`static/js/flow.js`, colours `--flow-*` per look): keep
  it slow and faint, never a show. Light and dark are the Ares apps' look (Aresium's website, `empire-ios`
  Shared/Design): glass cards, Space Grotesk, ink accents, a faint red and blue light. Red is red and gold: a
  wine-black wall lit crimson, gold-edged glass, the name in the Empire's gold text with one shine. Simple, clean and
  professional first (Patrik, 2026-10-26); the apps bring their own accents. A new colour gets a token in all three.
- **Layout of the home page** (Patrik, 2026-10-26): name and intro top left, three large tiles across the middle
  (iPhone apps, GitHub, LinkedIn), the projects small at the bottom. No separate companions page: a companion says
  "Customize us!" and opens the menu.
- **The companions engine is not edited here.** It is the pinned submodule `vendor/companions`; changes to it go to
  the companions repo. Its rules for looks (no outlines around companions, etc.) are in `vendor/companions/CLAUDE.md`.
- After a change: `python3 build.py`, serve `dist/`, run `node tools/shoot.mjs <scratch dir>` and look at the
  pictures (phone and desktop, light and dark, German too), then `./deploy.sh`.
