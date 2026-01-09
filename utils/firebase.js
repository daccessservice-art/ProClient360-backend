const admin = require('firebase-admin');

// 1. Get the service account data from an Environment Variable
// On Render, we will provide this as a string
const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;

// 2. Parse the string into an object, or fall back to the local file (for local dev)
const serviceAccount = serviceAccountVar 
    ? JSON.parse(serviceAccountVar) 
    : require('../serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.Firebase_Bucket
});

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };