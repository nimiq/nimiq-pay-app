import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import changelogData from '@/data/changelog.json'
import { getBundleVersion } from '@/lib/app-version'
import { useApp } from '@/stores/app'

export interface ChangelogHighlight {
  title: string
  description: string
  howTo?: string
}

export interface ChangelogEntry {
  version: string
  date: string
  highlights: ChangelogHighlight[]
}

// Generated at release time by scripts/generate-changelog.mjs, newest-first.
// Static import, so latest/previous are plain constants, not computed.
const entries = changelogData as ChangelogEntry[]
const latest = entries[0] as ChangelogEntry | undefined
const previous = entries.slice(1)

// Auto-hide the "What's New" card after this many appearances for a given version.
const MAX_CARD_SHOWS = 3

// Running version, resolved once and shared across callers. OTA bundles have their own
// changelog entries, so this is the bundle version, not the native one.
const currentVersion = ref('')
async function resolveVersion() {
  if (!currentVersion.value)
    currentVersion.value = await getBundleVersion()
  return currentVersion.value
}

export function useChangelog() {
  const { lastSeenChangelogVersion, changelogCardVersion, changelogCardShownCount } = storeToRefs(useApp())

  // Only prompt when the installed version actually has a changelog entry the user hasn't seen.
  const hasUnseenChangelog = computed(() =>
    entries.some(e => e.version === currentVersion.value) && lastSeenChangelogVersion.value !== currentVersion.value)

  // True once the card has been shown MAX_CARD_SHOWS times for the installed version.
  const changelogCardExhausted = computed(() =>
    changelogCardVersion.value === currentVersion.value && changelogCardShownCount.value >= MAX_CARD_SHOWS)

  // Count one appearance of the card, resetting when the installed version changes.
  function recordChangelogCardShown() {
    if (changelogCardVersion.value !== currentVersion.value) {
      changelogCardVersion.value = currentVersion.value
      changelogCardShownCount.value = 0
    }
    changelogCardShownCount.value += 1
  }

  function markChangelogSeen() {
    if (currentVersion.value)
      lastSeenChangelogVersion.value = currentVersion.value
  }

  return {
    latest,
    previous,
    currentVersion,
    hasUnseenChangelog,
    changelogCardExhausted,
    recordChangelogCardShown,
    markChangelogSeen,
    resolveVersion,
  }
}
