# Graph Report - .  (2026-05-08)

## Corpus Check
- 3230 files · ~8,029,114 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 15025 nodes · 36625 edges · 516 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

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
- `FIRInstallationsBackoffEventData` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/Pods/FirebaseInstallations/FirebaseInstallations/Source/Library/InstallationsIDController/FIRInstallationsBackoffController.m →   _Bridges community 19 → community 5_
- `DDTTYLoggerColorProfile` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/Pods/CocoaLumberjack/Sources/CocoaLumberjack/DDTTYLogger.m →   _Bridges community 46 → community 5_
- `DDLoggerNode` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/Pods/CocoaLumberjack/Sources/CocoaLumberjack/DDLog.m →   _Bridges community 37 → community 5_
- `IONCAMRGalleryManager` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/Pods/IONCameraLib/Sources/IONCameraLib/IONCAMRGalleryManager.swift →   _Bridges community 14 → community 5_
- `IONCAMRPhotoLibraryService` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/Pods/IONCameraLib/Sources/IONCameraLib/Interfaces/PhotoLibrary/IONCAMRPhotoLibraryService.swift →   _Bridges community 5 → community 63_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.0
Nodes (2220): actionName(), addToBlockedList(), adjustOrderByCol(), adjustStats(), AdjustTree(), afpCheckReservedLock(), afpClose(), afpLock() (+2212 more)

### Community 1 - "Community 1"
Cohesion: 0.0
Nodes (586): ApplyFiltersAndEncode(), CompressAlphaJob(), EncodeAlpha(), EncodeAlphaInternal(), EncodeLossless(), GetFilterMap(), GetNumColors(), InitFilterTrial() (+578 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (873): addAggInfoColumn(), addAggInfoFunc(), addArgumentToVtab(), addModuleArgument(), addOp4IntSlow(), addSpaceSeparator(), addToVTrans(), agginfoFree() (+865 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (90): $a(), An, Ao, as, b(), ba(), Bi(), bn (+82 more)

### Community 4 - "Community 4"
Cohesion: 0.0
Nodes (498): Attr, -initWithNamespacequalifiedNamevalue, -initWithNamevalue, BaseClassForAllSVGBasicShapes, -dealloc, -init, -layoutLayer, -newLayer (+490 more)

### Community 5 - "Community 5"
Cohesion: 0.0
Nodes (472): PodsDummy_AparajitaCapacitorBiometricAuth, PodsDummy_AparajitaCapacitorSecureStorage, PodsDummy_AppsCapacitorMonetplusHce, PodsDummy_Capacitor, PodsDummy_CapacitorApp, PodsDummy_CapacitorBrowser, PodsDummy_CapacitorCamera, PodsDummy_CapacitorClipboard (+464 more)

### Community 6 - "Community 6"
Cohesion: 0.01
Nodes (240): _a(), aa(), Ac(), Ae(), ai, ao(), ar(), as() (+232 more)

### Community 7 - "Community 7"
Cohesion: 0.01
Nodes (127): Address, addToExternrefTable0(), _assertClass(), _base64encodeChunk(), _base64fromByteArray(), _bitsToEntropy(), _bitsToMnemonic(), BLSKeyPair (+119 more)

### Community 8 - "Community 8"
Cohesion: 0.01
Nodes (435): A, adapt(), _addListener(), adler32(), afterTransform(), afterWrite(), alloc(), allocUnsafe() (+427 more)

### Community 9 - "Community 9"
Cohesion: 0.01
Nodes (179): assetToSwapPair(), buildPaymentAnalyticsProps(), capture(), getAmountRange(), trackAppOpened(), trackChainSwitched(), trackCurrentAppOpen(), trackDAppClosed() (+171 more)

### Community 10 - "Community 10"
Cohesion: 0.01
Nodes (448): absFunc(), areDoubleQuotedStringsEnabled(), autoAdjustDate(), avgFinalize(), bytecodevtabColumn(), bytelengthFunc(), cdateFunc(), ceilingFunc() (+440 more)

### Community 11 - "Community 11"
Cohesion: 0.01
Nodes (392): accessPayload(), accessPayloadChecked(), allocateBtreePage(), allocateSpace(), allocateTempSpace(), alsoAnInt(), anotherValidCursor(), applyAffinity() (+384 more)

### Community 12 - "Community 12"
Cohesion: 0.01
Nodes (319): GDTCCTCompressionHelper, -gzippedData, -isGzipped, GDTCCTUploadOperation, -batchByAddingMetricsEventToBatchforTarget, -cancel, -constructRequestProtoWithEvents, -constructRequestWithURLforTargetdata (+311 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (327): $1(), _5(), $7(), _9(), _A(), A1(), a5(), a7() (+319 more)

### Community 14 - "Community 14"
Cohesion: 0.01
Nodes (99): AnyObject, ApplicationEventPublisher, ApplicationEventPublishing, BaseApplicationEventPublisher, UIApplication, ApplicationLifecyclePublisher, AppLifecyclePublishing, BaseApplicationLifecyclePublisher (+91 more)

### Community 15 - "Community 15"
Cohesion: 0.01
Nodes (176): AccessMode, create, read, update, Archive, Archive.EndOfCentralDirectoryRecord, ArchiveError, cancelledOperation (+168 more)

### Community 16 - "Community 16"
Cohesion: 0.01
Nodes (184): Codable, CodingKey, CompressionLevel, Data, DataSize, Gzip, GzipError, GzipError.Kind (+176 more)

### Community 17 - "Community 17"
Cohesion: 0.01
Nodes (112): BottomSection, Comparable, ConfirmationMessage, CustomPresentationDetent, EmojiRating, TestView, EnvironmentKey, Hashable (+104 more)

### Community 18 - "Community 18"
Cohesion: 0.01
Nodes (102): Archive, Archive.AccessMode, Archive.MemoryFile, fileFromCookie(), MemoryFile, MemoryFileError, invalidMemoryFile, readStub() (+94 more)

### Community 19 - "Community 19"
Cohesion: 0.01
Nodes (171): FIRInstallations, -assertCompatibleIIDVersion, -authTokenForcingRefreshcompletion, -authTokenWithCompletion, -componentsToRegister, -deleteWithCompletion, -initWithApp, -initWithAppOptionsappNameinstallationsIDControllerprefetchAuthToken (+163 more)

### Community 20 - "Community 20"
Cohesion: 0.02
Nodes (123): FBLPromise, -all, -allOn, -onQueueall, FBLPromise, -always, -alwaysOn, -onQueuealways (+115 more)

### Community 21 - "Community 21"
Cohesion: 0.02
Nodes (122): FIRAnalyticsConfiguration, -postNotificationNamevalue, -setAnalyticsCollectionEnabled, -setAnalyticsCollectionEnabledpersistSetting, -sharedInstance, FIRApp, -actualBundleID, -addAppToAppDictionary (+114 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (96): Ae(), Ai(), ao(), At(), Bo(), Ce(), ci(), cn() (+88 more)

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (124): _0(), a0(), ar(), as(), au(), b0(), bs(), bu() (+116 more)

### Community 24 - "Community 24"
Cohesion: 0.03
Nodes (44): ae, At, B(), ce(), Ct(), de(), dt(), _e() (+36 more)

### Community 25 - "Community 25"
Cohesion: 0.02
Nodes (112): DDBufferedProxy, -dealloc, -flush, -flushBuffer, -forwardInvocation, -initWithFileLogger, -logMessage, -lt_sendBufferedDataToFileLogger (+104 more)

### Community 26 - "Community 26"
Cohesion: 0.04
Nodes (96): allocateCursor(), closeAllCursors(), closeCursorsInFrame(), freeCursorWithCache(), fts5Porter_MEq1(), fts5Porter_MGt0(), fts5Porter_MGt1(), fts5Porter_MGt1_and_S_or_T() (+88 more)

### Community 27 - "Community 27"
Cohesion: 0.04
Nodes (68): CheckSlowModel(), GetCPUInfo(), x86CPUInfo(), xgetbv(), clip(), clip_8b(), clip_bit_depth(), ConvertWRGBToYUV() (+60 more)

### Community 28 - "Community 28"
Cohesion: 0.06
Nodes (65): Add4x4_NEON(), ApplyFilter2_NEON(), ApplyFilter2NoFlip_NEON(), ApplyFilter4_NEON(), ApplyFilter6_NEON(), ConvertU8ToS16_NEON(), DC16_NEON(), DC16NoLeft_NEON() (+57 more)

### Community 29 - "Community 29"
Cohesion: 0.05
Nodes (19): a(), b, C, d(), e(), f(), g, h() (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.07
Nodes (56): alias(), autocapture(), buildEvent(), buildProperties(), capture(), close(), dynamicContext(), endSession() (+48 more)

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (1): i

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (55): CollectHistogram_SSE2(), DC16_SSE2(), DC16Mode_SSE2(), DC16NoLeft_SSE2(), DC16NoTop_SSE2(), DC16NoTopLeft_SSE2(), DC4_SSE2(), DC8uv_SSE2() (+47 more)

### Community 33 - "Community 33"
Cohesion: 0.06
Nodes (38): clip_8b(), DC16_C(), DC16NoLeft_C(), DC16NoTop_C(), DC16NoTopLeft_C(), DC8uv_C(), DC8uvNoLeft_C(), DC8uvNoTop_C() (+30 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (33): AutoCapturable, Element, EventData, EventSource, actionMethod, gestureRecognizer, notification, EventType (+25 more)

### Community 35 - "Community 35"
Cohesion: 0.08
Nodes (40): ComplexMask_SSE2(), DC16_SSE2(), DC16NoLeft_SSE2(), DC16NoTop_SSE2(), DC16NoTopLeft_SSE2(), DC8uv_SSE2(), DC8uvNoLeft_SSE2(), DC8uvNoTop_SSE2() (+32 more)

### Community 36 - "Community 36"
Cohesion: 0.04
Nodes (50): SVGKImage(), -addSVGLayerTreewithIdentifiertoDictionary, -animatedImageNamedduration, -animatedImageWithImagesduration, -animatedResizableImageNamedcapInsetsduration, -CALayerTree, -clearCache, -dealloc (+42 more)

### Community 37 - "Community 37"
Cohesion: 0.04
Nodes (44): -addLogger, -addLoggerwithLevel, -allLoggers, -allLoggersWithLevel, -applicationWillTerminate, DDAbstractLogger(), -dealloc, -init (+36 more)

### Community 38 - "Community 38"
Cohesion: 0.09
Nodes (37): clip_8b(), clip_max(), CollectHistogram_C(), Copy(), Copy16x8_C(), Copy4x4_C(), DC4(), DCMode() (+29 more)

### Community 39 - "Community 39"
Cohesion: 0.05
Nodes (1): T

### Community 40 - "Community 40"
Cohesion: 0.11
Nodes (33): clearFeatureFlags(), getCachedFeatureFlagPayload(), getCachedFeatureFlags(), getCachedFlags(), getCachedRemoteConfig(), getFeatureFlag(), getFeatureFlagDetails(), getFeatureFlagPayload() (+25 more)

### Community 41 - "Community 41"
Cohesion: 0.1
Nodes (36): AccumulateSSE16_NEON(), Add4x4_NEON(), CollectHistogram_NEON(), ConvertU8ToS16_NEON(), DCMode_NEON(), DiffU8ToS16_NEON(), Disto16x16_NEON(), Disto4x4_NEON() (+28 more)

### Community 42 - "Community 42"
Cohesion: 0.08
Nodes (24): AddSubtractComponentFull(), AddSubtractComponentHalf(), Average2(), Average3(), Average4(), ClampedAddSubtractFull(), ClampedAddSubtractHalf(), Clip255() (+16 more)

### Community 43 - "Community 43"
Cohesion: 0.13
Nodes (36): AddScore(), CheckLambdaValue(), clip(), CopyScore(), CorrectDCValues(), ExpandMatrix(), GetCostModeI4(), InitScore() (+28 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (33): ConvertARGBToUV_SSE2(), ConvertARGBToY_SSE2(), ConvertBGR24ToY_SSE2(), ConvertRGB24ToY_SSE2(), ConvertRGBA32ToUV_SSE2(), ConvertRGBToUV_SSE2(), ConvertRGBToY_SSE2(), ConvertYUV444ToRGB_SSE2() (+25 more)

### Community 45 - "Community 45"
Cohesion: 0.11
Nodes (1): MiniAppHost

### Community 46 - "Community 46"
Cohesion: 0.06
Nodes (31): DDASLLogger, -init, -loggerName, -logMessage, -sharedInstance, DDTTYLogger, -clearAllColors, -clearColorsForAllFlags (+23 more)

### Community 47 - "Community 47"
Cohesion: 0.06
Nodes (31): DDAbstractDatabaseLogger, -createAndStartDeleteTimer, -createSuspendedSaveTimer, -db_delete, -db_log, -db_save, -db_saveAndDelete, -dealloc (+23 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (30): SVGKImageRep, -canInitWithData, -copyWithZone, -draw, -drawInRect, -encodeWithCoder, -imageRepWithContentsOfFile, -imageRepWithContentsOfURL (+22 more)

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (5): C(), d, e, u(), v()

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (9): PostHogSessionManager, SessionIDChangeReason, customSessionId, sessionEnd, sessionIdEmpty, sessionPastMaximumLength, sessionReset, sessionStart (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (21): ConvertARGBToUV_SSE41(), ConvertARGBToY_SSE41(), ConvertBGR24ToY_SSE41(), ConvertRGB24ToY_SSE41(), ConvertRGBA32ToUV_SSE41(), ConvertRGBToUV_SSE41(), ConvertRGBToY_SSE41(), ConvertYUV444ToRGB_SSE41() (+13 more)

### Community 52 - "Community 52"
Cohesion: 0.2
Nodes (3): g, m(), q()

### Community 53 - "Community 53"
Cohesion: 0.11
Nodes (15): ExportBlock(), ImportBlock(), ImportLine(), InitLeft(), InitTop(), MinSize(), VP8IteratorExport(), VP8IteratorImport() (+7 more)

### Community 54 - "Community 54"
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

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (12): ApplyAlphaMultiply4444_C(), ApplyAlphaMultiply_16b_C(), dither_hi(), dither_lo(), GetScale(), MakeARGB32(), Mult(), multiply() (+4 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (4): CocoaError, FileManager, POSIXError, URL

### Community 57 - "Community 57"
Cohesion: 0.1
Nodes (4): PostHogSessionReplayConsoleLogsPlugin, PostHogSessionReplayNetworkPlugin, PostHogSessionReplayPlugin, PostHogSessionReplayPlugin

### Community 58 - "Community 58"
Cohesion: 0.13
Nodes (12): _ACResourceInitProtocol, AppKit.NSColor, AppKit.NSImage, ColorResource, ImageResource, ResourceBundleClass, SwiftUI.Color, SwiftUI.Image (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.16
Nodes (10): EdgeBorder, CheckIcon, DissatisfiedEmoji, NeutralEmoji, SatisfiedEmoji, ThumbsDownEmoji, ThumbsUpEmoji, VeryDissatisfiedEmoji (+2 more)

### Community 60 - "Community 60"
Cohesion: 0.23
Nodes (18): ChangeState(), End(), Execute(), Launch(), pthread_cond_destroy(), pthread_cond_init(), pthread_cond_signal(), pthread_cond_wait() (+10 more)

### Community 61 - "Community 61"
Cohesion: 0.18
Nodes (3): g(), r, x()

### Community 62 - "Community 62"
Cohesion: 0.11
Nodes (1): d

### Community 63 - "Community 63"
Cohesion: 0.15
Nodes (4): IONCAMRPhotoLibraryService, ObservableObject, PHPhotoLibraryChangeObserver, SurveyDisplayController

### Community 64 - "Community 64"
Cohesion: 0.16
Nodes (8): CUnsignedInt, Color, UIColor, UIColorMasks, alphaMask, blueMask, greenMask, redMask

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (8): as(), Ga(), is(), ls(), me(), oe(), ts(), Ve()

### Community 66 - "Community 66"
Cohesion: 0.12
Nodes (16): DDAtomicCounter, -decrement, -increment, -initWithDefaultValue, -value, DDDispatchQueueLogFormatter, -configureDateFormatter, -createDateFormatter (+8 more)

### Community 67 - "Community 67"
Cohesion: 0.12
Nodes (1): L

### Community 68 - "Community 68"
Cohesion: 0.13
Nodes (15): DDOSLogger, -init, -initWithLogLevelMapper, -initWithSubsystemcategory, -initWithSubsystemcategorylogLevelMapper, -logger, -loggerName, -logLevelMapper (+7 more)

### Community 69 - "Community 69"
Cohesion: 0.21
Nodes (4): Data, Encodable, HeartbeatStorage, HeartbeatStorageProtocol

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (2): D(), I()

### Community 71 - "Community 71"
Cohesion: 0.22
Nodes (1): f

### Community 72 - "Community 72"
Cohesion: 0.2
Nodes (8): b(), c(), E(), f(), k(), l(), m(), w()

### Community 73 - "Community 73"
Cohesion: 0.2
Nodes (6): getScreenSize(), init(), onOrientationDidChange(), onShouldUpdateScreenSize(), registerNotifications(), updateScreenSize()

### Community 74 - "Community 74"
Cohesion: 0.28
Nodes (11): De(), fe(), Ie(), Le(), Me(), Ne(), Oe(), qe() (+3 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (1): m

### Community 76 - "Community 76"
Cohesion: 0.28
Nodes (10): C(), G(), I(), k(), M(), q(), te(), V() (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.17
Nodes (12): SVGMatrix, -flipX, -flipY, -inverse, -multiply, -rotate, -rotateFromVectory, -scale (+4 more)

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (1): PostHogStorageManager

### Community 79 - "Community 79"
Cohesion: 0.35
Nodes (1): KeychainSwift

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (3): AppDelegate, UIApplicationDelegate, UIResponder

### Community 81 - "Community 81"
Cohesion: 0.26
Nodes (1): o

### Community 82 - "Community 82"
Cohesion: 0.18
Nodes (1): y

### Community 83 - "Community 83"
Cohesion: 0.29
Nodes (12): copy_stemmer(), doubleConsonant(), hasVowel(), isConsonant(), isVowel(), m_eq_1(), m_gt_0(), m_gt_1() (+4 more)

### Community 84 - "Community 84"
Cohesion: 0.23
Nodes (1): Archive

### Community 85 - "Community 85"
Cohesion: 0.2
Nodes (10): DDContextAllowlistFilterLogFormatter, -addToWhitelist, -isOnWhitelist, -removeFromWhitelist, -whitelist, DDContextDenylistFilterLogFormatter, -addToBlacklist, -blacklist (+2 more)

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (1): PostHogFileBackedQueue

### Community 87 - "Community 87"
Cohesion: 0.38
Nodes (1): PostHogApi

### Community 88 - "Community 88"
Cohesion: 0.27
Nodes (5): PostHogSurvey, PostHogSurveyAppearance, PostHogSurveyQuestion, PostHogSurveyRatingDisplayType, PostHogSurveyTextContentType

### Community 89 - "Community 89"
Cohesion: 0.31
Nodes (2): ConsoleOutput, PostHogConsoleLogInterceptor

### Community 90 - "Community 90"
Cohesion: 0.27
Nodes (2): m(), u

### Community 91 - "Community 91"
Cohesion: 0.4
Nodes (8): a(), c(), k(), L, Q(), T(), w(), x()

### Community 92 - "Community 92"
Cohesion: 0.27
Nodes (1): y

### Community 93 - "Community 93"
Cohesion: 0.2
Nodes (1): o

### Community 94 - "Community 94"
Cohesion: 0.31
Nodes (7): I(), m(), O(), P(), R(), v(), x()

### Community 95 - "Community 95"
Cohesion: 0.22
Nodes (9): DDMultiFormatter, -addFormatter, -formatLogMessage, -formatters, -init, -isFormattingWithFormatter, -logMessageForLineoriginalMessage, -removeAllFormatters (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.36
Nodes (3): AppUITests, XCUIApplication, XCTestCase

### Community 97 - "Community 97"
Cohesion: 0.33
Nodes (6): CapacitorException, convertBody(), convertFormData(), createProxyUrl(), isRelativeOrProxyUrl(), readFileAsBase64()

### Community 98 - "Community 98"
Cohesion: 0.22
Nodes (8): ArrayUtils, BufferUtils, Entropy, ExtendedPrivateKey, MnemonicUtils, NumberUtils, SerialBuffer, StringUtils

### Community 99 - "Community 99"
Cohesion: 0.53
Nodes (8): D(), G(), I(), J(), k(), P(), V(), z()

### Community 100 - "Community 100"
Cohesion: 0.25
Nodes (1): l

### Community 101 - "Community 101"
Cohesion: 0.22
Nodes (1): s

### Community 102 - "Community 102"
Cohesion: 0.25
Nodes (8): DDASLLogCapture, -aslMessageReceived, -captureAslLogs, -captureLevel, -configureAslQuery, -setCaptureLevel, -start, -stop

### Community 103 - "Community 103"
Cohesion: 0.25
Nodes (2): CALayer, UIView

### Community 104 - "Community 104"
Cohesion: 0.36
Nodes (1): URLSessionInterceptor

### Community 105 - "Community 105"
Cohesion: 0.25
Nodes (1): y

### Community 106 - "Community 106"
Cohesion: 0.25
Nodes (1): i

### Community 107 - "Community 107"
Cohesion: 0.25
Nodes (0): 

### Community 108 - "Community 108"
Cohesion: 0.32
Nodes (5): Constants, FileManager, FileStorage, StorageFactory, UserDefaultsStorage

### Community 109 - "Community 109"
Cohesion: 0.29
Nodes (7): SVGTransform, -setMatrix, -setRotatecxcy, -setScalesy, -setSkewX, -setSkewY, -setTranslatety

### Community 110 - "Community 110"
Cohesion: 0.29
Nodes (7): SVGKImageView, -init, -initWithCoder, -initWithFrame, -initWithSVGKImage, -intrinsicContentSize, -isFlipped

### Community 111 - "Community 111"
Cohesion: 0.36
Nodes (1): Archive

### Community 112 - "Community 112"
Cohesion: 0.25
Nodes (5): PassthroughWindow, PassthroughWindow, SurveysWindow, UIWindow, UIWindow

### Community 113 - "Community 113"
Cohesion: 0.46
Nodes (1): URLSession

### Community 114 - "Community 114"
Cohesion: 0.25
Nodes (6): KeychainSwiftAccessOptions, accessibleAfterFirstUnlock, accessibleAfterFirstUnlockThisDeviceOnly, accessibleWhenPasscodeSetThisDeviceOnly, accessibleWhenUnlocked, accessibleWhenUnlockedThisDeviceOnly

### Community 115 - "Community 115"
Cohesion: 0.43
Nodes (1): d

### Community 116 - "Community 116"
Cohesion: 0.57
Nodes (6): f(), H(), j(), K(), q(), Y()

### Community 117 - "Community 117"
Cohesion: 0.43
Nodes (1): UIImage

### Community 118 - "Community 118"
Cohesion: 0.33
Nodes (6): CharacterData, -appendData, -deleteDatacount, -insertDataarg, -replaceDatacountarg, -substringDatacount

### Community 119 - "Community 119"
Cohesion: 0.33
Nodes (6): SVGKLayer, -dealloc, -init, -layer, -setShowBorder, -setSVGImage

### Community 120 - "Community 120"
Cohesion: 0.29
Nodes (3): Entry.CentralDirectoryStructure, Entry.DataDescriptor, Entry.LocalFileHeader

### Community 121 - "Community 121"
Cohesion: 0.38
Nodes (3): PostHogAPIDateFormatter, toISO8601Date(), toISO8601String()

### Community 122 - "Community 122"
Cohesion: 0.33
Nodes (6): GULNetworkInfo, -formatMccandMNC, -getNetworkMobileCountryCode, -getNetworkMobileNetworkCode, -getNetworkRadioType, -getNetworkType

### Community 123 - "Community 123"
Cohesion: 0.33
Nodes (0): 

### Community 124 - "Community 124"
Cohesion: 0.33
Nodes (1): o

### Community 125 - "Community 125"
Cohesion: 0.6
Nodes (4): D(), P(), R(), w()

### Community 126 - "Community 126"
Cohesion: 0.33
Nodes (1): IONCAMRFactory

### Community 127 - "Community 127"
Cohesion: 0.4
Nodes (1): UIImage

### Community 128 - "Community 128"
Cohesion: 0.53
Nodes (1): URL

### Community 129 - "Community 129"
Cohesion: 0.33
Nodes (1): HeartbeatController

### Community 130 - "Community 130"
Cohesion: 0.4
Nodes (3): Date, stat, timeval

### Community 131 - "Community 131"
Cohesion: 0.33
Nodes (1): ReadWriteLock

### Community 132 - "Community 132"
Cohesion: 0.47
Nodes (2): TimeBasedEpochGenerator, UInt64

### Community 133 - "Community 133"
Cohesion: 0.4
Nodes (4): PostHogSurveysDefaultDelegate, renderSurvey(), setupWindow(), PostHogSurveysDelegate

### Community 134 - "Community 134"
Cohesion: 0.53
Nodes (2): imageToBase64(), UIImage

### Community 135 - "Community 135"
Cohesion: 0.4
Nodes (5): GULHeartbeatDateStorageUserDefaults, -heartbeatDateForTag, -heartbeatDictionaryFromDefaults, -initWithDefaultskey, -setHearbeatDateforTag

### Community 136 - "Community 136"
Cohesion: 0.4
Nodes (0): 

### Community 137 - "Community 137"
Cohesion: 0.5
Nodes (1): r

### Community 138 - "Community 138"
Cohesion: 0.4
Nodes (1): e

### Community 139 - "Community 139"
Cohesion: 0.6
Nodes (3): H(), O(), U()

### Community 140 - "Community 140"
Cohesion: 0.5
Nodes (0): 

### Community 141 - "Community 141"
Cohesion: 0.4
Nodes (1): IONCAMRCoordinator

### Community 142 - "Community 142"
Cohesion: 0.4
Nodes (3): Bundle, ImageEditor, IONCAMRAssets

### Community 143 - "Community 143"
Cohesion: 0.5
Nodes (4): AppleSucksDOMImplementation, -createDocumentqualifiedNamedoctype, -createDocumentTypepublicIdsystemId, -hasFeatureversion

### Community 144 - "Community 144"
Cohesion: 0.5
Nodes (4): MediaList, -appendMedium, -deleteMedium, -item

### Community 145 - "Community 145"
Cohesion: 0.5
Nodes (2): Archive, BackingConfiguration

### Community 146 - "Community 146"
Cohesion: 0.4
Nodes (3): CALayer, UIView, View

### Community 147 - "Community 147"
Cohesion: 0.4
Nodes (3): CALayer, UIView, View

### Community 148 - "Community 148"
Cohesion: 0.4
Nodes (0): 

### Community 149 - "Community 149"
Cohesion: 0.5
Nodes (1): o

### Community 150 - "Community 150"
Cohesion: 0.67
Nodes (2): J(), Q()

### Community 151 - "Community 151"
Cohesion: 0.5
Nodes (1): m

### Community 152 - "Community 152"
Cohesion: 0.5
Nodes (1): i

### Community 153 - "Community 153"
Cohesion: 0.67
Nodes (0): 

### Community 154 - "Community 154"
Cohesion: 0.5
Nodes (1): n

### Community 155 - "Community 155"
Cohesion: 0.67
Nodes (3): CLIColor, -colorWithCalibratedRedgreenbluealpha, -getRedgreenbluealpha

### Community 156 - "Community 156"
Cohesion: 0.67
Nodes (3): Text, -initWithValue, -splitText

### Community 157 - "Community 157"
Cohesion: 0.67
Nodes (3): SVGAnimatedPreserveAspectRatio, -animVal, -init

### Community 158 - "Community 158"
Cohesion: 0.67
Nodes (3): SVGAngle, -convertToSpecifiedUnits, -newValueSpecifiedUnitsvalueInSpecifiedUnits

### Community 159 - "Community 159"
Cohesion: 0.5
Nodes (1): Archive

### Community 160 - "Community 160"
Cohesion: 0.5
Nodes (1): Data

### Community 161 - "Community 161"
Cohesion: 0.67
Nodes (2): sanitizeDictionary(), toJSONData()

### Community 162 - "Community 162"
Cohesion: 0.5
Nodes (1): PostHogMulticastCallback

### Community 163 - "Community 163"
Cohesion: 0.5
Nodes (0): 

### Community 164 - "Community 164"
Cohesion: 0.5
Nodes (2): ButtonStyle, SurveyButtonStyle

### Community 165 - "Community 165"
Cohesion: 0.67
Nodes (2): Date, dateToMillis()

### Community 166 - "Community 166"
Cohesion: 0.5
Nodes (1): NetworkSample

### Community 167 - "Community 167"
Cohesion: 0.67
Nodes (2): initProvider(), retryInit()

### Community 168 - "Community 168"
Cohesion: 0.5
Nodes (3): DynamicScroller, DynamicScrollerItem, RecycleScroller

### Community 169 - "Community 169"
Cohesion: 0.5
Nodes (0): 

### Community 170 - "Community 170"
Cohesion: 0.5
Nodes (0): 

### Community 171 - "Community 171"
Cohesion: 0.67
Nodes (0): 

### Community 172 - "Community 172"
Cohesion: 1.0
Nodes (0): 

### Community 173 - "Community 173"
Cohesion: 1.0
Nodes (2): a(), l()

### Community 174 - "Community 174"
Cohesion: 0.67
Nodes (0): 

### Community 175 - "Community 175"
Cohesion: 0.67
Nodes (0): 

### Community 176 - "Community 176"
Cohesion: 0.67
Nodes (0): 

### Community 177 - "Community 177"
Cohesion: 0.67
Nodes (0): 

### Community 178 - "Community 178"
Cohesion: 0.67
Nodes (0): 

### Community 179 - "Community 179"
Cohesion: 0.67
Nodes (0): 

### Community 180 - "Community 180"
Cohesion: 0.67
Nodes (0): 

### Community 181 - "Community 181"
Cohesion: 1.0
Nodes (2): A(), E()

### Community 182 - "Community 182"
Cohesion: 0.67
Nodes (1): s

### Community 183 - "Community 183"
Cohesion: 0.67
Nodes (0): 

### Community 184 - "Community 184"
Cohesion: 1.0
Nodes (2): FBLPromise, -dispatchGroup

### Community 185 - "Community 185"
Cohesion: 0.67
Nodes (1): Data

### Community 186 - "Community 186"
Cohesion: 0.67
Nodes (1): CGSize

### Community 187 - "Community 187"
Cohesion: 1.0
Nodes (2): DocumentFragment, -init

### Community 188 - "Community 188"
Cohesion: 1.0
Nodes (2): CDATASection, -initWithValue

### Community 189 - "Community 189"
Cohesion: 1.0
Nodes (2): ProcessingInstruction, -initProcessingInstructionvalue

### Community 190 - "Community 190"
Cohesion: 1.0
Nodes (2): Comment, -initWithValue

### Community 191 - "Community 191"
Cohesion: 1.0
Nodes (2): SVGPreserveAspectRatio, -init

### Community 192 - "Community 192"
Cohesion: 1.0
Nodes (2): SVGPoint, -matrixTransform

### Community 193 - "Community 193"
Cohesion: 0.67
Nodes (1): Archive

### Community 194 - "Community 194"
Cohesion: 0.67
Nodes (1): URL

### Community 195 - "Community 195"
Cohesion: 0.67
Nodes (1): Archive

### Community 196 - "Community 196"
Cohesion: 0.67
Nodes (1): FileManager

### Community 197 - "Community 197"
Cohesion: 0.67
Nodes (1): Archive

### Community 198 - "Community 198"
Cohesion: 0.67
Nodes (1): UIImage

### Community 199 - "Community 199"
Cohesion: 0.67
Nodes (1): UUID

### Community 200 - "Community 200"
Cohesion: 0.67
Nodes (0): 

### Community 201 - "Community 201"
Cohesion: 1.0
Nodes (2): sampleOnProperty(), simpleHash()

### Community 202 - "Community 202"
Cohesion: 0.67
Nodes (1): UITextInputTraits

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (1): CGSize

### Community 204 - "Community 204"
Cohesion: 0.67
Nodes (1): String

### Community 205 - "Community 205"
Cohesion: 0.67
Nodes (1): BinaryFloatingPoint

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (1): UIColor

### Community 207 - "Community 207"
Cohesion: 0.67
Nodes (1): CGColor

### Community 208 - "Community 208"
Cohesion: 0.67
Nodes (1): RRStyle

### Community 209 - "Community 209"
Cohesion: 1.0
Nodes (2): maskImage(), toDict()

### Community 210 - "Community 210"
Cohesion: 0.67
Nodes (1): KeychainSwiftConstants

### Community 211 - "Community 211"
Cohesion: 0.67
Nodes (1): ExampleInstrumentedTest

### Community 212 - "Community 212"
Cohesion: 0.67
Nodes (1): ExampleUnitTest

### Community 213 - "Community 213"
Cohesion: 0.67
Nodes (1): MockContract

### Community 214 - "Community 214"
Cohesion: 0.67
Nodes (0): 

### Community 215 - "Community 215"
Cohesion: 1.0
Nodes (0): 

### Community 216 - "Community 216"
Cohesion: 1.0
Nodes (0): 

### Community 217 - "Community 217"
Cohesion: 1.0
Nodes (0): 

### Community 218 - "Community 218"
Cohesion: 1.0
Nodes (0): 

### Community 219 - "Community 219"
Cohesion: 1.0
Nodes (0): 

### Community 220 - "Community 220"
Cohesion: 1.0
Nodes (0): 

### Community 221 - "Community 221"
Cohesion: 1.0
Nodes (0): 

### Community 222 - "Community 222"
Cohesion: 1.0
Nodes (0): 

### Community 223 - "Community 223"
Cohesion: 1.0
Nodes (0): 

### Community 224 - "Community 224"
Cohesion: 1.0
Nodes (0): 

### Community 225 - "Community 225"
Cohesion: 1.0
Nodes (0): 

### Community 226 - "Community 226"
Cohesion: 1.0
Nodes (0): 

### Community 227 - "Community 227"
Cohesion: 1.0
Nodes (0): 

### Community 228 - "Community 228"
Cohesion: 1.0
Nodes (0): 

### Community 229 - "Community 229"
Cohesion: 1.0
Nodes (0): 

### Community 230 - "Community 230"
Cohesion: 1.0
Nodes (0): 

### Community 231 - "Community 231"
Cohesion: 2.0
Nodes (0): 

### Community 232 - "Community 232"
Cohesion: 1.0
Nodes (0): 

### Community 233 - "Community 233"
Cohesion: 1.0
Nodes (0): 

### Community 234 - "Community 234"
Cohesion: 1.0
Nodes (0): 

### Community 235 - "Community 235"
Cohesion: 1.0
Nodes (0): 

### Community 236 - "Community 236"
Cohesion: 1.0
Nodes (0): 

### Community 237 - "Community 237"
Cohesion: 1.0
Nodes (0): 

### Community 238 - "Community 238"
Cohesion: 1.0
Nodes (0): 

### Community 239 - "Community 239"
Cohesion: 1.0
Nodes (0): 

### Community 240 - "Community 240"
Cohesion: 1.0
Nodes (0): 

### Community 241 - "Community 241"
Cohesion: 1.0
Nodes (0): 

### Community 242 - "Community 242"
Cohesion: 1.0
Nodes (0): 

### Community 243 - "Community 243"
Cohesion: 1.0
Nodes (0): 

### Community 244 - "Community 244"
Cohesion: 1.0
Nodes (0): 

### Community 245 - "Community 245"
Cohesion: 1.0
Nodes (0): 

### Community 246 - "Community 246"
Cohesion: 1.0
Nodes (0): 

### Community 247 - "Community 247"
Cohesion: 1.0
Nodes (0): 

### Community 248 - "Community 248"
Cohesion: 1.0
Nodes (0): 

### Community 249 - "Community 249"
Cohesion: 1.0
Nodes (0): 

### Community 250 - "Community 250"
Cohesion: 1.0
Nodes (0): 

### Community 251 - "Community 251"
Cohesion: 1.0
Nodes (0): 

### Community 252 - "Community 252"
Cohesion: 1.0
Nodes (0): 

### Community 253 - "Community 253"
Cohesion: 1.0
Nodes (0): 

### Community 254 - "Community 254"
Cohesion: 1.0
Nodes (0): 

### Community 255 - "Community 255"
Cohesion: 1.0
Nodes (0): 

### Community 256 - "Community 256"
Cohesion: 1.0
Nodes (0): 

### Community 257 - "Community 257"
Cohesion: 2.0
Nodes (0): 

### Community 258 - "Community 258"
Cohesion: 1.0
Nodes (0): 

### Community 259 - "Community 259"
Cohesion: 1.0
Nodes (0): 

### Community 260 - "Community 260"
Cohesion: 1.0
Nodes (0): 

### Community 261 - "Community 261"
Cohesion: 2.0
Nodes (1): EntityReference

### Community 262 - "Community 262"
Cohesion: 2.0
Nodes (1): DocumentType

### Community 263 - "Community 263"
Cohesion: 2.0
Nodes (1): SVGTextContentElement

### Community 264 - "Community 264"
Cohesion: 2.0
Nodes (1): StyleSheet

### Community 265 - "Community 265"
Cohesion: 1.0
Nodes (0): 

### Community 266 - "Community 266"
Cohesion: 1.0
Nodes (0): 

### Community 267 - "Community 267"
Cohesion: 1.0
Nodes (0): 

### Community 268 - "Community 268"
Cohesion: 1.0
Nodes (0): 

### Community 269 - "Community 269"
Cohesion: 1.0
Nodes (0): 

### Community 270 - "Community 270"
Cohesion: 1.0
Nodes (1): WeakContainer

### Community 271 - "Community 271"
Cohesion: 2.0
Nodes (1): SVGStyleElement

### Community 272 - "Community 272"
Cohesion: 2.0
Nodes (1): CSSRule

### Community 273 - "Community 273"
Cohesion: 1.0
Nodes (1): PostHogSDK

### Community 274 - "Community 274"
Cohesion: 1.0
Nodes (0): 

### Community 275 - "Community 275"
Cohesion: 1.0
Nodes (1): PostHogConsumerPayload

### Community 276 - "Community 276"
Cohesion: 1.0
Nodes (0): 

### Community 277 - "Community 277"
Cohesion: 1.0
Nodes (1): PostHogPropertiesSanitizer

### Community 278 - "Community 278"
Cohesion: 1.0
Nodes (1): PostHogBatchUploadInfo

### Community 279 - "Community 279"
Cohesion: 1.0
Nodes (1): UIView

### Community 280 - "Community 280"
Cohesion: 1.0
Nodes (1): AssociatedKeys

### Community 281 - "Community 281"
Cohesion: 1.0
Nodes (1): Optional

### Community 282 - "Community 282"
Cohesion: 1.0
Nodes (1): ViewTreeSnapshotStatus

### Community 283 - "Community 283"
Cohesion: 1.0
Nodes (1): MainActivity

### Community 284 - "Community 284"
Cohesion: 1.0
Nodes (0): 

### Community 285 - "Community 285"
Cohesion: 1.0
Nodes (0): 

### Community 286 - "Community 286"
Cohesion: 1.0
Nodes (0): 

### Community 287 - "Community 287"
Cohesion: 1.0
Nodes (0): 

### Community 288 - "Community 288"
Cohesion: 1.0
Nodes (0): 

### Community 289 - "Community 289"
Cohesion: 1.0
Nodes (0): 

### Community 290 - "Community 290"
Cohesion: 1.0
Nodes (0): 

### Community 291 - "Community 291"
Cohesion: 1.0
Nodes (0): 

### Community 292 - "Community 292"
Cohesion: 1.0
Nodes (0): 

### Community 293 - "Community 293"
Cohesion: 1.0
Nodes (0): 

### Community 294 - "Community 294"
Cohesion: 1.0
Nodes (0): 

### Community 295 - "Community 295"
Cohesion: 1.0
Nodes (0): 

### Community 296 - "Community 296"
Cohesion: 1.0
Nodes (0): 

### Community 297 - "Community 297"
Cohesion: 1.0
Nodes (0): 

### Community 298 - "Community 298"
Cohesion: 1.0
Nodes (0): 

### Community 299 - "Community 299"
Cohesion: 1.0
Nodes (0): 

### Community 300 - "Community 300"
Cohesion: 1.0
Nodes (0): 

### Community 301 - "Community 301"
Cohesion: 1.0
Nodes (0): 

### Community 302 - "Community 302"
Cohesion: 1.0
Nodes (0): 

### Community 303 - "Community 303"
Cohesion: 1.0
Nodes (0): 

### Community 304 - "Community 304"
Cohesion: 1.0
Nodes (0): 

### Community 305 - "Community 305"
Cohesion: 1.0
Nodes (0): 

### Community 306 - "Community 306"
Cohesion: 1.0
Nodes (0): 

### Community 307 - "Community 307"
Cohesion: 1.0
Nodes (0): 

### Community 308 - "Community 308"
Cohesion: 1.0
Nodes (0): 

### Community 309 - "Community 309"
Cohesion: 1.0
Nodes (0): 

### Community 310 - "Community 310"
Cohesion: 1.0
Nodes (0): 

### Community 311 - "Community 311"
Cohesion: 1.0
Nodes (0): 

### Community 312 - "Community 312"
Cohesion: 1.0
Nodes (0): 

### Community 313 - "Community 313"
Cohesion: 1.0
Nodes (0): 

### Community 314 - "Community 314"
Cohesion: 1.0
Nodes (0): 

### Community 315 - "Community 315"
Cohesion: 1.0
Nodes (0): 

### Community 316 - "Community 316"
Cohesion: 1.0
Nodes (0): 

### Community 317 - "Community 317"
Cohesion: 1.0
Nodes (0): 

### Community 318 - "Community 318"
Cohesion: 1.0
Nodes (0): 

### Community 319 - "Community 319"
Cohesion: 1.0
Nodes (0): 

### Community 320 - "Community 320"
Cohesion: 1.0
Nodes (0): 

### Community 321 - "Community 321"
Cohesion: 1.0
Nodes (0): 

### Community 322 - "Community 322"
Cohesion: 1.0
Nodes (0): 

### Community 323 - "Community 323"
Cohesion: 1.0
Nodes (0): 

### Community 324 - "Community 324"
Cohesion: 1.0
Nodes (0): 

### Community 325 - "Community 325"
Cohesion: 1.0
Nodes (0): 

### Community 326 - "Community 326"
Cohesion: 1.0
Nodes (0): 

### Community 327 - "Community 327"
Cohesion: 1.0
Nodes (0): 

### Community 328 - "Community 328"
Cohesion: 1.0
Nodes (0): 

### Community 329 - "Community 329"
Cohesion: 1.0
Nodes (0): 

### Community 330 - "Community 330"
Cohesion: 1.0
Nodes (0): 

### Community 331 - "Community 331"
Cohesion: 1.0
Nodes (0): 

### Community 332 - "Community 332"
Cohesion: 1.0
Nodes (0): 

### Community 333 - "Community 333"
Cohesion: 1.0
Nodes (0): 

### Community 334 - "Community 334"
Cohesion: 1.0
Nodes (0): 

### Community 335 - "Community 335"
Cohesion: 1.0
Nodes (0): 

### Community 336 - "Community 336"
Cohesion: 1.0
Nodes (0): 

### Community 337 - "Community 337"
Cohesion: 1.0
Nodes (0): 

### Community 338 - "Community 338"
Cohesion: 1.0
Nodes (0): 

### Community 339 - "Community 339"
Cohesion: 1.0
Nodes (0): 

### Community 340 - "Community 340"
Cohesion: 1.0
Nodes (0): 

### Community 341 - "Community 341"
Cohesion: 1.0
Nodes (0): 

### Community 342 - "Community 342"
Cohesion: 1.0
Nodes (0): 

### Community 343 - "Community 343"
Cohesion: 1.0
Nodes (0): 

### Community 344 - "Community 344"
Cohesion: 1.0
Nodes (0): 

### Community 345 - "Community 345"
Cohesion: 1.0
Nodes (0): 

### Community 346 - "Community 346"
Cohesion: 1.0
Nodes (0): 

### Community 347 - "Community 347"
Cohesion: 1.0
Nodes (0): 

### Community 348 - "Community 348"
Cohesion: 1.0
Nodes (0): 

### Community 349 - "Community 349"
Cohesion: 1.0
Nodes (0): 

### Community 350 - "Community 350"
Cohesion: 1.0
Nodes (0): 

### Community 351 - "Community 351"
Cohesion: 1.0
Nodes (0): 

### Community 352 - "Community 352"
Cohesion: 1.0
Nodes (0): 

### Community 353 - "Community 353"
Cohesion: 1.0
Nodes (0): 

### Community 354 - "Community 354"
Cohesion: 1.0
Nodes (0): 

### Community 355 - "Community 355"
Cohesion: 1.0
Nodes (0): 

### Community 356 - "Community 356"
Cohesion: 1.0
Nodes (0): 

### Community 357 - "Community 357"
Cohesion: 1.0
Nodes (0): 

### Community 358 - "Community 358"
Cohesion: 1.0
Nodes (0): 

### Community 359 - "Community 359"
Cohesion: 1.0
Nodes (0): 

### Community 360 - "Community 360"
Cohesion: 1.0
Nodes (0): 

### Community 361 - "Community 361"
Cohesion: 1.0
Nodes (0): 

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
Cohesion: 1.0
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
Cohesion: 1.0
Nodes (0): 

### Community 402 - "Community 402"
Cohesion: 1.0
Nodes (0): 

### Community 403 - "Community 403"
Cohesion: 1.0
Nodes (0): 

### Community 404 - "Community 404"
Cohesion: 1.0
Nodes (0): 

### Community 405 - "Community 405"
Cohesion: 1.0
Nodes (0): 

### Community 406 - "Community 406"
Cohesion: 1.0
Nodes (0): 

### Community 407 - "Community 407"
Cohesion: 1.0
Nodes (0): 

### Community 408 - "Community 408"
Cohesion: 1.0
Nodes (0): 

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
Cohesion: 1.0
Nodes (0): 

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
Cohesion: 1.0
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
Cohesion: 1.0
Nodes (0): 

### Community 470 - "Community 470"
Cohesion: 1.0
Nodes (0): 

### Community 471 - "Community 471"
Cohesion: 1.0
Nodes (0): 

### Community 472 - "Community 472"
Cohesion: 1.0
Nodes (0): 

### Community 473 - "Community 473"
Cohesion: 1.0
Nodes (0): 

### Community 474 - "Community 474"
Cohesion: 1.0
Nodes (0): 

### Community 475 - "Community 475"
Cohesion: 1.0
Nodes (0): 

### Community 476 - "Community 476"
Cohesion: 1.0
Nodes (0): 

### Community 477 - "Community 477"
Cohesion: 1.0
Nodes (0): 

### Community 478 - "Community 478"
Cohesion: 1.0
Nodes (0): 

### Community 479 - "Community 479"
Cohesion: 1.0
Nodes (0): 

### Community 480 - "Community 480"
Cohesion: 1.0
Nodes (0): 

### Community 481 - "Community 481"
Cohesion: 1.0
Nodes (0): 

### Community 482 - "Community 482"
Cohesion: 1.0
Nodes (0): 

### Community 483 - "Community 483"
Cohesion: 1.0
Nodes (0): 

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

## Knowledge Gaps
- **2134 isolated node(s):** `ResourceBundleClass`, `ArrayUtils`, `SerialBuffer`, `BufferUtils`, `ExtendedPrivateKey` (+2129 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 215`** (2 nodes): `cypress.config.ts`, `setupNodeEvents()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (2 nodes): `commands.ts`, `e2e.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (2 nodes): `CAPBridgedPlugin.h`, `property()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (2 nodes): `transfer-handlers.js`, `setupMainThreadTransferHandlers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (2 nodes): `NakaOnboardingVerifyId-BCWDFk3a.js`, `X()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 220`** (2 nodes): `WorldIcon-bJaFQjDw.js`, `p()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (2 nodes): `index-DoAP1p4w.js`, `i()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 222`** (2 nodes): `nimiq-logo-ElIkmn1m.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 223`** (2 nodes): `ShowWords-CL8_P9_5.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 224`** (2 nodes): `steps-BgpBHJy0.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 225`** (2 nodes): `vue3-components-9uN0dvLo.js`, `n()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 226`** (2 nodes): `md.transition-gkS7pwP1.js`, `v()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 227`** (2 nodes): `EnableNotifications-Dhyn3KLC.js`, `x()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 228`** (2 nodes): `useBiometric-Optsj6iT.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 229`** (2 nodes): `arrow-up-right-DQ1-0jGH.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 230`** (2 nodes): `NimAddressInput-gN_41kQP.js`, `ee()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 231`** (2 nodes): `remote-signer-shkDLhuK.js`, `He()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 232`** (2 nodes): `kyc-Dmfz8jVQ.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 233`** (2 nodes): `TransactionAmounts.vue_vue_type_script_setup_true_lang-DyWc49nB.js`, `j()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 234`** (2 nodes): `ShortAddressDisplay-DpPvuMcg.js`, `B()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 235`** (2 nodes): `status-tap-BA7k95-c.js`, `m()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 236`** (2 nodes): `useMiniAppHost-D6OyuGUT.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 237`** (2 nodes): `gamepad-DhW-76Vp.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 238`** (2 nodes): `info-upwGVWSn.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 239`** (2 nodes): `QRScanner-C7X1sScB.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 240`** (2 nodes): `PaymentPreview-CMiA_Q4t.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 241`** (2 nodes): `useMiniAppSession-Bu0jzLZl.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 242`** (2 nodes): `swipe-back-CgUOjUXi.js`, `k()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 243`** (2 nodes): `NimWithdraw-BoUL0R86.js`, `Ye()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 244`** (2 nodes): `usdt-logo-Co0nGtQ6.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 245`** (2 nodes): `mini-app-confirmation-BE3_tsgM.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 246`** (2 nodes): `cryptocity-logo-DzfKrg2M.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 247`** (2 nodes): `useNotifications-CM5MsGBB.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 248`** (2 nodes): `check-BTKJAGob.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 249`** (2 nodes): `QuickButton.vue_vue_type_script_setup_true_lang-CODHKADz.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 250`** (2 nodes): `validation--AgK6yfI.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 251`** (2 nodes): `loading-spinner-BoRgYHGI.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 252`** (2 nodes): `index-fdroIwhp.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 253`** (2 nodes): `index-DC_KFMep.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 254`** (2 nodes): `useStringParser-x0Y_ZLAy.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 255`** (2 nodes): `useGoCryptoMonitoring-68nAfwnt.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 256`** (2 nodes): `index-DDr1KAKb.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 257`** (2 nodes): `points-CXJ8XzsK.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 258`** (2 nodes): `focus-visible-supuXXMI.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 259`** (2 nodes): `chevron-right-Dhds0VPT.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 260`** (2 nodes): `TransactionItem.vue_vue_type_script_setup_true_lang-D7f59q6W.js`, `W()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 261`** (2 nodes): `EntityReference.h`, `EntityReference`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 262`** (2 nodes): `DocumentType.h`, `DocumentType`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 263`** (2 nodes): `SVGTextContentElement.h`, `SVGTextContentElement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 264`** (2 nodes): `StyleSheet.h`, `StyleSheet`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 265`** (2 nodes): `CDVPluginResult.h`, `CDVPluginResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 266`** (2 nodes): `CDVConfigParser.h`, `NSXMLParserDelegate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 267`** (2 nodes): `CDVCommandDelegateImpl.h`, `CDVCommandDelegateImpl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 268`** (2 nodes): `CDVInvokedUrlCommand.h`, `CDVInvokedUrlCommand()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 269`** (2 nodes): `CDVURLProtocol.h`, `CDVURLProtocol()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 270`** (2 nodes): `WeakContainer.swift`, `WeakContainer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 271`** (2 nodes): `SVGStyleElement.h`, `SVGStyleElement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 272`** (2 nodes): `CSSRule.h`, `CSSRule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 273`** (2 nodes): `PostHogExtensions.swift`, `PostHogSDK`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 274`** (2 nodes): `PostHogLegacyQueue.swift`, `migrateOldQueue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 275`** (2 nodes): `PostHogConsumerPayload.swift`, `PostHogConsumerPayload`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 276`** (2 nodes): `PostHogSwizzler.swift`, `swizzle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 277`** (2 nodes): `PostHogPropertiesSanitizer.swift`, `PostHogPropertiesSanitizer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 278`** (2 nodes): `PostHogBatchUploadInfo.swift`, `PostHogBatchUploadInfo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 279`** (2 nodes): `UIView+PostHogLabel.swift`, `UIView`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 280`** (2 nodes): `AssociatedKeys.swift`, `AssociatedKeys`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 281`** (2 nodes): `Optional+Util.swift`, `Optional`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 282`** (2 nodes): `ViewTreeSnapshotStatus.swift`, `ViewTreeSnapshotStatus`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 283`** (2 nodes): `MainActivity.java`, `MainActivity`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 284`** (2 nodes): `usePrice.spec.ts`, `fetch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 285`** (2 nodes): `remote-signer.spec.ts`, `createAddress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 286`** (2 nodes): `ShortAddressDisplay.spec.ts`, `mountComponent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 287`** (2 nodes): `AmountInput.spec.ts`, `mountAmountInput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 288`** (2 nodes): `TheHomeFooter.spec.ts`, `iconForUrl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 289`** (2 nodes): `SetupView.spec.ts`, `passthrough()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 290`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 291`** (1 nodes): `DDLoggerNames.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 292`** (1 nodes): `WithdrawalAddressList-B-2_ZM75.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 293`** (1 nodes): `FIRCurrentDateProvider.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 294`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 295`** (1 nodes): `capacitor.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 296`** (1 nodes): `test.cy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 297`** (1 nodes): `CapacitorExtendedDialog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 298`** (1 nodes): `CapacitorCamera_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 299`** (1 nodes): `CapacitorScreenOrientation_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 300`** (1 nodes): `CocoaLumberjack_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 301`** (1 nodes): `FirebaseInstallations_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 302`** (1 nodes): `CapacitorDevice_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 303`** (1 nodes): `SVGKit_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 304`** (1 nodes): `nanopb_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 305`** (1 nodes): `CapacitorSumsubMobileSdk_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 306`** (1 nodes): `GoogleDataTransport_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 307`** (1 nodes): `KeychainSwift_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 308`** (1 nodes): `GoogleUtilities_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 309`** (1 nodes): `CapacitorPreferences_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 310`** (1 nodes): `Pods_App_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 311`** (1 nodes): `AppsCapacitorMonetplusHce_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 312`** (1 nodes): `CapacitorBrowser_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 313`** (1 nodes): `CapacitorHaptics_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 314`** (1 nodes): `CapacitorStatusBar_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 315`** (1 nodes): `CapacitorPushNotifications_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 316`** (1 nodes): `FirebaseCoreInternal_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 317`** (1 nodes): `AparajitaCapacitorBiometricAuth_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 318`** (1 nodes): `AparajitaCapacitorSecureStorage_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 319`** (1 nodes): `FirebaseMessaging_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 320`** (1 nodes): `CapawesomeCapacitorPosthog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 321`** (1 nodes): `CapacitorToast_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 322`** (1 nodes): `FBLPromises_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 323`** (1 nodes): `PostHog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 324`** (1 nodes): `CapgoInappbrowser_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 325`** (1 nodes): `CapacitorCommunitySqlite_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 326`** (1 nodes): `SQLCipher_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 327`** (1 nodes): `CapacitorApp_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 328`** (1 nodes): `FirebaseCore_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 329`** (1 nodes): `Cordova_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 330`** (1 nodes): `CapacitorClipboard_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 331`** (1 nodes): `CapacitorFilesystem_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 332`** (1 nodes): `Capacitor_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 333`** (1 nodes): `RdlaboCapacitorScreenshotEvent_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 334`** (1 nodes): `CapacitorShare_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 335`** (1 nodes): `CapacitorKeyboard_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 336`** (1 nodes): `CapgoCameraPreview_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 337`** (1 nodes): `CapacitorCommunityPrivacyScreen_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 338`** (1 nodes): `ZIPFoundation_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 339`** (1 nodes): `CapacitorBrowser-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 340`** (1 nodes): `CapacitorPreferences-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 341`** (1 nodes): `CapacitorExtendedDialog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 342`** (1 nodes): `SNSThemeMetrics.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 343`** (1 nodes): `SNSTheme.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 344`** (1 nodes): `SNSMobileSDKInfo.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 345`** (1 nodes): `SNSThemeImages.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 346`** (1 nodes): `SNSEvent.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 347`** (1 nodes): `IdensicMobileSDK.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 348`** (1 nodes): `SNSMobileSDKDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 349`** (1 nodes): `SNSSupportItem.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 350`** (1 nodes): `SNSMobileSDK.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 351`** (1 nodes): `SNSMobileSDK+Enums.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 352`** (1 nodes): `SNSThemeSection.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 353`** (1 nodes): `SNSDocumentDefinition.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 354`** (1 nodes): `SNSThemeFonts.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 355`** (1 nodes): `SNSThemeColors.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 356`** (1 nodes): `FirebaseCore.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 357`** (1 nodes): `FirebaseCore-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 358`** (1 nodes): `PromisesObjC-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 359`** (1 nodes): `CapacitorScreenOrientation-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 360`** (1 nodes): `CapacitorApp-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 361`** (1 nodes): `CapacitorFilesystem-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 362`** (1 nodes): `GoogleDataTransport-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 363`** (1 nodes): `GDTCORTargets.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 364`** (1 nodes): `CapacitorShare-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 365`** (1 nodes): `CapacitorSumsubMobileSdk-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 366`** (1 nodes): `CapacitorStatusBar-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 367`** (1 nodes): `FirebaseInstallations-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 368`** (1 nodes): `FIRInstallationsErrors.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 369`** (1 nodes): `FirebaseInstallations.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 370`** (1 nodes): `DDLegacyMacros.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 371`** (1 nodes): `DDLogMacros.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 372`** (1 nodes): `CocoaLumberjack.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 373`** (1 nodes): `DDAssertMacros.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 374`** (1 nodes): `DDLog+LOGV.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 375`** (1 nodes): `CocoaLumberjack-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 376`** (1 nodes): `CapgoCameraPreview-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 377`** (1 nodes): `CAPPluginCall.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 378`** (1 nodes): `CAPInstanceDescriptor.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 379`** (1 nodes): `CAPInstanceConfiguration.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 380`** (1 nodes): `CAPBridgedJSTypes.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 381`** (1 nodes): `CAPPluginMethod.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 382`** (1 nodes): `CAPBridgeViewController+CDVScreenOrientationDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 383`** (1 nodes): `CAPPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 384`** (1 nodes): `CapawesomeCapacitorPosthog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 385`** (1 nodes): `cordova.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 386`** (1 nodes): `nimiq.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 387`** (1 nodes): `registerSW.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 388`** (1 nodes): `cordova_plugins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 389`** (1 nodes): `fr-0_eB8Pp8.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 390`** (1 nodes): `PinInput-Zc5WwCFU.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 391`** (1 nodes): `OnBoardingScreen-7suqEdxS.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 392`** (1 nodes): `MapModal-BtvXPxGw.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 393`** (1 nodes): `MiniAppWarningModal-D18-2Wo0.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 394`** (1 nodes): `PinView-BvQE_HZz.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 395`** (1 nodes): `es-BB1AVa9_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 396`** (1 nodes): `ComingSoon-DB2LZV5t.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 397`** (1 nodes): `PaymentAmountInput-Cw5Ve1N_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 398`** (1 nodes): `DevModal-DkDsC6DP.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 399`** (1 nodes): `ReferralModal-Dv_c5YNd.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 400`** (1 nodes): `wasm-BxLt509m.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 401`** (1 nodes): `AmountInput-C6ZlQM29.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 402`** (1 nodes): `NimAddressDisplay-Dcs0UECI.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 403`** (1 nodes): `BluecodeNotSupported-C7MYUwX9.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 404`** (1 nodes): `SettingsModal-DP96B4vl.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 405`** (1 nodes): `SetupView-VULFlLZc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 406`** (1 nodes): `PolygonWarning.vue_vue_type_script_setup_true_lang-ByqhWdKi.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 407`** (1 nodes): `TransactionDetails-B2R7eu05.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 408`** (1 nodes): `index-B5vf_nbc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 409`** (1 nodes): `ModalTemplate.vue_vue_type_script_setup_true_lang-DIz59ez4.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 410`** (1 nodes): `PaymentRequestManualInput-DNp--jt4.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 411`** (1 nodes): `pt-C-49ZQU9.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 412`** (1 nodes): `PointsModal-Bsfxcr0m.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 413`** (1 nodes): `LongTimeNoSeeModal-DV5f5ZRz.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 414`** (1 nodes): `BricksInput-kX8kgN9p.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 415`** (1 nodes): `en-qObpnl0Z.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 416`** (1 nodes): `ConfirmAddressDeletion-D7OSwAuP.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 417`** (1 nodes): `config-CvcZrzDa.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 418`** (1 nodes): `NakaCardDelete-DXzhWSaL.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 419`** (1 nodes): `de-ehF7Tva_.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 420`** (1 nodes): `GenericInput-BHYKwAs6.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 421`** (1 nodes): `PaymentSelector-zWSqbmir.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 422`** (1 nodes): `index-DILgX2Vo.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 423`** (1 nodes): `DeletePointsModal-Dh2DZZQf.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 424`** (1 nodes): `CategoryIcon-BgmCeLVK.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 425`** (1 nodes): `ExpiringPointsModal-CviRuFV5.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 426`** (1 nodes): `DisclaimerModal-BjsJlaMZ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 427`** (1 nodes): `BackupIntroduction-CDO7tGIh.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 428`** (1 nodes): `EnableBiometricModal-DdVEfXUJ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 429`** (1 nodes): `PinInput.vue_vue_type_script_setup_true_lang-DdPNmyQH.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 430`** (1 nodes): `Confirm-DGWHD0qM.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 431`** (1 nodes): `Warning-w_8qs3jq.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 432`** (1 nodes): `ValidateWords-oh0jCj5K.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 433`** (1 nodes): `CodeInput-BsyR7G0L.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 434`** (1 nodes): `CapacitorDevice-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 435`** (1 nodes): `CapacitorPushNotifications-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 436`** (1 nodes): `FirebaseCoreInternal-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 437`** (1 nodes): `CapacitorHaptics-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 438`** (1 nodes): `ConverterSVGToCALayer.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 439`** (1 nodes): `SVGViewSpec.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 440`** (1 nodes): `SVGNumber.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 441`** (1 nodes): `SVGKParserExtension.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 442`** (1 nodes): `SVGStyleCatcher.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 443`** (1 nodes): `DocumentStyle.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 444`** (1 nodes): `SVGUnitTypes.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 445`** (1 nodes): `DocumentCSS.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 446`** (1 nodes): `SVGStylable.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 447`** (1 nodes): `SVGFitToViewBox.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 448`** (1 nodes): `CapacitorToast-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 449`** (1 nodes): `CapgoInappbrowser-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 450`** (1 nodes): `CDVAvailability.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 451`** (1 nodes): `CDVViewController.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 452`** (1 nodes): `CDVScreenOrientationDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 453`** (1 nodes): `CDV.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 454`** (1 nodes): `CapacitorCordova.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 455`** (1 nodes): `NSDictionary+CordovaPreferences.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 456`** (1 nodes): `CDVWebViewProcessPoolFactory.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 457`** (1 nodes): `CDVPlugin+Resources.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 458`** (1 nodes): `CDVCommandDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 459`** (1 nodes): `CDVPluginManager.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 460`** (1 nodes): `SQLCipher-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 461`** (1 nodes): `Plugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 462`** (1 nodes): `AparajitaCapacitorBiometricAuth-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 463`** (1 nodes): `CapacitorSQLitePlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 464`** (1 nodes): `CapacitorCommunitySqlite-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 465`** (1 nodes): `FirebaseMessaging.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 466`** (1 nodes): `FirebaseMessaging-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 467`** (1 nodes): `ZIPFoundation-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 468`** (1 nodes): `AparajitaCapacitorSecureStorage-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 469`** (1 nodes): `PostHog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 470`** (1 nodes): `PostHog.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 471`** (1 nodes): `PrivacyScreenPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 472`** (1 nodes): `CapacitorCommunityPrivacyScreen-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 473`** (1 nodes): `AppsCapacitorMonetplusHce-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 474`** (1 nodes): `GULHeartbeatDateStorable.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 475`** (1 nodes): `GULApplication.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 476`** (1 nodes): `GoogleUtilities-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 477`** (1 nodes): `GULNetworkLoggerProtocol.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 478`** (1 nodes): `RdlaboCapacitorScreenshotEvent-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 479`** (1 nodes): `nanopb-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 480`** (1 nodes): `CapacitorClipboard-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 481`** (1 nodes): `KeyboardPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 482`** (1 nodes): `CapacitorKeyboard-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 483`** (1 nodes): `Keyboard.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 484`** (1 nodes): `Pods-App-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 485`** (1 nodes): `KeychainSwift-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 486`** (1 nodes): `CapacitorCamera-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 487`** (1 nodes): `GDTCORMetricsControllerProtocol.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 488`** (1 nodes): `GDTCORUploader.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 489`** (1 nodes): `GDTCOREndpoints_Private.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 490`** (1 nodes): `CapacitorPrivacyScreen-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 491`** (1 nodes): `IONCameraLib-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 492`** (1 nodes): `FIRInstallationsStatus.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 493`** (1 nodes): `FIRAnalyticsInteropListener.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 494`** (1 nodes): `DI.swift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 495`** (1 nodes): `PostHogVersion.swift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 496`** (1 nodes): `CapacitorPrivacyScreen_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 497`** (1 nodes): `IONCameraLib_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 498`** (1 nodes): `CDVAvailabilityDeprecated.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 499`** (1 nodes): `browserstack-upload.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 500`** (1 nodes): `nimiq-pay.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 501`** (1 nodes): `rollup.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 502`** (1 nodes): `window.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 503`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 504`** (1 nodes): `shims-vue.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 505`** (1 nodes): `light-bolt11-decoder.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 506`** (1 nodes): `nimiq.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 507`** (1 nodes): `process-browser.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 508`** (1 nodes): `global.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 509`** (1 nodes): `useModal.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 510`** (1 nodes): `useStringParser.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 511`** (1 nodes): `mini-apps.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 512`** (1 nodes): `PolygonWarning.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 513`** (1 nodes): `sql-queries.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 514`** (1 nodes): `mini-app-icons.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 515`** (1 nodes): `history.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `IONCAMRDirection` connect `Community 16` to `Community 1`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `Detent` connect `Community 17` to `Community 16`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `ResourceBundleClass`, `ArrayUtils`, `SerialBuffer` to the rest of the system?**
  _2134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._