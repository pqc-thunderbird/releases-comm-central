/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["BaseProfileImporter"];

/**
 * An object to represent a source profile to import from.
 * @typedef {Object} SourceProfile
 * @property {string} name - The profile name.
 * @property {nsIFile} dir - The profile location.
 *
 * An object to represent items to import.
 * @typedef {Object} ImportItems
 * @property {boolean} accounts - Whether to import accounts and settings.
 * @property {boolean} addressBooks - Whether to import address books.
 * @property {boolean} calendars - Whether to import calendars.
 * @property {boolean} mailMessages - Whether to import mail messages.
 */

/**
 * Common interfaces shared by profile importers.
 * @abstract
 */
class BaseProfileImporter {
  /** @type boolean - Whether to allow importing from a user picked dir. */
  USE_FILE_PICKER = true;

  /** @type ImportItems */
  SUPPORTED_ITEMS = {
    accounts: true,
    addressBooks: true,
    calendars: true,
    mailMessages: true,
  };

  /** When importing from a zip file, ignoring these folders. */
  IGNORE_DIRS = [];

  /**
   * Callback for progress updates.
   * @param {number} current - Current imported items count.
   * @param {number} total - Total items count.
   */
  onProgress = () => {};

  /**
   * @returns {SourceProfile[]} Profiles found on this machine.
   */
  async getSourceProfiles() {
    throw Components.Exception(
      `getSourceProfiles not implemented in ${this.constructor.name}`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  /**
   * Actually start importing things to the current profile.
   * @param {nsIFile} sourceProfileDir - The source location to import from.
   * @param {ImportItems} items - The items to import.
   */
  async startImport(sourceProfileDir, items) {
    throw Components.Exception(
      `startImport not implemented in ${this.constructor.name}`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });
}
