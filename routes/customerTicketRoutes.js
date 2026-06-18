const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
  raiseTicket,
} = require("../controllers/customerTicketController");

// Public routes — NO auth required (customers are not logged in)
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/raise-ticket", raiseTicket);

module.exports = router;