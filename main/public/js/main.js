/* global socket: false, console: false, alert: false, sourceId: false */
$(document).ready(function(){
  //activate the examples
  $('.example').each(function(){
    $(this).click(function(e){
      e.preventDefault()
      $('form > #host').val($(this).text())
      $('form').submit()
      return false
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
   * Show/Hide an element
   * @param {Element} el DOM element to set visibility on
   * @param {Boolean} bool true to show, false to hide
   */
  var setVisible = function(el,bool){
    if(!!bool)
      el.removeClass('hidden')
    else
      el.addClass('hidden')
  }

  /**
   * Show/Hide the Results area
   * @param {Boolean} bool true to show, false to hide
   */
  var setResults = function(bool){
    setVisible($('#pingResultWrapper'),bool)
  }

  /**
   * Show/Hide the "Waiting" message
   * @param {Boolean} bool true to show, false to hide
   */
  var setWaiting = function(bool){
    setVisible(pingTable.find('tr#waiting'),bool)
  }

  /**
   * Show/Hide a specific results row
   * @param {string} id the id attr of the <tr>
   * @param {Boolean} bool true to show, false to hide
   */
  var setResultsRow = function(id,bool){
    setVisible(pingTable.find('tr#' + id),bool)
  }

  var setError = function(bool){
    var el = $('form > input#host')
    if(!!bool)
      el.addClass('error')
    else
      el.removeClass('error')
  }

  /**
   * Init the ping table
   */
  var pingTableInit = function(bots){
    setError(false)
    setResults(false)
    pingTable.find('tr:gt(1)').each(function(){ $(this).remove() })
    for (var i = 0; i < bots.length; i++){
      var newRow = $('#ping-row-template').clone()
      newRow.attr('id',bots[i]._id)
      if(bots[i].sponsor.url){
        var link = newRow.find('td.location > a')
        link.attr('href',bots[i].sponsor.url)
        link.html(bots[i].location)
      } else
        newRow.find('td.location').html(bots[i].location)
      pingTable.append(newRow)
      setResultsRow(bots[i]._id,false)
    }
    setWaiting(true)
    setResults(true)
  }


  /**
   * Handle DNS errors
   */
  var pingTableDnsError = function(err){
    setError(true)
    setResults(false)
    setWaiting(true)
  }


  /**
   * Seed a ping result row
   * @param {string} index
   * @param {object} dnsResult
   */
  var pingTableRowInit = function(index,dnsResult){
    setWaiting(false)
    pingResults[index] = []
    var row = pingTable.find('tr#' + index)
    row.find('td.ip').html(dnsResult.ip[0])
    setResultsRow(index,true)
  }


  /**
   * Update a ping result row
   * @param {string} index
   * @param {object} pingResult
   */
  var pingTableRowUpdate = function(index,pingResult){
    var row = pingTable.find('tr#' + index)
    if('-' !== pingResult.avg) pingResult.avg = pingResult.avg.toPrecision(5)
    row.find('.ip').html(pingResult.target)
    row.find('.min').html(pingResult.min)
    row.find('.avg').html(pingResult.avg)
    row.find('.max').html(pingResult.max)
    row.find('.loss').html(((pingResult.fails / pingResult.total) * 100).toPrecision(3))
    pulsarBeat(index,pingResult.currentlyFailed)
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
    var currentlyFailed = true
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
      }
    })
    pingTableRowUpdate(data.id,{
      target: data.target,
      min: min, max: max, avg: avg,
      fails: fails, total: pingResults[data.id].length,
      currentlyFailed: currentlyFailed
    })
  }


  /**
   * Ping a Host with a Bot
   * @param {string} handle
   * @param {string} id  Bot id
   * @param {string} ip
   * @param {function} done
   */
  var pingStart = function(handle,id,ip,done){
    var resultCount = 1
    if(!done) done = function(){}
    //console.log('sending pingStart request for ' + ip + ' to ' + id + ' with handle ' + handle)
    //setup result handlers
    //console.log('listening for ' + 'pingResult:' + handle)
    socket.on('pingResult:' + handle,function(result){
      if(++resultCount > 4 && !result.stopped)
        pingStop(handle,result.id)
      if(result.stopped){
        pulsarFinal(result.id)
        socket.removeAllListeners('pingResult:' + handle)
        return
      }
      pingResult(result)
    })
    socket.emit('pingStart',{handle: handle, bot: id, ip: ip})
  }


  /**
   * Stop a ping session
   * @param {string} handle
   * @param {string} id
   */
  var pingStop = function(handle,id){
    socket.emit('pingStop',{handle: handle, bot: id})
  }


  /**
   * Get current Bot listing through the backend
   * @param {string} group
   * @param {function} done
   */
  var botList = function(done){
    socket.emit('botList',function(data){
      if(data.error) return done(data.error)
      done(null,data.results)
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
      if(data.error) return done(data.error,data.results)
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
    botList(function(err,results){
      if(err) return false
      pingTableInit(results)
      dnsResolve(host,group,function(err,results){
        if(!results) results = {}
        if(err) return pingTableDnsError(err)
        dnsResults = results
        for(var i in dnsResults){
          if(dnsResults.hasOwnProperty(i)){
            pingTableRowInit(i,dnsResults[i])
            pingStart(sourceId + ':' + dnsResults[i].handle,i,dnsResults[i].ip[0])
          }
        }
      })
    })
  })
})
