const bcrypt = require("bcrypt");

exports.comparePassword=async (user,password)=>{
    return await bcrypt.compare(password, user.password || '');
};

exports.changePassword= async(res, user, password)=>{
    const salt=await bcrypt.genSalt(10);
    const hashPassword=await bcrypt.hash(password,salt);
    user.password=hashPassword;
    user.newUser=false;
    await user.save();
    return res.status(200).json({success:true, message:"Password reseted successful"});
};

exports.validateEmail= (email)=>{
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}