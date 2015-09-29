/*
 * Saves Status
 */

var express = require('express');
var azure = require('azure-storage');

var STATUS_TABLE_NAME = "ToiletStatus";
var STORAGE_ACCOUNT = "enttoi";
var STORAGE_ACCESS_KEY = "aSrmJbPArvZevhgR62doMkGq9xk9i2azOrNZLgqD9PVFT1u3IR31nPd9sIqeg5G99Y4TWqo8OgjWgkQOaMeybw==";


exports.report = function (req, res) {
    var response = {
        status  : 200,
        success : 'Updated Successfully'
    }   
    
    var tableService = azure.createTableService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
    tableService.createTableIfNotExists(STATUS_TABLE_NAME, function () {
        console.log("ToiletStatus Created..")
    });
    
    var statusReport = {
        PartitionKey : { '_': '1', '$': 'Edm.Int32' },//room
        RowKey: { '_': '2', '$': 'Edm.Int32' },//door id
        Status: { '_': '1', '$': 'Edm.Int32' },
        TimeStamp: { '_': new Date(), '$': 'Edm.DateTime' }
    };
    
    tableService.insertOrReplaceEntity(STATUS_TABLE_NAME, statusReport, function (error) {
        if (!error) {
            console.log("entry added/updated");
        }
    });
    
    res.end(JSON.stringify(response));




};