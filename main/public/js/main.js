/* global socket: false, console: false, alert: false */
$(document).ready(function(){
  //activate the examples
  $('.example').each(function(){
    $(this).click(function(){
      $('form > #host').val($(this).text())
      $('form').submit()
    })
  })
  //storage vars
  var dnsResults = {}
  var pingResults = {}

  //jquery selectors
  var pingTable = $('#pingTable > tbody')


  /**
   * Flash the pulsar
   * @param {string} id
   * @param {boolean} failed
   */
  var pulsarBeat = function(id,failed){
    var glyph = failed ? 'glyphicon-heart-empty' : 'glyphicon-heart'
    //we replace the html here ON PURPOSE to autocancel all other previous animations
    //do not convert to simple class refuckery, thanks
    var pulsar = $('tr#' + id + ' > .pulsar')
    pulsar.html('<span class="glyphicon ' + glyph + ' text-danger"/>')
    pulsar.find('span').fadeIn(0,function(){pulsar.find('span').fadeOut(1000)})
  }


  /**
   * Clear a pulsar since its complete
   * @param {string} id
   */
  var pulsarFinal = function(id){
    var row = $('tr#' + id)
    var loss = +row.find('.loss').html()
    var glyph = 'glyphicon-question-sign text-warning'
    if(loss === 0)
      glyph = 'glyphicon-ok-sign text-success'
    if(loss === 100)
      glyph = 'glyphicon-remove-sign text-danger'
    //we replace the html here ON PURPOSE to autocancel all other previous animations
    //do not convert to simple class refuckery, thanks
    $('tr#' + id + ' > .pulsar').html('<span class="glyphicon ' + glyph + '"/>')
  }


  /**
   * Init the ping table
   * @param {object} data
   */
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


  /**
   * Parse a ping result
   * @param {object} data
   */
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
  }


  /**
   * Sort the ping table
   */
  var pingTableSort = function(){
    var comparisonFn = function(){
      return function(a,b){
        return $(a).attr('id').localeCompare($(b).attr('id'))
      }
    }
    var rows = pingTable.find('tr:gt(1)').toArray().sort(comparisonFn())
    for (var i = 0; i < rows.length; i++){ pingTable.append(rows[i]) }
  }


  /**
   * Seed the ping result table
   */
  var pingTableInit = function(){
    pingTable.find('tr:gt(1)').each(function(){ $(this).remove() })
    $('#pingResultWrapper').removeClass('hidden')
  }


  /**
   * Seed a ping result row
   * @param {string} index
   * @param {object} dnsResult
   */
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


  /**
   * Update a ping result row
   * @param {string} index
   * @param {object} pingResult
   */
  var pingTableRowUpdate = function(index,pingResult){
    var row = pingTable.find('tr#' + index)
    row.find('.min').html(pingResult.min)
    row.find('.avg').html(pingResult.avg.toPrecision(5))
    row.find('.max').html(pingResult.max)
    row.find('.loss').html(((pingResult.fails / pingResult.total) * 100).toPrecision(3))
    pulsarBeat(index,pingResult.currentlyFailed)
  }


  /**
   * Ping a Host with a Bot
   * @param {string} handle
   * @param {string} id  Bot id
   * @param {string} ip
   * @param {function} done
   */
  var pingStart = function(handle,id,ip,done){
    if(!done) done = function(){}
    console.log('sending pingStart request for ' + ip + ' to ' + id + ' with handle ' + handle)
    //setup result handlers
    socket.on('pingError:' + handle,function(err){
      alert(err)
    })
    console.log('listening for ' + 'pingResult:' + handle)
    socket.on('pingResult:' + handle,function(result){
      pingResult(result)
    })
    socket.emit('pingStart',{handle: handle, bot: id, ip: ip},function(result){
      if(result.error) return done(result.error)
      done(null,result)
    })
    setTimeout(function(){
      pingStop(handle,id,function(){
        pulsarFinal(id)
      })
    },5000)
  }


  /**
   * Stop a ping session
   * @param {string} handle
   * @param {string} id
   * @param {function} done
   */
  var pingStop = function(handle,id,done){
    var query = {handle: handle, bot: id}
    socket.removeListener('pingError:' + handle)
    socket.removeListener('pingResult:' + handle)
    socket.emit('pingStop',query,function(result){
      if(result.error) return done(result.error)
      done(null,result)
    })
  }


  /**
   * Resolve a host through the backend
   * @param {string} host
   * @param {string} group
   * @param {function} done
   */
  var dnsResolve = function(host,group,done){
    var query = {
      host: host,
      group: group
    }
    //send the DNS resolve to the backend
    socket.emit('resolve',query,function(data){
      if(data.error) return done(data.error)
      done(null,data.results)
    })
  }


  /**
   * Handle a ping form submission
   */
  $('#ping').submit(function(e){
    e.preventDefault()
    var host = $('#host').val().replace(/\s+/g,'')
    var group = $('#group').val()
    if('' === host) return(false)
    pingTableInit()
    dnsResolve(host,group,function(err,results){
      if(err) return alert(err)
      console.log('got resolve results',results)
      dnsResults = results
      for(var i in dnsResults){
        if(dnsResults.hasOwnProperty(i)){
          pingTableRowInit(i,dnsResults[i])
          pingStart(dnsResults[i].handle,i,dnsResults[i].ip[0])
        }
      }
    })
  })
})
