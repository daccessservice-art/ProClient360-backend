const ActivityLog = require('../models/activityLogModel');

// Helper function to normalize values for comparison
const normalizeValue = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value._id) return value._id.toString();
  if (Array.isArray(value)) {
    // For arrays of ObjectIds (like employees)
    return JSON.stringify(value.map(v => {
      if (typeof v === 'object' && v._id) return v._id.toString();
      if (typeof v === 'object') return v.toString();
      return v;
    }).sort());
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

// Helper function to get field differences
const getFieldChanges = (oldData, newData, fieldsToTrack) => {
  const changes = [];
  
  console.log('=== COMPARING FIELDS ===');
  console.log('Fields to track:', fieldsToTrack);
  
  fieldsToTrack.forEach(field => {
    let oldValue = oldData[field];
    let newValue = newData[field];
    
    // Handle nested objects (like billingAddress.city)
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      const oldParent = oldData[parent] || {};
      const newParent = newData[parent] || {};
      oldValue = oldParent[child];
      newValue = newParent[child];
    }
    
    // Normalize values for comparison
    const oldNormalized = normalizeValue(oldValue);
    const newNormalized = normalizeValue(newValue);
    
    console.log(`Field: ${field}`);
    console.log(`  Old (normalized): ${oldNormalized}`);
    console.log(`  New (normalized): ${newNormalized}`);
    console.log(`  Changed: ${oldNormalized !== newNormalized}`);
    
    // Only log if values are actually different
    if (oldNormalized !== newNormalized) {
      changes.push({
        field: field,
        oldValue: oldValue,
        newValue: newValue
      });
    }
  });
  
  console.log(`=== TOTAL CHANGES DETECTED: ${changes.length} ===`);
  
  return changes;
};

// Log activity - Generic function that can handle any entity type
const logActivity = async (data) => {
  try {
    console.log('=== LOG ACTIVITY START ===');
    console.log('Activity Data:', JSON.stringify(data, null, 2));
    
    // Ensure required fields are present
    if (!data.company || !data.entityType || !data.entityId || !data.actionType || !data.actionBy) {
      console.error('Missing required fields for activity logging:', data);
      return null;
    }
    
    const activityLog = new ActivityLog(data);
    const savedLog = await activityLog.save();
    
    console.log('Activity logged successfully:', savedLog._id);
    console.log('=== LOG ACTIVITY END ===');
    
    return savedLog;
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Middleware to track entity creation
const logEntityCreation = async (entity, entityType, user, req) => {
  try {
    console.log(`=== LOG ENTITY CREATION: ${entityType} ===`);
    console.log('Entity:', entity);
    console.log('User:', user);
    
    const entityNameField = getEntityNameField(entityType);
    const entityName = entity[entityNameField] || 'Unknown';
    
    const activityData = {
      company: entity.company || user.company || user._id,
      entityType: entityType,
      entityId: entity._id,
      actionType: 'CREATE',
      actionBy: user._id,
      actionByName: user.name || 'Unknown',
      description: `${entityType} created: ${entityName}`,
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    };
    
    console.log('Activity Data:', activityData);
    
    const result = await logActivity(activityData);
    console.log(`=== LOG ENTITY CREATION END: ${entityType} ===`);
    
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} creation:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Middleware to track entity updates
const logEntityUpdate = async (oldEntity, newEntity, entityType, user, req) => {
  try {
    console.log(`=== LOG ENTITY UPDATE: ${entityType} ===`);
    console.log('Old Entity:', JSON.stringify(oldEntity, null, 2));
    console.log('New Entity:', JSON.stringify(newEntity, null, 2));
    console.log('User:', user);
    
    const fieldsToTrack = getTrackableFields(entityType);
    console.log('Fields to track for', entityType, ':', fieldsToTrack);
    
    const entityNameField = getEntityNameField(entityType);
    const entityName = oldEntity[entityNameField] || newEntity[entityNameField] || 'Unknown';
    
    // Get all changes including nested fields
    const changes = getFieldChanges(oldEntity, newEntity, fieldsToTrack);
    
    console.log('Changes detected:', JSON.stringify(changes, null, 2));
    console.log('Number of changes:', changes.length);
    
    if (changes.length === 0) {
      console.log('No changes to log');
      return null; // No changes to log
    }
    
    let description = `${entityType} updated: `;
    const mainChanges = changes.slice(0, 3).map(c => c.field).join(', ');
    description += mainChanges;
    if (changes.length > 3) {
      description += ` and ${changes.length - 3} more fields`;
    }
    
    const activityData = {
      company: oldEntity.company || newEntity.company || user.company || user._id,
      entityType: entityType,
      entityId: oldEntity._id || newEntity._id,
      actionType: 'UPDATE',
      actionBy: user._id,
      actionByName: user.name || 'Unknown',
      changes: changes,
      description: description,
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    };
    
    console.log('Activity Data:', JSON.stringify(activityData, null, 2));
    console.log('Total fields tracked:', fieldsToTrack.length);
    console.log('Fields with changes:', changes.length);
    
    const result = await logActivity(activityData);
    console.log(`=== LOG ENTITY UPDATE END: ${entityType} ===`);
    
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} update:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Middleware to track entity deletion
const logEntityDeletion = async (entity, entityType, user, req) => {
  try {
    console.log(`=== LOG ENTITY DELETION: ${entityType} ===`);
    console.log('Entity:', entity);
    console.log('User:', user);
    
    const entityNameField = getEntityNameField(entityType);
    const entityName = entity[entityNameField] || 'Unknown';
    
    const activityData = {
      company: entity.company || user.company || user._id,
      entityType: entityType,
      entityId: entity._id,
      actionType: 'DELETE',
      actionBy: user._id,
      actionByName: user.name || 'Unknown',
      description: `${entityType} deleted: ${entityName}`,
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    };
    
    console.log('Activity Data:', activityData);
    
    const result = await logActivity(activityData);
    console.log(`=== LOG ENTITY DELETION END: ${entityType} ===`);
    
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} deletion:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Middleware to track assignment - FIXED FOR TASK ENTITY
const logAssignment = async (entity, assignedTo, entityType, user, req) => {
  try {
    console.log(`=== LOG ASSIGNMENT: ${entityType} ===`);
    console.log('Entity:', entity);
    console.log('Assigned To:', assignedTo);
    console.log('Entity Type:', entityType);
    console.log('User:', user);
    
    const entityNameField = getEntityNameField(entityType);
    const entityName = entity[entityNameField] || 'Unknown';
    
    // *** FIX: Determine the field name based on entity type ***
    let assignmentField = 'assignedTo';
    if (entityType === 'Task') {
      assignmentField = 'employees';
    }
    
    const activityData = {
      company: entity.company || user.company || user._id,
      entityType: entityType,
      entityId: entity._id,
      actionType: 'ASSIGN',
      actionBy: user._id,
      actionByName: user.name || 'Unknown',
      changes: [{
        field: assignmentField,  // *** FIXED: Use correct field name ***
        oldValue: null,
        newValue: assignedTo._id || assignedTo
      }],
      description: `${entityType} assigned to ${assignedTo.name || 'employee'}`,
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    };
    
    console.log('Activity Data:', activityData);
    
    const result = await logActivity(activityData);
    console.log(`=== LOG ASSIGNMENT END: ${entityType} ===`);
    
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} assignment:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Middleware to track status change (generic version)
const logEntityStatusChange = async (entity, oldStatus, newStatus, entityType, user, req) => {
  try {
    console.log(`=== LOG STATUS CHANGE: ${entityType} ===`);
    console.log('Entity:', entity);
    console.log('Old Status:', oldStatus);
    console.log('New Status:', newStatus);
    console.log('User:', user);
    
    const entityNameField = getEntityNameField(entityType);
    const entityName = entity[entityNameField] || 'Unknown';
    
    const activityData = {
      company: entity.company || user.company || user._id,
      entityType: entityType,
      entityId: entity._id,
      actionType: 'STATUS_CHANGE',
      actionBy: user._id,
      actionByName: user.name || 'Unknown',
      changes: [{
        field: 'status',
        oldValue: oldStatus,
        newValue: newStatus
      }],
      description: `${entityType} status changed from ${oldStatus} to ${newStatus}`,
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    };
    
    console.log('Activity Data:', activityData);
    
    const result = await logActivity(activityData);
    console.log(`=== LOG STATUS CHANGE END: ${entityType} ===`);
    
    return result;
  } catch (error) {
    console.error(`Error logging ${entityType} status change:`, error);
    // Don't throw error - logging failure shouldn't break the main operation
    return null;
  }
};

// Helper function to get the name field for different entity types
const getEntityNameField = (entityType) => {
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
};

// Helper function to get trackable fields for different entity types
const getTrackableFields = (entityType) => {
  const trackableFields = {
    'Lead': [
      'SENDER_NAME', 'SENDER_EMAIL', 'SENDER_MOBILE', 'SENDER_COMPANY',
      'SENDER_ADDRESS', 'SENDER_CITY', 'SENDER_STATE', 'SENDER_PINCODE',
      'QUERY_PRODUCT_NAME', 'SOURCE', 'STATUS', 'callLeads', 'feasibility',
      'quotation', 'complated', 'step', 'nextFollowUpDate', 'rem', 'assignedTo'
    ],
    'Customer': [
      'custName', 'email', 'phoneNumber1', 'phoneNumber2', 'GSTNo', 
      'customerContactPersonName1', 'customerContactPersonName2',
      'billingAddress.add', 'billingAddress.city', 'billingAddress.state', 
      'billingAddress.country', 'billingAddress.pincode', 'zone', 'ownedBy'
    ],
    'Employee': [
      'name', 'email', 'mobile', 'address', 'city', 'state', 'pincode',
      'country', 'department', 'designation', 'status', 'joiningDate'
    ],
    'Project': [
      'name', 'custId', 'Address', 'completeLevel', 'purchaseOrderNo',
      'projectStatus', 'purchaseOrderDate', 'purchaseOrderValue', 'category',
      'startDate', 'endDate', 'advancePay', 'payAgainstDelivery',
      'payAfterCompletion', 'remark', 'retention', 'POCopy',
      'completionCertificate', 'warrantyCertificate', 'warrantyStartDate',
      'warrantyMonths'
    ],
    'Task': [
      'taskName', 'project', 'employees', 'startDate', 'endDate', 'priority',
      'remark', 'taskStatus', 'taskLevel'
    ],
    'Department': [
      'name', 'description', 'head', 'status'
    ],
    'Designation': [
      'name', 'department', 'permissions', 'status'
    ],
    'Service': [
      'name', 'description', 'category', 'price', 'status'
    ],
    'Product': [
      'name', 'description', 'category', 'price', 'stock', 'status'
    ],
    'Vendor': [
      'vendorName', 'email', 'phoneNumber1', 'typeOfVendor', 'GSTNo', 
      'brandName', 'modelName', 'price', 'materialCategory', 'status'
    ],
    'PurchaseOrder': [
      'orderNumber', 'vendor', 'orderDate', 'expectedDeliveryDate', 'status',
      'totalAmount'
    ],
    'GRN': [
      'grnNumber', 'purchaseOrder', 'grnDate', 'status', 'totalItems'
    ],
    'QualityInspection': [
      'inspectionNumber', 'grn', 'inspectionDate', 'status', 'result'
    ],
    'DeliveryChallan': [
      'dcNumber', 'order', 'dcDate', 'status', 'deliveryAddress'
    ],
    'MRF': [
      'mrfNumber', 'requestDate', 'requiredDate', 'status', 'items'
    ],
    'AMC': [
      'contractNumber', 'customer', 'startDate', 'endDate', 'status',
      'contractValue'
    ],
    'Inventory': [
      'itemName', 'description', 'category', 'quantity', 'unitPrice',
      'reorderLevel', 'status'
    ],
    'Ticket': [
      'ticketNumber', 'customer', 'subject', 'description', 'priority',
      'status', 'assignedTo'
    ]
  };
  
  return trackableFields[entityType] || [];
};

// Lead-specific logging functions (for backward compatibility)
const logLeadCreation = async (lead, user, req) => {
  return await logEntityCreation(lead, 'Lead', user, req);
};

const logLeadUpdate = async (oldLead, newLead, user, req) => {
  return await logEntityUpdate(oldLead, newLead, 'Lead', user, req);
};

const logLeadDeletion = async (lead, user, req) => {
  return await logEntityDeletion(lead, 'Lead', user, req);
};

const logLeadAssignment = async (lead, assignedTo, user, req) => {
  return await logAssignment(lead, assignedTo, 'Lead', user, req);
};

// Lead-specific status change function (for backward compatibility)
const logStatusChange = async (lead, oldStatus, newStatus, user, req) => {
  return await logEntityStatusChange(lead, oldStatus, newStatus, 'Lead', user, req);
};

const logCallAttempt = async (lead, callData, user, req) => {
  return await logActivity({
    company: lead.company,
    entityType: 'Lead',
    entityId: lead._id,
    actionType: 'CALL_ATTEMPT',
    actionBy: user._id,
    actionByName: user.name || 'Unknown',
    description: `Call attempt: Day ${callData.day}, Attempt ${callData.attempt} - ${callData.status}`,
    metadata: {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    }
  });
};

module.exports = {
  // Generic logging functions
  logEntityCreation,
  logEntityUpdate,
  logEntityDeletion,
  logAssignment,
  logEntityStatusChange,
  
  // Lead-specific functions (for backward compatibility)
  logLeadCreation,
  logLeadUpdate,
  logLeadDeletion,
  logLeadAssignment,
  logStatusChange,
  logCallAttempt
};