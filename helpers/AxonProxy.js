'use strict';
var async = require('async')
var axon = require('axon')
//var debug = require('debug')('ping.ms:helper:proxy')



/**
 * AxonProxy session
 * @param {socket.io.Socket} io
 * @param {object} reqRepTarget (target to send rpc calls to)
 * @param {object} pubSubTarget (target to subscribe to)
 * @constructor
 */
var AxonProxy = function(io,reqRepTarget,pubSubTarget){
  if(!io)
    throw new Error('Cannot setup proxy without source socket.io socket')
  if(!reqRepTarget.host)
    throw new Error('Cannot setup proxy without a reqRepTarget ip')
  if(!reqRepTarget.port)
    throw new Error('Cannot setup proxy without a reqRepTarget port')
  if(!pubSubTarget.host)
    throw new Error('Cannot setup proxy without a pubSubTarget ip')
  if(!pubSubTarget.port)
    throw new Error('Cannot setup proxy without a pubSubTarget port')
  this.io = io
  this.reqRepTarget = reqRepTarget
  this.pubSubTarget = pubSubTarget
  this.reqRepSocket = axon.socket('req')
  this.pubSubSocket = axon.socket('sub-emitter')
  this._request = {}
  this._on = {}
}


/**
 * Add a new request
 * @param {string} request
 * @param {function} handler
 */
AxonProxy.prototype.request = function(request,handler){
  this._request[request] = handler
}


/**
 * Add a new event handler
 * @param {string} event
 * @param {function} handler
 */
AxonProxy.prototype.on = function(event,handler){
  this._on[event] = handler
}


/**
 * Handle a new event from the client
 * @param {object} req
 * @param {function} next
 * @return {*}
 */
AxonProxy.prototype.clientHandler = function(req,next){
  if('function' === typeof next) return next()
}


/**
 * Start the proxy session
 * @param {function} done
 */
AxonProxy.prototype.start = function(done){
  var that = this
  async.series(
    [
      //connect to the remote axon for req/rep
      function(next){
        that.reqRepSocket(+that.reqRepTarget.port,that.reqRepTarget.host,next)
      },
      //connect to the remote axon for pubSub
      function(next){
        that.pubSubSocket(+that.pubSubTarget.port,that.pubSubTarget.host,next)
      },
      //register socket handlers
      function(next){
        that.io.on('*',that.clientHandler.bind(that))
        next()
      }
    ],
    done
  )
}


/**
 * Export AxonProxy
 * @type {AxonProxy}
 */
module.exports = AxonProxy
