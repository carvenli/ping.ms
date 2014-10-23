'use strict';
var basicAuth = require('basic-auth')
var P = require('bluebird')
var bodyParser = require('body-parser')
var debug = require('debug')('ping.ms:admin:worker')
var flash = require('connect-flash')
var cookieParser = require('cookie-parser')
var express = require('express')
var session = require('express-session')
var fs = require('graceful-fs')
var http = require('http')
var mongoose = require('mongoose')

var worker = require('infant').worker
var app = express()
var server = http.createServer(app)
var RedisStore = require('connect-redis')(session)

var logger = require('../helpers/logger').create('admin')

var config = require('../config')
var routes = require('./routes')

var running = false

//make some promises
P.promisifyAll(server)
P.promisifyAll(mongoose)

//setup app


/**
 * Pretty html output
 * @type {boolean}
 */
app.locals.pretty = true


/**
 * App version
 * @type {string}
 */
app.locals.version = config.version


/**
 * Load moment into jade
 * @type {moment}
 */
app.locals.moment = require('moment')


/**
 * String helpers
 * @type {string}
 * @type {string}
 */
app.locals.S = require('string')


/**
 * Read public ssh key for use in templates
 */
app.locals.ssh = {
  publicKey:
    fs.existsSync(config.admin.ssh.publicKey) ?
      fs.readFileSync(config.admin.ssh.publicKey) :
      null
}

app.use(function(req,res,next){
  var username = config.admin.user
  var password = config.admin.password
  if(!username || !password){
    res.status(500).send('Missing username and/or password')
  }
  function unauthorized(res){
    res.set('WWW-Authenticate','Basic realm=Authorization Required')
    return res.status(401).end()
  }
  var user = basicAuth(req)
  if(!user || !user.name || !user.pass){
    return unauthorized(res)
  }
  if(user.name === username && user.pass === password){
    return next()
  } else {
    return unauthorized(res)
  }
})

//setup templating
app.set('views',__dirname + '/views')
app.set('view engine','jade')

//setup form input and cookies/sessions
app.use(bodyParser.urlencoded({extended:true}))
app.use(bodyParser.json())
app.use(cookieParser(config.admin.cookie.secret))
app.use(session({
  cookie: {
    maxAge: config.admin.cookie.maxAge
  },
  store: new RedisStore(),
  secret: config.admin.cookie.secret,
  resave: true,
  saveUninitialized: true
}))

//setup alerts
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})

//static file server
app.use(express.static(__dirname + '/public'))

//setup routes...
//peer
app.post('/peer',routes.peer.list)
app.post('/peer/save',routes.peer.save)
app.post('/peer/runCommand',routes.peer.runCommand)
app.get('/peer',routes.peer.list)
app.get('/peer/create',routes.peer.create)
app.get('/peer/edit',routes.peer.edit)
app.get('/peer/test',routes.peer.test)
app.get('/peer/refresh',routes.peer.refresh)
app.get('/peer/prepare',routes.peer.prepare)
app.get('/peer/install',routes.peer.install)
app.get('/peer/upgrade',routes.peer.upgrade)
app.get('/peer/updateConfig',routes.peer.updateConfig)
app.get('/peer/start',routes.peer.start)
app.get('/peer/stop',routes.peer.stop)
app.get('/peer/restart',routes.peer.restart)

//group
app.post('/group',routes.group.list)
app.post('/group/save',routes.group.save)
app.get('/group',routes.group.list)
app.get('/group/create',routes.group.create)
app.get('/group/edit',routes.group.edit)

//page
app.post('/page',routes.page.list)
app.post('/page/save',routes.page.save)
app.get('/page',routes.page.list)
app.get('/page/create',routes.page.form)
app.get('/page/edit',routes.page.form)

//home page
app.get('/',routes.index)


/**
 * Start embed system
 * @param {function} done
 * @return {void} fire escape
 */
exports.start = function(done){
  if(!config.admin.user || !config.admin.password){
    var errmsg = 'Refusing to start admin, missing username and/or password'
    logger.warning(errmsg)
    return done(errmsg)
  }
  mongoose.connectAsync(config.mongoose.dsn,config.mongoose.options)
    .then(function(){
      //load all models to avoid odd scoping
      var Group = require('./models/Group')
      var Peer = require('./models/Peer')
      var Page = require('./models/Page')
      return server.listenAsync(config.admin.port,config.admin.host)
    }).then(function(){
      running = true
      logger.info(
          'Admin listening on ' +
          (config.admin.host || '0.0.0.0') +
          ':' + config.admin.port
      )
      done()
    }).catch(done)
}


/**
 * Stop embed system
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(server && running){
    server.close()
    running = false
  }
  done()
}

//worker startup through infant
if(require.main === module)
  worker(server,'ping.ms:admin:worker',exports.start,exports.stop)
