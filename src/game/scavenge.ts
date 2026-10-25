// Searching a scavenging spot: the first search hands over its loot (bag, toasts, sound) and
// returns the lines to show; later searches only say it is empty.
import { announceLoot, describeLoot, useInventory } from './inventory'
import { sound } from './audio'
import type { ScavengeSpot } from './world/interiors'

export function searchSpot(spot: ScavengeSpot): string[] {
  const loot = useInventory.getState().loot(spot.id)
  if (!loot) return [spot.empty]
  announceLoot(loot)
  sound.pickup()
  return [spot.intro, `Found ${describeLoot(loot)}!`, ...(spot.outro ? [spot.outro] : [])]
}
