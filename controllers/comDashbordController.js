const jwt = require('jsonwebtoken');
const Project = require('../models/projectModel');
const Customer = require('../models/customerModel');

exports.dashboard = async (req, res) => {
  const user = req.user;

  async function getValueWiseProjectData() {
    try {
      const ranges = [
        { min: 0, max: 100000 },
        { min: 100000, max: 1000000 },
        { min: 1000000, max: 5000000 },
        { min: 5000000, max: 10000000 },
        { min: 10000000, max: Infinity }
      ];

      const promises = ranges.map(async (range) => {
        const inprocess = await Project.countDocuments({
          company: user._id,
          projectStatus: 'Inprocess',
          purchaseOrderValue: { $gte: range.min, $lt: range.max }
        });
        const upcoming = await Project.countDocuments({
          company: user._id,
          projectStatus: 'Upcoming',
          purchaseOrderValue: { $gte: range.min, $lt: range.max }
        });
        const completed = await Project.countDocuments({
          company: user._id,
          projectStatus: 'Completed',
          purchaseOrderValue: { $gte: range.min, $lt: range.max }
        });
        return {
          range: `${range.min} - ${range.max}`,
          inprocess,
          upcoming,
          completed
        };
      });

      const result = await Promise.all(promises);
      return result;
    } catch (error) {
      console.error(error);
    }
  }

  async function getDelayedProjectCountsByRange() {
    try {
      const ranges = [
        { min: 0, max: 90 },
        { min: 90, max: 180 },
        { min: 180, max: Infinity }
      ];
  
      const promises = ranges.map(async (range) => {
        const delayedProjects = await Project.countDocuments({
          company: user._id,
          projectStatus: { $ne: 'Completed' },
          endDate: { $lt: new Date() },
          $expr: {
            $and: [
              { $gte: [{ $subtract: [new Date(), "$endDate"] }, range.min * 24 * 60 * 60 * 1000] },
              { $lt: [{ $subtract: [new Date(), "$endDate"] }, range.max * 24 * 60 * 60 * 1000] }
            ]
          }
        });
        return {
          range: `${range.min} - ${range.max}`,
          delayedProjects
        };
      });
  
      const result = await Promise.all(promises);
      return result;
    } catch (error) {
      console.error(error);
    }
  }

  async function getCategoryCounts() {
    try {
      const categories = await Project.distinct('category');
      const categoryPromises = categories.map(async (name) => {
        const inprocess = await Project.countDocuments({ company: user._id, projectStatus: 'Inprocess', category: name });
        const upcoming = await Project.countDocuments({ company: user._id, projectStatus: 'Upcoming', category: name });
        const completed = await Project.countDocuments({ company: user._id, projectStatus:'Completed', category: name });
        return [name, { inprocess, upcoming, completed }];
      });
      const category = Object.fromEntries(await Promise.all(categoryPromises));
  
      // Calculate total counts
      const totalInprocess = Object.values(category).reduce((acc, curr) => acc + curr.inprocess, 0);
      const totalUpcoming = Object.values(category).reduce((acc, curr) => acc + curr.upcoming, 0);
      const totalFinished = Object.values(category).reduce((acc, curr) => acc + curr.completed, 0);
  
      return { category, total: { inprocess: totalInprocess, upcoming: totalUpcoming, completed: totalFinished } };
    } catch (err) {
      console.error(err);
    }
  }
  
  async function getDelayedProjectCount() {
    try {
      const delayedProjects = await Project.countDocuments({
        company: user._id,
        projectStatus: { $ne: 'Completed' },
        endDate: { $lt: new Date() }
      });
      return delayedProjects;
    } catch (error) {
      console.error(error);
    }
  }

     
  try {
    const customers = await Customer.countDocuments({company:user._id});
    
    const delayedProjects= await getDelayedProjectCount();
    const category=await getCategoryCounts();
    const valueWiseProjectData = await getValueWiseProjectData();
    const delayedProjectCountsByRange= await getDelayedProjectCountsByRange();

    res.status(200).json(
      {
        category,
        customerCount:customers,
        valueWiseProjectData,
        delayedProjects,
        delayedProjectCountsByRange
      });
  } catch (error) {
    res.status(500).json({error:"Error while getting dashbord info: "+error.message});
  }
};