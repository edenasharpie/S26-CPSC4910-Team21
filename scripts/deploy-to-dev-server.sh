#!/bin/bash
set -e

echo "Starting deployment..."

APP_DIR="/home/ubuntu/FleetScore/S26-CPSC4910-Team21"
SERVER_DIR="$APP_DIR/server"
CLIENT_DIR="$APP_DIR/client"

# create directories if they don't exist
mkdir -p $SERVER_DIR/logs
mkdir -p $CLIENT_DIR/logs

# install server dependencies
cd $SERVER_DIR
echo "Installing server dependencies..."
npm ci --production

# install client dependencies
cd $CLIENT_DIR
echo "Installing client dependencies..."
npm ci --production

# restart PM2 processes
echo "Restarting services..."
cd $SERVER_DIR
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js

cd $CLIENT_DIR
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

# save PM2 configuration
pm2 save

echo "Deployment complete."
echo "Process status:"
pm2 status