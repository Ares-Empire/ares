# ares

Patrik's personal site, **patrikbreeck.com**: who he is, what he builds (AresOS, the Ares iPhone apps, Companions),
links to GitHub and LinkedIn, and a few of his pixel companions living on the page. Visitors can pick which
companions appear and how they look ("Customize us!"). English and German, in three looks chosen in the header:
dark (the default), light, and red and gold. A calm line of light drifts behind every page in the look's colours.

**Status: in development.** Live on this server behind a password (Caddy basic auth, user `ares`), not indexed.
"Going public" below lists what changes on launch.

Privacy is part of the design: no cookies, no analytics, nothing loaded from other hosts (fonts included), and
the companions' settings stay in the visitor's browser. The imprint and privacy policy are on the site in both
languages.

## Layout

| Path | What it is |
|---|---|
| `content/site.json` | The owner (imprint and policy read it from here), links, whether the site is public, the companions shown by default. |
| `content/strings.en.json`, `strings.de.json` | Every text on the site. Both files must have the same keys: the build fails otherwise. |
| `content/apps.json` | The apps page: each app's text in both languages, its accent, whether others can request it, its repo once public, its screenshots. |
| `content/legal/` | Imprint and privacy policy, one file per language, with `{{placeholders}}` filled from `site.json`. |
| `static/` | CSS, the look switcher (`js/theme.js`), the background line (`js/flow.js`), the companions host (`js/companions.js`), the font, images, favicon. Copied to `/assets/`. |
| `static/img/apps/<app>/` | The apps' pictures, imported from empire-ios's showcase by `tools/import-showcase.py` (`SOURCE` names the commit). |
| `vendor/companions` | The companions repo as a git submodule, pinned to one commit. Its `engine/` and `companions/` are copied to `/companions/`. |
| `build.py` | Makes `dist/` from the above (Python 3, no packages). |
| `deploy.sh` | Builds and swaps the result into `/srv/ares`, which Caddy serves. |
| `tools/shoot.mjs` | Screenshots of pages (desktop and phone, in every look), for checking a change without a screen. |
| `tools/import-showcase.py` | Copies the app pictures `content/apps.json` names from `empire-ios/showcase/`, sized for the web (needs Pillow). |

Pages: `/en/`, `/en/apps/`, `/en/imprint/`, `/en/privacy/` and `/de/`, `/de/apps/`, `/de/impressum/`,
`/de/datenschutz/`. Caddy sends `/` (and `/hi`, the address for the NFC tag) to `/de/` when the browser prefers
German, else to `/en/`; `/impressum`, `/imprint`, `/datenschutz` and `/privacy` lead to their pages.

## Working on it

```sh
git submodule update --init       # once, after cloning
python3 build.py                  # makes dist/
python3 -m http.server 8790 --bind 127.0.0.1 --directory dist   # then open http://127.0.0.1:8790/en/
node tools/shoot.mjs /tmp/shots   # screenshots of the local build (needs Playwright; the server has it)
./deploy.sh                       # on the server: build and put it live
```

The build stops, with the reason, when a text exists in only one language, a placeholder is left unfilled, or a
page would load something from another host.

### The apps' pictures

The apps page shows two iPhones per app: in front the screen for the current look, behind it another one. The pictures
come from `empire-ios/showcase/` (made on the Mac by its `scripts/showcase.py`: each screen in a drawn iPhone, sample
data only). `content/apps.json` → `shots` names, per look, the front and back picture. After the showcase is re-shot
or a shot is changed:

```sh
python3 tools/import-showcase.py ../empire-ios    # writes static/img/apps/<app>/*.webp and SOURCE
python3 build.py
```

### The companions

`static/js/companions.js` runs the engine from `vendor/companions` on the home page. Everything the page marks as a
`.window` (with an id) is a surface they stand on, text inside a `[role=document]` is somewhere to sit, and the
bottom of the page is the floor. Surfaces higher up the page are stacked above lower ones, so a companion never
covers what is above it. To use a newer engine:

```sh
git -C vendor/companions fetch && git -C vendor/companions checkout origin/main
git add vendor/companions && git commit -m "Companions: engine <commit>"
```

Part of `companions.js` is a copy of the companions preview's host (`preview/main.js`, `preview/panel.js`): see
the note at its top. When the engine changes how it is run, compare the two. The plan is a shared host in the
companions repo (`engine/host.js`), so this copy goes away.

## Ideas

- **Aresium demo on aresium.de** (Patrik, 2026-10-26): the website without an account shows Aresium's sample data
  (`aresium/web/public/app/dashboard.sample.js` exists: a full made-up dataset in the API's shape), logging in shows
  your own. Then the apps page can link it. Work in the aresium repo: a public `/demo` (the page and its scripts
  without a session, `data.js` reading the sample there, edits and import switched off, a "Sample data · Log in"
  band), plus tests. Logging in for *other people's* own data on the website is a separate, bigger step: their bank
  data would then sit on the server, which the Aresium plan avoids (data on their iPhone; AVV with netcup and the
  privacy policy say no financial data).

## Going public

1. The LinkedIn address in `content/site.json` (the build warns while it is a placeholder).
2. Patrik reads the imprint and privacy policy in both languages.
3. `content/site.json` → `"public": true` (removes the noindex tag and the robots block), then `./deploy.sh`.
4. In `/etc/caddy/Caddyfile` (block `patrikbreeck.com`): delete `basic_auth` and the `X-Robots-Tag` line, then
   `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`.
5. Add the site to `ares-empire/docs/PRIVACY.md` (what it processes: no access log, error entries 14 days, the
   look and companions' choices in the browser).

Once the site is public, the companions' code and designs can be read by anyone from the site, even while their
repo is private.
