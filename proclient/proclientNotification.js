const proclientApp = require("./proclientFirebase");

async function sendAndroidNotification(fcmToken, title, body, data = {}) {
  const stringData = {};
  for (const key in data) stringData[key] = String(data[key]);

  return proclientApp.messaging().send({
    token: fcmToken,
    notification: { title, body },
    data: stringData,
    android: { priority: "high", notification: { sound: "default" } },
  });
}

module.exports = { sendAndroidNotification };