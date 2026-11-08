<p align="center">
  <img src="docs/images/banner.png" alt="patrikbreeck.com in its three looks: red and gold, dark, and light" width="100%">
</p>

# patrikbreeck.com

The source of **[patrikbreeck.com](https://patrikbreeck.com)**: a hand-built static site in English and German, with
three looks and pixel companions that live on the page.

## What it does

- **Three looks.** Dark (the default), light, and red and gold, switched in the header. Every colour is a token per
  look, and a slow line of light drifts behind each page.
- **Two languages.** Every page in English and German. The build stops when a text exists in only one of them.
- **The iPhone apps.** The apps page presents the five [Ares iPhone apps](https://github.com/Ares-Empire/empire-ios),
  one card each, with their screens.
- **Pixel companions.** Small characters walk along the page, find edges to stand on and never cover text. Visitors
  choose who appears and how they look.
- **Private by design.** No cookies, no analytics, nothing loaded from another host (fonts included), and a strict
  Content-Security-Policy.
- **No framework.** One Python script, standard library only, builds every page. Node only bundles the companions.

## Screenshots

| Dark | Light | Red and gold |
|:---:|:---:|:---:|
| <img src="docs/images/home-dark.jpg" alt="The home page, dark"> | <img src="docs/images/home-light.jpg" alt="The home page, light"> | <img src="docs/images/home-red.jpg" alt="The home page, red and gold"> |

<table>
  <tr>
    <td width="72%"><img src="docs/images/apps-dark.jpg" alt="The apps page with Aresium chosen"></td>
    <td><img src="docs/images/home-phone.jpg" alt="The home page on a phone"></td>
  </tr>
  <tr>
    <td align="center">The apps page</td>
    <td align="center">On a phone</td>
  </tr>
</table>

## How it's built

| Path | What it is |
|---|---|
| `content/` | Every text in both languages, the links, the apps page and the legal pages. |
| `static/` | The stylesheet, the look switcher, the background line, the apps page and the companions' menu. |
| `vendor/companions` | The companions, a git submodule pinned to one commit. |
| `build.py` | Builds `dist/` from the above. |
| `tools/` | A local server with the production Content-Security-Policy, screenshots, link preview cards. |

The server builds the site with `deploy.sh` and Caddy serves the result.

## Run it locally

```sh
git submodule update --init               # the companions (their repository is not public yet)
npm ci --prefix vendor/companions/web     # esbuild, to bundle them
python3 tools/check-owner.py              # builds dist/ with made-up owner details
python3 tools/serve.py                    # http://127.0.0.1:8790/en/
```

The imprint and privacy policy need the site owner's name and address, which live in a small file outside the
repository; `tools/check-owner.py` uses made-up ones. Everything else is in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): the layout, the apps page, the companions and the link previews.

## Tests and CI

GitHub Actions runs the **owner contract** on every push, pull request and manual start, without checking out
submodules. The exact local command (Python standard library, invented owner details only) is:

```sh
python3 tools/check-owner.py OwnerChecks.test_override_and_default OwnerChecks.test_invalid_files OwnerChecks.test_unreadable_file OwnerChecks.test_legal_escaping
```

The full `python3 tools/check-owner.py` also runs `OwnerChecks.test_full_build_and_missing_file`. It stays local:
first follow “Run it locally” to initialize the private companions submodule and install its public npm packages.
GitHub CI has no private-repository access and does not build the full site.

## License

All rights reserved. The code is public to read, but it is not licensed for reuse: not the design, the texts or the
pictures. Parts from others keep their own licences:

- The companions in `vendor/companions` come from their own repository, under the PolyForm Noncommercial License
  1.0.0. The characters from games, apps and brands among them belong to their owners, as the companions' `NOTICE.md`
  lists (the site shows it under Credits in the companions' menu).
- The font Space Grotesk in `static/fonts/`: SIL Open Font License 1.1, see
  [OFL-SpaceGrotesk.txt](static/fonts/OFL-SpaceGrotesk.txt).
- The GitHub and LinkedIn logos in `build.py` are trademarks of their owners.
