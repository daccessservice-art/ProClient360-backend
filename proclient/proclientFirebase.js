const admin = require("firebase-admin");

let proclientApp;
try {
  proclientApp = admin.app("proclient360");
} catch (e) {
  proclientApp = admin.initializeApp(
    {
      credential: admin.credential.cert({
        projectId: process.env.PROCLIENT_FIREBASE_PROJECT_ID,
        clientEmail: process.env.PROCLIENT_FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.PROCLIENT_FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    },
    "proclient360"
  );
}

module.exports = proclientApp;