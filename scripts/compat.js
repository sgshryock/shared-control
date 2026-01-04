/**
 * SharedControl Compatibility Layer
 * Checks for and coordinates with other modules
 */

import { debugLog } from './utils.js';

/**
 * Check for module compatibility and conflicts
 */
export function checkCompatibility() {
  const warnings = [];
  const info = [];

  // Check for libWrapper
  const libWrapper = game.modules.get('lib-wrapper');
  if (!libWrapper?.active) {
    const message = game.i18n.localize('shared-control.notifications.libWrapperMissing');
    ui.notifications.warn(message);
    warnings.push('libWrapper not found - some features may conflict with other modules');
  }

  // Check for TouchVTT
  const touchVTT = game.modules.get('touch-vtt');
  if (touchVTT?.active) {
    const message = game.i18n.localize('shared-control.notifications.touchVTTDetected');
    ui.notifications.info(message);
    info.push('TouchVTT detected - some touch features may overlap');
    debugLog('TouchVTT module is active, coordinating behavior');
  }

  // Check for Drag Ruler
  const dragRuler = game.modules.get('drag-ruler');
  if (dragRuler?.active) {
    info.push('Drag Ruler detected - should be compatible via native v13 ruler system');
    debugLog('Drag Ruler module is active');
  }

  return {
    warnings,
    info,
    hasLibWrapper: libWrapper?.active ?? false,
    hasTouchVTT: touchVTT?.active ?? false,
    hasDragRuler: dragRuler?.active ?? false
  };
}

/**
 * libWrapper shim for when libWrapper is not available
 * Provides basic wrapping functionality but with a warning
 */
export class LibWrapperShim {
  constructor() {
    this.wrappers = new Map();
  }

  register(moduleId, target, wrapper, type) {
    debugLog(`Using libWrapper shim for ${target} - install libWrapper for better compatibility`);

    // Store the original function
    const parts = target.split('.');
    let obj = window;

    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
      if (!obj) {
        console.error(`SharedControl: Could not find object for ${target}`);
        return;
      }
    }

    const funcName = parts[parts.length - 1];
    const original = obj[funcName];

    if (typeof original !== 'function') {
      console.error(`SharedControl: ${target} is not a function`);
      return;
    }

    // Store the wrapper
    this.wrappers.set(target, { original, wrapper, type });

    // Apply the wrapper based on type
    if (type === 'MIXED' || type === 'WRAPPER') {
      obj[funcName] = function(...args) {
        return wrapper.call(this, original.bind(this), ...args);
      };
    } else if (type === 'OVERRIDE') {
      obj[funcName] = wrapper;
    }
  }

  unregister(moduleId, target) {
    const wrapper = this.wrappers.get(target);
    if (!wrapper) return;

    // Restore original function
    const parts = target.split('.');
    let obj = window;

    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
    }

    const funcName = parts[parts.length - 1];
    obj[funcName] = wrapper.original;

    this.wrappers.delete(target);
  }

  unregisterAll(moduleId) {
    for (const target of this.wrappers.keys()) {
      this.unregister(moduleId, target);
    }
  }
}

/**
 * Get libWrapper or shim
 * @returns {Object} - libWrapper or shim
 */
export function getLibWrapper() {
  if (window.libWrapper) {
    return window.libWrapper;
  } else {
    debugLog('libWrapper not found, using shim');
    return new LibWrapperShim();
  }
}
