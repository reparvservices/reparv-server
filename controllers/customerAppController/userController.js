import moment from "moment";
import db from "../../config/dbconnect.js";
import dotenv from "dotenv";
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken";

dotenv.config();


import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const add = (req, res) => {
  try {
    const { fullname, contact } = req.body;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    // Input validation
    if (!fullname || !contact) {
      return res
        .status(400)
        .json({ message: "Full name and contact are required." });
    }

    // Step 1: Check if contact already exists
    const checkSql =
      "SELECT user_id, fullname, contact FROM mobileusers WHERE contact = ?";

    db.query(checkSql, [contact], (checkErr, checkResults) => {
      if (checkErr) {
        console.error("Error during user check:", checkErr);
        return res
          .status(500)
          .json({ message: "Database error", error: checkErr });
      }

      // Step 2: If user exists, return existing data
      if (checkResults.length > 0) {
        const existingUser = checkResults[0];
        return res.status(200).json({
          message: "User already exists",
          data: {
            id: existingUser.user_id,
            fullname: existingUser.fullname,
            contact: existingUser.contact,
          },
        });
      }

      // Step 3: Insert new user
      const insertSql = `
        INSERT INTO mobileusers 
        (fullname, contact, updated_at, created_at) 
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [fullname, contact, currentdate, currentdate],
        (insertErr, result) => {
          if (insertErr) {
            console.error("Error during Sign Up:", insertErr);
            return res
              .status(500)
              .json({ message: "Database error", error: insertErr });
          }

          return res.status(201).json({
            message: "Successfully Signed Up",
            data: {
              id: result.insertId,
              fullname,
              contact,
            },
          });
        }
      );
    });
  } catch (error) {
    console.error("Unexpected error in Sign Up:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};


// export const add = async (req, res) => {
//   try {
//     const { fullname, contact, email, password } = req.body;
//     const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

//     //  VALIDATION
//     if (!fullname || !contact || !email || !password) {
//       return res.status(400).json({
//         message: "Full name, contact, email and password are required.",
//       });
//     }

//     const lowerEmail = email.toLowerCase();

//     //  Check existing user
//     const checkSql =
//       "SELECT user_id FROM mobileusers WHERE contact = ? OR email = ?";
//     db.query(checkSql, [contact, lowerEmail], async (checkErr, results) => {
//       if (checkErr) {
//         return res.status(500).json({
//           message: "Database error",
//           error: checkErr,
//         });
//       }

//       if (results.length > 0) {
//         return res.status(200).json({
//           message: "User already exists",
//         });
//       }

//       // 🔐 HASH PASSWORD
//       const hashedPassword = await bcrypt.hash(password, 10);

//       // 👉 INSERT NEW USER
//       const insertSql = `
//         INSERT INTO mobileusers 
//         (fullname, contact, email, password, created_at, updated_at)
//         VALUES (?, ?, ?, ?, ?, ?)
//       `;

//       db.query(
//         insertSql,
//         [
//           fullname,
//           contact,
//           lowerEmail,
//           hashedPassword,
//           currentdate,
//           currentdate,
//         ],
//         async (insertErr, result) => {
//           if (insertErr) {
//             return res.status(500).json({
//               message: "Database error",
//               error: insertErr,
//             });
//           }

//           // 📩 SEND WELCOME EMAIL
//           const mailOptions = {
//             from: `"Reparv" <${process.env.EMAIL_USER}>`,
//             to: lowerEmail,
//             subject: "Welcome to Reparv 🎉",
//             html: `
//               <h2>Hello ${fullname},</h2>
//               <p>Your account has been successfully created.</p>
//               <p>Your Password is : <b>${password}</b></p>
//               <p>Welcome to <b>Reparv</b>!</p>
//             `,
//           };

//           try {
//             await transporter.sendMail(mailOptions);
//           } catch (emailErr) {
//             console.log("Email sending failed:", emailErr);
//           }

//           // 🎉 FINAL RESPONSE
//           res.status(201).json({
//             message: "Signup successful!",
//             data: {
//               id: result.insertId,
//               fullname,
//               contact,
//               email: lowerEmail,
//             },
//           });
//         }
//       );
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: "Internal server error",
//       error,
//     });
//   }
// };
// const generateOtp = () => Math.floor(100000 + Math.random() * 900000);

// export const login = async (req, res) => {
//   try {
//     const {emailOrPhone, password, type } = req.body;
//     const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

//     if (!type) {
//       return res.status(400).json({ message: "Login type missing" });
//     }
  
//     //FIND USER
//     const findSql = `
//       SELECT user_id, fullname, contact, email, password 
//       FROM mobileusers
//       WHERE contact = ? OR email = ?
//     `;

//     db.query(findSql, [emailOrPhone, emailOrPhone], async (err, results) => {
//       if (err) {
//         return res.status(500).json({ message: "Database error", error: err });
//       }

//       if (results.length === 0) {
//         return res.status(404).json({ message: "User not found" });
//       }

//       const user = results[0];

      
//       //  LOGIN WITH PASSWORD
      
//       if (type === "password") {
//         if (!password) {
//           return res
//             .status(400)
//             .json({ message: "Password is required for password login" });
//         }

//         const match = await bcrypt.compare(password, user.password);
//         if (!match) {
//           return res.status(401).json({ message: "Invalid password" });
//         }

//         // Generate JWT
//         const token = jwt.sign(
//           {
//             user_id: user.user_id,
//             email: user.email,
//             contact: user.contact,
//           },
//           process.env.JWT_SECRET,
//           { expiresIn: "7d" }
//         );

//         return res.status(200).json({
//           message: "Login successful",
//           token,
//           data: {
//             id: user.user_id,
//             fullname: user.fullname,
//             contact: user.contact,
//             email: user.email,
//           },
//         });
//       }

      
//       //LOGIN WITH OTP - SEND OTP
      
//       if (type === "send-otp") {
//         const otp = generateOtp();
//         const otpExpires = moment()
//           .add(10, "minutes")
//           .format("YYYY-MM-DD HH:mm:ss");

//         const updateSql = `
//           UPDATE mobileusers 
//           SET otp = ?, otp_expires = ?, updated_at = ?
//           WHERE user_id = ?
//         `;

//         db.query(
//           updateSql,
//           [otp, otpExpires, currentdate, user.user_id],
//           async (updateErr) => {
//             if (updateErr) {
//               return res
//                 .status(500)
//                 .json({ message: "Database error", error: updateErr });
//             }

//             // Send OTP Email
//             const mailOptions = {
//               from: `"Reparv" <${process.env.EMAIL_USER}>`,
//               to: user.email,
//               subject: "Your Login OTP Code 🔐",
//               html: `
//                 <h2>Hello ${user.fullname},</h2>
//                 <p>Your login OTP is:</p>
//                 <h1>${otp}</h1>
//                 <p>Valid for 10 minutes.</p>
//               `,
//             };

//             try {
//               await transporter.sendMail(mailOptions);
//             } catch (mailErr) {
//               console.log("OTP email failed:", mailErr);
//             }

//             return res.status(200).json({
//               message: "OTP sent successfully",
//               otp: otp, // remove in production
//             });
//           }
//         );

//         return;
//       }

      
//       //VERIFY OTP
      
//       if (type === "verify-otp") {
//         const { otp } = req.body;

//         if (!otp) {
//           return res
//             .status(400)
//             .json({ message: "OTP is required for verification" });
//         }

//         if (!user.otp || user.otp != otp) {
//           return res.status(401).json({ message: "Invalid OTP" });
//         }

//         if (moment().isAfter(user.otp_expires)) {
//           return res.status(401).json({ message: "OTP expired" });
//         }

//         // Create JWT token
//         const token = jwt.sign(
//           {
//             user_id: user.user_id,
//             email: user.email,
//             contact: user.contact,
//           },
//           process.env.JWT_SECRET,
//           { expiresIn: "7d" }
//         );

//         return res.status(200).json({
//           message: "OTP verified successfully",
//           token,
//           user: {
//             id: user.user_id,
//             fullname: user.fullname,
//             contact: user.contact,
//             email: user.email,
//           },
//         });
//       }

//       return res.status(400).json({ message: "Invalid login type" });
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: "Internal server error",
//       error,
//     });
//   }
// };

export const getProfile = (req, res) => {
  const { contact } = req.query;

  if (!contact) {
    return res.status(400).json({ message: 'Contact number is required.' });
  }

  const sql = `SELECT fullname, email, contact, userimage FROM mobileusers WHERE contact = ?`;

  db.query(sql, [contact], (err, results) => {
    if (err) {
      console.error('Error fetching profile:', err);
      return res.status(500).json({ message: 'Database error', error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({
      message: 'Profile fetched successfully!',
      data: results[0],
    });
  });
};

export const update = (req, res) => {
  try {
    const { fullname, email, contact } = req.body;
    const userimage = req.file ? `/uploads/${req.file.filename}` : null;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    if (!fullname || !contact || !email) {
      return res.status(400).json({ message: "All Fields are required." });
    }

    let sql = `
      UPDATE mobileusers 
      SET fullname = ?, contact = ?, email = ?, updated_at = ?
    `;
    const params = [fullname, contact, email, currentdate];

    if (userimage) {
      sql += `, userimage = ?`;
      params.push(userimage);
    }

    sql += ` WHERE contact = ?`;
    params.push(contact);

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("Error during profile update:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(200).json({
        message: "Profile updated successfully!",
        data: {
          fullname,
          email,
          contact,
          userimage,
        },
      });
    });
  } catch (error) {
    console.error("Unexpected error in Profile Update:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};



