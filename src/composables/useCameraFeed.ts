import { type Ref, ref } from 'vue'
import { modalController } from '@ionic/vue'
import { useDevice } from './useDevice'

export function useCameraFeed(cameraFeedContainer: Ref<HTMLElement>) {
  return (useDevice().isWeb ? useCameraFeedWeb : useCameraFeedMobile)(cameraFeedContainer)
}

/**
 * In Ionic, the camera feed is displayed behind the WebView.
 * This composable will open a "hole" in the WebView to display the camera feed and close it when the camera is closed.
 */
function useCameraFeedMobile(cameraFeedContainer: Ref<HTMLElement>) {
  const hasPermission = ref(false)

  // The important elements to manipulate. In the DOM they are nested like this:
  // <ion-app>
  //  <ion-modal> # modalWrapper - It is a WebComponent, which have a shadow root
  //    <ion-backdrop> # backdrop
  //    <div role="dialog"> # dialog
  const domElements = async () => ({
    mainView: document.querySelector('ion-app > div') as HTMLElement,
    dialog: await modalController.getTop().then(m => m?.shadowRoot?.querySelector('div[role="dialog"]') as HTMLElement),
    backdrop: await modalController.getTop().then(m => m?.shadowRoot?.querySelector('ion-backdrop') as HTMLElement),
  })

  /**
   * The camera feed is displayed behind the WebView. This function will open a "hole" in the WebView to display the camera feed.
   * First, we make a hole in the Modal and then we make the main view invisible.
   * To fake the modal, we create an huge white outline around the hole and make the element inside transparent.
   */
  async function setUpCameraFeed() {
    const { mainView, dialog, backdrop } = await domElements()

    if (!mainView || !cameraFeedContainer.value || !dialog || !backdrop)
      throw new Error(`There is an element missing: ${JSON.stringify({ mainView, cameraFeedContainer, dialog, backdrop })}`)

    // modalController.getTop()?.presentingElement?.style.setProperty('--background', 'transparent')
    mainView.style.setProperty('display', 'none')
    backdrop.style.setProperty('display', 'none')
    dialog.style.setProperty('--background', 'transparent')
    dialog.style.setProperty('border-top', 'calc((var(--ion-safe-area-top) + 10px)) solid #a9a9a9')

    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    await BarcodeScanner.requestPermissions()
    const permission = await BarcodeScanner.checkPermissions()
    hasPermission.value = permission.camera === 'granted'
  }

  async function tearDownCameraFeed() {
    const { mainView, dialog, backdrop } = await domElements()
    if (!mainView || !dialog || !backdrop)
      console.error('There is an element missing', { mainView, dialog, backdrop })

    mainView?.style.removeProperty('display')
    backdrop?.style.removeProperty('display')
    dialog?.style.removeProperty('--background')
    dialog?.style.removeProperty('border-top')
  }

  return {
    setUpCameraFeed,
    tearDownCameraFeed,
    hasPermission,
  }
}

function useCameraFeedWeb(cameraFeedContainer: Ref<HTMLElement>) {
  const hasPermission = ref(false)

  function getVideoElement() {
    const video = cameraFeedContainer.value.querySelector('video')
    if (!video)
      throw new Error('There is no video element in the cameraFeedContainer') // no translation as not user-facing text
    return video as HTMLVideoElement
  }

  async function setUpCameraFeed() {
    const video = getVideoElement()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: 512,
        height: 512,
        facingMode: 'environment', // Select the back camera
      },
    })
    hasPermission.value = true

    video.srcObject = stream
    video.play()
    return video
  }

  async function tearDownCameraFeed() {
    (getVideoElement().srcObject as MediaStream)?.getTracks().forEach(track => track.stop())
  }

  return {
    setUpCameraFeed,
    tearDownCameraFeed,
    hasPermission,
  }
}
