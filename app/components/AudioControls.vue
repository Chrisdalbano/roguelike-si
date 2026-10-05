<script setup lang="ts">
// Sound / Music toggles and one master volume. Shared state via useAudio().
const { settings, toggle, setVolume } = useAudio()
</script>

<template>
  <span class="audio" role="group" aria-label="Audio">
    <button type="button" class="quiet" :aria-pressed="settings.sfx" @click="toggle('sfx')">SFX {{ settings.sfx ? 'on' : 'off' }}</button>
    <button type="button" class="quiet" :aria-pressed="settings.music" @click="toggle('music')">Music {{ settings.music ? 'on' : 'off' }}</button>
    <label class="vol">
      <span>Vol</span>
      <input type="range" min="0" max="1" step="0.05" :value="settings.volume" aria-label="Master volume"
        @input="setVolume(Number(($event.target as HTMLInputElement).value))">
    </label>
  </span>
</template>

<style scoped>
.audio { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; font-family: var(--font-mono); }
button { font: inherit; font-size: 12px; color: var(--fg-muted); background: transparent; border: 1px solid var(--border); border-radius: 0; padding: 6px 10px; cursor: pointer; }
button:hover { border-color: var(--border-strong); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-lead); outline-offset: 1px; }
.vol { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--fg-muted); padding: 0 6px; letter-spacing: .08em; text-transform: uppercase; }
input { width: 76px; accent-color: var(--accent-lead); }
</style>
