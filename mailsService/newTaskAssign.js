const transporter = require("./emailTransporter");
const Employee = require('../models/employeeModel');
const Task = require('../models/taskModel');
const {formatDate} = require('../utils/formatDate');

exports.newTaskAssignedMail = async (employee, taskSheetData, projectName) => {
    const emp = await Employee.findById(employee).select('name email');
    const task = await Task.findById(taskSheetData.taskName).select('name');
    
    console.log(emp);
    console.log(task);
    console.log(projectName, employee);
    
    try {
        let mailOptions = {
            from: `ProClient360 <${process.env.EMAIL}>`,
            to: emp?.email,
            subject: `New Task Assigned`,
            html:`<html>
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
                            <td>${projectName}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">Task Name:</td>
                            <td>${task?.name || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">Start Date:</td>
                            <td>${formatDate(taskSheetData.startDate)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">End Date:</td>
                            <td>${formatDate(taskSheetData.endDate)}</td>
                        </tr>
                        <tr>
                            <td style="font-weight:bold;">Remark:</td>
                            <td>${taskSheetData.remark || 'N/A'}</td>
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
                        © 2025 ProClient360. All rights reserved.
                    </td>
                    </tr>

                </table>
                </td>
            </tr>
            </table>


            </body>
        </html>`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log("Error sending email: ", error);
                return false;
            } else {
                console.log("Email sent: ", info.response);
                return true;
            }
        });
    } catch (err) {
        console.log("Error in sendMail: ", err);
    }
};