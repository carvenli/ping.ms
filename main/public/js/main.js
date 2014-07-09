/* global socket: false, console: false, async: false */
$(document).ready(function(){
  var pulsarBeat = function(id,failed){
    var glyph = failed ? 'glyphicon-heart-empty' : 'glyphicon-heart'
    //we replace the html here ON PURPOSE to autocancel all other previous animations
    //do not convert to simple class refuckery, thanks
    var pulsar = $('tr#' + id + ' > .pulsar')
    pulsar.html('<span class="glyphicon ' + glyph + ' text-danger"/>')
    pulsar.find('span').fadeIn(0,function(){pulsar.find('span').fadeOut(1000)})
  }
  var pulsarFinal = function(id){
    var row = $('tr#' + id)
    var loss = row.find('.loss').html()
    var glyph = 'glyphicon-question-sign text-warning'
    if(loss === '0')
      glyph = 'glyphicon-ok-sign text-success'
    if(loss === '100')
      glyph = 'glyphicon-remove-sign text-danger'
    //we replace the html here ON PURPOSE to autocancel all other previous animations
    //do not convert to simple class refuckery, thanks
    $('tr#' + id + ' > .pulsar').html('<span class="glyphicon ' + glyph + '"/>')
  }
  var dnsResults = {}
  var pingResults = {}
  var pingInit = function(data){
    //destroy the Waiting message if any
    $('tr#waiting').remove()
    //dump existing if any (shouldn't be?)
    $('tr#'+data.id).remove()
    //eventually add some smart row placement here
    data.set.min = '-'
    data.set.max = '-'
    data.set.avg = '-'
    data.set.loss = '-'
    pingResults[data.id] = []
    //$('#pingTable > tbody').append(tplPingRow({data: data}))
  }
  var pingAgain = function(){}
  var pingResult = function(data){
    var min = '-'
    var max = '-'
    var avg = '-'
    var fails = 0
    var currentlyFailed = false
    pingResults[data.id].push(data)
    pingResults[data.id].forEach(function(e){
      if(!e.error){
        var rtt = e.received - e.sent
        if('-' === min || rtt < min) min = rtt
        if('-' === max || rtt > max) max = rtt
        avg = ('-' === avg) ? rtt : (avg + rtt) / 2
        currentlyFailed = false
      } else {
        fails++
        currentlyFailed = true
      }
    })
    pingTableRowUpdate(data.id,{
      min: min, max: max, avg: avg,
      fails: fails, total: pingResults[data.id].length,
      currentlyFailed: currentlyFailed
    })
    console.log(pingResults)
    pingHost(data.id,pingResults[data.id][0].target,pingResult)
  }
  var pingComplete = function(data){
    pulsarFinal(data.id)
  }
  var pingTable = $('#pingTable > tbody')
  var pingTableSort = function(){
    var comparisonFn = function(){
      return function(a,b){
        return $(a).attr('id').localeCompare($(b).attr('id'))
      }
    }
    var rows = pingTable.find('tr:gt(1)').toArray().sort(comparisonFn())
    for (var i = 0; i < rows.length; i++){ pingTable.append(rows[i]) }
  }
  var pingTableInit = function(){
    pingTable.find('tr:gt(1)').each(function(){ $(this).remove() })
    $('#pingResultWrapper').removeClass('hidden')
  }
  var pingTableRowInit = function(index,dnsResult){
    pingTable.find('tr#waiting').addClass('hidden')
    pingResults[index] = []
    var newRow = $('#ping-row-template').clone()
    newRow.attr('id',index)
    if(dnsResult.sponsor.url){
      var link = newRow.find('td.location > a')
      link.attr('href',dnsResult.sponsor.url)
      link.html(dnsResult.location)
    } else
      newRow.find('td.location').html(dnsResult.location)
    newRow.find('td.ip').html(dnsResult.ip[0])
    pingTable.append(newRow)
    pingTableSort()
    pingTable.find('tr#' + index).removeClass('hidden')
  }
  var pingTableRowUpdate = function(index,pingResult){
    var row = pingTable.find('tr#' + index)
    row.find('.min').html(pingResult.min)
    row.find('.avg').html(pingResult.avg)
    row.find('.max').html(pingResult.max)
    row.find('.loss').html((pingResult.fails / pingResult.total) * 100)
    pulsarBeat(index,pingResult.currentlyFailed)
  }
  /**
   * Ping a Host with a Bot
   * @param {string} id  Bot id
   * @param {string} ip
   * @param {function} done
   */
  var pingHost = function(id,ip,done){
    if(!done) done = function(){}
    console.log('sending ping request for ' + ip + ' to ' + id)
    socket.emit('ping',{bot: id, ip: ip},function(result){
      console.log('got ping result from ' + id,result.result)
      result.result.id = id
      done(result.result)
    })
  }
  $('#ping').submit(function(e){
    e.preventDefault()
    var host = $('#host').val().replace(/\s+/g,'')
    if('' === host) return(false)
    pingTableInit()
    var commonArgs = {
      host: host,
      group: $('#group').val()
    }
    //send the DNS resolve to the backend
    //socket.on('dnsResult',)
    //send the ping submission to the backend
    //socket.on('pingResult',pingResult)
    //socket.on('pingComplete',pingComplete)
    socket.emit('resolve',commonArgs,function(data){
      dnsResults = data.results
      console.log('got resolve results',dnsResults)
      for(var i in dnsResults){
        if(dnsResults.hasOwnProperty(i)){
          pingTableRowInit(i,dnsResults[i])
          pingHost(i,dnsResults[i].ip[0],pingResult)
        }
      }
      //pingInit({})
    })
  })
})
