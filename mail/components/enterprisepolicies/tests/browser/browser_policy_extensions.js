/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const ADDON_ID = "policytest@mozilla.com";
const BASE_URL =
  "http://mochi.test:8888/browser/comm/mail/components/enterprisepolicies/tests/browser";

async function isExtensionLocked(win, addonID) {
  const addonCard = await BrowserTestUtils.waitForCondition(() => {
    return win.document.querySelector(`addon-card[addon-id="${addonID}"]`);
  }, `Get addon-card for "${addonID}"`);
  const disableBtn = addonCard.querySelector('[action="toggle-disabled"]');
  const removeBtn = addonCard.querySelector('panel-item[action="remove"]');
  ok(removeBtn.disabled, "Remove button should be disabled");
  ok(disableBtn.hidden, "Disable button should be hidden");
}

add_task(async function test_addon_install() {
  const installPromise = waitForAddonInstall(ADDON_ID);
  await setupPolicyEngineWithJson({
    policies: {
      Extensions: {
        Install: [`${BASE_URL}/policytest_v0.1.xpi`],
        Locked: [ADDON_ID],
      },
    },
  });
  await installPromise;
  const addon = await AddonManager.getAddonByID(ADDON_ID);
  isnot(addon, null, "Addon not installed.");
  is(addon.version, "0.1", "Addon version is correct");

  Assert.deepEqual(
    addon.installTelemetryInfo,
    { source: "enterprise-policy" },
    "Got the expected addon.installTelemetryInfo"
  );
});

add_task(async function test_addon_locked() {
  const tabmail = document.getElementById("tabmail");
  const index = tabmail.tabInfo.length;
  await window.openAddonsMgr("addons://list/extension");
  const tab = tabmail.tabInfo[index];
  const browser = tab.browser;

  await isExtensionLocked(browser.contentWindow, ADDON_ID);

  tabmail.closeTab(tab);
});

add_task(async function test_addon_reinstall() {
  // Test that uninstalling and reinstalling the same addon ID works as expected.
  // This can be used to update an addon.

  const uninstallPromise = waitForAddonUninstall(ADDON_ID);
  const installPromise = waitForAddonInstall(ADDON_ID);
  await setupPolicyEngineWithJson({
    policies: {
      Extensions: {
        Uninstall: [ADDON_ID],
        Install: [`${BASE_URL}/policytest_v0.2.xpi`],
      },
    },
  });

  // Older version was uninstalled
  await uninstallPromise;

  // New version was installed
  await installPromise;

  const addon = await AddonManager.getAddonByID(ADDON_ID);
  isnot(
    addon,
    null,
    "Addon still exists because the policy was used to update it."
  );
  is(addon.version, "0.2", "New version is correct");
});

add_task(async function test_addon_uninstall() {
  EnterprisePolicyTesting.resetRunOnceState();

  const uninstallPromise = waitForAddonUninstall(ADDON_ID);
  await setupPolicyEngineWithJson({
    policies: {
      Extensions: {
        Uninstall: [ADDON_ID],
      },
    },
  });
  await uninstallPromise;
  const addon = await AddonManager.getAddonByID(ADDON_ID);
  is(addon, null, "Addon should be uninstalled.");
});

add_task(async function test_addon_download_failure() {
  // Test that if the download fails, the runOnce pref
  // is cleared so that the download will happen again.

  const installPromise = waitForAddonInstall(ADDON_ID);
  await setupPolicyEngineWithJson({
    policies: {
      Extensions: {
        Install: [`${BASE_URL}/policytest_invalid.xpi`],
      },
    },
  });

  await installPromise;
  is(
    Services.prefs.prefHasUserValue(
      "browser.policies.runOncePerModification.extensionsInstall"
    ),
    false,
    "runOnce pref should be unset"
  );
});
