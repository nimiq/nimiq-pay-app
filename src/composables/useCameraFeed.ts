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
function useCameraFeedMobile() {
  const hasPermission = ref(false)

  // The important elements to manipulate. In the DOM they are nested like this:
  // <ion-app>
  //  <ion-modal> # modalWrapper - It is a WebComponent, which has a shadow root
  //    #shadow-root
  //      <ion-backdrop> # backdrop
  //      <div role="dialog"> # dialog
  //    <ion-header> # slot content
  const domElements = async () => {
    const mainView = document.querySelector('ion-app > div') as HTMLDivElement | null
    const modal = await modalController.getTop()
    const modalRoot = modal?.shadowRoot
    const backdrop = modalRoot?.querySelector('ion-backdrop')
    const dialog = modalRoot?.querySelector('div[role="dialog"]') as HTMLDivElement | null | undefined
    const header = modal?.querySelector('ion-header')
    return { mainView, backdrop, dialog, header }
  }

  /**
   * The camera feed is displayed behind the WebView. This function will open a "hole" in the WebView to display the camera feed.
   * First, we make a hole in the Modal and then we make the main view invisible.
   * To fake the modal, we create an huge white outline around the hole and make the element inside transparent.
   */
  async function setUpCameraFeed() {
    const { mainView, backdrop, dialog, header } = await domElements()

    if (!mainView || !backdrop || !dialog || !header)
      throw new Error(`There is an element missing: ${JSON.stringify({ mainView, backdrop, dialog, header })}`)

    // modalController.getTop()?.presentingElement?.style.setProperty('--background', 'transparent')
    mainView.style.setProperty('display', 'none')
    backdrop.style.setProperty('display', 'none')
    dialog.style.setProperty('--background', 'transparent')
    // Immitate backdrop above dialog. This area is regularly var(--ion-safe-area-top) + 10px but grows when the user
    // drags the modal down.
    dialog.style.setProperty('border-top', '10vh solid #a9a9a9')
    header.style.setProperty('background', 'white')

    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning')
    if (!await BarcodeScanner.isSupported())
      throw new Error('BarcodeScanner is not supported')

    await BarcodeScanner.requestPermissions()
    const permission = await BarcodeScanner.checkPermissions()
    hasPermission.value = permission.camera === 'granted'
  }

  async function tearDownCameraFeed() {
    const { mainView, backdrop, dialog, header } = await domElements()
    if (!mainView || !backdrop || !dialog || !header)
      console.error('There is an element missing', { mainView, backdrop, dialog, header })

    mainView?.style.removeProperty('display')
    backdrop?.style.removeProperty('display')
    dialog?.style.removeProperty('--background')
    dialog?.style.removeProperty('border-top')
    header?.style.removeProperty('background')
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
