# Graph Report - .  (2026-05-12)

## Corpus Check
- 2368 files · ~14,252,265 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 20133 nodes · 48802 edges · 941 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.76)
- Token cost: 46,661 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `sqlite3_free()` - 434 edges
2. `sqlite3VdbeExec()` - 185 edges
3. `sqlite3_mutex_held()` - 162 edges
4. `sqlite3_mutex_leave()` - 157 edges
5. `sqlite3DbFree()` - 152 edges
6. `sqlite3_mutex_enter()` - 151 edges
7. `sqlite3_step()` - 138 edges
8. `sqlite3_mprintf()` - 137 edges
9. `sqlite3Pragma()` - 129 edges
10. `sqlite3_malloc64()` - 127 edges

## Surprising Connections (you probably didn't know these)
- `AGENTS.md Project Guidelines` --semantically_similar_to--> `CLAUDE.md Project Instructions`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `monitorGoCryptoRequest (poll loop)` --semantically_similar_to--> `checkKycInBackground (10-minute poll)`  [INFERRED] [semantically similar]
  src/composables/useGoCrypto.ts → src/stores/kyc.ts
- `useNaka Pinia Store` --shares_data_with--> `useKyc Pinia Store`  [EXTRACTED]
  src/stores/naka.ts → src/stores/kyc.ts
- `setupCard (register + persist)` --calls--> `checkKycInBackground (10-minute poll)`  [EXTRACTED]
  src/stores/naka.ts → src/stores/kyc.ts

## Hyperedges (group relationships)
- **Sync Wallets Pipeline** — agents_syncWallets, agents_verifyRemoteSignersDb, agents_discoverRemoteSignersFromBlockchain, agents_remote_signers_table [EXTRACTED 0.90]
- **Transaction Ingest & Filtering** — agents_addTransaction, agents_addReceiptTransaction, agents_filterDisplayableTxs, agents_filterUnseen, agents_categorizeTransactions, agents_handleUnknownTxs [EXTRACTED 0.90]
- **On-Device Debugging Stack** — agents_debugging_capacitor_skill, agents_useLogger, agents_logs_txt, agents_capacitor_sqlite_sqlcipher [EXTRACTED 0.85]

## Communities

### Community 0 - "SQLCipher Internals"
Cohesion: 0.0
Nodes (2588): accessPayload(), accessPayloadChecked(), actionName(), addAggInfoColumn(), addAggInfoFunc(), addArgumentToVtab(), addModuleArgument(), addOp4IntSlow() (+2580 more)

### Community 1 - "SQLCipher Internals 2"
Cohesion: 0.0
Nodes (1441): absFunc(), AdjustTree(), assertColumnName(), autoAdjustDate(), avgFinalize(), blobGrowBuffer(), bytecodevtabClose(), bytecodevtabColumn() (+1433 more)

### Community 2 - "WebP Codec"
Cohesion: 0.0
Nodes (632): ApplyFiltersAndEncode(), CompressAlphaJob(), EncodeAlpha(), EncodeAlphaInternal(), EncodeLossless(), GetFilterMap(), GetNumColors(), InitFilterTrial() (+624 more)

### Community 3 - "SVG iOS Bindings"
Cohesion: 0.0
Nodes (578): Attr, -initWithNamespacequalifiedNamevalue, -initWithNamevalue, BaseClassForAllSVGBasicShapes, -dealloc, -init, -layoutLayer, -newLayer (+570 more)

### Community 4 - "ZIPFoundation Archive"
Cohesion: 0.0
Nodes (454): AccessMode, create, read, update, Archive, Archive.EndOfCentralDirectoryRecord, ArchiveError, cancelledOperation (+446 more)

### Community 5 - "App Bundle (build1)"
Cohesion: 0.01
Nodes (90): $a(), An, Ao, as, b(), ba(), Bi(), bn (+82 more)

### Community 6 - "App Bundle (iOS)"
Cohesion: 0.01
Nodes (213): A(), aa(), addExceptionStep(), addFeatureFlagsHandler(), al(), allowedMetrics(), ao(), Ar() (+205 more)

### Community 7 - "App Bundle (Android)"
Cohesion: 0.01
Nodes (213): A(), aa(), addExceptionStep(), addFeatureFlagsHandler(), al(), allowedMetrics(), ao(), Ar() (+205 more)

### Community 8 - "Naka Reader Bundle"
Cohesion: 0.01
Nodes (248): as(), Ga(), is(), ls(), me(), oe(), ts(), Ve() (+240 more)

### Community 9 - "Capacitor Plugins"
Cohesion: 0.0
Nodes (295): AnyObject, PodsDummy_AparajitaCapacitorBiometricAuth, PodsDummy_AparajitaCapacitorSecureStorage, ApplicationEventPublisher, ApplicationEventPublishing, BaseApplicationEventPublisher, UIApplication, ApplicationLifecyclePublisher (+287 more)

### Community 10 - "Nimiq Core"
Cohesion: 0.01
Nodes (127): Address, addToExternrefTable0(), _assertClass(), _base64encodeChunk(), _base64fromByteArray(), _bitsToEntropy(), _bitsToMnemonic(), BLSKeyPair (+119 more)

### Community 11 - "Web3 Provider"
Cohesion: 0.01
Nodes (435): A, adapt(), _addListener(), adler32(), afterTransform(), afterWrite(), alloc(), allocUnsafe() (+427 more)

### Community 12 - "Naka Reader (Android)"
Cohesion: 0.01
Nodes (262): aa(), addListeners(), Ae(), ai(), al(), An(), Ao(), ar() (+254 more)

### Community 13 - "Naka Reader (iOS)"
Cohesion: 0.01
Nodes (258): _a(), aa(), addListeners(), Ae(), ai(), as(), At(), au() (+250 more)

### Community 14 - "App Index (build)"
Cohesion: 0.03
Nodes (327): $1(), _5(), $7(), _9(), _A(), A1(), a5(), a7() (+319 more)

### Community 15 - "App Index (iOS)"
Cohesion: 0.03
Nodes (326): $1(), _5(), $7(), _9(), _A(), A1(), a5(), a7() (+318 more)

### Community 16 - "App Index (Android)"
Cohesion: 0.03
Nodes (326): $1(), _5(), $7(), _9(), _A(), A1(), a5(), a7() (+318 more)

### Community 17 - "Firebase Installations"
Cohesion: 0.01
Nodes (260): FIRInstallationsAPIService, -authTokenRequestWithInstallation, -authTokenWithServerResponse, -deleteInstallation, -deleteInstallationRequestWithInstallation, -initWithAPIKeyprojectIDheartbeatLogger, -initWithURLSessionAPIKeyprojectIDheartbeatLogger, -refreshAuthTokenForInstallation (+252 more)

### Community 18 - "Analytics & Tracking"
Cohesion: 0.01
Nodes (92): assetToSwapPair(), buildPaymentAnalyticsProps(), capture(), getAmountRange(), trackAppOpened(), trackChainSwitched(), trackCurrentAppOpen(), trackDAppClosed() (+84 more)

### Community 19 - "iOS Native UI"
Cohesion: 0.01
Nodes (112): BottomSection, Comparable, ConfirmationMessage, CustomPresentationDetent, EmojiRating, TestView, EnvironmentKey, Hashable (+104 more)

### Community 20 - "GoogleDataTransport"
Cohesion: 0.01
Nodes (185): GDTCCTCompressionHelper, -gzippedData, -isGzipped, GDTCCTUploadOperation, -batchByAddingMetricsEventToBatchforTarget, -cancel, -constructRequestProtoWithEvents, -constructRequestWithURLforTargetdata (+177 more)

### Community 21 - "Polygon EVM Layer"
Cohesion: 0.02
Nodes (74): fetchLogsWithAdaptiveRange(), fetchLogsWithAvailableHeadFallback(), getErrorCode(), getErrorMessage(), getLatestAvailableBlock(), isBlockRangeLimitError(), isMissingRecentBlockLogQueryError(), isTimedOutLogQueryError() (+66 more)

### Community 22 - "Mini App Launcher (Android)"
Cohesion: 0.02
Nodes (50): Ae(), at, B, Bt, C(), Ce(), ct, de() (+42 more)

### Community 23 - "Mini App Launcher (iOS)"
Cohesion: 0.02
Nodes (50): Ae(), at, B, Bt, C(), Ce(), ct, de() (+42 more)

### Community 24 - "App Index (iOS v2)"
Cohesion: 0.04
Nodes (98): Ae(), ai(), an(), ao(), ar(), at(), Be(), bi() (+90 more)

### Community 25 - "App Index (Android v2)"
Cohesion: 0.04
Nodes (98): Ae(), ai(), an(), ao(), ar(), at(), Be(), bi() (+90 more)

### Community 26 - "PostHog Lifecycle"
Cohesion: 0.03
Nodes (19): AutocaptureEventProcessing, AutocaptureEventProcessing, PostHogAppLifeCycleIntegration, PostHogAutocaptureIntegration, PostHogIntegration, PostHogIntegration, PostHogReplayIntegration, PostHogScreenViewIntegration (+11 more)

### Community 27 - "App Index (build v3)"
Cohesion: 0.04
Nodes (96): Ae(), Ai(), ao(), At(), Bo(), Ce(), ci(), cn() (+88 more)

### Community 28 - "Community 28"
Cohesion: 0.06
Nodes (124): _0(), a0(), ar(), as(), au(), b0(), bs(), bu() (+116 more)

### Community 29 - "App Index (iOS v3)"
Cohesion: 0.06
Nodes (124): _0(), a0(), ar(), as(), au(), b0(), bs(), bu() (+116 more)

### Community 30 - "App Index (Android v3)"
Cohesion: 0.06
Nodes (124): _0(), a0(), ar(), as(), au(), b0(), bs(), bu() (+116 more)

### Community 31 - "Community 31"
Cohesion: 0.03
Nodes (44): ae, At, B(), ce(), Ct(), de(), dt(), _e() (+36 more)

### Community 32 - "Community 32"
Cohesion: 0.02
Nodes (112): DDBufferedProxy, -dealloc, -flush, -flushBuffer, -forwardInvocation, -initWithFileLogger, -logMessage, -lt_sendBufferedDataToFileLogger (+104 more)

### Community 33 - "Community 33"
Cohesion: 0.05
Nodes (64): clip(), clip_8b(), clip_bit_depth(), ConvertWRGBToYUV(), DoSharpArgbToYuv(), clip(), SharpYuvFilterRow_C(), SharpYuvUpdateY_C() (+56 more)

### Community 34 - "Community 34"
Cohesion: 0.03
Nodes (70): FIRComponent, -componentWithProtocolcreationBlock, -componentWithProtocolinstantiationTimingdependenciescreationBlock, -initWithProtocolinstantiationTimingdependenciescreationBlock, FIRDependency, -dependencyWithProtocol, -dependencyWithProtocolisRequired, -initWithProtocolisRequired (+62 more)

### Community 35 - "Community 35"
Cohesion: 0.06
Nodes (65): Add4x4_NEON(), ApplyFilter2_NEON(), ApplyFilter2NoFlip_NEON(), ApplyFilter4_NEON(), ApplyFilter6_NEON(), ConvertU8ToS16_NEON(), DC16_NEON(), DC16NoLeft_NEON() (+57 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (19): a(), b, C, d(), e(), f(), g, h() (+11 more)

### Community 37 - "Community 37"
Cohesion: 0.07
Nodes (56): alias(), autocapture(), buildEvent(), buildProperties(), capture(), close(), dynamicContext(), endSession() (+48 more)

### Community 38 - "Community 38"
Cohesion: 0.07
Nodes (1): i

### Community 39 - "Community 39"
Cohesion: 0.07
Nodes (1): i

### Community 40 - "Community 40"
Cohesion: 0.07
Nodes (55): CollectHistogram_SSE2(), DC16_SSE2(), DC16Mode_SSE2(), DC16NoLeft_SSE2(), DC16NoTop_SSE2(), DC16NoTopLeft_SSE2(), DC4_SSE2(), DC8uv_SSE2() (+47 more)

### Community 41 - "Community 41"
Cohesion: 0.07
Nodes (1): i

### Community 42 - "Community 42"
Cohesion: 0.06
Nodes (38): clip_8b(), DC16_C(), DC16NoLeft_C(), DC16NoTop_C(), DC16NoTopLeft_C(), DC8uv_C(), DC8uvNoLeft_C(), DC8uvNoTop_C() (+30 more)

### Community 43 - "Community 43"
Cohesion: 0.06
Nodes (18): _a, ba(), Be(), et(), Fe(), ga, He(), Je() (+10 more)

### Community 44 - "Community 44"
Cohesion: 0.05
Nodes (33): AutoCapturable, Element, EventData, EventSource, actionMethod, gestureRecognizer, notification, EventType (+25 more)

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (40): ComplexMask_SSE2(), DC16_SSE2(), DC16NoLeft_SSE2(), DC16NoTop_SSE2(), DC16NoTopLeft_SSE2(), DC8uv_SSE2(), DC8uvNoLeft_SSE2(), DC8uvNoTop_SSE2() (+32 more)

### Community 46 - "Community 46"
Cohesion: 0.06
Nodes (19): bt, Dt(), Et(), H(), It(), J(), jt(), k() (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.07
Nodes (38): allocate_field(), decode_callback_field(), decode_extension(), decode_field(), decode_pointer_field(), decode_static_field(), default_extension_decoder(), initialize_pointer_field() (+30 more)

### Community 48 - "Community 48"
Cohesion: 0.05
Nodes (1): z

### Community 49 - "Community 49"
Cohesion: 0.05
Nodes (1): z

### Community 50 - "Community 50"
Cohesion: 0.05
Nodes (44): FIROptions, -analyticsOptionsDictionary, -analyticsOptionsDictionaryWithInfoDictionary, -androidClientID, -APIKey, -bundleID, -checkEditingLocked, -clientID (+36 more)

### Community 51 - "Community 51"
Cohesion: 0.09
Nodes (37): clip_8b(), clip_max(), CollectHistogram_C(), Copy(), Copy16x8_C(), Copy4x4_C(), DC4(), DCMode() (+29 more)

### Community 52 - "Community 52"
Cohesion: 0.05
Nodes (1): T

### Community 53 - "Community 53"
Cohesion: 0.05
Nodes (41): FIRApp, -actualBundleID, -addAppToAppDictionary, -allApps, -appDidBecomeActive, -applicationNameAllowedCharacters, -appNamed, -appWasConfiguredTwiceusingOptions (+33 more)

### Community 54 - "Community 54"
Cohesion: 0.11
Nodes (33): clearFeatureFlags(), getCachedFeatureFlagPayload(), getCachedFeatureFlags(), getCachedFlags(), getCachedRemoteConfig(), getFeatureFlag(), getFeatureFlagDetails(), getFeatureFlagPayload() (+25 more)

### Community 55 - "Community 55"
Cohesion: 0.1
Nodes (36): AccumulateSSE16_NEON(), Add4x4_NEON(), CollectHistogram_NEON(), ConvertU8ToS16_NEON(), DCMode_NEON(), DiffU8ToS16_NEON(), Disto16x16_NEON(), Disto4x4_NEON() (+28 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (36): AddScore(), CheckLambdaValue(), clip(), CopyScore(), CorrectDCValues(), ExpandMatrix(), GetCostModeI4(), InitScore() (+28 more)

### Community 57 - "Community 57"
Cohesion: 0.11
Nodes (1): MiniAppHost

### Community 58 - "Community 58"
Cohesion: 0.05
Nodes (37): FBLPromise, -onQueuewrap2ObjectsOrErrorCompletion, -onQueuewrapBoolCompletion, -onQueuewrapBoolOrErrorCompletion, -onQueuewrapCompletion, -onQueuewrapDoubleCompletion, -onQueuewrapDoubleOrErrorCompletion, -onQueuewrapErrorCompletion (+29 more)

### Community 59 - "Community 59"
Cohesion: 0.12
Nodes (33): ConvertARGBToUV_SSE2(), ConvertARGBToY_SSE2(), ConvertBGR24ToY_SSE2(), ConvertRGB24ToY_SSE2(), ConvertRGBA32ToUV_SSE2(), ConvertRGBToUV_SSE2(), ConvertRGBToY_SSE2(), ConvertYUV444ToRGB_SSE2() (+25 more)

### Community 60 - "Community 60"
Cohesion: 0.08
Nodes (22): default_extension_encoder(), encode_array(), encode_basic_field(), encode_extension_field(), encode_field(), pb_check_proto3_default_value(), pb_const_cast(), pb_enc_bool() (+14 more)

### Community 61 - "Community 61"
Cohesion: 0.06
Nodes (33): GULAppDelegateSwizzler, -addInstanceMethodWithDestinationSelectorwithImplementationFromSourceSelectorfromClasstoClass, -addInstanceMethodWithSelectorfromClasstoClass, -appDelegateInvocationForSelector, -applicationcontinueUserActivityrestorationHandler, -applicationdonor_didFailToRegisterForRemoteNotificationsWithError, -applicationdonor_didReceiveRemoteNotification, -applicationdonor_didReceiveRemoteNotificationfetchCompletionHandler (+25 more)

### Community 62 - "Community 62"
Cohesion: 0.06
Nodes (33): addTransaction, Asset Conditional Template Wrapping, Base Interface + extends Antipattern, CapacitorSQLite + SQLCipher Encrypted DB, Array.concat Non-Mutation Pitfall, Hydrate UI from local DB cache, debugging-capacitor Skill, filterDisplayableTxs (+25 more)

### Community 63 - "Community 63"
Cohesion: 0.06
Nodes (31): DDAbstractDatabaseLogger, -createAndStartDeleteTimer, -createSuspendedSaveTimer, -db_delete, -db_log, -db_save, -db_saveAndDelete, -dealloc (+23 more)

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (5): C(), d, e, u(), v()

### Community 65 - "Community 65"
Cohesion: 0.12
Nodes (5): C(), d, e, u(), v()

### Community 66 - "Community 66"
Cohesion: 0.09
Nodes (1): I

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (1): I

### Community 68 - "Community 68"
Cohesion: 0.12
Nodes (5): C(), d, e, u(), v()

### Community 69 - "Community 69"
Cohesion: 0.07
Nodes (28): GULNetworkURLSession, -addSystemCompletionHandlerforSession, -backgroundSessionConfigWithSessionID, -callCompletionHandlerwithResponsedataerror, -callSystemCompletionHandler, -ensureTemporaryDirectoryExists, -excludeFromBackupForURL, -fetcherWithSessionIdentifier (+20 more)

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (21): ConvertARGBToUV_SSE41(), ConvertARGBToY_SSE41(), ConvertBGR24ToY_SSE41(), ConvertRGB24ToY_SSE41(), ConvertRGBA32ToUV_SSE41(), ConvertRGBToUV_SSE41(), ConvertRGBToY_SSE41(), ConvertYUV444ToRGB_SSE41() (+13 more)

### Community 71 - "Community 71"
Cohesion: 0.2
Nodes (3): g, m(), q()

### Community 72 - "Community 72"
Cohesion: 0.2
Nodes (3): g, m(), R()

### Community 73 - "Community 73"
Cohesion: 0.11
Nodes (15): ExportBlock(), ImportBlock(), ImportLine(), InitLeft(), InitTop(), MinSize(), VP8IteratorExport(), VP8IteratorImport() (+7 more)

### Community 74 - "Community 74"
Cohesion: 0.2
Nodes (3): g, m(), R()

### Community 75 - "Community 75"
Cohesion: 0.11
Nodes (9): MethodSwizzler<
            @convention(c) (URLSession, Selector, URL, CompletionHandler?) -> URLSessionDataTask,
            @convention(block) (URLSession, URL, CompletionHandler?) -> URLSessionDataTask
        >, MethodSwizzler<
            @convention(c) (URLSession, Selector, URL) -> URLSessionDataTask,
            @convention(block) (URLSession, URL) -> URLSessionDataTask
        >, MethodSwizzler<
            @convention(c) (URLSession, Selector, URLRequest, CompletionHandler?) -> URLSessionDataTask,
            @convention(block) (URLSession, URLRequest, CompletionHandler?) -> URLSessionDataTask
        >, MethodSwizzler<
            @convention(c) (URLSession, Selector, URLRequest) -> URLSessionDataTask,
            @convention(block) (URLSession, URLRequest) -> URLSessionDataTask
        >, DataTaskWithURL, DataTaskWithURLAndCompletion, DataTaskWithURLRequest, DataTaskWithURLRequestAndCompletion (+1 more)

### Community 76 - "Community 76"
Cohesion: 0.12
Nodes (12): ApplyAlphaMultiply4444_C(), ApplyAlphaMultiply_16b_C(), dither_hi(), dither_lo(), GetScale(), MakeARGB32(), Mult(), multiply() (+4 more)

### Community 77 - "Community 77"
Cohesion: 0.09
Nodes (23): FBLPromise, -addPendingObject, -chainOnQueuechainedFulfillchainedReject, -dealloc, -defaultDispatchQueue, -description, -error, -fulfill (+15 more)

### Community 78 - "Community 78"
Cohesion: 0.09
Nodes (1): g

### Community 79 - "Community 79"
Cohesion: 0.17
Nodes (4): CocoaError, FileManager, POSIXError, URL

### Community 80 - "Community 80"
Cohesion: 0.09
Nodes (1): g

### Community 81 - "Community 81"
Cohesion: 0.1
Nodes (4): PostHogSessionReplayConsoleLogsPlugin, PostHogSessionReplayNetworkPlugin, PostHogSessionReplayPlugin, PostHogSessionReplayPlugin

### Community 82 - "Community 82"
Cohesion: 0.13
Nodes (12): _ACResourceInitProtocol, AppKit.NSColor, AppKit.NSImage, ColorResource, ImageResource, ResourceBundleClass, SwiftUI.Color, SwiftUI.Image (+4 more)

### Community 83 - "Community 83"
Cohesion: 0.1
Nodes (21): GULUserDefaults, -arrayForKey, -boolForKey, -dealloc, -dictionaryForKey, -doubleForKey, -floatForKey, -init (+13 more)

### Community 84 - "Community 84"
Cohesion: 0.16
Nodes (10): EdgeBorder, CheckIcon, DissatisfiedEmoji, NeutralEmoji, SatisfiedEmoji, ThumbsDownEmoji, ThumbsUpEmoji, VeryDissatisfiedEmoji (+2 more)

### Community 85 - "Community 85"
Cohesion: 0.18
Nodes (3): g(), r, x()

### Community 86 - "Community 86"
Cohesion: 0.18
Nodes (3): g(), r, x()

### Community 87 - "Community 87"
Cohesion: 0.18
Nodes (3): g(), r, x()

### Community 88 - "Community 88"
Cohesion: 0.11
Nodes (1): d

### Community 89 - "Community 89"
Cohesion: 0.16
Nodes (8): CUnsignedInt, Color, UIColor, UIColorMasks, alphaMask, blueMask, greenMask, redMask

### Community 90 - "Community 90"
Cohesion: 0.12
Nodes (17): GULSceneDelegateSwizzler, -addInstanceMethodWithDestinationSelectorwithImplementationFromSourceSelectorfromClasstoClass, -addInstanceMethodWithSelectorfromClasstoClass, -clearInterceptors, -correctSceneDelegateProxyKey, -handleSceneWillConnectToNotification, -implementationOfMethodSelectorfromClass, -interceptors (+9 more)

### Community 91 - "Community 91"
Cohesion: 0.12
Nodes (16): DDAtomicCounter, -decrement, -increment, -initWithDefaultValue, -value, DDDispatchQueueLogFormatter, -configureDateFormatter, -createDateFormatter (+8 more)

### Community 92 - "Community 92"
Cohesion: 0.12
Nodes (1): L

### Community 93 - "Community 93"
Cohesion: 0.21
Nodes (4): Data, Encodable, HeartbeatStorage, HeartbeatStorageProtocol

### Community 94 - "Community 94"
Cohesion: 0.12
Nodes (1): L

### Community 95 - "Community 95"
Cohesion: 0.13
Nodes (15): DDOSLogger, -init, -initWithLogLevelMapper, -initWithSubsystemcategory, -initWithSubsystemcategorylogLevelMapper, -logger, -loggerName, -logLevelMapper (+7 more)

### Community 96 - "Community 96"
Cohesion: 0.12
Nodes (1): L

### Community 97 - "Community 97"
Cohesion: 0.14
Nodes (2): D(), I()

### Community 98 - "Community 98"
Cohesion: 0.22
Nodes (1): f

### Community 99 - "Community 99"
Cohesion: 0.13
Nodes (15): FIRInstallations, -assertCompatibleIIDVersion, -authTokenForcingRefreshcompletion, -authTokenWithCompletion, -componentsToRegister, -deleteWithCompletion, -initWithApp, -initWithAppOptionsappNameinstallationsIDControllerprefetchAuthToken (+7 more)

### Community 100 - "Community 100"
Cohesion: 0.13
Nodes (15): GULNetwork, -dealloc, -getURLheadersqueueusingBackgroundSessioncompletionHandler, -GULNetwork_logWithLevelmessageCodemessage, -GULNetwork_logWithLevelmessageCodemessagecontext, -GULNetwork_logWithLevelmessageCodemessagecontexts, -handleErrorWithCodequeuewithHandler, -handleEventsForBackgroundURLSessionIDcompletionHandler (+7 more)

### Community 101 - "Community 101"
Cohesion: 0.22
Nodes (1): f

### Community 102 - "Community 102"
Cohesion: 0.22
Nodes (1): f

### Community 103 - "Community 103"
Cohesion: 0.14
Nodes (14): GULAppEnvironmentUtil, -appleDevicePlatform, -applePlatform, -deploymentType, -deviceModel, -deviceSimulatorModel, -getSysctlEntry, -hasSwiftRuntime (+6 more)

### Community 104 - "Community 104"
Cohesion: 0.2
Nodes (8): b(), c(), E(), f(), k(), l(), m(), w()

### Community 105 - "Community 105"
Cohesion: 0.15
Nodes (2): D(), I()

### Community 106 - "Community 106"
Cohesion: 0.2
Nodes (6): getScreenSize(), init(), onOrientationDidChange(), onShouldUpdateScreenSize(), registerNotifications(), updateScreenSize()

### Community 107 - "Community 107"
Cohesion: 0.15
Nodes (2): D(), I()

### Community 108 - "Community 108"
Cohesion: 0.18
Nodes (14): checkKycInBackground (10-minute poll), NakaCard interface, activateCardOnDevice (HCE provisioning), naka.init (hydrate from DB), setupCard (register + persist), updateUser (sync with issuer), useNakaDb (SQLite CRUD for cards), GO_CRYPTO_CONFIG (testnet/mainnet endpoints) (+6 more)

### Community 109 - "Community 109"
Cohesion: 0.28
Nodes (11): De(), fe(), Ie(), Le(), Me(), Ne(), Oe(), qe() (+3 more)

### Community 110 - "Community 110"
Cohesion: 0.15
Nodes (1): m

### Community 111 - "Community 111"
Cohesion: 0.28
Nodes (10): C(), G(), I(), k(), M(), q(), te(), V() (+2 more)

### Community 112 - "Community 112"
Cohesion: 0.15
Nodes (13): GDTCORClock, -clockSnapshotInTheFuture, -encodeWithCoder, -hash, -init, -initWithCoder, -isAfter, -isEqual (+5 more)

### Community 113 - "Community 113"
Cohesion: 0.35
Nodes (1): KeychainSwift

### Community 114 - "Community 114"
Cohesion: 0.28
Nodes (11): De(), fe(), Ie(), Le(), Me(), Ne(), Oe(), qe() (+3 more)

### Community 115 - "Community 115"
Cohesion: 0.15
Nodes (1): m

### Community 116 - "Community 116"
Cohesion: 0.17
Nodes (12): SVGMatrix, -flipX, -flipY, -inverse, -multiply, -rotate, -rotateFromVectory, -scale (+4 more)

### Community 117 - "Community 117"
Cohesion: 0.22
Nodes (1): PostHogStorageManager

### Community 118 - "Community 118"
Cohesion: 0.15
Nodes (1): m

### Community 119 - "Community 119"
Cohesion: 0.28
Nodes (11): De(), fe(), Ie(), Le(), Me(), Ne(), Oe(), qe() (+3 more)

### Community 120 - "Community 120"
Cohesion: 0.26
Nodes (1): o

### Community 121 - "Community 121"
Cohesion: 0.18
Nodes (1): y

### Community 122 - "Community 122"
Cohesion: 0.26
Nodes (1): o

### Community 123 - "Community 123"
Cohesion: 0.29
Nodes (12): copy_stemmer(), doubleConsonant(), hasVowel(), isConsonant(), isVowel(), m_eq_1(), m_gt_0(), m_gt_1() (+4 more)

### Community 124 - "Community 124"
Cohesion: 0.23
Nodes (1): Archive

### Community 125 - "Community 125"
Cohesion: 0.26
Nodes (1): o

### Community 126 - "Community 126"
Cohesion: 0.18
Nodes (11): GDTCOREvent, -copy, -encodeWithCoder, -hash, -initWithCoder, -initWithMappingIDproductDatatarget, -initWithMappingIDtarget, -isEqual (+3 more)

### Community 127 - "Community 127"
Cohesion: 0.18
Nodes (11): GULMutableDictionary, -count, -description, -dictionary, -init, -objectForKey, -objectForKeyedSubscript, -removeAllObjects (+3 more)

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (11): GULReachabilityChecker, -dealloc, -initWithReachabilityDelegatewithHost, -isActive, -reachabilityApi, -reachabilityFlagsChanged, -setReachabilityApi, -setReachabilityDelegate (+3 more)

### Community 129 - "Community 129"
Cohesion: 0.25
Nodes (3): c(), d, l()

### Community 130 - "Community 130"
Cohesion: 0.2
Nodes (10): DDContextAllowlistFilterLogFormatter, -addToWhitelist, -isOnWhitelist, -removeFromWhitelist, -whitelist, DDContextDenylistFilterLogFormatter, -addToBlacklist, -blacklist (+2 more)

### Community 131 - "Community 131"
Cohesion: 0.25
Nodes (1): PostHogFileBackedQueue

### Community 132 - "Community 132"
Cohesion: 0.38
Nodes (1): PostHogApi

### Community 133 - "Community 133"
Cohesion: 0.27
Nodes (5): PostHogSurvey, PostHogSurveyAppearance, PostHogSurveyQuestion, PostHogSurveyRatingDisplayType, PostHogSurveyTextContentType

### Community 134 - "Community 134"
Cohesion: 0.31
Nodes (2): ConsoleOutput, PostHogConsoleLogInterceptor

### Community 135 - "Community 135"
Cohesion: 0.25
Nodes (3): c(), d, l()

### Community 136 - "Community 136"
Cohesion: 0.27
Nodes (2): m(), u

### Community 137 - "Community 137"
Cohesion: 0.4
Nodes (8): a(), c(), k(), L, Q(), T(), w(), x()

### Community 138 - "Community 138"
Cohesion: 0.27
Nodes (1): y

### Community 139 - "Community 139"
Cohesion: 0.2
Nodes (1): o

### Community 140 - "Community 140"
Cohesion: 0.2
Nodes (10): FBLPromise, -attemptsdelayconditionretry, -attemptsretry, -onQueueattemptsdelayconditionretry, -onQueueattemptsretry, -onQueueretry, -retry, -retryAgain (+2 more)

### Community 141 - "Community 141"
Cohesion: 0.36
Nodes (3): AppUITests, XCUIApplication, XCTestCase

### Community 142 - "Community 142"
Cohesion: 0.31
Nodes (7): I(), m(), O(), P(), R(), v(), x()

### Community 143 - "Community 143"
Cohesion: 0.2
Nodes (1): s

### Community 144 - "Community 144"
Cohesion: 0.2
Nodes (1): o

### Community 145 - "Community 145"
Cohesion: 0.4
Nodes (8): a(), c(), k(), L, Q(), S(), T(), w()

### Community 146 - "Community 146"
Cohesion: 0.27
Nodes (1): y

### Community 147 - "Community 147"
Cohesion: 0.22
Nodes (9): DDMultiFormatter, -addFormatter, -formatLogMessage, -formatters, -init, -isFormattingWithFormatter, -logMessageForLineoriginalMessage, -removeAllFormatters (+1 more)

### Community 148 - "Community 148"
Cohesion: 0.27
Nodes (1): y

### Community 149 - "Community 149"
Cohesion: 0.2
Nodes (1): o

### Community 150 - "Community 150"
Cohesion: 0.42
Nodes (9): a(), c(), k(), L, o1(), Q(), S(), T() (+1 more)

### Community 151 - "Community 151"
Cohesion: 0.2
Nodes (1): s

### Community 152 - "Community 152"
Cohesion: 0.53
Nodes (8): D(), G(), I(), J(), k(), P(), V(), z()

### Community 153 - "Community 153"
Cohesion: 0.25
Nodes (1): l

### Community 154 - "Community 154"
Cohesion: 0.22
Nodes (1): s

### Community 155 - "Community 155"
Cohesion: 0.22
Nodes (3): AppDelegate, UIApplicationDelegate, UIResponder

### Community 156 - "Community 156"
Cohesion: 0.22
Nodes (9): GDTCORTransport, -eventForTransport, -eventForTransportWithProductData, -initWithMappingIDtransformerstarget, -sendDataEvent, -sendDataEventonComplete, -sendEventonComplete, -sendTelemetryEvent (+1 more)

### Community 157 - "Community 157"
Cohesion: 0.22
Nodes (9): GDTCORProductData, -copyWithZone, -encodeWithCoder, -hash, -initWithCoder, -initWithProductID, -isEqual, -isEqualToProductData (+1 more)

### Community 158 - "Community 158"
Cohesion: 0.22
Nodes (9): GULHeartbeatDateStorage, -checkAndCreateDirectory, -directoryPathURL, -fileURL, -heartbeatDateForTag, -heartbeatDictionaryWithFileURL, -initWithFileName, -setHearbeatDateforTag (+1 more)

### Community 159 - "Community 159"
Cohesion: 0.22
Nodes (9): GULKeychainStorage, -getObjectForKeyobjectClassaccessGroup, -getObjectFromKeychainForKeyobjectClassaccessGroup, -initWithService, -initWithServicecache, -keychainQueryWithKeyaccessGroup, -removeObjectForKeyaccessGroup, -resetInMemoryCache (+1 more)

### Community 160 - "Community 160"
Cohesion: 0.33
Nodes (6): CapacitorException, convertBody(), convertFormData(), createProxyUrl(), isRelativeOrProxyUrl(), readFileAsBase64()

### Community 161 - "Community 161"
Cohesion: 0.22
Nodes (8): ArrayUtils, BufferUtils, Entropy, ExtendedPrivateKey, MnemonicUtils, NumberUtils, SerialBuffer, StringUtils

### Community 162 - "Community 162"
Cohesion: 0.39
Nodes (7): C(), F(), G(), ne(), oe(), q(), T()

### Community 163 - "Community 163"
Cohesion: 0.25
Nodes (1): l

### Community 164 - "Community 164"
Cohesion: 0.25
Nodes (8): DDASLLogCapture, -aslMessageReceived, -captureAslLogs, -captureLevel, -configureAslQuery, -setCaptureLevel, -start, -stop

### Community 165 - "Community 165"
Cohesion: 0.25
Nodes (2): CALayer, UIView

### Community 166 - "Community 166"
Cohesion: 0.36
Nodes (1): URLSessionInterceptor

### Community 167 - "Community 167"
Cohesion: 0.25
Nodes (1): l

### Community 168 - "Community 168"
Cohesion: 0.39
Nodes (7): C(), F(), G(), ne(), oe(), q(), T()

### Community 169 - "Community 169"
Cohesion: 0.25
Nodes (1): y

### Community 170 - "Community 170"
Cohesion: 0.25
Nodes (1): i

### Community 171 - "Community 171"
Cohesion: 0.25
Nodes (0): 

### Community 172 - "Community 172"
Cohesion: 0.32
Nodes (5): Constants, FileManager, FileStorage, StorageFactory, UserDefaultsStorage

### Community 173 - "Community 173"
Cohesion: 0.25
Nodes (6): KeychainSwiftAccessOptions, accessibleAfterFirstUnlock, accessibleAfterFirstUnlockThisDeviceOnly, accessibleWhenPasscodeSetThisDeviceOnly, accessibleWhenUnlocked, accessibleWhenUnlockedThisDeviceOnly

### Community 174 - "Community 174"
Cohesion: 0.39
Nodes (4): handleAddEthereumChain(), handleSwitchEthereumChain(), normalizeChainId(), rejectChainRequest()

### Community 175 - "Community 175"
Cohesion: 0.25
Nodes (1): i

### Community 176 - "Community 176"
Cohesion: 0.39
Nodes (5): H(), J(), K(), X(), Y()

### Community 177 - "Community 177"
Cohesion: 0.25
Nodes (1): y

### Community 178 - "Community 178"
Cohesion: 0.29
Nodes (7): SVGTransform, -setMatrix, -setRotatecxcy, -setScalesy, -setSkewX, -setSkewY, -setTranslatety

### Community 179 - "Community 179"
Cohesion: 0.29
Nodes (7): SVGKImageView, -init, -initWithCoder, -initWithFrame, -initWithSVGKImage, -intrinsicContentSize, -isFlipped

### Community 180 - "Community 180"
Cohesion: 0.36
Nodes (1): Archive

### Community 181 - "Community 181"
Cohesion: 0.25
Nodes (5): PassthroughWindow, PassthroughWindow, SurveysWindow, UIWindow, UIWindow

### Community 182 - "Community 182"
Cohesion: 0.46
Nodes (1): URLSession

### Community 183 - "Community 183"
Cohesion: 0.39
Nodes (5): H(), J(), K(), X(), Y()

### Community 184 - "Community 184"
Cohesion: 0.25
Nodes (1): y

### Community 185 - "Community 185"
Cohesion: 0.25
Nodes (1): i

### Community 186 - "Community 186"
Cohesion: 0.43
Nodes (1): d

### Community 187 - "Community 187"
Cohesion: 0.57
Nodes (6): f(), H(), j(), K(), q(), Y()

### Community 188 - "Community 188"
Cohesion: 0.33
Nodes (6): FIRFirebaseUserAgent, -environmentComponents, -firebaseUserAgent, -init, -reset, -setValueforComponent

### Community 189 - "Community 189"
Cohesion: 0.33
Nodes (6): FIRBundleUtil, -bundleIdentifierByRemovingLastPartFrom, -hasBundleIdentifierPrefixinBundles, -optionsDictionaryPathWithResourceNameandFileTypeinBundles, -relevantBundles, -relevantURLSchemes

### Community 190 - "Community 190"
Cohesion: 0.29
Nodes (7): FIRMessagingExtensionHelper, -bundleIdentifierByRemovingLastPartFrom, -deliverNotification, -exportDeliveryMetricsToBigQueryWithMessageInfo, -fileExtensionForResponse, -loadAttachmentForURLcompletionHandler, -populateNotificationContentwithContentHandler

### Community 191 - "Community 191"
Cohesion: 0.29
Nodes (0): 

### Community 192 - "Community 192"
Cohesion: 0.57
Nodes (6): f(), H(), j(), K(), V(), z()

### Community 193 - "Community 193"
Cohesion: 0.43
Nodes (1): d

### Community 194 - "Community 194"
Cohesion: 0.43
Nodes (1): UIImage

### Community 195 - "Community 195"
Cohesion: 0.33
Nodes (6): CharacterData, -appendData, -deleteDatacount, -insertDataarg, -replaceDatacountarg, -substringDatacount

### Community 196 - "Community 196"
Cohesion: 0.33
Nodes (6): SVGKLayer, -dealloc, -init, -layer, -setShowBorder, -setSVGImage

### Community 197 - "Community 197"
Cohesion: 0.29
Nodes (3): Entry.CentralDirectoryStructure, Entry.DataDescriptor, Entry.LocalFileHeader

### Community 198 - "Community 198"
Cohesion: 0.38
Nodes (3): PostHogAPIDateFormatter, toISO8601Date(), toISO8601String()

### Community 199 - "Community 199"
Cohesion: 0.29
Nodes (0): 

### Community 200 - "Community 200"
Cohesion: 0.57
Nodes (6): f(), H(), j(), K(), V(), z()

### Community 201 - "Community 201"
Cohesion: 0.43
Nodes (1): d

### Community 202 - "Community 202"
Cohesion: 0.29
Nodes (7): addReceiptTransaction, DevModal Network Switch Purge, discoverRemoteSignersFromBlockchain, getOurRemoteSignerAddresses, remote_signers Table, syncWallets, verifyRemoteSignersDb

### Community 203 - "Community 203"
Cohesion: 0.33
Nodes (1): o

### Community 204 - "Community 204"
Cohesion: 0.6
Nodes (4): D(), P(), R(), w()

### Community 205 - "Community 205"
Cohesion: 0.4
Nodes (5): FIRAnalyticsConfiguration, -postNotificationNamevalue, -setAnalyticsCollectionEnabled, -setAnalyticsCollectionEnabledpersistSetting, -sharedInstance

### Community 206 - "Community 206"
Cohesion: 0.33
Nodes (1): HeartbeatController

### Community 207 - "Community 207"
Cohesion: 0.33
Nodes (6): GULNetworkInfo, -formatMccandMNC, -getNetworkMobileCountryCode, -getNetworkMobileNetworkCode, -getNetworkRadioType, -getNetworkType

### Community 208 - "Community 208"
Cohesion: 0.33
Nodes (6): GULKeychainUtils, -getItemWithQueryerror, -keychainErrorWithFunctionstatus, -multiplatformQueryWithQuery, -removeItemWithQueryerror, -setItemwithQueryerror

### Community 209 - "Community 209"
Cohesion: 0.33
Nodes (0): 

### Community 210 - "Community 210"
Cohesion: 0.6
Nodes (4): D(), P(), R(), w()

### Community 211 - "Community 211"
Cohesion: 0.33
Nodes (1): r

### Community 212 - "Community 212"
Cohesion: 0.33
Nodes (1): o

### Community 213 - "Community 213"
Cohesion: 0.33
Nodes (1): IONCAMRFactory

### Community 214 - "Community 214"
Cohesion: 0.4
Nodes (1): UIImage

### Community 215 - "Community 215"
Cohesion: 0.53
Nodes (1): URL

### Community 216 - "Community 216"
Cohesion: 0.4
Nodes (3): Date, stat, timeval

### Community 217 - "Community 217"
Cohesion: 0.33
Nodes (1): ReadWriteLock

### Community 218 - "Community 218"
Cohesion: 0.47
Nodes (2): TimeBasedEpochGenerator, UInt64

### Community 219 - "Community 219"
Cohesion: 0.4
Nodes (4): PostHogSurveysDefaultDelegate, renderSurvey(), setupWindow(), PostHogSurveysDelegate

### Community 220 - "Community 220"
Cohesion: 0.53
Nodes (2): imageToBase64(), UIImage

### Community 221 - "Community 221"
Cohesion: 0.33
Nodes (1): o

### Community 222 - "Community 222"
Cohesion: 0.33
Nodes (1): r

### Community 223 - "Community 223"
Cohesion: 0.6
Nodes (4): D(), P(), R(), w()

### Community 224 - "Community 224"
Cohesion: 0.4
Nodes (6): fastlane android beta, fastlane ios beta, fastlane ios screenshots, Fastlane README, fastlane CLI, Xcode Command Line Tools

### Community 225 - "Community 225"
Cohesion: 0.5
Nodes (1): r

### Community 226 - "Community 226"
Cohesion: 0.4
Nodes (1): e

### Community 227 - "Community 227"
Cohesion: 0.6
Nodes (3): H(), O(), U()

### Community 228 - "Community 228"
Cohesion: 0.5
Nodes (0): 

### Community 229 - "Community 229"
Cohesion: 0.4
Nodes (5): FBLPromise, -onQueuereducecombine, -reduce, -reducecombine, -reduceOn

### Community 230 - "Community 230"
Cohesion: 0.4
Nodes (5): GULSecureCoding, -archivedDataWithRootObjecterror, -archivingErrorWithException, -unarchivedObjectOfClassesfromDataerror, -unarchivedObjectOfClassfromDataerror

### Community 231 - "Community 231"
Cohesion: 0.4
Nodes (5): GULHeartbeatDateStorageUserDefaults, -heartbeatDateForTag, -heartbeatDictionaryFromDefaults, -initWithDefaultskey, -setHearbeatDateforTag

### Community 232 - "Community 232"
Cohesion: 0.4
Nodes (0): 

### Community 233 - "Community 233"
Cohesion: 0.6
Nodes (3): H(), O(), U()

### Community 234 - "Community 234"
Cohesion: 0.4
Nodes (0): 

### Community 235 - "Community 235"
Cohesion: 0.5
Nodes (1): r

### Community 236 - "Community 236"
Cohesion: 0.6
Nodes (2): M(), x()

### Community 237 - "Community 237"
Cohesion: 0.4
Nodes (1): e

### Community 238 - "Community 238"
Cohesion: 0.4
Nodes (1): IONCAMRCoordinator

### Community 239 - "Community 239"
Cohesion: 0.4
Nodes (3): Bundle, ImageEditor, IONCAMRAssets

### Community 240 - "Community 240"
Cohesion: 0.5
Nodes (4): AppleSucksDOMImplementation, -createDocumentqualifiedNamedoctype, -createDocumentTypepublicIdsystemId, -hasFeatureversion

### Community 241 - "Community 241"
Cohesion: 0.5
Nodes (4): MediaList, -appendMedium, -deleteMedium, -item

### Community 242 - "Community 242"
Cohesion: 0.5
Nodes (2): Archive, BackingConfiguration

### Community 243 - "Community 243"
Cohesion: 0.4
Nodes (3): CALayer, UIView, View

### Community 244 - "Community 244"
Cohesion: 0.4
Nodes (3): CALayer, UIView, View

### Community 245 - "Community 245"
Cohesion: 0.5
Nodes (1): r

### Community 246 - "Community 246"
Cohesion: 0.6
Nodes (3): H(), O(), U()

### Community 247 - "Community 247"
Cohesion: 0.5
Nodes (0): 

### Community 248 - "Community 248"
Cohesion: 0.4
Nodes (0): 

### Community 249 - "Community 249"
Cohesion: 0.4
Nodes (1): e

### Community 250 - "Community 250"
Cohesion: 0.4
Nodes (0): 

### Community 251 - "Community 251"
Cohesion: 0.5
Nodes (1): o

### Community 252 - "Community 252"
Cohesion: 0.5
Nodes (1): m

### Community 253 - "Community 253"
Cohesion: 0.5
Nodes (1): i

### Community 254 - "Community 254"
Cohesion: 0.67
Nodes (0): 

### Community 255 - "Community 255"
Cohesion: 0.5
Nodes (1): n

### Community 256 - "Community 256"
Cohesion: 0.67
Nodes (2): FIRComponentType, -instanceForProtocolinContainer

### Community 257 - "Community 257"
Cohesion: 0.5
Nodes (4): FIRConfiguration, -init, -setLoggerLevel, -sharedInstance

### Community 258 - "Community 258"
Cohesion: 0.5
Nodes (4): FBLPromise, -do, -doOn, -onQueuedo

### Community 259 - "Community 259"
Cohesion: 0.5
Nodes (4): FBLPromise, -delay, -delayOn, -onQueuedelay

### Community 260 - "Community 260"
Cohesion: 0.5
Nodes (4): FBLPromise, -onQueuethen, -then, -thenOn

### Community 261 - "Community 261"
Cohesion: 0.5
Nodes (4): FBLPromise, -onQueuetimeout, -timeout, -timeoutOn

### Community 262 - "Community 262"
Cohesion: 0.5
Nodes (4): FBLPromise, -any, -anyOn, -onQueueany

### Community 263 - "Community 263"
Cohesion: 0.5
Nodes (4): FBLPromise, -async, -asyncOn, -onQueueasync

### Community 264 - "Community 264"
Cohesion: 0.5
Nodes (4): FBLPromise, -always, -alwaysOn, -onQueuealways

### Community 265 - "Community 265"
Cohesion: 0.5
Nodes (4): FBLPromise, -catch, -catchOn, -onQueuecatch

### Community 266 - "Community 266"
Cohesion: 0.5
Nodes (4): FBLPromise, -onQueuerecover, -recover, -recoverOn

### Community 267 - "Community 267"
Cohesion: 0.5
Nodes (4): FBLPromise, -onQueuerace, -race, -raceOn

### Community 268 - "Community 268"
Cohesion: 0.5
Nodes (4): FBLPromise, -all, -allOn, -onQueueall

### Community 269 - "Community 269"
Cohesion: 0.5
Nodes (4): FBLPromise, -onQueuevalidate, -validate, -validateOn

### Community 270 - "Community 270"
Cohesion: 0.67
Nodes (2): initProvider(), retryInit()

### Community 271 - "Community 271"
Cohesion: 0.5
Nodes (3): DynamicScroller, DynamicScrollerItem, RecycleScroller

### Community 272 - "Community 272"
Cohesion: 0.5
Nodes (0): 

### Community 273 - "Community 273"
Cohesion: 0.5
Nodes (0): 

### Community 274 - "Community 274"
Cohesion: 0.67
Nodes (2): fetchPageDescription(), getPageMetadata()

### Community 275 - "Community 275"
Cohesion: 0.5
Nodes (0): 

### Community 276 - "Community 276"
Cohesion: 0.5
Nodes (0): 

### Community 277 - "Community 277"
Cohesion: 0.5
Nodes (0): 

### Community 278 - "Community 278"
Cohesion: 0.5
Nodes (0): 

### Community 279 - "Community 279"
Cohesion: 0.67
Nodes (2): J(), Q()

### Community 280 - "Community 280"
Cohesion: 0.5
Nodes (1): n

### Community 281 - "Community 281"
Cohesion: 0.5
Nodes (1): o

### Community 282 - "Community 282"
Cohesion: 0.5
Nodes (1): p

### Community 283 - "Community 283"
Cohesion: 0.67
Nodes (2): J(), Q()

### Community 284 - "Community 284"
Cohesion: 0.67
Nodes (3): CLIColor, -colorWithCalibratedRedgreenbluealpha, -getRedgreenbluealpha

### Community 285 - "Community 285"
Cohesion: 0.67
Nodes (3): Text, -initWithValue, -splitText

### Community 286 - "Community 286"
Cohesion: 0.67
Nodes (3): SVGAnimatedPreserveAspectRatio, -animVal, -init

### Community 287 - "Community 287"
Cohesion: 0.67
Nodes (3): SVGAngle, -convertToSpecifiedUnits, -newValueSpecifiedUnitsvalueInSpecifiedUnits

### Community 288 - "Community 288"
Cohesion: 0.5
Nodes (1): Archive

### Community 289 - "Community 289"
Cohesion: 0.5
Nodes (1): Data

### Community 290 - "Community 290"
Cohesion: 0.67
Nodes (2): sanitizeDictionary(), toJSONData()

### Community 291 - "Community 291"
Cohesion: 0.5
Nodes (1): PostHogMulticastCallback

### Community 292 - "Community 292"
Cohesion: 0.5
Nodes (0): 

### Community 293 - "Community 293"
Cohesion: 0.5
Nodes (2): ButtonStyle, SurveyButtonStyle

### Community 294 - "Community 294"
Cohesion: 0.67
Nodes (2): Date, dateToMillis()

### Community 295 - "Community 295"
Cohesion: 0.5
Nodes (1): NetworkSample

### Community 296 - "Community 296"
Cohesion: 0.5
Nodes (1): p

### Community 297 - "Community 297"
Cohesion: 0.83
Nodes (3): a(), r(), s()

### Community 298 - "Community 298"
Cohesion: 0.5
Nodes (1): n

### Community 299 - "Community 299"
Cohesion: 0.5
Nodes (1): o

### Community 300 - "Community 300"
Cohesion: 0.67
Nodes (0): 

### Community 301 - "Community 301"
Cohesion: 0.67
Nodes (0): 

### Community 302 - "Community 302"
Cohesion: 0.67
Nodes (0): 

### Community 303 - "Community 303"
Cohesion: 0.67
Nodes (0): 

### Community 304 - "Community 304"
Cohesion: 0.67
Nodes (0): 

### Community 305 - "Community 305"
Cohesion: 1.0
Nodes (2): A(), E()

### Community 306 - "Community 306"
Cohesion: 0.67
Nodes (1): s

### Community 307 - "Community 307"
Cohesion: 0.67
Nodes (0): 

### Community 308 - "Community 308"
Cohesion: 0.67
Nodes (3): GDTCOREndpoints, -uploadURLForTarget, -uploadURLs

### Community 309 - "Community 309"
Cohesion: 0.67
Nodes (3): FIRMessagingMessageInfo, -init, -initWithStatus

### Community 310 - "Community 310"
Cohesion: 0.67
Nodes (3): NSData, -gul_dataByGzippingDataerror, -gul_dataByInflatingGzippedDataerror

### Community 311 - "Community 311"
Cohesion: 0.67
Nodes (1): pb_field_iter_next()

### Community 312 - "Community 312"
Cohesion: 0.67
Nodes (1): KeychainSwiftConstants

### Community 313 - "Community 313"
Cohesion: 0.67
Nodes (1): ExampleInstrumentedTest

### Community 314 - "Community 314"
Cohesion: 0.67
Nodes (1): ExampleUnitTest

### Community 315 - "Community 315"
Cohesion: 0.67
Nodes (0): 

### Community 316 - "Community 316"
Cohesion: 0.67
Nodes (1): MockContract

### Community 317 - "Community 317"
Cohesion: 0.67
Nodes (0): 

### Community 318 - "Community 318"
Cohesion: 0.67
Nodes (0): 

### Community 319 - "Community 319"
Cohesion: 0.67
Nodes (0): 

### Community 320 - "Community 320"
Cohesion: 1.0
Nodes (2): a(), l()

### Community 321 - "Community 321"
Cohesion: 0.67
Nodes (0): 

### Community 322 - "Community 322"
Cohesion: 0.67
Nodes (0): 

### Community 323 - "Community 323"
Cohesion: 0.67
Nodes (0): 

### Community 324 - "Community 324"
Cohesion: 0.67
Nodes (0): 

### Community 325 - "Community 325"
Cohesion: 0.67
Nodes (0): 

### Community 326 - "Community 326"
Cohesion: 0.67
Nodes (0): 

### Community 327 - "Community 327"
Cohesion: 0.67
Nodes (1): s

### Community 328 - "Community 328"
Cohesion: 1.0
Nodes (2): A(), E()

### Community 329 - "Community 329"
Cohesion: 0.67
Nodes (1): Data

### Community 330 - "Community 330"
Cohesion: 0.67
Nodes (1): CGSize

### Community 331 - "Community 331"
Cohesion: 1.0
Nodes (2): DocumentFragment, -init

### Community 332 - "Community 332"
Cohesion: 1.0
Nodes (2): CDATASection, -initWithValue

### Community 333 - "Community 333"
Cohesion: 1.0
Nodes (2): ProcessingInstruction, -initProcessingInstructionvalue

### Community 334 - "Community 334"
Cohesion: 1.0
Nodes (2): Comment, -initWithValue

### Community 335 - "Community 335"
Cohesion: 1.0
Nodes (2): SVGPreserveAspectRatio, -init

### Community 336 - "Community 336"
Cohesion: 1.0
Nodes (2): SVGPoint, -matrixTransform

### Community 337 - "Community 337"
Cohesion: 0.67
Nodes (1): Archive

### Community 338 - "Community 338"
Cohesion: 0.67
Nodes (1): URL

### Community 339 - "Community 339"
Cohesion: 0.67
Nodes (1): Archive

### Community 340 - "Community 340"
Cohesion: 0.67
Nodes (1): FileManager

### Community 341 - "Community 341"
Cohesion: 0.67
Nodes (1): Archive

### Community 342 - "Community 342"
Cohesion: 0.67
Nodes (1): UIImage

### Community 343 - "Community 343"
Cohesion: 0.67
Nodes (1): UUID

### Community 344 - "Community 344"
Cohesion: 0.67
Nodes (0): 

### Community 345 - "Community 345"
Cohesion: 1.0
Nodes (2): sampleOnProperty(), simpleHash()

### Community 346 - "Community 346"
Cohesion: 0.67
Nodes (1): UITextInputTraits

### Community 347 - "Community 347"
Cohesion: 0.67
Nodes (1): CGSize

### Community 348 - "Community 348"
Cohesion: 0.67
Nodes (1): String

### Community 349 - "Community 349"
Cohesion: 0.67
Nodes (1): BinaryFloatingPoint

### Community 350 - "Community 350"
Cohesion: 0.67
Nodes (1): UIColor

### Community 351 - "Community 351"
Cohesion: 0.67
Nodes (1): CGColor

### Community 352 - "Community 352"
Cohesion: 0.67
Nodes (1): RRStyle

### Community 353 - "Community 353"
Cohesion: 1.0
Nodes (2): maskImage(), toDict()

### Community 354 - "Community 354"
Cohesion: 1.0
Nodes (2): I(), N()

### Community 355 - "Community 355"
Cohesion: 0.67
Nodes (1): s

### Community 356 - "Community 356"
Cohesion: 0.67
Nodes (0): 

### Community 357 - "Community 357"
Cohesion: 0.67
Nodes (0): 

### Community 358 - "Community 358"
Cohesion: 1.0
Nodes (2): C(), M()

### Community 359 - "Community 359"
Cohesion: 0.67
Nodes (0): 

### Community 360 - "Community 360"
Cohesion: 0.67
Nodes (0): 

### Community 361 - "Community 361"
Cohesion: 0.67
Nodes (3): kyc.initializeSdk (Sumsub init), kyc.registerListeners (Sumsub events), updateNakaIdentificationToken

### Community 362 - "Community 362"
Cohesion: 1.0
Nodes (0): 

### Community 363 - "Community 363"
Cohesion: 1.0
Nodes (0): 

### Community 364 - "Community 364"
Cohesion: 1.0
Nodes (0): 

### Community 365 - "Community 365"
Cohesion: 1.0
Nodes (0): 

### Community 366 - "Community 366"
Cohesion: 1.0
Nodes (0): 

### Community 367 - "Community 367"
Cohesion: 1.0
Nodes (0): 

### Community 368 - "Community 368"
Cohesion: 1.0
Nodes (0): 

### Community 369 - "Community 369"
Cohesion: 1.0
Nodes (0): 

### Community 370 - "Community 370"
Cohesion: 1.0
Nodes (0): 

### Community 371 - "Community 371"
Cohesion: 1.0
Nodes (0): 

### Community 372 - "Community 372"
Cohesion: 1.0
Nodes (0): 

### Community 373 - "Community 373"
Cohesion: 1.0
Nodes (0): 

### Community 374 - "Community 374"
Cohesion: 1.0
Nodes (0): 

### Community 375 - "Community 375"
Cohesion: 2.0
Nodes (0): 

### Community 376 - "Community 376"
Cohesion: 1.0
Nodes (0): 

### Community 377 - "Community 377"
Cohesion: 1.0
Nodes (0): 

### Community 378 - "Community 378"
Cohesion: 1.0
Nodes (0): 

### Community 379 - "Community 379"
Cohesion: 1.0
Nodes (0): 

### Community 380 - "Community 380"
Cohesion: 1.0
Nodes (0): 

### Community 381 - "Community 381"
Cohesion: 1.0
Nodes (0): 

### Community 382 - "Community 382"
Cohesion: 1.0
Nodes (0): 

### Community 383 - "Community 383"
Cohesion: 1.0
Nodes (0): 

### Community 384 - "Community 384"
Cohesion: 1.0
Nodes (0): 

### Community 385 - "Community 385"
Cohesion: 1.0
Nodes (0): 

### Community 386 - "Community 386"
Cohesion: 1.0
Nodes (0): 

### Community 387 - "Community 387"
Cohesion: 1.0
Nodes (0): 

### Community 388 - "Community 388"
Cohesion: 1.0
Nodes (0): 

### Community 389 - "Community 389"
Cohesion: 1.0
Nodes (0): 

### Community 390 - "Community 390"
Cohesion: 1.0
Nodes (0): 

### Community 391 - "Community 391"
Cohesion: 1.0
Nodes (0): 

### Community 392 - "Community 392"
Cohesion: 1.0
Nodes (0): 

### Community 393 - "Community 393"
Cohesion: 1.0
Nodes (0): 

### Community 394 - "Community 394"
Cohesion: 1.0
Nodes (0): 

### Community 395 - "Community 395"
Cohesion: 1.0
Nodes (0): 

### Community 396 - "Community 396"
Cohesion: 1.0
Nodes (0): 

### Community 397 - "Community 397"
Cohesion: 1.0
Nodes (0): 

### Community 398 - "Community 398"
Cohesion: 1.0
Nodes (0): 

### Community 399 - "Community 399"
Cohesion: 1.0
Nodes (0): 

### Community 400 - "Community 400"
Cohesion: 1.0
Nodes (0): 

### Community 401 - "Community 401"
Cohesion: 2.0
Nodes (0): 

### Community 402 - "Community 402"
Cohesion: 1.0
Nodes (0): 

### Community 403 - "Community 403"
Cohesion: 1.0
Nodes (0): 

### Community 404 - "Community 404"
Cohesion: 1.0
Nodes (2): FBLPromise, -dispatchGroup

### Community 405 - "Community 405"
Cohesion: 1.0
Nodes (1): WeakContainer

### Community 406 - "Community 406"
Cohesion: 1.0
Nodes (2): GULURLSessionDataResponse, -initWithResponseHTTPBody

### Community 407 - "Community 407"
Cohesion: 1.0
Nodes (2): NSURLSession, -gul_dataTaskPromiseWithRequest

### Community 408 - "Community 408"
Cohesion: 1.0
Nodes (1): MainActivity

### Community 409 - "Community 409"
Cohesion: 1.0
Nodes (0): 

### Community 410 - "Community 410"
Cohesion: 1.0
Nodes (0): 

### Community 411 - "Community 411"
Cohesion: 1.0
Nodes (0): 

### Community 412 - "Community 412"
Cohesion: 1.0
Nodes (0): 

### Community 413 - "Community 413"
Cohesion: 1.0
Nodes (0): 

### Community 414 - "Community 414"
Cohesion: 1.0
Nodes (0): 

### Community 415 - "Community 415"
Cohesion: 1.0
Nodes (0): 

### Community 416 - "Community 416"
Cohesion: 1.0
Nodes (0): 

### Community 417 - "Community 417"
Cohesion: 1.0
Nodes (0): 

### Community 418 - "Community 418"
Cohesion: 1.0
Nodes (0): 

### Community 419 - "Community 419"
Cohesion: 1.0
Nodes (0): 

### Community 420 - "Community 420"
Cohesion: 1.0
Nodes (0): 

### Community 421 - "Community 421"
Cohesion: 1.0
Nodes (0): 

### Community 422 - "Community 422"
Cohesion: 2.0
Nodes (1): CSSRule

### Community 423 - "Community 423"
Cohesion: 1.0
Nodes (0): 

### Community 424 - "Community 424"
Cohesion: 1.0
Nodes (0): 

### Community 425 - "Community 425"
Cohesion: 1.0
Nodes (0): 

### Community 426 - "Community 426"
Cohesion: 1.0
Nodes (0): 

### Community 427 - "Community 427"
Cohesion: 1.0
Nodes (0): 

### Community 428 - "Community 428"
Cohesion: 1.0
Nodes (0): 

### Community 429 - "Community 429"
Cohesion: 1.0
Nodes (0): 

### Community 430 - "Community 430"
Cohesion: 1.0
Nodes (0): 

### Community 431 - "Community 431"
Cohesion: 1.0
Nodes (0): 

### Community 432 - "Community 432"
Cohesion: 1.0
Nodes (0): 

### Community 433 - "Community 433"
Cohesion: 1.0
Nodes (0): 

### Community 434 - "Community 434"
Cohesion: 1.0
Nodes (0): 

### Community 435 - "Community 435"
Cohesion: 1.0
Nodes (0): 

### Community 436 - "Community 436"
Cohesion: 1.0
Nodes (0): 

### Community 437 - "Community 437"
Cohesion: 1.0
Nodes (0): 

### Community 438 - "Community 438"
Cohesion: 1.0
Nodes (0): 

### Community 439 - "Community 439"
Cohesion: 1.0
Nodes (0): 

### Community 440 - "Community 440"
Cohesion: 1.0
Nodes (0): 

### Community 441 - "Community 441"
Cohesion: 1.0
Nodes (0): 

### Community 442 - "Community 442"
Cohesion: 1.0
Nodes (0): 

### Community 443 - "Community 443"
Cohesion: 1.0
Nodes (0): 

### Community 444 - "Community 444"
Cohesion: 1.0
Nodes (0): 

### Community 445 - "Community 445"
Cohesion: 1.0
Nodes (0): 

### Community 446 - "Community 446"
Cohesion: 1.0
Nodes (0): 

### Community 447 - "Community 447"
Cohesion: 1.0
Nodes (0): 

### Community 448 - "Community 448"
Cohesion: 1.0
Nodes (0): 

### Community 449 - "Community 449"
Cohesion: 1.0
Nodes (0): 

### Community 450 - "Community 450"
Cohesion: 1.0
Nodes (0): 

### Community 451 - "Community 451"
Cohesion: 2.0
Nodes (0): 

### Community 452 - "Community 452"
Cohesion: 1.0
Nodes (0): 

### Community 453 - "Community 453"
Cohesion: 1.0
Nodes (0): 

### Community 454 - "Community 454"
Cohesion: 1.0
Nodes (0): 

### Community 455 - "Community 455"
Cohesion: 1.0
Nodes (0): 

### Community 456 - "Community 456"
Cohesion: 1.0
Nodes (0): 

### Community 457 - "Community 457"
Cohesion: 1.0
Nodes (0): 

### Community 458 - "Community 458"
Cohesion: 1.0
Nodes (0): 

### Community 459 - "Community 459"
Cohesion: 1.0
Nodes (0): 

### Community 460 - "Community 460"
Cohesion: 1.0
Nodes (0): 

### Community 461 - "Community 461"
Cohesion: 1.0
Nodes (0): 

### Community 462 - "Community 462"
Cohesion: 1.0
Nodes (0): 

### Community 463 - "Community 463"
Cohesion: 1.0
Nodes (0): 

### Community 464 - "Community 464"
Cohesion: 1.0
Nodes (0): 

### Community 465 - "Community 465"
Cohesion: 1.0
Nodes (0): 

### Community 466 - "Community 466"
Cohesion: 1.0
Nodes (0): 

### Community 467 - "Community 467"
Cohesion: 1.0
Nodes (0): 

### Community 468 - "Community 468"
Cohesion: 1.0
Nodes (0): 

### Community 469 - "Community 469"
Cohesion: 2.0
Nodes (1): SVGStyleElement

### Community 470 - "Community 470"
Cohesion: 2.0
Nodes (1): EntityReference

### Community 471 - "Community 471"
Cohesion: 2.0
Nodes (1): DocumentType

### Community 472 - "Community 472"
Cohesion: 2.0
Nodes (1): StyleSheet

### Community 473 - "Community 473"
Cohesion: 2.0
Nodes (1): SVGTextContentElement

### Community 474 - "Community 474"
Cohesion: 1.0
Nodes (1): PostHogSDK

### Community 475 - "Community 475"
Cohesion: 1.0
Nodes (0): 

### Community 476 - "Community 476"
Cohesion: 1.0
Nodes (1): PostHogConsumerPayload

### Community 477 - "Community 477"
Cohesion: 1.0
Nodes (0): 

### Community 478 - "Community 478"
Cohesion: 1.0
Nodes (1): PostHogPropertiesSanitizer

### Community 479 - "Community 479"
Cohesion: 1.0
Nodes (1): PostHogBatchUploadInfo

### Community 480 - "Community 480"
Cohesion: 1.0
Nodes (1): UIView

### Community 481 - "Community 481"
Cohesion: 1.0
Nodes (1): AssociatedKeys

### Community 482 - "Community 482"
Cohesion: 1.0
Nodes (1): Optional

### Community 483 - "Community 483"
Cohesion: 1.0
Nodes (1): ViewTreeSnapshotStatus

### Community 484 - "Community 484"
Cohesion: 1.0
Nodes (0): 

### Community 485 - "Community 485"
Cohesion: 1.0
Nodes (0): 

### Community 486 - "Community 486"
Cohesion: 1.0
Nodes (0): 

### Community 487 - "Community 487"
Cohesion: 1.0
Nodes (0): 

### Community 488 - "Community 488"
Cohesion: 1.0
Nodes (0): 

### Community 489 - "Community 489"
Cohesion: 1.0
Nodes (0): 

### Community 490 - "Community 490"
Cohesion: 1.0
Nodes (0): 

### Community 491 - "Community 491"
Cohesion: 1.0
Nodes (0): 

### Community 492 - "Community 492"
Cohesion: 1.0
Nodes (0): 

### Community 493 - "Community 493"
Cohesion: 1.0
Nodes (0): 

### Community 494 - "Community 494"
Cohesion: 1.0
Nodes (0): 

### Community 495 - "Community 495"
Cohesion: 1.0
Nodes (0): 

### Community 496 - "Community 496"
Cohesion: 1.0
Nodes (0): 

### Community 497 - "Community 497"
Cohesion: 1.0
Nodes (0): 

### Community 498 - "Community 498"
Cohesion: 1.0
Nodes (0): 

### Community 499 - "Community 499"
Cohesion: 1.0
Nodes (0): 

### Community 500 - "Community 500"
Cohesion: 1.0
Nodes (0): 

### Community 501 - "Community 501"
Cohesion: 1.0
Nodes (0): 

### Community 502 - "Community 502"
Cohesion: 1.0
Nodes (0): 

### Community 503 - "Community 503"
Cohesion: 1.0
Nodes (0): 

### Community 504 - "Community 504"
Cohesion: 1.0
Nodes (0): 

### Community 505 - "Community 505"
Cohesion: 1.0
Nodes (0): 

### Community 506 - "Community 506"
Cohesion: 1.0
Nodes (0): 

### Community 507 - "Community 507"
Cohesion: 1.0
Nodes (0): 

### Community 508 - "Community 508"
Cohesion: 1.0
Nodes (0): 

### Community 509 - "Community 509"
Cohesion: 1.0
Nodes (0): 

### Community 510 - "Community 510"
Cohesion: 1.0
Nodes (0): 

### Community 511 - "Community 511"
Cohesion: 1.0
Nodes (0): 

### Community 512 - "Community 512"
Cohesion: 1.0
Nodes (0): 

### Community 513 - "Community 513"
Cohesion: 1.0
Nodes (0): 

### Community 514 - "Community 514"
Cohesion: 1.0
Nodes (0): 

### Community 515 - "Community 515"
Cohesion: 1.0
Nodes (0): 

### Community 516 - "Community 516"
Cohesion: 1.0
Nodes (0): 

### Community 517 - "Community 517"
Cohesion: 1.0
Nodes (0): 

### Community 518 - "Community 518"
Cohesion: 1.0
Nodes (0): 

### Community 519 - "Community 519"
Cohesion: 1.0
Nodes (0): 

### Community 520 - "Community 520"
Cohesion: 1.0
Nodes (0): 

### Community 521 - "Community 521"
Cohesion: 1.0
Nodes (0): 

### Community 522 - "Community 522"
Cohesion: 1.0
Nodes (0): 

### Community 523 - "Community 523"
Cohesion: 1.0
Nodes (0): 

### Community 524 - "Community 524"
Cohesion: 2.0
Nodes (0): 

### Community 525 - "Community 525"
Cohesion: 1.0
Nodes (2): useKyc Pinia Store, useNaka Pinia Store

### Community 526 - "Community 526"
Cohesion: 1.0
Nodes (0): 

### Community 527 - "Community 527"
Cohesion: 1.0
Nodes (0): 

### Community 528 - "Community 528"
Cohesion: 1.0
Nodes (0): 

### Community 529 - "Community 529"
Cohesion: 1.0
Nodes (2): cache/logs.txt Persisted Logs, useLogger composable

### Community 530 - "Community 530"
Cohesion: 1.0
Nodes (2): categorizeTransactions, filterUnseen

### Community 531 - "Community 531"
Cohesion: 1.0
Nodes (0): 

### Community 532 - "Community 532"
Cohesion: 1.0
Nodes (0): 

### Community 533 - "Community 533"
Cohesion: 1.0
Nodes (0): 

### Community 534 - "Community 534"
Cohesion: 1.0
Nodes (0): 

### Community 535 - "Community 535"
Cohesion: 1.0
Nodes (0): 

### Community 536 - "Community 536"
Cohesion: 1.0
Nodes (0): 

### Community 537 - "Community 537"
Cohesion: 1.0
Nodes (0): 

### Community 538 - "Community 538"
Cohesion: 1.0
Nodes (0): 

### Community 539 - "Community 539"
Cohesion: 1.0
Nodes (0): 

### Community 540 - "Community 540"
Cohesion: 1.0
Nodes (0): 

### Community 541 - "Community 541"
Cohesion: 1.0
Nodes (0): 

### Community 542 - "Community 542"
Cohesion: 1.0
Nodes (0): 

### Community 543 - "Community 543"
Cohesion: 1.0
Nodes (0): 

### Community 544 - "Community 544"
Cohesion: 1.0
Nodes (0): 

### Community 545 - "Community 545"
Cohesion: 1.0
Nodes (0): 

### Community 546 - "Community 546"
Cohesion: 1.0
Nodes (0): 

### Community 547 - "Community 547"
Cohesion: 1.0
Nodes (0): 

### Community 548 - "Community 548"
Cohesion: 1.0
Nodes (0): 

### Community 549 - "Community 549"
Cohesion: 1.0
Nodes (0): 

### Community 550 - "Community 550"
Cohesion: 1.0
Nodes (0): 

### Community 551 - "Community 551"
Cohesion: 1.0
Nodes (0): 

### Community 552 - "Community 552"
Cohesion: 1.0
Nodes (0): 

### Community 553 - "Community 553"
Cohesion: 1.0
Nodes (0): 

### Community 554 - "Community 554"
Cohesion: 1.0
Nodes (0): 

### Community 555 - "Community 555"
Cohesion: 1.0
Nodes (0): 

### Community 556 - "Community 556"
Cohesion: 1.0
Nodes (0): 

### Community 557 - "Community 557"
Cohesion: 1.0
Nodes (0): 

### Community 558 - "Community 558"
Cohesion: 1.0
Nodes (0): 

### Community 559 - "Community 559"
Cohesion: 1.0
Nodes (0): 

### Community 560 - "Community 560"
Cohesion: 1.0
Nodes (0): 

### Community 561 - "Community 561"
Cohesion: 1.0
Nodes (0): 

### Community 562 - "Community 562"
Cohesion: 1.0
Nodes (0): 

### Community 563 - "Community 563"
Cohesion: 1.0
Nodes (0): 

### Community 564 - "Community 564"
Cohesion: 1.0
Nodes (0): 

### Community 565 - "Community 565"
Cohesion: 1.0
Nodes (0): 

### Community 566 - "Community 566"
Cohesion: 1.0
Nodes (0): 

### Community 567 - "Community 567"
Cohesion: 1.0
Nodes (0): 

### Community 568 - "Community 568"
Cohesion: 1.0
Nodes (0): 

### Community 569 - "Community 569"
Cohesion: 1.0
Nodes (0): 

### Community 570 - "Community 570"
Cohesion: 1.0
Nodes (0): 

### Community 571 - "Community 571"
Cohesion: 1.0
Nodes (0): 

### Community 572 - "Community 572"
Cohesion: 1.0
Nodes (0): 

### Community 573 - "Community 573"
Cohesion: 1.0
Nodes (0): 

### Community 574 - "Community 574"
Cohesion: 1.0
Nodes (0): 

### Community 575 - "Community 575"
Cohesion: 1.0
Nodes (0): 

### Community 576 - "Community 576"
Cohesion: 1.0
Nodes (0): 

### Community 577 - "Community 577"
Cohesion: 1.0
Nodes (0): 

### Community 578 - "Community 578"
Cohesion: 1.0
Nodes (0): 

### Community 579 - "Community 579"
Cohesion: 1.0
Nodes (0): 

### Community 580 - "Community 580"
Cohesion: 1.0
Nodes (0): 

### Community 581 - "Community 581"
Cohesion: 1.0
Nodes (0): 

### Community 582 - "Community 582"
Cohesion: 1.0
Nodes (0): 

### Community 583 - "Community 583"
Cohesion: 1.0
Nodes (0): 

### Community 584 - "Community 584"
Cohesion: 1.0
Nodes (0): 

### Community 585 - "Community 585"
Cohesion: 1.0
Nodes (0): 

### Community 586 - "Community 586"
Cohesion: 1.0
Nodes (0): 

### Community 587 - "Community 587"
Cohesion: 1.0
Nodes (0): 

### Community 588 - "Community 588"
Cohesion: 1.0
Nodes (0): 

### Community 589 - "Community 589"
Cohesion: 1.0
Nodes (0): 

### Community 590 - "Community 590"
Cohesion: 1.0
Nodes (0): 

### Community 591 - "Community 591"
Cohesion: 1.0
Nodes (0): 

### Community 592 - "Community 592"
Cohesion: 1.0
Nodes (0): 

### Community 593 - "Community 593"
Cohesion: 1.0
Nodes (0): 

### Community 594 - "Community 594"
Cohesion: 1.0
Nodes (0): 

### Community 595 - "Community 595"
Cohesion: 1.0
Nodes (0): 

### Community 596 - "Community 596"
Cohesion: 1.0
Nodes (0): 

### Community 597 - "Community 597"
Cohesion: 1.0
Nodes (0): 

### Community 598 - "Community 598"
Cohesion: 1.0
Nodes (0): 

### Community 599 - "Community 599"
Cohesion: 1.0
Nodes (0): 

### Community 600 - "Community 600"
Cohesion: 1.0
Nodes (0): 

### Community 601 - "Community 601"
Cohesion: 1.0
Nodes (0): 

### Community 602 - "Community 602"
Cohesion: 1.0
Nodes (0): 

### Community 603 - "Community 603"
Cohesion: 1.0
Nodes (0): 

### Community 604 - "Community 604"
Cohesion: 1.0
Nodes (0): 

### Community 605 - "Community 605"
Cohesion: 1.0
Nodes (0): 

### Community 606 - "Community 606"
Cohesion: 1.0
Nodes (0): 

### Community 607 - "Community 607"
Cohesion: 1.0
Nodes (0): 

### Community 608 - "Community 608"
Cohesion: 1.0
Nodes (0): 

### Community 609 - "Community 609"
Cohesion: 1.0
Nodes (0): 

### Community 610 - "Community 610"
Cohesion: 1.0
Nodes (0): 

### Community 611 - "Community 611"
Cohesion: 1.0
Nodes (0): 

### Community 612 - "Community 612"
Cohesion: 1.0
Nodes (0): 

### Community 613 - "Community 613"
Cohesion: 1.0
Nodes (0): 

### Community 614 - "Community 614"
Cohesion: 1.0
Nodes (0): 

### Community 615 - "Community 615"
Cohesion: 1.0
Nodes (0): 

### Community 616 - "Community 616"
Cohesion: 1.0
Nodes (0): 

### Community 617 - "Community 617"
Cohesion: 1.0
Nodes (0): 

### Community 618 - "Community 618"
Cohesion: 1.0
Nodes (0): 

### Community 619 - "Community 619"
Cohesion: 1.0
Nodes (0): 

### Community 620 - "Community 620"
Cohesion: 1.0
Nodes (0): 

### Community 621 - "Community 621"
Cohesion: 1.0
Nodes (0): 

### Community 622 - "Community 622"
Cohesion: 1.0
Nodes (0): 

### Community 623 - "Community 623"
Cohesion: 1.0
Nodes (0): 

### Community 624 - "Community 624"
Cohesion: 1.0
Nodes (0): 

### Community 625 - "Community 625"
Cohesion: 1.0
Nodes (0): 

### Community 626 - "Community 626"
Cohesion: 1.0
Nodes (0): 

### Community 627 - "Community 627"
Cohesion: 1.0
Nodes (0): 

### Community 628 - "Community 628"
Cohesion: 1.0
Nodes (0): 

### Community 629 - "Community 629"
Cohesion: 1.0
Nodes (0): 

### Community 630 - "Community 630"
Cohesion: 1.0
Nodes (0): 

### Community 631 - "Community 631"
Cohesion: 1.0
Nodes (0): 

### Community 632 - "Community 632"
Cohesion: 1.0
Nodes (0): 

### Community 633 - "Community 633"
Cohesion: 1.0
Nodes (0): 

### Community 634 - "Community 634"
Cohesion: 1.0
Nodes (0): 

### Community 635 - "Community 635"
Cohesion: 1.0
Nodes (0): 

### Community 636 - "Community 636"
Cohesion: 1.0
Nodes (0): 

### Community 637 - "Community 637"
Cohesion: 1.0
Nodes (0): 

### Community 638 - "Community 638"
Cohesion: 1.0
Nodes (1): <FIRInstallationsInstanceProvider>

### Community 639 - "Community 639"
Cohesion: 1.0
Nodes (0): 

### Community 640 - "Community 640"
Cohesion: 1.0
Nodes (0): 

### Community 641 - "Community 641"
Cohesion: 1.0
Nodes (0): 

### Community 642 - "Community 642"
Cohesion: 1.0
Nodes (0): 

### Community 643 - "Community 643"
Cohesion: 1.0
Nodes (0): 

### Community 644 - "Community 644"
Cohesion: 1.0
Nodes (0): 

### Community 645 - "Community 645"
Cohesion: 1.0
Nodes (0): 

### Community 646 - "Community 646"
Cohesion: 1.0
Nodes (0): 

### Community 647 - "Community 647"
Cohesion: 1.0
Nodes (0): 

### Community 648 - "Community 648"
Cohesion: 1.0
Nodes (0): 

### Community 649 - "Community 649"
Cohesion: 1.0
Nodes (0): 

### Community 650 - "Community 650"
Cohesion: 1.0
Nodes (0): 

### Community 651 - "Community 651"
Cohesion: 1.0
Nodes (0): 

### Community 652 - "Community 652"
Cohesion: 1.0
Nodes (0): 

### Community 653 - "Community 653"
Cohesion: 1.0
Nodes (0): 

### Community 654 - "Community 654"
Cohesion: 1.0
Nodes (0): 

### Community 655 - "Community 655"
Cohesion: 1.0
Nodes (0): 

### Community 656 - "Community 656"
Cohesion: 1.0
Nodes (0): 

### Community 657 - "Community 657"
Cohesion: 1.0
Nodes (0): 

### Community 658 - "Community 658"
Cohesion: 1.0
Nodes (0): 

### Community 659 - "Community 659"
Cohesion: 1.0
Nodes (0): 

### Community 660 - "Community 660"
Cohesion: 1.0
Nodes (0): 

### Community 661 - "Community 661"
Cohesion: 1.0
Nodes (0): 

### Community 662 - "Community 662"
Cohesion: 1.0
Nodes (0): 

### Community 663 - "Community 663"
Cohesion: 1.0
Nodes (0): 

### Community 664 - "Community 664"
Cohesion: 1.0
Nodes (0): 

### Community 665 - "Community 665"
Cohesion: 1.0
Nodes (0): 

### Community 666 - "Community 666"
Cohesion: 1.0
Nodes (0): 

### Community 667 - "Community 667"
Cohesion: 1.0
Nodes (0): 

### Community 668 - "Community 668"
Cohesion: 1.0
Nodes (0): 

### Community 669 - "Community 669"
Cohesion: 1.0
Nodes (0): 

### Community 670 - "Community 670"
Cohesion: 1.0
Nodes (0): 

### Community 671 - "Community 671"
Cohesion: 1.0
Nodes (0): 

### Community 672 - "Community 672"
Cohesion: 1.0
Nodes (0): 

### Community 673 - "Community 673"
Cohesion: 1.0
Nodes (0): 

### Community 674 - "Community 674"
Cohesion: 1.0
Nodes (0): 

### Community 675 - "Community 675"
Cohesion: 1.0
Nodes (0): 

### Community 676 - "Community 676"
Cohesion: 1.0
Nodes (0): 

### Community 677 - "Community 677"
Cohesion: 1.0
Nodes (0): 

### Community 678 - "Community 678"
Cohesion: 1.0
Nodes (0): 

### Community 679 - "Community 679"
Cohesion: 1.0
Nodes (0): 

### Community 680 - "Community 680"
Cohesion: 1.0
Nodes (0): 

### Community 681 - "Community 681"
Cohesion: 1.0
Nodes (0): 

### Community 682 - "Community 682"
Cohesion: 1.0
Nodes (0): 

### Community 683 - "Community 683"
Cohesion: 1.0
Nodes (0): 

### Community 684 - "Community 684"
Cohesion: 1.0
Nodes (0): 

### Community 685 - "Community 685"
Cohesion: 1.0
Nodes (0): 

### Community 686 - "Community 686"
Cohesion: 1.0
Nodes (0): 

### Community 687 - "Community 687"
Cohesion: 1.0
Nodes (0): 

### Community 688 - "Community 688"
Cohesion: 1.0
Nodes (0): 

### Community 689 - "Community 689"
Cohesion: 1.0
Nodes (0): 

### Community 690 - "Community 690"
Cohesion: 1.0
Nodes (0): 

### Community 691 - "Community 691"
Cohesion: 1.0
Nodes (0): 

### Community 692 - "Community 692"
Cohesion: 1.0
Nodes (0): 

### Community 693 - "Community 693"
Cohesion: 1.0
Nodes (0): 

### Community 694 - "Community 694"
Cohesion: 1.0
Nodes (0): 

### Community 695 - "Community 695"
Cohesion: 1.0
Nodes (0): 

### Community 696 - "Community 696"
Cohesion: 1.0
Nodes (0): 

### Community 697 - "Community 697"
Cohesion: 1.0
Nodes (0): 

### Community 698 - "Community 698"
Cohesion: 1.0
Nodes (0): 

### Community 699 - "Community 699"
Cohesion: 1.0
Nodes (0): 

### Community 700 - "Community 700"
Cohesion: 1.0
Nodes (0): 

### Community 701 - "Community 701"
Cohesion: 1.0
Nodes (0): 

### Community 702 - "Community 702"
Cohesion: 1.0
Nodes (0): 

### Community 703 - "Community 703"
Cohesion: 1.0
Nodes (0): 

### Community 704 - "Community 704"
Cohesion: 1.0
Nodes (0): 

### Community 705 - "Community 705"
Cohesion: 1.0
Nodes (0): 

### Community 706 - "Community 706"
Cohesion: 1.0
Nodes (0): 

### Community 707 - "Community 707"
Cohesion: 1.0
Nodes (0): 

### Community 708 - "Community 708"
Cohesion: 1.0
Nodes (0): 

### Community 709 - "Community 709"
Cohesion: 1.0
Nodes (0): 

### Community 710 - "Community 710"
Cohesion: 1.0
Nodes (0): 

### Community 711 - "Community 711"
Cohesion: 1.0
Nodes (0): 

### Community 712 - "Community 712"
Cohesion: 1.0
Nodes (0): 

### Community 713 - "Community 713"
Cohesion: 1.0
Nodes (0): 

### Community 714 - "Community 714"
Cohesion: 1.0
Nodes (0): 

### Community 715 - "Community 715"
Cohesion: 1.0
Nodes (0): 

### Community 716 - "Community 716"
Cohesion: 1.0
Nodes (0): 

### Community 717 - "Community 717"
Cohesion: 1.0
Nodes (0): 

### Community 718 - "Community 718"
Cohesion: 1.0
Nodes (0): 

### Community 719 - "Community 719"
Cohesion: 1.0
Nodes (0): 

### Community 720 - "Community 720"
Cohesion: 1.0
Nodes (0): 

### Community 721 - "Community 721"
Cohesion: 1.0
Nodes (0): 

### Community 722 - "Community 722"
Cohesion: 1.0
Nodes (0): 

### Community 723 - "Community 723"
Cohesion: 1.0
Nodes (0): 

### Community 724 - "Community 724"
Cohesion: 1.0
Nodes (0): 

### Community 725 - "Community 725"
Cohesion: 1.0
Nodes (0): 

### Community 726 - "Community 726"
Cohesion: 1.0
Nodes (0): 

### Community 727 - "Community 727"
Cohesion: 1.0
Nodes (0): 

### Community 728 - "Community 728"
Cohesion: 1.0
Nodes (0): 

### Community 729 - "Community 729"
Cohesion: 1.0
Nodes (0): 

### Community 730 - "Community 730"
Cohesion: 1.0
Nodes (0): 

### Community 731 - "Community 731"
Cohesion: 1.0
Nodes (0): 

### Community 732 - "Community 732"
Cohesion: 1.0
Nodes (0): 

### Community 733 - "Community 733"
Cohesion: 1.0
Nodes (0): 

### Community 734 - "Community 734"
Cohesion: 1.0
Nodes (0): 

### Community 735 - "Community 735"
Cohesion: 1.0
Nodes (0): 

### Community 736 - "Community 736"
Cohesion: 1.0
Nodes (0): 

### Community 737 - "Community 737"
Cohesion: 1.0
Nodes (0): 

### Community 738 - "Community 738"
Cohesion: 1.0
Nodes (0): 

### Community 739 - "Community 739"
Cohesion: 1.0
Nodes (0): 

### Community 740 - "Community 740"
Cohesion: 1.0
Nodes (0): 

### Community 741 - "Community 741"
Cohesion: 1.0
Nodes (0): 

### Community 742 - "Community 742"
Cohesion: 1.0
Nodes (0): 

### Community 743 - "Community 743"
Cohesion: 1.0
Nodes (0): 

### Community 744 - "Community 744"
Cohesion: 1.0
Nodes (0): 

### Community 745 - "Community 745"
Cohesion: 1.0
Nodes (0): 

### Community 746 - "Community 746"
Cohesion: 1.0
Nodes (0): 

### Community 747 - "Community 747"
Cohesion: 1.0
Nodes (0): 

### Community 748 - "Community 748"
Cohesion: 1.0
Nodes (0): 

### Community 749 - "Community 749"
Cohesion: 1.0
Nodes (0): 

### Community 750 - "Community 750"
Cohesion: 1.0
Nodes (0): 

### Community 751 - "Community 751"
Cohesion: 1.0
Nodes (0): 

### Community 752 - "Community 752"
Cohesion: 1.0
Nodes (0): 

### Community 753 - "Community 753"
Cohesion: 1.0
Nodes (0): 

### Community 754 - "Community 754"
Cohesion: 1.0
Nodes (0): 

### Community 755 - "Community 755"
Cohesion: 1.0
Nodes (0): 

### Community 756 - "Community 756"
Cohesion: 1.0
Nodes (0): 

### Community 757 - "Community 757"
Cohesion: 1.0
Nodes (0): 

### Community 758 - "Community 758"
Cohesion: 1.0
Nodes (0): 

### Community 759 - "Community 759"
Cohesion: 1.0
Nodes (0): 

### Community 760 - "Community 760"
Cohesion: 1.0
Nodes (0): 

### Community 761 - "Community 761"
Cohesion: 1.0
Nodes (0): 

### Community 762 - "Community 762"
Cohesion: 1.0
Nodes (0): 

### Community 763 - "Community 763"
Cohesion: 1.0
Nodes (0): 

### Community 764 - "Community 764"
Cohesion: 1.0
Nodes (0): 

### Community 765 - "Community 765"
Cohesion: 1.0
Nodes (0): 

### Community 766 - "Community 766"
Cohesion: 1.0
Nodes (0): 

### Community 767 - "Community 767"
Cohesion: 1.0
Nodes (0): 

### Community 768 - "Community 768"
Cohesion: 1.0
Nodes (0): 

### Community 769 - "Community 769"
Cohesion: 1.0
Nodes (0): 

### Community 770 - "Community 770"
Cohesion: 1.0
Nodes (0): 

### Community 771 - "Community 771"
Cohesion: 1.0
Nodes (0): 

### Community 772 - "Community 772"
Cohesion: 1.0
Nodes (0): 

### Community 773 - "Community 773"
Cohesion: 1.0
Nodes (0): 

### Community 774 - "Community 774"
Cohesion: 1.0
Nodes (0): 

### Community 775 - "Community 775"
Cohesion: 1.0
Nodes (0): 

### Community 776 - "Community 776"
Cohesion: 1.0
Nodes (0): 

### Community 777 - "Community 777"
Cohesion: 1.0
Nodes (0): 

### Community 778 - "Community 778"
Cohesion: 1.0
Nodes (0): 

### Community 779 - "Community 779"
Cohesion: 1.0
Nodes (0): 

### Community 780 - "Community 780"
Cohesion: 1.0
Nodes (0): 

### Community 781 - "Community 781"
Cohesion: 1.0
Nodes (0): 

### Community 782 - "Community 782"
Cohesion: 1.0
Nodes (0): 

### Community 783 - "Community 783"
Cohesion: 1.0
Nodes (0): 

### Community 784 - "Community 784"
Cohesion: 1.0
Nodes (0): 

### Community 785 - "Community 785"
Cohesion: 1.0
Nodes (0): 

### Community 786 - "Community 786"
Cohesion: 1.0
Nodes (0): 

### Community 787 - "Community 787"
Cohesion: 1.0
Nodes (0): 

### Community 788 - "Community 788"
Cohesion: 1.0
Nodes (0): 

### Community 789 - "Community 789"
Cohesion: 1.0
Nodes (0): 

### Community 790 - "Community 790"
Cohesion: 1.0
Nodes (0): 

### Community 791 - "Community 791"
Cohesion: 1.0
Nodes (0): 

### Community 792 - "Community 792"
Cohesion: 1.0
Nodes (0): 

### Community 793 - "Community 793"
Cohesion: 1.0
Nodes (0): 

### Community 794 - "Community 794"
Cohesion: 1.0
Nodes (0): 

### Community 795 - "Community 795"
Cohesion: 1.0
Nodes (0): 

### Community 796 - "Community 796"
Cohesion: 1.0
Nodes (0): 

### Community 797 - "Community 797"
Cohesion: 1.0
Nodes (0): 

### Community 798 - "Community 798"
Cohesion: 1.0
Nodes (0): 

### Community 799 - "Community 799"
Cohesion: 1.0
Nodes (0): 

### Community 800 - "Community 800"
Cohesion: 1.0
Nodes (0): 

### Community 801 - "Community 801"
Cohesion: 1.0
Nodes (0): 

### Community 802 - "Community 802"
Cohesion: 1.0
Nodes (0): 

### Community 803 - "Community 803"
Cohesion: 1.0
Nodes (0): 

### Community 804 - "Community 804"
Cohesion: 1.0
Nodes (0): 

### Community 805 - "Community 805"
Cohesion: 1.0
Nodes (0): 

### Community 806 - "Community 806"
Cohesion: 1.0
Nodes (0): 

### Community 807 - "Community 807"
Cohesion: 1.0
Nodes (0): 

### Community 808 - "Community 808"
Cohesion: 1.0
Nodes (0): 

### Community 809 - "Community 809"
Cohesion: 1.0
Nodes (0): 

### Community 810 - "Community 810"
Cohesion: 1.0
Nodes (0): 

### Community 811 - "Community 811"
Cohesion: 1.0
Nodes (0): 

### Community 812 - "Community 812"
Cohesion: 1.0
Nodes (0): 

### Community 813 - "Community 813"
Cohesion: 1.0
Nodes (0): 

### Community 814 - "Community 814"
Cohesion: 1.0
Nodes (0): 

### Community 815 - "Community 815"
Cohesion: 1.0
Nodes (0): 

### Community 816 - "Community 816"
Cohesion: 1.0
Nodes (0): 

### Community 817 - "Community 817"
Cohesion: 1.0
Nodes (0): 

### Community 818 - "Community 818"
Cohesion: 1.0
Nodes (0): 

### Community 819 - "Community 819"
Cohesion: 1.0
Nodes (0): 

### Community 820 - "Community 820"
Cohesion: 1.0
Nodes (0): 

### Community 821 - "Community 821"
Cohesion: 1.0
Nodes (0): 

### Community 822 - "Community 822"
Cohesion: 1.0
Nodes (0): 

### Community 823 - "Community 823"
Cohesion: 1.0
Nodes (0): 

### Community 824 - "Community 824"
Cohesion: 1.0
Nodes (0): 

### Community 825 - "Community 825"
Cohesion: 1.0
Nodes (0): 

### Community 826 - "Community 826"
Cohesion: 1.0
Nodes (0): 

### Community 827 - "Community 827"
Cohesion: 1.0
Nodes (0): 

### Community 828 - "Community 828"
Cohesion: 1.0
Nodes (0): 

### Community 829 - "Community 829"
Cohesion: 1.0
Nodes (0): 

### Community 830 - "Community 830"
Cohesion: 1.0
Nodes (0): 

### Community 831 - "Community 831"
Cohesion: 1.0
Nodes (0): 

### Community 832 - "Community 832"
Cohesion: 1.0
Nodes (0): 

### Community 833 - "Community 833"
Cohesion: 1.0
Nodes (0): 

### Community 834 - "Community 834"
Cohesion: 1.0
Nodes (0): 

### Community 835 - "Community 835"
Cohesion: 1.0
Nodes (0): 

### Community 836 - "Community 836"
Cohesion: 1.0
Nodes (0): 

### Community 837 - "Community 837"
Cohesion: 1.0
Nodes (0): 

### Community 838 - "Community 838"
Cohesion: 1.0
Nodes (0): 

### Community 839 - "Community 839"
Cohesion: 1.0
Nodes (0): 

### Community 840 - "Community 840"
Cohesion: 1.0
Nodes (0): 

### Community 841 - "Community 841"
Cohesion: 1.0
Nodes (0): 

### Community 842 - "Community 842"
Cohesion: 1.0
Nodes (0): 

### Community 843 - "Community 843"
Cohesion: 1.0
Nodes (0): 

### Community 844 - "Community 844"
Cohesion: 1.0
Nodes (0): 

### Community 845 - "Community 845"
Cohesion: 1.0
Nodes (0): 

### Community 846 - "Community 846"
Cohesion: 1.0
Nodes (0): 

### Community 847 - "Community 847"
Cohesion: 1.0
Nodes (0): 

### Community 848 - "Community 848"
Cohesion: 1.0
Nodes (0): 

### Community 849 - "Community 849"
Cohesion: 1.0
Nodes (0): 

### Community 850 - "Community 850"
Cohesion: 1.0
Nodes (0): 

### Community 851 - "Community 851"
Cohesion: 1.0
Nodes (0): 

### Community 852 - "Community 852"
Cohesion: 1.0
Nodes (0): 

### Community 853 - "Community 853"
Cohesion: 1.0
Nodes (0): 

### Community 854 - "Community 854"
Cohesion: 1.0
Nodes (0): 

### Community 855 - "Community 855"
Cohesion: 1.0
Nodes (0): 

### Community 856 - "Community 856"
Cohesion: 1.0
Nodes (0): 

### Community 857 - "Community 857"
Cohesion: 1.0
Nodes (0): 

### Community 858 - "Community 858"
Cohesion: 1.0
Nodes (0): 

### Community 859 - "Community 859"
Cohesion: 1.0
Nodes (0): 

### Community 860 - "Community 860"
Cohesion: 1.0
Nodes (0): 

### Community 861 - "Community 861"
Cohesion: 1.0
Nodes (0): 

### Community 862 - "Community 862"
Cohesion: 1.0
Nodes (0): 

### Community 863 - "Community 863"
Cohesion: 1.0
Nodes (0): 

### Community 864 - "Community 864"
Cohesion: 1.0
Nodes (0): 

### Community 865 - "Community 865"
Cohesion: 1.0
Nodes (0): 

### Community 866 - "Community 866"
Cohesion: 1.0
Nodes (0): 

### Community 867 - "Community 867"
Cohesion: 1.0
Nodes (0): 

### Community 868 - "Community 868"
Cohesion: 1.0
Nodes (0): 

### Community 869 - "Community 869"
Cohesion: 1.0
Nodes (0): 

### Community 870 - "Community 870"
Cohesion: 1.0
Nodes (0): 

### Community 871 - "Community 871"
Cohesion: 1.0
Nodes (0): 

### Community 872 - "Community 872"
Cohesion: 1.0
Nodes (0): 

### Community 873 - "Community 873"
Cohesion: 1.0
Nodes (0): 

### Community 874 - "Community 874"
Cohesion: 1.0
Nodes (0): 

### Community 875 - "Community 875"
Cohesion: 1.0
Nodes (0): 

### Community 876 - "Community 876"
Cohesion: 1.0
Nodes (0): 

### Community 877 - "Community 877"
Cohesion: 1.0
Nodes (0): 

### Community 878 - "Community 878"
Cohesion: 1.0
Nodes (0): 

### Community 879 - "Community 879"
Cohesion: 1.0
Nodes (0): 

### Community 880 - "Community 880"
Cohesion: 1.0
Nodes (0): 

### Community 881 - "Community 881"
Cohesion: 1.0
Nodes (0): 

### Community 882 - "Community 882"
Cohesion: 1.0
Nodes (0): 

### Community 883 - "Community 883"
Cohesion: 1.0
Nodes (0): 

### Community 884 - "Community 884"
Cohesion: 1.0
Nodes (0): 

### Community 885 - "Community 885"
Cohesion: 1.0
Nodes (0): 

### Community 886 - "Community 886"
Cohesion: 1.0
Nodes (0): 

### Community 887 - "Community 887"
Cohesion: 1.0
Nodes (0): 

### Community 888 - "Community 888"
Cohesion: 1.0
Nodes (0): 

### Community 889 - "Community 889"
Cohesion: 1.0
Nodes (0): 

### Community 890 - "Community 890"
Cohesion: 1.0
Nodes (0): 

### Community 891 - "Community 891"
Cohesion: 1.0
Nodes (0): 

### Community 892 - "Community 892"
Cohesion: 1.0
Nodes (0): 

### Community 893 - "Community 893"
Cohesion: 1.0
Nodes (0): 

### Community 894 - "Community 894"
Cohesion: 1.0
Nodes (0): 

### Community 895 - "Community 895"
Cohesion: 1.0
Nodes (0): 

### Community 896 - "Community 896"
Cohesion: 1.0
Nodes (0): 

### Community 897 - "Community 897"
Cohesion: 1.0
Nodes (0): 

### Community 898 - "Community 898"
Cohesion: 1.0
Nodes (0): 

### Community 899 - "Community 899"
Cohesion: 1.0
Nodes (0): 

### Community 900 - "Community 900"
Cohesion: 1.0
Nodes (0): 

### Community 901 - "Community 901"
Cohesion: 1.0
Nodes (0): 

### Community 902 - "Community 902"
Cohesion: 1.0
Nodes (0): 

### Community 903 - "Community 903"
Cohesion: 1.0
Nodes (0): 

### Community 904 - "Community 904"
Cohesion: 1.0
Nodes (0): 

### Community 905 - "Community 905"
Cohesion: 1.0
Nodes (0): 

### Community 906 - "Community 906"
Cohesion: 1.0
Nodes (0): 

### Community 907 - "Community 907"
Cohesion: 1.0
Nodes (0): 

### Community 908 - "Community 908"
Cohesion: 1.0
Nodes (0): 

### Community 909 - "Community 909"
Cohesion: 1.0
Nodes (0): 

### Community 910 - "Community 910"
Cohesion: 1.0
Nodes (0): 

### Community 911 - "Community 911"
Cohesion: 1.0
Nodes (0): 

### Community 912 - "Community 912"
Cohesion: 1.0
Nodes (0): 

### Community 913 - "Community 913"
Cohesion: 1.0
Nodes (0): 

### Community 914 - "Community 914"
Cohesion: 1.0
Nodes (0): 

### Community 915 - "Community 915"
Cohesion: 1.0
Nodes (0): 

### Community 916 - "Community 916"
Cohesion: 1.0
Nodes (0): 

### Community 917 - "Community 917"
Cohesion: 1.0
Nodes (0): 

### Community 918 - "Community 918"
Cohesion: 1.0
Nodes (0): 

### Community 919 - "Community 919"
Cohesion: 1.0
Nodes (0): 

### Community 920 - "Community 920"
Cohesion: 1.0
Nodes (0): 

### Community 921 - "Community 921"
Cohesion: 1.0
Nodes (0): 

### Community 922 - "Community 922"
Cohesion: 1.0
Nodes (0): 

### Community 923 - "Community 923"
Cohesion: 1.0
Nodes (0): 

### Community 924 - "Community 924"
Cohesion: 1.0
Nodes (0): 

### Community 925 - "Community 925"
Cohesion: 1.0
Nodes (0): 

### Community 926 - "Community 926"
Cohesion: 1.0
Nodes (0): 

### Community 927 - "Community 927"
Cohesion: 1.0
Nodes (0): 

### Community 928 - "Community 928"
Cohesion: 1.0
Nodes (0): 

### Community 929 - "Community 929"
Cohesion: 1.0
Nodes (0): 

### Community 930 - "Community 930"
Cohesion: 1.0
Nodes (0): 

### Community 931 - "Community 931"
Cohesion: 1.0
Nodes (0): 

### Community 932 - "Community 932"
Cohesion: 1.0
Nodes (0): 

### Community 933 - "Community 933"
Cohesion: 1.0
Nodes (0): 

### Community 934 - "Community 934"
Cohesion: 1.0
Nodes (1): useGoCrypto Module (GoCrypto Payment Integration)

### Community 935 - "Community 935"
Cohesion: 1.0
Nodes (1): parseGoCryptoRequestLink

### Community 936 - "Community 936"
Cohesion: 1.0
Nodes (1): selectedFiat watcher converts spending limits

### Community 937 - "Community 937"
Cohesion: 1.0
Nodes (1): isCountryNakaSupported

### Community 938 - "Community 938"
Cohesion: 1.0
Nodes (0): 

### Community 939 - "Community 939"
Cohesion: 1.0
Nodes (1): SumsubErrorType enum

### Community 940 - "Community 940"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **2184 isolated node(s):** `ResourceBundleClass`, `-sharedInstance`, `-init`, `-setLoggerLevel`, `-configure` (+2179 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 362`** (2 nodes): `cypress.config.ts`, `setupNodeEvents()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 363`** (2 nodes): `commands.ts`, `e2e.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 364`** (2 nodes): `NakaOnboardingVerifyId-BCWDFk3a.js`, `X()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 365`** (2 nodes): `WorldIcon-bJaFQjDw.js`, `p()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 366`** (2 nodes): `index-DoAP1p4w.js`, `i()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 367`** (2 nodes): `nimiq-logo-ElIkmn1m.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 368`** (2 nodes): `ShowWords-CL8_P9_5.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 369`** (2 nodes): `steps-BgpBHJy0.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 370`** (2 nodes): `md.transition-gkS7pwP1.js`, `v()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 371`** (2 nodes): `EnableNotifications-Dhyn3KLC.js`, `x()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 372`** (2 nodes): `useBiometric-Optsj6iT.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 373`** (2 nodes): `arrow-up-right-DQ1-0jGH.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 374`** (2 nodes): `NimAddressInput-gN_41kQP.js`, `ee()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 375`** (2 nodes): `remote-signer-shkDLhuK.js`, `He()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 376`** (2 nodes): `kyc-Dmfz8jVQ.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 377`** (2 nodes): `TransactionAmounts.vue_vue_type_script_setup_true_lang-DyWc49nB.js`, `j()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 378`** (2 nodes): `ShortAddressDisplay-DpPvuMcg.js`, `B()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 379`** (2 nodes): `status-tap-BA7k95-c.js`, `m()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 380`** (2 nodes): `useMiniAppHost-D6OyuGUT.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 381`** (2 nodes): `gamepad-DhW-76Vp.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 382`** (2 nodes): `info-upwGVWSn.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 383`** (2 nodes): `QRScanner-C7X1sScB.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 384`** (2 nodes): `PaymentPreview-CMiA_Q4t.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 385`** (2 nodes): `useMiniAppSession-Bu0jzLZl.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 386`** (2 nodes): `swipe-back-CgUOjUXi.js`, `k()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 387`** (2 nodes): `NimWithdraw-BoUL0R86.js`, `Ye()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 388`** (2 nodes): `usdt-logo-Co0nGtQ6.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 389`** (2 nodes): `mini-app-confirmation-BE3_tsgM.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 390`** (2 nodes): `cryptocity-logo-DzfKrg2M.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 391`** (2 nodes): `useNotifications-CM5MsGBB.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 392`** (2 nodes): `check-BTKJAGob.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 393`** (2 nodes): `QuickButton.vue_vue_type_script_setup_true_lang-CODHKADz.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 394`** (2 nodes): `validation--AgK6yfI.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 395`** (2 nodes): `loading-spinner-BoRgYHGI.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 396`** (2 nodes): `index-fdroIwhp.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 397`** (2 nodes): `index-DC_KFMep.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 398`** (2 nodes): `useStringParser-x0Y_ZLAy.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 399`** (2 nodes): `useGoCryptoMonitoring-68nAfwnt.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 400`** (2 nodes): `index-DDr1KAKb.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 401`** (2 nodes): `points-CXJ8XzsK.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 402`** (2 nodes): `chevron-right-Dhds0VPT.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 403`** (2 nodes): `TransactionItem.vue_vue_type_script_setup_true_lang-D7f59q6W.js`, `W()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 404`** (2 nodes): `FBLPromise`, `-dispatchGroup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 405`** (2 nodes): `WeakContainer.swift`, `WeakContainer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 406`** (2 nodes): `GULURLSessionDataResponse`, `-initWithResponseHTTPBody`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 407`** (2 nodes): `NSURLSession`, `-gul_dataTaskPromiseWithRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 408`** (2 nodes): `MainActivity.java`, `MainActivity`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 409`** (2 nodes): `isPaymentTransferType()`, `isPaymentTx()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 410`** (2 nodes): `useTransactionSearch.ts`, `useTransactionSearch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 411`** (2 nodes): `usePrice.spec.ts`, `fetch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 412`** (2 nodes): `PaymentAmountInput.spec.ts`, `mountComponent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 413`** (2 nodes): `TheHomeAmounts.spec.ts`, `mountComponent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 414`** (2 nodes): `ShortAddressDisplay.spec.ts`, `mountComponent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 415`** (2 nodes): `AmountInput.spec.ts`, `mountAmountInput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 416`** (2 nodes): `index.spec.ts`, `getLastCreatedFlow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 417`** (2 nodes): `SetupView.spec.ts`, `passthrough()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 418`** (2 nodes): `CAPBridgedPlugin.h`, `property()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 419`** (2 nodes): `transfer-handlers.js`, `setupMainThreadTransferHandlers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 420`** (2 nodes): `vue3-components-9uN0dvLo.js`, `n()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 421`** (2 nodes): `focus-visible-supuXXMI.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 422`** (2 nodes): `CSSRule.h`, `CSSRule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 423`** (2 nodes): `CDVPluginResult.h`, `CDVPluginResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 424`** (2 nodes): `CDVConfigParser.h`, `NSXMLParserDelegate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 425`** (2 nodes): `CDVCommandDelegateImpl.h`, `CDVCommandDelegateImpl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 426`** (2 nodes): `CDVInvokedUrlCommand.h`, `CDVInvokedUrlCommand()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 427`** (2 nodes): `CDVURLProtocol.h`, `CDVURLProtocol()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 428`** (2 nodes): `p-Cz5nLPGT-DxlKrvNd.js`, `y()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 429`** (2 nodes): `mini-app-confirmation-DygGRqN7.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 430`** (2 nodes): `NimAddressInput-BmPH3wdJ.js`, `ee()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 431`** (2 nodes): `NakaOnboardingVerifyId-CgKSmNee.js`, `X()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 432`** (2 nodes): `usdt-logo-w3wzEZ60.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 433`** (2 nodes): `info-BQhJ30Fi.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 434`** (2 nodes): `arrow-up-right-DsUZrOVr.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 435`** (2 nodes): `gamepad-BXxkaU-G.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 436`** (2 nodes): `QuickButton.vue_vue_type_script_setup_true_lang-D_Z1_OxL.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 437`** (2 nodes): `NimWithdraw-BQl-_ARH.js`, `Ze()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 438`** (2 nodes): `index-UljAkBUF.js`, `d()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 439`** (2 nodes): `ShortAddressDisplay-B3eY2k2-.js`, `B()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 440`** (2 nodes): `QRScanner-BqpwzqDm.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 441`** (2 nodes): `cryptocity-logo-BC0KdMvk.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 442`** (2 nodes): `p-CneGxKsZ-Bg4qwl18.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 443`** (2 nodes): `useMiniAppHost-1mHg-bU1.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 444`** (2 nodes): `useBiometric-BEr8Gxuj.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 445`** (2 nodes): `WithdrawalAddressList-B6vo8qx8.js`, `z()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 446`** (2 nodes): `chevron-right-DHyRXXdK.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 447`** (2 nodes): `steps-BDRATRLo.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 448`** (2 nodes): `PaymentPreview-BRq1wJka.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 449`** (2 nodes): `check-B2QDkRqy.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 450`** (2 nodes): `TransactionAmounts.vue_vue_type_script_setup_true_lang-DbgoNa0J.js`, `D()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 451`** (2 nodes): `remote-signer-BL57wfed.js`, `He()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 452`** (2 nodes): `useGoCryptoMonitoring-zrAIbuMe.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 453`** (2 nodes): `index-C2CGEhnt.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 454`** (2 nodes): `loading-spinner-DwhM2IJr.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 455`** (2 nodes): `useMiniAppSession-wMfuwlW2.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 456`** (2 nodes): `ShowWords-CGSdGEyZ.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 457`** (2 nodes): `p-CU1SSH8_-CdAtCC8x.js`, `g()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 458`** (2 nodes): `index-CmCvOUPL.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 459`** (2 nodes): `validation-BBMHO-AR.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 460`** (2 nodes): `useNotifications-CciGKA5-.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 461`** (2 nodes): `TransactionItem.vue_vue_type_script_setup_true_lang-plgRyUFG.js`, `Z()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 462`** (2 nodes): `points-tHrDakp8.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 463`** (2 nodes): `EnableNotifications-CArV9H9i.js`, `x()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 464`** (2 nodes): `nimiq-logo-C0liWDNF.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 465`** (2 nodes): `index-CXIkbyGT.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 466`** (2 nodes): `useStringParser-ikrGTujw.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 467`** (2 nodes): `kyc-ffD5f5sg.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 468`** (2 nodes): `WorldIcon-CMw-1TBx.js`, `p()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 469`** (2 nodes): `SVGStyleElement.h`, `SVGStyleElement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 470`** (2 nodes): `EntityReference.h`, `EntityReference`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 471`** (2 nodes): `DocumentType.h`, `DocumentType`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 472`** (2 nodes): `StyleSheet.h`, `StyleSheet`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 473`** (2 nodes): `SVGTextContentElement.h`, `SVGTextContentElement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 474`** (2 nodes): `PostHogExtensions.swift`, `PostHogSDK`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 475`** (2 nodes): `PostHogLegacyQueue.swift`, `migrateOldQueue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 476`** (2 nodes): `PostHogConsumerPayload.swift`, `PostHogConsumerPayload`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 477`** (2 nodes): `PostHogSwizzler.swift`, `swizzle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 478`** (2 nodes): `PostHogPropertiesSanitizer.swift`, `PostHogPropertiesSanitizer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 479`** (2 nodes): `PostHogBatchUploadInfo.swift`, `PostHogBatchUploadInfo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 480`** (2 nodes): `UIView+PostHogLabel.swift`, `UIView`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 481`** (2 nodes): `AssociatedKeys.swift`, `AssociatedKeys`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 482`** (2 nodes): `Optional+Util.swift`, `Optional`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 483`** (2 nodes): `ViewTreeSnapshotStatus.swift`, `ViewTreeSnapshotStatus`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 484`** (2 nodes): `WorldIcon-DuaA16n6.js`, `p()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 485`** (2 nodes): `useGoCryptoMonitoring--W_HiPj8.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 486`** (2 nodes): `TransactionItem.vue_vue_type_script_setup_true_lang-Dn0Q884N.js`, `Q()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 487`** (2 nodes): `useMiniAppSession-DAGb8rfh.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 488`** (2 nodes): `ShowWords-CXJST7BT.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 489`** (2 nodes): `loading-spinner-Cp_OsK5D.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 490`** (2 nodes): `TransactionAmounts.vue_vue_type_script_setup_true_lang-qXEkEn-i.js`, `j()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 491`** (2 nodes): `steps-CGSnx8nZ.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 492`** (2 nodes): `index-YKOtXEa2.js`, `d()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 493`** (2 nodes): `PaymentPreview--GWcj9Hl.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 494`** (2 nodes): `gamepad-Cze9nyIi.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 495`** (2 nodes): `nimiq-logo-413RD8jB.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 496`** (2 nodes): `useNotifications-D4uNzIm5.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 497`** (2 nodes): `kyc-Che9q6cO.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 498`** (2 nodes): `p-CU1SSH8_-DyP4LcLn.js`, `g()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 499`** (2 nodes): `useStringParser-BS6_tHIk.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 500`** (2 nodes): `validation-CvWX0zC8.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 501`** (2 nodes): `check-GHnUsqd1.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 502`** (2 nodes): `chevron-right-DbpVJLvV.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 503`** (2 nodes): `EnableNotifications-BIF-Zjoi.js`, `x()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 504`** (2 nodes): `p-CneGxKsZ-DjMIlmyb.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 505`** (2 nodes): `QuickButton.vue_vue_type_script_setup_true_lang-D5phs_Vk.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 506`** (2 nodes): `points-ZW5JrzKc.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 507`** (2 nodes): `index-CBjejZJQ.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 508`** (2 nodes): `ShortAddressDisplay-XiuRnUSv.js`, `B()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 509`** (2 nodes): `cryptocity-logo-BBZLUFTo.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 510`** (2 nodes): `index-bTn7CjhL.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 511`** (2 nodes): `index-u1hI2ICL.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 512`** (2 nodes): `usdt-logo-DCZ4DGSC.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 513`** (2 nodes): `p-Cz5nLPGT-B3Fx17dJ.js`, `y()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 514`** (2 nodes): `useMiniAppHost-w47xDN_U.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 515`** (2 nodes): `NimWithdraw-DnqHFy0U.js`, `je()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 516`** (2 nodes): `useBiometric-DLgVOANM.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 517`** (2 nodes): `info-DJXPZdIh.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 518`** (2 nodes): `QRScanner-Ci3SybNy.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 519`** (2 nodes): `mini-app-confirmation-DTKAPcLO.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 520`** (2 nodes): `NakaOnboardingVerifyId-4o13keIZ.js`, `X()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 521`** (2 nodes): `NimAddressInput-DE0i8FTK.js`, `ee()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 522`** (2 nodes): `WithdrawalAddressList-Da1zpA8e.js`, `z()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 523`** (2 nodes): `arrow-up-right-DILMNie2.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 524`** (2 nodes): `remote-signer-B0c5NgVW.js`, `He()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 525`** (2 nodes): `useKyc Pinia Store`, `useNaka Pinia Store`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 526`** (2 nodes): `remote-signer.spec.ts`, `createAddress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 527`** (2 nodes): `TheHomeFooter.spec.ts`, `iconForUrl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 528`** (2 nodes): `nativeFetch.ts`, `nativeFetch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 529`** (2 nodes): `cache/logs.txt Persisted Logs`, `useLogger composable`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 530`** (2 nodes): `categorizeTransactions`, `filterUnseen`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 531`** (1 nodes): `WithdrawalAddressList-B-2_ZM75.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 532`** (1 nodes): `FIRCurrentDateProvider.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 533`** (1 nodes): `IsAppEncrypted.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 534`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 535`** (1 nodes): `DDLoggerNames.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 536`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 537`** (1 nodes): `test.cy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 538`** (1 nodes): `CapacitorExtendedDialog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 539`** (1 nodes): `CapacitorCamera_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 540`** (1 nodes): `CapacitorScreenOrientation_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 541`** (1 nodes): `FirebaseInstallations_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 542`** (1 nodes): `CapacitorDevice_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 543`** (1 nodes): `nanopb_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 544`** (1 nodes): `CapacitorSumsubMobileSdk_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 545`** (1 nodes): `GoogleDataTransport_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 546`** (1 nodes): `KeychainSwift_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 547`** (1 nodes): `GoogleUtilities_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 548`** (1 nodes): `CapacitorPreferences_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 549`** (1 nodes): `Pods_App_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 550`** (1 nodes): `AppsCapacitorMonetplusHce_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 551`** (1 nodes): `CapacitorBrowser_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 552`** (1 nodes): `CapacitorHaptics_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 553`** (1 nodes): `CapacitorStatusBar_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 554`** (1 nodes): `CapacitorPushNotifications_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 555`** (1 nodes): `FirebaseCoreInternal_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 556`** (1 nodes): `AparajitaCapacitorBiometricAuth_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 557`** (1 nodes): `AparajitaCapacitorSecureStorage_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 558`** (1 nodes): `FirebaseMessaging_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 559`** (1 nodes): `CapawesomeCapacitorPosthog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 560`** (1 nodes): `CapacitorToast_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 561`** (1 nodes): `FBLPromises_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 562`** (1 nodes): `PostHog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 563`** (1 nodes): `CapgoInappbrowser_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 564`** (1 nodes): `CapacitorCommunitySqlite_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 565`** (1 nodes): `SQLCipher_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 566`** (1 nodes): `CapacitorApp_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 567`** (1 nodes): `FirebaseCore_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 568`** (1 nodes): `Cordova_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 569`** (1 nodes): `CapacitorClipboard_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 570`** (1 nodes): `CapacitorFilesystem_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 571`** (1 nodes): `Capacitor_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 572`** (1 nodes): `RdlaboCapacitorScreenshotEvent_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 573`** (1 nodes): `CapacitorShare_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 574`** (1 nodes): `CapacitorKeyboard_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 575`** (1 nodes): `CapgoCameraPreview_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 576`** (1 nodes): `CapacitorCommunityPrivacyScreen_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 577`** (1 nodes): `ZIPFoundation_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 578`** (1 nodes): `CapacitorScreenOrientation-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 579`** (1 nodes): `CapawesomeCapacitorPosthog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 580`** (1 nodes): `fr-0_eB8Pp8.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 581`** (1 nodes): `PinInput-Zc5WwCFU.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 582`** (1 nodes): `OnBoardingScreen-7suqEdxS.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 583`** (1 nodes): `MapModal-BtvXPxGw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 584`** (1 nodes): `MiniAppWarningModal-D18-2Wo0.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 585`** (1 nodes): `PinView-BvQE_HZz.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 586`** (1 nodes): `es-BB1AVa9_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 587`** (1 nodes): `ComingSoon-DB2LZV5t.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 588`** (1 nodes): `PaymentAmountInput-Cw5Ve1N_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 589`** (1 nodes): `DevModal-DkDsC6DP.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 590`** (1 nodes): `ReferralModal-Dv_c5YNd.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 591`** (1 nodes): `AmountInput-C6ZlQM29.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 592`** (1 nodes): `NimAddressDisplay-Dcs0UECI.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 593`** (1 nodes): `BluecodeNotSupported-C7MYUwX9.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 594`** (1 nodes): `SettingsModal-DP96B4vl.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 595`** (1 nodes): `SetupView-VULFlLZc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 596`** (1 nodes): `PolygonWarning.vue_vue_type_script_setup_true_lang-ByqhWdKi.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 597`** (1 nodes): `TransactionDetails-B2R7eu05.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 598`** (1 nodes): `index-B5vf_nbc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 599`** (1 nodes): `ModalTemplate.vue_vue_type_script_setup_true_lang-DIz59ez4.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 600`** (1 nodes): `PaymentRequestManualInput-DNp--jt4.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 601`** (1 nodes): `pt-C-49ZQU9.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 602`** (1 nodes): `PointsModal-Bsfxcr0m.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 603`** (1 nodes): `LongTimeNoSeeModal-DV5f5ZRz.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 604`** (1 nodes): `BricksInput-kX8kgN9p.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 605`** (1 nodes): `en-qObpnl0Z.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 606`** (1 nodes): `ConfirmAddressDeletion-D7OSwAuP.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 607`** (1 nodes): `config-CvcZrzDa.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 608`** (1 nodes): `NakaCardDelete-DXzhWSaL.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 609`** (1 nodes): `de-ehF7Tva_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 610`** (1 nodes): `GenericInput-BHYKwAs6.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 611`** (1 nodes): `PaymentSelector-zWSqbmir.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 612`** (1 nodes): `index-DILgX2Vo.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 613`** (1 nodes): `DeletePointsModal-Dh2DZZQf.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 614`** (1 nodes): `CategoryIcon-BgmCeLVK.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 615`** (1 nodes): `ExpiringPointsModal-CviRuFV5.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 616`** (1 nodes): `DisclaimerModal-BjsJlaMZ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 617`** (1 nodes): `BackupIntroduction-CDO7tGIh.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 618`** (1 nodes): `EnableBiometricModal-DdVEfXUJ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 619`** (1 nodes): `PinInput.vue_vue_type_script_setup_true_lang-DdPNmyQH.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 620`** (1 nodes): `Confirm-DGWHD0qM.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 621`** (1 nodes): `Warning-w_8qs3jq.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 622`** (1 nodes): `ValidateWords-oh0jCj5K.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 623`** (1 nodes): `CodeInput-BsyR7G0L.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 624`** (1 nodes): `CapacitorToast-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 625`** (1 nodes): `CapgoInappbrowser-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 626`** (1 nodes): `Plugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 627`** (1 nodes): `CapacitorSQLitePlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 628`** (1 nodes): `PrivacyScreenPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 629`** (1 nodes): `Pods-App-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 630`** (1 nodes): `FIRConfigurationInternal.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 631`** (1 nodes): `external_prequest_context.nanopb.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 632`** (1 nodes): `external_privacy_context.nanopb.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 633`** (1 nodes): `compliance.nanopb.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 634`** (1 nodes): `GDTCORMetricsControllerProtocol.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 635`** (1 nodes): `GDTCORUploader.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 636`** (1 nodes): `GDTCORTransport_Private.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 637`** (1 nodes): `GDTCOREndpoints_Private.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 638`** (1 nodes): `<FIRInstallationsInstanceProvider>`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 639`** (1 nodes): `FirebaseInstallationsInternal.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 640`** (1 nodes): `FIRInstallationsStatus.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 641`** (1 nodes): `Firebase.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 642`** (1 nodes): `FIRAnalyticsInterop.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 643`** (1 nodes): `FIRAnalyticsInteropListener.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 644`** (1 nodes): `FIRMessagingCode.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 645`** (1 nodes): `me.nanopb.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 646`** (1 nodes): `GULNetworkInternal.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 647`** (1 nodes): `GULLoggerCodes.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 648`** (1 nodes): `GULReachabilityMessageCode.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 649`** (1 nodes): `GULReachabilityChecker+Internal.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 650`** (1 nodes): `GULAppDelegateSwizzler_Private.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 651`** (1 nodes): `GULSceneDelegateSwizzler_Private.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 652`** (1 nodes): `pb_ostream_from_buffer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 653`** (1 nodes): `browserstack-upload.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 654`** (1 nodes): `rollup.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 655`** (1 nodes): `allowedChains.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 656`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 657`** (1 nodes): `shims-vue.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 658`** (1 nodes): `light-bolt11-decoder.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 659`** (1 nodes): `nimiq.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 660`** (1 nodes): `process-browser.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 661`** (1 nodes): `markAsUnknownTransactionTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 662`** (1 nodes): `translateTransactionTitle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 663`** (1 nodes): `translateTransactionState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 664`** (1 nodes): `isPendingAtomicSwapTransaction()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 665`** (1 nodes): `isExternalTx()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 666`** (1 nodes): `global.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 667`** (1 nodes): `useModal.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 668`** (1 nodes): `useQRScanner.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 669`** (1 nodes): `useTransactionSearch.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 670`** (1 nodes): `useStringParser.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 671`** (1 nodes): `locks.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 672`** (1 nodes): `PolygonWarning.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 673`** (1 nodes): `TransactionAmounts.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 674`** (1 nodes): `PaymentSelector.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 675`** (1 nodes): `Flow.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 676`** (1 nodes): `sql-queries.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 677`** (1 nodes): `analytics.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 678`** (1 nodes): `mini-app-icons.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 679`** (1 nodes): `history.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 680`** (1 nodes): `steps.types.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 681`** (1 nodes): `capacitor.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 682`** (1 nodes): `CocoaLumberjack_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 683`** (1 nodes): `SVGKit_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 684`** (1 nodes): `CapacitorBrowser-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 685`** (1 nodes): `CapacitorPreferences-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 686`** (1 nodes): `CapacitorExtendedDialog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 687`** (1 nodes): `FIRConfiguration.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 688`** (1 nodes): `FIROptions.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 689`** (1 nodes): `FIRApp.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 690`** (1 nodes): `FIRLoggerLevel.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 691`** (1 nodes): `FirebaseCore.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 692`** (1 nodes): `FirebaseCore-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 693`** (1 nodes): `FIRVersion.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 694`** (1 nodes): `FBLPromisePrivate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 695`** (1 nodes): `FBLPromise+Testing.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 696`** (1 nodes): `FBLPromise+Reduce.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 697`** (1 nodes): `FBLPromise+Catch.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 698`** (1 nodes): `FBLPromise+Recover.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 699`** (1 nodes): `FBLPromise+Validate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 700`** (1 nodes): `FBLPromise+All.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 701`** (1 nodes): `FBLPromise+Race.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 702`** (1 nodes): `FBLPromise+Wrap.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 703`** (1 nodes): `FBLPromise.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 704`** (1 nodes): `FBLPromises.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 705`** (1 nodes): `FBLPromise+Retry.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 706`** (1 nodes): `FBLPromise+Await.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 707`** (1 nodes): `FBLPromise+Delay.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 708`** (1 nodes): `FBLPromise+Do.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 709`** (1 nodes): `FBLPromise+Timeout.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 710`** (1 nodes): `PromisesObjC-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 711`** (1 nodes): `FBLPromise+Then.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 712`** (1 nodes): `FBLPromise+Async.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 713`** (1 nodes): `FBLPromise+Always.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 714`** (1 nodes): `FBLPromise+Any.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 715`** (1 nodes): `CapacitorApp-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 716`** (1 nodes): `CapacitorFilesystem-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 717`** (1 nodes): `GDTCORClock.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 718`** (1 nodes): `GDTCOREndpoints.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 719`** (1 nodes): `GDTCORTransport.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 720`** (1 nodes): `GoogleDataTransport-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 721`** (1 nodes): `GDTCORProductData.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 722`** (1 nodes): `GDTCORConsoleLogger.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 723`** (1 nodes): `GDTCOREventTransformer.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 724`** (1 nodes): `GoogleDataTransport.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 725`** (1 nodes): `GDTCORTargets.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 726`** (1 nodes): `GDTCOREvent.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 727`** (1 nodes): `GDTCOREventDataObject.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 728`** (1 nodes): `CapacitorShare-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 729`** (1 nodes): `CapacitorSumsubMobileSdk-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 730`** (1 nodes): `CapacitorStatusBar-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 731`** (1 nodes): `FirebaseInstallations-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 732`** (1 nodes): `FIRInstallationsErrors.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 733`** (1 nodes): `FirebaseInstallations.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 734`** (1 nodes): `FIRInstallations.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 735`** (1 nodes): `DDLegacyMacros.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 736`** (1 nodes): `DDLogMacros.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 737`** (1 nodes): `CocoaLumberjack.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 738`** (1 nodes): `DDAssertMacros.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 739`** (1 nodes): `DDLog+LOGV.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 740`** (1 nodes): `CocoaLumberjack-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 741`** (1 nodes): `CapgoCameraPreview-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 742`** (1 nodes): `CAPPluginCall.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 743`** (1 nodes): `CAPInstanceDescriptor.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 744`** (1 nodes): `CAPInstanceConfiguration.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 745`** (1 nodes): `CAPBridgedJSTypes.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 746`** (1 nodes): `CAPPluginMethod.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 747`** (1 nodes): `CAPBridgeViewController+CDVScreenOrientationDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 748`** (1 nodes): `Capacitor.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 749`** (1 nodes): `CAPPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 750`** (1 nodes): `cordova.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 751`** (1 nodes): `nimiq.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 752`** (1 nodes): `registerSW.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 753`** (1 nodes): `cordova_plugins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 754`** (1 nodes): `wasm-BxLt509m.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 755`** (1 nodes): `CapacitorDevice-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 756`** (1 nodes): `CapacitorPushNotifications-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 757`** (1 nodes): `FirebaseCoreInternal-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 758`** (1 nodes): `CapacitorHaptics-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 759`** (1 nodes): `ConverterSVGToCALayer.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 760`** (1 nodes): `SVGViewSpec.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 761`** (1 nodes): `SVGNumber.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 762`** (1 nodes): `SVGKParserExtension.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 763`** (1 nodes): `SVGStyleCatcher.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 764`** (1 nodes): `DocumentStyle.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 765`** (1 nodes): `SVGUnitTypes.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 766`** (1 nodes): `DocumentCSS.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 767`** (1 nodes): `SVGStylable.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 768`** (1 nodes): `SVGFitToViewBox.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 769`** (1 nodes): `AppDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 770`** (1 nodes): `CDVAvailability.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 771`** (1 nodes): `CDVViewController.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 772`** (1 nodes): `CDVScreenOrientationDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 773`** (1 nodes): `CDV.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 774`** (1 nodes): `CapacitorCordova.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 775`** (1 nodes): `NSDictionary+CordovaPreferences.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 776`** (1 nodes): `CDVWebViewProcessPoolFactory.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 777`** (1 nodes): `CDVPlugin+Resources.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 778`** (1 nodes): `CDVCommandDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 779`** (1 nodes): `CDVPluginManager.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 780`** (1 nodes): `SQLCipher-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 781`** (1 nodes): `AparajitaCapacitorBiometricAuth-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 782`** (1 nodes): `CapacitorCommunitySqlite-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 783`** (1 nodes): `FirebaseMessaging.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 784`** (1 nodes): `FirebaseMessaging-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 785`** (1 nodes): `FIRMessagingExtensionHelper.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 786`** (1 nodes): `FIRMessaging.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 787`** (1 nodes): `ZIPFoundation-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 788`** (1 nodes): `AparajitaCapacitorSecureStorage-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 789`** (1 nodes): `PostHog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 790`** (1 nodes): `PostHog.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 791`** (1 nodes): `CapacitorCommunityPrivacyScreen-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 792`** (1 nodes): `AppsCapacitorMonetplusHce-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 793`** (1 nodes): `GULHeartbeatDateStorable.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 794`** (1 nodes): `GULNetworkMessageCode.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 795`** (1 nodes): `GULAppEnvironmentUtil.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 796`** (1 nodes): `GULApplication.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 797`** (1 nodes): `GULHeartbeatDateStorage.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 798`** (1 nodes): `GULAppDelegateSwizzler.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 799`** (1 nodes): `GULMutableDictionary.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 800`** (1 nodes): `GULNetworkURLSession.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 801`** (1 nodes): `GoogleUtilities-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 802`** (1 nodes): `GULURLSessionDataResponse.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 803`** (1 nodes): `GULKeychainStorage.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 804`** (1 nodes): `GULHeartbeatDateStorageUserDefaults.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 805`** (1 nodes): `GULNetworkLoggerProtocol.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 806`** (1 nodes): `GULUserDefaults.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 807`** (1 nodes): `GULNetwork.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 808`** (1 nodes): `NSURLSession+GULPromises.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 809`** (1 nodes): `GULNetworkInfo.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 810`** (1 nodes): `GULLoggerLevel.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 811`** (1 nodes): `GULLogger.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 812`** (1 nodes): `GULSceneDelegateSwizzler.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 813`** (1 nodes): `GULSecureCoding.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 814`** (1 nodes): `GULKeychainUtils.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 815`** (1 nodes): `GULReachabilityChecker.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 816`** (1 nodes): `GULNSData+zlib.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 817`** (1 nodes): `GULNetworkConstants.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 818`** (1 nodes): `RdlaboCapacitorScreenshotEvent-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 819`** (1 nodes): `nanopb-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 820`** (1 nodes): `CapacitorClipboard-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 821`** (1 nodes): `KeyboardPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 822`** (1 nodes): `CapacitorKeyboard-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 823`** (1 nodes): `Keyboard.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 824`** (1 nodes): `KeychainSwift-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 825`** (1 nodes): `CapacitorCamera-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 826`** (1 nodes): `ReferralModal-C1bDfupJ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 827`** (1 nodes): `Warning-CqqFl2TX.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 828`** (1 nodes): `PinInput-DcJSqaQi.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 829`** (1 nodes): `PaymentRequestManualInput-By-Hvd-Q.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 830`** (1 nodes): `index-Dx-TqIHw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 831`** (1 nodes): `BackupIntroduction-7ujbc0iI.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 832`** (1 nodes): `TransactionDetails-B9oWRzhy.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 833`** (1 nodes): `SetupView-CtpR64hx.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 834`** (1 nodes): `BricksInput-D_WXvsno.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 835`** (1 nodes): `OnBoardingScreen-v_bX57xr.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 836`** (1 nodes): `DevModal-C-iAN1D0.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 837`** (1 nodes): `CodeInput-4n7IW1ba.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 838`** (1 nodes): `AmountInput-Byn9UGdS.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 839`** (1 nodes): `index-CAyzoBfd.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 840`** (1 nodes): `BluecodeNotSupported-DggrvrcK.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 841`** (1 nodes): `PinInput.vue_vue_type_script_setup_true_lang-CP4__Q-A.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 842`** (1 nodes): `LongTimeNoSeeModal-BQI_fzBu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 843`** (1 nodes): `PolygonWarning.vue_vue_type_script_setup_true_lang-DGBD3JCg.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 844`** (1 nodes): `DisclaimerModal-iPUnS1ay.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 845`** (1 nodes): `NimAddressDisplay-Bnoj5M-3.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 846`** (1 nodes): `config-RfD7D6Zu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 847`** (1 nodes): `SettingsModal-CYtlwN95.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 848`** (1 nodes): `ExpiringPointsModal-d_FXjmUM.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 849`** (1 nodes): `EnableBiometricModal-DkNzsPyr.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 850`** (1 nodes): `GenericInput-CJfP82qe.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 851`** (1 nodes): `ModalTemplate.vue_vue_type_script_setup_true_lang-kvOxRKV2.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 852`** (1 nodes): `ValidateWords-DWyodxi0.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 853`** (1 nodes): `MiniAppWarningModal-Bxia4iED.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 854`** (1 nodes): `MapModal-C7PJ32Z-.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 855`** (1 nodes): `DeletePointsModal-fS4WvIfo.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 856`** (1 nodes): `PaymentSelector-Cpnj7qNf.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 857`** (1 nodes): `PaymentAmountInput-DmZYok0s.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 858`** (1 nodes): `ComingSoon-ChZJy9Yd.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 859`** (1 nodes): `CategoryIcon-DpZR-GcZ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 860`** (1 nodes): `PinView-DrneUwKX.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 861`** (1 nodes): `Confirm-Brp-FoUA.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 862`** (1 nodes): `NakaCardDelete-BFKAEoBZ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 863`** (1 nodes): `PointsModal-HApJ9X1F.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 864`** (1 nodes): `ConfirmAddressDeletion-1PSf1KTC.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 865`** (1 nodes): `CapacitorPrivacyScreen-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 866`** (1 nodes): `IONCameraLib-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 867`** (1 nodes): `SNSThemeMetrics.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 868`** (1 nodes): `SNSTheme.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 869`** (1 nodes): `SNSMobileSDKInfo.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 870`** (1 nodes): `SNSThemeImages.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 871`** (1 nodes): `SNSEvent.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 872`** (1 nodes): `IdensicMobileSDK.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 873`** (1 nodes): `SNSMobileSDKDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 874`** (1 nodes): `SNSSupportItem.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 875`** (1 nodes): `SNSMobileSDK.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 876`** (1 nodes): `SNSMobileSDK+Enums.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 877`** (1 nodes): `SNSThemeSection.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 878`** (1 nodes): `SNSDocumentDefinition.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 879`** (1 nodes): `SNSThemeFonts.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 880`** (1 nodes): `SNSThemeColors.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 881`** (1 nodes): `DI.swift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 882`** (1 nodes): `PostHogVersion.swift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 883`** (1 nodes): `CapacitorPrivacyScreen_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 884`** (1 nodes): `IONCameraLib_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 885`** (1 nodes): `CDVAvailabilityDeprecated.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 886`** (1 nodes): `ReferralModal-OJ6z9FRx.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 887`** (1 nodes): `DeletePointsModal-BgcKfkA_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 888`** (1 nodes): `PaymentRequestManualInput-Cg5ISZol.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 889`** (1 nodes): `PinInput.vue_vue_type_script_setup_true_lang-BiuYwDhv.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 890`** (1 nodes): `ComingSoon-CnCpsUqM.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 891`** (1 nodes): `BackupIntroduction-Djw57CYc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 892`** (1 nodes): `PinInput-Dv14h-IN.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 893`** (1 nodes): `ValidateWords-BlUhyyC8.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 894`** (1 nodes): `PinView-DyeSUw1O.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 895`** (1 nodes): `LongTimeNoSeeModal-C9Q3rgod.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 896`** (1 nodes): `Confirm-yUnLKlyV.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 897`** (1 nodes): `de-BKAqXfUj.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 898`** (1 nodes): `NimWithdrawConfirm-Bw_4UvQm.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 899`** (1 nodes): `ExpiringPointsModal-PGolnAQn.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 900`** (1 nodes): `MapModal-Dr0RSk9F.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 901`** (1 nodes): `AddressDisplay-PdDMFqGl.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 902`** (1 nodes): `BricksInput-g88aWw5r.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 903`** (1 nodes): `NakaCardDelete-B_bwVX3x.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 904`** (1 nodes): `en-DjLRgi_Z.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 905`** (1 nodes): `PaymentSelector-LliKQk_Z.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 906`** (1 nodes): `NimAddressDisplay-nOR0_H7K.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 907`** (1 nodes): `CodeInput-F40SCHF1.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 908`** (1 nodes): `PaymentAmountInput-hRshr8cc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 909`** (1 nodes): `DevModal-VlBVKkaw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 910`** (1 nodes): `fr-CVFmkG-j.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 911`** (1 nodes): `TransactionDetails-Cl2c-pHu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 912`** (1 nodes): `SetupView-C2zi3tKS.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 913`** (1 nodes): `ConfirmAddressDeletion-Cs1xrokF.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 914`** (1 nodes): `index-CgMNWKhn.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 915`** (1 nodes): `es-BNTQhB2z.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 916`** (1 nodes): `DisclaimerModal-B8NTF-7p.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 917`** (1 nodes): `CategoryIcon-Dbg4cIF1.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 918`** (1 nodes): `OnBoardingScreen-D3K8CfQI.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 919`** (1 nodes): `config-DUtBegEf.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 920`** (1 nodes): `index-Djy9W3Dw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 921`** (1 nodes): `PointsModal-DkBd4ElL.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 922`** (1 nodes): `GenericInput-CYuNS1C4.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 923`** (1 nodes): `Warning-SX6sHPL1.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 924`** (1 nodes): `MiniAppWarningModal-Du7LfQlx.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 925`** (1 nodes): `ModalTemplate.vue_vue_type_script_setup_true_lang-8RRldsvQ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 926`** (1 nodes): `SettingsModal-y6pb6YRS.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 927`** (1 nodes): `PolygonWarning.vue_vue_type_script_setup_true_lang-CEC0WzEt.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 928`** (1 nodes): `EnableBiometricModal-CBGwSyR3.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 929`** (1 nodes): `AmountInput-9XfBzH5D.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 930`** (1 nodes): `pt-tuiwEKRh.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 931`** (1 nodes): `BluecodeNotSupported-DCgw1eck.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 932`** (1 nodes): `nimiq-pay.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 933`** (1 nodes): `window.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 934`** (1 nodes): `useGoCrypto Module (GoCrypto Payment Integration)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 935`** (1 nodes): `parseGoCryptoRequestLink`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 936`** (1 nodes): `selectedFiat watcher converts spending limits`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 937`** (1 nodes): `isCountryNakaSupported`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 938`** (1 nodes): `mini-apps.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 939`** (1 nodes): `SumsubErrorType enum`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 940`** (1 nodes): `nativeFetch.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SVGKImageCacheLine` connect `Capacitor Plugins` to `SVG iOS Bindings`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `SessionIDChangeReason` connect `Capacitor Plugins` to `WebP Codec`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `ResourceBundleClass`, `-sharedInstance`, `-init` to the rest of the system?**
  _2184 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLCipher Internals` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `SQLCipher Internals 2` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `WebP Codec` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `SVG iOS Bindings` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._