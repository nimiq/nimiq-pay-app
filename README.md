# Nimiq Pay

## Native releases

Run `pnpm release:beta` from a clean checkout on a Mac with the existing iOS and
Android build tools and signing credentials configured. The command syncs
translations, asks which AI CLI to use for the changelog, then starts release-it.

Set `GITHUB_TOKEN` in your local `.env` or shell environment. Use a personal access
token with access to `nimiq/nimiq-pay-app` and **Contents: read and write** permission
([GitHub release permissions](https://docs.github.com/en/rest/releases/releases#create-a-release)).
The token replaces `GITLAB_TOKEN`; no GitLab package registry token is needed for
release assets. Git must also be authenticated for pushing commits and tags to
`origin`, which should point to `https://github.com/nimiq/nimiq-pay-app.git`.

Release-it generates the changelog for review, builds iOS and Android, then commits
and tags the version and pushes it. It publishes the release notes and `.ipa`,
`.app.tgz`, `.aab`, and `.apk` files as GitHub release assets. After publishing, it
uploads the `.ipa` and `.aab` to BrowserStack using `BROWSERSTACK_USERNAME` and
`BROWSERSTACK_ACCESS_KEY`, then removes the local release build files.

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
