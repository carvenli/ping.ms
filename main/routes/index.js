'use strict';
var async = require('async')
  , shortId = require('shortid')
var Group = require('../../models/group').model
var Bot = require('../../models/bot').model


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  async.series(
    [
      //find groups
      function(next){
        Group.find().sort('name').exec(function(err,results){
          if(err) return next(err.message)
          next(null,results)
        })
      }
    ],
    function(err,results){
      if(err){
        res.render('error',{
          message: err
        })
        return
      }
      var groups = results[0]
      groups.unshift({tag: 'all', name: 'All'})
      res.render('index',{
        sourceId: (req.sessionID + ':' + shortId.generate().replace(/[-_]/g,'')).toUpperCase(),
        groups: groups,
        pageTitle: 'Online Ping Test, Online Trace Route, Internet Test',
        exampleIp: req.headers['x-forwarded-for'] || req.connection.remoteAddress
      })
    }
  )
}


/**
 * Bot list
 * @param {object} req
 * @param {object} res
 */
exports.bot = function(req,res){
  async.series(
    [
      //get bots
      function(next){
        Bot.find({active:true}).sort('location').exec(function(err,results){
          if(err) return next(err.message)
          next(null,results)
        })
      }
    ],
    function(err,results){
      if(err){
        res.render('error',{
          message: err
        })
        return
      }
      res.render('bots',{
        bots: results[0],
        pageTitle: 'Bot List'
      })
    }
  )
}
