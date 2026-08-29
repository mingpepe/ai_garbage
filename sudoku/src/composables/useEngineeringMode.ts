import { ref, onMounted, onUnmounted } from 'vue'

const SECRET_SEQUENCE = 'sc1107'

export function useEngineeringMode() {
  const engineeringMode = ref(false)
  let buffer = ''

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (engineeringMode.value) engineeringMode.value = false
      buffer = ''
      return
    }

    if (e.key.length === 1) {
      buffer = (buffer + e.key).slice(-SECRET_SEQUENCE.length)
      if (buffer === SECRET_SEQUENCE) {
        engineeringMode.value = true
        buffer = ''
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

  function exitEngineeringMode() {
    engineeringMode.value = false
    buffer = ''
  }

  return { engineeringMode, exitEngineeringMode }
}
