const Admin = require('../models/adminModel');
const bcrypt = require('bcrypt');
const Company = require('../models/companyModel');
const Employee = require('../models/employeeModel');


exports.getAdmin = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;
    const {q} = req.query;
    // this is testing comment added to check push
    let query = {};

    if (
      q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined"
    ) {
      const searchRegex = new RegExp(q, "i");
      skip = 0;
      page = 1;
      query = {
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
        ],
      };
    } 

    const admins = await Admin.find(query, { password: 0 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (admins.length === 0) {
      return res.status(404).json({success:false, error: "No admins found" });
    }

    const totalAdmins = await Admin.countDocuments(query);
    const totalPages = Math.ceil(totalAdmins / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      admins,
      pagination: {
        currentPage: page,
        totalPages,
        totalAdmins,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Error while fetching admins: " + error.message });
  }
};

exports.dashboard = async (req, res)=>{
  try {
    const active = await Company.countDocuments({ subDate: { $gt: new Date() } });
    const inactive = await Company.countDocuments({ subDate: { $lte: new Date() } });

    const companiesByMonth = await Company.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    const companiesByYear = await Company.aggregate([
      {
          $group: {
              _id: { $year: "$createdAt" }, 
              count: { $sum: 1 }
          }
      },
      { $sort: { _id: 1 } } // Sort by year
    ]);

    res.status(200).json({
      activeSubscriptions: active,
      inactiveSubscriptions: inactive,
      totalCompaines: (active+inactive),
      companiesByMonth,
      companiesByYear,
      success:true
    });
  } catch (error) {
    console.log("Error in admin dashboard: "+error.message);
    res.status(500).json({error: "Error in admin Dashboard: "+error.message});
  }
};

// exports.inactive = async (req, res)=>{
//   try {
//     const inactive = await Company.find({ subDate: { $lt: new Date() }});
//     if(inactive <= 0){
//       return res.status(200).json({message: "No Companies are inactive now"})
//     }
//     res.status(200).json({
//       inactive,
//       totalInactive: inactive.length
//     });
//   } catch (error) {
//     console.log( "Error in inactive companies: "+error.message);
//     res.status(500).json({error: "Error in Admin dashboard, inactive: "+error.message});
//   }
// };

// exports.active = async (req, res)=>{
//   try {
//     const active = await Company.find({ subDate: { $gt: new Date() }});

//     if(active <= 0){
//       return res.status(200).json({message: "Their is no active conpanies"});
//     }

//     res.status(200).json({
//       active,
//       totalActive: active.length
//     })
//   } catch (error) {
//     console.log("Error in admin dashboard, active: "+error.message);
//     res.status(500).json({error:"Error in admin dashboard: "+error.message});
//   }
// };

exports.admin = async (req, res)=>{
    try {
      const {name, email, password, confirmPassword}= req.body;

      const company= await Company.findOne({email});
      const emp = await Employee.findOne({email});
      if(company || emp){
        return res.status(409).json({success:false,error:"Email already exists!"});
      }
      if(password !== confirmPassword){
        return res.status(400).json({success:false,error:"Password doesn't match!"});
      }
      const adm = await Admin.findOne({email});
      if(adm){
        return res.status(409).json({success:false,error:"Admin already exists!"});
      }
      const salt=await bcrypt.genSalt(10);
      const hashPassword=await bcrypt.hash(password,salt);
  
      const user = await Admin({
        name:name,
        email:email.toLowerCase(),
        password:hashPassword,
      });
  
      if(user){
        console.log("Admin Created:");
        await user.save();
        res.status(201).json({user, success:true, message:"Admin created successfully"});
      }
      else{
        res.status(400).json({success:false,error:"Invalid Admin Data!!!"});
      }
      
    } catch (error) {
      res.status(500).json({error:"Error while creating super admin: "+error.message});
    }
  };


  exports.deleteAdmin = async (req, res)=>{
    try {
        const admin=await Admin.findByIdAndDelete(req.params.id);

        if(!admin){
            res.status(404).json({success:false,error:"Admin not found!!!"});
        }
        res.status(200).json({message:admin.email+" deleted sucessfully", success:true});
    } catch (error) {
        res.status(500).json({error:"Error while deleting admin"});
    }
  };
  
  exports.update = async (req, res)=>{
    try {
        const admin = await Admin.findByIdAndUpdate(req.params.id, req.body, {new: true, runValidators: true});

        if(!admin){
            res.status(404).json({success:false,error:"Admin not found!!!"});
        }
        res.status(200).json({message:"Admin Updated sucessfully", success:true, admin});
    } catch (error) {
        res.status(500).json({error:"Error while Updating admin admin"});
    }
  };