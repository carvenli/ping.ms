'use strict';
var Table = require('cli-table')
var program = require('commander')
var mongoose = require('mongoose')

var logger = require('../helpers/logger').create('group')
var Group = require('../models/Group')

var config = require('../config')

mongoose.connect(config.mongoose.dsn,config.mongoose.options,function(err){
  if(err) throw err
  //create
  program
    .command('create')
    .option('-n, --name <s>','name')
    .description('Create group')
    .action(function(opts){
      if(!opts.name)
        throw new Error('Name is required')
      var doc = new Group({
        name: opts.name
      })
      doc.save(function(err){
        if(err) throw new Error('Failed to create group: ' + err)
        logger.info('Group created!')
        process.exit()
      })
    })
  //remove
  program
    .command('remove')
    .option('-n, --name <s>','Name of group to remove')
    .description('Remove group')
    .action(function(opts){
      if(!opts.name) throw new Error('Name required... exiting')
      Group.findOne({name: opts.name},function(err,doc){
        if(err) throw new Error('Could not group to remove ' + err)
        doc.remove(function(err){
          if(err){
            logger.error('Could not remove group: ' + err)
          } else {
            logger.info('Group removed successfully!')
          }
          process.exit()
        })
      })
    })
  //list
  program
    .command('list')
    .description('List groups')
    .action(function(){
      Group.list({},function(err,count,results){
        var table = new Table({
          head: ['Name']
        })
        if(results instanceof Array){
          results.forEach(function(row){
            table.push([
              row.name
            ])
          })
        }
        console.log(table.toString())
        process.exit()
      })
    })
  program.version(config.version)
  var cli = program.parse(process.argv)
  if(!cli.args.length) program.help()
})
