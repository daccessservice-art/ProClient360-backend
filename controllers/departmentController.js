const jwt = require('jsonwebtoken');

const Department = require('../models/departmentModel');
const Designation = require('../models/designationModel');
const Employee = require('../models/employeeModel');


exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    let query = {};

    const {q} = req.query;

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
        company: user.company ? user.company : user._id,
        $or: [
            { name: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }


    const departments = await Department.find(query)
      .skip(skip)
      .limit(limit)
      .sort({createdAt: -1})
      .lean();

    if (departments.length <= 0) {
      return res.status(404).json({success:false, error: "Department not found" });
    }

    const totalRecords = await Department.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      departments,
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
    res.status(500).json({ error: "Error while Getting the Departments: " + error.message });
  }
};

exports.create = async ( req, res)=>{
    try {
        const user=req.user;
        
        const {name}=req.body;

        const existingDepartment = await Department.findOne({name, company: user.company ? user.company : user._id});

        if(existingDepartment){
            return res.status(409).json({success: false, error:"Department with this name already exists"});
        }
        
        const dep= await Department({
            name,
            company:user.company?user.company:user._id
        });

        if(!dep){
            return res.status(400).json({success:false, error:"Department not created"});
        }
        await dep.save();
        res.status(200).json({
            success: true,
            message: "Department Created Successfully",
        });
    } catch (error) {
        res.status(500).json({error:"Error while Creating Department: "+error.message});
    }
}

exports.delete = async (req, res) => {
    try {
        const designationCount = await Designation.countDocuments({ department: req.params.id });
        if (designationCount > 0) {
            return res.status(400).json({success: false, error: "Cannot delete department because there are designations associated with it." });
        }

        const employeeCount = await Employee.countDocuments({ department: req.params.id });
        if (employeeCount > 0) {
            return res.status(400).json({success: false, error: "Cannot delete department because there are employees associated with it." });
        }

        const dep = await Department.findByIdAndDelete(req.params.id);
        if (!dep) {
            return res.status(404).json({success:false, error: "Department Not Found." });
        }

        res.status(200).json({ dep, message: "Department Deleted Successfully." , success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error while deleting department: " + error.message });
    }
}

exports.update = async (req, res)=>{
    try {
        const dep = await Department.findByIdAndUpdate(req.params.id,req.body,{new: true, runValidators: true});

        if(!dep){
            return res.status(404).json({success: false, error:"Department Not found "});
        }
        res.status(200).json({
            success: true,
            message: "Department Updated Successfully",
        });
    } catch (error) {
        res.status(500).json({success: false, error:"Error while Updating Department: "+error.message});
    }
}
