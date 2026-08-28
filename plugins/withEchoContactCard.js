const {
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Echo as an entry in the phone's address book.
 *
 * Android lets an app own contact data through an account type and a sync
 * adapter, and declare a custom MIME type that the Contacts app renders as a
 * tappable row. That is how "Message with WhatsApp" appears inside a contact
 * card, and it is the only supported way to do it. iOS has no equivalent —
 * there the counterpart is App Intents, which is separate work.
 *
 * Four pieces, all required, none of them optional:
 *
 *   authenticator  a stub AbstractAccountAuthenticator. Android will not let an
 *                  app own contacts without an account type behind them, even
 *                  when there is nothing to authenticate.
 *   sync adapter   the only component permitted to write contacts under that
 *                  account. It is what actually inserts the Echo row.
 *   contacts.xml   tells the Contacts app how to draw the custom MIME type —
 *                  without it the row exists but renders as nothing.
 *   the account    created on launch from MainActivity, so no JS bridge or
 *                  custom native module is needed.
 *
 * WRITE_CONTACTS is a runtime permission, so the sync adapter checks for it and
 * does nothing until it is granted. ensureAccount runs on every launch and asks
 * for a sync, which means the first launch after the user grants the permission
 * is the one that writes the contact. That costs a launch and buys not having
 * to bridge a native module into JS just to retry.
 */

const ACCOUNT_TYPE_SUFFIX = '.account';
const SUB_PACKAGE = 'contact';

function javaDir(platformRoot, packageName) {
  return path.join(
    platformRoot,
    'app/src/main/java',
    ...packageName.split('.'),
    SUB_PACKAGE,
  );
}

const kotlinSources = (pkg, accountType, mimeType) => ({
  'EchoAuthenticator.kt': `package ${pkg}.${SUB_PACKAGE}

import android.accounts.AbstractAccountAuthenticator
import android.accounts.Account
import android.accounts.AccountAuthenticatorResponse
import android.content.Context
import android.os.Bundle

/**
 * A stub authenticator.
 *
 * There is nothing to authenticate — Echo's account exists only so the
 * contacts provider has an owner for the rows we write. Android still requires
 * the type to exist, so every method returns null and none of them are ever
 * reached in normal use.
 */
class EchoAuthenticator(context: Context) : AbstractAccountAuthenticator(context) {
  override fun editProperties(
    response: AccountAuthenticatorResponse?,
    accountType: String?
  ): Bundle? = null

  override fun addAccount(
    response: AccountAuthenticatorResponse?,
    accountType: String?,
    authTokenType: String?,
    requiredFeatures: Array<out String>?,
    options: Bundle?
  ): Bundle? = null

  override fun confirmCredentials(
    response: AccountAuthenticatorResponse?,
    account: Account?,
    options: Bundle?
  ): Bundle? = null

  override fun getAuthToken(
    response: AccountAuthenticatorResponse?,
    account: Account?,
    authTokenType: String?,
    options: Bundle?
  ): Bundle? = null

  override fun getAuthTokenLabel(authTokenType: String?): String? = null

  override fun updateCredentials(
    response: AccountAuthenticatorResponse?,
    account: Account?,
    authTokenType: String?,
    options: Bundle?
  ): Bundle? = null

  override fun hasFeatures(
    response: AccountAuthenticatorResponse?,
    account: Account?,
    features: Array<out String>?
  ): Bundle? = null
}
`,

  'EchoAuthenticatorService.kt': `package ${pkg}.${SUB_PACKAGE}

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Hands the account manager our stub authenticator. */
class EchoAuthenticatorService : Service() {
  private var authenticator: EchoAuthenticator? = null

  override fun onCreate() {
    super.onCreate()
    if (authenticator == null) authenticator = EchoAuthenticator(this)
  }

  override fun onBind(intent: Intent?): IBinder? = authenticator?.iBinder
}
`,

  'EchoSyncAdapter.kt': `package ${pkg}.${SUB_PACKAGE}

import android.accounts.Account
import android.content.AbstractThreadedSyncAdapter
import android.content.ContentProviderClient
import android.content.Context
import android.content.SyncResult
import android.os.Bundle

/**
 * The only component allowed to write contacts under Echo's account.
 *
 * There is nothing to pull from a server: the whole job is making sure the one
 * Echo row exists, so a sync is idempotent and cheap.
 */
class EchoSyncAdapter(context: Context, autoInitialize: Boolean) :
  AbstractThreadedSyncAdapter(context, autoInitialize) {

  override fun onPerformSync(
    account: Account,
    extras: Bundle,
    authority: String,
    provider: ContentProviderClient,
    syncResult: SyncResult
  ) {
    try {
      EchoContactSync.writeEchoContact(context, account)
    } catch (e: Exception) {
      // A failed sync must never crash the process; Android will retry.
      syncResult.databaseError = true
    }
  }
}
`,

  'EchoSyncService.kt': `package ${pkg}.${SUB_PACKAGE}

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Binds the sync adapter. One instance per process, guarded because Android
 * may bind this from more than one thread.
 */
class EchoSyncService : Service() {
  override fun onCreate() {
    super.onCreate()
    synchronized(lock) {
      if (adapter == null) adapter = EchoSyncAdapter(applicationContext, true)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = adapter?.syncAdapterBinder

  companion object {
    private var adapter: EchoSyncAdapter? = null
    private val lock = Any()
  }
}
`,

  'EchoContactSync.kt': `package ${pkg}.${SUB_PACKAGE}

import android.Manifest
import android.accounts.Account
import android.accounts.AccountManager
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat

/**
 * Creating Echo's account and its single contact row.
 */
object EchoContactSync {
  const val ACCOUNT_TYPE = "${accountType}"
  const val ACCOUNT_NAME = "Echo"
  const val MIME_PROFILE = "${mimeType}"

  /** Stable identity for the row, so a re-sync updates rather than duplicates. */
  private const val SOURCE_ID = "echo-assistant"

  /**
   * Make sure the account exists and ask for a sync.
   *
   * Called on every launch rather than once: WRITE_CONTACTS is a runtime
   * permission, so the first attempts may legitimately do nothing, and the
   * launch after the user grants it is the one that succeeds.
   */
  @JvmStatic
  fun ensureAccount(context: Context) {
    try {
      val manager = AccountManager.get(context)
      val account = Account(ACCOUNT_NAME, ACCOUNT_TYPE)

      if (manager.getAccountsByType(ACCOUNT_TYPE).isEmpty()) {
        if (!manager.addAccountExplicitly(account, null, null)) return
        ContentResolver.setIsSyncable(account, ContactsContract.AUTHORITY, 1)
        ContentResolver.setSyncAutomatically(account, ContactsContract.AUTHORITY, true)
      }

      if (!canWriteContacts(context)) return

      // Write the row here rather than waiting for the sync adapter.
      //
      // The sync framework was answering every requestSync with
      // Bundle[{initialize=true}], which AbstractThreadedSyncAdapter consumes
      // itself without ever calling onPerformSync — so the row was never
      // written. Chasing that is unnecessary: a sync adapter is not what makes
      // a write legitimate. Owning the account type and passing
      // CALLER_IS_SYNCADAPTER on the URI is, and both are true here.
      //
      // The adapter stays registered because it is what makes the account a
      // real contacts source to Android, but nothing depends on it running.
      //
      // Off the main thread: this is called from MainActivity.onCreate and a
      // contacts applyBatch is disk I/O.
      val appContext = context.applicationContext
      Thread {
        try {
          writeEchoContact(appContext, account)
        } catch (e: Exception) {
          // A missing contact row must never take the app down with it.
        }
      }.start()
    } catch (e: Exception) {
      // Never let a contact-card failure stop the app from starting.
    }
  }

  private fun canWriteContacts(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CONTACTS) ==
      PackageManager.PERMISSION_GRANTED

  /**
   * Insert the Echo row if it is not already there.
   *
   * Keyed on SOURCE_ID so this is safe to run repeatedly — which it will be,
   * because every launch asks for a sync.
   */
  fun writeEchoContact(context: Context, account: Account) {
    if (!canWriteContacts(context)) return
    val resolver = context.contentResolver

    val existing = resolver.query(
      ContactsContract.RawContacts.CONTENT_URI,
      arrayOf(ContactsContract.RawContacts._ID),
      ContactsContract.RawContacts.ACCOUNT_TYPE + " = ? AND " +
        ContactsContract.RawContacts.ACCOUNT_NAME + " = ? AND " +
        ContactsContract.RawContacts.SOURCE_ID + " = ?",
      arrayOf(account.type, account.name, SOURCE_ID),
      null
    )
    // Replace rather than skip.
    //
    // Skipping when a row already exists meant the contact froze at whatever
    // it looked like the first time it was written — a corrected URL or label
    // could never reach a device that already had one. Deleting our own row
    // and re-inserting keeps the card in step with the app, and is safe
    // because nothing but this code owns it.
    var alreadyThere = false
    existing.use { cursor ->
      alreadyThere = cursor != null && cursor.count > 0
    }
    if (alreadyThere) {
      resolver.delete(
        syncUri(ContactsContract.RawContacts.CONTENT_URI),
        ContactsContract.RawContacts.ACCOUNT_TYPE + " = ? AND " +
          ContactsContract.RawContacts.SOURCE_ID + " = ?",
        arrayOf(account.type, SOURCE_ID)
      )
    }

    val ops = ArrayList<ContentProviderOperation>()

    ops.add(
      ContentProviderOperation.newInsert(syncUri(ContactsContract.RawContacts.CONTENT_URI))
        .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, account.name)
        .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, account.type)
        .withValue(ContactsContract.RawContacts.SOURCE_ID, SOURCE_ID)
        .build()
    )

    ops.add(
      ContentProviderOperation.newInsert(syncUri(ContactsContract.Data.CONTENT_URI))
        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
        .withValue(
          ContactsContract.Data.MIMETYPE,
          ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
        )
        .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, "Echo")
        .build()
    )

    // The custom row. contacts.xml turns DATA2/DATA3 into the label and
    // subtitle the Contacts app draws, and tapping it opens echo:///voice.
    ops.add(
      ContentProviderOperation.newInsert(syncUri(ContactsContract.Data.CONTENT_URI))
        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
        .withValue(ContactsContract.Data.MIMETYPE, MIME_PROFILE)
        .withValue(ContactsContract.Data.DATA1, "Echo")
        .withValue(ContactsContract.Data.DATA2, "Talk to Echo")
        .withValue(ContactsContract.Data.DATA3, "Ask anything, hands free")
        .build()
    )

    // A website row as well, because the custom MIME type above is only drawn
    // by contacts apps that honour contacts.xml — Google Contacts, which is
    // what most people actually have, ignores third-party MIME types on the
    // detail screen. This one is a standard type every contacts app renders,
    // and it is tappable, so the card is useful rather than merely present.
    ops.add(
      ContentProviderOperation.newInsert(syncUri(ContactsContract.Data.CONTENT_URI))
        .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
        .withValue(
          ContactsContract.Data.MIMETYPE,
          ContactsContract.CommonDataKinds.Website.CONTENT_ITEM_TYPE
        )
        .withValue(ContactsContract.CommonDataKinds.Website.URL, "https://downloadecho.com")
        .withValue(
          ContactsContract.CommonDataKinds.Website.TYPE,
          ContactsContract.CommonDataKinds.Website.TYPE_CUSTOM
        )
        .withValue(ContactsContract.CommonDataKinds.Website.LABEL, "Talk to Echo")
        .build()
    )

    resolver.applyBatch(ContactsContract.AUTHORITY, ops)
  }

  /** Writes as a sync adapter, which is what lets us own these rows. */
  private fun syncUri(uri: android.net.Uri) =
    uri.buildUpon()
      .appendQueryParameter(ContactsContract.CALLER_IS_SYNCADAPTER, "true")
      .appendQueryParameter(ContactsContract.RawContacts.ACCOUNT_NAME, ACCOUNT_NAME)
      .appendQueryParameter(ContactsContract.RawContacts.ACCOUNT_TYPE, ACCOUNT_TYPE)
      .build()
}
`,
});

const xmlResources = (pkg, accountType, mimeType) => ({
  'authenticator.xml': `<?xml version="1.0" encoding="utf-8"?>
<account-authenticator xmlns:android="http://schemas.android.com/apk/res/android"
    android:accountType="${accountType}"
    android:icon="@mipmap/ic_launcher"
    android:smallIcon="@mipmap/ic_launcher"
    android:label="@string/app_name" />
`,
  'syncadapter.xml': `<?xml version="1.0" encoding="utf-8"?>
<sync-adapter xmlns:android="http://schemas.android.com/apk/res/android"
    android:contentAuthority="com.android.contacts"
    android:accountType="${accountType}"
    android:supportsUploading="false"
    android:userVisible="false" />
`,
  // Without this the custom row exists in the database and draws as nothing.
  // ContactsAccountType, not the legacy ContactsSource: the Contacts app reads
  // this to learn how to draw a custom MIME type, and with the old root element
  // it parses nothing and the row is invisible even though it exists in the
  // database.
  'contacts.xml': `<?xml version="1.0" encoding="utf-8"?>
<ContactsAccountType xmlns:android="http://schemas.android.com/apk/res/android">
  <ContactsDataKind
      android:mimeType="${mimeType}"
      android:icon="@mipmap/ic_launcher"
      android:summaryColumn="data2"
      android:detailColumn="data3" />
</ContactsAccountType>
`,
});

const withSources = (config, { packageName, accountType, mimeType }) =>
  withDangerousMod(config, [
    'android',
    cfg => {
      const root = cfg.modRequest.platformProjectRoot;

      const kotlinDir = javaDir(root, packageName);
      fs.mkdirSync(kotlinDir, { recursive: true });
      const sources = kotlinSources(packageName, accountType, mimeType);
      for (const [name, body] of Object.entries(sources)) {
        fs.writeFileSync(path.join(kotlinDir, name), body, 'utf8');
      }

      const xmlDir = path.join(root, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmls = xmlResources(packageName, accountType, mimeType);
      for (const [name, body] of Object.entries(xmls)) {
        fs.writeFileSync(path.join(xmlDir, name), body, 'utf8');
      }

      return cfg;
    },
  ]);

const withServicesAndPermissions = (config, { packageName }) =>
  withAndroidManifest(config, cfg => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const sub = `${packageName}.${SUB_PACKAGE}`;

    app.service = (app.service ?? []).filter(
      s => !String(s.$['android:name']).startsWith(`${sub}.Echo`),
    );

    app.service.push({
      $: { 'android:name': `${sub}.EchoAuthenticatorService`, 'android:exported': 'false' },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.accounts.AccountAuthenticator' } }] },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.accounts.AccountAuthenticator',
            'android:resource': '@xml/authenticator',
          },
        },
      ],
    });

    app.service.push({
      $: { 'android:name': `${sub}.EchoSyncService`, 'android:exported': 'false' },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.content.SyncAdapter' } }] },
      ],
      'meta-data': [
        { $: { 'android:name': 'android.content.SyncAdapter', 'android:resource': '@xml/syncadapter' } },
        { $: { 'android:name': 'android.provider.CONTACTS_STRUCTURE', 'android:resource': '@xml/contacts' } },
      ],
    });

    return cfg;
  });

const withEnsureAccountOnLaunch = (config, { packageName }) =>
  withMainActivity(config, cfg => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withEchoContactCard: expected a Kotlin MainActivity');
    }
    let src = cfg.modResults.contents;
    const importLine = `import ${packageName}.${SUB_PACKAGE}.EchoContactSync`;
    if (!src.includes(importLine)) {
      src = src.replace(/^(package .*\n)/m, `$1\n${importLine}\n`);
    }
    if (!src.includes('EchoContactSync.ensureAccount')) {
      // After super.onCreate so the context is fully initialised.
      src = src.replace(
        /(super\.onCreate\([^)]*\)\n)/,
        `$1    EchoContactSync.ensureAccount(this)\n`,
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });

module.exports = function withEchoContactCard(config) {
  const packageName = config.android?.package;
  if (!packageName) throw new Error('withEchoContactCard: expo.android.package must be set');

  const accountType = `${packageName}${ACCOUNT_TYPE_SUFFIX}`;
  const mimeType = `vnd.android.cursor.item/vnd.${packageName}.profile`;

  config = withSources(config, { packageName, accountType, mimeType });
  config = withServicesAndPermissions(config, { packageName });
  config = withEnsureAccountOnLaunch(config, { packageName });
  return config;
};
