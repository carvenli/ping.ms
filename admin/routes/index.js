'use strict';


/**
 * Pages routes
 * @type {exports}
 */
exports.page = require('./page')


/**
 * Groups routes
 * @type {exports}
 */
exports.group = require('./group')


/**
 * Peer routes
 * @type {exports}
 */
exports.peer = require('./peer')


/**
 * Main route
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.redirect('/peer')
}
