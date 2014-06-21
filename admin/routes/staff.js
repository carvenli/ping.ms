'use strict';
var Model = require('../../models/staff').model
  , list = require('../helpers/list')

exports.list = function(req,res){
  if('post' === req.method.toLowerCase() && req.body.remove && req.body.remove.length){
    list.remove(Model,req.body.remove,function(err,count){
      if(err) req.flash('error','Removed ' + count + ' item(s) before removal failed ' + err)
      else {
        req.flash('success','Deleted ' + count + ' item(s)')
        res.redirect('/staff')
      }
    })
  } else {
    var limit = parseInt(req.query.limit,10) || 10
    var start = parseInt(req.query.start,10) || 0
    var search = req.query.search || ''
    if(start < 0) start = 0
    Model.list({start: start, limit: limit, search: search},function(err,count,results){
      res.render('staff/list',{
        page: list.pagination(start,count,limit),
        count: count,
        search: search,
        limit: limit,
        list: results
      })
    })
  }
}

exports.form = function(req,res){
  Model.findById(req.query.id,function(err,result){
    if(err){
      req.flash('error',err)
      res.redirect('/staff')
    } else{
      if(!result) result = {}
      res.render('staff/form',{
        title: req.url.indexOf('edit') > 0 ? 'Edit Staff Member' : 'Create Staff Member',
        staff: {
          id: req.query.id || result.id || '',
          name: req.body.name || result.name || '',
          email: req.body.email || result.email || '',
          active: req.body.active || result.active || true
        }
      })
    }
  })
}

exports.save = function(req,res){
  Model.findById(req.body.id,function(err,doc){
    if(!doc) doc = new Model()
    doc.name = req.body.name
    doc.email = req.body.email
    if(req.body.password) doc.password = req.body.password
    doc.active = req.body.active ? true : false
    doc.save(function(err){
      if(err){
        req.flash('error',err)
        exports.form(req,res)
      } else {
        req.flash('success','Staff member saved')
        res.redirect('/staff')
      }
    })
  })
}

exports.login = function(req,res){
  if('post' === req.method.toLowerCase()){
    Model.login(req.body.email,req.body.password,function(err,staff){
      if(err){
        req.flash('error',err)
        res.render('login')
      } else {
        req.session.staff = staff.toJSON()
        res.redirect('/')
      }
    })
  } else {
    res.render('login')
  }
}

exports.logout = function(req,res){
  delete req.session.staff
  res.redirect('/login')
}
