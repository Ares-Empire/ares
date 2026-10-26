#!/usr/bin/env bash
# Builds the site and puts it live on this server: dist/ -> /srv/ares, which Caddy serves as patrikbreeck.com
# (/etc/caddy/Caddyfile). The companions engine comes from the commit vendor/companions is pinned to.
set -euo pipefail
cd "$(dirname "$0")"

git submodule update --init --quiet
python3 build.py

# Swap the new build in whole, so visitors never get half old, half new files.
rm -rf /srv/ares.new /srv/ares.old
cp -r dist /srv/ares.new
chmod -R a+rX /srv/ares.new
if [ -d /srv/ares ]; then mv /srv/ares /srv/ares.old; fi
mv /srv/ares.new /srv/ares
rm -rf /srv/ares.old
echo "deployed to /srv/ares"
