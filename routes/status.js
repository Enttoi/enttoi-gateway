/*
 * Saves Status
 */
 
var express = require('express');
var azure = require('azure');


var STATUS_TABLE_NAME = process.env.STATUS_TABLE_NAME;
var STORAGE_ACCOUNT = process.env.STORAGE_ACCOUNT;
var STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;


exports.report = function (req, res) {
    var response = {
        status  : 200,
        success : 'Updated Successfully'
    };
    
    //Send Queue Message    
    //var serviceBusService = require('azure').createServiceBusService('Endpoint=sb://enttoi.servicebus.windows.net/;SharedAccessKeyName=All;SharedAccessKey=hxIHZjUiUDhOu9LhWL/RsWTDcdx9mhzDm75L7NPB6WA=');
    var serviceBusService = require('azure').createServiceBusService();
                                                                      
    //serviceBusService.createQueueIfNotExists('statusQ', function (error) {
    //    if (!error) {
    //    // Queue exists
    //    }
    //});
    
    var message = {
        body: JSON.stringify(req.body),
        customProperties: {
            testproperty: 'TestValue'
        }
    };
    serviceBusService.sendQueueMessage('statusQ', message, function (error) {
        if (!error) {
        // message sent
        }
    });
    
    
    //updating Storage
    var tableService = azure.createTableService(STORAGE_ACCOUNT, STORAGE_ACCESS_KEY);
    tableService.createTableIfNotExists(STATUS_TABLE_NAME, function () {
        console.log("ToiletStatus Created..")
    });
    
    var statusReport = {
        PartitionKey : { '_': req.body.room, '$': 'Edm.Int32' },//room
        RowKey: { '_': req.body.door, '$': 'Edm.Guid' },//door id
        Status: { '_': req.body.status, '$': 'Edm.Int32' },//status 0:notInUse , 1:InUse
        TimeStamp: { '_': new Date(), '$': 'Edm.DateTime' }
    };
    
    
    tableService.insertOrReplaceEntity(STATUS_TABLE_NAME, statusReport, function (error) {
        if (!error) {
            console.log("entry added/updated");
        }
    });
    
     
    res.end(JSON.stringify(response));




};