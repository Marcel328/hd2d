// Keyboard state polled from the render loop. Presses are edge-triggered and consumable so
// a single key press never both closes a dialogue and re-opens it on the next frame.

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'run'
  | 'interact'
  | 'toggleTime'
  | 'menu'
  | 'dev'
  | 'devPause'
  | 'devStep'
  | 'devFreeCam'
  | 'mute'

const BINDINGS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Space', 'Enter', 'KeyZ'],
  toggleTime: ['KeyN'],
  menu: ['Escape'],
  dev: ['Backquote', 'F2'],
  devPause: ['KeyP'],
  devStep: ['Period'],
  devFreeCam: ['KeyF'],
  mute: ['KeyM'],
}

const held = new Set<string>()
const pressed = new Set<string>()
/** Order in which direction keys went down; the most recent wins for facing. */
const dirOrder: Action[] = []

const isDirection = (a: Action) => a === 'up' || a === 'down' || a === 'left' || a === 'right'

function actionsFor(code: string): Action[] {
  return (Object.keys(BINDINGS) as Action[]).filter((a) => BINDINGS[a].includes(code))
}

function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  const type = tag === 'INPUT' ? (target as HTMLInputElement).type : ''
  // Only text entry keeps the keyboard; checkboxes, sliders and buttons hand it back to the game.
  const textEntry = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(type))
  if (textEntry) return
  const actions = actionsFor(e.code)
  if (actions.length === 0) return
  const controlKey = e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow')
  if (target && (tag === 'BUTTON' || tag === 'INPUT') && controlKey) {
    // Keyboard-focused controls keep their keys (accessibility); a control that merely kept
    // focus after a mouse click gives them back to the game instead of re-triggering.
    if (target.matches(':focus-visible')) return
    e.preventDefault()
    target.blur()
  }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
  if (!e.repeat) pressed.add(e.code)
  held.add(e.code)
  for (const a of actions) {
    if (!isDirection(a)) continue
    const i = dirOrder.indexOf(a)
    if (i >= 0) dirOrder.splice(i, 1)
    dirOrder.push(a)
  }
}

function onKeyUp(e: KeyboardEvent) {
  held.delete(e.code)
  for (const a of actionsFor(e.code)) {
    if (!isDirection(a) || isHeld(a)) continue
    const i = dirOrder.indexOf(a)
    if (i >= 0) dirOrder.splice(i, 1)
  }
}

function clear() {
  held.clear()
  pressed.clear()
  dirOrder.length = 0
}

let attached = false
export function attachInput() {
  if (attached) return
  attached = true
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clear)
}

export function isHeld(a: Action): boolean {
  return BINDINGS[a].some((c) => held.has(c))
}

/** True once per physical press. */
export function consumePress(a: Action): boolean {
  let hit = false
  for (const c of BINDINGS[a]) if (pressed.delete(c)) hit = true
  return hit
}

/** Drop presses nobody handled this frame so they don't fire later. */
export function endFrame() {
  pressed.clear()
}

export function latestDirection(): Action | undefined {
  return dirOrder[dirOrder.length - 1]
}

/** Analog stick and buttons from the on-screen touch controls. */
export const virtualPad = { x: 0, y: 0, run: false }

/** A press from an on-screen button, consumed like a key press. */
export function virtualPress(a: Action) {
  pressed.add(BINDINGS[a][0])
}
