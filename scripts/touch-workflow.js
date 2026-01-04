/**
 * SharedControl Touch Workflow Handler
 * Manages touch event interception and tap-to-move workflow
 */

import { States } from './state-machine.js';
import * as utils from './utils.js';
import { debugLog } from './utils.js';
import { getLibWrapper } from './compat.js';

export class TouchWorkflowHandler {
  constructor(stateMachine, rulerPreview) {
    this.stateMachine = stateMachine;
    this.rulerPreview = rulerPreview;
    this.touchOnlyMode = false;
    this.libWrapper = null;
    this.hooks = [];
  }

  /**
   * Initialize the touch workflow handler
   */
  initialize() {
    // Get libWrapper or shim
    this.libWrapper = getLibWrapper();

    // Update touch-only mode from settings
    this.touchOnlyMode = game.settings.get('shared-control', 'touchOnlyMode');

    // Register hooks
    this.registerHooks();

    // Note: Token methods are wrapped early in shared-control.js init hook
    // to ensure wrapping happens before tokens are created on canvas

    debugLog('Touch workflow initialized');
  }

  /**
   * Register Foundry hooks
   */
  registerHooks() {
    // Token selection hook
    const controlHook = Hooks.on('controlToken', (token, controlled) => {
      if (!this.isEnabled()) return;

      if (controlled && this.stateMachine.getState() === States.IDLE) {
        // Token was selected - could be from our tap or from other input
        debugLog('Token controlled', token.name);
      }
    });
    this.hooks.push({ name: 'controlToken', id: controlHook });

    // Prevent accidental updates during preview
    const preUpdateHook = Hooks.on('preUpdateToken', (tokenDoc, changes, options, userId) => {
      if (!this.isEnabled()) return true;

      // Check if this token is in preview mode
      if (this.stateMachine.selectedToken?.id === tokenDoc.id &&
          this.stateMachine.isInPreviewMode()) {

        // Block updates from other sources during preview
        if (userId !== game.user.id) {
          return false;
        }
      }

      return true;
    });
    this.hooks.push({ name: 'preUpdateToken', id: preUpdateHook });

    // Track movement completion
    const updateHook = Hooks.on('updateToken', (tokenDoc, changes, options, userId) => {
      if (!this.isEnabled()) return;

      if (changes.x !== undefined || changes.y !== undefined) {
        // Movement completed - unlock token
        this.stateMachine.unlockToken(tokenDoc.id);
      }
    });
    this.hooks.push({ name: 'updateToken', id: updateHook });

    // Reset on scene change
    const canvasReadyHook = Hooks.on('canvasReady', () => {
      debugLog('Canvas ready, resetting state');
      this.stateMachine.reset(this.rulerPreview);
      this.rulerPreview.clearPreview();
    });
    this.hooks.push({ name: 'canvasReady', id: canvasReadyHook });
  }

  // Note: wrapTokenMethods has been moved to shared-control.js init hook
  // to ensure wrapping happens before tokens are created


  /**
   * Handle canvas tap (for destination selection)
   * @param {Event} event - Tap event
   */
  async handleCanvasTap(event) {
    if (!this.isEnabled()) return;

    const currentState = this.stateMachine.getState();

    // Only handle canvas taps in AWAITING_DESTINATION or PREVIEWING_PATH states
    if (currentState !== States.AWAITING_DESTINATION &&
        currentState !== States.PREVIEWING_PATH) {
      return;
    }

    // Get tap position in canvas coordinates
    const position = utils.screenToCanvas(event.clientX, event.clientY);

    // Snap position to grid for consistent comparison
    const snappedPosition = utils.getGridPosition(position.x, position.y);

    // Check if this is a confirmation tap (same location as preview)
    if (currentState === States.PREVIEWING_PATH &&
        this.stateMachine.isSameTapLocation(snappedPosition)) {

      // Confirm the movement
      debugLog('Confirmation tap detected');
      await this.stateMachine.confirmMovement(this.rulerPreview);
      return;
    }

    // Otherwise, preview movement to this location
    debugLog('New destination tap detected');
    await this.stateMachine.previewMovement(position, this.rulerPreview);
  }

  /**
   * Attach canvas tap listener
   */
  attachCanvasListener() {
    if (canvas.stage) {
      canvas.stage.on('pointerdown', this.onCanvasPointerDown.bind(this));
      debugLog('Canvas listener attached');
    }
  }

  /**
   * Handle canvas pointer down event
   * @param {Event} event - Pointer event
   */
  onCanvasPointerDown(event) {
    // Handle both mouse and touch events when module is enabled
    if (!this.isEnabled()) return;

    // Prevent scroll/zoom in touch-only mode for touch events
    if (this.touchOnlyMode && event.pointerType === 'touch') {
      event.preventDefault();
    }

    // Handle multi-touch (cancel on multi-touch)
    if (event.touches && event.touches.length > 1) {
      debugLog('Multi-touch detected, canceling');
      this.stateMachine.cancelMovement(this.rulerPreview);
      return;
    }

    // Check if tap is on a token (handled separately) or on canvas
    const target = event.target;
    const isToken = target?.document?.documentName === 'Token';

    if (!isToken) {
      // Canvas tap - handle destination selection (works for both mouse and touch)
      this.handleCanvasTap(event);
    }
  }

  /**
   * Update touch-only mode
   * @param {Boolean} enabled - Whether touch-only mode is enabled
   */
  updateTouchOnlyMode(enabled) {
    this.touchOnlyMode = enabled;

    if (enabled) {
      debugLog('Touch-only mode enabled');
      // Hide mouse cursor for this client
      document.body.style.cursor = 'none';
    } else {
      debugLog('Touch-only mode disabled');
      // Restore mouse cursor
      document.body.style.cursor = 'default';
    }
  }

  /**
   * Check if module is enabled
   */
  isEnabled() {
    return game.settings.get('shared-control', 'enabled');
  }

  /**
   * Clean up when module is disabled
   */
  destroy() {
    // Unregister all hooks
    for (const hook of this.hooks) {
      Hooks.off(hook.name, hook.id);
    }
    this.hooks = [];

    // Unregister libWrapper wraps
    if (this.libWrapper) {
      this.libWrapper.unregisterAll?.('shared-control');
    }

    // Restore cursor
    document.body.style.cursor = 'default';

    debugLog('Touch workflow destroyed');
  }
}
