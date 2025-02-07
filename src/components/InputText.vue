<script setup lang="ts">
const model = defineModel<string>()
</script>

<template>
  <input v-model="model" class="nq-input-box">
</template>

<style scoped>
.nq-input-box {
  --nq-blue: 5 130 202;
  --nq-orange: 252 135 2;
  --nq-neutral: 31 35 72;
  --nq-neutral-500: 210 211 218;
  --nq-neutral-700: 143 145 164;

  font-size: 1em;
  line-height: 1.5;
  padding: 0.28125em 0.875em;
  height: max-content;
  min-width: min(8em, 220px);

  border-radius: 0.125em;
  width: 100%;
  background-color: transparent;
  transition:
    colors 0.2s var(--nq-ease),
    box-shadow 0.1s var(--nq-ease);
  outline: 0;

  --ring-color: rgba(var(--nq-neutral-500));
  --color: rgb(var(--nq-neutral));
  --placeholder-color: rgb(var(--nq-neutral-700));

  box-shadow: 0 0 0 1.5px var(--ring-color);
  color: var(--color);

  &::placeholder {
    color: var(--placeholder-color);
  }

  &:not(.nq-invalid, :user-invalid):where(:hover, :focus, :focus-within) {
    --color: rgb(var(--nq-blue));
    --ring-color: rgba(var(--nq-blue) / 0.3);

    &::placeholder {
      --placeholder-color: rgb(var(--nq-blue) / 0.6);
    }

    &:focus:valid,
    &:focus-within:valid {
      --ring-color: rgba(var(--nq-blue));
    }
  }

  &:where(.nq-invalid, :user-invalid) {
    --color: rgb(var(--nq-orange));
    --ring-color: rgba(var(--nq-orange) / 0.4);

    &::placeholder {
      --placeholder-color: rgb(var(--nq-orange) / 0.7);
    }

    &:hover,
    &:focus,
    &:focus-within {
      --ring-color: rgba(var(--nq-orange));
    }
  }

  &:where(:hover, :focus-visible, :focus-within) {
    outline: 1.5px solid rgba(var(--ring-color));
  }

  &:where(textarea, :has(textarea)) {
    --padding: 0.25em;
    min-height: calc(3lh + 2 * var(--padding));
    max-height: calc(5lh + 2 * var(--padding));
    field-sizing: content;
    padding: var(--padding) calc(var(--padding) + ((1lh - 1ex) / 2));
  }
}
</style>
