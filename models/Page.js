'use strict';
var markdown = require('markdown').markdown
var mongoose = require('mongoose')
var validator = require('validator')

var urlname = require('../helpers/urlname')

var schema

//load plugins
mongoose.plugin(require('mongoose-list'))

schema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  uri: {
    type: String,
    require: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  html: {
    type: String
  },
  active: {
    label: 'Active',
    type: Boolean,
    required: true,
    default: false
  },
  metrics: {
    dateCreated: {
      label: 'Creation Date',
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    dateModified: {
      label: 'Last Modified',
      type: Date,
      default: Date.now,
      required: true,
      index: true
    }
  }
})

//content validator and sanitizer
schema.pre('save',function(next){
  var now = new Date()
    ,_ref = this.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    this.metrics.dateCreated = now
  this.metrics.dateModified = now
  if(!this.uri) this.uri = '/' + urlname.format(this.title)
  try {
    this.content = validator.trim(this.content)
    this.content = validator.escape(this.content)
    //this.content = sanitize(this.content).xss()
    this.html = markdown.toHTML(this.content)
    next()
  } catch(err){
    next(err)
  }
})


/**
 * Model name
 * @type {string}
 */
exports.name = 'Page'


/**
 * Model description
 * @type {string}
 */
exports.description = 'Page model'


/**
 * Mongoose schema
 * @type {mongoose.Schema}
 */
exports.schema = schema


var Model
if(mongoose.models.Page)
  Model = mongoose.model('Page')
else
  Model = mongoose.model('Page',schema)


/**
 * Mongoose model
 * @type {mongoose.Model}
 */
exports.model = Model
