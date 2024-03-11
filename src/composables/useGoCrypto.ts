/* eslint-disable style/indent, style/semi, style/member-delimiter-style, antfu/if-newline, style/quote-props,
style/type-annotation-spacing, style/brace-style, curly, arrow-parens --
The idea is to eventually move this into a separate lib, therefore we keep the file as close as possible to the variant
using in the Nimiq Wallet */
import type { CapacitorHttp } from '@capacitor/core';
import { ValidationUtils } from '@nimiq/utils';
import { i18n } from '@/i18n/i18n-setup';
import { isDev } from '@/lib/index';

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
    amount: number;
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
    )) return null;

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
            || ('paymentId' in requestIdentifier && id !== requestIdentifier.paymentId)) throw new Error('Invalid id');

        const status: GoCryptoPaymentStatus = data.status;
        if (typeof status !== 'number'
            || !Object.values(GoCryptoPaymentStatus).includes(status)) throw new Error('Invalid status');

        const serverTimeOffset = await getServerTimeOffset(responseDateHeader, getServerTime);
        const expiryFinal = Date.parse(data.expires_at) - serverTimeOffset; // convert expiry to user's clock
        if (Number.isNaN(expiryFinal)) throw new Error('Invalid expiry');
        const expiryEarly = expiryFinal - earlyExpiryOffset;

        const storeName: string = data.store_full_name;
        if (typeof storeName !== 'string' || !storeName) throw new Error('Invalid storeName');

        // Only support Nimiq
        const nimiqPaymentOptions: Record<string, any> = Array.isArray(data.payment_options)
            && (data.payment_options as any[])
                .find((option) => typeof option === 'object' && option.currency_name === 'NIM');
        if (!nimiqPaymentOptions
            || nimiqPaymentOptions.currency !== /* Nimiq id */ 207) throw new Error('Missing Nimiq payment options');

        const recipient: string = ValidationUtils.normalizeAddress(nimiqPaymentOptions.wallet_address);
        if (!ValidationUtils.isValidAddress(recipient)) throw new Error('Invalid recipient');

        const amount = Math.round(Number.parseFloat(nimiqPaymentOptions.amount) * 1e5);
        if (Number.isNaN(amount) || !Number.isFinite(amount)) throw new Error('Invalid amount');

        return {
            id,
            status,
            expiryFinal,
            expiryEarly,
            storeName,
            recipient,
            amount,
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

export function goCryptoStatusToUserFriendlyMessage(paymentDetails: GoCryptoPaymentDetails | GoCryptoPaymentApiError)
: { paymentStatus: 'pending' }
    | { paymentStatus: 'accepted', title: string }
    | { paymentStatus: 'failed', title: string, message: string } {
    const paymentId = 'id' in paymentDetails
        ? paymentDetails.id
        : 'paymentId' in paymentDetails.request
            ? paymentDetails.request.paymentId
            : null;
    const successDefaults = {
        paymentStatus: 'accepted' as const,
    };
    const messageNewPaymentRequest = i18n.t('Please ask the merchant to create a new payment request.') as string;
    const messageAskForPaymentStatus = i18n.t('Please ask the merchant to check the status of your payment.') as string;
    const messageRefund = i18n.t('If you already made a payment which was not accepted, please contact GoCrypto for a '
      + 'refund.') as string + (paymentId ? ` (GoCrypto id: ${paymentId})` : '');
    const errorDefaults = {
        paymentStatus: 'failed' as const,
        // Concatenate sentences to re-use individual translations.
        message: `${messageNewPaymentRequest} ${messageRefund}`,
    };

    if ('errorCode' in paymentDetails) {
        switch (paymentDetails.errorCode) {
            case GoCryptoPaymentApiErrorCode.PaymentNotFound:
                // This surprisingly is returned for non-pending requests, for example paid, expired, or cancelled
                // requests, instead of payment info with a status of for example Paid or AutoClosed.
                if ('paymentId' in paymentDetails.request) {
                    return {
                        ...errorDefaults,
                        title: i18n.t('Not a pending payment request') as string,
                        // eslint-disable-next-line prefer-template
                        message: i18n.t('The payment request might have been paid, expired, or cancelled.') + ' '
                            + errorDefaults.message,
                    };
                }
                // For payment request by merchantId fall through to the InvalidIdentifier case, because the merchant's
                // previous payment request expired, which might have been for another customer, and he did not set up a
                // new request yet for the new customer.
                // eslint-disable-next-line no-fallthrough
            case GoCryptoPaymentApiErrorCode.InvalidIdentifier: return {
                // No payment request found for the given identifier.
                ...errorDefaults,
                title: i18n.t('No payment request found') as string,
                message: messageNewPaymentRequest,
            };
            case GoCryptoPaymentApiErrorCode.TooManyRequests: return {
                // Rate limit hit.
                ...errorDefaults,
                title: i18n.t('GoCrypto API refused connecting') as string,
                // The user could also avoid the rate limit by switching to a different network, but more than likely if
                // a rate limit occurred, the user is in the same network as the merchant, and the merchant is rate
                // limited, too. GoCrypto blocks the IP for one hour.
                message: i18n.t('If you\'re in the same WiFi as the merchant, try both switching to mobile data. '
                    + 'Otherwise, try again in one hour.') as string,
            };
            case GoCryptoPaymentApiErrorCode.InvalidResponse: return {
                // Invalid data or generic HTTP error.
                ...errorDefaults,
                title: i18n.t('Invalid API response'),
                message: `${i18n.t(
                    'Received an invalid response from GoCrypto: {errorMessage}',
                    { errorMessage: paymentDetails.errorMessage },
                )}. ${messageAskForPaymentStatus} ${messageRefund}`,
            };
            default: {
                // An error code we don't know and don't specifically handle.
                // Split camel case error code into multiple upper case words.
                const userFriendlyErrorCode = paymentDetails.errorCode
                    .replace(/^[a-z]|[A-Z]/g, (char, index) => `${index !== 0 ? ' ' : ''}${char.toUpperCase()}`);
                const i18nInterpolation = {
                    errorCode: userFriendlyErrorCode,
                    errorMessage: paymentDetails.errorMessage,
                };
                return {
                    ...errorDefaults,
                    title: i18n.t('Unexpected GoCrypto error') as string,
                    message: `${paymentDetails.errorMessage
                        ? i18n.t('Error {errorCode}: {errorMessage}', i18nInterpolation)
                        : i18n.t('Error {errorCode}', i18nInterpolation)
                    }. ${messageAskForPaymentStatus} ${messageRefund}`,
                };
            }
        }
    }

    switch (paymentDetails.status) {
        case GoCryptoPaymentStatus.Paid: return {
            ...successDefaults,
            title: i18n.t('The payment request has already been paid') as string,
        };
        case GoCryptoPaymentStatus.Processing: return {
            ...successDefaults,
            title: i18n.t('The payment request is being processed') as string,
        };
        case GoCryptoPaymentStatus.Failed: return {
            ...errorDefaults,
            title: i18n.t('Your payment failed') as string,
        };
        case GoCryptoPaymentStatus.NotValid: return {
            ...errorDefaults,
            title: i18n.t('Your payment is invalid') as string,
        };
        case GoCryptoPaymentStatus.Refund: return {
            ...errorDefaults,
            title: i18n.t('Your payment was refunded') as string,
            message: messageNewPaymentRequest,
        };
        case GoCryptoPaymentStatus.Cancelled: return {
            ...errorDefaults,
            title: i18n.t('The payment request was cancelled') as string,
        };
        default: // do nothing and continue with checks below
    }
    if (paymentDetails.status === GoCryptoPaymentStatus.AutoClosed || paymentDetails.expiryFinal < Date.now()) {
        return {
            ...errorDefaults,
            title: i18n.t('The payment request expired') as string,
        };
    }
    if (paymentDetails.expiryEarly < Date.now()) {
        return {
            ...errorDefaults,
            title: i18n.t('The payment request is about to expire') as string,
            // eslint-disable-next-line prefer-template
            message: messageNewPaymentRequest + ' '
                + i18n.t('If you already made a payment, wait for it to be confirmed instead.'),
        };
    }

    // Unpaid request without any errors.
    return {
        paymentStatus: 'pending',
    };
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
    } catch (e) {
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
