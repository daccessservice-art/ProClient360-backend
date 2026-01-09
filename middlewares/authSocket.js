const jwt = require('jsonwebtoken');
const config = require('../utils/config');

// Middleware for HTTP request authentication
exports.authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET || config.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Middleware for WebSocket authentication
exports.authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  jwt.verify(token, process.env.JWT_SECRET || config.JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user;
    next();
  });
};

