﻿/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var status = require('./routes/status');
var http = require('http');
var path = require('path');
var bodyParser = require('body-parser');
var errorhandler = require('errorhandler')

var app = express();

// all environments
app.set('port', process.env.PORT || 3000); 
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
    app.use(errorhandler({ dumpExceptions: true, showStack: true }));
}

// routes
var router = express.Router();
router.get('/', routes.index);
router.post('/status', status.post);
app.use('/', router);

// server
http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
