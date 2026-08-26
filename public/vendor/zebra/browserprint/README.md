Official Zebra Browser Print JavaScript SDK
==========================================

Place the official Zebra file here:

- BrowserPrint-3.0.216.min.js

Source:

- Zebra Browser Print Support
- Download: "Browser Print JavaScript Library"
- URL: https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html

Do not replace this file with CDN, npm, GitHub gist, or third-party mirrors.
The JavaScript library is distributed by Zebra Technologies through a request
form, so it is intentionally not vendored here unless the official Zebra
download has been obtained.

After adding the file, production can verify:

typeof window.BrowserPrint !== 'undefined'
typeof window.BrowserPrint.getDefaultDevice === 'function'
