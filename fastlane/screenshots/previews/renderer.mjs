export function getLayout(preview) {
  const maxDeviceHeight = preview.height * 0.8
  let deviceWidth = preview.width * preview.deviceWidth
  let deviceHeight = deviceWidth / preview.sourceAspect
  if (deviceHeight > maxDeviceHeight) {
    deviceHeight = maxDeviceHeight
    deviceWidth = deviceHeight * preview.sourceAspect
  }

  const deviceY = preview.height - deviceHeight - preview.height * 0.03
  return {
    title: {
      y: preview.height * 0.075,
      fontSize: Math.round(Math.min(preview.width * 0.075, preview.height * 0.048)),
      lineHeight: 1.08,
    },
    device: {
      x: (preview.width - deviceWidth) / 2,
      y: deviceY,
      width: deviceWidth,
      height: deviceHeight,
      radius: deviceWidth * 0.105,
      rim: Math.max(12, preview.width * 0.012),
    },
  }
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath()
  context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2))
}

function drawBackground(context, preview, background) {
  context.drawImage(background, 0, 0, preview.width, preview.height)
}

function drawTitle(context, preview, title) {
  context.save()
  context.fillStyle = '#FFFFFF'
  context.font = `700 ${title.fontSize}px Mulish, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  preview.titleLines.forEach((line, index) => {
    context.fillText(line, preview.width / 2, title.y + index * title.fontSize * title.lineHeight)
  })
  context.restore()
}

export function getImagePlacement(image, viewport, fit = 'cover') {
  const scale = fit === 'contain'
    ? Math.min(viewport.width / image.naturalWidth, viewport.height / image.naturalHeight)
    : Math.max(viewport.width / image.naturalWidth, viewport.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  return {
    x: viewport.x + (viewport.width - width) / 2,
    y: viewport.y + (viewport.height - height) / 2,
    width,
    height,
  }
}

function drawDevice(context, image, device, imageFit) {
  context.save()
  context.shadowColor = 'rgba(5, 39, 89, 0.2)'
  context.shadowBlur = device.rim * 1.2
  context.shadowOffsetY = device.rim * 0.6
  roundedRect(context, device.x, device.y, device.width, device.height, device.radius)
  context.fillStyle = '#078DCB'
  context.fill()
  context.restore()

  const inset = device.rim
  const x = device.x + inset
  const y = device.y + inset
  const width = device.width - inset * 2
  const height = device.height - inset * 2
  const radius = Math.max(0, device.radius - inset * 0.55)

  context.save()
  roundedRect(context, x, y, width, height, radius)
  context.clip()
  context.fillStyle = '#FFFFFF'
  context.fillRect(x, y, width, height)

  const placement = getImagePlacement(image, { x, y, width, height }, imageFit)
  context.drawImage(image, placement.x, placement.y, placement.width, placement.height)
  context.restore()
}

export function renderPreview(canvas, preview, image, background) {
  canvas.width = preview.width
  canvas.height = preview.height
  const context = canvas.getContext('2d')
  const layout = getLayout(preview)
  drawBackground(context, preview, background)
  drawTitle(context, preview, layout.title)
  drawDevice(context, image, layout.device, preview.imageFit)
}
