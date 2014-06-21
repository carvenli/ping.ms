'use strict';
var list = require('../helpers/list')
  , async = require('async')

var Bot = require('../../models/bot').model
  , Group = require('../../models/group').model


var remove = function(botId,next){
  var bot
  async.series(
    [
      //find the bot
      function(next){
        Bot.findById(botId,function(err,result){
          if(err) return next(err)
          bot = result
          next()
        })
      },
      //remove the bot
      function(next){
        bot.remove(next)
      }
    ],
    next
  )
}

var groupList = function(next){
  Group.list(
    {sort: 'name'},
    function(err,count,results){
      if(err) return next(err)
      next(null,results)
    }
  )
}

  /**
 * List bots
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  if('post' === req.method.toLowerCase() && req.body.remove && req.body.remove.length){
    var count = 0
    async.each(
      req.body.remove,
      function(item,next){
        count++
        remove(item,next)
      },
      function(err){
        if(err)
          return req.flash('error','Removed ' + count + ' item(s) before removal failed ' + err)
        req.flash('success','Deleted ' + count + ' item(s)')
        res.redirect('/bots')
      }
    )
  } else {
    var limit = parseInt(req.query.limit,10) || 10
    var start = parseInt(req.query.start,10) || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Bot.list(
      {
        start: start,
        sort: 'location',
        limit: limit,
        search: search
      },
      function(err,count,results){
        if(err) return res.send(err)
        res.render('bots/list',{
          page: list.pagination(start,count,limit),
          count: count,
          search: search,
          limit: limit,
          list: results
        })
      })
  }
}


/**
 * Create bot
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('bots/create')
}


/**
 * Edit bot
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  async.parallel(
    {
      //get the bot
      bot:
        function(next){
          Bot.findById(req.query.id,function(err,result){
            if(err) return next(err)
            if(!result) return next('Bot not found')
            next(null,result)
          })
        },
      //get the groups
      groups: groupList
    },
    //display the edit page
    function(err,results){
      if(err){
        req.flash('error',err)
        res.redirect('/bots')
        return
      }
      res.render('bots/edit',results)
    }
  )
}


/**
 * Save bot
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var doc
  async.series(
    [
      //find an existing bot
      function(next){
        Bot.findById(req.body.id,function(err,result){
          if(err) return next(err)
          if(!result) doc = new Bot()
          else doc = result
          next()
        })
      },
      //populate data
      function(next){
        var defaultPort = 4176
        doc.location = req.body.location
        doc.host = req.body.host
        if(!doc.port && !req.body.port) doc.port = defaultPort
        if(req.body.port) doc.port = (0 < req.body.port < 65536) ? req.body.port : defaultPort
        doc.secret = req.body.secret || doc.secret || ''
        doc.groups = req.body.groups || ''
        doc.notes = req.body.notes || ''
        doc.sponsor.name = req.body.sponsorName || ''
        doc.sponsor.url = req.body.sponsorUrl || ''
        doc.active = req.body.active ? true : false
        next()
      },
      //save the bot
      function(next){
        doc.save(next)
      },
      //refind updated bot
      function(next){
        Bot.findOne({location: doc.location},function(err,result){
          if(err) return next(err)
          if(!result) return next('Could not find bot after saving')
          doc = result
          next()
        })
      }
    ],
    function(err){
      if(err){
        req.flash('error',err.message)
        res.redirect('/bots')
        return
      }
      req.flash('success','Bot "' + doc.location + '" Saved')
      res.redirect('/bots')
    }
  )
}
