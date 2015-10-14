var azure = require('azure-storage');
var util = require('util');
var q = require('q');
var config = require('../config');

var tableUtilities = azure.TableUtilities.entityGenerator;

var TABLE_SENSORS_HISTORY = 'SensorsHistory';
var TABLE_SENSORS_STATE = 'SensorsState';
var TABLE_CLIENTS_STATE = 'ClientsState';
var QUEUE_SENSORS_STATE = 'sensor-state-changed';

var tableService = azure.createTableService(config.connections.storage.account, config.connections.storage.accessKey);
var queuesService = azure.createQueueService(config.connections.storage.account, config.connections.storage.accessKey);

var ensureTablesPromise = q.all([
    q.Promise(function (resolve, reject) {
        tableService.createTableIfNotExists(TABLE_SENSORS_HISTORY, function (error) {
            if (error)
                reject({ log: util.format('Failed to ensure table %s due %s.', TABLE_SENSORS_HISTORY, util.inspect(error)) });
            else
                resolve();
        });
    }),
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
    }),
    q.Promise(function (resolve, reject) {
        queuesService.createQueueIfNotExists(QUEUE_SENSORS_STATE, function (error) {
            if (error)
                reject({ log: util.format('Failed to ensure queue %s due %s.', QUEUE_SENSORS_STATE, util.inspect(error)) });
            else
                resolve();
        });
    })
]);

// store raw history 
var storeHistory = function (now, clientId, requestModel) {
    var historyEntry = {
        PartitionKey : tableUtilities.String(util.format('%s_%s_%s', clientId, requestModel.sensor_type, requestModel.sensor_id)),
        RowKey: tableUtilities.String(now.getTime() + ''), // milliseconds since 1 January 1970 00:00:00 UTC
        State: tableUtilities.Int32(requestModel.state),
        TimeStamp: tableUtilities.DateTime(now)
    };
    
    return q.Promise(function (resolve, reject) {
        // requests that arrives at the same time will override because of the RowKey
        tableService.insertOrReplaceEntity(TABLE_SENSORS_HISTORY, historyEntry, function (error, result, response) {
            if (!error)
                resolve();
            else
                reject({
                    code: 500,
                    log: util.format('Failed to insert/update into %s row %s due to %s.', 
                        TABLE_SENSORS_HISTORY, util.inspect(historyEntry), util.inspect(error))
                });
        });
    });
};

// store client's keep alive
var storeClientAlive = function (now, clientId, requestModel) {
    var clientState = {
        PartitionKey : tableUtilities.String(clientId),
        RowKey: tableUtilities.String('LastPing'),
        TimeStamp: tableUtilities.DateTime(now)
    };
    
    return q.Promise(function (resolve, reject) {
        tableService.insertOrReplaceEntity(TABLE_CLIENTS_STATE, clientState, function (error, result, response) {
            if (!error)
                resolve();
            else
                reject({
                    code: 500,
                    log: util.format('Failed to insert/update into %s row %s due to %s.', 
                        TABLE_CLIENTS_STATE, util.inspect(clientState), util.inspect(error))
                });
        });
    });
};

// update sensors current state and send notification to MQ if so
var updateState = function (now, clientId, requestModel) {
    var sensorStateRowKey = util.format('%s_%s', requestModel.sensor_type, requestModel.sensor_id);
    
    return q.fcall(function () {
        return q.Promise(function (resolve, reject) {
            // get the current state
            tableService.retrieveEntity(TABLE_SENSORS_STATE, clientId, sensorStateRowKey, function (error, sensorState, response) {
                if (error && error.statusCode != 404) {
                    reject({
                        code: 500,
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
            if (sensorState == null || (sensorState.State._ != requestModel.state && sensorState.TimeStamp._ < now)) {
                
                // create or update model
                sensorState = {
                    PartitionKey : tableUtilities.String(clientId),
                    RowKey: tableUtilities.String(sensorStateRowKey),
                    State: tableUtilities.Int32(requestModel.state),
                    TimeStamp: tableUtilities.DateTime(now),
                    PreviousState: tableUtilities.Int32(sensorState ? sensorState.State._ : -1),
                    PreviousStateDurationMs: tableUtilities.Int32(sensorState ? Math.abs(now - sensorState.TimeStamp._) : 0)
                };
                
                console.log(util.format('Changing state of: %s', util.inspect(requestModel)));
                
                // store the state
                // TODO: since there is no lock, state might change between queering and writing back
                tableService.insertOrReplaceEntity(TABLE_SENSORS_STATE, sensorState, function (error, result, response) {
                    if (error)
                        reject({
                            code: 500,
                            log: util.format('Failed to insert/update into %s row %s due to %s.', 
                                TABLE_SENSORS_STATE, util.inspect(sensorState), util.inspect(error))
                        });
                    else
                        resolve(sensorState);
                });
            }
            else
                // no changes detected
                resolve();
        });
    }).then(function (sensorState) {
        return q.Promise(function (resolve, reject) {
            if (!sensorState)
                // message doesn't need to be send
                return resolve();
            else {
                // send notification
                var message = {
                    client: clientId,
                    sensor_type: requestModel.sensor_type,
                    sensor_id: requestModel.sensor_id,
                    new_state: requestModel.state, 
                    previous_state: sensorState.PreviousState._,
                    previous_state_duration_ms: sensorState.PreviousStateDurationMs._
                };
                queuesService.createMessage(QUEUE_SENSORS_STATE, JSON.stringify(message), function (error) {
                    if (!error)
                        resolve();
                    else
                        reject({
                            code: 500,
                            log: util.format('Failed to write into %s message %s due to %s.', 
                                QUEUE_SENSORS_STATE, util.inspect(message), util.inspect(error))
                        });
                });
            }
        });
    });
};

exports.storeState = function (clientId, requestModel) {    
    var now = new Date();

    // those do in parallel
    return q.fcall(function () { 
        // since we store a reference to promise, it will be ALREADY fulfilled on second time and on
        return ensureTablesPromise;
    })
    .then(function () {
        // parallelize
        return q.all([
            storeHistory(now, clientId, requestModel), 
            storeClientAlive(now, clientId, requestModel), 
            updateState(now, clientId, requestModel)]);
    });  
};