<template>
  <svg width="310" height="196" viewBox="0 0 310 196" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#naka-card-a)">
      <rect width="310" height="195.9" rx="13.6" fill="#1473AA"/>
      <g filter="url(#naka-card-b)">
        <rect x=".2" y="-.3" width="309.8" height="198.3" rx="9.9" fill="#000"/>
        <rect x=".2" y="-.3" width="309.8" height="198.3" rx="9.9" fill="#004369"/>
      </g>
      <mask id="naka-card-c" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="-44" y="-157" width="478" height="507">
        <path d="M85.8-54.5-43.8 23.9l179.6 325.7 64.9-39.2L27.4-3.8l277 251.5L434 169.4 254.4-156.4l-64.8 39.2L362.8 197 85.8-54.5Z" fill="#0582CA"/>
      </mask>
      <g mask="url(#naka-card-c)">
        <path fill="#1077CE" d="m-64.8 3.8 298.2-180.2L413 149.3 114.8 329.6z"/>
      </g>
      <path d="M278 20.4h-8.9V41h4.5V21.2l7 19.7h9V20.4H285v19.8l-7-19.8Z" fill="#F8F8F8"/>
    </g>
    <defs>
      <clipPath id="naka-card-a">
        <rect width="310" height="195.9" rx="13.6" fill="#fff"/>
      </clipPath>
      <filter id="naka-card-b" x="-26.2" y="-26.7" width="362.6" height="254.8" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feFlood flood-opacity="0" result="BackgroundImageFix"/>
        <feGaussianBlur in="BackgroundImageFix" stdDeviation="13.2"/>
        <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_225_551"/>
        <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
        <feOffset dy="11.3"/>
        <feGaussianBlur stdDeviation="9.4"/>
        <feComposite in2="hardAlpha" operator="out"/>
        <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"/>
        <feBlend in2="effect1_backgroundBlur_225_551" result="effect2_dropShadow_225_551"/>
        <feBlend in="SourceGraphic" in2="effect2_dropShadow_225_551" result="shape"/>
      </filter>
    </defs>
  </svg>
</template>
