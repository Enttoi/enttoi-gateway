﻿/*
 * Stores and notify sensors statuses
 */
var util = require('util');
var tableService = require('../services/tableStorageService');
var documentService = require('../services/clientsDocumentsService');
var notificationsService = require('../services/topicServiceBusService');
var q = require('q');

// validate request
var validateRequest = function (request) {
    request.checkBody({
        'sensorType': {
            notEmpty: true,
            isLength: {
                options: [2, 15]
            }
        },
        'sensorId': {
            notEmpty: true,
            isInt: true,
            gte: { options: [1], errorMessage: 'Not within accepted range' },
            lte: { options: [3], errorMessage: 'Not within accepted range' }
        },
        'state': {
            notEmpty: true,
            isInt: true,
            gte: { options: [0], errorMessage: 'Not within accepted range' },
            lte: { options: [1], errorMessage: 'Not within accepted range' }
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
        if (!request.headers.authorization || request.headers.authorization === '')
            reject({ statusCode: 401 });

        documentService
            .getClientByToken(request.headers.authorization)
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

exports.state = function (req, res) {

    validateRequest(req)
        .then(function () {
            return authorizeClient(req);
        })
        .then(function (clientId) {
            return tableService.storeState(clientId, req.body);
        })
        .then(function (promisesResult) {
            // there are multiple promises were involved thus we need to look for the right return value in one of them
            var sensorState = promisesResult.length ? promisesResult.find(function (p) { return p && p.model && p.clientId && p.timestamp; }) : promisesResult;

            if (sensorState)
                // state changed => send notification
                return notificationsService.sendStateChangedMessage(req.body, sensorState);
            else
                // no changes made to the state
                return true;
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