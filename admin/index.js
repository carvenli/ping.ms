'use strict';
var async = require('async')
var flash = require('connect-flash')

var express = require('express')
var app = express()
var server = require('http').createServer(app)

var config = require('../config')
var logger = require('../helpers/logger').create('admin')
var RedisStore = require('connect-redis')(express)

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
        app.locals.version = config.get('version')
        app.locals.moment = require('moment')

        app.set('views',__dirname + '/' + 'views')
        app.set('view engine','jade')
        app.use(express.urlencoded())
        app.use(express.json())
        app.use(express.cookieParser(config.get('admin.cookie.secret')))
        app.use(express.session({
          cookie: {
            maxAge: config.get('admin.cookie.maxAge')
          },
          store: new RedisStore(),
          secret: config.get('admin.cookie.secret')
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
        if('development' === app.get('env')){
          app.use(express.logger('dev'))
          app.use(express.errorHandler())
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

        server.listen(config.get('admin.port'),config.get('admin.host'),function(){
          logger.info(
              'Express listening on port ' +
              (config.get('admin.host') || '0.0.0.0') +
              ':' + config.get('admin.port')
          )
          next()
        })
      }
    ],
    started
  )
}
