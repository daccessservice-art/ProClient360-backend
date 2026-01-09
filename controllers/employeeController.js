const bcrypt = require('bcrypt');

const { ObjectId } = require("mongodb");
const Employee = require('../models/employeeModel');
const Project = require('../models/projectModel');
const Company = require('../models/companyModel');
const Admin = require('../models/adminModel');
const EmployeeHistory = require('../models/employeeHistoryModel');
const TaskSheet = require('../models/taskSheetModel');
const Service = require('../models/serviceModel');
const { newUserMail } = require('../mailsService/newEmpCreation');




exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    const { q }= req.query;


    const searchRegex = new RegExp(q, 'i');
    let query = {};
    if(q !== undefined &&
    q !== null &&
    q.trim() !== "" &&
    q.trim().toLowerCase() !== "null" &&
    q.trim().toLowerCase() !== "undefined"){
      
      skip = 0;
      page = 1;
      query = {
        company: user.company || user._id,
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { mobileNo: { $regex: searchRegex } }
        ]
      };
    }else{
      query = { company: user.company ? user.company : user._id };
    }


    const employees = await Employee.find(query, { password: 0 })
      .skip(skip)
      .limit(limit)
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (employees.length <= 0) {
      return res.status(404).json({success:false, error: "No employees found" });
    }

    const totalRecords = await Employee.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      employees,
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
    res.status(500).json({ error: "Error while fetching employees: " + error.message });
  }
};

exports.getEmployee = async (req, res)=>{
  try {
    const {id}= req.params;
    const user=req.user;
    const employee = await Employee.find({company:user.company?user.company:user._id, department:id},{ password: 0 });
    if(!employee){
      return res.status(404).json({success:false,error:"Employee not found"});
    }
    res.status(200).json({employee, success:true});
  } catch (error) {
    res.status(500).json({error:"Error in getting employee: "+error.message});
  }
};

exports.search = async (req, res) => {
  try {
    const user=req.user;
    const query = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      company: user.company ? user.company : user._id,
      $or: [
        { empName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    };

    const employees = await Employee.find(filter,{ password: 0 })
      .skip(skip)
      .limit(limit);

    if (employees.length <= 0) {
      return res.status(400).json({ error: "No employees found" });
    }

    const totalRecords = await Employee.countDocuments(filter);
    res.status(200).json({
      employees,
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      totalRecords
    });
  } catch (error) {
    res.status(500).json({ error: "Error while searching employees: " + error.message });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const user=req.user;
    const uniqueProjectIds = await TaskSheet.distinct("project", { company: user.company, employees:user._id});
    const assignedTasks= await TaskSheet.find({company:user.company, employees:user._id, taskStatus:'upcomming'}).populate('taskName','name');
    const inprocessTasks= await TaskSheet.find({company:user.company, employees:user._id, taskStatus:'inprocess'}).populate('taskName','name');

    const assignedProgects = await Project.find({
      _id: { $in: uniqueProjectIds },
      projectStatus: 'Upcoming'
    });

    const inProcessProjects = await Project.find({
      _id: { $in: uniqueProjectIds },
      projectStatus: 'Inprocess' 
    });

    const completedCount = await Project.countDocuments({
      _id: { $in: uniqueProjectIds },
      projectStatus: 'Completed'
    });

    res.status(200).json({
      assignedTasks,
      inprocessTasks,
      completedCount,
      inprocessCount: inProcessProjects.length,
      totalProjects: (completedCount+ inProcessProjects.length + assignedProgects.length),
      success:true,
    });
  } catch (error) {
    res.status(500).json({ error: "Error In Employee dashboard controller: " + error.message });
  }
};

exports.create=async (req, res) => {
  try {
    const {name, mobileNo, hourlyRate,designation, email, password,department, confirmPassword, gender}=req.body;
    if(password !== confirmPassword){
      return res.status(400).json({
      error:`Password doesn\'t match!!!`,
      success: false
    });
    }

    const emp= await Employee.findOne({email});
    const company= await Company.findOne({email});
    const admin= await Admin.findOne({email});
    if(company || admin){
      return res.status(409).json({success: false, error:"Email allready exists!!!"});
    }

    if(emp){
      console.log(emp);
      return res.status(409).json({success: false , error:"Employee with this email already exists!!!"});
    }

    const salt=await bcrypt.genSalt(10);
    const hashPassword=await bcrypt.hash(password,salt);
  
    const boyProfilePic = `https://avatar.iran.liara.run/public/boy?username=${email}`;
		const girlProfilePic = `https://avatar.iran.liara.run/public/girl?username=${email}`;
    const otherProfilePic= `https://avatar.iran.liara.run/username?username=${name}`;
    const newEmp=Employee({
      name,
      mobileNo,
      hourlyRate,
      designation,
      company:req.user.company || req.user._id,
      department,
      email:email.toLowerCase().trim(),           
      password:hashPassword,
      gender,
      profilePic:gender==='male'?boyProfilePic: gender==='female'? girlProfilePic:otherProfilePic
    });

    if(newEmp){
      await newEmp.save();
      newUserMail(newEmp, password);
      res.status(201).json({
        message: `${newEmp.name} has been created successfully`,
        success: true
      });
    }
    else{
      res.status(400).json({
      success: false,
      error:"Invalid Employee Data!!!"
    });
    }


  } catch (error) {
    res.status(400).json({ error: "Error While Creating Employee: "+error.message });
  }

};

exports.deleteEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    const hasServices = await Service.findOne({ allotTo: id });
    if (hasServices) {
      return res.status(400).json({success:false, error: `Cannot delete employee. There are services allocated to this employee.` });
    }

    const hasTaskSheets = await TaskSheet.findOne({ employees: id });
    if (hasTaskSheets) {
      return res.status(400).json({success:false, error: `Cannot delete employee. There are tasks assigned to this employee.` });
    }
    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) {
      return res.status(404).json({success:false, error: `Employee not found` });
    }
    res.status(200).json({success:true, message: `${employee.name} has been deleted successfully` });
  } catch (error) {
    res.status(400).json({ error:"Error while Deleted Employee: "+error.message });
  }
};


exports.updateEmployee = async (req, res) => {
  try {
    const {id} = req.params;
    const originalData = await Employee.findById(id);
    const {name, department, mobileNo, hourlyRate, designation, email}= req.body

    
    if (!originalData) {
      return res.status(404).json({success:false, error: 'Employee not found' });
    }
    
    const updateData = {
      name,
      department,
      mobileNo,
      hourlyRate,
      designation,
      email
    };

    const emp= await Employee.findOne({email:email.toLowerCase().trim()});
    if(emp && emp._id.toString() !== id) {
      return res.status(409).json({success: false, error:"Employee with this email already exists!!!"});
    } 

    let changes=[];
 
    const trackChanges = (fieldName, oldValue, newValue) => {
      if (typeof newValue === 'object' && newValue._id) {
        newValue = new ObjectId(newValue._id);
      }
      if (oldValue.toString() !== newValue.toString()) {
        changes.push({
          employeeId: id,
          fieldName: fieldName,
          oldValue: oldValue,
          newValue: newValue,
          changeReason: req.body.changeReason || 'Updated via Employee edit',
        });
      }
    };

    for (const key in updateData) {
      if (updateData[key] !== originalData[key]) {
        trackChanges(key, originalData[key], updateData[key]);
      }
    }

    if (changes.length > 0) {
      await EmployeeHistory.insertMany(changes);
    }
  
    await Employee.findByIdAndUpdate(id, { $set: updateData}, {runValidators: true});

    res.status(200).json({
     message: 'Employee data updated successfully',
     success: true
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: 'Error while updating Employee: ' + error.message });
  }
};

