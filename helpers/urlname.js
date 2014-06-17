'use strict';

var convertSuperscriptToNumeral = function(name){
  var numeralSuperscript = {
    '⁰': '0',
    '¹': '1',
    '²': '2',
    '³': '3',
    '⁴': '4',
    '⁵': '5',
    '⁶': '6',
    '⁷': '7',
    '⁸': '8',
    '⁹': '9'
  }
  var i = name.length
  while(i--){
    for(var k in numeralSuperscript){
      if(numeralSuperscript.hasOwnProperty(k)){
        if(name[i] === k){
          name[i] = numeralSuperscript[k]
        }
      }
    }
  }
  return name
}

exports.format = function(name){
  name = name.toLowerCase()
  name = name.replace(/[\/\\\\.'"\+\[\]:\(\)]+/g,'')
  name = convertSuperscriptToNumeral(name)
  name = name.replace('&amp;','and')
  name = name.replace(/[^0-9a-z\s\-]+/g,' ')
  name = name.trim()
  name = name.replace(/\s+/g,'-')
  return name
}
