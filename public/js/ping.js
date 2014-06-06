/* global siteDomain,rootDomain,alert,Request,console */
var setupPingOutput = function(){
  var pingServerList = $('#ping_server_list')
  $('#ping_output').css('display','block')
  pingServerList.empty().append('<tr id="server_loading"><td colspan=7>Loading...</td></tr>')
}

var populatePing = function(server,dest,referrer,el){
  var serverId = server.getElement('server_id').get('text')
  var row = $('ping_server_'+serverId)
  if(!row || (row.get('dest') != dest)) return
  var waiting = $('ping_waiting_'+serverId)
  if(waiting) waiting.destroy()
  row.adopt(new Element('td',{'text':el.getElement('ip').get('text')}))
  row.adopt(new Element('td',{'text':el.getElement('min').get('text')}))
  row.adopt(new Element('td',{'text':el.getElement('max').get('text')}))
  row.adopt(new Element('td',{'text':el.getElement('avg').get('text')}))
  row.adopt(new Element('td',{'text':el.getElement('result').get('text')}))
  row.adopt(new Element('td',{'html':'<a href="/trace&server_id='+serverId+'&dest='+dest+'">traceroute</a>'}))
}

var serverPing = function(server,dest,referrer){
  var server_id = server.getElement('server_id').get('text')
  new Request.XML({
    noCache: true,
    method: 'get',
    url: '/ajax.php?act=ping&server_id='+server_id+'&dest='+dest+'&referrer='+encodeURIComponent(referrer),
    link: 'ignore',
    onSuccess: function(xml){
      populatePing(server,dest,referrer,xml)
    }
  }).send()
}

/*
 <tr>
 <td>{location}</td>
 <td>{hostname}</td>
 <td><a href="{host_url}">{host}</a></td>
 <td colspan="6">waiting...</td>
 </tr>
 */
var populatePingServers = function(el,dest,referrer){
  el.getChildren().each(function(server){
    var serverId = server.getElement('server_id').get('text')
    var hostname = server.getElement('hostname').get('text')
    var host = server.getElement('host').get('text')
    var hostUrl = server.getElement('host_url').get('text')
    var serverRow = new Element('tr',{'id':'ping_server_'+serverId,'dest':dest})
    var location = server.getElement('location').get('text')
    if('1' === server.getElement('is_sponsored').get('text')){
      location = ' <a href="'+hostUrl+'" target="_blank">'+location+'</a>'
    }
    serverRow.adopt(new Element('td',{'html':location}))
    //server_row.adopt(new Element('td',{'html':show_host}))
    serverRow.adopt(new Element('td',{'id':'ping_waiting_'+serverId,'colspan':6,'text':'waiting...'}))
    $('ping_server_list').adopt(serverRow)
    serverPing(server,dest,referrer)
  })
}

var submitPing = function(){
  console.log('submitPing()')
	var dest = $('#ping_dest').val() || ''
	var referrer = $('#referrer').val() || ''
	var group = $('#group').val() || ''
	var groupDomain = group + (siteDomain || '')
  console.log({dest:dest,referrer:referrer,group:group,groupDomain:groupDomain})
	if('' === dest){
		alert('You must enter a host or IP')
		return false
	}
	if(!dest.match(/^[0-9a-zA-Z\-\.]+$/i)){
		alert('You have entered an invalid hostname or IP address')
		return false
	}
	//set the url so it can be pasted
	location.hash = dest
	//check if we are in the right subdomain
  if('127.0.0.1' !== location.hostname){
    if('' !== group && groupDomain !== location.hostname){
      location.hostname = groupDomain
    }
    if('' === group && rootDomain !== location.hostname){
      location.hostname = rootDomain
    }
  }
  $.getJSON('/server_list',group ? {group:group} : {})
    .done(function(data){
        $('#server_loading').destroy()
        populatePingServers(data,dest,referrer)
      }
    )
  setupPingOutput()
  console.log('end submitPing()')
}

$(function(){
  var pingForm = $('#ping_form')
  pingForm.on('submit',function(e){
    e.preventDefault()
    submitPing()
  })
  var hash = location.hash.replace(/^#/,'') || ''
  var pingDest = $('#ping_dest')
  if(0 !== hash.length) pingDest.val(hash)
  if('' !== pingDest.val()) submitPing()
})
