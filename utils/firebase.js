const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); 


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.Firebase_Bucket
});

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };