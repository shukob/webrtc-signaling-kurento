var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
var fs = require('fs');
var http = require('http');
import {default as One2ManyServer} from "./one2many/server" ;
import {default as One2OneServer} from './one2one/server'

var argv = minimist(process.argv.slice(2), {
    default: {
        as_uri: 'https://localhost:8443/',
        ws_uri: 'ws://localhost:8888/kurento'
    }
});

var app = express();

/*
 * Definition of global variables.
 */


/*
 * Server startup
 */
var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = http.createServer(app).listen(port, function () {
    console.log('Kurento enabled signaling server started...');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});

var one2ManyServer = new One2ManyServer(argv.ws_uri);
one2ManyServer.boot(server, '/one2many');
var one2oneServer = new One2OneServer();
one2oneServer.boot(server, '/one2one');

