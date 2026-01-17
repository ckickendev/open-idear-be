const nodemailer = require("nodemailer");
const { ConsoleLogger } = require("../core");

const sendEmailHandler = async (mailOptionsInfo) => {
  const ADMIN_EMAIL_ADDRESS = "opentrashtech@gmail.com";
  try {
    const transport = nodemailer.createTransport(
      {
        secure: true,
        host: "smtp.gmail.com",
        port: 465,
        auth: {
          user: ADMIN_EMAIL_ADDRESS,
          pass: process.env.PASSWORD
        }
      }
    );
    const { to, subject, html } = mailOptionsInfo;
    const mailOptions = {
      from: {
        name: "OPEN IDEAR",
        address: ADMIN_EMAIL_ADDRESS
      },
      to: to,
      subject: subject,
      html: html,
    };
    await transport.sendMail(mailOptions);
    return true;

  } catch (e) {
    ConsoleLogger.error(e.message)
    return false;
  }
}

module.exports = sendEmailHandler;
