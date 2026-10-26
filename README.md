# ares

Patrik's personal site, **patrikbreeck.com**: who he is, what he builds (AresOS, the Ares iPhone apps, Companions),
links to GitHub and LinkedIn, and a few of his pixel companions living on the page. Visitors can pick which
companions appear and how they look ("Customize us!"). English and German, light and dark.

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
| `static/` | CSS, the companions host (`js/companions.js`), the font, images, favicon. Copied to `/assets/`. |
| `vendor/companions` | The companions repo as a git submodule, pinned to one commit. Its `engine/` and `companions/` are copied to `/companions/`. |
| `build.py` | Makes `dist/` from the above (Python 3, no packages). |
| `deploy.sh` | Builds and swaps the result into `/srv/ares`, which Caddy serves. |
| `tools/shoot.mjs` | Screenshots of every page (desktop and phone, light and dark), for checking a change without a screen. |

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

### Screenshots of the apps

The apps page shows each app in a drawn iPhone. Until there are screenshots, the phone shows the app's icon. To add
them: run the app in the simulator with sample data (`-sampleData`, see `empire-ios/CLAUDE.md`), take
`xcrun simctl io booted screenshot <file>.png`, scale it to about 600 px wide (WebP or PNG), put it in
`static/img/apps/<app id>/` and list the file name in that app's `screens` in `content/apps.json`.

### The companions

`static/js/companions.js` runs the engine from `vendor/companions` on the home page. Everything the page marks as a
`.window` (with an id) is a surface they stand on, text inside a `[role=document]` is somewhere to sit, and the
bottom of the page is the floor. To use a newer engine:

```sh
git -C vendor/companions fetch && git -C vendor/companions checkout origin/main
git add vendor/companions && git commit -m "Companions: engine <commit>"
```

Part of `companions.js` is a copy of the companions preview's host (`preview/main.js`, `preview/panel.js`): see
the note at its top. When the engine changes how it is run, compare the two. The plan is a shared host in the
companions repo (`engine/host.js`), so this copy goes away.

## Going public

1. The LinkedIn address in `content/site.json` (the build warns while it is a placeholder).
2. Patrik reads the imprint and privacy policy in both languages.
3. Screenshots of the apps (above), if they should be there at launch.
4. `content/site.json` → `"public": true` (removes the noindex tag and the robots block), then `./deploy.sh`.
5. In `/etc/caddy/Caddyfile` (block `patrikbreeck.com`): delete `basic_auth` and the `X-Robots-Tag` line, then
   `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`.
6. Add the site to `ares-empire/docs/PRIVACY.md` (what it processes: no access log, error entries 14 days, the
   companions' choices in the browser).

Once the site is public, the companions' code and designs can be read by anyone from the site, even while their
repo is private.
