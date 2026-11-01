#!/usr/bin/env python3
"""Builds the site into dist/ (static files, served by Caddy from /srv/ares after deploy.sh).

    python3 build.py      build dist/ (exit 1, with the reasons, if anything is wrong)

Everything a page says comes from content/: site.json (owner, links, settings), strings.<lang>.json
(every interface text, the same keys in both languages), apps.json (the apps page) and legal/ (imprint
and privacy policy, with {{placeholders}} filled from site.json). static/ is copied to /assets/. The
companions come from vendor/companions (a git submodule pinned to one commit): its website embed is built
into /companions/companions.min.js and the folder /companions/companions/ next to it (each companion's own
file), with Node and esbuild (`npm ci --prefix vendor/companions/web` once); Node is used for nothing else.

The build refuses to finish when a text is missing in one language, a placeholder is left unfilled, or
a page would load anything from another host (the privacy policy promises it never does).
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
STATIC = ROOT / "static"
DIST = ROOT / "dist"
COMPANIONS = ROOT / "vendor" / "companions"
BUNDLE = "companions/companions.min.js"   # the companions' embed in dist/, with its source map next to it
LANGS = ("en", "de")
LOOKS = ("light", "dark", "red")   # the site's looks (static/js/theme.js, site.css); "red" is red and gold

# Every page and its address in each language. The German legal pages keep their German names.
PAGES = {
    "home": {"en": "/en/", "de": "/de/"},
    "apps": {"en": "/en/apps/", "de": "/de/apps/"},
    "imprint": {"en": "/en/imprint/", "de": "/de/impressum/"},
    "privacy": {"en": "/en/privacy/", "de": "/de/datenschutz/"},
}
LEGAL = {
    ("imprint", "en"): "imprint.en.html", ("imprint", "de"): "impressum.de.html",
    ("privacy", "en"): "privacy.en.html", ("privacy", "de"): "datenschutz.de.html",
}


class BuildError(Exception):
    pass


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise BuildError(f"{path.relative_to(ROOT)}: {e}") from e


def esc(value) -> str:
    return html.escape(str(value), quote=True)


# ---------- texts ----------

def key_paths(node, prefix=""):
    """Every leaf of a strings file as a dotted path (lists count as one leaf with their length)."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from key_paths(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(node, list):
        yield f"{prefix}[{len(node)}]"
    else:
        yield prefix


class Strings:
    def __init__(self, lang: str, data: dict):
        self.lang, self.data = lang, data

    def get(self, key: str):
        node = self.data
        for part in key.split("."):
            if not isinstance(node, dict) or part not in node:
                raise BuildError(f"strings.{self.lang}.json has no '{key}'")
            node = node[part]
        return node

    def __call__(self, key: str, **values) -> str:
        """The text for key, HTML-escaped, with {name} replaced by values."""
        text = self.get(key)
        if not isinstance(text, str):
            raise BuildError(f"strings.{self.lang}.json: '{key}' is not a text")
        for name, value in values.items():
            text = text.replace("{" + name + "}", str(value))
        return esc(text)


def load_strings() -> dict[str, Strings]:
    data = {lang: load_json(CONTENT / f"strings.{lang}.json") for lang in LANGS}
    paths = {lang: set(key_paths(d)) for lang, d in data.items()}
    missing = [(a, b, sorted(paths[a] - paths[b])) for a in LANGS for b in LANGS if a != b]
    problems = [f"in {a} but not in {b}: {', '.join(keys)}" for a, b, keys in missing if keys]
    if problems:
        raise BuildError("the languages differ: " + "; ".join(problems))
    return {lang: Strings(lang, d) for lang, d in data.items()}


# ---------- pieces ----------

ICONS = {
    "arrow": '<svg viewBox="0 0 24 24" aria-hidden="true" class="icon"><path d="M5 12h13M12.5 6l6 6-6 6" fill="none" '
             'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "external": '<svg viewBox="0 0 24 24" aria-hidden="true" class="icon"><path d="M7 17L17 7M8.5 7H17v8.5" fill="none" '
                'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "github": '<svg viewBox="0 0 16 16" aria-hidden="true" class="icon"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 '
              '8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48'
              '-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78'
              '-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 '
              '0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 '
              '3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>'
              '</svg>',
    "linkedin": '<svg viewBox="0 0 24 24" aria-hidden="true" class="icon"><path fill="currentColor" d="M20.447 20.452h-3.554v'
                '-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 '
                '1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 '
                '0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 '
                '1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
}


def versioned(url: str, path: Path) -> str:
    """url?v=<hash of the file>, so a changed file is never served from an old cache."""
    return f"{url}?v={hashlib.sha256(path.read_bytes()).hexdigest()[:10]}"


def asset_url(name: str) -> str:
    return versioned(f"/assets/{name}", STATIC / name)


def layout(lang: str, page: str, s: Strings, site: dict, *, title: str, description: str, body: str,
           companions: dict | None = None, extra_css: str = "", extra_js: str = "") -> str:
    other = "de" if lang == "en" else "en"
    others = STRINGS[other]
    base = f"https://{site['domain']}"
    robots = "" if site["public"] else '<meta name="robots" content="noindex, nofollow">\n'
    alternates = "".join(f'<link rel="alternate" hreflang="{l}" href="{base}{PAGES[page][l]}">\n' for l in LANGS)
    css = f'<link rel="stylesheet" href="{asset_url("css/site.css")}">\n'
    if extra_css:
        css += f'<link rel="stylesheet" href="{extra_css}">\n'
    brand = "" if page == "home" else (
        f'<a class="brand" href="{PAGES["home"][lang]}">{s("nav.home")}</a>')
    # The three looks (static/js/theme.js applies the choice and marks the pressed one).
    looks = "\n".join(f'      <button type="button" class="look look-{look}" data-look="{look}" aria-pressed="false" '
                      f'aria-label="{s("looks." + look)}" title="{s("looks." + look)}"></button>' for look in LOOKS)
    customize = ""
    scripts = f'<script type="module" src="{asset_url("js/flow.js")}"></script>\n'   # the line drifting behind every page
    if extra_js:   # before the companions' scripts, so the page is laid out as it starts when they look for places
        scripts += f'<script type="module" src="{asset_url(extra_js)}"></script>\n'
    if companions is not None:
        # The embed (built by build_companions) waits for the site's script, which starts it with the defaults and adds
        # the bubble and the menu; the footer's button opens that menu, so the embed's own round button stays away.
        customize = (f'<button type="button" class="linkish" data-companions-menu>{s("footer.customize")}</button>')
        config = json.dumps(companions, ensure_ascii=False).replace("</", "<\\/")
        scripts += (f'<script type="application/json" id="companions-config">{config}</script>\n'
                    f'<script defer src="{versioned("/" + BUNDLE, DIST / BUNDLE)}" data-autostart="false" '
                    f'data-settings-button="false"></script>\n'
                    f'<script type="module" src="{asset_url("js/companions.js")}"></script>\n')
    return f"""<!doctype html>
<html lang="{lang}" data-page="{page}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
{robots}<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#050507">
<link rel="canonical" href="{base}{PAGES[page][lang]}">
{alternates}<link rel="alternate" hreflang="x-default" href="{base}/">
<link rel="icon" href="{versioned("/favicon.svg", STATIC / "favicon.svg")}" type="image/svg+xml">
<link rel="apple-touch-icon" href="{versioned("/apple-touch-icon.png", STATIC / "apple-touch-icon.png")}">
<link rel="preload" href="/assets/fonts/SpaceGrotesk-Variable.ttf" as="font" type="font/ttf" crossorigin>
<script src="{asset_url("js/theme.js")}"></script>
{css}</head>
<body>
<header class="top">
  {brand}
  <div class="top-end">
    <div class="looks" role="group" aria-label="{s('looks.label')}">
{looks}
    </div>
    <a class="lang" href="{PAGES[page][other]}" hreflang="{other}" lang="{other}" aria-label="{others('lang.switchTo')}">{others('lang.short')}</a>
  </div>
</header>
{body}
<footer class="foot">
  <a href="{PAGES['imprint'][lang]}">{s('footer.imprint')}</a>
  <a href="{PAGES['privacy'][lang]}">{s('footer.privacy')}</a>
  {customize}
</footer>
{scripts}</body>
</html>
"""


# ---------- pages ----------

def tile(href: str, icon: str, title: str, sub: str, *, external: bool) -> str:
    # Companions stand on a tile's top edge, not inside it: inside they would sit on the button itself, take part of
    # its click area and leave no room for the "Customize us!" bubble (data-companions-ignore: the embed skips it).
    rel = ' rel="me noopener"' if external else ""
    return f"""      <a class="tile card" href="{esc(href)}"{rel}>
        <span class="tile-icon" aria-hidden="true" data-companions-ignore>{icon}</span>
        <span class="tile-text" data-companions-ignore><span class="tile-title">{title}</span><span class="tile-sub">{sub}</span></span>
        {ICONS['external' if external else 'arrow']}
      </a>"""


def page_home(lang: str, s: Strings, site: dict, count: int, apps: list[dict]) -> str:
    links = site["links"]
    apps_url = PAGES["apps"][lang]
    stack = "".join(f'<img src="/assets/img/apps/{esc(a["icon"])}" alt="" width="30" height="30">' for a in apps)
    project = lambda key, status: (f'<li><p class="project-name"><strong>{s(f"projects.{key}Name")}</strong> '
                                   f'<span class="status {status}">{s(f"status.{status}")}</span></p>'
                                   f'<p>{s(f"projects.{key}", count=count)}</p></li>')
    # The companions find their places on the page by themselves (the embed's page world: headings, lines of text,
    # the tiles' top edges), never where they would cover text.
    return f"""<main class="home">
  <div class="home-inner">
    <!-- The first screen: on a phone (where an NFC tap lands) it fills the screen as a business card, with the short
         line and the three buttons within thumb's reach; the projects follow below. -->
    <div class="first">
      <section class="intro" aria-labelledby="name">
        <h1 id="name">Patrik Breeck</h1>
        <p class="lead lead-full">{s('home.lead')}</p>
        <p class="lead lead-short">{s('home.short')}</p>
      </section>
      <nav class="tiles" aria-label="{s('home.links')}">
{tile(apps_url, f'<span class="stack">{stack}</span>', s('home.appsTitle'), s('home.appsSub'), external=False)}
{tile(links['github'], ICONS['github'], "GitHub", s('home.githubSub'), external=True)}
{tile(links['linkedin'], ICONS['linkedin'], "LinkedIn", s('home.linkedinSub'), external=True)}
      </nav>
    </div>
    <section class="current" aria-labelledby="current-title">
      <h2 class="eyebrow" id="current-title">{s('projects.title')}</h2>
      <ul class="projects">
        {project('aresos', 'building')}
        {project('apps', 'available')}
        {project('companions', 'building')}
      </ul>
    </section>
  </div>
</main>"""


def webp_size(path: Path) -> tuple[int, int]:
    """Width and height of a WebP file (its VP8X, VP8L or VP8 header), for the img tag's width and height."""
    head = path.read_bytes()[:30]
    kind = head[12:16]
    if kind == b"VP8X":
        return 1 + int.from_bytes(head[24:27], "little"), 1 + int.from_bytes(head[27:30], "little")
    if kind == b"VP8L":
        bits = int.from_bytes(head[21:25], "little")
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    if kind == b"VP8 ":
        return int.from_bytes(head[26:28], "little") & 0x3FFF, int.from_bytes(head[28:30], "little") & 0x3FFF
    raise BuildError(f"{path.relative_to(ROOT)} is not a WebP file")


def shots(app: dict, s: Strings) -> str:
    """The app's pictures: for each look a front and a back iPhone. Every picture is in the page once, with a class
    per role it plays (f-dark: in front in the dark look, b-light: behind in the light look); site.css shows the two
    the current look needs. A look without its own pair uses dark's."""
    pairs = app.get("shots") or {}
    if not pairs:
        return ""
    roles: dict[str, list[str]] = {}
    for look in LOOKS:
        pair = pairs.get(look) or pairs.get("dark") or next(iter(pairs.values()))
        for role, name in zip(("f", "b"), pair):
            roles.setdefault(name, []).append(f"{role}-{look}")
    imgs = []
    for name, classes in roles.items():
        path = STATIC / "img" / "apps" / app["id"] / f"{name}.webp"
        if not path.exists():
            raise BuildError(f"{path.relative_to(ROOT)} is missing: run tools/import-showcase.py")
        w, h = webp_size(path)
        imgs.append(f'<img class="shot {" ".join(classes)}" src="/assets/img/apps/{esc(app["id"])}/{esc(name)}.webp" '
                    f'alt="" width="{w}" height="{h}" loading="lazy" decoding="async">')
    return (f'<div class="shots" role="img" aria-label="{s("apps.shotAlt", name=app["name"])}">'
            + "".join(imgs) + "</div>")


def request_link(app: dict, site: dict, lang: str) -> str:
    """Where an app's Request access button goes: the app's own contact form when it has one (apps.json "request", an
    address per language; Aresium's on aresium.de since 2026-10-30), else the Ares Empire's general contact form
    (site.json links.contact)."""
    links = app.get("request") or site["links"]["contact"]
    if not isinstance(links, dict) or not all(str(links.get(l, "")).startswith("https://") for l in LANGS):
        raise BuildError(f"apps.json: {app['id']}'s request needs an https address for each language ({', '.join(LANGS)})")
    return links[lang]


def app_tab(app: dict, lang: str, current: bool) -> str:
    """An app's small card in the row: icon, name in the app's accent, tagline. static/js/apps.js makes it a tab."""
    aid = esc(app["id"])
    return f"""      <button type="button" class="app-tab card app--{aid}{' is-current' if current else ''}" id="tab-{aid}" data-app="{aid}">
        <span class="app-tab-head"><img src="/assets/img/apps/{esc(app['icon'])}" alt="" width="34" height="34"><span class="app-tab-name">{esc(app['name'])}</span></span>
        <span class="app-tab-tagline">{esc(app['text'][lang]['tagline'])}</span>
      </button>"""


def app_details(app: dict, s: Strings, site: dict, lang: str, current: bool) -> str:
    """An app's details: name, tagline, points and buttons, beside its iPhone pictures (above them on a phone).
    data-companions-ignore: the companions never stand in here, where the next app's details replace these; choosing an
    app would otherwise take their place away from under them."""
    aid = esc(app["id"])
    text = app["text"][lang]
    points = "".join(f"<li>{esc(p)}</li>" for p in text["points"])
    if app["availability"] == "request":
        action = (f'<a class="btn primary accent" href="{esc(request_link(app, site, lang))}">{s("apps.request")}'
                  f'{ICONS["arrow"]}</a>')
    elif app["availability"] == "showcase":
        action = ""          # shown on the page, no way to ask for it
    else:
        raise BuildError(f"apps.json: {app['id']} has an unknown availability '{app['availability']}'")
    demo = (f'<a class="btn" href="{esc(app["demo"])}" rel="noopener">{s("apps.demo")}{ICONS["external"]}</a>'
            if app.get("demo") else "")
    repo = demo + (f'<a class="btn" href="{esc(app["repo"])}" rel="noopener">{ICONS["github"]}{s("apps.repo")}</a>'
                   if app.get("repo") else "")
    return f"""      <article class="app-panel app--{aid}{' is-current' if current else ''}" id="app-{aid}" data-app="{aid}" aria-labelledby="{aid}-name" data-companions-ignore>
        <div class="app-body">
          <div class="app-head">
            <img class="app-icon" src="/assets/img/apps/{esc(app['icon'])}" alt="" width="64" height="64">
            <div><h2 id="{aid}-name">{esc(app['name'])}</h2><p class="tagline">{esc(text['tagline'])}</p></div>
          </div>
          <ul class="points">{points}</ul>
          {f'<div class="app-actions">{action}{repo}</div>' if action or repo else ''}
        </div>
        {shots(app, s)}
      </article>"""


def page_apps(lang: str, s: Strings, site: dict, apps: list[dict]) -> str:
    """A row of small cards, one per app, and below it the chosen app's details (Patrik, 2026-11-01). static/js/apps.js
    makes the row WAI-ARIA tabs: the first app is chosen at the start, or the one the address names (/en/apps/#empire).
    Without scripts the row is hidden and every app's details show, one below another (site.css, html.js).
    The details' ids are app-<id>, not <id>, so an address like #empire chooses the app without scrolling the page."""
    tabs = "\n".join(app_tab(app, lang, i == 0) for i, app in enumerate(apps))
    details = "\n".join(app_details(app, s, site, lang, i == 0) for i, app in enumerate(apps))
    # The companions start on what stays put whichever app is chosen (site.json companions.pages.apps): the lead, the
    # title and the cards. data-companions-surface makes the lead's top edge a place to stand (the embed's hint: a
    # paragraph has no edge of its own); right of the title there is room above it at every window size.
    # data-flow-column: the background line travels beside the row and the details, not behind them (flow.js).
    return f"""<main class="apps">
  <header class="page-head">
    <h1>{s('apps.title')}</h1>
    <p class="lead" data-companions-surface>{s('apps.lead')}</p>
  </header>
  <div class="app-browser" data-flow-column>
    <div class="app-tabs" aria-label="{s('apps.choose')}">
{tabs}
    </div>
    <div class="app-stage card">
{details}
    </div>
  </div>
  <p class="apps-note">{s('apps.requestNote')} <a href="{esc(site['links']['appsPrivacy'][lang])}">{s('apps.privacy')}</a></p>
</main>"""


def page_legal(lang: str, which: str, site: dict) -> str:
    text = (CONTENT / "legal" / LEGAL[(which, lang)]).read_text(encoding="utf-8")
    contact = site["links"]["contact"][lang]
    values = {
        "owner.name": site["owner"]["name"], "owner.street": site["owner"]["street"],
        "owner.city": site["owner"]["city"], "owner.email": site["owner"]["email"],
        "links.contact": contact, "links.contactLabel": re.sub(r"^https://", "", contact),
        "links.appsPrivacy": site["links"]["appsPrivacy"][lang], "domain": site["domain"],
    }
    def fill(m):
        key = m.group(1)
        if key not in values:
            raise BuildError(f"legal/{LEGAL[(which, lang)]}: unknown placeholder {{{{{key}}}}}")
        return esc(values[key])
    return f'<main class="legal"><article class="card prose">\n{re.sub(r"{{([a-zA-Z.]+)}}", fill, text)}</article></main>'


def apps_css(apps: list[dict]) -> str:
    """Each app's accent: its dark one in the dark and red looks (dark is the default), its light one in the light look
    (a file, since the site allows no inline styles)."""
    dark = "".join(f".app--{a['id']} {{ --accent: {a['accent']['dark']}; }}\n" for a in apps)
    light = "".join(f":root[data-theme=\"light\"] .app--{a['id']} {{ --accent: {a['accent']['light']}; }}\n" for a in apps)
    return f"/* Made by build.py from content/apps.json. */\n{dark}{light}"


# ---------- the build ----------

def outside_links_in_new_tab(page: str) -> str:
    """Every link that leaves the site opens in a new tab, with rel=noopener (Patrik, 2026-10-27). The site's own
    pages (start, apps, imprint, privacy, the other language) stay in this tab, so Back keeps working."""
    own = re.escape(SITE_DOMAIN)
    def fix(m):
        tag = m.group(0)
        if " target=" in tag:
            return tag
        if ' rel="' in tag:
            tag = re.sub(r' rel="([^"]*)"', lambda r: r.group(0) if "noopener" in r.group(1).split()
                         else f' rel="{r.group(1)} noopener"', tag)
        else:
            tag = tag[:-1] + ' rel="noopener">'
        return tag[:-1] + ' target="_blank">'
    return re.sub(r'<a\s[^>]*href="https?://(?!(?:www\.)?' + own + r')[^"]*"[^>]*>', fix, page)


def write(path: str, text: str):
    text = outside_links_in_new_tab(text)
    out = DIST / path.lstrip("/")
    if path.endswith("/"):
        out = out / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")


def build_companions() -> int:
    """The companions' website embed, built from the pinned submodule by its own build
    (vendor/companions/web/build.mjs): the script, and next to it the folder companions/ with every companion's
    own file (loaded when one is put on screen) and their designs (for the menu's pictures), so visitors can pick
    any of them in the menu. Returns how many companions there are."""
    index = COMPANIONS / "companions" / "index.json"
    if not index.exists():
        raise BuildError("vendor/companions is empty: run `git submodule update --init`")
    node = shutil.which("node")
    if not node:
        raise BuildError("Node.js is missing: install Node 22 or newer, then run `npm ci --prefix vendor/companions/web`")
    if not (COMPANIONS / "web" / "node_modules" / "esbuild").is_dir():
        raise BuildError("esbuild is missing: run `npm ci --prefix vendor/companions/web`")
    result = subprocess.run([node, str(COMPANIONS / "web" / "build.mjs"), "--out", str(DIST / BUNDLE)],
                            cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        raise BuildError("the companions' file did not build (vendor/companions/web/build.mjs):\n  "
                         + (result.stderr or result.stdout).strip())
    return len(load_json(index))


def spot_problems(where: str, cid: str, spot: dict, coming: list[str]) -> list[str]:
    """What is wrong with one starting spot in site.json (companions.pages.<page>.spots.<desktop|phone>.<id>)."""
    problems = []
    if cid not in coming:
        problems.append(f"{where}: {cid!r} isn't one of the companions this view brings")
    if not isinstance(spot.get("on"), str) or not spot["on"].strip():
        problems.append(f"{where}.on: a CSS selector is needed")
    at = spot.get("at", 0.5)
    if isinstance(at, bool) or not isinstance(at, (int, float)) or not 0 <= at <= 1:
        problems.append(f"{where}.at: a number from 0 to 1")
    if spot.get("rest", "stand") not in ("stand", "sit"):
        problems.append(f"{where}.rest: stand or sit")
    return problems


def check_companion_defaults(site: dict) -> None:
    """Who each page brings (site.json companions.pages) and their starting looks (companions.looks) must exist in
    the pinned companions: a misspelled id or skin would quietly leave a companion out or in its plain look."""
    conf = site["companions"]
    known = set(load_json(COMPANIONS / "companions" / "index.json"))
    problems = []
    for page, lists in conf["pages"].items():
        if page not in PAGES:
            problems.append(f"companions.pages.{page}: there is no such page")
        for kind in ("desktop", "phone"):
            if not lists.get(kind):
                problems.append(f"companions.pages.{page}.{kind}: no companions")
            for cid in lists.get(kind, []):
                if cid not in known:
                    problems.append(f"companions.pages.{page}.{kind}: no companion called {cid!r}")
        # Starting spots, per desktop and phone: only for companions that view brings; `on` is a CSS selector (the
        # companions' script warns in the console when it matches nothing), `at` a fraction along the spot.
        for kind, spots in lists.get("spots", {}).items():
            if kind not in ("desktop", "phone"):
                problems.append(f"companions.pages.{page}.spots.{kind}: desktop or phone")
                continue
            for cid, spot in spots.items():
                where = f"companions.pages.{page}.spots.{kind}.{cid}"
                problems.extend(spot_problems(where, cid, spot, lists.get(kind, [])))
    if conf.get("scroll", "fall") not in ("fall", "ride"):
        problems.append("companions.scroll: fall or ride")
    looks = conf.get("looks", {})
    ids = [cid for cid in looks if cid in known]
    # A companion's skins come from the engine itself (its own skins and the shared ones), read by Node.
    script = ("import fs from 'node:fs'; import { skinsFor } from './engine/skins.js'; const out = {}; "
              "for (const id of JSON.parse(process.argv[1])) "
              "out[id] = skinsFor(JSON.parse(fs.readFileSync(`companions/${id}/design.json`, 'utf8'))); "
              "console.log(JSON.stringify(out));")
    result = subprocess.run([shutil.which("node"), "--input-type=module", "-e", script, json.dumps(ids)],
                            cwd=COMPANIONS, capture_output=True, text=True)
    if result.returncode != 0:
        raise BuildError("could not read the companions' skins:\n  " + (result.stderr or result.stdout).strip())
    skins = json.loads(result.stdout)
    for cid, look in looks.items():
        if cid not in known:
            problems.append(f"companions.looks: no companion called {cid!r}")
        elif "skin" in look and look["skin"] not in skins[cid]:
            problems.append(f"companions.looks.{cid}.skin: {cid} has no skin {look['skin']!r}")
    if problems:
        raise BuildError("\n  ".join(["site.json's companions don't match the companions:", *problems]))


def companions_for(page: str, lang: str, s: Strings, site: dict) -> dict | None:
    """What the page's companion script gets (static/js/companions.js), or None for a page without companions."""
    conf = site["companions"]
    lists = conf["pages"].get(page)
    if not lists:
        return None
    return {"lang": lang, "menu": s.get("menu"), "repo": site["repos"]["companions"],
            "defaults": {"desktop": lists["desktop"], "phone": lists["phone"], "spots": lists.get("spots", {}),
                         "looks": conf.get("looks", {}), "scroll": conf.get("scroll", "fall")}}


def check_output(site: dict) -> list[str]:
    problems = []
    own = re.escape(site["domain"])
    for page in DIST.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        rel = page.relative_to(DIST)
        if "{{" in text:
            problems.append(f"{rel}: an unfilled {{{{placeholder}}}}")
        # Resources (not links people click) must come from this site.
        for m in re.finditer(r'<(?:script|img|source|iframe|link)\b[^>]*?\s(?:src|href)="(https?:)?//(?!' + own + r')', text):
            problems.append(f"{rel}: loads from another host: {m.group(0)[:80]}")
    for css in DIST.rglob("*.css"):
        if re.search(r"url\(\s*['\"]?(https?:)?//", css.read_text(encoding="utf-8")):
            problems.append(f"{css.relative_to(DIST)}: url() to another host")
    return problems


STRINGS: dict[str, Strings] = {}
SITE_DOMAIN = ""   # the site's own domain, from site.json (set in build)


def build() -> list[str]:
    STRINGS.update(load_strings())
    site = load_json(CONTENT / "site.json")
    global SITE_DOMAIN
    SITE_DOMAIN = site["domain"]
    apps = load_json(CONTENT / "apps.json")["apps"]
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(STATIC, DIST / "assets", ignore=shutil.ignore_patterns("favicon.svg", "apple-touch-icon.png"))
    for name in ("favicon.svg", "apple-touch-icon.png"):
        shutil.copy2(STATIC / name, DIST / name)
    count = build_companions()
    check_companion_defaults(site)
    (DIST / "assets" / "css" / "apps.css").write_text(apps_css(apps), encoding="utf-8")
    apps_css_url = "/assets/css/apps.css?v=" + hashlib.sha256(apps_css(apps).encode()).hexdigest()[:10]

    for lang in LANGS:
        s = STRINGS[lang]
        write(PAGES["home"][lang], layout(lang, "home", s, site, title=s("meta.homeTitle"),
                                          description=s("meta.homeDescription"),
                                          body=page_home(lang, s, site, count, apps),
                                          companions=companions_for("home", lang, s, site)))
        write(PAGES["apps"][lang], layout(lang, "apps", s, site, title=s("meta.appsTitle"),
                                          description=s("meta.appsDescription"),
                                          body=page_apps(lang, s, site, apps), extra_css=apps_css_url,
                                          extra_js="js/apps.js",
                                          companions=companions_for("apps", lang, s, site)))
        for which in ("imprint", "privacy"):
            write(PAGES[which][lang], layout(lang, which, s, site, title=s(f"meta.{which}Title"),
                                             description=s(f"meta.{which}Title"), body=page_legal(lang, which, site)))

    robots = "User-agent: *\nAllow: /\n" if site["public"] else "User-agent: *\nDisallow: /\n"
    (DIST / "robots.txt").write_text(robots, encoding="utf-8")

    warnings = []
    if "REPLACE-ME" in json.dumps(site):
        warnings.append("site.json still has a REPLACE-ME link (LinkedIn)")
    problems = check_output(site)
    if problems:
        raise BuildError("\n  ".join(["the output has problems:", *problems]))
    return warnings


def main() -> int:
    try:
        warnings = build()
    except BuildError as e:
        print(f"build failed: {e}", file=sys.stderr)
        return 1
    for w in warnings:
        print(f"warning: {w}")
    files = sum(1 for p in DIST.rglob("*") if p.is_file())
    print(f"built dist/ ({files} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
