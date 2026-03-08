const nodemailer = require("nodemailer");
const { ConsoleLogger } = require("../core");

const nodemailer = require("nodemailer");
const { ConsoleLogger } = require("../core");

const sendEmailHandler = async (mailOptionsInfo) => {
  const ADMIN_EMAIL_ADDRESS = process.env.ADMIN_EMAIL_ADDRESS || "opentrashtech@gmail.com";
  try {
    const transport = nodemailer.createTransport({
      secure: true,
      host: "smtp.gmail.com",
      port: 465,
      auth: {
        user: ADMIN_EMAIL_ADDRESS,
        pass: process.env.PASSWORD
      }
    });

    const { to, subject, html } = mailOptionsInfo;
    const mailOptions = {
      from: {
        name: "OPEN IDEAR",
        address: ADMIN_EMAIL_ADDRESS
      },
      to,
      subject,
      html,
    };

    const info = await transport.sendMail(mailOptions);
    ConsoleLogger.info(`Email sent: ${info.messageId}`);
    return true;

  } catch (e) {
    ConsoleLogger.error(`Error sending email to ${mailOptionsInfo.to}: ${e.message}`);
    return false;
  }
}

module.exports = sendEmailHandler;
