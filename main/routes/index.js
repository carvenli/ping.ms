'use strict';
var async = require('async')
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
      res.render('index',{
        groups: results[0],
        pageTitle: 'Online Ping Test, Online Trace Route, Internet Test'
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
        Bot.find().sort('location').exec(function(err,results){
          if(err) return next(err.message)
          next(null,results)
        })
      }
    ],
    function(err,results){
      if(err){
        res.render('error',{
          bots: results[0],
          message: err
        })
      }
    }
  )
}
