import { useEffect } from 'react'

interface Disposable {
  dispose: () => void
}

const owners = new WeakMap<Disposable, { count: number }>()

/**
 * Own resources supplied to R3F as props or primitives: R3F only disposes its declarative
 * children. List owned textures explicitly; a material's maps may belong to a shared cache.
 */
export function useOwnedResources(...resources: (Disposable | null | undefined)[]) {
  // Refresh ownership on each commit so callers can pass changing lists without depending on
  // an array identity. Cleanup is deferred: StrictMode's cleanup/setup replay, or another
  // committed owner retaining the same resource, cancels disposal before the microtask runs.
  useEffect(() => {
    const owned = new Set(resources.filter((resource): resource is Disposable => !!resource))
    for (const resource of owned) {
      const entry = owners.get(resource) ?? { count: 0 }
      entry.count++
      owners.set(resource, entry)
    }
    return () => {
      for (const resource of owned) {
        const entry = owners.get(resource)!
        if (--entry.count !== 0) continue
        queueMicrotask(() => {
          if (entry.count !== 0 || owners.get(resource) !== entry) return
          owners.delete(resource)
          resource.dispose()
        })
      }
    }
  })
}
