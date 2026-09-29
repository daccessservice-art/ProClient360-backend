const jwt = require('jsonwebtoken');
const Company = require('../models/companyModel');
const Admin = require('../models/adminModel');
const Employee = require('../models/employeeModel');
const { formatDate } = require('../utils/formatDate');
const Designation = require('../models/designationModel');

// ---------- Helpers ----------

const authError = (message, code, status = 401) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.isAuthError = true;
  return err;
};

// Reads "Bearer <token>" and returns user id from token
const getUserIdFromRequest = (req) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in .env');
  }

  const header = req.headers['authorization'];
  const token = header && header.startsWith('Bearer ')
    ? header.split(' ')[1]
    : header;

  if (!token || token === 'null' || token === 'undefined') {
    throw authError('Unauthorized: You need to log in first.', 'NO_TOKEN');
  }

  try {
    return jwt.verify(token, secret).user;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw authError('Session expired. Please log in again.', 'TOKEN_EXPIRED');
    }
    throw authError('Invalid or expired token.', 'TOKEN_INVALID');
  }
};

// Token problem → 401 (frontend auto logout), server bug → 500 (no logout)
const sendError = (res, err) => {
  if (err.isAuthError) {
    return res.status(err.status).json({ success: false, code: err.code, error: err.message });
  }
  console.error('Auth middleware error:', err);
  return res.status(500).json({ success: false, error: 'Internal server error' });
};

// ---------- Middlewares ----------

module.exports.isLoggedIn = async (req, res, next) => {
  try {
    const userId = getUserIdFromRequest(req);

    const user =
      (await Employee.findById(userId)) ||
      (await Company.findById(userId)) ||
      (await Admin.findById(userId));

    if (!user) {
      throw authError('User not found.', 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports.isCompany = async (req, res, next) => {
  try {
    const userId = getUserIdFromRequest(req);
    const company = await Company.findById(userId);

    if (!company) {
      return res.status(403).json({ success: false, error: 'Access denied. Companies only.' });
    }

    req.user = company;
    next();
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports.isEmployee = async (req, res, next) => {
  try {
    const userId = getUserIdFromRequest(req);
    const user = await Employee.findById(userId);

    if (!user) {
      return res.status(403).json({ success: false, error: 'Access denied. Employees only.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports.isAdmin = async (req, res, next) => {
  try {
    const userId = getUserIdFromRequest(req);
    const user = await Admin.findById(userId);

    if (!user) {
      return res.status(403).json({ success: false, error: 'Access denied. Admins only.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports.permissionMiddleware = (permissions) => {
  return async (req, res, next) => {
    try {
      const userId = getUserIdFromRequest(req);
      const now = new Date();

      // Company user
      const company = await Company.findById(userId);
      if (company) {
        if (company.subDate <= now) {
          return res.status(400).json({
            success: false,
            error: 'Your account has been deactivated on: ' + formatDate(company.subDate)
          });
        }
        req.user = company;
        return next();
      }

      // Employee user
      const user = await Employee.findById(userId).populate('company', 'subDate');
      if (!user) {
        throw authError('User not found.', 'USER_NOT_FOUND');
      }

      if (!user.company) {
        return res.status(403).json({ success: false, error: 'Company not found for this user.' });
      }

      if (user.company.subDate <= now) {
        return res.status(400).json({
          success: false,
          error: 'Your account has been deactivated on: ' + formatDate(user.company.subDate)
        });
      }

      const designation = await Designation.findById(user.designation);
      if (!designation) {
        return res.status(403).json({ success: false, error: `User's permissions not found.` });
      }

      const employeePermissions = designation.permissions || [];

      // OR logic: employee needs ANY ONE of the permissions
      const hasPermissions = permissions.some((permission) =>
        employeePermissions.includes(permission)
      );

      if (!hasPermissions) {
        return res.status(403).json({
          success: false,
          error: `You do not have the required permissions, ${permissions}`
        });
      }

      req.user = user;
      next();
    } catch (err) {
      return sendError(res, err);
    }
  };
};