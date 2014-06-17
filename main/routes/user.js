'use strict';
var model = require('../../models/user').model

exports.create = function(req,res){
  res.render('createUser')
}

exports.save = function(req,res){
  model.findOne({email: req.body.email},function(err,doc){
    if(!doc) doc = new model()
    doc.email = req.body.email
    doc.password = req.body.password
    doc.save(function(err){
      if(err){
        req.flash('error','There was an Error saving your account')
      } else {
        req.flash('success','User saved')
        res.redirect('/')
      }
    })
  })
}

exports.login = function(req,res){
  if('post' === req.method.toLowerCase()){
    model.login(req.body.email,req.body.password,function(err,user){
      if(err){
        req.flash('error',err)
        res.render('createUser')
      } else {
        req.session.user = user.toJSON()
        res.redirect('/')
      }
    })
  } else {
    res.render('login')
  }
}

exports.logout = function(req,res){
  delete req.session.user
  res.redirect('/')
}