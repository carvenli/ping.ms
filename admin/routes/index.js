'use strict';
exports.pages = require('./pages')
exports.staff = require('./staff')
exports.groups = require('./groups')
exports.bots = require('./bots')

exports.index = function(req,res){
  res.redirect('/bots')
}
