import type { Ref } from 'vue'
import { ref } from 'vue'
import { useDevice } from './useDevice'
import { useLogger } from './useLogger'

const logger = useLogger('useCameraFeed')

export function useCameraFeed(cameraFeedContainer: Ref<HTMLElement>) {
  return (useDevice().isWeb ? useCameraFeedWeb : useCameraFeedMobile)(cameraFeedContainer)
}

/**
 * In Ionic, the camera feed is displayed behind the WebView.
 * This composable will open a "hole" in the WebView to display the camera feed and close it when the camera is closed.
 */
function useCameraFeedMobile() {
  const hasPermission = ref(false)

  async function setUpCameraFeed() {
    const { Camera } = await import('@capacitor/camera')

    await Camera.requestPermissions({ permissions: ['camera'] })
    const permission = await Camera.checkPermissions()
    hasPermission.value = permission.camera === 'granted'
  }

  async function tearDownCameraFeed() {
  }

  return {
    setUpCameraFeed,
    tearDownCameraFeed,
    hasPermission,
  }
}

function useCameraFeedWeb(cameraFeedContainer: Ref<HTMLElement>) {
  const hasPermission = ref(false)
  // Kept outside the template ref: a stop queued behind start() can run after unmount, when the ref is already null.
  let stream: MediaStream | undefined

  function getVideoElement() {
    const video = cameraFeedContainer.value.querySelector('video')
    if (!video)
      throw new Error('There is no video element in the cameraFeedContainer')
    return video as HTMLVideoElement
  }

  async function setUpCameraFeed() {
    const video = getVideoElement()
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: 512,
          height: 512,
          facingMode: 'environment',
        },
      })
      hasPermission.value = true
    }
    catch (e) {
      logger.error('Error while getting camera feed:', e)
      hasPermission.value = false
      return
    }

    video.srcObject = stream
    await video.play()
    return video
  }

  async function tearDownCameraFeed() {
    stream?.getTracks().forEach(track => track.stop())
    stream = undefined
  }

  return {
    setUpCameraFeed,
    tearDownCameraFeed,
    hasPermission,
  }
}
