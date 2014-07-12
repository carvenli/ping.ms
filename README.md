ping.ms
=======

Website and bot for ping.ms

## Getting your server added to ping.ms

If you wish to contribute a location make sure and contact us: admins@ping.ms

Make sure and tell us the following information:

* Your name
* Your website (for us to link to)
* Your company name
* Server IP
* Access to the server (this is optional)

Thanks

## Bot Installation

### CentOS 5/6

```
$ wget http://ping.ms/downloads/scripts/install-centos-5.sh -O - | bash -
```

#### Generic (Others)

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

## Bot Update

### CentOS 5/6

```
$ wget http://ping.ms/downloads/scripts/update-centos-5.sh -O - | bash -
```

## Release Procedure

### Update Version

The version needs to be bumped in 3 places:
* /config.js
* /package.json
* /package.bot.json

### Commit to Master

Push the committed files that are ready for release to master.

Alternatively, if this is a bug release then cherry pick the bug commit
from master to stable.

If the master is a final copy merge it into stable and push the repo.

### Build Bot Version

On the production server for the main web interface run the following script:

```
$ cd /opt/ping.ms
$ scripts/bot-build.js 2.x.x
```

The script takes the destination as the 2nd argument in production this can be omitted.

When this is omitted it will write the file to **/opt/ping.ms/main/public/downloads** and
will also update the sym link to **/opt/ping.ms/main/public/downloads/ping.ms-bot-latest-unix-x86_64.gz**

### Update the Bots

If a bot update is required (this is only true if there has been a change specific to the bot folder and its helpers.

#### CentOS 5

```
$ wget http://ping.ms/downloads/scripts/update-centos-5.sh -O - | bash -
```

#### Generic (Others)

```
$ wget http://ping.ms/downloads/ping.ms-bot-latest-unix-x86_64.tar.gz -O - | tar -xvzf - -C /opt
```
