# Notes for Claude sessions

Read `README.md` first. This is Patrik's personal site (patrikbreeck.com), not an Empire service: no login, no API.

## Rules

- **Both languages, always.** Every text is in `content/strings.en.json` and `strings.de.json` (or `apps.json` /
  `legal/` per language). The personal pages say "I"/"ich" and address the reader with "you"/"du"; the legal pages
  are neutral statements with "you"/"Sie", like the Ares Empire ones.
- **Nothing from other hosts**, no analytics, no cookies. Fonts and files are served from here. The Caddy block
  sends a Content-Security-Policy (`'self'` only, no inline scripts or styles): put styles in CSS files, data for
  scripts in `<script type="application/json">`, and set styles from JS through `element.style`.
- **Legal facts come from `ares-empire/docs/PRIVACY.md`** (host netcup, journald 14 days, BayLDA). The owner's name,
  address and email live once here, in `content/site.json`, and also in the Ares Empire pages (`ares-empire/web/legal/`):
  a change goes to both. If the site starts processing something new (a form, an embed, a log), the privacy policy
  changes first, in both languages.
- **Look:** the Ares apps' look (Aresium's website, `empire-ios` Shared/Design): near-black or light-grey wall, glass
  cards, Space Grotesk, ink buttons, a faint Mars-red and steel-blue light. No gold and no accent of its own (Patrik
  wanted it simple, clean, modern, not the Empire's gold, 2026-10-26); the apps bring their own accents.
- **The companions engine is not edited here.** It is the pinned submodule `vendor/companions`; changes to it go to
  the companions repo. Its rules for looks (no outlines around companions, etc.) are in `vendor/companions/CLAUDE.md`.
- After a change: `python3 build.py`, serve `dist/`, run `node tools/shoot.mjs <scratch dir>` and look at the
  pictures (phone and desktop, light and dark, German too), then `./deploy.sh`.
