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

const entries = changelogData as ChangelogEntry[]
const latest = entries[0] as ChangelogEntry | undefined
const previous = entries.slice(1)

const MAX_CARD_SHOWS = 3

const currentVersion = ref('')
async function resolveVersion() {
  if (!currentVersion.value)
    currentVersion.value = await getBundleVersion()
  return currentVersion.value
}

export function useChangelog() {
  const { lastSeenChangelogVersion, changelogCardVersion, changelogCardShownCount } = storeToRefs(useApp())

  const hasUnseenChangelog = computed(() =>
    entries.some(e => e.version === currentVersion.value) && lastSeenChangelogVersion.value !== currentVersion.value)

  const changelogCardExhausted = computed(() =>
    changelogCardVersion.value === currentVersion.value && changelogCardShownCount.value >= MAX_CARD_SHOWS)

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
