/* eslint-disable style/indent, style/semi, style/member-delimiter-style, antfu/if-newline,
antfu/consistent-list-newline, style/quote-props, style/brace-style --
The idea is to eventually move this into a separate lib, therefore we keep the file as close as possible to the variant
using in the Nimiq Wallet */
import type { CapacitorHttp } from '@capacitor/core';
import { isDev } from '@/lib/index';
import { ValidationUtils } from '@nimiq/utils';

const GO_CRYPTO_CONFIG = isDev
    // The api keys are allowed to be public. The dev key is from chapter 4 of the documentation, the production key
    // a Nimiq specific key.
    ? { apiEndpoint: 'https://api.staging.gocrypto.com/', apiKey: 'ae7344d0-3839-4732-bf57-c2489b92dc62' }
    : { apiEndpoint: 'https://api.gocrypto.com/', apiKey: '606abde2-bc23-46c6-9f2e-a53307bae0bb' };

// Parameter that specifies the GoCrypto payment id. Can optionally also be set on regular payment links, e.g. Nimiq
// payment links, not only on GoCrypto request links.
export const GOCRYPTO_ID_PARAM = 'gocrypto_id';
const MERCHANT_ID_PARAM = 'merchant_id';

export type GoCryptoRequestIdentifier = { merchantId: string } | { paymentId: string };

// As defined in GoCrypto wallet integration manual v1.1, section 3.8
export enum GoCryptoFiatCurrency {
    EUR,
    HRK = 11,
    TRY,
    CHF,
    USD,
    JPY,
    BGN = 50,
    CZK,
    DKK,
    GBP,
    HUF,
    PLN,
    RON,
    SEK,
    ISK,
    NOK,
    RUB,
    AUD,
    BRL,
    CAD,
    CNY,
    HKD,
    IDR,
    ILS,
    INR,
    KRW,
    MXN,
    MYR,
    NZD,
    PHP,
    SGD,
    THB,
    ZAR,
    NGN = 78,
    CLP,
    CRC,
    EGP,
    GEL,
    GHS,
    KES,
    MAD,
    PEN,
    LKR,
    AED,
    UYU,
    XOF,
    XCD,
}

// As defined in GoCrypto wallet integration manual v1.1, section 3.9
export enum GoCryptoPaymentStatus {
    Opened,
    InPayment, // This is the standard case when a request link is scanned.
    Paid,
    Processing,
    AutoClosed, // Payment expired
    Failed,
    NotValid,
    Refund, // Refunded after successful payment
    Cancelled, // Payment request cancelled on POS
}

export interface GoCryptoPaymentDetails {
    id: string; // payment id
    status: GoCryptoPaymentStatus;
    expiryFinal: number; // timestamp in ms; when the GoCrypto payment request expires
    expiryEarly: number; // timestamp in ms; expiryFinal minus a safety buffer for transaction to get confirmed
    storeName: string;
    recipient: string;
    amount: number; // NIM amount in luna
    fiatAmount: number; // fiat amount in fiatCurrency
    fiatCurrency: GoCryptoFiatCurrency;
}

// The errors listed here are the ones we encountered so far. The API errors are unfortunately not mentioned in the
// documentation at all.
export enum GoCryptoPaymentApiErrorCode {
    // Seems to be returned for invalid/unknown request identifiers.
    InvalidIdentifier = 'http404',
    // This surprisingly is returned for non-pending requests, for example paid, expired, or cancelled requests, instead
    // of payment info with a status of for example Paid or AutoClosed.
    PaymentNotFound = 'paymentNotFound',
    // This is not an error that is returned by the GoCrypto api, but an error that we assign when the rate limit on
    // this IP is hit. This error's name is surrounded by __ to avoid a potential name clash with GoCrypto.
    // Note that Too Many requests more likely results due to too many requests by the GoCrypto PoS than by us, for
    // example if two PoS with two different payment requests are open at the same time or the network cache is disabled
    // in the dev tools (which results in sending a new OPTIONS pre-flight with every request), as the PoS sends api
    // requests very frequently. Also note, that we can catch this error only on the request, not if it already occurs
    // during the pre-flight. Running into the rate limit results in being blocked for one hour.
    TooManyRequests = '__tooManyRequests__',
    // This is not an error that is returned by the GoCrypto api, but an error that we assign on invalid / unexpected
    // api responses. This error's name is surrounded by __ to avoid a potential name clash with GoCrypto.
    InvalidResponse = '__invalidResponse__',
}

export interface GoCryptoPaymentApiError {
    errorCode: GoCryptoPaymentApiErrorCode | string;
    errorMessage: string; // Can also be an empty string.
    request: GoCryptoRequestIdentifier;
}

export function parseGoCryptoRequestLink(requestLink: string | URL): GoCryptoRequestIdentifier | null {
    const url = toUrl(requestLink);
    // Note that we don't use the rather vague Regexs provided in GoCrypto's documentation but manually implement a
    // little stricter parsing.
    if (!url || !(
        /(?:^|\.)gocrypto\.com$/i.test(url.hostname)
        || /^gocrypto:$/i.test(url.protocol) // for scanning GoCrypto deep-links
    )) { return null;
}

    // Note: searchParams.get also url decodes the parameters already
    const paymentId = url.searchParams.get(GOCRYPTO_ID_PARAM);
    if (paymentId && !/\w+/.test(paymentId)) return null;
    const merchantId = url.searchParams.get(MERCHANT_ID_PARAM);
    if (merchantId && !/\w+/.test(merchantId)) return null;

    // paymentId is more specific, therefore prioritize paymentId over merchantId, in case both are specified.
    if (paymentId) {
        return { paymentId };
    }
    if (merchantId) {
        return { merchantId };
    }

    return null;
}

/**
 * @param {GoCryptoRequestIdentifier} requestIdentifier
 * @param {object} [options]
 * @param {number} [options.earlyExpiryOffset] - Offset to deduct from the expiry date for the transaction to be
 *   confirmed by GoCrypto in time. If confirmation on the Blockchain is required, setting this to at least twice the
 *   block time should be considered. In ms. The default is 20000ms.
 * @param {() => Promise<number>} [options.getServerTime] - A function to determine the current server time, for the
 *   case that the user's clock is off. Only used, if the server time can't be determined from GoCrypto's api responses
 *   via a customFetch.
 * @param {typeof CapacitorHttp['request']} [options.customFetch] - Custom fetch handler to use. In native, for example
 *   Capacitor/Cordova based apps, it is recommended to use native HTTP requests instead of the browser api, to be able
 *   to set and read arbitrary headers. By default, the browser api's fetch is used.
 */
export async function fetchGoCryptoPaymentDetails(
    requestIdentifier: GoCryptoRequestIdentifier,
    {
        earlyExpiryOffset = 20 * 1000,
        getServerTime,
        customFetch,
    }: {
        earlyExpiryOffset?: number,
        getServerTime?: () => Promise<number>,
        customFetch?: typeof CapacitorHttp['request'],
    } = {},
): Promise<GoCryptoPaymentDetails | GoCryptoPaymentApiError> {
    // Note: for querying data by merchant id for fixed QR code stickers in the shop, the documentation claims that
    // <apiEndpoint>/v3/custodial/payment?merchant_id=<merchantId> should be queried, and chapter 4 suggests that v2 is
    // to be used. However, all those URLs are invalid or at least not CORS enabled. Experimentation showed, that the
    // same url path as querying for payment ids has to be used instead: /publicapi/payment.
    const url = `${GO_CRYPTO_CONFIG.apiEndpoint}publicapi/payment?${'merchantId' in requestIdentifier
        ? `merchant_id=${requestIdentifier.merchantId}`
        : `payment_id=${requestIdentifier.paymentId}`}`;
    const headers = {
        // Note: As of August 2023, setting a custom user agent is possible in Firefox and Safari, but not in Chrome
        // yet, see https://bugs.chromium.org/p/chromium/issues/detail?id=571722. However, the Chrome uer agent is good
        // enough for now, according to GoCrypto. In native apps, a customFetch that supports arbitrary headers should
        // be used.
        'User-Agent': 'Nimiq Pay',
        Authorization: `publicauth ${GO_CRYPTO_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
    };

    try {
        let responseStatus: number;
        let responseStatusText: string | null = null;
        let responseDateHeader: string | null;
        let data: Record<string, any> | null; // Assume type any. Correct type will be checked by further parsing below.
        if (!customFetch) {
            const response = await fetch(url, {
                headers,
                cache: 'no-cache',
                referrerPolicy: 'no-referrer',
            });
            responseStatus = response.status;
            responseStatusText = response.statusText;
            // Note: with the browser api's fetch, reading the Date header is not allowed on cors requests unless it's
            // specified in the response's Access-Control-Expose-Headers. If not allowed, null is read.
            responseDateHeader = response.headers.get('Date');
            // Try to read body which is set on valid requests and expected errors.
            data = await response.json().catch(() => null) as Record<string, any> | null;
        } else {
            const response = await customFetch({
                url,
                headers,
                responseType: 'json',
            });
            responseStatus = response.status;
            responseDateHeader = response.headers.Date || response.headers.date;
            data = response.data as Record<string, any> | null; // already parsed according to responseType
        }

        if (data && typeof data === 'object' && typeof data.code === 'string' && typeof data.message === 'string') {
            // Api error with an error code.
            return {
                errorCode: data.code,
                errorMessage: data.message,
                request: requestIdentifier,
            };
        }
        if (responseStatus === /* Too Many Requests */ 429) {
            // Handle error Too Many Requests manually as it's an error that can regularly occur, but that does not
            // include data with an error code.
            return {
                errorCode: GoCryptoPaymentApiErrorCode.TooManyRequests,
                errorMessage: 'Too Many Requests', // translated message is given in goCryptoStatusToUserFriendlyMessage
                request: requestIdentifier,
            };
        }
        if (responseStatus < 200 || responseStatus >= 300) {
            // Equivaltent to browser fetch's response.ok, https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
            // eslint-disable-next-line prefer-template
            throw new Error(`HTTP Error ${responseStatus}` + (responseStatusText ? ` - ${responseStatusText}` : ''));
        }
        if (!data) throw new Error('Received no data');

        const id: string = data.id;
        if (typeof id !== 'string' || !/\w+/.test(id)
          || ('paymentId' in requestIdentifier && id !== requestIdentifier.paymentId)) { throw new Error('Invalid id');
}

        const status: GoCryptoPaymentStatus = data.status;
        if (typeof status !== 'number' || !(status in GoCryptoPaymentStatus)) throw new Error('Invalid status');

        const serverTimeOffset = await getServerTimeOffset(responseDateHeader, getServerTime);
        const expiryFinal = Date.parse(data.expires_at) - serverTimeOffset; // convert expiry to user's clock
        if (Number.isNaN(expiryFinal)) throw new Error('Invalid expiry');
        const expiryEarly = expiryFinal - earlyExpiryOffset;

        const storeName: string = data.store_full_name;
        if (typeof storeName !== 'string' || !storeName) throw new Error('Invalid storeName');

        // Only support Nimiq
        const nimiqPaymentOptions: Record<string, any> = Array.isArray(data.payment_options)
          && (data.payment_options as any[])
                .find(option => typeof option === 'object' && option.currency_name === 'NIM');
        if (!nimiqPaymentOptions
          || nimiqPaymentOptions.currency !== /* Nimiq id */ 207) { throw new Error('Missing Nimiq payment options');
}

        const recipient: string = ValidationUtils.normalizeAddress(nimiqPaymentOptions.wallet_address);
        if (!ValidationUtils.isValidAddress(recipient)) throw new Error('Invalid recipient');

        const amount = Math.round(Number.parseFloat(nimiqPaymentOptions.amount) * 1e5);
        if (Number.isNaN(amount) || !Number.isFinite(amount)) throw new Error('Invalid amount');

        const fiatAmount = Number.parseFloat(data.amount)
        if (Number.isNaN(fiatAmount) || !Number.isFinite(fiatAmount)) throw new Error('Invalid fiatAmount');

        const fiatCurrency: GoCryptoFiatCurrency = data.currency;
        if (typeof fiatCurrency !== 'number'
          || !(fiatCurrency in GoCryptoFiatCurrency)) { throw new Error('Invalid fiatCurrency');
}

        return {
            id,
            status,
            expiryFinal,
            expiryEarly,
            storeName,
            recipient,
            amount,
            fiatAmount,
            fiatCurrency,
        };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            errorCode: GoCryptoPaymentApiErrorCode.InvalidResponse,
            errorMessage, // We don't translate the error message, as these errors shouldn't normally occur.
            request: requestIdentifier,
        };
    }
}

const USER_FRIENDLY_STATUS_TITLE = {
    [GoCryptoPaymentApiErrorCode.PaymentNotFound]: 'Not a pending payment request',
    [GoCryptoPaymentApiErrorCode.InvalidIdentifier]: 'No payment request found',
    [GoCryptoPaymentApiErrorCode.TooManyRequests]: 'GoCrypto API refused connecting',
    [GoCryptoPaymentApiErrorCode.InvalidResponse]: 'Invalid GoCrypto API response',
    UnexpectedError: 'Unexpected GoCrypto error',
    [GoCryptoPaymentStatus.Paid]: 'The payment request has already been paid',
    [GoCryptoPaymentStatus.Processing]: 'The payment request is being processed',
    [GoCryptoPaymentStatus.Failed]: 'Your payment failed',
    [GoCryptoPaymentStatus.NotValid]: 'Your payment is invalid',
    [GoCryptoPaymentStatus.Refund]: 'Your payment was refunded',
    [GoCryptoPaymentStatus.Cancelled]: 'The payment request was cancelled',
    [GoCryptoPaymentStatus.AutoClosed]: 'The payment request expired',
    ExpiryEarly: 'The payment request is about to expire',
} as const;
const USER_FRIENDLY_STATUS_MESSAGE = {
    NotPending: 'The payment request might have been paid, expired, or cancelled.',
    InvalidResponse: 'Received an invalid response from GoCrypto: {errorMessage}.',
    UnknownError: 'Error {errorCodeAndMessage}.',
    AskForPaymentStatus: 'Please ask the merchant to check the status of your payment.',
    AskForNewPaymentRequest: 'Please ask the merchant to create a new payment request.',
    WaitForConfirmation: 'If you already made a payment, wait for it to be confirmed instead.',
    Refund: 'If you already made a payment which was not accepted, please contact GoCrypto for a refund.',
    // The user could also avoid the rate limit by switching to a different network, but more than likely if a rate
    // limit occurred, the user is in the same network as the merchant, and the merchant is rate limited, too. GoCrypto
    // blocks the IP for one hour.
    RateLimit: `If you're in the same WiFi as the merchant, try both switching to mobile data. ${
        'Otherwise, try again in one hour.'}`, // as template and not string concatenation for const string type
} as const;
type ValueOf<T extends object> = T[keyof T];

export type GoCryptoUserFriendlyStatusTitle = ValueOf<typeof USER_FRIENDLY_STATUS_TITLE>;
export type GoCryptoUserFriendlyStatusMessage = ValueOf<typeof USER_FRIENDLY_STATUS_MESSAGE>;
export interface GoCryptoUserFriendlyStatusOptions<IM extends boolean> {
    includeMessages?: IM,
    // Pass translations as Records, such that missing or superfluous entries in passed translations yield a type error.
    translations?: IM extends true
        ? Record<GoCryptoUserFriendlyStatusTitle | GoCryptoUserFriendlyStatusMessage, string>
        : Record<GoCryptoUserFriendlyStatusTitle, string>,
}
export type GoCryptoUserFriendlyStatus<IM extends boolean> = { paymentStatus: 'pending' }
  | { paymentStatus: 'accepted', title: string }
    // eslint-disable-next-line ts/no-empty-object-type
  | ({ paymentStatus: 'failed', title: string } & (IM extends true ? { message: string } : {}));

export function goCryptoStatusToUserFriendlyStatus<IM extends boolean = true>(
    paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError,
    options: GoCryptoUserFriendlyStatusOptions<IM> = {},
): GoCryptoUserFriendlyStatus<IM> {
    const createErrorStatus = (
        titleKey: keyof typeof USER_FRIENDLY_STATUS_TITLE,
        messagePartKeys: Array<keyof typeof USER_FRIENDLY_STATUS_MESSAGE> = ['AskForNewPaymentRequest', 'Refund'],
        interpolations: Record<string, string> = {},
        appendPaymentId: boolean = true,
    ) => {
        const paymentId = 'id' in paymentDetails
            ? paymentDetails.id
            : 'paymentId' in paymentDetails.request
                ? paymentDetails.request.paymentId
                : null;
        const title = goCryptoStatusToUserFriendlyStatus_getTitle(titleKey, options.translations);
        const message = goCryptoStatusToUserFriendlyStatus_getMessage(messagePartKeys, {
            ...options,
            interpolations,
            ...(appendPaymentId && paymentId ? { appendPaymentId, paymentId } : null),
        });
        return {
            paymentStatus: 'failed',
            title,
            ...(message ? { message } : null),
        } as Extract<GoCryptoUserFriendlyStatus<IM>, { paymentStatus: 'failed' }>;
    };

    if ('errorCode' in paymentDetails) {
        const errorCode = paymentDetails.errorCode === GoCryptoPaymentApiErrorCode.PaymentNotFound
          && 'merchantId' in paymentDetails.request
            // For not found payment request by merchantId use InvalidIdentifier messaging, because the merchant's
            // previous payment request expired, which might have been for another customer, and he did not set up a
            // new request yet for the new customer.
            ? GoCryptoPaymentApiErrorCode.InvalidIdentifier
            : paymentDetails.errorCode;
        const titleKey = errorCode in USER_FRIENDLY_STATUS_TITLE
            ? errorCode as GoCryptoPaymentApiErrorCode
            : 'UnexpectedError' as const;
        switch (errorCode) {
            case GoCryptoPaymentApiErrorCode.PaymentNotFound:
                // This surprisingly is returned for non-pending requests, for example paid, expired, or cancelled
                // requests, instead of payment info with a status of for example Paid or AutoClosed.
                return createErrorStatus(titleKey, ['NotPending', 'AskForNewPaymentRequest', 'Refund']);
            case GoCryptoPaymentApiErrorCode.InvalidIdentifier:
                // No payment request found for the given identifier.
                return createErrorStatus(titleKey, ['AskForNewPaymentRequest'], undefined, false);
            case GoCryptoPaymentApiErrorCode.TooManyRequests:
                // Rate limit hit.
                return createErrorStatus(titleKey, ['RateLimit'], undefined, false);
            case GoCryptoPaymentApiErrorCode.InvalidResponse:
                // Invalid data or generic HTTP error.
                return createErrorStatus(titleKey, ['InvalidResponse', 'AskForPaymentStatus', 'Refund'],
                    { errorMessage: paymentDetails.errorMessage });
            default: {
                // An error code we don't know and don't specifically handle.
                // Split camel case error code into multiple upper case words.
                const userFriendlyErrorCode = errorCode
                    .replace(/^[a-z]|[A-Z]/g, (char, index) => `${index !== 0 ? ' ' : ''}${char.toUpperCase()}`);
                const errorCodeAndMessage = userFriendlyErrorCode
                  + (paymentDetails.errorMessage ? `: ${paymentDetails.errorMessage}` : '');
                return createErrorStatus(titleKey, ['UnknownError', 'AskForPaymentStatus', 'Refund'],
                    { errorCodeAndMessage });
            }
        }
    }

    const { status } = paymentDetails;
    switch (status) {
        case GoCryptoPaymentStatus.Paid:
        case GoCryptoPaymentStatus.Processing:
            return {
                paymentStatus: 'accepted',
                title: goCryptoStatusToUserFriendlyStatus_getTitle(status, options.translations),
            };
        case GoCryptoPaymentStatus.Failed:
        case GoCryptoPaymentStatus.NotValid:
        case GoCryptoPaymentStatus.Cancelled:
            return createErrorStatus(status);
        case GoCryptoPaymentStatus.Refund:
            return createErrorStatus(status, ['AskForNewPaymentRequest'], undefined, false);
        default: // do nothing and continue with checks below
    }
    if (status === GoCryptoPaymentStatus.AutoClosed || paymentDetails.expiryFinal < Date.now()) {
        return createErrorStatus(GoCryptoPaymentStatus.AutoClosed);
    }
    if (paymentDetails.expiryEarly < Date.now()) {
        return createErrorStatus('ExpiryEarly', ['AskForNewPaymentRequest', 'WaitForConfirmation'], undefined, false);
    }

    // Unpaid request without any errors.
    return {
        paymentStatus: 'pending',
    };
}

function goCryptoStatusToUserFriendlyStatus_getTitle(
    key: keyof typeof USER_FRIENDLY_STATUS_TITLE,
    translations?: Record<GoCryptoUserFriendlyStatusTitle, string>,
): string {
    const untranslatedTitle = USER_FRIENDLY_STATUS_TITLE[key];
    return translations?.[untranslatedTitle] ?? untranslatedTitle;
}

function goCryptoStatusToUserFriendlyStatus_getMessage<IM extends boolean = true>(
    messagePartKeys: Array<keyof typeof USER_FRIENDLY_STATUS_MESSAGE>,
    options: GoCryptoUserFriendlyStatusOptions<IM> & {
        interpolations?: Record<string, string>,
    } & ({
        appendPaymentId: true,
        paymentId: string,
    } | Record<never, never>) = {},
): string | null {
    const isOptionsWithIncludeMessages = (
        (o: GoCryptoUserFriendlyStatusOptions<boolean>): o is GoCryptoUserFriendlyStatusOptions<true> =>
            o.includeMessages !== false // undefined defaults to true
    )(options);
    if (!isOptionsWithIncludeMessages) return null;
    let message = messagePartKeys.map((partKey) => {
        const untranslatedPart = USER_FRIENDLY_STATUS_MESSAGE[partKey];
        const partTemplate = options.translations?.[untranslatedPart] ?? untranslatedPart;
        return partTemplate.replace(/\{(\w+)\}/g, (match, variable) => options.interpolations?.[variable] ?? match);
    }).join(' ');

    if ('appendPaymentId' in options && options.appendPaymentId) {
        message += ` (GoCrypto ID: ${options.paymentId})`;
    }
    return message;
}

type MonitoringOptions<IM extends boolean> = Parameters<typeof fetchGoCryptoPaymentDetails>[1]
  & GoCryptoUserFriendlyStatusOptions<IM>
  & {
        onUpdate: (
            paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError,
            userFriendlyStatus: GoCryptoUserFriendlyStatus<IM>,
        ) => void,
        onTimerTick?: (remainingTimeExpiryEarly: number, remainingTimeExpiryFinal: number) => void,
    };
interface MonitoringState<IM extends boolean> {
    stopped: boolean,
    paymentDetailsUpdateInterval: number,
    expiryCountdownsUpdateInterval: number,
    paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError | null,
    userFriendlyStatus: GoCryptoUserFriendlyStatus<IM> | null,
}

export function monitorGoCryptoRequest<IM extends boolean = true>(
    paymentId: string,
    options: MonitoringOptions<IM>, // Changing of the options like translations during monitoring is supported.
): () => void {
    const state: MonitoringState<IM> = {
        stopped: false,
        paymentDetailsUpdateInterval: -1,
        expiryCountdownsUpdateInterval: -1,
        paymentDetails: null,
        userFriendlyStatus: null,
    };

    monitorGoCryptoRequest_updatePaymentDetails(paymentId, options, state).then((shouldContinueMonitoring) => {
        if (!shouldContinueMonitoring || state.stopped) return; // schedule neither continuous monitoring nor countdowns
        state.paymentDetailsUpdateInterval = window.setInterval(
            () => monitorGoCryptoRequest_updatePaymentDetails(paymentId, options, state),
            5000,
        );
        // Start countdowns only after initial payment details update, as they're based on them.
        const shouldContinueCountdowns = monitorGoCryptoRequest_updateExpiryCountdowns(options, state);
        if (!shouldContinueCountdowns) return;
        state.expiryCountdownsUpdateInterval = window.setInterval(
            () => monitorGoCryptoRequest_updateExpiryCountdowns(options, state),
            500,
        );
    });

    return function stopMonitoring() {
        state.stopped = true;
        clearInterval(state.paymentDetailsUpdateInterval);
        clearInterval(state.expiryCountdownsUpdateInterval);
    };
}

async function monitorGoCryptoRequest_updatePaymentDetails<IM extends boolean>(
    paymentId: string,
    options: MonitoringOptions<IM>,
    state: MonitoringState<IM>,
): Promise<boolean> {
    state.paymentDetails = await fetchGoCryptoPaymentDetails({ paymentId }, options);
    if (state.stopped) return false; // stopped while we were in asynchronous code
    state.userFriendlyStatus = goCryptoStatusToUserFriendlyStatus(state.paymentDetails, options);
    try {
        options.onUpdate(state.paymentDetails, state.userFriendlyStatus);
    } catch {}
    if (state.userFriendlyStatus.paymentStatus === 'accepted') {
        clearInterval(state.paymentDetailsUpdateInterval);
        return false;
    }
    return true;
}

function monitorGoCryptoRequest_updateExpiryCountdowns<IM extends boolean>(
    options: MonitoringOptions<IM>,
    state: MonitoringState<IM>,
): boolean {
    const paymentDetails = state.paymentDetails && 'id' in state.paymentDetails ? state.paymentDetails : null;
    const { expiryEarly, expiryFinal } = paymentDetails
      || { expiryEarly: -1, expiryFinal: -1 }; // paymentDetails unknown or an error

    const now = Date.now();
    const remainingTimeExpiryEarly = Math.max(expiryEarly - now, 0);
    const remainingTimeExpiryFinal = Math.max(expiryFinal - now, 0);
    if (options.onTimerTick) {
        try {
            options.onTimerTick(remainingTimeExpiryEarly, remainingTimeExpiryFinal);
        } catch {}
    }

    if (!remainingTimeExpiryEarly && paymentDetails && state.userFriendlyStatus?.paymentStatus !== 'failed') {
        // Request an immediate monitoring update if the early countdown passed, and there's not already an error, like
        // an expiry error.
        monitorGoCryptoRequest_updatePaymentDetails(paymentDetails.id, options, state);
    }
    if ((!remainingTimeExpiryFinal && paymentDetails) || state.userFriendlyStatus?.paymentStatus === 'accepted') {
        // Stop countdowns if the final countdown passed, or the payment was finished.
        clearInterval(state.expiryCountdownsUpdateInterval);
        return false;
    }
    return true;
}

function toUrl(link: string | URL): null | URL {
    if (link instanceof URL) return link;

    if (!link.includes(':')) {
        // If the link does not include a protocol, include a protocol to be parseable as URL. We assume https by
        // default, but it could be any dummy protocol. The // after the : can be omitted.
        link = `https:${link}`;
    }

    try {
        return new URL(link);
    } catch {
        return null;
    }
}

// Cache server time offset, to avoid re-fetching it every time.
let serverTimeOffset: number | undefined;
let serverTimeOffsetResetTimeout = -1;
async function getServerTimeOffset(serverDateHeader?: string | null, getServerTime?: () => Promise<number>) {
    let serverTime = Date.parse(serverDateHeader || '');
    const gotInvalidDateHeader = Number.isNaN(serverTime);
    if (serverTimeOffset !== undefined && gotInvalidDateHeader) {
        // If we already have a cached serverTimeOffset, and we couldn't retrieve the server time from the Date header
        // without having to fetch it separately, return the cached serverTimeOffset.
        return serverTimeOffset;
    }

    if (gotInvalidDateHeader) {
        // Could not retrieve server time from Date header, we have to fetch it separately.
        serverTime = getServerTime ? await getServerTime() : Date.now();
    }
    serverTimeOffset = serverTime - Date.now();
    if (Math.abs(serverTimeOffset) < 1500) {
        // If deviation from server time is minimal, ignore it as it might be coming just from network delays.
        serverTimeOffset = 0;
    }

    // Reset cached serverTimeOffset after one hour for the case that user changes his clock without killing or
    // reloading the app. Note that setTimeout is unaffected from changes to the user clock.
    clearTimeout(serverTimeOffsetResetTimeout);
    serverTimeOffsetResetTimeout = window.setTimeout(() => serverTimeOffset = undefined, 60 * 60 * 1000);

    return serverTimeOffset;
}
