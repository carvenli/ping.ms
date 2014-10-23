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

## Installation

Install pre-requisites
* nodejs
* mongodb (if using the admin panel or main)

```
$ git clone -b stable https://github.com/eSited/ping.ms.git
$ cd ping.ms
$ npm install
```

### Configuration

For a default peer installation the configuration is simple.

**config.local.js**
```js
module.exports = { peer: {enabled: true} }
```

This file should be placed in the same folder as `config.js`

## Changelog

### 3.0.0
* Uses axon and raw sockets for peer, adds peer administration through admin.

### 2.0.0
* NodeJS port, using socket.io for inter-peer communication

### 1.0.0
* PHP Version using command line tools (initial release)
