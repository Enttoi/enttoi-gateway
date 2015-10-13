/*
 * Stores and notify sensors statuses
 */
var util = require('util'); 
var azure = require('azure-storage');
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

var storeHistory = function (now, body) {
    var historyEntry = {
        PartitionKey : tableUtilities.String(util.format('%s_%s_%s', body.client, body.sensor_type, body.sensor_id)),
        RowKey: tableUtilities.String(now.getTime() + ''), // milliseconds since 1 January 1970 00:00:00 UTC
        State: tableUtilities.Int32(body.state),
        TimeStamp: tableUtilities.DateTime(now)
    };
    
    // requests that arrives at the same time will override because of the RowKey
    tableService.insertOrReplaceEntity(TABLE_SENSORS_HISTORY, historyEntry, function (error, result, response) {
        if (error) {
            console.log(util.format('Failed to insert/update into %s row %s due to %s.', 
                TABLE_SENSORS_HISTORY, util.inspect(historyEntry), util.inspect(error)));
        }
    });
};

var storeClientAlive = function (now, body) {
    var clientState = {
        PartitionKey : tableUtilities.String(body.client),
        RowKey: tableUtilities.String('LastPing'),
        TimeStamp: tableUtilities.DateTime(now)
    };
    tableService.insertOrReplaceEntity(TABLE_CLIENTS_STATE, clientState, function (error, result, response) {
        if (error) {
            console.log(util.format('Failed to insert/update into %s row %s due to %s.',
                 TABLE_CLIENTS_STATE, util.inspect(clientState), util.inspect(error)));
        }
    });
};

exports.post = function (req, res) {
    // validate request
    var s = req.checkBody(sensorModel.postValidationModel);        
    var errors = req.validationErrors();
    if (errors) {
        res.status(400).send((errors));
        return;
    }
    
    // validate client
    if (ALLOWED_CLIENTS.indexOf(req.body.client) < 0) {
        res.status(401).send();
        return;
    }
    
    // store history 	    
    var now = new Date();
    storeHistory(now, req.body);
    
    // store client's keep alive
    storeClientAlive(now, req.body);
    
    // query for sensor's current state
    var sensorStateRowKey = util.format('%s_%s', req.body.sensor_type, req.body.sensor_id);
    tableService.retrieveEntity(TABLE_SENSORS_STATE, req.body.client, sensorStateRowKey, function (error, sensorState, response) {
        if (error && error.statusCode != 404) {
            console.log(util.format('Failed to retrieve from %s row %s due %s.',
                 TABLE_SENSORS_STATE, util.inspect({ partioionKey: req.body.client, rowKey: sensorStateRowKey}), util.inspect(error)));    
        }
        else {
            // detect if the state was changed          
            if (sensorState == null || (sensorState.State._ != req.body.state && sensorState.TimeStamp._ < now)) {
                // store updated state
                sensorState = {
                    PartitionKey : tableUtilities.String(req.body.client),
                    RowKey: tableUtilities.String(sensorStateRowKey),
                    State: tableUtilities.Int32(req.body.state),
                    TimeStamp: tableUtilities.DateTime(now),
                    PreviousState: tableUtilities.Int32(sensorState ? sensorState.State._ : -1),
                    PreviousStateDurationMs: tableUtilities.Int32(sensorState ? Math.abs(now - sensorState.TimeStamp._) : 0)
                };

                console.log(util.format('Changing state of: %s', util.inspect(req.body)));
                
                // TODO: since there is no lock, state might change between queering and writing back
                tableService.insertOrReplaceEntity(TABLE_SENSORS_STATE, sensorState, function (error, result, response) {
                    if (error) {
                        console.log(util.format('Failed to insert/update into %s row %s due to %s.',
                            TABLE_SENSORS_STATE, util.inspect(sensorState), util.inspect(error)));
                    }
                    else {
                        // send notification
                        var message = {
                            client: req.body.client,
                            sensor_type: req.body.sensor_type,
                            sensor_id: req.body.sensor_id,
                            new_state: req.body.state, 
                            previous_state: sensorState.PreviousState._,
                            previous_state_duration_ms: sensorState.PreviousStateDurationMs._ 
                        };
                        queuesService.createMessage(QUEUE_SENSORS_STATE, JSON.stringify(message), function (error) {
                            if (error) {
                                console.log(util.format('Failed to write into %s message %s due to %s.', 
                                    QUEUE_SENSORS_STATE, util.inspect(message), util.inspect(error)));
                            }
                        });
                    }
                });    
            }
        }
    });
	
	res.end();
};