var azure = require('azure-storage');
var util = require('util');
var q = require('q');
var config = require('../config');

var tableUtilities = azure.TableUtilities.entityGenerator;

var TABLE_SENSORS_STATE = 'SensorsState';
var TABLE_CLIENTS_STATE = 'ClientsState';

var RETRY_COUNT = 3;
var RETRY_INTERVAL = 500; // in ms

var retryOperations = new azure.LinearRetryPolicyFilter(RETRY_COUNT, RETRY_INTERVAL);
var tableService = azure.createTableService(config.connections.storage.connectionString).withFilter(retryOperations);

var initializationPromise = q.all([
    q.Promise(function (resolve, reject) {
        tableService.createTableIfNotExists(TABLE_SENSORS_STATE, function (error) {
            if (error)
                reject({ log: util.format('Failed to ensure table %s due %s.', TABLE_SENSORS_STATE, util.inspect(error)) });
            else
                resolve();
        });
    }),
    q.Promise(function (resolve, reject) {
        tableService.createTableIfNotExists(TABLE_CLIENTS_STATE, function (error) {
            if (error)
                reject({ log: util.format('Failed to ensure table %s due %s.', TABLE_CLIENTS_STATE, util.inspect(error)) });
            else
                resolve();
        });
    })
]);

// store client's keep alive
var storeClientAlive = function (now, clientId) {
    var clientState = {
        PartitionKey: tableUtilities.String(clientId),
        RowKey: tableUtilities.String('LastPing'),
        ClientId: tableUtilities.String(clientId),
        TimeStamp: tableUtilities.DateTime(now)
    };

    return q.Promise(function (resolve, reject) {
        tableService.insertOrReplaceEntity(TABLE_CLIENTS_STATE, clientState, function (error, result, response) {
            if (!error)
                resolve();
            else
                reject({
                    statusCode: 500,
                    log: util.format('Failed to insert/update into %s row %s due to %s.',
                        TABLE_CLIENTS_STATE, util.inspect(clientState), util.inspect(error))
                });
        });
    });
};

// update sensors current state and if changed store hostory and send notification to MQ
var updateState = function (now, clientId, requestModel) {
    var sensorStateRowKey = util.format('%s_%s', requestModel.sensorType, requestModel.sensorId);

    return q.fcall(function () {
        return q.Promise(function (resolve, reject) {
            // get the current state
            tableService.retrieveEntity(TABLE_SENSORS_STATE, clientId, sensorStateRowKey, function (error, sensorState, response) {
                if (error && error.statusCode != 404) {
                    reject({
                        statusCode: 500,
                        log: util.format('Failed to retrieve from %s row %s due %s.',
                            TABLE_SENSORS_STATE, util.inspect({ partioionKey: clientId, rowKey: sensorStateRowKey }), util.inspect(error))
                    });
                }
                else
                    resolve(sensorState);
            });
        });
    }).then(function (sensorState) {
        // detect if the state was changed or never added before    
        return q.Promise(function (resolve, reject) {
            if (sensorState == null) {
                //no previous record => create a new entity (this will happen only for the first ever reported state)
                sensorState = {
                    PartitionKey: tableUtilities.String(clientId),
                    RowKey: tableUtilities.String(sensorStateRowKey),
                    ClientId: tableUtilities.String(clientId),
                    SensorType: tableUtilities.String(requestModel.sensorType),
                    SensorId: tableUtilities.Int32(requestModel.sensorId),

                    State: tableUtilities.Int32(requestModel.state),
                    TimeStamp: tableUtilities.DateTime(now),
                    PreviousState: tableUtilities.Int32(-1),
                    PreviousStateDurationMs: tableUtilities.Int32(0)
                };

                tableService.insertEntity(TABLE_SENSORS_STATE, sensorState, function (error, result, response) {
                    if (error)
                        reject({
                            statusCode: 500,
                            log: util.format('Failed to insert into %s row %s due to %s.',
                                TABLE_SENSORS_STATE, util.inspect(sensorState), util.inspect(error))
                        });
                    else
                        resolve({ clientId: clientId, model: sensorState, timestamp: now });
                });
            }
            else if (sensorState.State._ != requestModel.state && sensorState.TimeStamp._ < now) {
                // udpate existing record (most of the cases)
                sensorState.PreviousState = tableUtilities.Int32(sensorState.State._);
                sensorState.PreviousStateDurationMs = tableUtilities.Int32(Math.abs(now - sensorState.TimeStamp._));
                sensorState.State = tableUtilities.Int32(requestModel.state);
                sensorState.TimeStamp = tableUtilities.DateTime(now);

                // NOTE
                // concurrency handled with optimistic lock: the passed from query 'sensorState'
                // object contains a field [".metadata"].etag, read more here:
                // https://azure.microsoft.com/en-us/blog/managing-concurrency-in-microsoft-azure-storage-2/
                tableService.updateEntity(TABLE_SENSORS_STATE, sensorState, function (error, result, response) {
                    if (error)
                        if (error.statusCode == 412) {
                            reject({
                                statusCode: 412,
                                log: util.format('Failed to update %s row %s due to %s.',
                                    TABLE_SENSORS_STATE, util.inspect(sensorState), util.inspect(error))
                            });
                        }
                        else
                            reject({
                                statusCode: 500,
                                log: util.format('Failed to update %s row %s due to %s.',
                                    TABLE_SENSORS_STATE, util.inspect(sensorState), util.inspect(error))
                            });
                    else {
                        console.log(util.format('Changed state of: %s', util.inspect(requestModel)));
                        resolve({ clientId: clientId, model: sensorState, timestamp: now });
                    }
                });
            }
            else
                // no changes detected
                resolve();
        });
    });
};

exports.storeState = function (clientId, requestModel) {
    var now = new Date();

    return q.fcall(function () { 
        // since we store a reference to promise, it will be ALREADY fulfilled on second time and on
        return initializationPromise;
    })
        .then(function () {
            // parallelize
            return q.all([
                storeClientAlive(now, clientId),
                updateState(now, clientId, requestModel)]);
        });
};

exports.clientHeartBeat = function (clientId) {
    var now = new Date();

    return q.fcall(function () { 
        // since we store a reference to promise, it will be ALREADY fulfilled on second time and on
        return initializationPromise;
    })
        .then(function () {
            // parallelize
            return storeClientAlive(now, clientId);
        });
};