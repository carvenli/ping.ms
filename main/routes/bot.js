'use strict';
var config = require('../../config')
  , async = require('async')

var Bot = require('../../models/bot').model


/**
 * Bot list
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  var ongoingBotList, botList
  async.series(
    [
      //ongoing bots
      function(next){
        ongoingBots.list(function(err,result){
          if(err) return next(err)
          ongoingBotList = result
          next()
        })
      },
      //bot list
      function(next){
        Bot
          .find()
          .where('active',true)
          .select('title uri ongoing sortLetter episodeCount')
          .sort('sortLetter title')
          .exec(function(err,result){
            if(err) return next(err)
            botList = result
            next()
          })
      }
    ],
    function(err){
      if(err){
        res.render('error',{message: err})
      } else {
        var lists = [[],[]]
        botList.forEach(function(row){
          if(row.sortLetter.match(/#|a|b|c|d|e|f|g|h|i|j|k|l|m/i)) lists[0].push(row)
          else lists[1].push(row)
        })
        res.render('botList',{
          pageTitle: 'Anime Series List',
          lists: lists,
          ongoingBotList: ongoingBotList
        })
      }
    }
  )
}
