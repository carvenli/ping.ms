#!/bin/bash

scratch="/tmp/ping.ms-install"
destination="/opt/ping.ms"

echo "Sanitizing"
rm -rf ${scratch}
mkdir -p ${scratch}

echo "Installing packages"
yum -y update
yum -y groupinstall "Development Tools"
yum -y install python26

if [ -z $(which node) ]; then
  echo "Downloading node source"
  cd ${scratch}
  wget -O ${scratch}/node.tar.gz "http://nodejs.org/dist/v0.10.29/node-v0.10.29.tar.gz"

  echo "Extracting source"
  mkdir ${scratch}/node
  tar -xzf ${scratch}/node.tar.gz -C ${scratch}/node --strip 1

  echo "Compiling Node"
  cd ${scratch}/node
  python2.6 ./configure
  make
  make install
  cd ${scratch}
fi

echo "Downloading Ping.ms"
wget -O ${scratch}/ping.ms.tar.gz  "http://ping.ms/downloads/ping.ms-bot-latest-unix-x86_64.tar.gz"

echo "Extracting Ping.ms"
mkdir ${scratch}/ping.ms
tar -xzf ${scratch}/ping.ms.tar.gz -C ${scratch}/ping.ms --strip 1

echo "Installing Dependencies for Ping.ms"
cd ${scratch}/ping.ms
npm --python=python2.6 install

if [ "$(npm -g ls | grep pm2 | wc -l)" -eq 0 ]; then
  echo "Install pm2"
  npm -g install pm2
  npm -g update pm2
fi
pm2 delete ping.ms-bot
pm2 kill

echo "Move completed installation to final destination"
if [ -f "${destination}/config.local.js" ]; then
  cp ${destination}/config.local.js ${scratch}
fi
rm -rf ${destination}
mv ${scratch}/ping.ms ${destination}
if [ -f "${scratch}/config.local.js" ]; then
  cp ${scratch}/config.local.js ${destination}
fi

if [ $(cat /etc/passwd | grep ^node | wc -l) -eq 0 ]; then
  echo "Create user and log folder"
  useradd -m -s /bin/bash node
  mkdir -p /var/log/node/ping.ms
  chown -R node:node /var/log/node
  chown -R node:node ${destination}
fi

echo "Stop any existing bot instance"
cd ${destination}
NODE_ENV=production pm2 start app.js -u node -o /var/log/node/ping.ms/bot-out -e /var/log/node/ping.ms/bot-error -i 1 -n ping.ms-bot

echo "Complete"

