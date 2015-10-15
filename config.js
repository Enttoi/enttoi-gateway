exports.connections = {
    storage: {
        account: process.env.STORAGE_ACCOUNT || 'UseDevelopmentStorage=true',
        accessKey: process.env.STORAGE_ACCESS_KEY
    },
    documentDb: {
        endpoint: process.env.DOCUMENT_DB_ENDPOINT,
        authKey: process.env.DOCUMENT_DB_ACCESS_KEY,
        dbName: process.env.DOCUMENT_DB_NAME || 'development'
    }   
};
