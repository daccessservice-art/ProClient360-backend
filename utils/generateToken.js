const jwt = require("jsonwebtoken");


exports.generateTokenAndSendResponse = (user, res, loggedUser) => {
  try {
    const token = jwt.sign(
      { user: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "15d",
      }
    );

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
          department: user.department.name,
          designation: user.designation.name,
          permissions: user.designation.permissions,
          profilePic: user.profilePic,
          logo: user.company.logo,
        },
      });
    } else if (loggedUser === "company") {
      return res.status(200).json({
        success: true,
        user: { user: loggedUser, name: user.name, logo: user.logo, _id: user._id, newUser: user.newUser },
        token: token,
      });
    }
    res.status(200).json({
      success: true,
      token: token,
      user: { user: loggedUser, name: user.name, newUser: user.newUser },
    });
  } catch (err) {
    console.log("Error in generateTokenAndSendResponse: ", err);
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

    const link = `${
      process.env.Frontend_URL
    }/ResetPassword/${user._id}/${token}`;
    return link;
  } catch (err) {
    console.log("Error in resetTokenLink: ", err);
  }
};

exports.verifyResetToken = (user, token) => {
  try {
    const secret = process.env.JWT_SECRET + user.password;
    const payload = jwt.verify(token, secret);
    return true;
  } catch (error) {
    return false;
  }
};
