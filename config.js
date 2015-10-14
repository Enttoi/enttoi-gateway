﻿exports.connections = {
    storage: {
        account: process.env.STORAGE_ACCOUNT,
        accessKey: process.env.STORAGE_ACCESS_KEY
    },
    documentDb: {
        endpoint: process.env.DOCUMENT_DB_HOST,
        authKey: process.env.DOCUMENT_ACCESS_KEY
    }   
};
