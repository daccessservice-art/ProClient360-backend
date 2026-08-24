const bcrypt = require('bcrypt');
const mime = require('mime-types');

const Company = require('../models/companyModel');
const Customer = require('../models/customerModel');
const Project = require('../models/projectModel');
const Employee = require('../models/employeeModel');
const Department = require('../models/departmentModel');
const TaskSheet = require('../models/taskSheetModel');
const CompanyHistory = require('../models/companyHistoryModel');
const Admin = require('../models/adminModel');
const Designation = require('../models/designationModel');
const {bucket} = require('../utils/firebase');

exports.showAll = async (req, res) => {
  try {

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    const {q} = req.query;

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
          { admin: { $regex: searchRegex } },
        ],
      };
    } 
    const companies = await Company.find(query, { password: 0 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (companies.length <= 0) {
      return res.status(404).json({success:false, error: "No company found" });
    }

    const totalRecords = await Company.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      companies,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Error while fetching companies: " + error.message });
  }
};

exports.getCompany = async (req, res)=>{
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if(!company){
      return res.status(400).json({error:"Company not found"});
    }
    res.status(200).json(company);
  } catch (error) {
    res.status(500).json({error:"Error in getCompany: "+error.message});
  }
};

exports.createCompany= async (req, res)=>{
    try {
      const {name, email, GST, admin, mobileNo, Address, password, logo, subDate,subAmount, confirmPassword} = req.body;
      
      const existAdmin = await Admin.findOne({email});
      const emp= await Employee.findOne({email});
      if(existAdmin || emp){
        return res.status(409).json({success:false,error:"Email already exists"});
      }
      if(password !== confirmPassword){
        return res.status(400).json({error:`Password doesn't match!!!`});
      }
      
      if(!Address){
        return res.status(400).json({error:"Address Required..."});
      }
      const address=JSON.parse(Address);
      
      const company = await Company.findOne({email});
      if(company){
        console.log("Company already exists");
        return res.status(409).json({success:false,error:"Company already exists"});
      }
      const salt=await bcrypt.genSalt(10);
      const hashPassword=await bcrypt.hash(password,salt);

      let logoUrl=null;


      if(logo && logo.length >0){
        const fileExtension = logo.match(/data:image\/([a-zA-Z]+);base64/); // Extract file type
        const fileType = fileExtension ? fileExtension[1] : 'png'; // Default to png if not found
        const contentType = mime.lookup(fileType) || 'image/png';

        const fileName = `logos/${name}_${Date.now()}.${fileType}`;
        const file = bucket.file(fileName);

        const buffer = Buffer.from(logo.split(',')[1], 'base64');

        // Upload the file to Firebase Storage
        await file.save(buffer, {
            metadata: { contentType: contentType },
        });

        // Make the file publicly accessible
        await file.makePublic();

        // Get the public URL of the uploaded logo
        logoUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log('Logo URL:', logoUrl);
      }
      
      const newComp=Company({
        name:name,
        email:email.toLowerCase().trim(),
        subAmount:subAmount,
        GST:GST,
        admin:admin,
        mobileNo:mobileNo,
        password:hashPassword,
        subDate:new Date(subDate),
        logo:logoUrl,
        Address:address
      });


      if(newComp){
        await newComp.save();
        res.status(200).json({
          success:true,
          message:"Company Created Successfully"
        });
      }
      else{
        res.status(400).json({
          success:false,
          error:"Invalid Company Data!!!"
        });

      }
    }catch(error){
      console.log(error);
      res.status(400).json({error:"Error While Creating Company: "+error.message});
    }
  };

exports.deleteCompany = async (req, res)=>{
    try {
      const company = await Company.findByIdAndDelete(req.params.id);

      if(!company){
          res.status(404).json({error:"Company not found"});
      }

      await Customer.deleteMany({ company: req.params.id });
      await Project.deleteMany({ company: req.params.id });
      await Employee.deleteMany({ company: req.params.id });
      await Department.deleteMany({ company: req.params.id });
      await Designation.deleteMany({ company: req.params.id });
      await TaskSheet.deleteMany({company:req.params.id});
      res.status(200).json({message:"Company Deleted Sucessfully: "+company.email});

    } catch (error) {
        res.status(500).json({error:"Error in while Deleting Company: "+error.message});
    }
};

exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Find the existing company record
    const existingCompany = await Company.findById(id);

    if (!existingCompany) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // ✅ NEW: if a new logo (base64 data URL) was submitted from the
    // "Update Company" form, upload it to Firebase Storage — same logic
    // as createCompany — and replace updatedData.logo with the resulting
    // public URL before saving. If no new logo was submitted, don't
    // overwrite the existing logo with an empty/missing value.
    if (updatedData.logo && typeof updatedData.logo === 'string' && updatedData.logo.startsWith('data:image')) {
      try {
        const fileExtension = updatedData.logo.match(/data:image\/([a-zA-Z]+);base64/);
        const fileType = fileExtension ? fileExtension[1] : 'png';
        const contentType = mime.lookup(fileType) || 'image/png';

        const fileName = `logos/${updatedData.name || existingCompany.name}_${Date.now()}.${fileType}`;
        const file = bucket.file(fileName);

        const buffer = Buffer.from(updatedData.logo.split(',')[1], 'base64');

        await file.save(buffer, {
          metadata: { contentType: contentType },
        });

        await file.makePublic();

        updatedData.logo = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        console.log('[UPDATE-COMPANY] ✅ New logo uploaded:', updatedData.logo);
      } catch (logoErr) {
        console.error('[UPDATE-COMPANY] ❌ Logo upload failed, keeping existing logo:', logoErr.message);
        delete updatedData.logo;
      }
    } else if (!updatedData.logo) {
      delete updatedData.logo;
    }

    // Update the company record
    await Company.findByIdAndUpdate(id, updatedData, { new: true});

    res.status(200).json({ success:true, message: 'Company updated successfully' });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Error While Updating Company: ', message: error.message });
  }
};