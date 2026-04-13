#!/bin/sh
set -e

echo "Running Prisma migrations..."
node ./node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

echo "Starting Conductor..."
exec node server.js
