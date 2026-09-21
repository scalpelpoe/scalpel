// Exercise the patched tracker against an X server (Xvfb or a desktop).
// Linker wrappers make startup and a continuously busy event queue repeatable.
#include <assert.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <xcb/xcb.h>
#include "overlay_window.h"

static uv_thread_t main_thread;
static atomic_int disconnects;
static atomic_bool flood_events;
static atomic_int events_seen;

xcb_connection_t* __real_xcb_connect(const char*, int*);
void __real_xcb_disconnect(xcb_connection_t*);
xcb_generic_event_t* __real_xcb_poll_for_event(xcb_connection_t*);

xcb_connection_t* __wrap_xcb_connect(const char* display, int* screen) {
  // Make stop happen before the worker has opened its connection.
  usleep(10000);
  return __real_xcb_connect(display, screen);
}

void __wrap_xcb_disconnect(xcb_connection_t* connection) {
  uv_thread_t current = uv_thread_self();
  assert(!uv_thread_equal(&current, &main_thread));
  assert(connection != NULL);
  atomic_fetch_add(&disconnects, 1);
  __real_xcb_disconnect(connection);
}

xcb_generic_event_t* __wrap_xcb_poll_for_event(xcb_connection_t* connection) {
  if (atomic_load(&flood_events)) {
    atomic_fetch_add(&events_seen, 1);
    // An ignored event keeps the queue busy without modifying the desktop.
    return calloc(1, sizeof(xcb_generic_event_t));
  }
  return __real_xcb_poll_for_event(connection);
}

void ow_emit_event(struct ow_event* event) { (void)event; }

int main(void) {
  main_thread = uv_thread_self();
  ow_stop_hook(); // Imported but never started.
  if (!getenv("DISPLAY") || !*getenv("DISPLAY")) {
    ow_start_hook(NULL, 0, NULL);
    ow_stop_hook();
    ow_stop_hook();
    assert(atomic_load(&disconnects) == 1);
    puts("Native shutdown passed: failed X connection.");
    return 0;
  }
  for (int i = 0; i < 100; ++i) {
    ow_start_hook(NULL, 0, NULL);
    ow_stop_hook();
    ow_stop_hook(); // Explicit stop followed by environment cleanup.
    assert(atomic_load(&disconnects) == i + 1);
  }

  ow_start_hook(NULL, 0, NULL);
  usleep(100000); // Worker waiting for X events on an idle desktop.
  ow_stop_hook();
  assert(atomic_load(&disconnects) == 101);

  atomic_store(&flood_events, true);
  ow_start_hook(NULL, 0, NULL);
  while (atomic_load(&events_seen) < 1000) usleep(1000);
  ow_stop_hook();
  assert(atomic_load(&disconnects) == 102);
  puts("Native shutdown passed: immediate stop, idle stop, repeated cleanup, busy queue.");
  return 0;
}
