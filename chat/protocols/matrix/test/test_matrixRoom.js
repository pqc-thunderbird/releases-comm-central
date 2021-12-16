/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { setTimeout, clearTimeout } = ChromeUtils.import(
  "resource://gre/modules/Timer.jsm"
);
var { EventType, MsgType } = ChromeUtils.import(
  "resource:///modules/matrix-sdk.jsm"
);

loadMatrix();

add_task(async function test_initRoom() {
  const roomStub = getRoom(true);
  equal(typeof roomStub._resolveInitializer, "function");
  ok(roomStub._initialized);
  await roomStub._initialized;
  roomStub.forget();
});

add_task(async function test_initRoom_withSpace() {
  const roomStub = getRoom(true, "#test:example.com", (target, key) => {
    if (key === "isSpaceRoom") {
      return () => true;
    }
    return null;
  });
  ok(roomStub._initialized);
  ok(roomStub.left);
  await roomStub._initialized;
  roomStub.forget();
});

add_task(function test_replaceRoom() {
  const roomStub = {
    __proto__: matrix.MatrixRoom.prototype,
    _resolveInitializer() {
      this.initialized = true;
    },
    _mostRecentEventId: "foo",
  };
  const newRoom = {};
  matrix.MatrixRoom.prototype.replaceRoom.call(roomStub, newRoom);
  strictEqual(roomStub._replacedBy, newRoom);
  ok(roomStub.initialized);
  equal(newRoom._mostRecentEventId, roomStub._mostRecentEventId);
});

add_task(async function test_waitForRoom() {
  const roomStub = {
    _initialized: Promise.resolve(),
  };
  const awaitedRoom = await matrix.MatrixRoom.prototype.waitForRoom.call(
    roomStub
  );
  strictEqual(awaitedRoom, roomStub);
});

add_task(async function test_waitForRoomReplaced() {
  const roomStub = getRoom(true);
  const newRoom = {
    waitForRoom() {
      return Promise.resolve("success");
    },
  };
  matrix.MatrixRoom.prototype.replaceRoom.call(roomStub, newRoom);
  const awaitedRoom = await matrix.MatrixRoom.prototype.waitForRoom.call(
    roomStub
  );
  equal(awaitedRoom, "success");
  roomStub.forget();
});

add_task(function test_addEventRedacted() {
  const event = makeEvent({
    sender: "@user:example.com",
    redacted: true,
    type: EventType.RoomMessage,
  });
  const roomStub = {};
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageIncoming() {
  const event = makeEvent({
    sender: "@user:example.com",
    content: {
      body: "foo",
      msgtype: MsgType.Text,
    },
    type: EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com/";
        },
      },
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageOutgoing() {
  const event = makeEvent({
    sender: "@test:example.com",
    content: {
      body: "foo",
      msgtype: MsgType.Text,
    },
    type: EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@test:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageEmote() {
  const event = makeEvent({
    sender: "@user:example.com",
    content: {
      body: "foo",
      msgtype: MsgType.Emote,
    },
    type: EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "/me foo");
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventMessageDelayed() {
  const event = makeEvent({
    sender: "@user:example.com",
    content: {
      body: "foo",
      msgtype: MsgType.Text,
    },
    type: EventType.RoomMessage,
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event, true);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.message, "foo");
  ok(!roomStub.options.system);
  ok(roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_addEventTopic() {
  const event = makeEvent({
    type: EventType.RoomTopic,
    id: 1,
    content: {
      topic: "foo bar",
    },
    sender: "@user:example.com",
  });
  const roomStub = {
    setTopic(topic, who) {
      this.who = who;
      this.topic = topic;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(roomStub.topic, "foo bar");
  equal(roomStub._mostRecentEventId, 1);
});

add_task(async function test_addEventTombstone() {
  const event = makeEvent({
    type: EventType.RoomTombstone,
    id: 1,
    content: {
      body: "updated room",
      replacement_room: "!new_room:example.com",
    },
    sender: "@test:example.com",
  });
  const conversation = getRoom(true);
  const newText = waitForNotification(conversation, "new-text");
  conversation.addEvent(event);
  const { subject: message } = await newText;
  const newConversation = await conversation.waitForRoom();
  equal(newConversation.normalizedName, event.getContent().replacement_room);
  equal(message.who, event.getSender());
  equal(message.message, event.getContent().body);
  ok(message.system);
  ok(message.incoming);
  ok(!conversation._account);
  newConversation.forget();
});

add_task(function test_forgetWith_close() {
  const roomList = new Map();
  const roomStub = {
    closeDm() {
      this.closeCalled = true;
    },
    _roomId: "foo",
    _account: {
      roomList,
    },
    // stubs for jsProtoHelper implementations
    addObserver() {},
    unInit() {},
  };
  roomList.set(roomStub._roomId, roomStub);
  Services.conversations.addConversation(roomStub);

  matrix.MatrixRoom.prototype.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
  ok(roomStub.closeCalled);
});

add_task(function test_forgetWithout_close() {
  const roomList = new Map();
  const roomStub = {
    isChat: true,
    _roomId: "foo",
    _account: {
      roomList,
    },
    // stubs for jsProtoHelper implementations
    addObserver() {},
    unInit() {},
  };
  roomList.set(roomStub._roomId, roomStub);
  Services.conversations.addConversation(roomStub);

  matrix.MatrixRoom.prototype.forget.call(roomStub);
  ok(!roomList.has(roomStub._roomId));
});

add_task(function test_close() {
  const roomStub = {
    forget() {
      this.forgetCalled = true;
    },
    cleanUpOutgoingVerificationRequests() {
      this.cleanUpCalled = true;
    },
    _roomId: "foo",
    _account: {
      _client: {
        leave(roomId) {
          roomStub.leftRoom = roomId;
        },
      },
    },
  };

  matrix.MatrixRoom.prototype.close.call(roomStub);
  equal(roomStub.leftRoom, roomStub._roomId);
  ok(roomStub.forgetCalled);
  ok(roomStub.cleanUpCalled);
});

add_task(function test_setTypingState() {
  const roomStub = getRoom(true, "foo", {
    sendTyping(roomId, isTyping) {
      roomStub.typingRoomId = roomId;
      roomStub.typing = isTyping;
      return Promise.resolve();
    },
  });

  roomStub._setTypingState(true);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);

  roomStub._setTypingState(false);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(!roomStub.typing);

  roomStub._setTypingState(true);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);

  roomStub._cleanUpTimers();
  roomStub.forget();
});

add_task(function test_setTypingStateDebounce() {
  const roomStub = getRoom(true, "foo", {
    sendTyping(roomId, isTyping) {
      roomStub.typingRoomId = roomId;
      roomStub.typing = isTyping;
      return Promise.resolve();
    },
  });

  roomStub._setTypingState(true);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);
  ok(roomStub._typingDebounce);

  roomStub.typing = false;

  roomStub._setTypingState(true);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(!roomStub.typing);
  ok(roomStub._typingDebounce);

  clearTimeout(roomStub._typingDebounce);
  roomStub._typingDebounce = null;

  roomStub._setTypingState(true);
  equal(roomStub.typingRoomId, roomStub._roomId);
  ok(roomStub.typing);

  roomStub._cleanUpTimers();
  roomStub.forget();
});

add_task(function test_cancelTypingTimer() {
  const roomStub = {
    _typingTimer: setTimeout(() => {}, 10000), // eslint-disable-line mozilla/no-arbitrary-setTimeout
  };
  matrix.MatrixRoom.prototype._cancelTypingTimer.call(roomStub);
  ok(!roomStub._typingTimer);
});

add_task(function test_cleanUpTimers() {
  const roomStub = getRoom(true);
  roomStub._typingTimer = setTimeout(() => {}, 10000); // eslint-disable-line mozilla/no-arbitrary-setTimeout
  roomStub._typingDebounce = setTimeout(() => {}, 1000); // eslint-disable-line mozilla/no-arbitrary-setTimeout
  roomStub._cleanUpTimers();
  ok(!roomStub._typingTimer);
  ok(!roomStub._typingDebounce);
  roomStub.forget();
});

add_task(function test_finishedComposing() {
  let typingState = true;
  const roomStub = {
    __proto__: matrix.MatrixRoom.prototype,
    shouldSendTypingNotifications: false,
    _roomId: "foo",
    _account: {
      _client: {
        sendTyping(roomId, state) {
          typingState = state;
          return Promise.resolve();
        },
      },
    },
  };

  matrix.MatrixRoom.prototype.finishedComposing.call(roomStub);
  ok(typingState);

  roomStub.shouldSendTypingNotifications = true;
  matrix.MatrixRoom.prototype.finishedComposing.call(roomStub);
  ok(!typingState);
});

add_task(function test_sendTyping() {
  let typingState = false;
  const roomStub = getRoom(true, "foo", {
    sendTyping(roomId, state) {
      typingState = state;
      return Promise.resolve();
    },
  });
  Services.prefs.setBoolPref("purple.conversations.im.send_typing", false);

  let result = roomStub.sendTyping("lorem ipsum");
  ok(!roomStub._typingTimer);
  equal(result, Ci.prplIConversation.NO_TYPING_LIMIT);
  ok(!typingState);

  Services.prefs.setBoolPref("purple.conversations.im.send_typing", true);
  result = roomStub.sendTyping("lorem ipsum");
  ok(roomStub._typingTimer);
  equal(result, Ci.prplIConversation.NO_TYPING_LIMIT);
  ok(typingState);

  result = roomStub.sendTyping("");
  ok(!roomStub._typingTimer);
  equal(result, Ci.prplIConversation.NO_TYPING_LIMIT);
  ok(!typingState);

  roomStub._cleanUpTimers();
  roomStub.forget();
});

add_task(function test_setInitialized() {
  const roomStub = {
    _resolveInitializer() {
      this.calledResolve = true;
    },
    joining: true,
  };
  matrix.MatrixRoom.prototype._setInitialized.call(roomStub);
  ok(roomStub.calledResolve);
  ok(!roomStub.joining);
});

add_task(function test_addEventSticker() {
  const date = new Date();
  const event = makeEvent({
    time: date,
    sender: "@user:example.com",
    type: EventType.Sticker,
    content: {
      body: "foo",
      url: "mxc://example.com/sticker.png",
    },
  });
  const roomStub = {
    _account: {
      userId: "@test:example.com",
      _client: {
        getHomeserverUrl() {
          return "https://example.com";
        },
      },
    },
    writeMessage(who, message, options) {
      this.who = who;
      this.message = message;
      this.options = options;
    },
  };
  matrix.MatrixRoom.prototype.addEvent.call(roomStub, event);
  equal(roomStub.who, "@user:example.com");
  equal(
    roomStub.message,
    "https://example.com/_matrix/media/r0/download/example.com/sticker.png"
  );
  ok(!roomStub.options.system);
  ok(!roomStub.options.delayed);
  equal(roomStub._mostRecentEventId, 0);
});

add_task(function test_sendMsg() {
  let isTyping = true;
  let message;
  const roomStub = getRoom(true, "#test:example.com", {
    sendTyping(roomId, typing) {
      equal(roomId, roomStub._roomId);
      isTyping = typing;
      return Promise.resolve();
    },
    sendTextMessage(roomId, threadId, msg) {
      equal(roomId, roomStub._roomId);
      equal(threadId, null);
      message = msg;
      return Promise.resolve();
    },
  });
  roomStub.sendMsg("foo bar");
  ok(!isTyping);
  equal(message, "foo bar");
  roomStub._cleanUpTimers();
  roomStub.forget();
});

add_task(function test_createMessage() {
  const time = Date.now();
  const event = makeEvent({
    type: EventType.RoomMessage,
    time,
    sender: "@foo:example.com",
  });
  const roomStub = getRoom(true, "#test:example.com", {
    getPushActionsForEvent(eventToProcess) {
      equal(eventToProcess, event);
      return {
        tweaks: {
          highlight: true,
        },
      };
    },
  });
  const message = roomStub.createMessage("@foo:example.com", "bar", {
    event,
  });
  equal(message.message, "bar");
  equal(message.who, "@foo:example.com");
  equal(message.conversation, roomStub);
  ok(!message.outgoing);
  ok(message.incoming);
  equal(message.alias, "foo bar");
  ok(!message.isEncrypted);
  ok(message.containsNick);
  equal(message.time, Math.floor(time / 1000));
  equal(message.iconURL, "https://example.com/avatar");
});

function waitForNotification(target, expectedTopic) {
  let promise = new Promise(resolve => {
    let observer = {
      observe(subject, topic, data) {
        if (topic === expectedTopic) {
          resolve({ subject, data });
          target.removeObserver(observer);
        }
      },
    };
    target.addObserver(observer);
  });
  return promise;
}
