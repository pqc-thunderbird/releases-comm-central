/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsNewMailnewsURI.h"
#include "nsURLHelper.h"
#include "nsSimpleURI.h"
#include "nsStandardURL.h"

#include "../../local/src/nsPop3Service.h"
#include "../../local/src/nsMailboxService.h"
#include "../../compose/src/nsSmtpService.h"
#include "../../compose/src/nsSmtpUrl.h"
#include "../../../ldap/xpcom/src/nsLDAPURL.h"
#include "../../imap/src/nsImapService.h"
#include "../../news/src/nsNntpService.h"
#include "../../addrbook/src/nsAddbookProtocolHandler.h"
#include "../src/nsCidProtocolHandler.h"

nsresult NS_NewMailnewsURI(nsIURI** aURI, const nsACString& aSpec,
                           const char* aCharset /* = nullptr */,
                           nsIURI* aBaseURI /* = nullptr */,
                           nsIIOService* aIOService /* = nullptr */) {
  nsAutoCString scheme;
  nsresult rv = net_ExtractURLScheme(aSpec, scheme);
  NS_ENSURE_SUCCESS(rv, rv);

  if (scheme.EqualsLiteral("mailbox") ||
      scheme.EqualsLiteral("mailbox-message")) {
    return nsMailboxService::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("imap") || scheme.EqualsLiteral("imap-message")) {
    return nsImapService::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("smtp")) {
    rv = NS_MutateURI(new nsSmtpUrl::Mutator()).SetSpec(aSpec).Finalize(aURI);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsISmtpUrl> url(do_QueryInterface(*aURI));
    NS_ENSURE_TRUE(url, NS_ERROR_UNEXPECTED);
    return url->Init(aSpec);
  }
  if (scheme.EqualsLiteral("mailto")) {
    return nsSmtpService::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("pop3")) {
    return nsPop3Service::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("news") || scheme.EqualsLiteral("snews")) {
    return nsNntpService::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("cid")) {
    return nsCidProtocolHandler::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("addbook")) {
    return nsAddbookProtocolHandler::NewURI(aSpec, aCharset, aBaseURI, aURI);
  }
  if (scheme.EqualsLiteral("ldap") || scheme.EqualsLiteral("ldaps")) {
    rv = NS_MutateURI(new nsLDAPURL::Mutator()).SetSpec(aSpec).Finalize(aURI);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsILDAPURL> url(do_QueryInterface(*aURI));
    NS_ENSURE_TRUE(url, NS_ERROR_UNEXPECTED);
    return url->Init(nsIStandardURL::URLTYPE_STANDARD,
                     scheme.EqualsLiteral("ldap") ? 389 : 636, aSpec, aCharset,
                     aBaseURI);
  }
  if (scheme.EqualsLiteral("smile")) {
    ;  // Fall through.
  }
  if (scheme.EqualsLiteral("moz-cal-handle-itip")) {
    return NS_MutateURI(new mozilla::net::nsStandardURL::Mutator())
        .SetSpec(aSpec)
        .Finalize(aURI);
  }
  if (scheme.EqualsLiteral("webcal") || scheme.EqualsLiteral("webcals")) {
    return NS_MutateURI(new mozilla::net::nsStandardURL::Mutator())
        .SetSpec(aSpec)
        .Finalize(aURI);
  }

  // XXX TODO: What about JS Account?

  // None of the above, let's fallback to the M-C fallback.
  return NS_MutateURI(new mozilla::net::nsSimpleURI::Mutator())
      .SetSpec(aSpec)
      .Finalize(aURI);
}
