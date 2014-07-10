#!/bin/bash

scratch="/tmp/ping.ms-install"
destination="/opt/ping.ms"

echo "Sanitizing"
rm -rf $scratch
mkdir -p $scratch

echo "Downloading Ping.ms"
wget -O $scratch/ping.ms.tar.gz  "http://ping.ms/downloads/ping.ms-bot-latest-unix-x86_64.tar.gz"

echo "Extracting Ping.ms"
mkdir $scratch/ping.ms
tar -xzf $scratch/ping.ms.tar.gz -C $scratch/ping.ms --strip 1

echo "Installing Dependencies for Ping.ms"
cd $scratch/ping.ms
npm --python=python2.6 install

echo "Stop any existing bot instance"
pm2 delete ping.ms-bot
pm2 kill

echo "Move completed installation to final destination"
if [ -f "$destination/config.local.js" ]; then
  cp $destination/config.local.js $scratch
fi
rm -rf $destination
mv $scratch/ping.ms $destination
if [ -f "$scratch/config.local.js" ]; then
  cp $scratch/config.local.js $destination
fi

echo "Starting updated system"
cd $destination
NODE_ENV=production pm2 start app.js -u node -o /var/log/node/ping.ms/bot-out -e /var/log/node/ping.ms/bot-error -i 1 -n ping.ms-bot

echo "Complete"

