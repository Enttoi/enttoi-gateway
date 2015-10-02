/*
 * Saves Status
 */
 
var express = require('express');
var azure = require('azure-storage');


var STATUS_TABLE_NAME = process.env.STATUS_TABLE_NAME; 
var STORAGE_ACCOUNT = process.env.STORAGE_ACCOUNT; 
var STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;


exports.report = function (req, res) {
	var response = {
		status  : 200,
		success : 'Updated Successfully'
	};
	
	//updating 
	var tableService = azure.createTableService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
	tableService.createTableIfNotExists(STATUS_TABLE_NAME, function () {
		console.log("STATUS_TABLE created..")
	});
	
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
	
	res.end(JSON.stringify(response));
};