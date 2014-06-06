/* global siteDomain,rootDomain,alert,Request */
var slideOut = {}
var traceDest = ''
$(function(){
	$('trace_form').on('submit',function(e){
		e.stop()
		submitTrace()
	})
	if('' !== window.location.hash){
		traceDest = window.location.hash
		traceDest = traceDest.replace(/#/,'')
		$('trace_dest').val(traceDest)
	}
	if('' !== $('trace_dest').val()) submitTrace()
})

var submitTrace = function(){
	var dest = $('trace_dest').val()
	var referrer = $('referrer').val()
	var serverId = $('server_id').val()
	var group = $('group').val()
	var groupDomain = group + siteDomain
	if('' === dest){
		alert('You must enter a host or IP')
		return false
	}
	//set the url so it can be pasted
	window.location.hash = dest
	//check if we are in the right subdomain
	if('' !== group && groupDomain !== window.location.hostname){
		window.location.hostname = groupDomain
	}
	if('' === group && rootDomain !== window.location.hostname){
		window.location.hostname = rootDomain
	}
	new Request.XML({
		noCache: true,
		method: 'get',
		url: '/ajax.php?act=server_list&server_id='+serverId+'&group='+group,
		onRequest: function(){
			setupTraceOutput()
		},
		onSuccess: function(xml){
			$('server_loading').destroy()
			populateTraceServers(xml,dest,referrer)
		}
	}).send()
}

var setupTraceOutput = function(){
	$('trace_output').setStyle('display','block')
	$('trace_server_list').empty()
	$('trace_server_list').adopt(new Element('tr',{'id':'server_loading'}).adopt(new Element('td',{'colspan':7,'text':'Loading...'})))
}

/*
<tr>
	<td>{location}</td>
	<td>{hostname}</td>
	<td><a href="{host_url}">{host}</a></td>
	<td colspan="4">waiting...</td>
</tr>
*/
var populateTraceServers = function(el,dest,referrer){
	var i = 0
	var serverId = ''
	el.getChildren().each(function(server){
		serverId = server.getElement('server_id').get('text')
		var hostname = server.getElement('hostname').get('text')
		var host = server.getElement('host').get('text')
		var hostUrl = server.getElement('host_url').get('text')
		var serverRow = new Element('tr',{'id':'trace_server_'+serverId})
		var location = server.getElement('location').get('text')
		if(server.getElement('is_sponsored').get('text') == '1'){
			var location = ' <a href="'+hostUrl+'" target="_blank">'+location+'</a>'
		}
		serverRow.adopt(new Element('td',{'html':location}))
		//server_row.adopt(new Element('td',{'html':show_host}))
		serverRow.adopt(new Element('td',{'id':'trace_ip_'+serverId}).set('text','waiting..'))
		serverRow.adopt(new Element('td',{'id':'trace_loading_'+serverId,'text':'waiting...'}))
		$('trace_server_list').adopt(serverRow)
		$('trace_server_list').adopt(new Element('tr',{'id':'server_trace_'+serverId,'style':'display: none'}))
		serverTrace(serverId,dest,referrer)
		i++
	})
	if(i == 1) viewTrace(serverId)
}

var serverTrace = function(server_id,dest,referrer){
	new Request.XML({
		noCache: true,
		method: 'get',
		url: '/ajax.php?act=trace&server_id='+server_id+'&dest='+dest+'&referrer='+encodeURIComponent(referrer),
		onSuccess: function(xml){
			$('trace_loading_'+server_id).destroy()
			populateTrace(server_id,xml)
		}
	}).send()
}

var populateTrace = function(server_id,el){
	$('trace_ip_'+server_id).set('text',el.getElement('ip').get('text'))
	var row = $('trace_server_'+server_id)
	row.adopt(new Element('td').adopt(new Element('a',{'href':'javascript:viewTrace('+server_id+')','text':'view result'})))
	var trace = new Element('td',{'colspan':4}).adopt(
		new Element('div',{'id':'server_trace_view_'+server_id}).adopt(
			new Element('pre',{'style':'font-size:11px','text':el.getElement('result').get('text')})))
	$('server_trace_'+server_id).adopt(trace)
}

var viewTrace = function(server_id){
	if(slideOut[server_id] == true){
		$('server_trace_view_'+server_id).slide('hide')
		$('server_trace_'+server_id).setStyle('display','none')
		slideOut[server_id] = false
	} else {
		$('server_trace_'+server_id).setStyle('display','table-row')
		if($('server_trace_view_'+server_id)) $('server_trace_view_'+server_id).slide('hide').slide('in')
		slideOut[server_id] = true
	}
}
