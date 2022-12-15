/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* This has the following companion definition files:
 * - unifiedToolbarCustomizableItems.css for the preview icons based on the id.
 * - unifiedToolbarItems.ftl for the labels associated with the labelId.
 * - unifiedToolbarCustomizableItems.inc.xhtml for the templates referenced with
 *   templateId.
 * - unifiedToolbarShared.css contains styles for the template contents shared
 *   between the customization preview and the actual toolbar.
 * - unifiedToolbar/content/items contains all item specific custom elements.
 */

/**
 * @typedef {object} CustomizableItemDetails
 * @property {string} id - The ID of the item. Will be set as a class on the
 *   outer wrapper. May not contain commas.
 * @property {string} labelId - Fluent ID for the label shown while in the
 *   palette.
 * @property {boolean} [allowMultiple] - If this item can be added more than
 *   once to a space.
 * @property {string[]} [spaces] - If empty or omitted, item is allowed in all
 *   spaces.
 * @property {string} [templateId] - ID of template defining the "live" markup.
 * @property {string[]} [requiredModules] - List of modules that must be loaded
 *   for the template of this item.
 */

/**
 * @type {CustomizableItemDetails[]}
 */
export default [
  {
    id: "spacer",
    labelId: "spacer",
    allowMultiple: true,
  },
  {
    id: "search-bar",
    labelId: "search-bar",
    templateId: "searchBarItemTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/search-bar.mjs",
    ],
  },
  {
    id: "write-message",
    labelId: "toolbar-write-message",
    templateId: "writeMessageTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
  {
    id: "move-to",
    labelId: "toolbar-move-to",
    spaces: ["mail"],
    templateId: "moveToTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
  {
    id: "unifinder",
    labelId: "toolbar-unifinder",
    spaces: ["calendar"],
    templateId: "calendarUnifinderTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
  {
    id: "folder-location",
    labelId: "toolbar-folder-location",
    spaces: ["mail"],
    templateId: "folderLocationTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/folder-location.mjs",
    ],
  },
  {
    id: "edit-event",
    labelId: "toolbar-edit-event",
    spaces: ["calendar", "tasks"],
    templateId: "editEventTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
];
