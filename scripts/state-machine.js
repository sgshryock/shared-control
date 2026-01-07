/**
 * SharedControl Movement State Machine
 * Manages the tap-to-move workflow states
 */

import * as utils from './utils.js';
import { debugLog } from './utils.js';

export const States = {
  IDLE: 'IDLE',
  AWAITING_DESTINATION: 'AWAITING_DESTINATION',
  PREVIEWING_PATH: 'PREVIEWING_PATH',
  EXECUTING_MOVEMENT: 'EXECUTING_MOVEMENT',
  ERROR: 'ERROR'
};

export class MovementStateMachine {
  constructor() {
    this.currentState = States.IDLE;
    this.selectedToken = null;
    this.previewDestination = null;
    this.lastTapPosition = null;
    this.lastTapTime = 0;
    this.errorTimeout = null;
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if currently in preview mode
   */
  isInPreviewMode() {
    return this.currentState === States.PREVIEWING_PATH;
  }

  /**
   * Select a token and transition to AWAITING_DESTINATION
   * @param {Token} token - The token to select
   * @param {RulerPreview} rulerPreview - The ruler preview handler for visual feedback
   * @returns {Boolean} - True if selection successful
   */
  async selectToken(token, rulerPreview) {
    // Validate permissions
    if (!utils.canMoveToken(token)) {
      ui.notifications.warn(game.i18n.localize('shared-control.notifications.noPermission'));
      return false;
    }

    // Check if token is locked by another user (using token flag for sync)
    const lockData = token.document.getFlag('shared-control', 'lockedBy');
    if (lockData && lockData.userId !== game.user.id) {
      // GM can always override locks
      if (game.user.isGM) {
        debugLog('GM overriding lock');
        ui.notifications.info('Overriding lock as GM');
      } else {
        // Check if lock is stale (older than 5 minutes)
        const lockAge = Date.now() - (lockData.timestamp || 0);
        if (lockAge < 300000) { // 5 minutes
          const lockingUser = game.users.get(lockData.userId);
          const userName = lockingUser?.name ?? 'another user';
          debugLog('Token locked by', userName);
          ui.notifications.info(
            game.i18n.format('shared-control.notifications.tokenLocked', { user: userName })
          );
          return false;
        }
        // Lock is stale, allow override
        debugLog('Stale lock detected, overriding');
      }
    }

    // Control the token
    token.control({ releaseOthers: true });

    // Lock the token using document flag (syncs automatically to all clients)
    await token.document.setFlag('shared-control', 'lockedBy', {
      userId: game.user.id,
      timestamp: Date.now()
    });
    debugLog('Token locked via flag');

    // Show visual highlight
    if (rulerPreview) {
      rulerPreview.showSelectionHighlight(token);
    }

    this.selectedToken = token;
    this.currentState = States.AWAITING_DESTINATION;
    this.previewDestination = null;

    debugLog('Token selected, awaiting destination');
    return true;
  }

  /**
   * Preview movement to a destination
   * @param {Object} destination - Destination position {x, y}
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   * @returns {Boolean} - True if preview successful
   */
  async previewMovement(destination, rulerPreview) {
    debugLog('previewMovement called', {
      currentState: this.currentState,
      destination,
      selectedToken: this.selectedToken?.name
    });

    if (this.currentState !== States.AWAITING_DESTINATION &&
        this.currentState !== States.PREVIEWING_PATH) {
      debugLog('Invalid state for preview movement');
      return false;
    }

    if (!this.selectedToken) {
      debugLog('No token selected');
      return false;
    }

    // Allow path plotting to any location, including areas hidden by fog of war
    debugLog('Path plotting allowed to any destination');

    // Snap destination to grid for consistent comparison
    const snappedDestination = utils.getGridPosition(destination.x, destination.y);

    // Update preview destination
    this.previewDestination = destination;
    this.lastTapPosition = snappedDestination;  // Store snapped position for comparison
    this.lastTapTime = Date.now();

    // Transition to previewing state
    this.currentState = States.PREVIEWING_PATH;

    debugLog('Calling rulerPreview.showPreview');

    try {
      // Show ruler preview via simulated drag
      await rulerPreview.showPreview(this.selectedToken, destination);
      debugLog('Previewing movement to', destination);
      return true;
    } catch (error) {
      console.error('SharedControl: Error showing preview:', error);
      return false;
    }
  }

  /**
   * Confirm and execute the movement
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   * @returns {Boolean} - True if movement executed
   */
  async confirmMovement(rulerPreview) {
    if (this.currentState !== States.PREVIEWING_PATH) {
      debugLog('Invalid state for confirm movement');
      return false;
    }

    if (!this.selectedToken || !this.previewDestination) {
      debugLog('Missing token or destination');
      return false;
    }

    // Transition to executing state
    this.currentState = States.EXECUTING_MOVEMENT;

    try {
      // Execute the movement via ruler preview
      await rulerPreview.confirmMovement();

      // Success - return to idle
      this.reset(rulerPreview);

      // Deselect all tokens after movement completes
      canvas.tokens.releaseAll();

      debugLog('Movement executed successfully');
      return true;

    } catch (error) {
      console.error('SharedControl: Error executing movement', error);
      this.handleError('movementBlocked');
      return false;
    }
  }

  /**
   * Cancel the current movement operation
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   */
  cancelMovement(rulerPreview) {
    debugLog('Canceling movement');

    // Clear ruler preview (which also clears notifications)
    if (rulerPreview) {
      rulerPreview.clearPreview();
    }

    // Release token control
    if (this.selectedToken) {
      this.selectedToken.release();
    }

    // Reset to idle
    this.reset(rulerPreview);
  }

  /**
   * Handle an error state
   * @param {String} errorType - Type of error
   */
  handleError(errorType) {
    this.currentState = States.ERROR;

    // Show error notification
    const messageKey = `shared-control.notifications.${errorType}`;
    const message = game.i18n.localize(messageKey);
    ui.notifications.error(message);

    // Clear any existing timeout
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
    }

    // Auto-return to awaiting destination after timeout
    this.errorTimeout = setTimeout(() => {
      if (this.currentState === States.ERROR) {
        this.currentState = States.AWAITING_DESTINATION;
        this.previewDestination = null;
        debugLog('Recovered from error state');
      }
    }, 2000);
  }

  /**
   * Check if a tap is at the same location as the last tap
   * No timeout - user can cancel by tapping the token instead
   * @param {Object} position - Position to check {x, y}
   * @returns {Boolean} - True if same location
   */
  isSameTapLocation(position) {
    if (!this.lastTapPosition) return false;

    // No timeout check - just verify it's the same location
    // User can cancel by tapping the selected token
    return utils.isSameLocation(position, this.lastTapPosition);
  }

  /**
   * Reset the state machine to IDLE
   * @param {RulerPreview} rulerPreview - The ruler preview handler for clearing visual feedback
   */
  async reset(rulerPreview) {
    // Clear visual highlight
    if (rulerPreview) {
      rulerPreview.clearSelectionHighlight();
    }

    // Unlock the token by clearing the flag (only if we still own the lock)
    if (this.selectedToken) {
      try {
        const lockData = this.selectedToken.document.getFlag('shared-control', 'lockedBy');
        // Only clear if we own the lock (don't clear someone else's lock)
        if (lockData?.userId === game.user.id) {
          await this.selectedToken.document.unsetFlag('shared-control', 'lockedBy');
          debugLog('Token unlocked via flag');
        } else {
          debugLog('Lock owned by another user, not clearing');
        }
      } catch (e) {
        console.warn('SharedControl: Could not clear lock flag', e);
      }
    }

    this.currentState = States.IDLE;
    this.selectedToken = null;
    this.previewDestination = null;
    this.lastTapPosition = null;
    this.lastTapTime = 0;

    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }

    debugLog('State machine reset to IDLE');
  }

  /**
   * Clean up when module is disabled
   * @param {RulerPreview} rulerPreview - The ruler preview handler
   */
  destroy(rulerPreview) {
    this.reset(rulerPreview);
  }
}
