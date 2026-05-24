// Single bundle that satisfies 'react', 'react-dom', 'react-dom/client',
// 'react-dom/server', and 'react/jsx-runtime' for plugins. All five importmap
// entries point at this file so plugins share ONE React instance with createRoot's
// hook dispatcher.
//
// Splitting into separate bundles caused two pitfalls:
//   - Without `external: ['react']`, esbuild inlines a second copy of React
//     into the react-dom/client bundle. Different React instance, hooks fail.
//   - With `external: ['react']`, esbuild's ESM output emits a `__require`
//     stub that throws "Dynamic require of 'react' is not supported" at the
//     CJS-style require call sites inside react-dom/client's bundled source.
// One bundle, one React. Plugin authors externalize all five specifiers in
// their own build so they never duplicate React themselves.
//
// `react-dom/server` is included so plugins can render an iconpark/JSX icon to
// an SVG string at activation time (registerTab only accepts a string; passing
// a ReactNode would force the host to mount the plugin's component inside its
// own React tree and the dispatcher mismatch crashes useContext).
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactDOMServer from 'react-dom/server'

const {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useContext,
  useLayoutEffect,
  useReducer,
  useImperativeHandle,
  useDebugValue,
  useTransition,
  useDeferredValue,
  useId,
  useSyncExternalStore,
  useInsertionEffect,
  Fragment,
  StrictMode,
  Suspense,
  createContext,
  createElement,
  cloneElement,
  isValidElement,
  lazy,
  memo,
  forwardRef,
  startTransition,
  Children,
  Component,
  PureComponent,
  version,
} = React

const { createPortal, flushSync } = ReactDOM
const { createRoot, hydrateRoot } = ReactDOMClient
const { renderToString, renderToStaticMarkup } = ReactDOMServer
const { jsx, jsxs } = JsxRuntime

export {
  Children,
  Component,
  cloneElement,
  createContext,
  createElement,
  // react-dom
  createPortal,
  // react-dom/client
  createRoot,
  Fragment,
  flushSync,
  forwardRef,
  hydrateRoot,
  isValidElement,
  // react/jsx-runtime
  jsx,
  jsxs,
  lazy,
  memo,
  PureComponent,
  renderToStaticMarkup,
  // react-dom/server
  renderToString,
  StrictMode,
  Suspense,
  startTransition,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  // react
  useState,
  useSyncExternalStore,
  useTransition,
  version,
}
export default React
