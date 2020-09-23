/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARNAME,
  CANVAS_BOX,
  EVENTPATH,
  EVENT_BOX,
  TIMEOUT_MODAL_DIALOG,
  checkAlarmIcon,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  goToDate,
  handleOccurrencePrompt,
  helpersForController,
  invokeNewEventDialog,
  invokeViewingEventDialog,
  switchToView,
  viewBack,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { ATTENDEES_ROW, EVENT_TABPANELS, helpersForEditUI, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
});

var controller = mozmill.getMail3PaneController();
var { eid, lookup, lookupEventBox } = helpersForController(controller);

const EVENTTITLE = "Event";
const EVENTLOCATION = "Location";
const EVENTDESCRIPTION = "Event Description";
const EVENTATTENDEE = "foo@bar.com";
const EVENTURL = "http://mozilla.org/";
var firstDay;

add_task(async function testEventDialog() {
  let now = new Date();

  createCalendar(controller, CALENDARNAME);
  // Since from other tests we may be elsewhere, make sure we start today.
  switchToView(controller, "day");
  goToDate(controller, now.getFullYear(), now.getMonth() + 1, now.getDate());
  viewBack(controller, 1);

  // Open month view.
  switchToView(controller, "month");
  firstDay = controller.window.currentView().startDay;
  dump(`First day in view is: ${firstDay.year}-${firstDay.month + 1}-${firstDay.day}\n`);

  // Setup start- & endTime.
  // Next full hour except last hour of the day.
  let hour = now.getHours();
  let startHour = hour == 23 ? hour : (hour + 1) % 24;

  let nextHour = cal.dtz.now();
  nextHour.resetTo(firstDay.year, firstDay.month, firstDay.day, startHour, 0, 0, cal.dtz.floating);
  let startTime = cal.dtz.formatter.formatTime(nextHour);
  nextHour.resetTo(
    firstDay.year,
    firstDay.month,
    firstDay.day,
    (startHour + 1) % 24,
    0,
    0,
    cal.dtz.floating
  );
  let endTime = cal.dtz.formatter.formatTime(nextHour);

  // Create new event on first day in view.
  controller.click(lookupEventBox("month", CANVAS_BOX, 1, 1, null));
  controller.mainMenu.click("#calendar-new-event-menuitem");

  await invokeNewEventDialog(controller, null, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    let { eid: iframeId } = helpersForController(iframe);
    let { iframeLookup, getDateTimePicker } = helpersForEditUI(iframe);

    // First check all standard-values are set correctly.
    let startTimeInput = getDateTimePicker("STARTTIME");

    event.waitForElement(startTimeInput);
    event.assertValue(startTimeInput, startTime);

    // Check selected calendar.
    event.assertValue(iframeId("item-calendar"), CALENDARNAME);

    // Check standard title.
    let defTitle = cal.l10n.getAnyString("calendar", "calendar", "newEvent");
    event.assertJSProperty(eventid("item-title"), "placeholder", defTitle);

    // Prepare category.
    let categories = cal.l10n.getAnyString("calendar", "categories", "categories2");
    // Pick 4th value in a comma-separated list.
    let category = categories.split(",")[4];
    // Calculate date to repeat until.
    let untildate = firstDay.clone();
    untildate.addDuration(cal.createDuration("P20D"));

    // Fill in the rest of the values.
    await setData(event, iframe, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
      categories: [category],
      repeat: "daily",
      repeatuntil: cal.dtz.dateTimeToJsDate(untildate),
      reminder: "5minutes",
      privacy: "private",
      attachment: { add: EVENTURL },
      attendees: { add: EVENTATTENDEE },
    });

    // Verify attendee added.
    let attendeeLabel = iframeLookup(`
            ${ATTENDEES_ROW}/{"class":"item-attendees-cell"}/{"class":"item-attendees-cell-label"}
        `);

    event.click(eventid("event-grid-tab-attendees"));
    event.waitForElement(attendeeLabel);
    event.assertValue(attendeeLabel, EVENTATTENDEE);
    event.waitFor(() => !iframeId("notify-attendees-checkbox").getNode().checked);

    // Verify private label visible.
    event.waitFor(
      () =>
        !eventid("status-privacy-private-box")
          .getNode()
          .hasAttribute("collapsed")
    );
    eventid("event-privacy-menupopup")
      .getNode()
      .hidePopup();

    // Add attachment and verify added.
    event.click(iframeId("event-grid-tab-attachments"));
    event.assertNode(
      iframeLookup(`
            ${EVENT_TABPANELS}/id("event-grid-tabpanel-attachments")/{"flex":"1"}/
            id("attachment-link")/[0]/{"value":"mozilla.org"}
        `)
    );

    // save
    event.click(eventid("button-saveandclose"));
  });

  // Catch and dismiss alarm.
  plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
    let { eid: alarmid } = helpersForController(alarm);
    alarm.waitThenClick(alarmid("alarm-dismiss-all-button"));
    // The dialog will close itself if we wait long enough.
    alarm.sleep(500);
  });
  wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

  // Verify event and alarm icon visible until endDate (3 full rows) and check tooltip.
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      controller.waitForElement(lookupEventBox("month", CANVAS_BOX, row, col, null, EVENTPATH));
      checkAlarmIcon(controller, "month", row, col);
      checkTooltip(row, col, startTime, endTime);
    }
  }
  controller.assertNodeNotExist(lookupEventBox("month", EVENT_BOX, 4, 1, null, EVENTPATH));

  // Delete and verify deleted 6th col in row 1.
  controller.click(lookupEventBox("month", CANVAS_BOX, 1, 6, null, EVENTPATH));
  let elemToDelete = eid("month-view");
  handleOccurrencePrompt(controller, elemToDelete, "delete", false);
  controller.waitForElementNotPresent(lookupEventBox("month", CANVAS_BOX, 1, 6, null, EVENTPATH));

  // Verify all others still exist.
  for (let col = 1; col <= 5; col++) {
    controller.assertNode(lookupEventBox("month", CANVAS_BOX, 1, col, null, EVENTPATH));
  }
  controller.assertNode(lookupEventBox("month", CANVAS_BOX, 1, 7, null, EVENTPATH));

  for (let row = 2; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      controller.assertNode(lookupEventBox("month", CANVAS_BOX, row, col, null, EVENTPATH));
    }
  }

  // Delete series by deleting last item in row 1 and confirming to delete all.
  controller.click(lookupEventBox("month", CANVAS_BOX, 1, 7, null, EVENTPATH));
  elemToDelete = eid("month-view");
  handleOccurrencePrompt(controller, elemToDelete, "delete", true);

  // Verify all deleted.
  controller.waitForElementNotPresent(lookupEventBox("month", EVENT_BOX, 1, 5, null, EVENTPATH));
  controller.waitForElementNotPresent(lookupEventBox("month", CANVAS_BOX, 1, 6, null, EVENTPATH));
  controller.waitForElementNotPresent(lookupEventBox("month", CANVAS_BOX, 1, 7, null, EVENTPATH));

  for (let row = 2; row <= 3; row++) {
    for (let col = 1; col <= 7; col++) {
      controller.waitForElementNotPresent(
        lookupEventBox("month", CANVAS_BOX, row, col, null, EVENTPATH)
      );
    }
  }

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testOpenExistingEventDialog() {
  let now = new Date();

  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, now.getFullYear(), now.getMonth() + 1, now.getDate());

  let createBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
  let eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

  // Create a new event.
  await invokeNewEventDialog(controller, createBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    await setData(event, iframe, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
    });
    event.click(eventid("button-saveandclose"));
  });

  // Open the event in the summary dialog, it will fail if otherwise.
  await invokeViewingEventDialog(
    controller,
    eventBox,
    async event => {
      let { eid } = helpersForController(event);
      event.assertText(eid("calendar-item-summary-item-title"), EVENTTITLE);
      event.assertText(eid("calendar-item-summary-item-location"), EVENTLOCATION);
      controller.assertJSProperty(
        eid("calendar-item-summary-item-description"),
        "textContent",
        EVENTDESCRIPTION
      );
      event.keypress(null, "VK_ESCAPE", {});
    },
    "view"
  );

  Assert.ok(true, "Test ran to completion");
});

add_task(async function testEventReminderDisplay() {
  let calId = createCalendar(controller, CALENDARNAME);

  switchToView(controller, "day");
  goToDate(controller, 2020, 1, 1);

  let createBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);

  // Create an event without a reminder.
  await invokeNewEventDialog(controller, createBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    await setData(event, iframe, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
    });
    event.click(eventid("button-saveandclose"));
  });

  let eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  await invokeViewingEventDialog(
    controller,
    eventBox,
    async event => {
      let doc = event.window.document;
      let row = doc.querySelector(".reminder-row");
      Assert.ok(row.hidden, "reminder dropdown is not displayed");
      event.keypress(null, "VK_ESCAPE", {});
    },
    "view"
  );

  goToDate(controller, 2020, 2, 1);
  createBox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);

  // Create an event with a reminder.
  await invokeNewEventDialog(controller, createBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);
    await setData(event, iframe, {
      title: EVENTTITLE,
      location: EVENTLOCATION,
      description: EVENTDESCRIPTION,
      reminder: "1week",
    });
    event.click(eventid("button-saveandclose"));
  });

  eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);
  await invokeViewingEventDialog(
    controller,
    eventBox,
    async event => {
      let doc = event.window.document;
      let row = doc.querySelector(".reminder-row");

      Assert.ok(row.querySelector("menulist") == null, "reminder dropdown is not available");
      Assert.ok(
        row.textContent.includes("1 week before"),
        "the details are shown when a reminder is set"
      );
      event.keypress(null, "VK_ESCAPE", {});
    },
    "view"
  );

  // This is done so that calItemBase#isInvitation returns true.
  let calendar = cal.getCalendarManager().getCalendarById(calId);
  calendar.setProperty("organizerId", "mailto:pillow@example.com");

  // Create an invitation.
  let icalString =
    "BEGIN:VCALENDAR\r\n" +
    "PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN\r\n" +
    "VERSION:2.0\r\n" +
    "BEGIN:VEVENT\r\n" +
    "CREATED:20200301T152601Z\r\n" +
    "DTSTAMP:20200301T192729Z\r\n" +
    "UID:x137e\r\n" +
    "SUMMARY:Nap Time\r\n" +
    "ORGANIZER;CN=Papa Bois:mailto:papabois@example.com\r\n" +
    "ATTENDEE;RSVP=TRUE;CN=pillow@example.com;PARTSTAT=NEEDS-ACTION;CUTY\r\n" +
    " PE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;X-NUM-GUESTS=0:mailto:pillow@example.com\r\n" +
    "DTSTART:20200301T153000Z\r\n" +
    "DTEND:20200301T163000Z\r\n" +
    "DESCRIPTION:Slumber In Lumber\r\n" +
    "SEQUENCE:0\r\n" +
    "TRANSP:OPAQUE\r\n" +
    "BEGIN:VALARM\r\n" +
    "TRIGGER:-PT30M\r\n" +
    "REPEAT:2\r\n" +
    "DURATION:PT15M\r\n" +
    "ACTION:DISPLAY\r\n" +
    "END:VALARM\r\n" +
    "END:VEVENT\r\n" +
    "END:VCALENDAR\r\n";

  let calendarProxy = cal.async.promisifyCalendar(calendar);
  await calendarProxy.addItem(new CalEvent(icalString));
  goToDate(controller, 2020, 3, 1);
  eventBox = lookupEventBox("day", EVENT_BOX, null, 1, null, EVENTPATH);

  await invokeViewingEventDialog(
    controller,
    eventBox,
    async event => {
      let doc = event.window.document;
      let row = doc.querySelector(".reminder-row");

      Assert.ok(!row.hidden, "reminder row is displayed");
      Assert.ok(row.querySelector("menulist") != null, "reminder dropdown is available");
      event.keypress(null, "VK_ESCAPE", {});
    },
    "view"
  );
});

function checkTooltip(row, col, startTime, endTime) {
  let item = lookupEventBox("month", CANVAS_BOX, row, col, null, EVENTPATH);

  let toolTip = '/id("messengerWindow")/id("calendar-popupset")/id("itemTooltip")';
  let toolTipNode = lookup(toolTip).getNode();
  toolTipNode.ownerGlobal.onMouseOverItem({ currentTarget: item.getNode() });

  // Check title.
  let toolTipTable = toolTip + '/{"class":"tooltipBox"}/{"class":"tooltipHeaderTable"}/';
  let eventName = lookup(`${toolTipTable}/[0]/[1]`);
  controller.assert(() => eventName.getNode().textContent == EVENTTITLE);

  // Check date and time.
  let dateTime = lookup(`${toolTipTable}/[2]/[1]`);

  let currDate = firstDay.clone();
  currDate.addDuration(cal.createDuration(`P${7 * (row - 1) + (col - 1)}D`));
  let startDate = cal.dtz.formatter.formatDate(currDate);

  controller.assert(() => {
    let text = dateTime.getNode().textContent;
    dump(`${text} / ${startDate} ${startTime} -\n`);
    return text.includes(`${startDate} ${startTime} – `);
  });

  // This could be on the next day if it is 00:00.
  controller.assert(() => dateTime.getNode().textContent.endsWith(endTime));
}

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
