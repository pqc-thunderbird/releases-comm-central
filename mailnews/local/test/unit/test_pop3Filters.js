/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let [daemon, server, handler] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Inject a message to the server and do a GetNewMail for the incomingServer.
 * @param {nsIPop3IncomingServer} incomingServer
 */
async function getNewMail(incomingServer) {
  daemon.setMessages(["message1.eml", "message3.eml"]);

  let urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  return urlListener.promise;
}

/**
 * Test DeleteFromPop3Server filter should send DELE for matched message.
 */
add_task(async function testDeleteFromPop3Server() {
  let incomingServer = createPop3ServerAndLocalFolders(server.port);
  // Turn on leaveMessagesOnServer, so that DELE would not be sent normally.
  incomingServer.leaveMessagesOnServer = true;

  // Create a DeleteFromPop3Server filter.
  let filterList = incomingServer.getFilterList(null);
  let filter = filterList.createFilter("deleteFromServer");

  let searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Subject;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  let value = searchTerm.value;
  value.str = "mail 2";
  searchTerm.value = value;
  filter.appendTerm(searchTerm);

  let action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.DeleteFromPop3Server;
  filter.appendAction(action);

  filter.enabled = true;
  filterList.insertFilterAt(0, filter);

  await getNewMail(incomingServer);
  do_check_transaction(server.playTransaction(), [
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "RETR 1", // message1.eml doesn't match the filter, no DELE.
    "RETR 2",
    "DELE 2", // message3.eml matches the filter, DELE was sent.
  ]);
});