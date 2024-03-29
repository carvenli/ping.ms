'use strict';
var util = require('util')

var list = require('../helpers/list')
var Page = require('../../models/Page').model


/**
 * List pages
 * @param {Object} req
 * @param {Object} res
 */
exports.list = function(req,res){
  if('post' === req.method.toLowerCase() && req.body.remove && req.body.remove.length){
    list.remove(Page,req.body.remove,function(err,count){
      if(err) req.flash('error','Removed ' + count + ' item(s) before removal failed ' + err)
      else {
        req.flash('success','Deleted ' + count + ' item(s)')
        res.redirect('/page')
      }
    })
  } else {
    var limit = +req.query.limit || 10
    var start = +req.query.start || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Page.list({start: start, limit: limit, search: search},function(err,count,results){
      res.render('page/list',{
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
 * Output an edit or create form
 * @param {Object} req
 * @param {Object} res
 */
exports.form = function(req,res){
  Page.findById(req.query.id,function(err,result){
    if(err){
      req.flash('error',util.inspect(err))
      res.redirect('/page')
    } else{
      if(!result) result = {}
      res.render('page/form',{
        title: req.url.indexOf('edit') > 0 ? 'Edit Page' : 'Create Page',
        page: {
          id: req.query.id || result.id || '',
          title: req.body.title || result.title || '',
          uri: req.body.uri || result.uri || '',
          content: req.body.content || result.content || '',
          active: req.body.active || result.active || true
        }
      })
    }
  })
}


/**
 * Save a page
 * @param {Object} req
 * @param {Object} res
 */
exports.save = function(req,res){
  Page.findById(req.body.id,function(err,doc){
    if(err) throw err
    if(!doc) doc = new Page()
    doc.title = req.body.title
    if(req.body.uri) doc.uri = req.body.uri
    doc.content = req.body.content || ''
    doc.active = req.body.active ? true : false
    doc.save(function(err){
      if(err) req.flash('error',util.inspect(err))
      else req.flash('success','Page saved')
      res.redirect('/page')
    })
  })
}
