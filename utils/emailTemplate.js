const confirmTokenEmail = (token, link) => {
  return `<div width="100%" style="margin: 0; background-color: #f0f2f3">
    <div
      style="margin: auto; max-width: 600px; padding-top: 50px"
      class="m_-1144648983529941144email-container"
    >
      <table
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        width="100%"
        align="center"
        id="m_-1144648983529941144logoContainer"
        style="
          background: #252f3d;
          border-radius: 3px 3px 0 0;
          max-width: 600px;
        "
      >
        <tbody>
          <tr>
            <td
              style="
                background: #252f3d;
                border-radius: 3px 3px 0 0;
                padding: 20px 0 10px 0;
                text-align: center;
              "
            >
              <img
                src="${process.env.LOGO}"
                width="75"
                height="75"
                alt="Your logo"
                border="0"
                style="
                  font-family: sans-serif;
                  font-size: 15px;
                  line-height: 140%;
                  color: #555555;
                "
                class="CToWUd"
                data-bit="iit"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <table
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        width="100%"
        align="center"
        id="m_-1144648983529941144emailBodyContainer"
        style="
          border: 0px;
          border-bottom: 1px solid #d6d6d6;
          max-width: 600px;
        "
      >
        <tbody>
          <tr>
            <td
              style="
                background-color: #fff;
                color: #444;
                font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                  sans-serif;
                font-size: 14px;
                line-height: 140%;
                padding: 25px 35px;
              "
            >
              <h1
                style="
                  font-size: 20px;
                  font-weight: bold;
                  line-height: 1.3;
                  margin: 0 0 15px 0;
                  text-align: center;
                "
              >
                <span class="il">Verify</span> your email address
              </h1>
              <p style="margin: 0; padding: 0; text-align: center">
                Thanks for starting the new account in our website process. We
                want to make sure it's really you. Please enter the following
                verification code when prompted. If you don’t want to create
                an account, you can ignore this message.
              </p>
              <p style="margin: 0; padding: 0"></p>
            </td>
          </tr>
          <tr>
            <td
              style="
                background-color: #fff;
                color: #444;
                font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                  sans-serif;
                font-size: 14px;
                line-height: 140%;
                padding: 25px 35px;
                padding-top: 0;
                text-align: center;
              "
            >
              <div style="font-weight: bold; padding-bottom: 15px">
                Verification code
              </div>
              <div
                style="
                  color: #000;
                  font-size: 36px;
                  font-weight: bold;
                  padding-bottom: 15px;
                "
              >
                ${token}
              </div>
              <div>(This code is valid for 10 minutes)</div>
              <p>Or you can click <a href=${link} style="
              color: red;
              font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                sans-serif;
              font-size: 14px;
            " >here</a> to activate now</p>
            </td>
          </tr>
          <tr>
            <td
              style="
                background-color: #fff;
                border-top: 1px solid #e0e0e0;
                color: #777;
                font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                  sans-serif;
                font-size: 14px;
                line-height: 140%;
                padding: 25px 35px;
              "
            >
              <p style="margin: 0 0 15px 0; padding: 0 0 0 0; text-align: center">
                TFTraining will never email you and ask you to disclose or
                <span class="il">verify</span> your password, credit card, or
                banking account number.
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <table
        role="presentation"
        cellspacing="0"
        cellpadding="0"
        width="100%"
        align="center"
        id="m_-1144648983529941144footer"
        style="max-width: 600px"
      >
        <tbody>
          <tr>
            <td
              style="
                color: #777;
                font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                  sans-serif;
                font-size: 12px;
                line-height: 16px;
                padding: 20px 30px;
                text-align: center;
              "
            >
              This message was produced and distributed by TFTraining Inc..
              All rights reserved. AWS is a registered trademark of
              <a
                href="https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%2F%2Fwww.amazon.com%2F/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/jMn7TpA1cW2yMg2sp1Vw9BjPee4=308"
                target="_blank"
                data-saferedirecturl="https://www.google.com/url?q=https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%252F%252Fwww.amazon.com%252F/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/jMn7TpA1cW2yMg2sp1Vw9BjPee4%3D308&amp;source=gmail&amp;ust=1679420722998000&amp;usg=AOvVaw1WShMwomKWpMirTjJFfvu2"
                >TFTraining</a
              >, Da Nang, VietNam
              <a
                href="https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%2F%2Fwww.amazon.com%2Fgp%2Ff.html%3FC=ASNZCWDUG167%26M=urn:rtn:msg:20201117075724eb4b304704de4791b90718772250p0na%26R=24F5VU3RW0OAG%26T=C%26U=https%253A%252F%252Faws.amazon.com%252Fprivacy%252F%253Fsc_channel%253Dem%2526sc_campaign%253Dwlcm%2526sc_publisher%253Daws%2526sc_medium%253Dem_wlcm_footer%2526sc_detail%253Dwlcm_footer%2526sc_content%253Dother%2526sc_country%253Dglobal%2526sc_geo%253Dglobal%2526sc_category%253Dmult%2526ref_%253Dpe_1679150_261538020%26H=PSTTW2QUTETQPANYMBJB5CSZMMSA%26ref_=pe_1679150_261538020/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/Bb5hNo4Pk8P3Uicz3HoTbo_Rjns=308"
                target="_blank"
                data-saferedirecturl="https://www.google.com/url?q=https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%252F%252Fwww.amazon.com%252Fgp%252Ff.html%253FC%3DASNZCWDUG167%2526M%3Durn:rtn:msg:20201117075724eb4b304704de4791b90718772250p0na%2526R%3D24F5VU3RW0OAG%2526T%3DC%2526U%3Dhttps%25253A%25252F%25252Faws.amazon.com%25252Fprivacy%25252F%25253Fsc_channel%25253Dem%252526sc_campaign%25253Dwlcm%252526sc_publisher%25253Daws%252526sc_medium%25253Dem_wlcm_footer%252526sc_detail%25253Dwlcm_footer%252526sc_content%25253Dother%252526sc_country%25253Dglobal%252526sc_geo%25253Dglobal%252526sc_category%25253Dmult%252526ref_%25253Dpe_1679150_261538020%2526H%3DPSTTW2QUTETQPANYMBJB5CSZMMSA%2526ref_%3Dpe_1679150_261538020/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/Bb5hNo4Pk8P3Uicz3HoTbo_Rjns%3D308&amp;source=gmail&amp;ust=1679420722998000&amp;usg=AOvVaw3A8EMWIKIfgyJ2p1lY20Us"
                >privacy policy</a
              >.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
};

const confirmRegiter = (link) => {
  return `<div width="100%" style="margin: 0; background-color: #f0f2f3">
  <div
    style="margin: auto; max-width: 600px; padding-top: 50px"
    class="m_-1144648983529941144email-container"
  >
    <table
      role="presentation"
      cellspacing="0"
      cellpadding="0"
      width="100%"
      align="center"
      id="m_-1144648983529941144logoContainer"
      style="
        background: #252f3d;
        border-radius: 3px 3px 0 0;
        max-width: 600px;
      "
    >
      <tbody>
        <tr>
          <td
            style="
              background: #252f3d;
              border-radius: 3px 3px 0 0;
              padding: 20px 0 10px 0;
              text-align: center;
            "
          >
            <img
              src="${process.env.LOGO}"
              width="75"
              height="75"
              alt="Your logo"
              border="0"
              style="
                font-family: sans-serif;
                font-size: 15px;
                line-height: 140%;
                color: #555555;
              "
              class="CToWUd"
              data-bit="iit"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <table
      role="presentation"
      cellspacing="0"
      cellpadding="0"
      width="100%"
      align="center"
      id="m_-1144648983529941144emailBodyContainer"
      style="
        border: 0px;
        border-bottom: 1px solid #d6d6d6;
        max-width: 600px;
      "
    >
      <tbody>
        <tr>
          <td
            style="
              background-color: #fff;
              color: #444;
              font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                sans-serif;
              font-size: 14px;
              line-height: 140%;
              padding: 25px 35px;
            "
          >
            <h1
              style="
                font-size: 20px;
                font-weight: bold;
                line-height: 1.3;
                margin: 0 0 15px 0;
                text-align: center;
              "
            >
              <span class="il">Your</span> request to reset password
            </h1>
            <p style="margin: 0; padding: 0; text-align: center">
              We are TFTraining. Please click this link below to reset
              password
            </p>
            <p style="margin: 0; padding: 0; text-align: center">
              If you don't receive an email from us, please check your spam
              folder or contact our support team for further assistance.
              Please note that for security reasons, we don't send passwords
              in plain text over email. Instead, we provide a secure link
              for you to reset your password.
            </p>
            <p style="margin: 0; padding: 0"></p>
          </td>
        </tr>
        <tr>
          <td
            style="
              background-color: #fff;
              color: #444;
              font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                sans-serif;
              font-size: 14px;
              line-height: 140%;
              padding: 25px 35px;
              padding-top: 0;
              text-align: center;
            "
          >
            <div style="font-weight: bold; padding-bottom: 15px">
              Click this link below to reset password
            </div>
            <a
              style="
                color: #e53535;
                font-size: 36px;
                font-weight: bold;
                padding-bottom: 15px;
              "
              href=${link}
            >
              Link
            </a>
            <div>(This link is valid for 10 minutes)</div>
          </td>
        </tr>
        <tr>
          <td
            style="
              background-color: #fff;
              border-top: 1px solid #e0e0e0;
              color: #777;
              font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                sans-serif;
              font-size: 14px;
              line-height: 140%;
              padding: 25px 35px;
            "
          >
            <p
              style="
                margin: 0 0 15px 0;
                padding: 0 0 0 0;
                text-align: center;
              "
            >
              TFTraining will never email you and ask you to disclose or
              <span class="il">verify</span> your password, credit card, or
              banking account number.
            </p>
          </td>
        </tr>
      </tbody>
    </table>

    <table
      role="presentation"
      cellspacing="0"
      cellpadding="0"
      width="100%"
      align="center"
      id="m_-1144648983529941144footer"
      style="max-width: 600px"
    >
      <tbody>
        <tr>
          <td
            style="
              color: #777;
              font-family: 'Amazon Ember', 'Helvetica Neue', Roboto, Arial,
                sans-serif;
              font-size: 12px;
              line-height: 16px;
              padding: 20px 30px;
              text-align: center;
            "
          >
            This message was produced and distributed by TFTraining Inc..
            All rights reserved. AWS is a registered trademark of
            <a
              href="https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%2F%2Fwww.amazon.com%2F/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/jMn7TpA1cW2yMg2sp1Vw9BjPee4=308"
              target="_blank"
              data-saferedirecturl="https://www.google.com/url?q=https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%252F%252Fwww.amazon.com%252F/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/jMn7TpA1cW2yMg2sp1Vw9BjPee4%3D308&amp;source=gmail&amp;ust=1679420722998000&amp;usg=AOvVaw1WShMwomKWpMirTjJFfvu2"
              >TFTraining</a
            >, Da Nang, VietNam
            <a
              href="https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%2F%2Fwww.amazon.com%2Fgp%2Ff.html%3FC=ASNZCWDUG167%26M=urn:rtn:msg:20201117075724eb4b304704de4791b90718772250p0na%26R=24F5VU3RW0OAG%26T=C%26U=https%253A%252F%252Faws.amazon.com%252Fprivacy%252F%253Fsc_channel%253Dem%2526sc_campaign%253Dwlcm%2526sc_publisher%253Daws%2526sc_medium%253Dem_wlcm_footer%2526sc_detail%253Dwlcm_footer%2526sc_content%253Dother%2526sc_country%253Dglobal%2526sc_geo%253Dglobal%2526sc_category%253Dmult%2526ref_%253Dpe_1679150_261538020%26H=PSTTW2QUTETQPANYMBJB5CSZMMSA%26ref_=pe_1679150_261538020/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/Bb5hNo4Pk8P3Uicz3HoTbo_Rjns=308"
              target="_blank"
              data-saferedirecturl="https://www.google.com/url?q=https://bjdxkhre.r.us-east-1.awstrack.me/L0/https:%252F%252Fwww.amazon.com%252Fgp%252Ff.html%253FC%3DASNZCWDUG167%2526M%3Durn:rtn:msg:20201117075724eb4b304704de4791b90718772250p0na%2526R%3D24F5VU3RW0OAG%2526T%3DC%2526U%3Dhttps%25253A%25252F%25252Faws.amazon.com%25252Fprivacy%25252F%25253Fsc_channel%25253Dem%252526sc_campaign%25253Dwlcm%252526sc_publisher%25253Daws%252526sc_medium%25253Dem_wlcm_footer%252526sc_detail%25253Dwlcm_footer%252526sc_content%25253Dother%252526sc_country%25253Dglobal%252526sc_geo%25253Dglobal%252526sc_category%25253Dmult%252526ref_%25253Dpe_1679150_261538020%2526H%3DPSTTW2QUTETQPANYMBJB5CSZMMSA%2526ref_%3Dpe_1679150_261538020/1/010001864bcea705-e24a3aa8-6a8f-45de-9acb-a138c0fa059e-000000/Bb5hNo4Pk8P3Uicz3HoTbo_Rjns%3D308&amp;source=gmail&amp;ust=1679420722998000&amp;usg=AOvVaw3A8EMWIKIfgyJ2p1lY20Us"
              >privacy policy</a
            >.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`;
};

module.exports = { confirmTokenEmail, confirmRegiter };
