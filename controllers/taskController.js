const jwt = require('jsonwebtoken')
const Task = require('../models/taskModel');
const TaskSheet = require('../models/taskSheetModel');

exports.create = async (req, res) => {
  try {
    const { name } = req.body;
    const user=req.user;

    const existingTask = await Task.findOne({ name, company: user.company ? user.company : user._id });
    if(existingTask){
      return res.status(409).json({ success: false , error: 'Task with this name already exists' });
    }

    const task = await Task.create({
      name,
      company: user.company ? user.company : user._id
    });

    if (task) {
      res.status(200).json({
        success: true,
        message: "Task Created Successfully",
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Error while creating task: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    // Extract pagination query parameters
    let page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 20; // Default to 10 records per page
    let skip = (page - 1) * limit; // Calculate documents to skip

    const { q } = req.query;

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

    // Fetch paginated tasks
    const task = await Task.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(); // Optimize performance

    // Check if tasks exist
    if (task.length === 0) {
      return res.status(404).json({ success: false, error: "No Task Found" });
    }

    // Get total number of tasks for the query
    const totalTasks = await Task.countDocuments(query);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalTasks / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Send response with tasks and pagination metadata
    res.status(200).json({
      success: true,
      task,
      pagination: {
        currentPage: page,
        totalPages,
        totalTasks,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching the Tasks: " + error.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators:true });
    if (!task) {
      res.status(404).json({success:false, error: "Task not found" });
    }
    res.status(200).json({
      success: true,
      message: "Task Updated Successfully"
    });
  } catch (error) {
    res.status(500).json({success: false, error: "Error while Updating Task: " + error.message });
  }
};

exports.delete = async (req, res) => {
  try {

    const id = req.params.id;
    
    const task = await Task.findByIdAndDelete(id);
    await TaskSheet.deleteMany({ taskName: id });

    if (!task) {
      return res.status(404).json({success:false, error: "Task not found" });
    }
    res.status(200).json({success:true, message: "Task Deleted Successfully" });
  } catch (error) {
    res.status(500).json({success: false, error: "Error while Deleting task: " + error.message });
  }
};