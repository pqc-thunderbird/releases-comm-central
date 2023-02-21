/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Functions use for junk processing commands
 */

/*
 * TODO: These functions make the false assumption that a view only contains
 *       a single folder. This is not true for XF saved searches.
 *
 * globals prerequisites used:
 *
 *   window.MsgStatusFeedback
 */

/* globals gDBView, gViewWrapper, commandController */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
ChromeUtils.defineModuleGetter(
  this,
  "MailUtils",
  "resource:///modules/MailUtils.jsm"
);

/*
 * determineActionsForJunkMsgs
 *
 * Determines the actions that should be carried out on the messages
 * that are being marked as junk
 *
 * @param aFolder
 *        the folder with messages being marked as junk
 *
 * @return an object with two properties: 'markRead' (boolean) indicating
 *         whether the messages should be marked as read, and 'junkTargetFolder'
 *         (nsIMsgFolder) specifying where the messages should be moved, or
 *         null if they should not be moved.
 */
function determineActionsForJunkMsgs(aFolder) {
  var actions = { markRead: false, junkTargetFolder: null };
  var spamSettings = aFolder.server.spamSettings;

  // note we will do moves/marking as read even if the spam
  // feature is disabled, since the user has asked to use it
  // despite the disabling

  actions.markRead = spamSettings.markAsReadOnSpam;
  actions.junkTargetFolder = null;

  // move only when the corresponding setting is activated
  // and the currently viewed folder is not the junk folder.
  if (spamSettings.moveOnSpam && !aFolder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
    var spamFolderURI = spamSettings.spamFolderURI;
    if (!spamFolderURI) {
      // XXX TODO
      // we should use nsIPromptService to inform the user of the problem,
      // e.g. when the junk folder was accidentally deleted.
      dump("determineActionsForJunkMsgs: no spam folder found, not moving.");
    } else {
      actions.junkTargetFolder = MailUtils.getOrCreateFolder(spamFolderURI);
    }
  }

  return actions;
}

/**
 * performActionsOnJunkMsgs
 *
 * Performs required operations on a list of newly-classified junk messages
 *
 * @param {nsIMsgFolder} aFolder - The folder with messages being marked as
 *                                 junk.
 * @param {Array.<nsIMsgDBHdr>} aJunkMsgHdrs - New junk messages.
 * @param {Array.<nsIMsgDBHdr>} aGoodMsgHdrs - New good messages.
 */
function performActionsOnJunkMsgs(aFolder, aJunkMsgHdrs, aGoodMsgHdrs) {
  if (aFolder instanceof Ci.nsIMsgImapMailFolder) {
    // need to update IMAP custom flags
    if (aJunkMsgHdrs.length) {
      let junkMsgKeys = aJunkMsgHdrs.map(hdr => hdr.messageKey);
      aFolder.storeCustomKeywords(null, "Junk", "NonJunk", junkMsgKeys);
    }

    if (aGoodMsgHdrs.length) {
      let goodMsgKeys = aGoodMsgHdrs.map(hdr => hdr.messageKey);
      aFolder.storeCustomKeywords(null, "NonJunk", "Junk", goodMsgKeys);
    }
  }

  if (aJunkMsgHdrs.length) {
    var actionParams = determineActionsForJunkMsgs(aFolder);
    if (actionParams.markRead) {
      aFolder.markMessagesRead(aJunkMsgHdrs, true);
    }

    if (actionParams.junkTargetFolder) {
      MailServices.copy.copyMessages(
        aFolder,
        aJunkMsgHdrs,
        actionParams.junkTargetFolder,
        true /* isMove */,
        null,
        top.msgWindow,
        true /* allow undo */
      );
    }
  }
}

/**
 * MessageClassifier
 *
 * Helper object storing the list of pending messages to process,
 * and implementing junk processing callback
 *
 * @param aFolder
 *        the folder with messages to be analyzed for junk
 * @param aTotalMessages
 *        Number of messages to process, used for progress report only
 */

function MessageClassifier(aFolder, aTotalMessages) {
  this.mFolder = aFolder;
  this.mJunkMsgHdrs = [];
  this.mGoodMsgHdrs = [];
  this.mMessages = {};
  this.mMessageQueue = [];
  this.mTotalMessages = aTotalMessages;
  this.mProcessedMessages = 0;
  this.firstMessage = true;
  this.lastStatusTime = Date.now();
}

MessageClassifier.prototype = {
  /**
   * analyzeMessage
   *
   * Starts the message classification process for a message. If the message
   * sender's address is whitelisted, the message is skipped.
   *
   * @param aMsgHdr
   *        The header (nsIMsgDBHdr) of the message to classify.
   * @param aSpamSettings
   *        nsISpamSettings object with information about whitelists
   */
  analyzeMessage(aMsgHdr, aSpamSettings) {
    var junkscoreorigin = aMsgHdr.getStringProperty("junkscoreorigin");
    if (junkscoreorigin == "user") {
      // don't override user-set junk status
      return;
    }

    // check whitelisting
    if (aSpamSettings.checkWhiteList(aMsgHdr)) {
      // message is ham from whitelist
      var db = aMsgHdr.folder.msgDatabase;
      db.setStringProperty(
        aMsgHdr.messageKey,
        "junkscore",
        Ci.nsIJunkMailPlugin.IS_HAM_SCORE
      );
      db.setStringProperty(aMsgHdr.messageKey, "junkscoreorigin", "whitelist");
      this.mGoodMsgHdrs.push(aMsgHdr);
      return;
    }

    let messageURI = aMsgHdr.folder.generateMessageURI(aMsgHdr.messageKey);
    this.mMessages[messageURI] = aMsgHdr;
    if (this.firstMessage) {
      this.firstMessage = false;
      MailServices.junk.classifyMessage(messageURI, top.msgWindow, this);
    } else {
      this.mMessageQueue.push(messageURI);
    }
  },

  /*
   * nsIJunkMailClassificationListener implementation
   * onMessageClassified
   *
   * Callback function from nsIJunkMailPlugin with classification results
   *
   * @param aClassifiedMsgURI
   *        URI of classified message
   * @param aClassification
   *        Junk classification (0: UNCLASSIFIED, 1: GOOD, 2: JUNK)
   * @param aJunkPercent
   *        0 - 100 indicator of junk likelihood, with 100 meaning probably junk
   */
  onMessageClassified(aClassifiedMsgURI, aClassification, aJunkPercent) {
    if (!aClassifiedMsgURI) {
      // Ignore end of batch.
      return;
    }
    var nsIJunkMailPlugin = Ci.nsIJunkMailPlugin;
    var score =
      aClassification == nsIJunkMailPlugin.JUNK
        ? nsIJunkMailPlugin.IS_SPAM_SCORE
        : nsIJunkMailPlugin.IS_HAM_SCORE;
    const statusDisplayInterval = 1000; // milliseconds between status updates

    // set these props via the db (instead of the message header
    // directly) so that the nsMsgDBView knows to update the UI
    //
    var msgHdr = this.mMessages[aClassifiedMsgURI];
    var db = msgHdr.folder.msgDatabase;
    db.setStringProperty(msgHdr.messageKey, "junkscore", score);
    db.setStringProperty(msgHdr.messageKey, "junkscoreorigin", "plugin");
    db.setStringProperty(msgHdr.messageKey, "junkpercent", aJunkPercent);

    if (aClassification == nsIJunkMailPlugin.JUNK) {
      this.mJunkMsgHdrs.push(msgHdr);
    } else if (aClassification == nsIJunkMailPlugin.GOOD) {
      this.mGoodMsgHdrs.push(msgHdr);
    }

    var nextMsgURI = this.mMessageQueue.shift();
    if (nextMsgURI) {
      ++this.mProcessedMessages;
      if (Date.now() > this.lastStatusTime + statusDisplayInterval) {
        this.lastStatusTime = Date.now();
        var percentDone = 0;
        if (this.mTotalMessages) {
          percentDone = Math.round(
            (this.mProcessedMessages * 100) / this.mTotalMessages
          );
        }
        var percentStr = percentDone + "%";
        window.MsgStatusFeedback.showStatusString(
          document
            .getElementById("bundle_messenger")
            .getFormattedString("junkAnalysisPercentComplete", [percentStr])
        );
      }

      MailServices.junk.classifyMessage(nextMsgURI, top.msgWindow, this);
    } else {
      window.MsgStatusFeedback.showStatusString(
        document
          .getElementById("bundle_messenger")
          .getString("processingJunkMessages")
      );
      performActionsOnJunkMsgs(
        this.mFolder,
        this.mJunkMsgHdrs,
        this.mGoodMsgHdrs
      );
      window.MsgStatusFeedback.showStatusString("");
    }
  },
};

/*
 * filterFolderForJunk
 *
 * Filter all messages in the current folder for junk
 */
function filterFolderForJunk() {
  processFolderForJunk(true);
}

/*
 * analyzeMessagesForJunk
 *
 * Filter selected messages in the current folder for junk
 */
function analyzeMessagesForJunk() {
  processFolderForJunk(false);
}

/*
 * processFolderForJunk
 *
 * Filter messages in the current folder for junk
 *
 * @param aAll: true to filter all messages, else filter selection
 */
function processFolderForJunk(aAll) {
  let indices;
  if (aAll) {
    // need to expand all threads, so we analyze everything
    gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    var treeView = gDBView.QueryInterface(Ci.nsITreeView);
    var count = treeView.rowCount;
    if (!count) {
      return;
    }
  } else {
    indices =
      AppConstants.MOZ_APP_NAME == "seamonkey"
        ? window.GetSelectedIndices(gDBView)
        : window.threadTree?.selectedIndices;
    if (!indices || !indices.length) {
      return;
    }
  }
  let totalMessages = aAll ? count : indices.length;

  // retrieve server and its spam settings via the header of an arbitrary message
  let tmpMsgURI;
  for (let i = 0; i < totalMessages; i++) {
    let index = aAll ? i : indices[i];
    try {
      tmpMsgURI = gDBView.getURIForViewIndex(index);
      break;
    } catch (e) {
      // dummy headers will fail, so look for another
      continue;
    }
  }
  if (!tmpMsgURI) {
    return;
  }

  let tmpMsgHdr = MailServices.messageServiceFromURI(
    tmpMsgURI
  ).messageURIToMsgHdr(tmpMsgURI);
  let spamSettings = tmpMsgHdr.folder.server.spamSettings;

  // create a classifier instance to classify messages in the folder.
  let msgClassifier = new MessageClassifier(tmpMsgHdr.folder, totalMessages);

  for (let i = 0; i < totalMessages; i++) {
    let index = aAll ? i : indices[i];
    try {
      let msgURI = gDBView.getURIForViewIndex(index);
      let msgHdr = MailServices.messageServiceFromURI(
        msgURI
      ).messageURIToMsgHdr(msgURI);
      msgClassifier.analyzeMessage(msgHdr, spamSettings);
    } catch (ex) {
      // blow off errors here - dummy headers will fail
    }
  }
  if (msgClassifier.firstMessage) {
    // the async plugin was not used, maybe all whitelisted?
    performActionsOnJunkMsgs(
      msgClassifier.mFolder,
      msgClassifier.mJunkMsgHdrs,
      msgClassifier.mGoodMsgHdrs
    );
  }
}

/**
 * Delete junk messages in the current folder. This provides the guarantee that
 * the method will be synchronous if no messages are deleted.
 *
 * @returns {integer} The number of messages deleted.
 */
function deleteJunkInFolder() {
  // use direct folder commands if possible so we don't mess with the selection
  let selectedFolder = gViewWrapper.displayedFolder;
  if (!selectedFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    let junkMsgHdrs = [];
    for (let msgHdr of gDBView.msgFolder.messages) {
      let junkScore = msgHdr.getStringProperty("junkscore");
      if (junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE) {
        junkMsgHdrs.push(msgHdr);
      }
    }

    if (junkMsgHdrs.length) {
      gDBView.msgFolder.deleteMessages(
        junkMsgHdrs,
        top.msgWindow,
        false,
        false,
        null,
        true
      );
    }
    return junkMsgHdrs.length;
  }

  // Folder is virtual, let the view do the work (but we lose selection)

  // need to expand all threads, so we find everything
  gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);

  var treeView = gDBView.QueryInterface(Ci.nsITreeView);
  var count = treeView.rowCount;
  if (!count) {
    return 0;
  }

  var treeSelection = treeView.selection;

  var clearedSelection = false;

  // select the junk messages
  var messageUri;
  let numMessagesDeleted = 0;
  for (let i = 0; i < count; ++i) {
    try {
      messageUri = gDBView.getURIForViewIndex(i);
    } catch (ex) {
      continue; // blow off errors for dummy rows
    }
    let msgHdr = MailServices.messageServiceFromURI(
      messageUri
    ).messageURIToMsgHdr(messageUri);
    let junkScore = msgHdr.getStringProperty("junkscore");
    var isJunk = junkScore == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;
    // if the message is junk, select it.
    if (isJunk) {
      // only do this once
      if (!clearedSelection) {
        // clear the current selection
        // since we will be deleting all selected messages
        treeSelection.clearSelection();
        clearedSelection = true;
        treeSelection.selectEventsSuppressed = true;
      }
      treeSelection.rangedSelect(i, i, true /* augment */);
      numMessagesDeleted++;
    }
  }

  // if we didn't clear the selection
  // there was no junk, so bail.
  if (!clearedSelection) {
    return 0;
  }

  treeSelection.selectEventsSuppressed = false;
  // delete the selected messages
  //
  // We'll leave no selection after the delete
  if ("gNextMessageViewIndexAfterDelete" in window) {
    window.gNextMessageViewIndexAfterDelete = 0xffffffff; // nsMsgViewIndex_None
  }
  gDBView.doCommand(Ci.nsMsgViewCommandType.deleteMsg);
  treeSelection.clearSelection();
  return numMessagesDeleted;
}
