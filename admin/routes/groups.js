'use strict';
var list = require('../helpers/list')
  , async = require('async')

var Group = require('../../models/group').model


var remove = function(groupId,next){
  var group
  async.series(
    [
      //find the group
      function(next){
        Group.findById(groupId,function(err,result){
          if(err) return next(err)
          group = result
          next()
        })
      },
      //remove the group
      function(next){
        group.remove(next)
      }
    ],
    next
  )
}


/**
 * List groups
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
        res.redirect('/groups')
      }
    )
  } else {
    var limit = parseInt(req.query.limit,10) || 10
    var start = parseInt(req.query.start,10) || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Group.list(
      {
        start: start,
        sort: 'name',
        limit: limit,
        find: search
      },
      function(err,count,results){
        if(err) return res.send(err)
        res.render('groups/list',{
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
 * Create group
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  res.render('groups/create')
}


/**
 * Edit group
 * @param {object} req
 * @param {object} res
 */
exports.edit = function(req,res){
  var group = {}
  async.parallel(
    [
      //get the group
      function(next){
        Group.findById(req.query.id,function(err,result){
          if(err) return next(err)
          if(!result) return next('Group not found')
          group = result
          next()
        })
      }
    ],
    //display the edit page
    function(err){
      if(err){
        req.flash('error',err)
        res.redirect('/groups')
        return
      }
      res.render('groups/edit',{group: group})
    }
  )
}


/**
 * Save group
 * @param {object} req
 * @param {object} res
 */
exports.save = function(req,res){
  var doc
  async.series(
    [
      //find an existing group
      function(next){
        Group.findById(req.body.id,function(err,result){
          if(err) return next(err)
          if(!result) doc = new Group()
          else doc = result
          next()
        })
      },
      //populate data
      function(next){
        doc.name = req.body.name
        doc.tag = req.body.tag || req.body.name.replace(/\s+/g,'').toLowerCase()
        doc.label = req.body.label || (req.body.name + ' Ping Servers').trim()
        doc.limitForAggregate = req.body.limitForAggregate || 1
        next()
      },
      //save the group
      function(next){
        doc.save(next)
      },
      //refind updated group
      function(next){
        Group.findOne({name: doc.name},function(err,result){
          if(err) return next(err)
          if(!result) return next('Could not find group after saving')
          doc = result
          next()
        })
      }
    ],
    function(err){
      if(err){
        req.flash('error',err.message)
        res.redirect('/groups')
        return
      }
      req.flash('success','Group "' + doc.name + '" Saved')
      res.redirect('/groups')
    }
  )
}
