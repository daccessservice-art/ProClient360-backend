const express = require("express");
const router = express.Router();
const { sendAndroidNotification } = require("./proclientNotification");

router.post("/notify", async (req, res) => {
  const { token, title, body, data } = req.body;
  if (!token || !title || !body) {
    return res.status(400).json({ success: false, error: "token, title and body are required" });
  }
  try {
    const messageId = await sendAndroidNotification(token, title, body, data);
    res.json({ success: true, messageId });
  } catch (err) {
    console.error("Proclient notification error:", err.code, err.message);
    res.status(500).json({ success: false, code: err.code, error: err.message });
  }
});

module.exports = router;