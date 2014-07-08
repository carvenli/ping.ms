'use strict';
var async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')
  , Logger = require('../helpers/logger')


/**
 * Resolve a host to IP
 * @param {string} host
 * @param {function} done
 */
var hostToIp = function(host,done){
  hostbyname.resolve(host,'v4',function(err,results){
    if(err) return done(err)
    done(null,results || [])
  })
}


/**
 * Resolve an IP to a PTR
 * @param {array|string} ip
 * @param {function} done
 */
var ipToPtr = function(ip,done){
  var ptr = {}
  if(!(ip instanceof Array)) ip = [ip]
  async.each(
    ip,
    function(i,next){
      dns.reverse(i,function(err,result){
        if(err) return next(err)
        ptr[i] = result || 'none'
        next()
      })
    },
    function(err){
      done(err,ptr)
    }
  )
}



/**
 * Constructor
 * @param {string} host
 * @constructor
 */
var DNS = function(host){
  var that = this
  that.logger = Logger.create('DNS')
  that.host = host.toString()
}


/**
 * Resolve an IP to PTR
 * @param {array|string} ip
 * @param {function} done
 */
DNS.prototype.ptr = function(ip,done){
  var self = this
  if(!(ip instanceof Array)) ip = [ip]
  self.logger.info('DNS.ipToPtr"' + ip.join(',') + '"\n')
  async.series(
    [
      function(next){
        ipToPtr(ip,function(err,ptr){
          next(err,ptr)
        })
      }
    ],
    done
  )
}


/**
 * Resolve a host
 * @param {function} done
 */
DNS.prototype.resolve = function(done){
  var self = this
  self.logger.info('DNS.resolve "' + self.host + '"\n')
  async.waterfall(
    [
      //resolve the host to ip
      function(next){
        hostToIp(self.host,next)
      },
      function(ip,next){
        ipToPtr(ip,function(err,ptr){
          next(err,{
            host: self.host,
            ip: ip,
            ptr: ptr
          })
        })
      }
    ],
    done
  )
}


/**
 * Create instance
 * @param {string} host
 * @return {DNS}
 */
DNS.create = function(host){
  return new DNS(host)
}


/**
 * Export module
 * @type {DNS}
 */
module.exports = DNS
