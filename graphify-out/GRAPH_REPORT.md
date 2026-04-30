# Graph Report - .  (2026-04-30)

## Corpus Check
- 2150 files · ~5,530,567 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 12742 nodes · 33399 edges · 437 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `sqlite3_free()` - 426 edges
2. `sqlite3VdbeExec()` - 182 edges
3. `sqlite3_mutex_held()` - 162 edges
4. `sqlite3_mutex_leave()` - 154 edges
5. `sqlite3_mutex_enter()` - 148 edges
6. `sqlite3DbFree()` - 145 edges
7. `sqlite3_mprintf()` - 144 edges
8. `sqlite3_step()` - 135 edges
9. `sqlite3Pragma()` - 129 edges
10. `sqlite3_malloc64()` - 128 edges

## Surprising Connections (you probably didn't know these)
- `GULSceneZeroingWeakContainer` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/Pods/GoogleUtilities/GoogleUtilities/AppDelegateSwizzler/GULSceneDelegateSwizzler.m →   _Bridges community 16 → community 5_
- `snapshot()` --inherits--> `NSObject`  [EXTRACTED]
  ios/App/AppUITests/SnapshotHelper.swift →   _Bridges community 16 → community 13_
- `CodingKeys` --inherits--> `String`  [EXTRACTED]
  ios/App/Pods/FirebaseCoreInternal/FirebaseCore/Internal/Sources/HeartbeatLogging/HeartbeatsPayload.swift →   _Bridges community 13 → community 1_
- `SessionIDChangeReason` --inherits--> `String`  [EXTRACTED]
  ios/App/Pods/PostHog/PostHog/PostHogSessionManager.swift →   _Bridges community 1 → community 16_
- `StorageKey` --inherits--> `String`  [EXTRACTED]
  ios/App/Pods/PostHog/PostHog/PostHogStorage.swift →   _Bridges community 1 → community 39_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.0
Nodes (1601): accessPayload(), accessPayloadChecked(), actionName(), addToBlockedList(), addToVTrans(), adjustStats(), afpCheckReservedLock(), afpClose() (+1593 more)

### Community 1 - "Community 1"
Cohesion: 0.0
Nodes (478): ApplyFiltersAndEncode(), CompressAlphaJob(), EncodeAlpha(), EncodeAlphaInternal(), EncodeLossless(), GetFilterMap(), GetNumColors(), InitFilterTrial() (+470 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (827): AdjustTree(), asciiFold(), assertColumnName(), blobGrowBuffer(), blobSeekToRow(), bytecodevtabClose(), bytecodevtabCursorClear(), bytecodevtabDisconnect() (+819 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (814): addAggInfoColumn(), addAggInfoFunc(), addArgumentToVtab(), addModuleArgument(), addOp4IntSlow(), agginfoFree(), agginfoPersistExprCb(), aggregateConvertIndexedExprRefToColumn() (+806 more)

### Community 4 - "Community 4"
Cohesion: 0.01
Nodes (90): $a(), An, Ao, as, b(), ba(), Bi(), bn (+82 more)

### Community 5 - "Community 5"
Cohesion: 0.0
Nodes (487): FIRAnalyticsConfiguration, -postNotificationNamevalue, -setAnalyticsCollectionEnabled, -setAnalyticsCollectionEnabledpersistSetting, -sharedInstance, FIRApp, -actualBundleID, -addAppToAppDictionary (+479 more)

### Community 6 - "Community 6"
Cohesion: 0.01
Nodes (236): _a(), aa(), Ac(), Ae(), ai, ao(), ar(), as() (+228 more)

### Community 7 - "Community 7"
Cohesion: 0.01
Nodes (127): Address, addToExternrefTable0(), _assertClass(), _base64encodeChunk(), _base64fromByteArray(), _bitsToEntropy(), _bitsToMnemonic(), BLSKeyPair (+119 more)

### Community 8 - "Community 8"
Cohesion: 0.01
Nodes (435): A, adapt(), _addListener(), adler32(), afterTransform(), afterWrite(), alloc(), allocUnsafe() (+427 more)

### Community 9 - "Community 9"
Cohesion: 0.01
Nodes (501): absFunc(), addSpaceSeparator(), areDoubleQuotedStringsEnabled(), autoAdjustDate(), avgFinalize(), bytecodevtabColumn(), bytelengthFunc(), cdateFunc() (+493 more)

### Community 10 - "Community 10"
Cohesion: 0.01
Nodes (172): assetToSwapPair(), buildPaymentAnalyticsProps(), capture(), getAmountRange(), trackAppOpened(), trackChainSwitched(), trackCurrentAppOpen(), trackDAppClosed() (+164 more)

### Community 11 - "Community 11"
Cohesion: 0.01
Nodes (319): GDTCCTCompressionHelper, -gzippedData, -isGzipped, GDTCCTUploadOperation, -batchByAddingMetricsEventToBatchforTarget, -cancel, -constructRequestProtoWithEvents, -constructRequestWithURLforTargetdata (+311 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (327): $1(), _5(), $7(), _9(), _A(), A1(), a5(), a7() (+319 more)

### Community 13 - "Community 13"
Cohesion: 0.01
Nodes (181): AccessMode, create, read, update, Archive, Archive.EndOfCentralDirectoryRecord, ArchiveError, cancelledOperation (+173 more)

### Community 14 - "Community 14"
Cohesion: 0.02
Nodes (232): fts3auxGrowStatArray(), fts3GrowSegReaderBuffer(), fts3SegReaderCursorAppend(), fts5AssertComparisonResult(), fts5AssertMultiIterSetup(), fts5BufferAppendTerm(), fts5BufferCompare(), fts5BufferSwap() (+224 more)

### Community 15 - "Community 15"
Cohesion: 0.01
Nodes (161): FIRInstallations, -assertCompatibleIIDVersion, -authTokenForcingRefreshcompletion, -authTokenWithCompletion, -componentsToRegister, -deleteWithCompletion, -initWithApp, -initWithAppOptionsappNameinstallationsIDControllerprefetchAuthToken (+153 more)

### Community 16 - "Community 16"
Cohesion: 0.01
Nodes (77): PodsDummy_AparajitaCapacitorBiometricAuth, PodsDummy_AparajitaCapacitorSecureStorage, PodsDummy_AppsCapacitorMonetplusHce, PodsDummy_Capacitor, PodsDummy_CapacitorApp, PodsDummy_CapacitorBrowser, PodsDummy_CapacitorCamera, PodsDummy_CapacitorClipboard (+69 more)

### Community 17 - "Community 17"
Cohesion: 0.02
Nodes (119): CollectHistogram_SSE2(), DC16_SSE2(), DC16Mode_SSE2(), DC16NoLeft_SSE2(), DC16NoTop_SSE2(), DC16NoTopLeft_SSE2(), DC4_SSE2(), DC8uv_SSE2() (+111 more)

### Community 18 - "Community 18"
Cohesion: 0.02
Nodes (123): FBLPromise, -all, -allOn, -onQueueall, FBLPromise, -always, -alwaysOn, -onQueuealways (+115 more)

### Community 19 - "Community 19"
Cohesion: 0.02
Nodes (41): js(), ae(), be(), ce(), Ct(), de(), dt(), _e() (+33 more)

### Community 20 - "Community 20"
Cohesion: 0.04
Nodes (96): Ae(), Ai(), ao(), At(), Bo(), Ce(), ci(), cn() (+88 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (124): _0(), a0(), ar(), as(), au(), b0(), bs(), bu() (+116 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (68): CheckSlowModel(), GetCPUInfo(), x86CPUInfo(), xgetbv(), clip(), clip_8b(), clip_bit_depth(), ConvertWRGBToYUV() (+60 more)

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (65): Add4x4_NEON(), ApplyFilter2_NEON(), ApplyFilter2NoFlip_NEON(), ApplyFilter4_NEON(), ApplyFilter6_NEON(), ConvertU8ToS16_NEON(), DC16_NEON(), DC16NoLeft_NEON() (+57 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (19): a(), b, C, d(), e(), f(), g, h() (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.04
Nodes (30): PostHogSwiftUIViewModifier, View, Coordinator, getTargetViews(), Pair, PostHogTagAnchorView, PostHogTagAnchorViewController, PostHogTagView (+22 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (1): i

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (12): AnyObject, ApplicationLifecyclePublisher, AppLifecyclePublishing, BaseApplicationLifecyclePublisher, RegistrationToken, AutocaptureEventProcessing, AutocaptureEventProcessing, BaseApplicationLifecyclePublisher (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.06
Nodes (38): clip_8b(), DC16_C(), DC16NoLeft_C(), DC16NoTop_C(), DC16NoTopLeft_C(), DC8uv_C(), DC8uvNoLeft_C(), DC8uvNoTop_C() (+30 more)

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (44): alias(), autocapture(), buildProperties(), capture(), captureAppBackgrounded(), captureAppInstallLifecycle(), captureAppOpened(), captureScreenViews() (+36 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (50): BitsEntropyRefine(), DominantCostRangeInit(), FinalHuffmanCost(), GetBinIdForEntropy(), GetCombineCostFactor(), GetCombinedEntropy(), GetCombinedHistogramEntropy(), GetHistoBinIndex() (+42 more)

### Community 31 - "Community 31"
Cohesion: 0.05
Nodes (33): AutoCapturable, Element, EventData, EventSource, actionMethod, gestureRecognizer, notification, EventType (+25 more)

### Community 32 - "Community 32"
Cohesion: 0.08
Nodes (40): ComplexMask_SSE2(), DC16_SSE2(), DC16NoLeft_SSE2(), DC16NoTop_SSE2(), DC16NoTopLeft_SSE2(), DC8uv_SSE2(), DC8uvNoLeft_SSE2(), DC8uvNoTop_SSE2() (+32 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (37): clip_8b(), clip_max(), CollectHistogram_C(), Copy(), Copy16x8_C(), Copy4x4_C(), DC4(), DCMode() (+29 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (1): T

### Community 35 - "Community 35"
Cohesion: 0.1
Nodes (36): AccumulateSSE16_NEON(), Add4x4_NEON(), CollectHistogram_NEON(), ConvertU8ToS16_NEON(), DCMode_NEON(), DiffU8ToS16_NEON(), Disto16x16_NEON(), Disto4x4_NEON() (+28 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (24): AddSubtractComponentFull(), AddSubtractComponentHalf(), Average2(), Average3(), Average4(), ClampedAddSubtractFull(), ClampedAddSubtractHalf(), Clip255() (+16 more)

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (36): AddScore(), CheckLambdaValue(), clip(), CopyScore(), CorrectDCValues(), ExpandMatrix(), GetCostModeI4(), InitScore() (+28 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (1): MiniAppHost

### Community 39 - "Community 39"
Cohesion: 0.09
Nodes (16): applicationSupportDirectoryURL(), PostHogStorage, StorageKey, anonymousId, distinctId, enabledFeatureFlagPayloads, enabledFeatureFlags, groups (+8 more)

### Community 40 - "Community 40"
Cohesion: 0.15
Nodes (31): BranchCost(), CalcSkipProba(), CalcTokenProba(), Clamp(), CodeResiduals(), ComputeNextQ(), FinalizeSkipProba(), FinalizeTokenProbas() (+23 more)

### Community 41 - "Community 41"
Cohesion: 0.12
Nodes (5): C(), d, e, u(), v()

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (21): ConvertARGBToUV_SSE41(), ConvertARGBToY_SSE41(), ConvertBGR24ToY_SSE41(), ConvertRGB24ToY_SSE41(), ConvertRGBA32ToUV_SSE41(), ConvertRGBToUV_SSE41(), ConvertRGBToY_SSE41(), ConvertYUV444ToRGB_SSE41() (+13 more)

### Community 43 - "Community 43"
Cohesion: 0.2
Nodes (3): g, m(), q()

### Community 44 - "Community 44"
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

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (12): ApplyAlphaMultiply4444_C(), ApplyAlphaMultiply_16b_C(), dither_hi(), dither_lo(), GetScale(), MakeARGB32(), Mult(), multiply() (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (4): CocoaError, FileManager, POSIXError, URL

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (12): _ACResourceInitProtocol, AppKit.NSColor, AppKit.NSImage, ColorResource, ImageResource, ResourceBundleClass, SwiftUI.Color, SwiftUI.Image (+4 more)

### Community 48 - "Community 48"
Cohesion: 0.23
Nodes (18): ChangeState(), End(), Execute(), Launch(), pthread_cond_destroy(), pthread_cond_init(), pthread_cond_signal(), pthread_cond_wait() (+10 more)

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (3): g(), r, x()

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (1): d

### Community 51 - "Community 51"
Cohesion: 0.12
Nodes (1): L

### Community 52 - "Community 52"
Cohesion: 0.21
Nodes (4): Data, Encodable, HeartbeatStorage, HeartbeatStorageProtocol

### Community 53 - "Community 53"
Cohesion: 0.19
Nodes (11): ChunkAppend(), ChunkDelete(), ChunkInit(), ChunkListDelete(), ChunkRelease(), ChunkSearchList(), ChunkSearchNextInList(), ChunkSetHead() (+3 more)

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (1): f

### Community 55 - "Community 55"
Cohesion: 0.26
Nodes (13): getCachedFeatureFlagPayload(), getCachedFeatureFlags(), getFeatureFlag(), getFeatureFlagPayload(), getFeatureFlags(), init(), isFeatureEnabled(), isRecordingActive() (+5 more)

### Community 56 - "Community 56"
Cohesion: 0.2
Nodes (8): b(), c(), E(), f(), k(), l(), m(), w()

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (13): D(), g(), I(), i1(), j(), k1(), M(), o1() (+5 more)

### Community 58 - "Community 58"
Cohesion: 0.28
Nodes (11): De(), fe(), Ie(), Le(), Ne(), Oe(), qe(), Re() (+3 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (1): m

### Community 60 - "Community 60"
Cohesion: 0.28
Nodes (10): C(), G(), I(), k(), M(), q(), te(), V() (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.23
Nodes (6): Archive, fileFromCookie(), MemoryFile, readStub(), seekStub(), writeStub()

### Community 62 - "Community 62"
Cohesion: 0.21
Nodes (1): PostHogStorageManager

### Community 63 - "Community 63"
Cohesion: 0.23
Nodes (4): Hashable, FoundMethod, MethodSwizzler, MethodSwizzler.FoundMethod

### Community 64 - "Community 64"
Cohesion: 0.35
Nodes (1): KeychainSwift

### Community 65 - "Community 65"
Cohesion: 0.17
Nodes (3): AppDelegate, UIApplicationDelegate, UIResponder

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (1): y

### Community 67 - "Community 67"
Cohesion: 0.26
Nodes (1): o

### Community 68 - "Community 68"
Cohesion: 0.23
Nodes (1): Archive

### Community 69 - "Community 69"
Cohesion: 0.24
Nodes (6): getScreenSize(), init(), onOrientationDidChange(), onShouldUpdateScreenSize(), registerNotifications(), updateScreenSize()

### Community 70 - "Community 70"
Cohesion: 0.25
Nodes (1): PostHogFileBackedQueue

### Community 71 - "Community 71"
Cohesion: 0.27
Nodes (2): m(), u

### Community 72 - "Community 72"
Cohesion: 0.2
Nodes (1): o

### Community 73 - "Community 73"
Cohesion: 0.4
Nodes (8): a(), c(), j, k(), q(), S(), T(), w()

### Community 74 - "Community 74"
Cohesion: 0.27
Nodes (1): y

### Community 75 - "Community 75"
Cohesion: 0.31
Nodes (1): URLSessionInterceptor

### Community 76 - "Community 76"
Cohesion: 0.36
Nodes (3): AppUITests, XCUIApplication, XCTestCase

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (6): CapacitorException, convertBody(), convertFormData(), createProxyUrl(), isRelativeOrProxyUrl(), readFileAsBase64()

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (8): ArrayUtils, BufferUtils, Entropy, ExtendedPrivateKey, MnemonicUtils, NumberUtils, SerialBuffer, StringUtils

### Community 79 - "Community 79"
Cohesion: 0.22
Nodes (1): s

### Community 80 - "Community 80"
Cohesion: 0.53
Nodes (8): D(), G(), I(), J(), k(), P(), V(), z()

### Community 81 - "Community 81"
Cohesion: 0.25
Nodes (1): l

### Community 82 - "Community 82"
Cohesion: 0.47
Nodes (1): PostHogApi

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (1): y

### Community 84 - "Community 84"
Cohesion: 0.25
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 0.25
Nodes (1): i

### Community 86 - "Community 86"
Cohesion: 0.32
Nodes (5): Constants, FileManager, FileStorage, StorageFactory, UserDefaultsStorage

### Community 87 - "Community 87"
Cohesion: 0.36
Nodes (1): Archive

### Community 88 - "Community 88"
Cohesion: 0.46
Nodes (1): URLSession

### Community 89 - "Community 89"
Cohesion: 0.29
Nodes (2): UIView, ViewLayoutTracker

### Community 90 - "Community 90"
Cohesion: 0.25
Nodes (6): KeychainSwiftAccessOptions, accessibleAfterFirstUnlock, accessibleAfterFirstUnlockThisDeviceOnly, accessibleWhenPasscodeSetThisDeviceOnly, accessibleWhenUnlocked, accessibleWhenUnlockedThisDeviceOnly

### Community 91 - "Community 91"
Cohesion: 0.57
Nodes (6): f(), j(), K(), q(), V(), Y()

### Community 92 - "Community 92"
Cohesion: 0.43
Nodes (1): d

### Community 93 - "Community 93"
Cohesion: 0.29
Nodes (3): Entry.CentralDirectoryStructure, Entry.DataDescriptor, Entry.LocalFileHeader

### Community 94 - "Community 94"
Cohesion: 0.33
Nodes (2): UIApplication, UIApplicationTracker

### Community 95 - "Community 95"
Cohesion: 0.33
Nodes (1): UIView

### Community 96 - "Community 96"
Cohesion: 0.33
Nodes (6): GULNetworkInfo, -formatMccandMNC, -getNetworkMobileCountryCode, -getNetworkMobileNetworkCode, -getNetworkRadioType, -getNetworkType

### Community 97 - "Community 97"
Cohesion: 0.33
Nodes (0): 

### Community 98 - "Community 98"
Cohesion: 0.6
Nodes (4): D(), P(), R(), w()

### Community 99 - "Community 99"
Cohesion: 0.53
Nodes (5): I(), M(), O(), S(), x()

### Community 100 - "Community 100"
Cohesion: 0.33
Nodes (1): o

### Community 101 - "Community 101"
Cohesion: 0.33
Nodes (1): HeartbeatController

### Community 102 - "Community 102"
Cohesion: 0.4
Nodes (3): Date, stat, timeval

### Community 103 - "Community 103"
Cohesion: 0.33
Nodes (1): ReadWriteLock

### Community 104 - "Community 104"
Cohesion: 0.47
Nodes (2): TimeBasedEpochGenerator, UInt64

### Community 105 - "Community 105"
Cohesion: 0.53
Nodes (2): imageToBase64(), UIImage

### Community 106 - "Community 106"
Cohesion: 0.4
Nodes (5): GULHeartbeatDateStorageUserDefaults, -heartbeatDateForTag, -heartbeatDictionaryFromDefaults, -initWithDefaultskey, -setHearbeatDateforTag

### Community 107 - "Community 107"
Cohesion: 0.4
Nodes (0): 

### Community 108 - "Community 108"
Cohesion: 0.5
Nodes (1): r

### Community 109 - "Community 109"
Cohesion: 0.6
Nodes (3): H(), k(), U()

### Community 110 - "Community 110"
Cohesion: 0.4
Nodes (1): e

### Community 111 - "Community 111"
Cohesion: 0.5
Nodes (2): Archive, BackingConfiguration

### Community 112 - "Community 112"
Cohesion: 0.4
Nodes (1): PostHogEvent

### Community 113 - "Community 113"
Cohesion: 0.4
Nodes (2): CGFloat, Double

### Community 114 - "Community 114"
Cohesion: 0.4
Nodes (0): 

### Community 115 - "Community 115"
Cohesion: 0.4
Nodes (0): 

### Community 116 - "Community 116"
Cohesion: 0.67
Nodes (2): J(), Q()

### Community 117 - "Community 117"
Cohesion: 0.5
Nodes (1): m

### Community 118 - "Community 118"
Cohesion: 0.5
Nodes (1): i

### Community 119 - "Community 119"
Cohesion: 0.67
Nodes (0): 

### Community 120 - "Community 120"
Cohesion: 0.5
Nodes (1): o

### Community 121 - "Community 121"
Cohesion: 0.5
Nodes (1): n

### Community 122 - "Community 122"
Cohesion: 0.5
Nodes (1): Archive

### Community 123 - "Community 123"
Cohesion: 0.5
Nodes (1): Data

### Community 124 - "Community 124"
Cohesion: 0.83
Nodes (3): newDateFormatter(), toISO8601Date(), toISO8601String()

### Community 125 - "Community 125"
Cohesion: 0.5
Nodes (0): 

### Community 126 - "Community 126"
Cohesion: 0.67
Nodes (2): Date, dateToMillis()

### Community 127 - "Community 127"
Cohesion: 0.5
Nodes (2): Optional, String

### Community 128 - "Community 128"
Cohesion: 0.5
Nodes (1): NetworkSample

### Community 129 - "Community 129"
Cohesion: 0.5
Nodes (2): UIView, View

### Community 130 - "Community 130"
Cohesion: 0.5
Nodes (2): UIView, View

### Community 131 - "Community 131"
Cohesion: 0.67
Nodes (2): initProvider(), retryInit()

### Community 132 - "Community 132"
Cohesion: 0.5
Nodes (3): DynamicScroller, DynamicScrollerItem, RecycleScroller

### Community 133 - "Community 133"
Cohesion: 0.5
Nodes (0): 

### Community 134 - "Community 134"
Cohesion: 0.5
Nodes (0): 

### Community 135 - "Community 135"
Cohesion: 0.67
Nodes (0): 

### Community 136 - "Community 136"
Cohesion: 1.0
Nodes (0): 

### Community 137 - "Community 137"
Cohesion: 1.0
Nodes (2): a(), l()

### Community 138 - "Community 138"
Cohesion: 0.67
Nodes (0): 

### Community 139 - "Community 139"
Cohesion: 0.67
Nodes (0): 

### Community 140 - "Community 140"
Cohesion: 0.67
Nodes (0): 

### Community 141 - "Community 141"
Cohesion: 0.67
Nodes (0): 

### Community 142 - "Community 142"
Cohesion: 0.67
Nodes (0): 

### Community 143 - "Community 143"
Cohesion: 0.67
Nodes (1): s

### Community 144 - "Community 144"
Cohesion: 0.67
Nodes (0): 

### Community 145 - "Community 145"
Cohesion: 1.0
Nodes (2): FBLPromise, -dispatchGroup

### Community 146 - "Community 146"
Cohesion: 0.67
Nodes (1): Archive

### Community 147 - "Community 147"
Cohesion: 0.67
Nodes (1): URL

### Community 148 - "Community 148"
Cohesion: 0.67
Nodes (1): Archive

### Community 149 - "Community 149"
Cohesion: 0.67
Nodes (1): FileManager

### Community 150 - "Community 150"
Cohesion: 0.67
Nodes (1): Archive

### Community 151 - "Community 151"
Cohesion: 0.67
Nodes (2): Container, DI

### Community 152 - "Community 152"
Cohesion: 0.67
Nodes (0): 

### Community 153 - "Community 153"
Cohesion: 0.67
Nodes (1): UIImage

### Community 154 - "Community 154"
Cohesion: 0.67
Nodes (1): UUID

### Community 155 - "Community 155"
Cohesion: 0.67
Nodes (0): 

### Community 156 - "Community 156"
Cohesion: 0.67
Nodes (1): UIApplication

### Community 157 - "Community 157"
Cohesion: 0.67
Nodes (1): UITextInputTraits

### Community 158 - "Community 158"
Cohesion: 0.67
Nodes (1): CGSize

### Community 159 - "Community 159"
Cohesion: 0.67
Nodes (1): UIColor

### Community 160 - "Community 160"
Cohesion: 0.67
Nodes (1): CGColor

### Community 161 - "Community 161"
Cohesion: 0.67
Nodes (1): RRStyle

### Community 162 - "Community 162"
Cohesion: 1.0
Nodes (2): maskImage(), toDict()

### Community 163 - "Community 163"
Cohesion: 0.67
Nodes (1): KeychainSwiftConstants

### Community 164 - "Community 164"
Cohesion: 0.67
Nodes (1): ExampleInstrumentedTest

### Community 165 - "Community 165"
Cohesion: 0.67
Nodes (1): ExampleUnitTest

### Community 166 - "Community 166"
Cohesion: 0.67
Nodes (1): MockContract

### Community 167 - "Community 167"
Cohesion: 0.67
Nodes (0): 

### Community 168 - "Community 168"
Cohesion: 1.0
Nodes (0): 

### Community 169 - "Community 169"
Cohesion: 1.0
Nodes (0): 

### Community 170 - "Community 170"
Cohesion: 1.0
Nodes (0): 

### Community 171 - "Community 171"
Cohesion: 1.0
Nodes (0): 

### Community 172 - "Community 172"
Cohesion: 1.0
Nodes (0): 

### Community 173 - "Community 173"
Cohesion: 1.0
Nodes (0): 

### Community 174 - "Community 174"
Cohesion: 1.0
Nodes (0): 

### Community 175 - "Community 175"
Cohesion: 1.0
Nodes (0): 

### Community 176 - "Community 176"
Cohesion: 1.0
Nodes (0): 

### Community 177 - "Community 177"
Cohesion: 1.0
Nodes (0): 

### Community 178 - "Community 178"
Cohesion: 1.0
Nodes (0): 

### Community 179 - "Community 179"
Cohesion: 1.0
Nodes (0): 

### Community 180 - "Community 180"
Cohesion: 1.0
Nodes (0): 

### Community 181 - "Community 181"
Cohesion: 1.0
Nodes (0): 

### Community 182 - "Community 182"
Cohesion: 1.0
Nodes (0): 

### Community 183 - "Community 183"
Cohesion: 1.0
Nodes (0): 

### Community 184 - "Community 184"
Cohesion: 1.0
Nodes (0): 

### Community 185 - "Community 185"
Cohesion: 1.0
Nodes (0): 

### Community 186 - "Community 186"
Cohesion: 1.0
Nodes (0): 

### Community 187 - "Community 187"
Cohesion: 1.0
Nodes (0): 

### Community 188 - "Community 188"
Cohesion: 1.0
Nodes (0): 

### Community 189 - "Community 189"
Cohesion: 1.0
Nodes (0): 

### Community 190 - "Community 190"
Cohesion: 1.0
Nodes (0): 

### Community 191 - "Community 191"
Cohesion: 2.0
Nodes (0): 

### Community 192 - "Community 192"
Cohesion: 1.0
Nodes (0): 

### Community 193 - "Community 193"
Cohesion: 1.0
Nodes (0): 

### Community 194 - "Community 194"
Cohesion: 1.0
Nodes (0): 

### Community 195 - "Community 195"
Cohesion: 1.0
Nodes (0): 

### Community 196 - "Community 196"
Cohesion: 1.0
Nodes (0): 

### Community 197 - "Community 197"
Cohesion: 1.0
Nodes (0): 

### Community 198 - "Community 198"
Cohesion: 1.0
Nodes (0): 

### Community 199 - "Community 199"
Cohesion: 1.0
Nodes (0): 

### Community 200 - "Community 200"
Cohesion: 1.0
Nodes (0): 

### Community 201 - "Community 201"
Cohesion: 1.0
Nodes (0): 

### Community 202 - "Community 202"
Cohesion: 1.0
Nodes (0): 

### Community 203 - "Community 203"
Cohesion: 1.0
Nodes (0): 

### Community 204 - "Community 204"
Cohesion: 1.0
Nodes (0): 

### Community 205 - "Community 205"
Cohesion: 1.0
Nodes (0): 

### Community 206 - "Community 206"
Cohesion: 1.0
Nodes (0): 

### Community 207 - "Community 207"
Cohesion: 1.0
Nodes (0): 

### Community 208 - "Community 208"
Cohesion: 1.0
Nodes (0): 

### Community 209 - "Community 209"
Cohesion: 1.0
Nodes (0): 

### Community 210 - "Community 210"
Cohesion: 1.0
Nodes (0): 

### Community 211 - "Community 211"
Cohesion: 1.0
Nodes (0): 

### Community 212 - "Community 212"
Cohesion: 1.0
Nodes (0): 

### Community 213 - "Community 213"
Cohesion: 1.0
Nodes (0): 

### Community 214 - "Community 214"
Cohesion: 1.0
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
Nodes (1): WeakContainer

### Community 220 - "Community 220"
Cohesion: 1.0
Nodes (1): PostHogSDK

### Community 221 - "Community 221"
Cohesion: 1.0
Nodes (0): 

### Community 222 - "Community 222"
Cohesion: 1.0
Nodes (1): PostHogConsumerPayload

### Community 223 - "Community 223"
Cohesion: 1.0
Nodes (0): 

### Community 224 - "Community 224"
Cohesion: 1.0
Nodes (1): PostHogPropertiesSanitizer

### Community 225 - "Community 225"
Cohesion: 1.0
Nodes (1): PostHogBatchUploadInfo

### Community 226 - "Community 226"
Cohesion: 1.0
Nodes (1): UIView

### Community 227 - "Community 227"
Cohesion: 1.0
Nodes (1): UIWindow

### Community 228 - "Community 228"
Cohesion: 1.0
Nodes (1): AssociatedKeys

### Community 229 - "Community 229"
Cohesion: 1.0
Nodes (1): ViewTreeSnapshotStatus

### Community 230 - "Community 230"
Cohesion: 1.0
Nodes (1): MainActivity

### Community 231 - "Community 231"
Cohesion: 1.0
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
Cohesion: 1.0
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
Cohesion: 1.0
Nodes (0): 

### Community 262 - "Community 262"
Cohesion: 1.0
Nodes (0): 

### Community 263 - "Community 263"
Cohesion: 1.0
Nodes (0): 

### Community 264 - "Community 264"
Cohesion: 1.0
Nodes (0): 

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
Nodes (0): 

### Community 271 - "Community 271"
Cohesion: 1.0
Nodes (0): 

### Community 272 - "Community 272"
Cohesion: 1.0
Nodes (0): 

### Community 273 - "Community 273"
Cohesion: 1.0
Nodes (0): 

### Community 274 - "Community 274"
Cohesion: 1.0
Nodes (0): 

### Community 275 - "Community 275"
Cohesion: 1.0
Nodes (0): 

### Community 276 - "Community 276"
Cohesion: 1.0
Nodes (0): 

### Community 277 - "Community 277"
Cohesion: 1.0
Nodes (0): 

### Community 278 - "Community 278"
Cohesion: 1.0
Nodes (0): 

### Community 279 - "Community 279"
Cohesion: 1.0
Nodes (0): 

### Community 280 - "Community 280"
Cohesion: 1.0
Nodes (0): 

### Community 281 - "Community 281"
Cohesion: 1.0
Nodes (0): 

### Community 282 - "Community 282"
Cohesion: 1.0
Nodes (0): 

### Community 283 - "Community 283"
Cohesion: 1.0
Nodes (0): 

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

## Knowledge Gaps
- **1093 isolated node(s):** `ResourceBundleClass`, `ArrayUtils`, `SerialBuffer`, `BufferUtils`, `ExtendedPrivateKey` (+1088 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 168`** (2 nodes): `cypress.config.ts`, `setupNodeEvents()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 169`** (2 nodes): `commands.ts`, `e2e.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 170`** (2 nodes): `CAPBridgedPlugin.h`, `property()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 171`** (2 nodes): `CDVPluginResult.h`, `CDVPluginResult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 172`** (2 nodes): `CDVConfigParser.h`, `NSXMLParserDelegate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 173`** (2 nodes): `CDVPlugin.h`, `UIView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 174`** (2 nodes): `CDVCommandDelegateImpl.h`, `CDVCommandDelegateImpl()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 175`** (2 nodes): `CDVInvokedUrlCommand.h`, `CDVInvokedUrlCommand()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 176`** (2 nodes): `CDVURLProtocol.h`, `CDVURLProtocol()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 177`** (2 nodes): `transfer-handlers.js`, `setupMainThreadTransferHandlers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 178`** (2 nodes): `useBiometric-CMz9EuTi.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 179`** (2 nodes): `index-C3D-Erx9.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 180`** (2 nodes): `swipe-back-CQpH8b1_.js`, `k()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 181`** (2 nodes): `useGoCryptoMonitoring-Bw1cgBXM.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 182`** (2 nodes): `useNotifications-BMhtyf4T.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 183`** (2 nodes): `md.transition-Cu4jm09z.js`, `v()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 184`** (2 nodes): `loading-spinner-j9QFg_N6.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 185`** (2 nodes): `vue3-components-9uN0dvLo.js`, `n()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 186`** (2 nodes): `gamepad-Cq7sZ9WS.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 187`** (2 nodes): `status-tap-BxxBrEeS.js`, `m()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (2 nodes): `EnableNotifications-Bx6HkYaB.js`, `x()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 189`** (2 nodes): `NakaOnboardingVerifyId-DugLIdBn.js`, `J()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 190`** (2 nodes): `TransactionAmounts.vue_vue_type_script_setup_true_lang-rS4axXWE.js`, `z()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 191`** (2 nodes): `points-C_CffqwB.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 192`** (2 nodes): `NimAddressInput-BlKPZPXt.js`, `ee()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 193`** (2 nodes): `validation-CS60Lqpv.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (2 nodes): `useMiniAppSession-mTtk7BEd.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (2 nodes): `check-DRz7ek-E.js`, `l()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (2 nodes): `WorldIcon-ChAcZGkK.js`, `p()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (2 nodes): `usdt-logo-neJGmoWV.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 198`** (2 nodes): `index-CBW1PXnh.js`, `i()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (2 nodes): `mini-app-confirmation-FTnooBcO.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (2 nodes): `QuickButton.vue_vue_type_script_setup_true_lang-11gR3_9k.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 201`** (2 nodes): `info-C66TZpuT.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (2 nodes): `index-B9EvTM3y.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (2 nodes): `QRScanner-BMuKdTbU.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (2 nodes): `useStringParser-BMY6wzTz.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (2 nodes): `steps-CDLG9l_u.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 206`** (2 nodes): `chevron-right-JJoZhB7J.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 207`** (2 nodes): `cryptocity-logo-6uBOmvVM.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 208`** (2 nodes): `TransactionItem.vue_vue_type_script_setup_true_lang-HTUslyT8.js`, `K()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 209`** (2 nodes): `WithdrawalAddressList-Dq-8RBqQ.js`, `Z()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 210`** (2 nodes): `PaymentPreview-DRm0x3-p.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 211`** (2 nodes): `useMiniAppHost-BsK_aHDJ.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 212`** (2 nodes): `kyc-9nfsW2F9.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 213`** (2 nodes): `focus-visible-supuXXMI.js`, `h()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 214`** (2 nodes): `arrow-up-right-C94PRukk.js`, `a()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 215`** (2 nodes): `NimWithdraw-Dbq4PGfo.js`, `Ge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 216`** (2 nodes): `ShowWords-Cd5jpUg5.js`, `__vite__mapDeps()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 217`** (2 nodes): `nimiq-logo-C_SmI3Ub.js`, `c()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 218`** (2 nodes): `ShortAddressDisplay-dPa9tbb_.js`, `k()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 219`** (2 nodes): `WeakContainer.swift`, `WeakContainer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 220`** (2 nodes): `PostHogExtensions.swift`, `PostHogSDK`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 221`** (2 nodes): `PostHogLegacyQueue.swift`, `migrateOldQueue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 222`** (2 nodes): `PostHogConsumerPayload.swift`, `PostHogConsumerPayload`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 223`** (2 nodes): `PostHogSwizzler.swift`, `swizzle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 224`** (2 nodes): `PostHogPropertiesSanitizer.swift`, `PostHogPropertiesSanitizer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 225`** (2 nodes): `PostHogBatchUploadInfo.swift`, `PostHogBatchUploadInfo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 226`** (2 nodes): `UIView+PostHogLabel.swift`, `UIView`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 227`** (2 nodes): `UIWindow+.swift`, `UIWindow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 228`** (2 nodes): `AssociatedKeys.swift`, `AssociatedKeys`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 229`** (2 nodes): `ViewTreeSnapshotStatus.swift`, `ViewTreeSnapshotStatus`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 230`** (2 nodes): `MainActivity.java`, `MainActivity`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 231`** (2 nodes): `usePrice.spec.ts`, `fetch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 232`** (2 nodes): `remote-signer.spec.ts`, `createAddress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 233`** (2 nodes): `ShortAddressDisplay.spec.ts`, `mountComponent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 234`** (2 nodes): `AmountInput.spec.ts`, `mountAmountInput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 235`** (2 nodes): `SetupView.spec.ts`, `passthrough()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 236`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 237`** (1 nodes): `FIRCurrentDateProvider.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 238`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 239`** (1 nodes): `capacitor.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 240`** (1 nodes): `test.cy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 241`** (1 nodes): `CapacitorExtendedDialog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 242`** (1 nodes): `CapacitorCamera_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 243`** (1 nodes): `CapacitorScreenOrientation_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 244`** (1 nodes): `FirebaseInstallations_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 245`** (1 nodes): `CapacitorDevice_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 246`** (1 nodes): `nanopb_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 247`** (1 nodes): `CapacitorSumsubMobileSdk_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 248`** (1 nodes): `GoogleDataTransport_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 249`** (1 nodes): `KeychainSwift_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 250`** (1 nodes): `GoogleUtilities_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 251`** (1 nodes): `CapacitorPreferences_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 252`** (1 nodes): `Pods_App_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 253`** (1 nodes): `AppsCapacitorMonetplusHce_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 254`** (1 nodes): `CapacitorBrowser_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 255`** (1 nodes): `CapacitorHaptics_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 256`** (1 nodes): `CapacitorStatusBar_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 257`** (1 nodes): `CapacitorPushNotifications_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 258`** (1 nodes): `FirebaseCoreInternal_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 259`** (1 nodes): `AparajitaCapacitorBiometricAuth_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 260`** (1 nodes): `AparajitaCapacitorSecureStorage_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 261`** (1 nodes): `FirebaseMessaging_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 262`** (1 nodes): `CapawesomeCapacitorPosthog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 263`** (1 nodes): `CapacitorToast_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 264`** (1 nodes): `FBLPromises_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 265`** (1 nodes): `PostHog_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 266`** (1 nodes): `CapgoInappbrowser_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 267`** (1 nodes): `CapacitorCommunitySqlite_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 268`** (1 nodes): `SQLCipher_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 269`** (1 nodes): `CapacitorApp_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 270`** (1 nodes): `FirebaseCore_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 271`** (1 nodes): `Cordova_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 272`** (1 nodes): `CapacitorClipboard_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 273`** (1 nodes): `CapacitorFilesystem_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 274`** (1 nodes): `Capacitor_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 275`** (1 nodes): `RdlaboCapacitorScreenshotEvent_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 276`** (1 nodes): `CapacitorShare_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 277`** (1 nodes): `CapacitorKeyboard_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 278`** (1 nodes): `CapgoCameraPreview_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 279`** (1 nodes): `CapacitorCommunityPrivacyScreen_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 280`** (1 nodes): `ZIPFoundation_vers.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 281`** (1 nodes): `CapacitorBrowser-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 282`** (1 nodes): `CapacitorPreferences-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 283`** (1 nodes): `CapacitorExtendedDialog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 284`** (1 nodes): `SNSThemeMetrics.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 285`** (1 nodes): `SNSTheme.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 286`** (1 nodes): `SNSMobileSDKInfo.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 287`** (1 nodes): `SNSThemeImages.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 288`** (1 nodes): `SNSEvent.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 289`** (1 nodes): `IdensicMobileSDK.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 290`** (1 nodes): `SNSMobileSDKDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 291`** (1 nodes): `SNSSupportItem.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 292`** (1 nodes): `SNSMobileSDK.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 293`** (1 nodes): `SNSMobileSDK+Enums.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 294`** (1 nodes): `SNSThemeSection.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 295`** (1 nodes): `SNSDocumentDefinition.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 296`** (1 nodes): `SNSThemeFonts.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 297`** (1 nodes): `SNSThemeColors.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 298`** (1 nodes): `FirebaseCore.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 299`** (1 nodes): `FirebaseCore-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 300`** (1 nodes): `PromisesObjC-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 301`** (1 nodes): `CapacitorScreenOrientation-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 302`** (1 nodes): `CapacitorApp-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 303`** (1 nodes): `CapacitorFilesystem-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 304`** (1 nodes): `GoogleDataTransport-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 305`** (1 nodes): `GDTCORTargets.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 306`** (1 nodes): `CapacitorShare-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 307`** (1 nodes): `CapacitorSumsubMobileSdk-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 308`** (1 nodes): `CapacitorStatusBar-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 309`** (1 nodes): `FirebaseInstallations-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 310`** (1 nodes): `FIRInstallationsErrors.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 311`** (1 nodes): `FirebaseInstallations.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 312`** (1 nodes): `CapgoCameraPreview-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 313`** (1 nodes): `CAPPluginCall.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 314`** (1 nodes): `CAPInstanceDescriptor.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 315`** (1 nodes): `CAPInstanceConfiguration.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 316`** (1 nodes): `CAPBridgedJSTypes.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 317`** (1 nodes): `CAPPluginMethod.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 318`** (1 nodes): `CAPBridgeViewController+CDVScreenOrientationDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 319`** (1 nodes): `CAPPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 320`** (1 nodes): `CapawesomeCapacitorPosthog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 321`** (1 nodes): `CapacitorDevice-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 322`** (1 nodes): `CapacitorPushNotifications-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 323`** (1 nodes): `FirebaseCoreInternal-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 324`** (1 nodes): `CapacitorHaptics-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 325`** (1 nodes): `CapacitorToast-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 326`** (1 nodes): `CapgoInappbrowser-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 327`** (1 nodes): `CDVAvailability.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 328`** (1 nodes): `CDVViewController.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 329`** (1 nodes): `CDVScreenOrientationDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 330`** (1 nodes): `CDV.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 331`** (1 nodes): `CapacitorCordova.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 332`** (1 nodes): `NSDictionary+CordovaPreferences.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 333`** (1 nodes): `CDVWebViewProcessPoolFactory.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 334`** (1 nodes): `CDVPlugin+Resources.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 335`** (1 nodes): `CDVCommandDelegate.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 336`** (1 nodes): `CDVPluginManager.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 337`** (1 nodes): `SQLCipher-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 338`** (1 nodes): `Plugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 339`** (1 nodes): `AparajitaCapacitorBiometricAuth-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 340`** (1 nodes): `CapacitorSQLitePlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 341`** (1 nodes): `CapacitorCommunitySqlite-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 342`** (1 nodes): `FirebaseMessaging.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 343`** (1 nodes): `FirebaseMessaging-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 344`** (1 nodes): `ZIPFoundation-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 345`** (1 nodes): `AparajitaCapacitorSecureStorage-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 346`** (1 nodes): `PostHog-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 347`** (1 nodes): `PostHog.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 348`** (1 nodes): `PrivacyScreenPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 349`** (1 nodes): `CapacitorCommunityPrivacyScreen-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 350`** (1 nodes): `AppsCapacitorMonetplusHce-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 351`** (1 nodes): `GULHeartbeatDateStorable.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 352`** (1 nodes): `GULApplication.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 353`** (1 nodes): `GoogleUtilities-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 354`** (1 nodes): `GULNetworkLoggerProtocol.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 355`** (1 nodes): `RdlaboCapacitorScreenshotEvent-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 356`** (1 nodes): `nanopb-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 357`** (1 nodes): `CapacitorClipboard-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 358`** (1 nodes): `KeyboardPlugin.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 359`** (1 nodes): `CapacitorKeyboard-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 360`** (1 nodes): `Keyboard.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 361`** (1 nodes): `Pods-App-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 362`** (1 nodes): `KeychainSwift-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 363`** (1 nodes): `CapacitorCamera-umbrella.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 364`** (1 nodes): `cordova.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 365`** (1 nodes): `nimiq.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 366`** (1 nodes): `registerSW.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 367`** (1 nodes): `cordova_plugins.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 368`** (1 nodes): `es-CAUXujUk.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 369`** (1 nodes): `GenericInput-jtZ0PTy4.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 370`** (1 nodes): `TransactionDetails-IfBpEEQv.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 371`** (1 nodes): `fr-BbESMV67.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 372`** (1 nodes): `MapModal-9tzIGa1z.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 373`** (1 nodes): `ExpiringPointsModal-B9M9H18D.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 374`** (1 nodes): `index-BskRTBYA.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 375`** (1 nodes): `PolygonWarning.vue_vue_type_script_setup_true_lang-BxioRmBl.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 376`** (1 nodes): `BluecodeNotSupported-DgPDTIG-.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 377`** (1 nodes): `wasm-BxLt509m.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 378`** (1 nodes): `NakaCardDelete-ZYOVQ4EQ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 379`** (1 nodes): `PinView-D28P_w3t.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 380`** (1 nodes): `ValidateWords-BDMtjiCO.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 381`** (1 nodes): `PinInput.vue_vue_type_script_setup_true_lang-CFc1x993.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 382`** (1 nodes): `index-BGpsC2Bn.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 383`** (1 nodes): `ConfirmAddressDeletion-YFF_tQ64.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 384`** (1 nodes): `CategoryIcon-BUxZIpeO.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 385`** (1 nodes): `NimAddressDisplay-DRMMDaHE.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 386`** (1 nodes): `feature-flags-97uu7T0Q.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 387`** (1 nodes): `AmountInput-Bs_6ELGe.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 388`** (1 nodes): `PaymentSelector-By1lI2LC.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 389`** (1 nodes): `DevModal-CmwVnyYr.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 390`** (1 nodes): `LongTimeNoSeeModal-BSnXAXot.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 391`** (1 nodes): `en-Du-vadjb.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 392`** (1 nodes): `Warning-bEhnrTpQ.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 393`** (1 nodes): `DeletePointsModal-DngBkoKx.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 394`** (1 nodes): `Confirm-C76r3Mxb.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 395`** (1 nodes): `BackupIntroduction-tiUkRGvW.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 396`** (1 nodes): `OnBoardingScreen-BGxRZNQi.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 397`** (1 nodes): `SetupView-B6rAkhdK.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 398`** (1 nodes): `BricksInput-Bp0EiCFH.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 399`** (1 nodes): `PaymentRequestManualInput-DcEUUJoK.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 400`** (1 nodes): `CodeInput-DIPaMNF3.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 401`** (1 nodes): `ModalTemplate.vue_vue_type_script_setup_true_lang-CzI_x-CG.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 402`** (1 nodes): `ReferralModal-D5ZNRoti.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 403`** (1 nodes): `config-B2ErMDeD.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 404`** (1 nodes): `ComingSoon-Dx_-HeZu.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 405`** (1 nodes): `PaymentAmountInput-D0-vT2_H.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 406`** (1 nodes): `DisclaimerModal-D_bFfBOO.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 407`** (1 nodes): `SettingsModal-CG-T6-eY.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 408`** (1 nodes): `PinInput-CKU-3ow2.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 409`** (1 nodes): `PointsModal-l78mO-St.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 410`** (1 nodes): `EnableBiometricModal-BKWEOOzY.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 411`** (1 nodes): `de-Co0sQqrK.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 412`** (1 nodes): `pt-B4Ek2qAc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 413`** (1 nodes): `GDTCORMetricsControllerProtocol.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 414`** (1 nodes): `GDTCORUploader.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 415`** (1 nodes): `GDTCOREndpoints_Private.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 416`** (1 nodes): `FIRInstallationsStatus.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 417`** (1 nodes): `FIRAnalyticsInteropListener.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 418`** (1 nodes): `PostHogVersion.swift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 419`** (1 nodes): `browserstack-upload.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 420`** (1 nodes): `nimiq-pay.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 421`** (1 nodes): `rollup.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 422`** (1 nodes): `window.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 423`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 424`** (1 nodes): `shims-vue.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 425`** (1 nodes): `light-bolt11-decoder.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 426`** (1 nodes): `nimiq.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 427`** (1 nodes): `process-browser.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 428`** (1 nodes): `global.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 429`** (1 nodes): `useModal.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 430`** (1 nodes): `useStringParser.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 431`** (1 nodes): `mini-apps.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 432`** (1 nodes): `PolygonWarning.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 433`** (1 nodes): `TheHomeFooter.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 434`** (1 nodes): `sql-queries.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 435`** (1 nodes): `mini-app-icons.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 436`** (1 nodes): `history.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CodingKeys` connect `Community 13` to `Community 1`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `FIRMessagingMetricsLog` connect `Community 16` to `Community 5`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `snapshot()` connect `Community 13` to `Community 16`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `ResourceBundleClass`, `ArrayUtils`, `SerialBuffer` to the rest of the system?**
  _1093 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._