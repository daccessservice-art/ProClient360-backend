const transporter = require("./emailTransporter");
const Employee = require('../models/employeeModel');
const Task = require('../models/taskModel');
const { formatDate } = require('../utils/formatDate');

/**
 * newTaskAssignedMail  (UPDATED — safe + clear logs)
 *
 * Fixes:
 *  - Everything is inside try/catch, so a DB error can never become an
 *    "unhandled promise rejection" (the controller calls this without await).
 *  - Clear log when the employee is not found or has NO email address
 *    (before, the mail silently failed with "No recipients defined").
 *  - Works whether taskName is an id OR an already-populated object
 *    (tester "bug found" flow passes a populated task).
 *  - Returns a Promise<boolean> so callers can await it if they want.
 *  - Same mail design as before.
 */
exports.newTaskAssignedMail = async (employee, taskSheetData, projectName) => {
    try {
        const empId = employee?._id || employee;
        const emp = await Employee.findById(empId).select('name email');

        if (!emp) {
            console.error(`❌ Task mail NOT sent — employee not found (${empId})`);
            return false;
        }
        if (!emp.email || !emp.email.includes('@')) {
            console.error(`❌ Task mail NOT sent — employee "${emp.name}" has no valid email in Employee Master`);
            return false;
        }

        // taskName can be an ObjectId or a populated { _id, name }
        let taskNameText = taskSheetData?.taskName?.name || null;
        if (!taskNameText && taskSheetData?.taskName) {
            const taskId = taskSheetData.taskName._id || taskSheetData.taskName;
            const task = await Task.findById(taskId).select('name');
            taskNameText = task?.name || null;
        }

        const mailOptions = {
            from: `ProClient360 <${process.env.EMAIL}>`,
            to: emp.email,
            subject: `New Task Assigned`,
            html: `<html>
            <body>
                <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5" style="padding:20px;font-family:Arial,sans-serif;">
                <tr>
                <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;">

                    <!-- Header -->
                    <tr>
                    <td align="center" style="padding:20px;background-color:#fcf9f9;border-bottom:1px solid #ece8e8;">
                        <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="50" height="50" style="display:block;">
                        <h1 style="font-size:24px;color:#7c3aed;margin:10px 0;">New Task Assigned</h1>
                        <p style="font-size:14px;color:#555;">You have been assigned a new task</p>
                    </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                    <td style="padding:20px;color:#333;font-size:14px;line-height:20px;">
                        <p>Dear <strong>${emp.name}</strong>,</p>
                        <p>You have been assigned a new task. Please find the details below:</p>

                        <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;background:#f8fafc;margin-top:10px;">
                        <tr>
                            <td style="font-weight:bold;width:35%;">Project Name:</td>
                            <td>${projectName || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">Task Name:</td>
                            <td>${taskNameText || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">Start Date:</td>
                            <td>${taskSheetData?.startDate ? formatDate(taskSheetData.startDate) : 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">End Date:</td>
                            <td>${taskSheetData?.endDate ? formatDate(taskSheetData.endDate) : 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">Remark:</td>
                            <td>${taskSheetData?.remark || 'N/A'}</td>
                        </tr>
                        </table>

                        <p style="text-align:center;margin-top:20px;">
                        <a href="https://proclient360.com" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">
                            📋 View Task Details
                        </a>
                        </p>

                        <p style="margin-top:15px;">Please make sure to complete the task within the given time frame. If you have any questions, contact your project manager.</p>
                    </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                    <td align="center" bgcolor="#f9fafb" style="padding:15px;font-size:12px;color:#666;">
                        © ${new Date().getFullYear()} ProClient360. All rights reserved.
                    </td>
                    </tr>

                </table>
                </td>
            </tr>
            </table>
            </body>
        </html>`
        };

        return await new Promise((resolve) => {
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error(`❌ Task mail FAILED to ${emp.email}:`, error.message);
                    resolve(false);
                } else {
                    console.log(`✅ Task mail sent to ${emp.name} <${emp.email}>:`, info.response);
                    resolve(true);
                }
            });
        });
    } catch (err) {
        console.error("❌ Error in newTaskAssignedMail:", err.message);
        return false;
    }
};