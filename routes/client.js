/*
 * Stores and notify sensors statuses
 */
var util = require('util');
var tableService = require('../services/tableStorageService');
var documentService = require('../services/clientsDocumentsService');
var q = require('q');

// validate client
var authorizeClient = function (request) {
    return q.Promise(function (resolve, reject) {
        if(!request.headers.authorization || request.headers.authorization === '')
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

exports.heartbeat = function (req, res) {
    authorizeClient(req)    
        .then(function (clientId) {
            return tableService.clientHeartBeat(clientId);
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