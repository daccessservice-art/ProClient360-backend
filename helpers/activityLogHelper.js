const { 
  logEntityCreation, 
  logEntityUpdate, 
  logEntityDeletion, 
  logAssignment, 
  logEntityStatusChange 
} = require('../middlewares/activityLogger');

/**
 * Helper function to log entity creation
 * @param {Object} entity - The entity that was created
 * @param {Object} user - The user who performed the action
 * @param {Object} req - The request object
 * @param {String} entityType - The type of entity (e.g., 'Customer', 'Employee')
 */
exports.logCreation = async (entity, user, req, entityType) => {
  try {
    console.log(`=== LOGGING ${entityType} CREATION START ===`);
    console.log('Entity:', entity);
    console.log('Entity ID:', entity._id);
    console.log('Entity Name:', entity[getEntityNameField(entityType)]);
    console.log('User ID:', user._id);
    console.log('User Name:', user.name);
    console.log('Request IP:', req.ip);
    
    const result = await logEntityCreation(entity, entityType, user, req);
    console.log(`${entityType} creation logged successfully:`, result);
    console.log(`=== LOGGING ${entityType} CREATION END ===`);
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} creation:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

/**
 * Helper function to log entity update
 * @param {Object} oldEntity - The entity before update
 * @param {Object} newEntity - The entity after update
 * @param {Object} user - The user who performed the action
 * @param {Object} req - The request object
 * @param {String} entityType - The type of entity (e.g., 'Customer', 'Employee')
 */
exports.logUpdate = async (oldEntity, newEntity, user, req, entityType) => {
  try {
    console.log(`=== LOGGING ${entityType} UPDATE START ===`);
    console.log('Old Entity:', oldEntity);
    console.log('New Entity:', newEntity);
    console.log('User ID:', user._id);
    console.log('User Name:', user.name);
    
    const result = await logEntityUpdate(oldEntity, newEntity, entityType, user, req);
    console.log(`${entityType} update logged successfully:`, result);
    console.log(`=== LOGGING ${entityType} UPDATE END ===`);
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} update:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

/**
 * Helper function to log entity deletion
 * @param {Object} entity - The entity that was deleted
 * @param {Object} user - The user who performed the action
 * @param {Object} req - The request object
 * @param {String} entityType - The type of entity (e.g., 'Customer', 'Employee')
 */
exports.logDeletion = async (entity, user, req, entityType) => {
  try {
    console.log(`=== LOGGING ${entityType} DELETION START ===`);
    console.log('Entity:', entity);
    console.log('User ID:', user._id);
    console.log('User Name:', user.name);
    
    const result = await logEntityDeletion(entity, entityType, user, req);
    console.log(`${entityType} deletion logged successfully:`, result);
    console.log(`=== LOGGING ${entityType} DELETION END ===`);
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} deletion:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

/**
 * Helper function to log entity assignment
 * @param {Object} entity - The entity that was assigned
 * @param {Object} assignedTo - The entity it was assigned to
 * @param {Object} user - The user who performed the action
 * @param {Object} req - The request object
 * @param {String} entityType - The type of entity (e.g., 'Customer', 'Employee)
 */
exports.logAssignment = async (entity, assignedTo, user, req, entityType) => {
  try {
    console.log(`=== LOGGING ${entityType} ASSIGNMENT START ===`);
    console.log('Entity:', entity);
    console.log('Assigned To:', assignedTo);
    console.log('User ID:', user._id);
    console.log('User Name:', user.name);
    
    const result = await logAssignment(entity, assignedTo, entityType, user, req);
    console.log(`${entityType} assignment logged successfully:`, result);
    console.log(`=== LOGGING ${entityType} ASSIGNMENT END ===`);
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} assignment:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

/**
 * Helper function to log status change
 * @param {Object} entity - The entity whose status changed
 * @param {String} oldStatus - The old status
 * @param {String} newStatus - The new status
 * @param {Object} user - The user who performed the action
 * @param {Object} req - The request object
 * @param {String} entityType - The type of entity (e.g., 'Customer', 'Employee)
 */
exports.logStatusChange = async (entity, oldStatus, newStatus, user, req, entityType) => {
  try {
    console.log(`=== LOGGING ${entityType} STATUS CHANGE START ===`);
    console.log('Entity:', entity);
    console.log('Old Status:', oldStatus);
    console.log('New Status:', newStatus);
    console.log('User ID:', user._id);
    console.log('User Name:', user.name);
    
    const result = await logEntityStatusChange(entity, oldStatus, newStatus, entityType, user, req);
    console.log(`${entityType} status change logged successfully:`, result);
    console.log(`=== LOGGING ${entityType} STATUS CHANGE END ===`);
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} status change:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Helper function to get the name field for different entity types
function getEntityNameField(entityType) {
  const nameFields = {
    'Lead': 'SENDER_COMPANY',
    'Customer': 'custName',
    'Employee': 'name',
    'Project': 'name',
    'Task': 'taskName',
    'Department': 'name',
    'Designation': 'name',
    'Service': 'name',
    'Product': 'name',
    'Vendor': 'vendorName',
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