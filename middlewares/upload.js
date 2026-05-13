const fileUpload = require('express-fileupload');

const uploadFiles = fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  useTempFiles: true,
  tempFileDir: '/tmp/'
});

module.exports = { uploadFiles };