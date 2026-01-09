const multer = require("multer");

var storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,   // 10 MB max per file
    fieldSize: 10 * 1024 * 1024,  // 10 MB max per text field (for base64 data)
    fields: 20,                   // Max number of non-file fields
    parts: 50                     
  }
});

module.exports = upload;