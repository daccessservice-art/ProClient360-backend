const jwt = require('jsonwebtoken');

const Employee= require('../models/employeeModel.js');
const Company = require('../models/companyModel.js');
const Admin = require('../models/adminModel.js');

const {formatDate}= require ('../utils/formatDate.js');
const { comparePassword, changePassword, validateEmail } = require('../utils/login.js');
const { sendMail } = require('../mailsService/email.js');
const { resetTokenLink, verifyResetToken, generateTokenAndSendResponse} = require('../utils/generateToken.js');


exports.login = async (req, res) => {
  try {
    const { email, password, fcmToken, tokenCF } = req.body;

    let user;
    const date = new Date(Date.now()); 

    if(!email || !password){
      return res.status(400).json({ success: false, error: "Please enter both email and password" });
    }

    // Make Cloudflare verification optional
    if (tokenCF) {
      const secret = process.env.CLOUDFLARE_SECRET_KEY;
      const params = new URLSearchParams({
        secret,
        response: tokenCF
      });

      const cfRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        { method: "POST", body: params }
      );
      const cfJson = await cfRes.json();

      if (!cfJson.success) {
        return res.status(400).json({success: false, error: "Cloudflare captcha verification failed" });
      }
    }

    // Check for Employee
    user = await Employee.findOne({ email }).populate('company','subDate logo').populate('designation','name permissions').populate('department', 'name');
    if (user) {
      if (!(await comparePassword(user, password))) {
        return res.status(400).json({ success: false, error: 'Invalid username or password' });
      }

      if(user.company.subDate <= date){
        return res.status(400).json({ success: false, error: 'Your account has been deactivated on: '+ formatDate(user.company.subDate )});
      }
      user.fcmToken = fcmToken;
      await user.save();

      generateTokenAndSendResponse(user, res, "employee");
    } 
    else {
      // Check for Company
      user = await Company.findOne({ email });
      if (user) {
        if (!(await comparePassword(user, password))) {
          return res.status(400).json({ success: false, error: 'Invalid username or password' });
        }

        if(user.subDate <= date){
          return res.status(400).json({ success: false, error: 'Your account has been deactivated on: '+ formatDate(user.subDate) });
        }

        generateTokenAndSendResponse(user, res,"company"); 
      } 
      else {
        // Check for Admin
        user = await Admin.findOne({email});
        if (user) {
          if (!(await comparePassword(user, password))) {
            return res.status(400).json({ success: false, error: 'Invalid username or password' });
          }
          generateTokenAndSendResponse(user, res,"admin");
        }
        else {
          return res.status(400).json({ success: false, error: 'Invalid username or password' });
        }
      }
    }
  } catch (err) {
    console.log("Error in login controller: ", err.message);
    res.status(500).json({ success: false, error: "Internal Server Error: "+err.message });
  }
};

exports.changePassword = async (req, res)=>{
  try {
    const {oldPass, newPass} = req.body;
    const user = req.user;

    if(user){
      if(await comparePassword(user, oldPass)){
        changePassword(res,user, newPass);
      }else{
        return res.status(400).json({ success: false, error: "Wrong Password..." });
      }
    }else{
      return res.status(404).json({ success: false, error: "User not found..." });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: "Error while changing password: "+error.message });
  }
};

exports.forgetPassword = async (req, res)=>{
  try {
    const {email}=req.body;
  
    if(!email || !validateEmail(email)){
      return res.status(400).json({ success: false, error: "Invalid Email..." });
    }
    
    const [employee, company, admin] = await Promise.all([
      Employee.findOne({ email }),
      Company.findOne({ email }),
      Admin.findOne({email},)
    ]);

    const user = employee || company || admin;

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found..." });
    }

    const link = resetTokenLink(user);
    sendMail(res,user,link);
  } catch (error) {
    console.log("Error in the forget-password: "+error.message);
    res.status(500).json({ error: "Error while sending reset password link: " + error.message });
  }
};


exports.resetPassword = async (req, res)=>{
  try {
    const {id,token}=req.params;
    const {password, confirmPassword}=req.body;

    const [employee, company, admin] = await Promise.all([
      Employee.findById(id),
      Company.findById(id),
      Admin.findById(id)
    ]);

    const user = employee || company || admin;

    if(user){
      if(verifyResetToken(user,token)){
        if(confirmPassword===password){
          return changePassword(res,user,password);
        }
        else{
          return res.status(400).json({ success: false, error: "Password dosen't match " });
        }
      }
      else{
        return res.status(400).json({ success: false, error: "Link Expired..." });
      } 
    }
    else{
      return res.status(400).json({ success: false, error: "User not found..." });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while reseting password: "+error.message });
  }
};


exports.logout = async (req, res) => {
  try { 
      res.status(200).json({ success: true, message: "Logout successfully" });
  } catch (err) {
      console.log("Error in logout controller:", err.message);
      res.status(500).json({ success: false, error: "Internal Server Error: " + err.message });
  }
};