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
| `content/apps.json` | The apps page: each app's text in both languages, its accent, whether others can request it and where (the app's own contact form, else the Ares Empire's), its repo once public, its screenshots. |
| `content/legal/` | Imprint and privacy policy, one file per language, with `{{placeholders}}` filled from `site.json`. |
| `static/` | CSS, the look switcher (`js/theme.js`), the background line (`js/flow.js`), the companions' bubble and menu (`js/companions.js`), the font, images, favicon. Copied to `/assets/`. |
| `static/img/apps/<app>/` | The apps' pictures, imported from empire-ios's showcase by `tools/import-showcase.py` (`SOURCE` names the commit). |
| `vendor/companions` | The companions repo as a git submodule, pinned to one commit. Its website embed is built into one file, `/companions/companions.min.js`. |
| `build.py` | Makes `dist/` from the above (Python 3, no packages; it runs Node only to build the companions' file). |
| `deploy.sh` | Builds and swaps the result into `/srv/ares`, which Caddy serves. |
| `tools/serve.py` | Serves `dist/` locally with the Content-Security-Policy the server sends. |
| `tools/shoot.mjs` | Screenshots of pages (desktop and phone, in every look), for checking a change without a screen. |
| `tools/import-showcase.py` | Copies the app pictures `content/apps.json` names from `empire-ios/showcase/`, sized for the web (needs Pillow). |

Pages: `/en/`, `/en/apps/`, `/en/imprint/`, `/en/privacy/` and `/de/`, `/de/apps/`, `/de/impressum/`,
`/de/datenschutz/`. Caddy sends `/` (and `/hi`, the address for the NFC tag) to `/en/`, whatever the browser's
language (Patrik, 2026-10-27: English by default, German is the DE button); `/impressum`, `/imprint`, `/datenschutz`
and `/privacy` lead to their pages.

## Working on it

```sh
git submodule update --init                # once, after cloning
npm ci --prefix vendor/companions/web      # once, and after the submodule moves: esbuild, for the companions' file
python3 build.py                           # makes dist/ (needs Node 22 or newer; the server has 24)
python3 tools/serve.py                     # serves dist/ with the server's CSP; open http://127.0.0.1:8790/en/
node tools/shoot.mjs /tmp/shots            # screenshots of the local build (needs Playwright; the server has it)
./deploy.sh                                # on the server: build and put it live
```

The build stops, with the reason, when a text exists in only one language, a placeholder is left unfilled, a page
would load something from another host, or Node or esbuild is missing (it says what to run). Look at the pages through
`tools/serve.py`: the browser then reports anything the server's Content-Security-Policy would block.

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

The companions are the companions repo's website embed (`vendor/companions/web`; its `README.md` documents the tag,
the API and what it stores). `build.py` builds it from the pinned submodule into `/companions/companions.min.js`, with
every companion inside so visitors can pick any of them, and the home page loads it with `data-autostart="false"` and
`data-settings-button="false"`. The embed finds places on the page by itself (the name, lines of text, the tiles' top
edges) and never stands where it would cover text; a click on a companion never reaches the page, and on a phone
touching one holds it instead of scrolling. Where it chooses wrong, `data-companions-surface` (stand on this element's
top edge) and `data-companions-ignore` (leave this alone) correct it. The home page marks the tiles' insides
`data-companions-ignore` (`build.py` → `tile`): companions stand on a tile's top edge, not on the button itself, where
they would take part of its click area and leave no room for the bubble.

`static/js/companions.js` is the site's part, on the embed's API (`window.Companions`) only, with no engine code. It
starts them with `content/site.json` → `companions`: each page's own (`pages.home`, `pages.apps`: `desktop`, and
`phone` for phones, at a smaller size), where each starts on every visit (`spots.desktop`, `spots.phone`: an element
of the page by CSS selector, `at` 0 to 1 along it; a companion starts there only when its whole height fits under what
is above, else somewhere else, so pick spots with room at every window size), and their starting
looks (`looks`, e.g. Ares in his golden skin), which the visitor can change. Only the companions' own designs, no
brands (Patrik, 2026-10-31); `build.py` stops on an id, skin or spot setting the pinned companions don't have.
`scroll: "ride"` (Patrik, 2026-11-01): when the page scrolls they stay on their spot and go out of view with it,
instead of falling onto the bottom of the window. It shows the "Customize us!" bubble over one of them now and then (the page's
own first; never over a heading, text, a tile or a control), and builds the translated menu (`content/strings.*.json`
→ `menu`), opened by the bubble, by a click on a companion (on that companion) and by every `[data-companions-menu]`
button (the footer's). The visitor's choices are the embed's: localStorage under
`companions.` (and `companions.menuSeen`, the site's), the Motion choice in sessionStorage for the visit; "Start over"
removes them. Choices saved by the site's earlier host of its own (`companion.<id>`) are moved over once.

To use a newer companions version:

```sh
git -C vendor/companions fetch && git -C vendor/companions checkout origin/main
npm ci --prefix vendor/companions/web
python3 build.py                  # then look at the home page as above, menu and bubble included
git add vendor/companions && git commit -m "Companions: <commit>"
```

When the embed's API changes, `static/js/companions.js` follows it. Something the menu needs and the API lacks goes
into the embed, not into a copy here.

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
