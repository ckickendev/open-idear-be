const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

// Send email
const sendEmailHandler = async (mailOptionsInfo) => {
  const GOOGLE_MAILER_CLIENT_ID = mailOptionsInfo.GOOGLE_MAILER_CLIENT_ID;
  const GOOGLE_MAILER_CLIENT_SECRET = mailOptionsInfo.GOOGLE_MAILER_CLIENT_SECRET;
  const GOOGLE_MAILER_REFRESH_TOKEN = mailOptionsInfo.GOOGLE_MAILER_REFRESH_TOKEN;
  const ADMIN_EMAIL_ADDRESS = "thesoonafu@gmail.com";

  const myOAuth2Client = new OAuth2Client(
    GOOGLE_MAILER_CLIENT_ID,
    GOOGLE_MAILER_CLIENT_SECRET
  );

  myOAuth2Client.setCredentials({
    refresh_token: GOOGLE_MAILER_REFRESH_TOKEN,
  });

  const myAccessTokenObject = await myOAuth2Client.getAccessToken();
  const myAccessToken = myAccessTokenObject?.token;

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: ADMIN_EMAIL_ADDRESS,
      clientId: GOOGLE_MAILER_CLIENT_ID,
      clientSecret: GOOGLE_MAILER_CLIENT_SECRET,
      refresh_token: GOOGLE_MAILER_REFRESH_TOKEN,
      accessToken: myAccessToken,
    },
  });

  const { to, subject, html } = mailOptionsInfo;
  const mailOptions = {
    to: to, // Gửi đến ai?
    subject: subject, // Tiêu đề email
    html: html, // Nội dung email
  };
  await transport.sendMail(mailOptions);
};

module.exports = sendEmailHandler;
