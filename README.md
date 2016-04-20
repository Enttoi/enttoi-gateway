# Enttoi Gateway

|Branch|Travis|
|------|:------:|
|master|[![Build Status](https://img.shields.io/travis/Enttoi/enttoi-gateway/master.svg)](https://travis-ci.org/Enttoi/enttoi-gateway)|
|dev   |[![Build Status](https://img.shields.io/travis/Enttoi/enttoi-gateway/dev.svg)](https://travis-ci.org/Enttoi/enttoi-gateway)|

Central gateway for [Enttoi's clients](https://github.com/Enttoi/enttoi-client). It is based on [Express](https://github.com/strongloop/express) for serving REST API endpoint and a set of [SDK's](https://github.com/Azure/azure-sdk-for-node) for interacting with Azure services.

## Running 

1. Ensure that [NodeJS](http://nodejs.org/) is installed. 
2. From the project folder, execute the following command:

  ```shell
  npm install
  ```
3. There are a few environment variables need to be set, which are located in config.js in root folder
4. To run server, execute from root:

  ```shell
  node app.js
  ```

## API

> When invoking API's `Authorization` header containing client's token must be specified

There are two enpoints exposed:

1. POST: `/client/heartbeat` - receive indication that client is online. If no no heart beat received for certain amount of time, 
the client becomes 'offline'. 
2. POST: `/sensor` - for updating state of the sensor. In addition the API is also served as heart beat of the 
client (same as `/client/heartbeat`), so if state is sent frequently there is no need to call to `/client/heartbeat`.
The following payload must be supplied:
```js
{
  "sensorType": "cabin_door", // type of the sensor that reporting
  "sensorId": 1, // the identifier of specific sensor within list of types
  "state":1 // the code which corresponds to the current state of the sensor - can be either 0 or 1
}  
  ```



