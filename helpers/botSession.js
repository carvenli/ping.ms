'use strict';
var async = require('async')
  , util = require('util')
  , Logger = require('../helpers/logger')
  , DNS = require('../helpers/dns.js')
var EventEmitter = require('events').EventEmitter

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
  EventEmitter.apply(that)
  that.options = opts
  that.logger = Logger.create(that.options.tag)
  that.logger.info('BotSession Constructor')
  that.pingTarget = null
  that.pingTimeout = null
}
util.inherits(BotSession,EventEmitter)


/**
 * Use the bot instance to resolve a host
 * @param {string} host
 * @param {function} done
 */
BotSession.prototype.resolve = function(host,done){
  var that = this
  that.logger.info('BotSession.resolve: ' + host)
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
 * Start pinging an IP
 * @param {string} handle
 * @param {string} ip
 */
BotSession.prototype.pingStart = function(handle,ip){
  var that = this
  that.pingTarget = ip
  that.logger.info('BotSession.pingStart[' + handle + ']: ' + ip)
  var ping = function(){
    that.pingTimeout = setTimeout(ping,1000)
    pingHost(ip,function(err,result){
      if(err) return that.emit('pingResult',{error: err})
      that.emit('pingResult',result)
    })
  }
  ping()
}


/**
 * Stop pinging an IP
 */
BotSession.prototype.pingStop = function(){
  var that = this
  that.stopped = true
  that.logger.info('BotSession.pingStop: ' + that.pingTarget)
  clearTimeout(that.pingTimeout)
  that.emit('pingResult',{stopped: true})
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
