var documentClient = require('documentdb-q-promises').DocumentClientWrapper;
var util = require('util');
var config = require('../config');
var q = require('q');

var DB_COLL_LINK = util.format('dbs/%s/colls/%s', config.connections.documentDb.dbName, 'clients');
var client = new documentClient(config.connections.documentDb.endpoint, { masterKey: config.connections.documentDb.authKey });

exports.getClientByToken = function (token) {

    var querySpec = {
        query: 'SELECT c.id FROM c WHERE c.token = @token AND c.isDisabled = false',
        parameters: [
            {
                name: '@token',
                value: token
            }
        ]
    };

    return q.Promise(function (resolve, reject) {
        client.queryDocuments(DB_COLL_LINK, querySpec)
            .toArrayAsync()
            .then(function (results) {
                if (results.feed.length === 1)
                    resolve(results.feed[0]);
                else if (results.feed.length === 0)                
                    resolve();
                else
                    reject({ statusCode: 400, log: util.format('There multiple clients for token "%s"', token) });
            })
            .fail(function (error) {
                reject(error);
            })
            .done();
    });
}