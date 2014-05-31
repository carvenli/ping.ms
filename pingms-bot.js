'use strict';
var express = require('express')
  , app = express()
  , server = require('http').createServer(app)
  , config = require('./config')
  , async = require('async')
  , hostbyname = require('hostbyname')
  , dns = require('dns')
  , netPing = require('net-ping')

//Utility functions
var nPs = netPing.createSession({
  networkProtocol: netPing.NetworkProtocol.IPv4,
  packetSize: 56,
  ttl: 255,
  timeout: 1000
})
var net = {
  ping: function(opts,cb){
    var pingData = {
      dest: opts.dest,
      ip: opts.dest,
      ptr: opts.dest,
      min: null,
      avg: null,
      max: null,
      mdev: 0
    }
    async.series([
        function(next){
          hostbyname.resolve(opts.dest,'v4',function(err,results){
            if(!err && results[0]) pingData.ip = results[0]
            next()
          })
        },function(next){
          dns.reverse(pingData.ip,function(err,results){
            if(!err && results[0]) pingData.ptr = results[0]
            next()
          })
        },function(next){
          async.timesSeries(opts.count || 1,function(seq,repeat){
              nPs.pingHost(pingData.ip,function(error,target,sent,received){
                var result = {
                  error: error,
                  target: target,
                  sent: (sent) ? +sent : false,
                  received: (received) ? +received : false,
                  rtt: (received && sent) ? (received - sent) : false
                }
                if(result.rtt){
                  if(null === pingData.min || result.rtt < pingData.min)
                    pingData.min = result.rtt
                  if(null === pingData.max || result.rtt > pingData.max)
                    pingData.max = result.rtt
                  pingData.avg = (null === pingData.avg) ? result.rtt : (pingData.avg + result.rtt) / 2
                }
                setTimeout(function(){repeat(null,result)},1000)
              })
            },function(err,results){
              pingData.results = results
              next()
            })
        }
      ],function(){
        cb(pingData)
      })
  },
  trace: function(opts,cb){
    var traceData = {
      dest: opts.dest,
      ip: opts.dest,
      ptr: opts.dest,
      ttl: nPs.ttl,
      results: []
    }
    async.series(
      [
        function(next){
          hostbyname.resolve(opts.dest,'v4',function(err,results){
            if(!err && results[0]) traceData.ip = results[0]
            next()
          })
        },
        function(next){
          dns.reverse(traceData.ip,function(err,results){
            if(!err && results[0]) traceData.ptr = results[0]
            next()
          })
        },
        function(next){
          nPs.traceRoute(traceData.ip,traceData.ttl,
            function(error,target,ttl,sent,rcvd){
              var ms = rcvd - sent
              if(!traceData.results[ttl])
                traceData.results[ttl] = []
              if(error){
                if(error instanceof netPing.TimeExceededError){
                  console.log (target + ': ' + error.source + ' (ttl=' + ttl + ' ms=' + ms + ')')
                  traceData.results[ttl].push({source: error.source,rtt: ms})
                } else {
                  console.log (target + ': ' + error.toString() + ' (ttl=' + ttl + ' ms=' + ms + ')')
                  traceData.results[ttl].push({error: error,rtt: ms})
                }
              } else {
                console.log (target + ': ' + target + ' (ttl=' + ttl + ' ms=' + ms + ')')
                traceData.results[ttl].push({target: target,rtt: ms})
              }
            },
            function(error,target){
              if(error)
                next(target + ': ' + error.toString())
              else
                next()
            }
          )
        }
          /*
                           function(error,target,sent,received){
                             var result = {
                               error: error,
                               target: target,
                               sent: (sent) ? +sent : false,
                               received: (received) ? +received : false,
                               rtt: (received && sent) ? (received - sent) : false
                             }
                             if(result.rtt){
                               if(null === traceData.min || result.rtt < traceData.min)
                                 traceData.min = result.rtt
                               if(null === traceData.max || result.rtt > traceData.max)
                                 traceData.max = result.rtt
                               traceData.avg = (null === traceData.avg) ? result.rtt : (traceData.avg + result.rtt) / 2
                             }
                             setTimeout(function(){repeat(null,result)},1000)
                           })
                         }
          */
      ],
      function(){
        async.forEach(traceData.results,
          function(result,done){
            if(result.source){
              dns.reverse(traceData.ip,function(err,results){
                if(!err && results[0]) result.source = results[0]
                done()
              })
            }
          },
          function(){
            cb(traceData)
          }
        )
      }
    )
  }
}

app.use(express.urlencoded())

//main route handlers
var pingHandler = function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
  if(!dest)
    return res.status(403).end('dest not supplied')
  net.ping({dest:dest,count:4},function(rv){
    res.end(JSON.stringify(rv,null,1))
  })
}
var traceHandler = function(req,res){
  //check the request URL
  if(config.get('bot.allowedSources').indexOf(req.ip) < 0)
    return res.status(403).end('not-allowed from ' + req.ip)
  //check the given dest
  var dest = req.param('dest')
  if(!dest)
    return res.status(403).end('dest not supplied')
  net.trace({dest:dest},function(rv){
    res.end(JSON.stringify(rv,null,1))
  })
}

//routing
app.get('/ping',pingHandler)
app.get('/trace',traceHandler)

server.listen(config.get('bot.listen.port'),config.get('bot.listen.host'),function(err){
  if(err) return console.log(err)
  console.log('ping.ms bot running on port ' + config.get('bot.listen.port'))
})
