'use strict';
var io = require('socket.io-client')
  , config = require('./../config')
  , async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')
  , netPing = require('net-ping')

var nPs = netPing.createSession({
  _debug: false,
  networkProtocol: netPing.NetworkProtocol.IPv4,
  packetSize: 56,
  ttl: 255,
  retries: 0,
  timeout: 1000
})

var conn = config.get('bot.connections')
async.times(conn.length,function(n,next){
  conn[n].logger = require('../helpers/logger').create('BOT:' + n)
  conn[n].mux = io.connect(conn[n].uri)
  //event response handlers
  conn[n].handleLogin = function(data,cb){
    var self = this
    if(data.error){
      self.logger.error('auth failed!')
      clearTimeout(self.loginTimer)
      self.loginTimer = setTimeout(self.login,config.get('bot.loginDelay.authRetry'))
    } else {
      self.logger.info('authorized')
      clearTimeout(self.loginTimer)
      self.loginTimer = setTimeout(self.login,config.get('bot.loginDelay.auth'))
      //individual command handlers
      self.execResolve= self.execResolve || function(data,reply){
        self.dnsData = {
          host: data.host,
          ip: data.host,
          ptr: data.host
        }
        var hostToIP = function(next){
          hostbyname.resolve(self.dnsData.host,'v4',function(err,results){
            if(!err && results[0]) self.dnsData.ip = results[0]
            next()
          })
        }
        var ipToPTR = function(next){
          dns.reverse(self.dnsData.ip,function(err,results){
            if(!err && results[0]) self.dnsData.ptr = results[0]
            next()
          })
        }
        async.series([hostToIP,ipToPTR],
          function(){reply(self.dnsData)}
        )
      }
      self.execPing = self.execPing || function(data){
        if(!data.count) data.count = 4
        self.pingData = {
          dns: self.dnsData,
          host: data.host,
          ip: data.host,
          ptr: data.host,
          results: []
        }
        async.series([
          function(next){
            hostbyname.resolve(self.pingData.host,'v4',function(err,results){
              if(!err && results[0]) self.pingData.ip = results[0]
              next()
            })
          },function(next){
            dns.reverse(self.pingData.ip,function(err,results){
              if(!err && results[0]) self.pingData.ptr = results[0]
              next()
            })
          },function(next){
            self.mux.emit('pingInit.' + data.handle,self.pingData)
            async.timesSeries(data.count || 1,function(seq,repeat){
              nPs.pingHost(self.pingData.ip,function(error,target,sent,received){
                var result = {
                  target: target,
                  sent: (sent) ? +sent : false,
                  received: (received) ? +received : false,
                  error: error
                }
                self.pingData.results.push(result)
                setTimeout(function(){repeat()},1000)
                self.mux.emit('pingResult.' + data.handle,self.pingData)
              })
            },function(){
              next()
            })
          }
        ],function(){
          self.mux.emit('pingComplete.' + data.handle,self.pingData)
        })
      }
      self.mux.removeListener('execPing',self.execPing)
      self.mux.on('execPing',self.execPing)
      if('function' === typeof cb){
        cb()
        cb = null
      }
    }
  }
  conn[n].login = function(cb){
    var self = this
    self.mux.emit('botLogin',{secret: self.secret},
    function(data){self.handleLogin(data,cb)}
  )}
  conn[n].connect = function(cb){
    var self = this
    var done = cb
    self.logger.info('connecting to ' + self.uri)
    self.mux.on('connect',function(){
      self.logger.info('connected')
      self.login(function(){
        if('function' === typeof done){
          done()
          done = null
        }
      })
    })
  }
  next(null,conn[n])
},function(err,set){
  async.each(set,function(i,done){i.connect(done)})
})

/*
//routing
app.get('/ping',function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
})

app.get('/trace',function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
  if(!dest)
    return res.status(403).end('dest not supplied')
  //do the traceroute
  var traceData = {
    dest: dest,
    ip: dest,
    ptr: dest,
    ttl: nPs.ttl
  }
  async.series(
    [
      function(next){
        //get the ip in case we were given a hostname in dest
        //this returns an ip string even if the input is already
        hostbyname.resolve(traceData.dest,'v4',function(err,results){
          if(!err && results[0]) traceData.ip = results[0]
          next()
        })
      },
      function(next){
        //get the ptr for the ip
        dns.reverse(traceData.ip,function(err,results){
          if(!err && results[0]) traceData.ptr = results[0]
          next()
        })
      },
      function(next){
        nPs.traceRoute(traceData.ip,traceData.ttl,
          function(error,target,ttl,sent,received){
            var ms = received - sent
            if(error)
              if(error instanceof netPing.TimeExceededError)
                res.jsonStream({ttl:ttl,source:error.source,rtt:ms})
              else
                res.jsonStream({ttl:ttl,error:error,rtt:ms})
            else
              res.jsonStream({ttl:ttl,target:target,rtt:ms})
          },
          function(error,target){
            if(error)
              next(target + ': ' + error.toString())
            else
              next()
          }
        )
      }
    ],
    function(){
      res.jsonStream(traceData)
      res.end()
    }
  )
})
*/
