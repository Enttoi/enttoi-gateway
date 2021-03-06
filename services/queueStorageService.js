﻿var azure = require('azure-storage');
var util = require('util');
var q = require('q');
var config = require('../config');

var QUEUE_SENSORS_STATE = 'sensor-state-changed';

var RETRY_COUNT = 3;
var RETRY_INTERVAL = 500; // in ms

var retryOperations = new azure.LinearRetryPolicyFilter(RETRY_COUNT, RETRY_INTERVAL);
var queuesService = azure.createQueueService(config.connections.storage.connectionString).withFilter(retryOperations);

var initializationPromise = q.all([
    q.Promise(function (resolve, reject) {
        queuesService.createQueueIfNotExists(QUEUE_SENSORS_STATE, function (error) {
            if (error)
                reject({ log: util.format('Failed to ensure queue %s due %s.', QUEUE_SENSORS_STATE, util.inspect(error)) });
            else
                resolve();
        });
    })
]);

exports.sendStateChangedMessage = function (requestModel, sensorState) {
    return q.fcall(function () {
        // since we store a reference to promise, it will be ALREADY fulfilled on second time and on
        return initializationPromise;
    })
    .then(function () {
        return q.Promise(function (resolve, reject) {
            var message = {
                clientId: sensorState.clientId,
                sensorType: requestModel.sensorType,
                sensorId: requestModel.sensorId,
                newState: requestModel.state,
                previousState: sensorState.model.PreviousState._,
                previousStateDurationMs: sensorState.model.PreviousStateDurationMs._,
                timestamp: sensorState.timestamp
            };
            queuesService.createMessage(QUEUE_SENSORS_STATE, JSON.stringify(message), function (error) {
                if (!error)
                    resolve();
                else
                    reject({
                        statusCode: 500,
                        log: util.format('Failed to write into %s message %s due to %s.',
                            QUEUE_SENSORS_STATE, util.inspect(message), util.inspect(error))
                    });
            });
        });
    });
};