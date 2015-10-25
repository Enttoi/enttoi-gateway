# Enttoi Gateway Node.js

*This repository is part of [Enttoi](http://enttoi.github.io/) project.*

Central gateway for all Raspberry Pi's. It is based on [Express](https://github.com/strongloop/express) for serving REST API endpoint and a set of [SDK's](https://github.com/Azure/azure-sdk-for-node) for interacting with Azure services.

## Running in dev

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
5. The server will accept POST request at ```http://localhost:3000/sensor``` with the following payload:
  
  ```js
  {
    "token": "", // private token which identifies the client
    "sensorType": "cabin_door", // type of the sensor that reporting
    "sensorId": 1, // the identifier of specific sensor within list of types
    "state":1 // the code which corresponds to the current state of the sensor
  }
  ```
