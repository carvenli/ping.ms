'use strict';
var async = require('async')
var dns = require('dns')
var hostbyname = require('hostbyname')
var IP = require('ip')

var Logger = require('../helpers/logger')


/**
 * Resolve a host to IP
 * @param {string} host
 * @param {function} done
 */
var hostToIp = function(host,done){
  hostbyname.resolve(host,'v4',function(err,results){
    if(err) return done(err)
    //filter out known bogus (hijacked) results
    var filteredResults = []
    async.eachSeries(results,function(r,next){
      var rv = false
      if(-1 === [
        //Charter DNS bogus hosts
        '198.105.244.24',
        '198.105.244.35',
        '198.105.254.24',
        '198.105.254.35'
      ].indexOf(r))
        rv = r
      var priv = (rv) ? IP.isPrivate(rv) : false
      if(priv){
        if(-1 !== [
          //Unblock certain internal IPs
          '10.9.8.254'
        ].indexOf(rv))
          priv = false
      }
      if(rv && !priv) filteredResults.push(rv)
      next()
    },function(err){
      done(err,filteredResults || [])
    })
  })
}


/**
 * Resolve an IP to a PTR
 * @param {array|string} ip
 * @param {function} done
 */
var ipToPtr = function(ip,done){
  var ptr = []
  if(!(ip instanceof Array)) ip = [ip]
  async.each(
    ip,
    function(i,next){
      var idx = ip.indexOf(i)
      var addr = IP.cidrSubnet(i + '/32').firstAddress
      if(!addr){
        ptr[idx] = []
        next()
      } else{
        dns.reverse(i,function(err,result){
          ptr[idx] = result || []
          next(err)
        })
      }
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
 * Resolve a hostname to IP(s)
 * @param {array|string} host
 * @param {function} done
 */
DNS.prototype.ip = function(host,done){
  var that = this
  if(!(host instanceof Array)) host = [host]
  that.logger.info('DNS.ip"' + host.join(',') + '"\n')
  async.series(
    [
      function(next){
        hostToIp(host,function(err,addrs){
          next(err,addrs)
        })
      }
    ],
    done
  )
}


/**
 * Resolve an IP to PTR
 * @param {array|string} ip
 * @param {function} done
 */
DNS.prototype.ptr = function(ip,done){
  var that = this
  if(!(ip instanceof Array)) ip = [ip]
  that.logger.info('DNS.ptr"' + ip.join(',') + '"\n')
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
  var that = this
  that.logger.info('DNS.resolve: ' + that.host)
  async.waterfall(
    [
      //resolve the host to ip
      function(next){
        hostToIp(that.host,next)
      },
      function(ip,next){
        ipToPtr(ip,function(err,ptr){
          if(err) ptr = ip
          next(null,{
            host: that.host,
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
