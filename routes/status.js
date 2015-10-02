/*
 * Stores and notify sensors statuses
 */
 
var express = require('express');
var azure = require('azure-storage');

var STORAGE_ACCOUNT = process.env.STORAGE_ACCOUNT || "UseDevelopmentStorage=true"; 
var STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;

var TABLE_SENSORS_HISTORY = "SensorsHistory";
var TABLE_SENSORS_STATE = "SensorsState";
var TABLE_CLIENTS_STATE = "ClientsState";

var tableService = azure.createTableService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
tableService.createTableIfNotExists(TABLE_SENSORS_HISTORY, function () { });
tableService.createTableIfNotExists(TABLE_SENSORS_STATE, function () { });
tableService.createTableIfNotExists(TABLE_CLIENTS_STATE, function () { });

exports.post = function (req, res) {
	
	// store history 	    

	
	var statusReport = {
		PartitionKey : { '_': req.body.room, '$': 'Edm.Guid' },//room
		RowKey: { '_': req.body.door, '$': 'Edm.Int32' },//door id
		Status: { '_': req.body.status, '$': 'Edm.Int32' },//status 0:notInUse , 1:InUse
		TimeStamp: { '_': new Date(), '$': 'Edm.DateTime' }
	};
	
	tableService.insertOrReplaceEntity(STATUS_TABLE_NAME, statusReport, function (error) {
		if (error) {
			console.log("Failed to insert/update row: " + JSON.stringify(error));
		}
	});
	
	res.end();
};