'use strict';
var mongoose = require('mongoose')
var schema

//load plugins
mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  }
})


/**
 * Export Model
 * @type {mongoose.Model}
 */
module.exports = mongoose.model('Group',schema)
