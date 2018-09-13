const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const { OAuth2Client } = require("google-auth-library");
const { google } = require("googleapis");
// const request = require("request");

const CONFIG_CLIENT_ID = functions.config().googleapi.client_id;
const CONFIG_CLIENT_SECRET = functions.config().googleapi.client_secret;
const CONFIG_SHEET_ID = functions.config().googleapi.sheet_id;
const FUNCTIONS_REDIRECT = `https://us-central1-bdx-io-ticket-exchange.cloudfunctions.net/oauthcallback`;
const DB_TOKEN_PATH = "/api_tokens";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets"
];
const functionsOauthClient = new OAuth2Client(
  CONFIG_CLIENT_ID,
  CONFIG_CLIENT_SECRET,
  FUNCTIONS_REDIRECT
);

let oauthTokens = null;

exports.authgoogleapi = functions.https.onRequest((req, res) => {
  res.set("Cache-Control", "private, max-age=0, s-maxage=0");
  res.redirect(
    functionsOauthClient.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent"
    })
  );
});

exports.oauthcallback = functions.https.onRequest((req, res) => {
  res.set("Cache-Control", "private, max-age=0, s-maxage=0");
  const code = req.query.code;
  functionsOauthClient.getToken(code, (err, tokens) => {
    if (err) {
      return res.status(400).send(err);
    }

    return admin
      .database()
      .ref(DB_TOKEN_PATH)
      .set(tokens)
      .then(() =>
        res
          .status(200)
          .send("App successfully configured with new Credentials. You can now close this page.")
      );
  });
});

function appendPromise(requestWithoutAuth) {
  return new Promise((resolve, reject) => {
    return getAuthorizedClient().then(client => {
      const sheets = google.sheets("v4");
      const request = requestWithoutAuth;
      request.auth = client;
      return sheets.spreadsheets.values.append(request, (err, response) => {
        if (err) {
          console.log(`The API returned an error: ${err}`);
          return reject(err);
        }
        return resolve(response.data);
      });
    });
  });
}

function getAuthorizedClient() {
  if (oauthTokens) {
    return Promise.resolve(functionsOauthClient);
  }
  return admin
    .database()
    .ref(DB_TOKEN_PATH)
    .once("value")
    .then(snapshot => {
      oauthTokens = snapshot.val();
      functionsOauthClient.setCredentials(oauthTokens);
      return functionsOauthClient;
    });
}

exports.createExchange = functions.https.onRequest((req, res) => {
  const body = JSON.parse(req.body);

  return appendPromise({
    spreadsheetId: CONFIG_SHEET_ID,
    range: "A:H",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [
        [
          body.holderFirstname,
          body.holderLastanme,
          body.holderEmail,
          body.commandNumber,
          body.recipientFirstname,
          body.recipientLastname,
          body.recipientEmail,
          new Date()
        ]
      ]
    }
  }).then(() => {
    // return request
    //   .post("https://hooks.slack.com/services/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", {
    //     json: { text: "✨ Nouvelle demande d'échange de billet !" }
    //   })
    //   .on("response", () => {
    return res.status(200).send({
      message: "Saved successfully"
    });
    // });
  });
});
