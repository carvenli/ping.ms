'use strict';
var async = require('async')

var propCopy = function(obj){return JSON.parse(JSON.stringify(obj))}

/**
 * Constructor
 * @param {string} host
 * @constructor
 */
var DNS = function(host){
  var that = this
  that.logger = require('../helpers/logger').create('DNS')
  that.host = host.toString()
}

var targetHostToIp = function(host,cb){
  require('hostbyname').resolve(host,'v4',function(err,results){
    var ip = [host]
    if(!err && results.length) ip = results
    cb(null,ip)
  })
}

var targetIpToPtr = function(ip,cb){
  var dns = require('dns')
    , ptr = []
  async.each(ip,function(i,next){
    dns.reverse(i,function(err,results){
      if(!err && results.length) ptr = results
      next(null,ptr)
    })
  },
    function(err,results){cb(null,results)}
  )
}

DNS.prototype.resolve = function(replyFn){
  var self = this
  self.logger.info('DNS.resolve "' + self.host + '"\n',replyFn)
  async.waterfall(
    [
      function(next){targetHostToIp(self.host,next)},
      function(ip,next){
        targetIpToPtr(ip,
          function(err,ptr){
            next(err,{host:self.host,ip:ip,ptr:ptr})
          }
        )
      }
    ],
    function(err,results){replyFn(results)}
  )
}

/**
 * Create instance
 * @param {string} host
 * @return {DNS}
 */
DNS.create = function(host){
  return (new DNS(host))
}

/**
 * Export module
 * @type {DNS}
 */
module.exports = DNS
