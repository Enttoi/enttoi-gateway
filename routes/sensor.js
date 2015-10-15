/*
 * Stores and notify sensors statuses
 */
var util = require('util');
var tableService = require('../services/sensorsStorageService');
var documentService = require('../services/clientsDocumentsService');
var q = require('q');

// validate request
var validateRequest = function (request) {
    request.checkBody({
        'token': {
            notEmpty: true,
            isGuid: true
        },
        'sensorType': {
            notEmpty: true,
            isLength: {
                options: [2, 15]
            }
        },
        'sensorId': {
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
            reject({ statusCode: 400, errors: errors });
    });
}

// validate client
var authorizeClient = function (request) {
    return q.Promise(function (resolve, reject) {
        documentService
            .getClientByToken(request.body.token)
            .then(function (client) {
                if (!client)
                    reject({ statusCode: 401 });
                else
                    resolve(client.id);
            })
            .fail(function (error) { reject(error); })
            .done();
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
            else if (error && !error.statusCode) {
                // an exception was thrown
                console.log(util.inspect(error));
            }       
        
            // those are either validation/authorization errors or 500
            res.status(error && error.statusCode ? error.statusCode : 500).send(error.errors);
        })
        .done();
};