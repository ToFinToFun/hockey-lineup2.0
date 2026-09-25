#!/bin/sh
# Stålstadens – uppstart i produktion.
# 1. Databasmigrering. Misslyckas den startar inte appen, och Coolify behåller
#    den tidigare versionen.
# 2. Servern.
set -e
node scripts/migrate.mjs
exec node dist/index.js
