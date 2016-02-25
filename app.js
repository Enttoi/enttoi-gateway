/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    sensor = require('./routes/sensor'),
    client = require('./routes/client'),
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
app.use(expressValidator({
    customValidators: {
        gte: function (param, num) {
            return param >= num;
        },
        lte: function (param, num) {
            return param <= num;
        }
    }
}));

// development only
if ('development' == app.get('env')) {
    app.use(errorhandler({ dumpExceptions: true, showStack: true }));
}

// routes
var router = express.Router();
router.get('/', routes.index);
router.post('/sensor', sensor.state);
router.post('/client/heartbeat', client.heartbeat);
app.use('/', router);

// server
http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
