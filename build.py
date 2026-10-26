#!/usr/bin/env python3
"""Builds the site into dist/ (static files, served by Caddy from /srv/ares after deploy.sh).

    python3 build.py      build dist/ (exit 1, with the reasons, if anything is wrong)

Everything a page says comes from content/: site.json (owner, links, settings), strings.<lang>.json
(every interface text, the same keys in both languages), apps.json (the apps page) and legal/ (imprint
and privacy policy, with {{placeholders}} filled from site.json). static/ is copied to /assets/, and the
companions engine (vendor/companions, a git submodule pinned to one commit) to /companions/.

The build refuses to finish when a text is missing in one language, a placeholder is left unfilled, or
a page would load anything from another host (the privacy policy promises it never does).
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
STATIC = ROOT / "static"
DIST = ROOT / "dist"
ENGINE = ROOT / "vendor" / "companions"
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


def asset_url(name: str) -> str:
    """/assets/<name>?v=<hash of the file>, so a changed file is never served from an old cache."""
    path = STATIC / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
    return f"/assets/{name}?v={digest}"


def layout(lang: str, page: str, s: Strings, site: dict, *, title: str, description: str, body: str,
           companions: dict | None = None, extra_css: str = "") -> str:
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
    if companions is not None:
        customize = (f'<button type="button" class="linkish" data-companions-menu>{s("footer.customize")}</button>')
        config = json.dumps(companions, ensure_ascii=False).replace("</", "<\\/")
        scripts += (f'<script type="application/json" id="companions-config">{config}</script>\n'
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
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
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

def tile(id_: str, href: str, icon: str, title: str, sub: str, *, external: bool) -> str:
    rel = ' rel="me noopener"' if external else ""
    return f"""      <a class="tile card window" id="{id_}" href="{esc(href)}"{rel}>
        <span class="tile-icon" aria-hidden="true">{icon}</span>
        <span class="tile-text"><span class="tile-title">{title}</span><span class="tile-sub">{sub}</span></span>
        {ICONS['external' if external else 'arrow']}
      </a>"""


def page_home(lang: str, s: Strings, site: dict, count: int, apps: list[dict]) -> str:
    links = site["links"]
    apps_url = PAGES["apps"][lang]
    stack = "".join(f'<img src="/assets/img/apps/{esc(a["icon"])}" alt="" width="30" height="30">' for a in apps)
    project = lambda key, status: (f'<li><p class="project-name"><strong>{s(f"projects.{key}Name")}</strong> '
                                   f'<span class="status {status}">{s(f"status.{status}")}</span></p>'
                                   f'<p>{s(f"projects.{key}", count=count)}</p></li>')
    # Companions stand on every .window (each needs an id) and sit at the end of text in a [role=document]
    # (companions engine, world.js): here only the short "Currently building" heading, where they cover nothing.
    return f"""<main class="home" data-companions>
  <div class="home-inner">
    <section class="intro window" id="intro" aria-labelledby="name">
      <h1 id="name">Patrik Breeck</h1>
      <p class="lead">{s('home.lead')}</p>
    </section>
    <nav class="tiles" aria-label="{s('home.links')}">
{tile("tile-apps", apps_url, f'<span class="stack">{stack}</span>', s('home.appsTitle'), s('home.appsSub'), external=False)}
{tile("tile-github", links['github'], ICONS['github'], "GitHub", s('home.githubSub'), external=True)}
{tile("tile-linkedin", links['linkedin'], ICONS['linkedin'], "LinkedIn", s('home.linkedinSub'), external=True)}
    </nav>
    <section class="current" aria-labelledby="current-title">
      <div role="document"><h2 class="eyebrow" id="current-title">{s('projects.title')}</h2></div>
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


def page_apps(lang: str, s: Strings, site: dict, apps: list[dict]) -> str:
    contact = esc(site["links"]["contact"][lang])
    cards = []
    for app in apps:
        text = app["text"][lang]
        points = "".join(f"<li>{esc(p)}</li>" for p in text["points"])
        if app["availability"] == "request":
            action = f'<a class="btn primary accent" href="{contact}">{s("apps.request")}{ICONS["arrow"]}</a>'
        elif app["availability"] == "showcase":
            action = ""          # shown on the page, no way to ask for it
        else:
            raise BuildError(f"apps.json: {app['id']} has an unknown availability '{app['availability']}'")
        repo = (f'<a class="btn" href="{esc(app["repo"])}" rel="noopener">{ICONS["github"]}{s("apps.repo")}</a>'
                if app.get("repo") else "")
        cards.append(f"""  <article class="card app app--{esc(app['id'])}" id="{esc(app['id'])}" aria-labelledby="{esc(app['id'])}-name">
    {shots(app, s)}
    <div class="app-body">
      <div class="app-head">
        <img class="app-icon" src="/assets/img/apps/{esc(app['icon'])}" alt="" width="64" height="64">
        <div><h2 id="{esc(app['id'])}-name">{esc(app['name'])}</h2><p class="tagline">{esc(text['tagline'])}</p></div>
      </div>
      <ul class="points">{points}</ul>
      {f'<div class="app-actions">{action}{repo}</div>' if action or repo else ''}
    </div>
  </article>""")
    # data-flow-column: the background line travels beside the cards, not behind them (static/js/flow.js).
    return f"""<main class="apps">
  <header class="page-head">
    <h1>{s('apps.title')}</h1>
    <p class="lead">{s('apps.lead')}</p>
  </header>
  <div class="app-list" data-flow-column>
{chr(10).join(cards)}
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

def write(path: str, text: str):
    out = DIST / path.lstrip("/")
    if path.endswith("/"):
        out = out / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")


def copy_engine() -> int:
    """The companions engine and designs from the pinned submodule; returns how many companions there are."""
    index = ENGINE / "companions" / "index.json"
    if not index.exists():
        raise BuildError("vendor/companions is empty: run `git submodule update --init`")
    for part in ("engine", "companions"):
        shutil.copytree(ENGINE / part, DIST / "companions" / part)
    return len(load_json(index))


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


def build() -> list[str]:
    STRINGS.update(load_strings())
    site = load_json(CONTENT / "site.json")
    apps = load_json(CONTENT / "apps.json")["apps"]
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(STATIC, DIST / "assets", ignore=shutil.ignore_patterns("favicon.svg", "apple-touch-icon.png"))
    for name in ("favicon.svg", "apple-touch-icon.png"):
        shutil.copy2(STATIC / name, DIST / name)
    count = copy_engine()
    (DIST / "assets" / "css" / "apps.css").write_text(apps_css(apps), encoding="utf-8")
    apps_css_url = "/assets/css/apps.css?v=" + hashlib.sha256(apps_css(apps).encode()).hexdigest()[:10]

    for lang in LANGS:
        s = STRINGS[lang]
        menu = s.get("menu")
        companions = {"lang": lang, "menu": menu, "defaults": site["companions"], "repo": site["repos"]["companions"]}
        write(PAGES["home"][lang], layout(lang, "home", s, site, title=s("meta.homeTitle"),
                                          description=s("meta.homeDescription"),
                                          body=page_home(lang, s, site, count, apps), companions=companions))
        write(PAGES["apps"][lang], layout(lang, "apps", s, site, title=s("meta.appsTitle"),
                                          description=s("meta.appsDescription"),
                                          body=page_apps(lang, s, site, apps), extra_css=apps_css_url))
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
