'use strict';
exports.pages = require('./pages')
exports.staff = require('./staff')
exports.bots = require('./bots')

exports.index = function(req,res){
  res.redirect('/bots')
}
