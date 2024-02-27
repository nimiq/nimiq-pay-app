# Nimiq Pay

## Nimiq Pay Flows

A flow is a sequence of steps that the user needs to follow to complete a user
story: Sign up, Log in, Send NIM, etc.

Since this is the core of the app, we rely on this flows to be well defined and
you can find them in the [flows](./src/lib/flows) folder with a
[README.md](./src/lib/flows/README.md) file that explains how flows works.

## Known issues

### Database encryption on Web

We are not encrypting the database on Web. This is because the library that we use to create a SQL database on the browser does not support
encryption. We are using `sql.js` under the hood, and it does not support encryption. **Android and iOS do support encryption**.

### Camera feed

The camera feed in mobile is weird. The Camera API for both Android and iOS, creates a camera feed that is set behind the WebView.
This creates an interesting challenge, since we need to make a "hole" in the WebView to show the camera feed. You can read more about this
in the [useCameraFeed](./src/composables/useCameraFeed.ts) composable. In web,
we just create a video element where we show the camera feed. Ez.
