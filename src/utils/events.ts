/**
 * @module utils/events
 * ------------------------------------------------------------------
 *  A tiny typed event-emitter that the editor, toolbar, and plug-ins
 *  all share.  No external dependencies.
 * ------------------------------------------------------------------
 */

import { EditorEventName, EditorEventHandler } from "../types";

export class EventEmitter {
  /**
   * Map of event names → Set of listener functions.
   * Using a Set guarantees no duplicate listeners.
   */
  private listeners: Map<EditorEventName, Set<EditorEventHandler>> = new Map();

  /**
   * Register a handler for an event.
   * @param event  – event name (e.g. `"change"`)
   * @param handler – callback to invoke
   */
  on(event: EditorEventName, handler: EditorEventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * Remove a previously registered handler.
   */
  off(event: EditorEventName, handler: EditorEventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  /**
   * Emit an event – every registered handler is invoked synchronously
   * in insertion order.
   */
  emit(event: EditorEventName, data?: unknown): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`[WysiwygEditor] Error in "${event}" handler:`, err);
      }
    });
  }

  /**
   * Remove *all* listeners (used during `destroy()`).
   */
  removeAll(): void {
    this.listeners.clear();
  }
}