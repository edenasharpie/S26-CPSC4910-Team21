#!/bin/bash
set -e

echo "Starting deployment..."

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$APP_DIR/server"
CLIENT_DIR="$APP_DIR/client"

# create directories if they don't exist
mkdir -p "$SERVER_DIR/logs"
mkdir -p "$CLIENT_DIR/logs"

# install server dependencies
cd "$SERVER_DIR"
echo "Installing server dependencies..."
npm ci

# install client dependencies
cd "$CLIENT_DIR"
echo "Installing client dependencies..."
npm ci
echo "Building client application..."

# The browser bundle reads this during build time.
if [ -z "${VITE_API_URL}" ]; then
	if [ -n "${API_URL}" ]; then
		export VITE_API_URL="$API_URL"
	else
		export VITE_API_URL=""
	fi
fi

echo "Using VITE_API_URL=$VITE_API_URL"
npm run build

# restart PM2 processes
echo "Restarting services..."
cd "$SERVER_DIR"
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

cd "$CLIENT_DIR"
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

# save PM2 configuration
pm2 save

echo "Deployment complete."
echo "Process status:"
pm2 status