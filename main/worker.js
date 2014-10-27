'use strict';
var amp = require('amp')
var AmpMessage = require('amp-message')
var axon = require('axon')
var P = require('bluebird')
var bodyParser = require('body-parser')
var flash = require('connect-flash')
var cookieParser = require('cookie-parser')
var express = require('express')
var session = require('express-session')
var http = require('http')
var worker = require('infant').worker
var moment = require('moment')
var mongoose = require('mongoose')
var net = require('net')
var promisePipe = require('promisepipe')
var shortId = require('shortid')
var validator = require('validator')

var app = express()
var server = http.createServer(app)
var io = require('socket.io')(server)
var RedisStore = require('connect-redis')(session)

var config = require('../config')

var Group = require('../models/Group').model
var Peer = require('../models/Peer').model
var Page = require('../models/Page').model

var peerConnections = {}

//make some promises
P.promisifyAll(server)
P.promisifyAll(mongoose)
P.promisifyAll(net)


/**
 * Global template vars
 * @type {{moment: (moment|exports)}}
 */
app.locals = {
  moment: moment
}

//setup templating
app.set('views',__dirname + '/views')
app.set('view engine','jade')

//static file server
app.use(express.static(__dirname + '/public'))

//middleware
app.use(bodyParser.urlencoded({extended:true}))
app.use(bodyParser.json())
app.use(cookieParser(config.main.cookie.secret))
app.use(flash())
app.use(session({
  cookie: {
    maxAge: config.main.cookie.maxAge
  },
  store: new RedisStore(),
  secret: config.main.cookie.secret,
  resave: true,
  saveUninitialized: true
}))
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})

//try to find a news page matching the uri, if not continue
app.use(function(req,res,next){
  Page.findOne({uri: req.path},function(err,result){
    if(err) return next(err.message)
    if(!result) return next()
    //found a page render it
    res.render('page',{
      pageTitle: result.title,
      page: result
    })
  })
})

//setup a default route
app.get('/',function(req,res){
  P.try(function(){
    return Group.find().sort('name').exec()
  }).then(function(results){
    res.render('index',{
      sourceId: (req.sessionID + ':' + shortId.generate()),
      groups: results,
      exampleIp:req.headers['x-forwarded-for'] || req.connection.remoteAddress
    })
  }).catch(function(err){
    res.render('error',{
      message: err
    })
  })
})

app.get('/error',function(req,res){
  res.render('error',{error: 'fucked up'})
})

//setup a list of peers
app.get('/peers',function(req,res){
  P.try(function(){
    return Peer.find({active: true}).sort('primaryGroup location').exec()
  }).then(function(results){
    res.render('peers',{
      peers: results,
      pageTitle: 'Peer List'
    })
  }).catch(function(err){
    res.render('error',{
      message: err
    })
  })
})


/**
 * Connect to a given peer for the restful connect
 * @param {Peer} peer
 * @return {P}
 */
var peerConnect = function(peer){
  return new P(function(resolve,reject){
    if(peerConnections[peer._id])
      process.nextTick(function(){resolve(peerConnections[peer._id])})
    var client = axon.socket('req')
    peerConnections[peer._id] = client
    P.promisifyAll(client)
    client.connectAsync(+peer.port,peer.host || '127.0.0.1')
      .then(function(){
        resolve(client)
      }).catch(reject)
  })
}


/**
 * Connect to a given peer for a result stream
 * @param {Peer} peer
 * @param {string} type
 * @param {string} ip
 * @param {number} count
 * @return {P}
 */
var peerStreamConnect = function(peer,type,ip,count){
  return new P(function(resolve,reject){
    var client = net.connect(+peer.portStream,peer.host || '127.0.0.1')
    client.on('connect',function(){
      //update seen time
      Peer.findByIdAndUpdate(peer._id,{'metrics.dateSeen': new Date()})
        .exec().then(function(){
          //compose and send the request
          var msg = new AmpMessage()
          msg.push({type: type, ip: ip, count: count || 4})
          client.end(msg.toBuffer())
          //hand back the ready to be used socket which should have data incoming
          resolve(client)
        },reject)
    })
    client.on('error',reject)
  })
}


/**
 * Iterate a group of bots with a user defined handler function
 * @param {string} group
 * @param {function} action
 * @return {P}
 */
var groupAction = function(group,action){
  var query = {active: true}
  //filter by group if we can
  if('all' !== group.toLowerCase())
    query.groups = new RegExp(',' + group + ',','i')
  //get peers and submit queries
  return P.try(function(){
    return Peer.find(query).sort('location').exec()
  }).then(function(results){
    var promises = []
    var i = (results.length - 1)
    for(; i>=0; i--)
      promises.push(action(results[i]))
    return P.all(promises)
  })
}

//setup some socket.io handlers
io.on('connection',function(socket){
  socket.on('peerList',function(req,reply){
    var query = {active: true}
    //filter by group if we can
    if(req.group){
      if('all' !== req.group.toLowerCase())
        query.groups = new RegExp(',' + req.group + ',','i')
    }
    P.try(function(){
      return Peer.find(query).sort('groups location').exec()
    }).then(function(results){
      reply({results: results})
    }).catch(function(err){
      reply({error: err})
    })
  })
  socket.on('resolve',function(req,reply){
    var results = {}
    //dont lookup dns for ips
    if(validator.isIP(req.host)){
      groupAction(req.group,function(peer){
        results[peer._id] = {handle: shortId.generate(), ip: [req.host]}
      }).then(function(){
        reply({results: results})
      })
    }
    //otherwise do lookup
    else{
      groupAction(req.group,function(peer){
        return peerConnect(peer)
          .timeout(config.peer.connectTimeout)
          .then(function(sock){
            return sock.sendAsync('resolve',{domain: req.host})
          })
          .then(function(result){
            results[peer._id] = {handle: shortId.generate(),ip: result}
          })
      })
        .then(function(){
          reply({results: results})
        })
        .catch(function(err){
          console.error('resolve failed',err)
          reply({error: err})
        })
    }
  })
  socket.on('pingStart',function(req){
    var peerId = req.bot
    var resEvent = 'pingResult:' + req.handle
    var parser = new amp.Stream()
    parser.on('data',function(buff){
      var msg = new AmpMessage(buff)
      var err = msg.shift()
      var result = msg.shift()
      if(err) socket.emit(resEvent,{error: err})
      else {
        result.id = peerId
        socket.emit(resEvent,result)
      }
    })
    P.try(function(){
      return Peer.findById(peerId).exec()
    }).then(function(peer){
      return peerStreamConnect(peer,'ping',req.ip)
        .timeout(config.peer.connectTimeout)
    }).then(function(sock){
      return promisePipe(sock,parser)
    }).then(function(){
      return Peer.findByIdAndUpdate(peerId,{$inc:{hits: 1}}).exec()
    }).catch(function(err){
      socket.emit(resEvent,{error: err})
    })
  })
})


/**
 * Start embed system
 * @param {function} done
 */
exports.start = function(done){
  mongoose.connectAsync(config.mongoose.dsn,config.mongoose.options)
    .then(function(){
      return server.listenAsync(config.main.port,config.main.host)
    }).then(done).catch(done)
}


/**
 * Stop embed system
 * @param {function} done
 */
exports.stop = function(done){
  server.close()
  mongoose.disconnectAsync()
    .then(done).catch(done)
}


//worker startup through infant
if(require.main === module)
  worker(server,'ping.ms:main:worker',exports.start,exports.stop)

