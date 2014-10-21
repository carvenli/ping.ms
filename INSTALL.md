# Prerequisites

NodeJS (preferably recent, but any 0.10.x will do), and some form of process
watcher / daemonizer to keep services running

## NodeJS Installation

### CentOS 5/6

Remove any previously installed (local RPM or other repo) NodeJS: 
```
yum remove -y nodejs nodejs-npm npm
```
Install NodeSource repo (which also pulls in EPEL if not already enabled), and
then NodeJS and build utils (for node-gyp):
```
yum install -y gcc gcc-c++ make curl
curl -sL https://rpm.nodesource.com/setup | bash -
yum install -y nodejs
```
Optionally, to get the 2.x npm
```
npm -g update
npm -g update
npm -g update
```
Three runs seems sufficient to ensure things migrated properly.  Sometimes, the first one will break npm completely, in which case:
```
yum reinstall -y nodejs
```
And retry the global upgrade again.  If that fails again, note what's in `/usr/lib/node_modules` and perhaps remove the whole subtree and reinstall and then try it.  Some globally installed packages can interfere with the upgrade (I think `npm-check-updates` may be one of them...) Following the upgrade globally reinstall anything you actually needed.

Verify installation with:
```
node --version ; npm --version
```
Which should output something like:
```
v0.10.32
2.1.4
```

## Daemontools Installation (preferred process babysitter)

### CentOS 5/6

Ensure gcc is installed, then as `root`:
```
mkdir -p /package ; chmod 1755 /package ; cd /package ; curl -sL http://cr.yp.to/daemontools/daemontools-0.76.tar.gz | tar xzvf -
sed -e"s/^\(gcc .*strings\)$/\1 -include \/usr\/include\/errno.h/" -i /package/admin/daemontools-0.76/src/conf-cc
cd /package/admin/daemon* ; ./package/install
init q
#below commands are for CentOS 6 but safe to run anyway (will fail on CentOS 5 since it still uses inittab)
echo -e "start on runlevel [12345]\nrespawn\nexec /command/svscanboot" > /etc/init/svscan.conf
initctl reload-configuration ; initctl start svscan
```

# Bot Installation

## CentOS 5/6

```
$ wget http://ping.ms/downloads/scripts/install-centos-5.sh -O - | bash -
```

### Generic (Others)

```
[setup node, npm, and pm2 properly]
$ wget http://ping.ms/downloads/ping.ms-bot-latest-unix-x86_64.tar.gz -O - | tar -xvzf - -C /opt
```

Populate the config file to **/opt/ping.ms/config.local.js**

EG
```js
'use strict';
module.exports = {
  bot: {
    enabled: true,
    connections: [
      {uri: 'http://ping.ms', secret: 'YOUR-SECRET-HERE'}
    ]
  }
}
```

Restart the bot

```
$ pm2 restart ping.ms-bot
```

# Bot Update

## CentOS 5/6

```
$ wget http://ping.ms/downloads/scripts/update-centos-5.sh -O - | bash -
```
