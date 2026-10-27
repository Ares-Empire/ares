#!/usr/bin/env bash
# Builds the site and puts it live on this server: dist/ -> /srv/ares, which Caddy serves as patrikbreeck.com
# (/etc/caddy/Caddyfile). The companions come from the commit vendor/companions is pinned to: build.py builds their
# file with Node and esbuild, which npm ci installs at the version the submodule pins.
set -euo pipefail
cd "$(dirname "$0")"

git submodule update --init --quiet
npm ci --prefix vendor/companions/web --no-audit --no-fund --loglevel=error
python3 build.py

# Swap the new build in whole, so visitors never get half old, half new files.
rm -rf /srv/ares.new /srv/ares.old
cp -r dist /srv/ares.new
chmod -R a+rX /srv/ares.new
if [ -d /srv/ares ]; then mv /srv/ares /srv/ares.old; fi
mv /srv/ares.new /srv/ares
rm -rf /srv/ares.old
echo "deployed to /srv/ares"
