'use strict';
var config = require('../config')
  , Bot = require('../helpers/bot.js')

var bot = new Bot(config.get('bot'))
bot.start()
