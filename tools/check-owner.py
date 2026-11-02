#!/usr/bin/env python3
"""Checks the owner-file contract and builds the site with made-up details only.

    python3 tools/check-owner.py    needs the same Node/esbuild setup as build.py; leaves made-up details in dist/
"""

import html
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build

OWNER = {"name": "Erika Musterfrau", "street": "Musterstraße 1", "city": "12345 Musterstadt",
         "email": "owner@example.org"}


class OwnerChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".check-owner-", dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "owner.json"
        self.path.write_text(json.dumps(OWNER, ensure_ascii=False), encoding="utf-8")
        env = patch.dict(os.environ, {"ARES_OWNER_FILE": str(self.path)})
        env.start()
        self.addCleanup(env.stop)

    def test_override_and_default(self):
        self.assertEqual(build.load_owner(), OWNER)
        default = Path(self.temp.name) / ".config" / "ares-empire" / "owner.json"
        default.parent.mkdir(parents=True)
        self.path.rename(default)
        with patch.dict(os.environ, {"HOME": self.temp.name}):
            os.environ.pop("ARES_OWNER_FILE")
            self.assertEqual(build.load_owner(), OWNER)

    def test_invalid_files(self):
        invalid = [b"not JSON: private-sentinel", b"\xff", b"[]", b"null",
                   json.dumps({**OWNER, "private-sentinel": "private-sentinel"}).encode(),
                   json.dumps({k: v for k, v in OWNER.items() if k != "email"}).encode(),
                   b'{"name":"private-sentinel","name":"private-sentinel"}']
        for key in OWNER:
            for value in ("", " \t\n", None, 42, True, [], {}):
                invalid.append(json.dumps({**OWNER, key: value}).encode())
        for index, data in enumerate(invalid):
            with self.subTest(case=index):
                self.path.write_bytes(data)
                with self.assertRaises(build.BuildError) as error:
                    build.load_owner()
                message = str(error.exception)
                self.assertIn(str(self.path), message)
                for value in (*OWNER.values(), "private-sentinel"):
                    self.assertNotIn(value, message)

    def test_unreadable_file(self):
        self.path.unlink()
        self.path.mkdir()
        with self.assertRaises(build.BuildError) as error:
            build.load_owner()
        self.assertIn(str(self.path), str(error.exception))
        self.assertIn("cannot read owner file", str(error.exception))

    def test_legal_escaping(self):
        owner = {key: value + ' & <"sample">' for key, value in OWNER.items()}
        site = build.load_json(build.CONTENT / "site.json")
        for lang in build.LANGS:
            for which in ("imprint", "privacy"):
                text = build.page_legal(lang, which, site, owner)
                for value in owner.values():
                    self.assertIn(html.escape(value, quote=True), text)
                    self.assertNotIn(value, text)

    def test_full_build_and_missing_file(self):
        result = subprocess.run([sys.executable, str(ROOT / "build.py")], cwd=ROOT,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for lang in build.LANGS:
            for which in ("imprint", "privacy"):
                page = build.DIST / build.PAGES[which][lang].lstrip("/") / "index.html"
                text = page.read_text(encoding="utf-8")
                for value in OWNER.values():
                    self.assertIn(html.escape(value, quote=True), text)
            credits = json.loads((build.DIST / "assets" / f"companions-credits.{lang}.json").read_text())
            self.assertIn(OWNER["email"], json.dumps(credits))
        for path in build.DIST.rglob("*"):
            if path.is_file():
                try:
                    text = path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue   # image and font bytes can contain {{ by chance
                self.assertTrue("{{" not in text, f"{path.relative_to(build.DIST)}: unfilled placeholder")
        self.path.unlink()
        result = subprocess.run([sys.executable, str(ROOT / "build.py")], cwd=ROOT,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn(f"build failed: {self.path}: cannot read owner file", result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        for value in OWNER.values():
            self.assertNotIn(value, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
