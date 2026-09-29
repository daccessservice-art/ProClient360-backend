const jwt = require("jsonwebtoken");

// Login validity time (change in .env → JWT_EXPIRES_IN=1d / 8h / 15d)
const TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "15d";

exports.generateTokenAndSendResponse = (user, res, loggedUser) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not set in .env");
    }

    const token = jwt.sign(
      { user: user._id },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Employee
    if (loggedUser === "employee") {
      return res.status(200).json({
        success: true,
        token: token,
        user: {
          user: loggedUser,
          newUser: user.newUser,
          name: user.name,
          email: user.email,
          mobileNo: user.mobileNo,
          // ✅ Safe: no crash if department / designation / company is missing
          department: user.department?.name || "",
          designation: user.designation?.name || "",
          permissions: user.designation?.permissions || [],
          profilePic: user.profilePic,
          logo: user.company?.logo || "",
        },
      });
    }

    // Company
    if (loggedUser === "company") {
      return res.status(200).json({
        success: true,
        token: token,
        user: {
          user: loggedUser,
          name: user.name,
          logo: user.logo,
          _id: user._id,
          newUser: user.newUser,
        },
      });
    }

    // Admin
    return res.status(200).json({
      success: true,
      token: token,
      user: { user: loggedUser, name: user.name, newUser: user.newUser },
    });

  } catch (err) {
    console.log("Error in generateTokenAndSendResponse: ", err);
    // ✅ Always send a reply, so login never hangs
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "Login failed. Please try again or contact support.",
      });
    }
  }
};

exports.resetTokenLink = (user) => {
  try {
    const secret = process.env.JWT_SECRET + user.password;
    const payload = {
      email: user.email,
      id: user._id,
    };
    const token = jwt.sign(payload, secret, { expiresIn: "15m" });

    const baseUrl = process.env.Frontend_URL || "https://proclient360.com";
    const link = `${baseUrl}/reset-password/${user._id}/${token}`;

    return link;
  } catch (err) {
    console.log("Error in resetTokenLink: ", err);
    return null;
  }
};

exports.verifyResetToken = (user, token) => {
  try {
    const secret = process.env.JWT_SECRET + user.password;
    jwt.verify(token, secret);
    return true;
  } catch (error) {
    return false;
  }
};