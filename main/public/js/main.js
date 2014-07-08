/* global socket: false, Handlebars: false */
$(document).ready(function(){
  var tplPingRow = Handlebars.compile($('#ping-row-template').html())
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
    $('#pingTable > tbody').append(tplPingRow({data: data}))
  }
  var pingResult = function(data){
    var row = $('tr#'+data.id)
    var min = '-'
    var max = '-'
    var avg = '-'
    var fails = 0
    var currentlyFailed = false
    pingResults[data.id].push(data)
    pingResults.forEach(function(e,i,o){
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
    var loss = (fails / pingResults.length) * 100
    row.find('.ip').html(data.set.ip)
    row.find('.min').html(min)
    row.find('.avg').html(avg)
    row.find('.max').html(max)
    row.find('.loss').html(loss)
    pulsarBeat(data.id,currentlyFailed)
  }
  var pingComplete = function(data){
    pulsarFinal(data.id)
  }
  $('#ping').submit(function(e){
    e.preventDefault()
    var host = $('#host').val().replace(/\s+/g,'')
    if('' === host) return(false)
    $('#pingResultWrapper').removeClass('hidden')
    $('#pingTable > tbody').empty()
    var commonArgs = {
      host: host,
      group: $('#group').val()
    }
    //send the DNS resolve to the backend
    socket.on('dnsResult',function(data){
      console.log(data)
      dnsResults.host = data.host
      dnsResults.ip = data.ip
      dnsResults.ptr = data.ptr
      pingInit({})
      //send the ping submission to the backend
      socket.on('pingResult',pingResult)
      socket.on('pingComplete',pingComplete)
      socket.emit('ping',commonArgs)
    })
    socket.emit('resolve',commonArgs)
  })
})
