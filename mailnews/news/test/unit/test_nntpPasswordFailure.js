/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks to see if the nntp password failure is handled correctly.
 * The steps are:
 *   - Have an invalid password in the password database.
 *   - Check we get a prompt asking what to do.
 *   - Check retry does what it should do.
 *   - Check cancel does what it should do.
 *   - Re-initiate connection, this time select enter new password, check that
 *     we get a new password prompt and can enter the password.
 */

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/passwordStorage.js */
load("../../../resources/alertTestUtils.js");
load("../../../resources/passwordStorage.js");

var server;
var daemon;
var incomingServer;
var folder;
var attempt = 0;
var logins;

var kUserName = "testnews";
var kInvalidPassword = "newstest";
var kValidPassword = "notallama";

add_setup(function () {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  Services.prefs.setBoolPref("signon.debug", true);

  // Prepare files for passwords (generated by a script in bug 1018624).
  setupForPassword("signons-mailnews1.8.json");

  registerAlertTestUtils();

  // Set up the server
  daemon = setupNNTPDaemon();
  function createHandler(d) {
    var handler = new NNTP_RFC4643_extension(d);
    handler.expectedPassword = kValidPassword;
    return handler;
  }
  server = new nsMailServer(createHandler, daemon);
  server.start();
  incomingServer = setupLocalServer(server.port);
  folder = incomingServer.rootFolder.getChildNamed("test.subscribe.simple");

  // Check that we haven't got any messages in the folder, if we have its a test
  // setup issue.
  Assert.equal(folder.getTotalMessages(false), 0);
});

add_task(async function getMail1() {
  // Now get mail.
  const urlListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(url, result) {
      // On the last attempt, we should have successfully got one mail.
      Assert.equal(folder.getTotalMessages(false), attempt == 4 ? 1 : 0);

      // If we've just cancelled, expect failure rather than success
      // because the server dropped the connection.
      dump("in onStopRunning, result = " + result + "\n");
      // do_check_eq(result, attempt == 2 ? Cr.NS_ERROR_FAILURE : 0);
    },
  });
  folder.getNewMessages(gDummyMsgWindow, urlListener);
  await urlListener.promise;

  Assert.equal(attempt, 2);

  // Check that we haven't forgotten the login even though we've retried and cancelled.
  logins = Services.logins.findLogins(
    "news://localhost",
    null,
    "news://localhost"
  );

  Assert.equal(logins.length, 1);
  Assert.equal(logins[0].username, kUserName);
  Assert.equal(logins[0].password, kInvalidPassword);

  server.resetTest();
});

add_task(async function getMail2() {
  const urlListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(url, result) {
      // On the last attempt, we should have successfully got one mail.
      Assert.equal(folder.getTotalMessages(false), attempt == 4 ? 1 : 0);

      // If we've just cancelled, expect failure rather than success
      // because the server dropped the connection.
      dump("in onStopRunning, result = " + result + "\n");
      // do_check_eq(result, attempt == 2 ? Cr.NS_ERROR_FAILURE : 0);
    },
  });
  folder.getNewMessages(gDummyMsgWindow, urlListener);
  await urlListener.promise;
  // Now check the new one has been saved.
  logins = Services.logins.findLogins(
    "news://localhost",
    null,
    "news://localhost"
  );

  Assert.equal(logins.length, 1);
  Assert.equal(logins[0].username, kUserName);
  Assert.equal(logins[0].password, kValidPassword);
});

add_task(function endTest() {
  // Clean up nicely the test.
  server.stop();

  var thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});

/* exported alert, confirmEx, promptUsernameAndPasswordPS */
function alertPS(parent, aDialogText, aText) {
  // The first few attempts may prompt about the password problem, the last
  // attempt shouldn't.
  Assert.ok(attempt < 4);

  // Log the fact we've got an alert, but we don't need to test anything here.
  dump("Alert Title: " + aDialogText + "\nAlert Text: " + aText + "\n");
}

function confirmExPS(
  parent,
  aDialogTitle,
  aText,
  aButtonFlags,
  aButton0Title,
  aButton1Title,
  aButton2Title,
  aCheckMsg,
  aCheckState
) {
  switch (++attempt) {
    // First attempt, retry.
    case 1:
      dump("\nAttempting retry\n");
      return 0;
    // Second attempt, cancel.
    case 2:
      dump("\nCancelling login attempt\n");
      return 1;
    // Third attempt, retry.
    case 3:
      dump("\nAttempting Retry\n");
      return 0;
    // Fourth attempt, enter a new password.
    case 4:
      dump("\nEnter new password\n");
      return 2;
    default:
      throw new Error("unexpected attempt number " + attempt);
  }
}

function promptUsernameAndPasswordPS(
  aParent,
  aDialogTitle,
  aText,
  aUsername,
  aPassword,
  aCheckMsg,
  aCheckState
) {
  if (attempt == 4) {
    aUsername.value = kUserName;
    aPassword.value = kValidPassword;
    aCheckState.value = true;
    return true;
  }
  return false;
}
