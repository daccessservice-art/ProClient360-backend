# Project Management System
A full-featured Project Management System built using the MERN stack, designed to streamline project, task, and employee management for organizations. The system enables efficient tracking of project workflows, role and salary history, task allocation, and record maintenance. It’s a comprehensive solution for teams and managers to organize, monitor, and collaborate on tasks and resources effectively.

## Features

### 1. Employee Management
- Add, edit, delete, and view employee records.
- Assign roles to employees and maintain a historical record of role and salary changes.
- Role-based access control to ensure employees see only relevant information.
- Track employee performance, department, and project involvement.

### 2. Project Management
- Create, update, and manage projects with detailed project information.
- Maintain project history, including changes in scope, timeline, and associated team members.
- Assign employees to projects and monitor their involvement and contributions.
- Set project status, milestones, and completion rates to track progress.

### 3. Task Management
- Assign, update, and track tasks within projects.
- Set task deadlines, dependencies, and priorities to ensure efficient workflow.
- Track task completion status, allowing for real-time updates on progress.
- Implement error-proofing for task deletion to avoid unintended cascade deletions.

### 4. History and Audit Trail
- Record and track all changes in employee roles, salaries, and project details.
- Maintain a history of each collection (e.g., employee, company, customer, project) to ensure accurate reporting and accountability.
- Generate audit trails for compliance and performance reviews.

### 5. User Authentication and Authorization
- Secure user authentication with password protection.
- Role-based authorization to control access to specific features and data.
- "Forgot Password" feature with a one-time reset link.

### 6. Responsive UI with Interactive Dashboards
User-friendly interface with real-time dashboards for quick insights into project and task statuses.
Mobile-responsive design to access the platform from any device.

### 7. Data Protection and Cybersecurity
Implements cybersecurity measures to protect sensitive data.
Protects against unauthorized data access and includes security features to handle cyber threats.


## Problem Solved
### 1. Inefficient Project Tracking
Traditional project tracking often lacks real-time updates, making it difficult to monitor project progress accurately. This system’s real-time tracking of project statuses, milestones, and team assignments ensures transparency and enables teams to manage resources effectively.

### 2. Lack of Employee Role and Salary History
Tracking changes in employee roles and salaries is essential for reporting and auditing. The system maintains a complete history of role assignments and salary adjustments, which helps in performance evaluations, budgeting, and compliance.

### 3. Task Management and Accountability
Manual task management can lead to miscommunication and lack of accountability. This system allows managers to assign tasks with deadlines and dependencies, making each team member’s responsibilities clear. Real-time updates and completion tracking also improve accountability.

### 4. Data Security and Access Control
In many systems, data access lacks restriction, which can lead to security vulnerabilities. This project’s role-based access control ensures employees only see information relevant to their role, enhancing data security and preventing data breaches.

### 5. Historical Record and Compliance
Auditing and compliance require a comprehensive historical record, often missing in project management solutions. This system’s audit trail and historical data storage allow for complete data transparency, helping companies meet regulatory standards and perform thorough internal audits.

## Technologies Used
- **Frontend:** React.js, CSS, Bootstrap for responsive UI.
- **Backend:** Node.js, Express.js for creating a robust API.
- **Database:** MongoDB for data storage, along with collections for employee, project, customer, and history records.
- **Authentication:** JSON Web Tokens (JWT) for secure user sessions.
- **File Storage:** Cloudinary (or local storage) for uploading and managing project-related documents.
- **Security:** Measures to handle potential cyber threats, including DDoS protection.


## Future Enhancements
- Integration of Gantt chart view for task and project timelines.
- Email notifications for task assignments and deadlines.
- Advanced analytics for project and employee performance tracking.
  
## Contribution
- Contributions are welcome! Please feel free to submit a pull request or raise an issue for any feature requests or bugs.

## License
This project is licensed under the MIT License.
