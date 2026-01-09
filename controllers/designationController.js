
const Designation = require('../models/designationModel');
const Employee = require('../models/employeeModel');
const Department = require('../models/departmentModel');
const mongoose = require('mongoose');

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    let query = {};

    const {q} = req.query;

    const { department } = req.query;

    // If department name is provided, find the department ID first
    if (department) {
      const departmentDoc = await Department.findOne({ 
        name: department,
        company: user.company ? user.company : user._id 
      });
      
      if (!departmentDoc) {
        return res.status(404).json({
          success: false, 
          error: "Department not found"
        });
      }
      
      query.department = departmentDoc._id;
    }

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
        ...query, // Preserve existing query (including department filter if set)
        company: user.company ? user.company : user._id,
        $or: [
          { name: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        ...query, // Preserve existing query (including department filter if set)
        company: user.company || user._id,
      };
    }


    const designations = await Designation.find(query)
      .skip(skip)
      .limit(limit)
      .populate('department', 'name')
      .sort({createdAt: -1})
      .lean();

    if (designations.length <= 0) {
      return res.status(404).json({success:false, error: "No designations found" });
    }

    const totalRecords = await Designation.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      designations,
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
    res.status(500).json({success:false, error: "Error while getting designations: " + error.message });
  }
};

exports.getDesignation = async (req, res) => {
  try {
    const user=req.user;

    const departmentParam = req.query.department; 
    if (!departmentParam) {
      return res.status(400).json({success:false, error: 'Department name or ID is required' });
    }

    // Check if departmentParam is a valid ObjectId, if not, treat it as a name
    let departmentId;
    if (mongoose.Types.ObjectId.isValid(departmentParam)) {
      departmentId = departmentParam;
    } else {
      // Find department by name
      const departmentDoc = await Department.findOne({ 
        name: departmentParam,
        company: user.company ? user.company : user._id 
      });
      
      if (!departmentDoc) {
        return res.status(404).json({
          success: false, 
          error: 'Department not found'
        });
      }
      
      departmentId = departmentDoc._id;
    }

    const designations = await Designation.find({
      company: user.company ? user.company : user._id,
      department: departmentId
    }).populate('department', 'name');

    if (designations.length <= 0) {
      return res.status(404).json({success:false, error: 'No Designations Found in this department' });
    }

    res.status(200).json({ designations, success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error while Getting Designations: ' + error.message });
  }
};

exports.create = async (req, res)=>{
  try {
   const user= req.user;  
    const {name, department, permissions}= req.body;
    const existingdesignation = await Designation.findOne({name, department, company: user.company ? user.company : user._id});
    if(existingdesignation){
      return res.status(409).json({ success: false, error: 'Designation with this name already exists' });
    }
      
      const newDesignation = await Designation({  
          name,
          department,
          company: user.company ? user.company : user._id,
          permissions,
      });

      if(newDesignation){
          await newDesignation.save();
          return res.status(200).json({
            success: true,
            message: `Designation created successfully`,
          });
      }
      res.status(400).json({success: false, error:"Designation not created "});
  } catch (error) {
      res.status(500).json({error:"Error while Creating Designation: "+ error.message});
  }
};

exports.update = async ( req, res)=>{
    try {
        const designation= await Designation.findByIdAndUpdate(req.params.id,req.body,{ new: true, runValidators: true });

        if(!designation){
            return res.status(404).json({success: false, error:"Designation not found"});
        }
      
        res.status(200).json({
            success: true,
            message: "Designation Updated Successfully",
        });
        
    } catch (error) {
        res.status(500).json({error: "Error while Updating Designation: "+error.message});
    }
}

exports.delete = async (req, res) => {
  try {
      const employeeCount = await Employee.countDocuments({ designation: req.params.id });
      
      if (employeeCount > 0) {
          return res.status(400).json({success:false, error: "Cannot delete designation because there are employees associated with it." });
      }

      const designation = await Designation.findByIdAndDelete(req.params.id);
      if (!designation) {
          return res.status(404).json({success:false, error: "Designation not found." });
      }

      res.status(200).json({ designation, message: "Designation deleted successfully." , success: true});
  } catch (error) {
      res.status(500).json({ error: "Error while deleting designation: " + error.message });
  }
}
