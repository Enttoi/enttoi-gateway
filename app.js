/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    sensor = require('./routes/sensor'),
    http = require('http'),
    path = require('path'),
    bodyParser = require('body-parser'),
    errorhandler = require('errorhandler'),
    expressValidator = require('express-validator');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());

// development only
if ('development' == app.get('env')) {
    app.use(errorhandler({ dumpExceptions: true, showStack: true }));
}

// routes
var router = express.Router();
router.get('/', routes.index);
router.post('/sensor', sensor.post);
app.use('/', router);

// server
http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
