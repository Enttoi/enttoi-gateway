/*
 * Stores and notify sensors statuses
 */
var util = require('util')
 
var express = require('express');
var azure = require('azure-storage');
var entGen = azure.TableUtilities.entityGenerator;

var STORAGE_ACCOUNT = process.env.STORAGE_ACCOUNT || 'UseDevelopmentStorage=true'; 
var STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;

var TABLE_SENSORS_HISTORY = 'SensorsHistory';
var TABLE_SENSORS_STATE = 'SensorsState';
var tableService = azure.createTableService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
tableService.createTableIfNotExists(TABLE_SENSORS_HISTORY, function () { });
tableService.createTableIfNotExists(TABLE_SENSORS_STATE, function () { });

var QUEUE_SENSORS_STATE = 'sensor-state-changed';
var queuesService = azure.createQueueService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
queuesService.createQueueIfNotExists(QUEUE_SENSORS_STATE, function () { });

var ALLOWED_CLIENTS = (process.env.ALLOWED_CLIENTS || 'e997b810-f0ae-4cde-b933-e2ed6430d2d1').split(';');

exports.post = function (req, res) {
    // validate request
    req.checkBody({
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
    var ticks = ((now.getTime() * 10000) + 621355968000000000);
	var historyEntry = {
        PartitionKey : entGen.String(util.format('%s_%s_%s', req.body.client, req.body.sensor_type, req.body.sensor_id)),
		RowKey: entGen.String(ticks + ''),
		NewState: entGen.Int32(req.body.state),
		TimeStamp: entGen.DateTime(now)
    };

	// requests that arrives at the same time will override because of the RowKey
	tableService.insertOrReplaceEntity(TABLE_SENSORS_HISTORY, historyEntry, function (error, result, response) {
		if (error) {
			console.log(util.format('Failed to insert/update row %s due to %s.', util.inspect(historyEntry), util.inspect(error)));
		}
    });
    
    // TODO: detect if the state was changed


    // send notification TODO: only when state changed
    var message = {
        client: req.body.client,
        sensor_type: req.body.sensor_type,
        sensor_id: req.body.sensor_id,
        old_state: 0,
        new_state: 1
    };
    queuesService.createMessage(QUEUE_SENSORS_STATE, message, function (error) {
        if (error) {
            console.log(util.format('Failed to send message %s due to %s.', util.inspect(message), util.inspect(error)));
        }
    });
	
	res.end();
};