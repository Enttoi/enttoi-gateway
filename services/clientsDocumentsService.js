var client = require('documentdb-q-promises').DocumentClientWrapper;
var config = require('../config');
var q = require('q');

var DOC_DB_NAME = { id: config.connections.documentDb.dbName };
var DOC_DB_COLLECTION = { id: 'clients' };

var client = new DocumentClient(config.connections.documentDb.endpoint, { masterKey: config.connections.documentDb.authKey });

exports.getClientByToken = function (token) {

    var querySpec = {
        query: 'SELECT * FROM ' + config.connections.documentDb.dbName + ' f WHERE  f.token = @token',
        parameters: [
            {
                name: '@token',
                value: 'token'
            }
        ]
    };

    return q.Promise(function (resolve, reject) {
        client.queryCollections(dbLink, querySpec)
            .then(function (result) {
                if (results.length === 0)
                    resolve();
                else
                    resolve(results[0]);
            })
            .fail(function (error) {
                reject(error);
            })
            .done();
    });
}