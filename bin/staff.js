'use strict';
var program = require('commander')
  , Table = require('cli-table')
  , mongoose = require('mongoose')
  , config = require('../config')
  , logger = require('../helpers/logger').create('Staff Manage')
  , Staff = require('../models/staff').model

mongoose.connect(config.get('mongoose.dsn'),config.get('mongoose.options'),function(err){
  if(err) throw err
  //create
  program
    .command('create')
    .option('-e, --email <s>','Email')
    .option('-p, --password <s>','Password')
    .option('-n, --name <s>','Name')
    .description('Create new staff member')
    .action(function(opts){
      if(!opts.email || !opts.password){
        throw new Error('Email and password are required')
      }
      var doc  = new Staff({
        email: opts.email,
        password: opts.password,
        name: opts.name,
        active: true
      })
      doc.save(function(err){
        if(err) throw new Error('Failed to create staff member: ' + err)
        logger.info('Staff member created!')
        process.exit()
      })
    })
  //update
  program
    .command('update')
    .option('-e, --email <s>','Email used to look up staff member')
    .option('-E, --newEmail <s>','New email address if its being changed')
    .option('-p, --password <s>','Password')
    .option('-n, --name <s>','Name')
    .description('Update existing staff member')
    .action(function(opts){
      if(!opts.email) throw new Error('Email is required')
      Staff.findOne({email: opts.email},function(err,doc){
        if(err) throw new Error('Could not lookup staff member to edit ' + err)
        if(opts.newEmail) doc.email = opts.newEmail
        if(opts.password) doc.password = opts.password
        if(opts.name) doc.name = opts.name
        doc.save(function(err){
          if(err) throw new Error('Could not save staff member: ' + err)
          logger.info('Staff member updated successfully!')
          process.exit()
        })
      })
    })
  //remove
  program
    .command('remove')
    .option('-e, --email <s>','Email of staff member to remove')
    .description('Remove staff member')
    .action(function(opts){
      if(!opts.email) throw new Error('Email is required... exiting')
      Staff.findOne({email: opts.email},function(err,doc){
        if(err) throw new Error('Could not lookup staff member to remove ' + err)
        doc.remove(function(err){
          if(err){
            logger.error('Could not remove staff member: ' + err)
          } else {
            logger.info('Staff member removed successfully!')
          }
          process.exit()
        })
      })
    })
  //list
  program
    .command('list')
    .description('List staff members')
    .action(function(){
      Staff.list({},function(err,count,results){
        var table = new Table({
          head: ['Email','Name','Active']
        })
        if(results instanceof Array){
          results.forEach(function(row){
            table.push([row.email,row.name.name,row.active ? 'Yes' : 'No'])
          })
        }
        console.log(table.toString())
        process.exit()
      })
    })
  program.version(config.get('version'))
  var cli = program.parse(process.argv)
  if(!cli.args.length) program.help()
})
