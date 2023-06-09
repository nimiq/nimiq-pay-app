import _Nimiq from '@nimiq/core-web';

export as namespace Nimiq;
export = _Nimiq

declare global {
    var Nimiq: typeof _Nimiq;
}