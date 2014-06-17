'use strict';
var async = require('async')

var Bot = require('../../models/bot').model


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.render('index',{
    pageTitle: 'Free Anime Online, Ongoing Anime Series'
  })
}


/**
 * Create User
 * @type {exports}
 */
exports.user = require('./user')
/**
 * Bot routes
 * @type {exports}
 */
exports.bot = require('./bot')
