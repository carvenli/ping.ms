'use strict';
var async = require('async')
var debug = require('debug')('ping.ms:helper:dns')
var dns = require('dns')
var hostbyname = require('hostbyname')
var IP = require('ip')


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
        //Charter Dns bogus hosts
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
var Dns = function(host){
  var that = this
  that.host = host.toString()
}


/**
 * Resolve a hostname to IP(s)
 * @param {array|string} host
 * @param {function} done
 */
Dns.prototype.ip = function(host,done){
  if(!(host instanceof Array)) host = [host]
  debug('dns.ip"' + host.join(',') + '"\n')
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
Dns.prototype.ptr = function(ip,done){
  if(!(ip instanceof Array)) ip = [ip]
  debug('dns.ptr"' + ip.join(',') + '"\n')
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
Dns.prototype.resolve = function(done){
  var that = this
  debug('dns.resolve: ' + that.host)
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
 * Export module
 * @type {Dns}
 */
module.exports = Dns
