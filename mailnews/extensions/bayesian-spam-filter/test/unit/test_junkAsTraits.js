/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// tests calls to the bayesian filter plugin to train, classify, and forget
// messages using both the older junk-oriented calls, as well as the newer
// trait-oriented calls. Only a single trait is tested. The main intent of
// these tests is to demonstrate that both the old junk-oriented calls and the
// new trait-oriented calls give the same results on junk processing.

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// local constants
var kUnclassified = MailServices.junk.UNCLASSIFIED;
var kJunk = MailServices.junk.JUNK;
var kGood = MailServices.junk.GOOD;
var kJunkTrait = MailServices.junk.JUNK_TRAIT;
var kGoodTrait = MailServices.junk.GOOD_TRAIT;
var kIsHamScore = MailServices.junk.IS_HAM_SCORE;
var kIsSpamScore = MailServices.junk.IS_SPAM_SCORE;

// command functions for test data
var kTrainJ = 0; // train using junk method
var kTrainT = 1; // train using trait method
var kClassJ = 2; // classify using junk method
var kClassT = 3; // classify using trait method
var kForgetJ = 4; // forget training using junk method
var kForgetT = 5; // forget training using trait method
var kCounts = 6; // test token and message counts

var gProArray = [],
  gAntiArray = []; // traits arrays, pro is junk, anti is good
var gTest; // currently active test

// The tests array defines the tests to attempt. Format of
// an element "test" of this array (except for kCounts):
//
//   test.command: function to perform, see definitions above
//   test.fileName: file containing message to test
//   test.junkPercent: sets the classification (for Class or Forget commands)
//                     tests the classification (for Class commands)
//                     As a special case for the no-training tests, if
//                     junkPercent is negative, test its absolute value
//                     for percents, but reverse the junk/good classification
//   test.traitListener: should we use the trait listener call?
//   test.junkListener: should we use the junk listener call?

var tests = [
  // test the trait-based calls. We mix trait listeners, junk listeners,
  // and both

  {
    // with no training, percents is 50 - but classifies as junk
    command: kClassT,
    fileName: "ham1.eml",
    junkPercent: -50, // negative means classifies as junk
    traitListener: false,
    junkListener: true,
  },
  {
    // train 1 ham message
    command: kTrainT,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    // with ham but no spam training, percents are 0 and classifies as ham
    command: kClassT,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    // train 1 spam message
    command: kTrainT,
    fileName: "spam1.eml",
    junkPercent: 100,
    traitListener: true,
    junkListener: false,
  },
  {
    // the trained messages will classify at 0 and 100
    command: kClassT,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassT,
    fileName: "spam1.eml",
    junkPercent: 100,
    traitListener: true,
    junkListener: false,
  },
  {
    // ham2, spam2, spam4 give partial percents, but still ham
    command: kClassT,
    fileName: "ham2.eml",
    junkPercent: 8,
    traitListener: true,
    junkListener: true,
  },
  {
    command: kClassT,
    fileName: "spam2.eml",
    junkPercent: 81,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassT,
    fileName: "spam4.eml",
    junkPercent: 81,
    traitListener: true,
    junkListener: false,
  },
  {
    // spam3 evaluates to spam
    command: kClassT,
    fileName: "spam3.eml",
    junkPercent: 98,
    traitListener: true,
    junkListener: true,
  },
  {
    // train ham2, then test percents of 0 (clearly good)
    command: kTrainT,
    fileName: "ham2.eml",
    junkPercent: 0,
    traitListener: true,
    junkListener: true,
  },
  {
    command: kClassT,
    fileName: "ham2.eml",
    junkPercent: 0,
    traitListener: true,
    junkListener: true,
  },
  {
    // forget ham2, percents should return to partial value
    command: kForgetT,
    fileName: "ham2.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassT,
    fileName: "ham2.eml",
    junkPercent: 8,
    traitListener: true,
    junkListener: true,
  },
  {
    // train, classify, forget, reclassify spam4
    command: kTrainT,
    fileName: "spam4.eml",
    junkPercent: 100,
    traitListener: true,
    junkListener: true,
  },
  {
    command: kClassT,
    fileName: "spam4.eml",
    junkPercent: 100,
    traitListener: true,
    junkListener: true,
  },
  {
    command: kCounts,
    tokenCount: 66, // count of tokens in the corpus
    junkCount: 2, // count of junk messages in the corpus
    goodCount: 1, // count of good messages in the corpus
  },
  {
    command: kForgetT,
    fileName: "spam4.eml",
    junkPercent: 100,
    traitListener: true,
    junkListener: false,
  },
  {
    command: kClassT,
    fileName: "spam4.eml",
    junkPercent: 81,
    traitListener: true,
    junkListener: true,
  },
  {
    // forget ham1 and spam1 to empty training
    command: kForgetT,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: true,
    junkListener: true,
  },
  {
    command: kForgetT,
    fileName: "spam1.eml",
    junkPercent: 100,
    traitListener: true,
    junkListener: true,
  },
  // repeat the whole sequence using the junk calls
  {
    // train 1 ham and 1 spam message
    command: kTrainJ,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kTrainJ,
    fileName: "spam1.eml",
    junkPercent: 100,
    traitListener: false,
    junkListener: true,
  },
  {
    // the trained messages will classify at 0 and 100
    command: kClassJ,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "spam1.eml",
    junkPercent: 100,
    traitListener: false,
    junkListener: true,
  },
  {
    // ham2, spam2, spam4 give partial percents, but still ham
    command: kClassJ,
    fileName: "ham2.eml",
    junkPercent: 8,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "spam2.eml",
    junkPercent: 81,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "spam4.eml",
    junkPercent: 81,
    traitListener: false,
    junkListener: true,
  },
  {
    // spam3 evaluates to spam
    command: kClassJ,
    fileName: "spam3.eml",
    junkPercent: 98,
    traitListener: false,
    junkListener: true,
  },
  {
    // train ham2, then test percents of 0 (clearly good)
    command: kTrainJ,
    fileName: "ham2.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "ham2.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    // forget ham2, percents should return to partial value
    command: kForgetJ,
    fileName: "ham2.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "ham2.eml",
    junkPercent: 8,
    traitListener: false,
    junkListener: true,
  },
  {
    // train, classify, forget, reclassify spam4
    command: kTrainJ,
    fileName: "spam4.eml",
    junkPercent: 100,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "spam4.eml",
    junkPercent: 100,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kForgetJ,
    fileName: "spam4.eml",
    junkPercent: 100,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kClassJ,
    fileName: "spam4.eml",
    junkPercent: 81,
    traitListener: false,
    junkListener: true,
  },
  {
    // forget ham1 and spam1 to be empty
    command: kForgetJ,
    fileName: "ham1.eml",
    junkPercent: 0,
    traitListener: false,
    junkListener: true,
  },
  {
    command: kForgetJ,
    fileName: "spam1.eml",
    junkPercent: 100,
    traitListener: false,
    junkListener: true,
  },
];

// main test
function run_test() {
  localAccountUtils.loadLocalMailAccount();
  do_test_pending();

  // setup pro/anti arrays as junk/good
  gProArray.push(kJunkTrait);
  gAntiArray.push(kGoodTrait);

  startCommand();
}

var junkListener = {
  // nsIJunkMailClassificationListener implementation
  onMessageClassified(aMsgURI, aClassification, aJunkPercent) {
    if (!aMsgURI) {
      // Ignore end-of-batch signal.
      return;
    }
    // print("Message URI is " + aMsgURI);
    // print("Junk percent is " + aJunkPercent);
    // print("Classification is " + aClassification);
    var command = gTest.command;
    var junkPercent = gTest.junkPercent;
    // file returned correctly
    Assert.equal(getSpec(gTest.fileName), aMsgURI);

    // checks of aClassification

    // forget returns unclassified
    if (command == kForgetJ || command == kForgetT) {
      Assert.equal(aClassification, kUnclassified);
    } else {
      // classification or train should return an actual classification
      // check junk classification set by default cutoff of 90
      var isGood = Math.abs(junkPercent) < 90;
      if (junkPercent < 0) {
        isGood = !isGood;
      }
      Assert.equal(aClassification, isGood ? kGood : kJunk);
    }

    // checks of aJunkPercent

    if (command == kClassJ || command == kClassT) {
      // classify returns the actual junk percents
      Assert.equal(Math.abs(junkPercent), aJunkPercent);
    } else if (command == kTrainJ || command == kTrainT) {
      // train returns the ham and spam limits
      Assert.equal(aJunkPercent, junkPercent < 90 ? kIsHamScore : kIsSpamScore);
    } else {
      // Forget always returns 0.
      Assert.equal(aJunkPercent, 0);
    }

    // if the current test includes a trait listener, it will
    // run next, so we defer to it for starting the next command
    if (gTest.traitListener) {
      return;
    }
    startCommand();
  },
};

var traitListener = {
  // nsIMsgTraitClassificationListener implementation
  onMessageTraitsClassified(aMsgURI, aTraits, aPercents) {
    if (!aMsgURI) {
      // Ignore end-of-batch signal.
      return;
    }
    // print("(Trait Listener)Message URI is " + aMsgURI);
    // print("(Trait Listener)Junk percent is " + aPercents);
    var command = gTest.command;
    var junkPercent = gTest.junkPercent;
    // print("command, junkPercent is " + command + " , " + junkPercent);

    Assert.equal(getSpec(gTest.fileName), aMsgURI);

    // checks of aPercents

    if (command == kForgetJ || command == kForgetT) {
      // "forgets" with null newClassifications does not return a percent
      Assert.equal(aPercents.length, 0);
    } else {
      var percent = aPercents[0];
      // print("Percent is " + percent);
      if (command == kClassJ || command == kClassT) {
        // Classify returns actual percents
        Assert.equal(percent, junkPercent);
      } else {
        // Train simply returns 100.
        Assert.equal(percent, 100);
      }
    }

    // checks of aTraits

    if (command == kForgetJ || command == kForgetT) {
      // "forgets" with null newClassifications does not return a
      // classification
      Assert.equal(aTraits.length, 0);
    } else if (command == kClassJ || command == kClassT) {
      // classification just returns the tested "Pro" trait (junk)
      const trait = aTraits[0];
      Assert.equal(trait, kJunkTrait);
    } else {
      // training returns the actual trait trained
      const trait = aTraits[0];
      Assert.equal(trait, junkPercent < 90 ? kGoodTrait : kJunkTrait);
    }

    // All done, start the next test
    startCommand();
  },
};

// start the next test command
function startCommand() {
  if (!tests.length) {
    // Do we have more commands?
    // no, all done
    do_test_finished();
    return;
  }

  gTest = tests.shift();
  print(
    "StartCommand command = " +
      gTest.command +
      ", remaining tests " +
      tests.length
  );
  var command = gTest.command;
  var junkPercent = gTest.junkPercent;
  var fileName = gTest.fileName;
  var tListener = gTest.traitListener;
  var jListener = gTest.junkListener;
  switch (command) {
    case kTrainJ:
      // train message using junk call
      MailServices.junk.setMessageClassification(
        getSpec(fileName), // in string aMsgURI
        null, // in nsMsgJunkStatus aOldUserClassification
        junkPercent == kIsHamScore ? kGood : kJunk, // in nsMsgJunkStatus aNewClassification
        null, // in nsIMsgWindow aMsgWindow
        junkListener
      ); // in nsIJunkMailClassificationListener aListener);
      break;

    case kTrainT:
      // train message using trait call
      MailServices.junk.setMsgTraitClassification(
        getSpec(fileName), // aMsgURI
        [], // aOldTraits
        junkPercent == kIsSpamScore ? gProArray : gAntiArray, // aNewTraits
        tListener ? traitListener : null, // aTraitListener
        null, // aMsgWindow
        jListener ? junkListener : null
      );
      break;

    case kClassJ:
      // classify message using junk call
      MailServices.junk.classifyMessage(
        getSpec(fileName), // in string aMsgURI
        null, // in nsIMsgWindow aMsgWindow
        junkListener
      ); // in nsIJunkMailClassificationListener aListener
      break;

    case kClassT:
      // classify message using trait call
      MailServices.junk.classifyTraitsInMessage(
        getSpec(fileName), // in string aMsgURI
        gProArray, // in array aProTraits,
        gAntiArray, // in array aAntiTraits
        tListener ? traitListener : null, // in nsIMsgTraitClassificationListener aTraitListener
        null, // in nsIMsgWindow aMsgWindow
        jListener ? junkListener : null
      ); // in nsIJunkMailClassificationListener aJunkListener
      break;

    case kForgetJ:
      // forget message using junk call
      MailServices.junk.setMessageClassification(
        getSpec(fileName), // in string aMsgURI
        junkPercent == kIsHamScore ? kGood : kJunk, // in nsMsgJunkStatus aOldUserClassification
        null, // in nsMsgJunkStatus aNewClassification,
        null, // in nsIMsgWindow aMsgWindow,
        junkListener
      ); // in nsIJunkMailClassificationListener aListener
      break;

    case kForgetT:
      // forget message using trait call
      MailServices.junk.setMsgTraitClassification(
        getSpec(fileName), // in string aMsgURI
        junkPercent == kIsSpamScore ? gProArray : gAntiArray, // in array aOldTraits
        [], // in array aNewTraits
        tListener ? traitListener : null, // in nsIMsgTraitClassificationListener aTraitListener
        null, // in nsIMsgWindow aMsgWindow
        jListener ? junkListener : null
      ); // in nsIJunkMailClassificationListener aJunkListener
      break;

    case kCounts:
      // test counts
      const msgCount = {};
      const nsIMsgCorpus = MailServices.junk.QueryInterface(Ci.nsIMsgCorpus);
      const tokenCount = nsIMsgCorpus.corpusCounts(null, {});
      nsIMsgCorpus.corpusCounts(kJunkTrait, msgCount);
      const junkCount = msgCount.value;
      nsIMsgCorpus.corpusCounts(kGoodTrait, msgCount);
      const goodCount = msgCount.value;
      print(
        "tokenCount, junkCount, goodCount is " + tokenCount,
        junkCount,
        goodCount
      );
      Assert.equal(tokenCount, gTest.tokenCount);
      Assert.equal(junkCount, gTest.junkCount);
      Assert.equal(goodCount, gTest.goodCount);
      do_timeout(0, startCommand);
      break;
  }
}
