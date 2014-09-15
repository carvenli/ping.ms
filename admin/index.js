'use strict';
var async = require('async')
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var flash = require('connect-flash')
var express = require('express')
var session = require('express-session')
var morgan = require('morgan')
var errorHandler = require('errorhandler')

var RedisStore = require('connect-redis')(session)
var app = express()
var server = require('http').createServer(app)

var logger = require('../helpers/Logger').create('admin')
var redis = require('../helpers/redis')

var config = require('../config')
var routes = require('./routes')


/**
 * Start Admin
 * @param {function} started Callback when finished with startup
 */
exports.start = function(started){
  async.series(
    [
      function(next){
        //global tpl vars
        app.locals.pretty = true
        app.locals.version = config.version
        app.locals.moment = require('moment')

        app.set('views',__dirname + '/' + 'views')
        app.set('view engine','jade')
        app.use(bodyParser.urlencoded({extended:false}))
        app.use(bodyParser.json())
        app.use(cookieParser(config.admin.cookie.secret))
        app.use(session({
          cookie: {
            maxAge: config.admin.cookie.maxAge
          },
          store: new RedisStore({client:redis}),
          secret: config.admin.cookie.secret,
          resave: true,
          saveUninitialized: true
        }))
        app.use(flash())
        app.use(function(req,res,next){
          res.locals.flash = req.flash.bind(req)
          next()
        })
        app.use(express.static(__dirname + '/public'))
        app.use(function(req,res,next){
          if(!req.session.staff && req.url.indexOf('/login') < 0){
            res.redirect('/login')
          } else {
            app.locals.user = req.session.staff
            next()
          }
        })

        // development only
        if('development' === process.env.NODE_ENV){
          app.use(morgan('dev'))
          app.use(errorHandler())
        }

        //auth
        app.post('/login',routes.staff.login)
        app.get('/login',routes.staff.login)
        app.get('/logout',routes.staff.logout)

        //staff
        app.post('/staff',routes.staff.list)
        app.post('/staff/save',routes.staff.save)
        app.get('/staff',routes.staff.list)
        app.get('/staff/create',routes.staff.form)
        app.get('/staff/edit',routes.staff.form)

        //groups
        app.post('/groups',routes.groups.list)
        app.post('/groups/save',routes.groups.save)
        app.get('/groups',routes.groups.list)
        app.get('/groups/create',routes.groups.create)
        app.get('/groups/edit',routes.groups.edit)

        //bots
        app.post('/bots',routes.bots.list)
        app.post('/bots/save',routes.bots.save)
        app.get('/bots',routes.bots.list)
        app.get('/bots/create',routes.bots.create)
        app.get('/bots/edit',routes.bots.edit)

        //pages
        app.post('/pages',routes.pages.list)
        app.post('/pages/save',routes.pages.save)
        app.get('/pages',routes.pages.list)
        app.get('/pages/create',routes.pages.form)
        app.get('/pages/edit',routes.pages.form)

        //home page
        app.get('/',routes.index)

        server.listen(config.admin.port,config.admin.host,function(){
          logger.info(
              'Express listening on port ' +
              (config.admin.host || '0.0.0.0') +
              ':' + config.admin.port
          )
          next()
        })
      }
    ],
    started
  )
}
