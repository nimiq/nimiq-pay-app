<template>
  <div class="spinner">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12">
      <g fill="none">
        <g
          stroke="currentColor" stroke-linecap="round" stroke-width="1.667"
          clipPath="url(#nimiq-spinner-j5f26q3rzrn45r1cmikl9)"
        >
          <path d="M6 1C8.7625 1 11 3.2375 11 6" />
          <path
            d="M3.03809 2C1.80402 2.90374 1 4.36219 1 6.01385C1 8.7687 3.2313 11 5.98615 11C7.63781 11 9.09626 10.196 10 8.96191"
            opacity=".3"
          />
        </g>
        <defs>
          <clipPath id="nimiq-spinner-j5f26q3rzrn45r1cmikl9">
            <rect width="12" height="12" fill="#fff" />
          </clipPath>
        </defs>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
