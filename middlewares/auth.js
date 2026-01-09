const jwt = require('jsonwebtoken');
const Company = require('../models/companyModel');
const Admin = require('../models/adminModel');
const Employee = require('../models/employeeModel');
const { formatDate } = require('../utils/formatDate');
const Designation = require('../models/designationModel');



module.exports.isLoggedIn = async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
      return res.status(403).json({ error: 'Unauthorized: You need to log in first.' });
    }
  
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user;

    let user = await Employee.findById(userId) || await Company.findById(userId) || await Admin.findById(userId);
    if (!user) {
      return res.status(401).json({success:false, error: 'User not found.' });
    }

    req.user = user;
    next();

  } catch (err) {
    return res.status(401).json({ success:false,error: 'Invalid or expired token.' });
  }
};

module.exports.isCompany = async (req, res, next) => {

  try {
    const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
    if(!token){
      return res.status(403).json({ error: 'Unauthorized you need to login first' });
    }

    const userId = jwt.verify(token, process.env.JWT_SECRET).user;
    const company = await Company.findById(userId);
    if (company) {
      req.user=company;
      return next();
    } else {
      return res.status(403).json({success:false, error: 'Access denied. Companies only.' });
    }
  } catch (err) {
    return res.status(401).json({ success:false,error: 'Invalid token' });
  }
};

module.exports.isEmployee = async (req, res, next) => {
  try{
    const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
    if(!token){
      return res.status(403).json({ error: 'Unauthorized you need to login first' });
    }
    const userId = jwt.verify(token, process.env.JWT_SECRET).user;
    const user=await Employee.findById(userId);
    if (user) {
      req.user=user;
      return next();
    } else {
      return res.status(403).json({success:false, error: 'Access denied. Employees only.' });
    }
  }catch(error){
    return res.status(401).json({success:false, error: 'Invalid token'});
  }
};

module.exports.isAdmin = async (req, res, next) => {

  try {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if(!token){
    return res.status(403).json({ error: 'Unauthorized you need to login first' });
  }
    const userId = jwt.verify(token, process.env.JWT_SECRET).user;
    const user=await Admin.findById(userId);
  
    if (user) {
      req.user=user;
      return next();
    } else {
      return res.status(403).json({success:false, error: 'Access denied. Admins only.' });
    }
  } catch (err) {
    return res.status(401).json({success:false, error: 'Invalid token :'+err.message });
  }
};

module.exports.permissionMiddleware = (permissions) => {
  return async (req, res, next) => {
    try {
      const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
      if(!token){
        return res.status(403).json({ error: 'Unauthorized you need to login first' });
      }
        const userId = jwt.verify(token, process.env.JWT_SECRET).user;

        let user = await Company.findById(userId);

        const date = new Date(Date.now()); 

        if(user){
          if(user.subDate <= date){
            return res.status(400).json({success:false, error: 'Your account has been deactivated on: '+ formatDate(user.subDate )});
          }
          req.user=user;
          return next();
        }
        user= await Employee.findById(userId).populate('company','subDate');
        if(user.company.subDate <= date){
          return res.status(400).json({success:false, error: 'Your account has been deactivated on: '+ formatDate(user.company.subDate )});
        }
        const designation= await Designation.findById(user.designation);

        if(!designation){
          return res.status(403).json({success:false, error: `User's permissions not found.` });
        }
        const employeePermissions = designation.permissions; 
        const hasPermissions = permissions.every((permission) => {
          return employeePermissions.includes(permission);
        });

        if (!hasPermissions) {
          return res.status(403).json({success:false, error: `You do not have the required permissions, ${permissions}` });
        }
        req.user=user;
        next(); 
    }catch(err){
      console.log(err);
      return res.status(401).json({success:false, error: 'Invalid token'});
    }
  };
};

