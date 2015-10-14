/*
 * Stores and notify sensors statuses
 */
var util = require('util');
var tableService = require('../services/sensorsStorageService');
var q = require('q');

// validate request
var validateRequest = function (request) {
    var s = request.checkBody({
        'client': {
            notEmpty: true,
            isGuid: true
        },
        'sensor_type': {
            notEmpty: true,
            isLength: {
                options: [2, 15]
            }
        },
        'sensor_id': {
            notEmpty: true,
            isInt: true
        },
        'state': {
            notEmpty: true,
            isInt: true
        }
    });
    var errors = request.validationErrors();
    
    return q.Promise(function (resolve, reject) {
        if (!errors)
            resolve();
        else
            reject({ code: 400, errors: errors });
    });
}

// validate client
var authorizeClient = function (request) {
    return q.Promise(function (resolve, reject) {
        var ALLOWED_CLIENTS = 'e997b810-f0ae-4cde-b933-e2ed6430d2d1';
        if (ALLOWED_CLIENTS.indexOf(request.body.client) >= 0)
            resolve(ALLOWED_CLIENTS);
        else
            reject({ code: 401 });
    });
}

exports.post = function (req, res) {
    
    validateRequest(req)
        .then(function () {
            return authorizeClient(req);
        })
        .then(function (clientId) {
            return tableService.storeState(clientId, req.body);
        })
        .then(function () {
            // all went well => return 200
            res.end();
        })
        .fail(function (error) {
            if (error && error.log) {
                console.log(error.log);
            }
            else if (error && !error.code) {
                // an exception was thrown
                console.log(util.inspect(error));
            }       
        
            // those are either validation/authorization errors or 500
            res.status(error && error.code ? error.code : 500).send(error.errors);
        })
        .done();
};