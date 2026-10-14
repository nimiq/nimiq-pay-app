# Third-Party Notices

Nimiq Pay is licensed under [GPL-3.0-only](./LICENSE). This repository also contains the third-party files listed below, which keep their own licenses. Dependencies installed through pnpm are not listed here; their licenses ship with each package.

## Fonts

| Font | Files | License |
|---|---|---|
| Mulish, Copyright 2016 The Mulish Project Authors | `src/assets/fonts/` | SIL Open Font License 1.1, see [`OFL-Mulish.txt`](./src/assets/fonts/OFL-Mulish.txt) |
| Fira Mono, Copyright (c) 2012-2013 The Mozilla Corporation and Telefonica S.A. | `src/assets/fonts/` | SIL Open Font License 1.1, see [`OFL-FiraMono.txt`](./src/assets/fonts/OFL-FiraMono.txt) |

## Mini Apps provider

`vendor/trust-web3-provider` is a git submodule of [nimiq/trust-web3-provider](https://github.com/nimiq/trust-web3-provider), a fork of [trustwallet/trust-web3-provider](https://github.com/trustwallet/trust-web3-provider). Each of its packages declares the MIT license in its `package.json`. The built provider is bundled into the app as `public/web3-provider.js`.

## sql.js

`public/assets/sql-wasm.wasm` is the WebAssembly build of [sql.js](https://github.com/sql-js/sql.js), used by the web build. It contains SQLite, which is in the public domain.

```text
MIT license

Copyright (c) 2017 sql.js authors (see AUTHORS)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Patches

`patches/randombytes@2.1.0.patch` modifies [randombytes](https://github.com/crypto-browserify/randombytes) (MIT) to use `globalThis.crypto`.
