/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests messages generated by ReplyWithTemplate.
 */

var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

load("../../../resources/logHelper.js"); // watch for errors in the error console

const kSender = "from@foo.invalid";

var gIncomingMailFile = do_get_file("../../../data/bugmail10"); // mail to reply to
// reply-filter-testmail: mail to reply to (but not really)
var gIncomingMailFile2 = do_get_file("../../../data/reply-filter-testmail");
// mail to reply to (but not really, no from)
var gIncomingMailFile3 = do_get_file("../../../data/mail-without-from");
var gTemplateMailFile = do_get_file("../../../data/template-latin1"); // template
var gTemplateMailFile2 = do_get_file("../../../data/template-utf8"); // template2
var gTemplateFolder;

var gServer;

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  gTemplateFolder =
    localAccountUtils.rootFolder.createLocalSubfolder("Templates");

  gServer = setupServerDaemon();
  gServer.start();

  run_next_test();
}

add_task(async function copy_gIncomingMailFile() {
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gIncomingMailFile into the Inbox.
  MailServices.copy.copyFileMessage(
    gIncomingMailFile,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
});

add_task(async function copy_gIncomingMailFile2() {
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gIncomingMailFile2 into the Inbox.
  MailServices.copy.copyFileMessage(
    gIncomingMailFile2,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
});

add_task(async function copy_gIncomingMailFile3() {
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gIncomingMailFile3 into the Inbox.
  MailServices.copy.copyFileMessage(
    gIncomingMailFile3,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
});

add_task(async function copy_gTemplateMailFile() {
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gTemplateMailFile into the Templates folder.
  MailServices.copy.copyFileMessage(
    gTemplateMailFile,
    gTemplateFolder,
    null,
    true,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
});

add_task(async function copy_gTemplateMailFile2() {
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  // Copy gTemplateMailFile2 into the Templates folder.
  MailServices.copy.copyFileMessage(
    gTemplateMailFile2,
    gTemplateFolder,
    null,
    true,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;
});

// Test that a reply is NOT sent when the message is not addressed to "me".
add_task(async function testReplyingToUnaddressedFails() {
  try {
    await testReply(0); // mail 0 is not to us!
    do_throw("Replied to a message not addressed to us!");
  } catch (e) {
    if (e.result != Cr.NS_ERROR_ABORT) {
      throw e;
    }
    // Ok! We didn't reply to the message not specifically addressed to
    // us (from@foo.invalid).
  }
});

// Test that a reply is sent when the message is addressed to "me".
add_task(async function testReplyingToAdressedWorksLatin1() {
  try {
    await testReply(1); // mail 1 is addressed to us, using template-latin1
  } catch (e) {
    do_throw("Didn't reply properly to a message addressed to us! " + e);
  }
});

// Test that a reply is sent when the message is addressed to "me".
add_task(async function testReplyingToAdressedWorksUTF8() {
  try {
    await testReply(1, 1); // mail 1 is addressed to us, template-utf8
  } catch (e) {
    do_throw("Didn't reply properly to a message addressed to us! " + e);
  }
});

// Test that a reply is NOT even tried when the message has no From.
add_task(async function testReplyingToMailWithNoFrom() {
  try {
    await testReply(2); // mail 2 has no From
    do_throw(
      "Shouldn't even have tried to reply reply to the message " +
        "with no From and no Reply-To"
    );
  } catch (e) {
    if (e.result != Cr.NS_ERROR_FAILURE) {
      throw e;
    }
  }
});

// Test reply with template.
async function testReply(aHrdIdx, aTemplateHdrIdx = 0) {
  const smtpServer = getBasicSmtpServer();
  smtpServer.port = gServer.port;

  const identity = getSmtpIdentity(kSender, smtpServer);
  localAccountUtils.msgAccount.addIdentity(identity);

  const msgHdr = mailTestUtils.getMsgHdrN(
    localAccountUtils.inboxFolder,
    aHrdIdx
  );
  info(
    "Msg#" +
      aHrdIdx +
      " author=" +
      msgHdr.author +
      ", recipients=" +
      msgHdr.recipients
  );
  const templateHdr = mailTestUtils.getMsgHdrN(
    gTemplateFolder,
    aTemplateHdrIdx
  );

  // See <method name="getTemplates"> in searchWidgets.xml
  const msgTemplateUri =
    gTemplateFolder.URI +
    "?messageId=" +
    templateHdr.messageId +
    "&subject=" +
    templateHdr.mime2DecodedSubject;
  MailServices.compose.replyWithTemplate(
    msgHdr,
    msgTemplateUri,
    null,
    localAccountUtils.incomingServer
  );

  await TestUtils.waitForCondition(() => gServer._daemon.post);
  const [headers, body] = MimeParser.extractHeadersAndBody(
    gServer._daemon.post
  );
  Assert.ok(headers.get("Subject").startsWith("Auto: "));
  Assert.equal(headers.get("Auto-submitted"), "auto-replied");
  Assert.equal(headers.get("In-Reply-To"), "<" + msgHdr.messageId + ">");
  Assert.equal(headers.get("References"), "<" + msgHdr.messageId + ">");
  // XXX: something's wrong with how the fake server gets the data.
  // The text gets converted to UTF-8 (regardless of what it is) at some point.
  // Suspect a bug with how BinaryInputStream handles the strings.
  if (templateHdr.charset == "windows-1252") {
    // XXX: should really check for "åäö xlatin1"
    if (!body.includes("Ã¥Ã¤Ã¶ xlatin1")) {
      // template-latin1 contains this
      do_throw(
        "latin1 body didn't go through!  hdr msgid=" +
          templateHdr.messageId +
          ", msgbody=" +
          body
      );
    }
  } else if (templateHdr.charset == "utf-8") {
    // XXX: should really check for "åäö xutf8"
    if (!body.includes("Ã¥Ã¤Ã¶ xutf8")) {
      // template-utf8 contains this
      do_throw(
        "utf8 body didn't go through! hdr msgid=" +
          templateHdr.messageId +
          ", msgbody=" +
          body
      );
    }
  } else if (templateHdr.charset) {
    do_throw(
      "unexpected msg charset: " +
        templateHdr.charset +
        ", hdr msgid=" +
        templateHdr.messageId
    );
  } else {
    do_throw("didn't find a msg charset! hdr msgid=" + templateHdr.messageId);
  }
  gServer.resetTest();
}

add_task(function teardown() {
  // fake server cleanup
  gServer.stop();
});
