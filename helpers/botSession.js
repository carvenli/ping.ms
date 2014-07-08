'use strict';
var async = require('async')
  , Logger = require('../helpers/logger')
  , DNS = require('../helpers/dns.js')

//setup our netPing session early and save it for reuse privately
var netPing = require('net-ping')
var netPingSession = netPing.createSession({
  _debug: false,
  networkProtocol: netPing.NetworkProtocol.IPv4,
  packetSize: 56,
  ttl: 255,
  retries: 0,
  timeout: 1000
})


/**
 * Ping a host
 * @param {string} ip
 * @param {function} done
 * @return {*}
 */
var pingHost = function(ip,done){
  if(!ip) return done('IP not valid')
  //use net-ping to see if our ip is alive
  netPingSession.pingHost(ip,function(err,target,sent,received){
    //notify userspace we have a ping result
    var res = {
      target: target,
      sent: (sent) ? +sent : false,
      received: (received)? +received : false
    }
    done(err,res)
  })
}



/**
 * BotSession Object
 *  this gets generated within Bot once for each ping/trace request (target)
 * @param {object} opts Options object
 * @constructor
 */
var BotSession = function(opts){
  var that = this
  that.options = opts
  that.logger = Logger.create(that.options.tag)
  that.logger.info('BotSession Constructor')
}


/**
 * Use the bot instance to resolve a host
 * @param {string} host
 * @param {function} done
 */
BotSession.prototype.resolve = function(host,done){
  var self = this
  self.logger.info('BotSession.resolve: ' + host)
  async.series(
    [
      function(next){
        if(!host) return next('resolve invalid host')
        DNS.create(host).resolve(function(err,result){
          if(err) return next(err)
          next(null,result)
        })
      }
    ],
    function(err,results){
      done(err,results instanceof Array && results.length ? results[0] : null)
    }
  )
}


/**
 * Ping an IP
 * @param {string} ip
 * @param {function} done
 */
BotSession.prototype.ping = function(ip,done){
  var self = this
  self.logger.info('BotSession.ping: ' + ip)
  async.series(
    [
      function(next){
        pingHost(ip,next)
      }
    ],
    function(err,results){
      if(err) return done(err)
      done(null,results[0])
    }
  )
}


/**
 * Create instance
 * @param {object} opts
 * @return {BotSession}
 */
BotSession.create = function(opts){
  return new BotSession(opts)
}


/**
 * Export the BotSession
 * @type {BotSession}
 */
module.exports = BotSession
