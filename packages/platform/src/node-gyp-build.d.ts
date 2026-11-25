declare module 'node-gyp-build' {
  /** Loads a native addon from the package root. The layer-shell tracker only
   *  needs the X11 hook surface declared locally in its caller. */
  export default function nodeGypBuild(root: string): unknown
}
