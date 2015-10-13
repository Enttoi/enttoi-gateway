/*
 * Stores and notify sensors statuses
 */
var util = require('util');
var azure = require('azure-storage');
var q = require('q');
var sensorModel = require('../models/sensor');

var tableUtilities = azure.TableUtilities.entityGenerator;

var STORAGE_ACCOUNT = process.env.STORAGE_ACCOUNT || 'UseDevelopmentStorage=true';
var STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;
var TABLE_SENSORS_HISTORY = 'SensorsHistory';
var TABLE_SENSORS_STATE = 'SensorsState';
var TABLE_CLIENTS_STATE = 'ClientsState';
var QUEUE_SENSORS_STATE = 'sensor-state-changed';
var ALLOWED_CLIENTS = (process.env.ALLOWED_CLIENTS || 'e997b810-f0ae-4cde-b933-e2ed6430d2d1').split(';');

var tableService = azure.createTableService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
var queuesService = azure.createQueueService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);

tableService.createTableIfNotExists(TABLE_SENSORS_HISTORY, function () { });
tableService.createTableIfNotExists(TABLE_SENSORS_STATE, function () { });
tableService.createTableIfNotExists(TABLE_CLIENTS_STATE, function () { });
queuesService.createQueueIfNotExists(QUEUE_SENSORS_STATE, function () { });

// validate request
var validateRequest = function (request) {
    var s = request.checkBody(sensorModel.postValidationModel);
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
        if (ALLOWED_CLIENTS.indexOf(request.body.client) >= 0)
            resolve();
        else
            reject({ code: 401 });
    });
}

// store raw history 
var storeHistory = function (now, requestModel) {
    var historyEntry = {
        PartitionKey : tableUtilities.String(util.format('%s_%s_%s', requestModel.client, requestModel.sensor_type, requestModel.sensor_id)),
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
var storeClientAlive = function (now, requestModel) {
    var clientState = {
        PartitionKey : tableUtilities.String(requestModel.client),
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
var updateState = function (now, requestModel) {
    var sensorStateRowKey = util.format('%s_%s', requestModel.sensor_type, requestModel.sensor_id);
    
    return q.fcall(function() {
        return q.Promise(function (resolve, reject) {
            // get the current state
            tableService.retrieveEntity(TABLE_SENSORS_STATE, requestModel.client, sensorStateRowKey, function (error, sensorState, response) {
                if (error && error.statusCode != 404) {
                    reject({
                        code: 500,
                        log: util.format('Failed to retrieve from %s row %s due %s.', 
                        TABLE_SENSORS_STATE, util.inspect({ partioionKey: requestModel.client, rowKey: sensorStateRowKey }), util.inspect(error))
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
                    PartitionKey : tableUtilities.String(requestModel.client),
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
                    client: requestModel.client,
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

exports.post = function (req, res) {
    
    var now = new Date();
    
    validateRequest(req).then(function () {
        return authorizeClient(req);
    })
    .then(function () {
        // those do in parallel
        return q.all([
            storeHistory(now, req.body), 
            storeClientAlive(now, req.body), 
            updateState(now, req.body)]);
    })
    .then(function () {
        // all went well => return 200
        res.end();
    })
    .fail(function (error) {        
        if (error && error.log)
            console.log(error.log);
        else if (error && !error.code)
            // an exception was thrown
            console.log(util.inspect(error));        
        res.status(error && error.code ? error.code : 500).send(error.errors);
    })
    .done();
};