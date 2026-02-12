const { Types } = require('mongoose');
const ActivityLog = require('../models/activityLogModel');

// Get activity logs for a specific entity
exports.getEntityActivityLogs = async (req, res) => {
  try {
    const user = req.user;
    const { entityType, entityId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ success: false, error: 'Invalid entity ID' });
    }

    // Verify entity belongs to company
    const EntityModel = getEntityModel(entityType);
    if (!EntityModel) {
      return res.status(400).json({ success: false, error: 'Invalid entity type' });
    }

    const entity = await EntityModel.findOne({
      _id: entityId,
      company: user.company || user._id
    });

    if (!entity) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }

    const logs = await ActivityLog.find({ 
      entityType, 
      entityId,
      company: user.company || user._id
    })
      .populate('actionBy', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await ActivityLog.countDocuments({ 
      entityType, 
      entityId,
      company: user.company || user._id
    });
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      logs,
      entityType,
      entityInfo: {
        name: entity.name || entity.SENDER_COMPANY || entity.custName || 'Unknown',
        type: entityType
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching entity activity logs:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Get all activity logs for the company with enhanced filtering
exports.getAllActivityLogs = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const query = {
      company: new Types.ObjectId(user.company || user._id)
    };

    // Apply filters
    if (req.query.entityType) {
      query.entityType = req.query.entityType;
    }
    
    if (req.query.actionType) {
      query.actionType = req.query.actionType;
    }
    
    if (req.query.actionBy) {
      query.actionBy = new Types.ObjectId(req.query.actionBy);
    }
    
    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.timestamp = {};
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        startDate.setHours(0, 0, 0, 0);
        query.timestamp.$gte = startDate;
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.timestamp.$lte = endDate;
      }
    }

    // Search filter (entity name)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      
      // Get entity IDs that match the search
      const entityIds = await getEntityIdsBySearch(searchRegex, query.company);
      
      if (entityIds.length > 0) {
        query.$or = [
          { entityId: { $in: entityIds } },
          { description: searchRegex }
        ];
      } else {
        // No matching entities, just search in description
        query.description = searchRegex;
      }
    }

    const logs = await ActivityLog.find(query)
      .populate('actionBy', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await ActivityLog.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    // Get activity summary
    const summary = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            entityType: '$entityType',
            actionType: '$actionType'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      logs,
      summary,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Get user activity report
exports.getUserActivityReport = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    const query = {
      company: new Types.ObjectId(user.company || user._id)
    };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.timestamp.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    const userActivity = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            userId: '$actionBy',
            userName: '$actionByName',
            entityType: '$entityType',
            actionType: '$actionType'
          },
          count: { $sum: 1 },
          lastActivity: { $max: '$timestamp' }
        }
      },
      {
        $group: {
          _id: {
            userId: '$_id.userId',
            userName: '$_id.userName'
          },
          activities: {
            $push: {
              entityType: '$_id.entityType',
              actionType: '$_id.actionType',
              count: '$count'
            }
          },
          totalActions: { $sum: '$count' },
          lastActivity: { $max: '$lastActivity' }
        }
      },
      {
        $sort: { totalActions: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      userActivity,
      reportPeriod: {
        from: startDate || 'All time',
        to: endDate || 'Now'
      }
    });

  } catch (error) {
    console.error('Error fetching user activity report:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Export activity logs
exports.exportActivityLogs = async (req, res) => {
  try {
    const user = req.user;
    const { startDate, endDate, actionType, actionBy, entityType } = req.query;

    const query = {
      company: new Types.ObjectId(user.company || user._id)
    };

    // Apply filters
    if (entityType) {
      query.entityType = entityType;
    }
    
    if (actionType) {
      query.actionType = actionType;
    }
    
    if (actionBy) {
      query.actionBy = new Types.ObjectId(actionBy);
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.timestamp.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    const logs = await ActivityLog.find(query)
      .populate('actionBy', 'name email')
      .sort({ timestamp: -1 })
      .limit(10000) // Limit to 10k records for export
      .lean();

    const exportData = await Promise.all(logs.map(async (log, index) => {
      // Get entity details
      const entityDetails = await getEntityDetails(log.entityType, log.entityId);
      
      const changes = log.changes?.map(c => 
        `${c.field}: ${c.oldValue || 'Empty'} → ${c.newValue || 'Empty'}`
      ).join(' | ') || 'No changes';

      return {
        'Sr.No': index + 1,
        'Date & Time': new Date(log.timestamp).toLocaleString('en-IN'),
        'Entity Type': log.entityType,
        'Entity Name': entityDetails.name || 'N/A',
        'Action Type': log.actionType,
        'Action By': log.actionByName || 'Unknown',
        'Description': log.description,
        'Changes': changes,
        'IP Address': log.metadata?.ipAddress || 'N/A'
      };
    }));

    res.status(200).json({
      success: true,
      data: exportData,
      totalRecords: exportData.length
    });

  } catch (error) {
    console.error('Error exporting activity logs:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Get annual activity report (year-wise summary)
exports.getAnnualActivityReport = async (req, res) => {
  try {
    const user = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const startDate = new Date(year, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const query = {
      company: new Types.ObjectId(user.company || user._id),
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Monthly breakdown
    const monthlyData = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            month: { $month: '$timestamp' },
            actionType: '$actionType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.month',
          actions: {
            $push: {
              type: '$_id.actionType',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Total activity by type
    const activityByType = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            actionType: '$actionType',
            entityType: '$entityType'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Top users by activity
    const topUsers = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            userId: '$actionBy',
            userName: '$actionByName'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      year,
      monthlyData,
      activityByType,
      topUsers,
      period: {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching annual activity report:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Helper function to get the appropriate model for an entity type
function getEntityModel(entityType) {
  const models = {
    'Lead': require('../models/leadsModel'),
    'Customer': require('../models/customerModel'),
    'Employee': require('../models/employeeModel'),
    'Project': require('../models/projectModel'),
    'Task': require('../models/taskModel'),
    'Department': require('../models/departmentModel'),
    'Designation': require('../models/designationModel'),
    'Service': require('../models/serviceModel'),
    'Product': require('../models/productModel'),
    'Vendor': require('../models/vendorModel'),
    'PurchaseOrder': require('../models/purchaseOrderModel'),
    'GRN': require('../models/grnModel'),
    'QualityInspection': require('../models/qcModel'),
    'DeliveryChallan': require('../models/dcModel'),
    'MRF': require('../models/mrfModel'),
    'AMC': require('../models/amcModel'),
    'Inventory': require('../models/inventoryModel'),
    'Ticket': require('../models/ticketModel')
  };
  
  return models[entityType] || null;
}

// Helper function to get entity IDs by search
async function getEntityIdsBySearch(searchRegex, companyId) {
  const entityIds = [];
  
  // For each entity type, find matching IDs
  const entityTypes = [
    { type: 'Lead', nameField: 'SENDER_COMPANY', model: require('../models/leadsModel') },
    { type: 'Customer', nameField: 'custName', model: require('../models/customerModel') },
    { type: 'Employee', nameField: 'name', model: require('../models/employeeModel') },
    { type: 'Project', nameField: 'name', model: require('../models/projectModel') },
    { type: 'Task', nameField: 'name', model: require('../models/taskModel') },
    { type: 'Department', nameField: 'name', model: require('../models/departmentModel') },
    { type: 'Designation', nameField: 'name', model: require('../models/designationModel') },
    { type: 'Service', nameField: 'name', model: require('../models/serviceModel') },
    { type: 'Product', nameField: 'name', model: require('../models/productModel') },
    { type: 'Vendor', nameField: 'name', model: require('../models/vendorModel') },
    { type: 'PurchaseOrder', nameField: 'orderNumber', model: require('../models/purchaseOrderModel') },
    { type: 'GRN', nameField: 'grnNumber', model: require('../models/grnModel') },
    { type: 'QualityInspection', nameField: 'inspectionNumber', model: require('../models/qcModel') },
    { type: 'DeliveryChallan', nameField: 'dcNumber', model: require('../models/dcModel') },
    { type: 'MRF', nameField: 'mrfNumber', model: require('../models/mrfModel') },
    { type: 'AMC', nameField: 'contractNumber', model: require('../models/amcModel') },
    { type: 'Inventory', nameField: 'itemName', model: require('../models/inventoryModel') },
    { type: 'Ticket', nameField: 'ticketNumber', model: require('../models/ticketModel') }
  ];
  
  for (const entityType of entityTypes) {
    try {
      const results = await entityType.model.find({
        company: companyId,
        [entityType.nameField]: searchRegex
      }).select('_id');
      
      entityIds.push(...results.map(r => r._id));
    } catch (error) {
      console.error(`Error searching ${entityType.type}:`, error);
    }
  }
  
  return entityIds;
}

// Helper function to get entity details
async function getEntityDetails(entityType, entityId) {
  try {
    const Model = getEntityModel(entityType);
    if (!Model) return { name: 'Unknown' };
    
    const entity = await Model.findById(entityId).lean();
    if (!entity) return { name: 'Unknown' };
    
    const nameField = getEntityNameField(entityType);
    return {
      name: entity[nameField] || 'Unknown',
      id: entity._id
    };
  } catch (error) {
    console.error('Error getting entity details:', error);
    return { name: 'Error' };
  }
}

// Helper function to get the name field for different entity types
function getEntityNameField(entityType) {
  const nameFields = {
    'Lead': 'SENDER_COMPANY',
    'Customer': 'custName',
    'Employee': 'name',
    'Project': 'name',
    'Task': 'name',
    'Department': 'name',
    'Designation': 'name',
    'Service': 'name',
    'Product': 'name',
    'Vendor': 'name',
    'PurchaseOrder': 'orderNumber',
    'GRN': 'grnNumber',
    'QualityInspection': 'inspectionNumber',
    'DeliveryChallan': 'dcNumber',
    'MRF': 'mrfNumber',
    'AMC': 'contractNumber',
    'Inventory': 'itemName',
    'Ticket': 'ticketNumber'
  };
  
  return nameFields[entityType] || 'name';
}

// For backward compatibility
exports.getLeadActivityLogs = async (req, res) => {
  req.params.entityType = 'Lead';
  req.params.entityId = req.params.leadId;
  return exports.getEntityActivityLogs(req, res);
};