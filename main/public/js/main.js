/* global socket: false, sourceId: false */
$(document).ready(function(){
  //storage vars
  var dnsResults = {}
  var pingResults = {}

  //jquery selectors
  var pingForm = $('#pingForm')
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
   * Show/Hide an element using slide
   * @param {Element} el DOM element to set visibility on
   * @param {Boolean} bool true to show, false to hide
   */
  var setVisibleSlide = function(el,bool){
    if(!!bool){
      el.removeClass('hidden')
      el.slideUp(0,function(){el.slideDown(150)})
    } else{
      el.slideUp(0)
    }
  }

  /**
   * Show/Hide the Results area
   * @param {Boolean} bool true to show, false to hide
   */
  var setResults = function(bool){
    setVisibleSlide($('#pingResultWrapper'),bool)
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

  var setError = function(bool,err){
    if(err) bool = true
    var el = $('#hostInput')
    var hostBox = el.find('input#host')
    var icon = el.find('#feedback')
    var setRed = function(){
      el.removeClass('has-success')
      icon.removeClass('glyphicon-ok')
      icon.addClass('glyphicon-remove')
      el.addClass('has-error')
      hostBox.addClass('error')
    }
    var setGreen = function(){
      el.removeClass('has-error')
      icon.removeClass('glyphicon-remove')
      icon.addClass('glyphicon-ok')
      el.addClass('has-success')
      hostBox.removeClass('error')
    }
    var setNone = function(){
      icon.removeClass('glyphicon-ok')
      icon.removeClass('glyphicon-remove')
      el.removeClass('has-success')
      el.removeClass('has-error')
      hostBox.removeClass('error')
    }
    if('none' === bool)
      setNone()
    else if(!!bool)
      setRed()
    else
      setGreen()
  }

  /**
   * Init the ping table
   */
  var pingTableInit = function(bots){
    setError('none')
    setResults(false)
    pingTable.find('tr:gt(1)').each(function(){ $(this).remove() })
    for (var i = 0; i < bots.length; i++){
      var newRow = $('#ping-row-template').clone()
      newRow.attr('id',bots[i]._id)
      var loc = newRow.find('td.location')
      var link = loc.find('a')
      link.find('#text').html(bots[i].location)
      if(bots[i].sponsor)
        link.attr('href',bots[i].sponsor.url || '')
      var label = newRow.find('td.group > #primaryGroupLabel')
      label.text(bots[i].primaryGroup)
      label.removeClass('hidden')
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
    setError(true,err)
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
    setError(false)
    pingResults[index] = []
    var row = pingTable.find('tr#' + index)
    var ip = dnsResult.ip[0]
    row.find('td.ip').html(ip || '<span class="text-danger">[DNS Failed]</span>')
    row.find('td.loss').html(ip ? '-' : '100')
    setResultsRow(index,true)
    if(!ip) pulsarFinal(index)
    return(ip ? true : false)
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
   * Hash parser splits host and optionally group out of a location.hash string
   * @param {string} hash
   * @return {object}
   */
  var hashParse = function(hash){
    hash = hash || location.hash.toString()
    if((!hash) || ('#' === hash)){
      location.hash = '#'
      return(false)
    }
    hash = hash.replace(/#/,'')
    var rv = {group: 'all', host: hash}
    var m = hash.split('@')
    if(1 < m.length){
      rv.group = m[0]
      rv.host = m[1]
    }
    return(rv)
  }

  /**
   * Hash builder makes location.hash string from optional object
   * @param {object} [hashInfo] Default if not given is current form state
   * @return {string}
   */
  var hashBuild = function(hashInfo){
    var rv = '#'
    hashInfo = hashInfo || {}
    if(!hashInfo.host)
      hashInfo.host = $('#host').val().replace(/\s+/g,'')
    if(!hashInfo.group)
      hashInfo.group = $('#group').val()
    if(!(/\./).test(hashInfo.host)) return(rv)
    if(0 < hashInfo.group.length && 'all' !== hashInfo.group)
      rv = rv + hashInfo.group + '@'
    rv = rv + hashInfo.host
    return(rv)
  }
  /**
   * Sanitize group to 'all' if group is not available on form
   * @param {string} group
   * @return {string}
   */
  var pingFormGroupSanitize = function(group){
    var rv = (undefined === pingForm.find('option:eq(' + group + ')').val()) ? 'all' : group
    return(rv)
  }
  /**
   * Submit the form after filling it in using current hash
   */
  var pingFormSubmit = function(){
    var hash = hashParse()
    if(hash){
      pingForm.find('input#host').val(hash.host)
      pingForm.find('option:eq(' + hash.group.toLowerCase() + ')').prop('selected',true)
      pingForm.submit()
    }
  }
  var hashSet = function(thing,force){
    var hash = ''
    if(!thing) thing = {}
    if('object' === typeof thing)
      hash = hashBuild(thing)
    if('string' === typeof thing)
      hash = hashBuild(hashParse(thing))
    if(force || (hash !== hashBuild(hashParse())) || (/^#all@/i).test(location.hash)){
      if(hash !== location.hash){
        location.hash = hash.replace(/^#all@/i,'#') || ''
        return(true)
      }
      if(!hash){
        if(window.history && window.history.pushState)
          window.history.pushState('',document.title,window.location.pathname)
        else
          window.location.href = window.location.href.replace(/#.*$/,'#')
      }
      location.hash = hash
      if(force) pingFormSubmit()
      return true
    } else
      return false
  }
  var launchPing = function(hash){
    var hashInfo = hashParse(hash)
    if('all' === hashInfo.group)
      hashInfo.group = $('#group').val()
    hashSet(hashInfo,true)
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
        var rtt = e.rtt
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
   */
  var pingStart = function(handle,id,ip){
    var max = 4
    var count = 0
    //console.log('sending pingStart request for ' + ip + ' to ' + id + ' with handle ' + handle)
    //setup result handlers
    //console.log('listening for ' + 'pingResult:' + handle)
    socket.on('pingResult:' + handle,function(result){
      count++
      pingResult(result)
      if(count >= max){
        pulsarFinal(result.id)
        socket.removeAllListeners('pingResult:' + handle)
      }
    })
    socket.emit('pingStart',{handle: handle, bot: id, ip: ip, count: max})
  }


  /**
   * Get current Bot listing through the backend
   * @param {string} group
   * @param {function} done
   */
  var botList = function(group,done){
    if((!done) && 'function' === typeof group){
      done = group
      group = null
    }
    socket.emit('peerList',{group:pingFormGroupSanitize(group)},function(data){
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
  pingForm.submit(function(e){
    e.preventDefault()
    pingForm.find('input#host').blur()
    var host = pingForm.find('input#host').val().replace(/\s+/g,'')
    if(hashSet()) return(false)
    var group = pingForm.find('select#group').val()
    botList(group,function(err,results){
      if(err) return(false)
      pingTableInit(results)
      dnsResolve(host,group,function(err,results){
        if(!results) results = {}
        if(err) return pingTableDnsError(err)
        dnsResults = results
        var allFailed = true
        for(var i in dnsResults){
          if(dnsResults.hasOwnProperty(i)){
            if(pingTableRowInit(i,dnsResults[i])){
              allFailed = false
              pingStart(sourceId + ':' + dnsResults[i].handle,i,dnsResults[i].ip[0])
            }
          }
        }
        if(allFailed) return pingTableDnsError()
      })
    })
  })
  //activate the examples
  $('.example').each(function(){
    $(this).click(function(e){
      e.preventDefault()
      launchPing($(this).text())
      return(false)
    })
  })
  //reset input status on focus
  pingForm.find('input#host').focus(function(){setError('none')})
  //handle hash auto-launching
  $(window).hashchange(pingFormSubmit)
  $(window).hashchange()
})
