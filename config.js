exports.connections = {
    storage: {
        connectionString: process.env.STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true'
    },
    documentDb: {
        endpoint: process.env.DOCUMENT_DB_ENDPOINT,
        authKey: process.env.DOCUMENT_DB_ACCESS_KEY,
        dbName: process.env.DOCUMENT_DB_NAME || 'development'
    }   
};
