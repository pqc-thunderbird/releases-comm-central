"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GroupCallEventHandlerEvent = exports.GroupCallEventHandler = void 0;
var _client = require("../client");
var _groupCall = require("./groupCall");
var _roomState = require("../models/room-state");
var _logger = require("../logger");
var _event = require("../@types/event");
var _sync = require("../sync");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
let GroupCallEventHandlerEvent;
exports.GroupCallEventHandlerEvent = GroupCallEventHandlerEvent;
(function (GroupCallEventHandlerEvent) {
  GroupCallEventHandlerEvent["Incoming"] = "GroupCall.incoming";
  GroupCallEventHandlerEvent["Outgoing"] = "GroupCall.outgoing";
  GroupCallEventHandlerEvent["Ended"] = "GroupCall.ended";
  GroupCallEventHandlerEvent["Participants"] = "GroupCall.participants";
})(GroupCallEventHandlerEvent || (exports.GroupCallEventHandlerEvent = GroupCallEventHandlerEvent = {}));
class GroupCallEventHandler {
  // roomId -> GroupCall

  // All rooms we know about and whether we've seen a 'Room' event
  // for them. The promise will be fulfilled once we've processed that
  // event which means we're "up to date" on what calls are in a room
  // and get

  constructor(client) {
    this.client = client;
    _defineProperty(this, "groupCalls", new Map());
    _defineProperty(this, "roomDeferreds", new Map());
    _defineProperty(this, "onRoomsChanged", room => {
      this.createGroupCallForRoom(room);
    });
    _defineProperty(this, "onRoomStateChanged", (event, state) => {
      const eventType = event.getType();
      if (eventType === _event.EventType.GroupCallPrefix) {
        const groupCallId = event.getStateKey();
        const content = event.getContent();
        const currentGroupCall = this.groupCalls.get(state.roomId);
        if (!currentGroupCall && !content["m.terminated"]) {
          this.createGroupCallFromRoomStateEvent(event);
        } else if (currentGroupCall && currentGroupCall.groupCallId === groupCallId) {
          if (content["m.terminated"]) {
            currentGroupCall.terminate(false);
          } else if (content["m.type"] !== currentGroupCall.type) {
            // TODO: Handle the callType changing when the room state changes
            _logger.logger.warn(`GroupCallEventHandler onRoomStateChanged() currently does not support changing type (roomId=${state.roomId})`);
          }
        } else if (currentGroupCall && currentGroupCall.groupCallId !== groupCallId) {
          // TODO: Handle new group calls and multiple group calls
          _logger.logger.warn(`GroupCallEventHandler onRoomStateChanged() currently does not support multiple calls (roomId=${state.roomId})`);
        }
      }
    });
  }
  async start() {
    // We wait until the client has started syncing for real.
    // This is because we only support one call at a time, and want
    // the latest. We therefore want the latest state of the room before
    // we create a group call for the room so we can be fairly sure that
    // the group call we create is really the latest one.
    if (this.client.getSyncState() !== _sync.SyncState.Syncing) {
      _logger.logger.debug("GroupCallEventHandler start() waiting for client to start syncing");
      await new Promise(resolve => {
        const onSync = () => {
          if (this.client.getSyncState() === _sync.SyncState.Syncing) {
            this.client.off(_client.ClientEvent.Sync, onSync);
            return resolve();
          }
        };
        this.client.on(_client.ClientEvent.Sync, onSync);
      });
    }
    const rooms = this.client.getRooms();
    for (const room of rooms) {
      this.createGroupCallForRoom(room);
    }
    this.client.on(_client.ClientEvent.Room, this.onRoomsChanged);
    this.client.on(_roomState.RoomStateEvent.Events, this.onRoomStateChanged);
  }
  stop() {
    this.client.removeListener(_roomState.RoomStateEvent.Events, this.onRoomStateChanged);
  }
  getRoomDeferred(roomId) {
    let deferred = this.roomDeferreds.get(roomId);
    if (deferred === undefined) {
      let resolveFunc;
      deferred = {
        prom: new Promise(resolve => {
          resolveFunc = resolve;
        })
      };
      deferred.resolve = resolveFunc;
      this.roomDeferreds.set(roomId, deferred);
    }
    return deferred;
  }
  waitUntilRoomReadyForGroupCalls(roomId) {
    return this.getRoomDeferred(roomId).prom;
  }
  getGroupCallById(groupCallId) {
    return [...this.groupCalls.values()].find(groupCall => groupCall.groupCallId === groupCallId);
  }
  createGroupCallForRoom(room) {
    const callEvents = room.currentState.getStateEvents(_event.EventType.GroupCallPrefix);
    const sortedCallEvents = callEvents.sort((a, b) => b.getTs() - a.getTs());
    for (const callEvent of sortedCallEvents) {
      const content = callEvent.getContent();
      if (content["m.terminated"]) {
        continue;
      }
      _logger.logger.debug(`GroupCallEventHandler createGroupCallForRoom() choosing group call from possible calls (stateKey=${callEvent.getStateKey()}, ts=${callEvent.getTs()}, roomId=${room.roomId}, numOfPossibleCalls=${callEvents.length})`);
      this.createGroupCallFromRoomStateEvent(callEvent);
      break;
    }
    _logger.logger.info(`GroupCallEventHandler createGroupCallForRoom() processed room (roomId=${room.roomId})`);
    this.getRoomDeferred(room.roomId).resolve();
  }
  createGroupCallFromRoomStateEvent(event) {
    const roomId = event.getRoomId();
    const content = event.getContent();
    const room = this.client.getRoom(roomId);
    if (!room) {
      _logger.logger.warn(`GroupCallEventHandler createGroupCallFromRoomStateEvent() couldn't find room for call (roomId=${roomId})`);
      return;
    }
    const groupCallId = event.getStateKey();
    const callType = content["m.type"];
    if (!Object.values(_groupCall.GroupCallType).includes(callType)) {
      _logger.logger.warn(`GroupCallEventHandler createGroupCallFromRoomStateEvent() received invalid call type (type=${callType}, roomId=${roomId})`);
      return;
    }
    const callIntent = content["m.intent"];
    if (!Object.values(_groupCall.GroupCallIntent).includes(callIntent)) {
      _logger.logger.warn(`Received invalid group call intent (type=${callType}, roomId=${roomId})`);
      return;
    }
    const isPtt = Boolean(content["io.element.ptt"]);
    let dataChannelOptions;
    if (content?.dataChannelsEnabled && content?.dataChannelOptions) {
      // Pull out just the dataChannelOptions we want to support.
      const {
        ordered,
        maxPacketLifeTime,
        maxRetransmits,
        protocol
      } = content.dataChannelOptions;
      dataChannelOptions = {
        ordered,
        maxPacketLifeTime,
        maxRetransmits,
        protocol
      };
    }
    const groupCall = new _groupCall.GroupCall(this.client, room, callType, isPtt, callIntent, groupCallId,
    // Because without Media section a WebRTC connection is not possible, so need a RTCDataChannel to set up a
    // no media WebRTC connection anyway.
    content?.dataChannelsEnabled || this.client.isVoipWithNoMediaAllowed, dataChannelOptions, this.client.isVoipWithNoMediaAllowed);
    this.groupCalls.set(room.roomId, groupCall);
    this.client.emit(GroupCallEventHandlerEvent.Incoming, groupCall);
    return groupCall;
  }
}
exports.GroupCallEventHandler = GroupCallEventHandler;