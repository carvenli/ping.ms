'use strict';
var mongoose = require('mongoose')
  , validate = require('mongoose-validator').validate
  , bcrypt = require('bcrypt')
  , async = require('async')
  , schema, model

//load plugins
mongoose.plugin(require('mongoose-merge-plugin'))
mongoose.plugin(require('mongoose-list'),{
  'sort': 'email',
  'sort_fields': ['email']
})

//define schema
schema = new mongoose.Schema({
  email: {
    label: 'Email',
    type: String,
    lowercase: true,
    unique: true,
    required: true,
    index: true,
    validate: [
      validate('len','6','100'),
      validate('isEmail')
    ]
  },
  password: {
    label: 'Password',
    type: String,
    required: true,
    select: false,
    get: function(){ return '********' },
    set: function(v){
      return bcrypt.hashSync(v,bcrypt.genSaltSync(12))
    },
    validate: [
      validate('len','8','64')
    ]
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
    },
    dateSeen: {
      label: 'Last Successful Login',
      type: {},
      index: true,
      default: null
    },
    dateFail: {
      label: 'Last Failed Login',
      type: Date,
      index: true
    }
  }
})

schema.statics.login = function(email,password,done){
  var now = new Date()
    , errorMessage = 'Invalid email address or password'
    , user = {}
  async.series(
    [
      //find the user
      function(next){
        model.collection.findOne({email: email}, function(err,result){
          if(err) return next(err)
          if(!result) return next('No user found')
          user = result
          next()
        })
      },
      //verify password
      function(next){
        bcrypt.compare(password,user.password,function(err,isMatch){
          if(err) return next(err)
          if(!isMatch) return next('Invalid password')
          next()
        })
      },
      //find fresh result
      function(next){
        model.findOne({email: email},function(err,result){
          if(err) return next(err)
          if(!result) return next('Invalid User 2nd try')
          user = result
          next()
        })
      },
      //update last login
      function(next){
        model.findByIdAndUpdate(user.id,{'metrics.dateSeen': now},next)
      }
    ],
    //process results
    function(err){
      if(err){
        console.error('Failed login ' + err)
        if(!user.id) return done(errorMessage)
        model.findByIdAndUpdate(user.id,{'metrics.dateFail': now},function(err){
          if(err) console.error('Failed to update failed login stamp ' + err)
          done(errorMessage)
        })
      } else done(null,user)
    }
  )
}

// handling of created/modified
schema.pre('save',function(next){
  var now = new Date()
    ,_ref = this.get('metrics.dateCreated')
  if((void 0) === _ref || null === _ref)
    this.metrics.dateCreated = now
  this.metrics.dateModified = now
  next()
})

//setup the model
model = mongoose.model('User',schema)

//export model
exports.name = 'user'
exports.description = 'User Model'
exports.schema = schema
exports.model = model