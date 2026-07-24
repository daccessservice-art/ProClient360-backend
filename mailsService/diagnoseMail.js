// require("dotenv").config();

// console.log("=== STEP 1: Checking environment variables ===");
// console.log("EMAIL:", process.env.EMAIL || "❌ NOT SET");
// console.log("EMAIL_APP_PASSWORD set:", process.env.EMAIL_APP_PASSWORD ? "✅ yes" : "❌ NOT SET");

// console.log("\n=== STEP 2: Loading transporter ===");
// let transporter;
// try {
//   transporter = require("./emailTransporter");
//   console.log("✅ emailTransporter.js loaded successfully");
// } catch (err) {
//   console.error("❌ FAILED to load emailTransporter.js:", err.message);
//   console.error("   → Check that emailTransporter.js is in the SAME folder as this file.");
//   process.exit(1);
// }

// console.log("\n=== STEP 3: Verifying SMTP connection ===");
// transporter.verify((err, success) => {
//   if (err) {
//     console.error("❌ SMTP CONNECTION FAILED:", err.message);
//     console.error("   Full error:", err);
//     process.exit(1);
//   }

//   console.log("✅ SMTP connection verified successfully");

//   console.log("\n=== STEP 4: Sending a plain test email ===");
//   transporter.sendMail(
//     {
//       from: `Test <${process.env.EMAIL}>`,
//       to: "nilkanth@daccess.co",
//       subject: "Diagnostic Test Email",
//       text: "This is a plain-text diagnostic test. If you received this, SMTP sending works.",
//     },
//     (error, info) => {
//       if (error) {
//         console.error("❌ SEND FAILED:", error.message);
//         console.error("   Full error:", error);
//       } else {
//         console.log("✅ EMAIL SENT SUCCESSFULLY");
//         console.log("   Response:", info.response);
//         console.log("   Message ID:", info.messageId);
//       }
//     }
//   );
// });