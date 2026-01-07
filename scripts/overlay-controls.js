/**
 * SharedControl Overlay Controls
 * On-screen buttons for zoom and pan functionality
 */

import { debugLog } from './utils.js';

// Constants
const ZOOM_FACTOR = 1.25;
const PAN_AMOUNT = 100; // Pixels to pan per tick
const PAN_INTERVAL = 50; // Milliseconds between pans
const FADE_DELAY = 5000; // Milliseconds before controls fade

export class OverlayControls {
  constructor() {
    this.container = null;
    this.controlPanel = null;
    this.lockButton = null;
    this.broadcastButton = null;
    this.gmModeButton = null;
    this.blackoutButton = null;
    this.interactionBlocker = null;
    this.blackoutOverlay = null;
    this.panInterval = null;
    this.isVisible = false;
    this.isLocked = false;
    this.isBroadcasting = false;
    this.isGmNormalMode = false;
    this.isBlackout = false;
    this.lockWasActiveBeforeBlackout = false;
    this.fadeTimeout = null;
    this.fadeDelay = FADE_DELAY;
  }

  /**
   * Initialize the overlay controls
   */
  initialize() {
    const showOverlay = game.settings.get('shared-control', 'showOverlayControls');

    if (!showOverlay) {
      debugLog('Overlay controls disabled in settings');
      return;
    }

    this.createOverlay();
    this.attachEventListeners();
    this.show();

    debugLog('Overlay controls initialized');
  }

  /**
   * Create the overlay HTML structure
   */
  createOverlay() {
    // Remove existing overlay if present
    this.destroy();

    const buttonSize = game.settings.get('shared-control', 'overlayButtonSize');

    // Create main container
    this.container = document.createElement('div');
    this.container.id = 'shared-control-overlay';
    this.container.className = 'shared-control-overlay';

    // Create combined controls panel (left side)
    this.controlPanel = document.createElement('div');
    this.controlPanel.className = 'shared-control-panel';
    this.controlPanel.innerHTML = `
      <div class="shared-control-panel-grid">
        <div class="shared-control-panel-row">
          <button class="shared-control-btn" data-action="zoom-in" title="Zoom In">
            <i class="fas fa-plus"></i>
          </button>
          <button class="shared-control-btn" data-action="pan-up" title="Pan Up">
            <i class="fas fa-chevron-up"></i>
          </button>
          <button class="shared-control-btn" data-action="zoom-out" title="Zoom Out">
            <i class="fas fa-minus"></i>
          </button>
        </div>
        <div class="shared-control-panel-row">
          <button class="shared-control-btn" data-action="pan-left" title="Pan Left">
            <i class="fas fa-chevron-left"></i>
          </button>
          <button class="shared-control-btn shared-control-center-btn" data-action="pan-center" title="Center on Token">
            <i class="fas fa-crosshairs"></i>
          </button>
          <button class="shared-control-btn" data-action="pan-right" title="Pan Right">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="shared-control-panel-row">
          <div class="shared-control-spacer"></div>
          <button class="shared-control-btn" data-action="pan-down" title="Pan Down">
            <i class="fas fa-chevron-down"></i>
          </button>
          <div class="shared-control-spacer"></div>
        </div>
      </div>
    `;

    this.container.appendChild(this.controlPanel);

    // Create button container for lock and broadcast
    const buttonRow = document.createElement('div');
    buttonRow.className = 'shared-control-button-row';

    // Create broadcast button (GM only)
    if (game.user.isGM) {
      this.broadcastButton = document.createElement('button');
      this.broadcastButton.className = 'shared-control-btn shared-control-broadcast-btn';
      this.broadcastButton.dataset.action = 'toggle-broadcast';
      this.broadcastButton.title = 'Broadcast View to Players';
      this.broadcastButton.innerHTML = '<i class="fas fa-broadcast-tower"></i>';
      buttonRow.appendChild(this.broadcastButton);

      // Create GM mode toggle button (switches between tap workflow and normal Foundry)
      this.gmModeButton = document.createElement('button');
      this.gmModeButton.className = 'shared-control-btn shared-control-gm-mode-btn';
      this.gmModeButton.dataset.action = 'toggle-gm-mode';
      this.gmModeButton.title = 'Toggle Normal Foundry Mode (drag-and-drop)';
      this.gmModeButton.innerHTML = '<i class="fas fa-hand-pointer"></i>';
      buttonRow.appendChild(this.gmModeButton);
    }

    // Create lock button (only for users with permission)
    if (this.canSeeLockButton()) {
      this.lockButton = document.createElement('button');
      this.lockButton.className = 'shared-control-btn shared-control-lock-btn';
      this.lockButton.dataset.action = 'toggle-lock';
      this.lockButton.title = 'Lock/Unlock Controls';
      this.lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
      buttonRow.appendChild(this.lockButton);
    }

    // Create blackout button (GM only) - hides screen from players
    if (game.user.isGM) {
      this.blackoutButton = document.createElement('button');
      this.blackoutButton.className = 'shared-control-btn shared-control-blackout-btn';
      this.blackoutButton.dataset.action = 'toggle-blackout';
      this.blackoutButton.title = 'Blackout Screen (hide from players)';
      this.blackoutButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
      buttonRow.appendChild(this.blackoutButton);
    }

    // Only add button row if it has buttons
    if (buttonRow.children.length > 0) {
      this.controlPanel.appendChild(buttonRow);
    }

    // Add to DOM
    document.body.appendChild(this.container);

    // Create interaction blocker for non-GM users (blocks all clicks during GM broadcast)
    if (!game.user.isGM) {
      this.interactionBlocker = document.createElement('div');
      this.interactionBlocker.className = 'shared-control-interaction-blocker';
      this.interactionBlocker.innerHTML = '<div class="blocker-message"><i class="fas fa-lock"></i> GM has locked the screen</div>';
      document.body.appendChild(this.interactionBlocker);

      // Create blackout overlay for non-GM users
      this.blackoutOverlay = document.createElement('div');
      this.blackoutOverlay.className = 'shared-control-blackout-overlay';
      this.blackoutOverlay.innerHTML = '<div class="blackout-message"><i class="fas fa-eye-slash"></i> Please wait...</div>';
      document.body.appendChild(this.blackoutOverlay);
    }

    // Apply button size
    this.updateButtonSize(buttonSize);

    // Apply position
    const position = game.settings.get('shared-control', 'overlayPosition');
    this.updatePosition(position);

    // Apply current lock state
    const isLocked = game.settings.get('shared-control', 'controlsLocked');
    this.updateLockState(isLocked);

    // Apply current broadcast state
    const isBroadcasting = game.settings.get('shared-control', 'broadcastMode');
    this.updateBroadcastState(isBroadcasting);

    // Apply current GM mode state
    if (game.user.isGM) {
      const gmNormalMode = game.settings.get('shared-control', 'gmNormalMode');
      this.updateGmModeState(gmNormalMode);
    }

    // Apply current blackout state
    const isBlackout = game.settings.get('shared-control', 'blackoutMode');
    this.updateBlackoutState(isBlackout);

    // Start fade timer
    this.resetFadeTimer();
  }

  /**
   * Check if current user can see the lock button
   * @returns {Boolean}
   */
  canSeeLockButton() {
    const minRole = game.settings.get('shared-control', 'lockButtonRoles');
    return game.user.role >= minRole;
  }

  /**
   * Attach event listeners to buttons
   */
  attachEventListeners() {
    if (!this.container) return;

    // Use pointer events for both touch and mouse support
    const buttons = this.container.querySelectorAll('.shared-control-btn');

    buttons.forEach(btn => {
      const action = btn.dataset.action;

      // Handle pointer down (start of press)
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('active');
        this.handleAction(action, true);
      });

      // Handle pointer up (end of press)
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Don't remove active class for toggle buttons - they manage their own state
        const isToggleAction = action.startsWith('toggle-');
        if (!isToggleAction) {
          btn.classList.remove('active');
        }
        this.handleAction(action, false);
      });

      // Handle pointer leave (finger/mouse moves off button)
      btn.addEventListener('pointerleave', (e) => {
        // Don't remove active class for toggle buttons - they manage their own state
        const isToggleAction = action.startsWith('toggle-');
        if (!isToggleAction) {
          btn.classList.remove('active');
        }
        this.handleAction(action, false);
      });

      // Prevent context menu on long press
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
    });

    // Reset fade timer on any interaction with the panel
    this.container.addEventListener('pointerenter', () => {
      this.showPanel();
      this.resetFadeTimer();
    });

    this.container.addEventListener('pointermove', () => {
      this.showPanel();
      this.resetFadeTimer();
    });
  }

  /**
   * Handle button actions
   * @param {String} action - The action to perform
   * @param {Boolean} isStart - True if action is starting, false if ending
   */
  handleAction(action, isStart) {
    // Lock and broadcast toggles always work
    if (action === 'toggle-lock') {
      if (isStart) this.toggleLock();
      return;
    }

    if (action === 'toggle-broadcast') {
      if (isStart) this.toggleBroadcast();
      return;
    }

    if (action === 'toggle-gm-mode') {
      if (isStart) this.toggleGmMode();
      return;
    }

    if (action === 'toggle-blackout') {
      if (isStart) this.toggleBlackout();
      return;
    }

    // All other actions are blocked when locked (except for GM)
    if (this.isLocked && !game.user.isGM) {
      return;
    }

    switch (action) {
      case 'zoom-in':
        if (isStart) this.zoom(1);
        break;
      case 'zoom-out':
        if (isStart) this.zoom(-1);
        break;
      case 'pan-up':
        this.handlePan('up', isStart);
        break;
      case 'pan-down':
        this.handlePan('down', isStart);
        break;
      case 'pan-left':
        this.handlePan('left', isStart);
        break;
      case 'pan-right':
        this.handlePan('right', isStart);
        break;
      case 'pan-center':
        if (isStart) this.centerOnToken();
        break;
    }
  }

  /**
   * Toggle broadcast mode
   * Enabling broadcast locks controls, but disabling broadcast never unlocks
   */
  toggleBroadcast() {
    if (!game.user.isGM) return;

    const newState = !this.isBroadcasting;

    // Set world setting to sync broadcast state to all clients
    game.settings.set('shared-control', 'broadcastMode', newState);

    // Enabling broadcast always locks, but disabling never unlocks
    if (newState && !this.isLocked) {
      game.settings.set('shared-control', 'controlsLocked', true);
    }

    if (newState) {
      ui.notifications.info('Broadcast mode enabled - view synced to players');
    } else {
      ui.notifications.info('Broadcast mode disabled - players still locked');
    }

    debugLog('Broadcast mode toggled:', newState);
  }

  /**
   * Update broadcast state (called from settings onChange)
   * @param {Boolean} isBroadcasting - Whether broadcast mode is active
   */
  updateBroadcastState(isBroadcasting) {
    this.isBroadcasting = isBroadcasting;

    // Update button state (GM only)
    if (this.broadcastButton) {
      if (isBroadcasting) {
        this.broadcastButton.classList.add('active');
      } else {
        this.broadcastButton.classList.remove('active');
      }
    }

    // Update blocker message for non-GM clients
    this.updateBlockerMessage();

    debugLog('Broadcast state updated:', isBroadcasting);
  }

  /**
   * Update the interaction blocker message based on current state
   */
  updateBlockerMessage() {
    if (this.interactionBlocker) {
      const messageEl = this.interactionBlocker.querySelector('.blocker-message');
      if (messageEl) {
        if (this.isBroadcasting) {
          messageEl.innerHTML = '<i class="fas fa-broadcast-tower"></i> GM is controlling the view';
        } else {
          messageEl.innerHTML = '<i class="fas fa-lock"></i> GM has locked the screen';
        }
      }
    }
  }

  /**
   * Toggle the lock state
   */
  toggleLock() {
    if (!this.canSeeLockButton()) return;

    const newState = !this.isLocked;
    game.settings.set('shared-control', 'controlsLocked', newState);
    debugLog('Controls lock toggled:', newState);
  }

  /**
   * Toggle GM normal mode (switches between tap workflow and normal Foundry drag-and-drop)
   */
  toggleGmMode() {
    if (!game.user.isGM) return;

    const newState = !this.isGmNormalMode;
    game.settings.set('shared-control', 'gmNormalMode', newState);

    if (newState) {
      ui.notifications.info('Normal Foundry mode enabled - using drag-and-drop');
    } else {
      ui.notifications.info('Tap workflow mode enabled');
    }

    debugLog('GM normal mode toggled:', newState);
  }

  /**
   * Update GM mode button state
   * @param {Boolean} isNormalMode - Whether GM is using normal Foundry mode
   */
  updateGmModeState(isNormalMode) {
    this.isGmNormalMode = isNormalMode;

    if (this.gmModeButton) {
      if (isNormalMode) {
        // Normal Foundry mode (default) - no highlight
        this.gmModeButton.classList.remove('active');
        this.gmModeButton.innerHTML = '<i class="fas fa-mouse-pointer"></i>';
        this.gmModeButton.title = 'Using Normal Foundry Mode (click for tap workflow)';
      } else {
        // Tap workflow mode - highlight to show non-default
        this.gmModeButton.classList.add('active');
        this.gmModeButton.innerHTML = '<i class="fas fa-hand-pointer"></i>';
        this.gmModeButton.title = 'Using Tap Workflow (click for normal Foundry)';
      }
    }

    debugLog('GM mode state updated:', isNormalMode);
  }

  /**
   * Toggle blackout mode (hides screen from players and locks controls)
   * Lock behavior:
   * - If lock was OFF when blackout enabled: lock turns on, and turns off when blackout disabled
   * - If lock was ON when blackout enabled: lock stays on when blackout disabled
   */
  toggleBlackout() {
    if (!game.user.isGM) return;

    const newState = !this.isBlackout;
    game.settings.set('shared-control', 'blackoutMode', newState);

    if (newState) {
      // Enabling blackout - remember if lock was already active
      this.lockWasActiveBeforeBlackout = this.isLocked;
      if (!this.isLocked) {
        game.settings.set('shared-control', 'controlsLocked', true);
      }
      ui.notifications.info('Blackout enabled - players cannot see the screen');
    } else {
      // Disabling blackout - only unlock if lock wasn't active before blackout
      if (!this.lockWasActiveBeforeBlackout) {
        game.settings.set('shared-control', 'controlsLocked', false);
      }
      ui.notifications.info('Blackout disabled');
    }

    debugLog('Blackout mode toggled:', newState, 'lockWasActiveBeforeBlackout:', this.lockWasActiveBeforeBlackout);
  }

  /**
   * Update blackout state
   * @param {Boolean} isBlackout - Whether blackout is active
   */
  updateBlackoutState(isBlackout) {
    this.isBlackout = isBlackout;

    // Update button state (GM only)
    if (this.blackoutButton) {
      if (isBlackout) {
        this.blackoutButton.classList.add('active');
        this.blackoutButton.innerHTML = '<i class="fas fa-eye"></i>';
        this.blackoutButton.title = 'Blackout Active (click to show screen)';
      } else {
        this.blackoutButton.classList.remove('active');
        this.blackoutButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
        this.blackoutButton.title = 'Blackout Screen (hide from players)';
      }
    }

    // Show/hide blackout overlay for non-GM users
    if (this.blackoutOverlay) {
      if (isBlackout) {
        this.blackoutOverlay.classList.add('active');
      } else {
        this.blackoutOverlay.classList.remove('active');
      }
    }

    debugLog('Blackout state updated:', isBlackout);
  }

  /**
   * Update the lock state
   * GM is never visually locked - they can always use controls
   * @param {Boolean} isLocked - Whether controls are locked
   */
  updateLockState(isLocked) {
    this.isLocked = isLocked;

    if (this.controlPanel) {
      // GM is never visually locked - they can always use controls
      if (isLocked && !game.user.isGM) {
        this.controlPanel.classList.add('locked');
      } else {
        this.controlPanel.classList.remove('locked');
      }
    }

    // Show/hide interaction blocker for non-GM users
    if (this.interactionBlocker) {
      if (isLocked) {
        this.interactionBlocker.classList.add('active');
      } else {
        this.interactionBlocker.classList.remove('active');
      }
    }

    if (this.lockButton) {
      if (isLocked) {
        this.lockButton.innerHTML = '<i class="fas fa-lock"></i>';
        this.lockButton.classList.add('active');
      } else {
        this.lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
        this.lockButton.classList.remove('active');
      }
    }

    debugLog('Lock state updated:', isLocked, '(GM exempt:', game.user.isGM, ')');
  }

  /**
   * Zoom the canvas
   * @param {Number} direction - 1 for zoom in, -1 for zoom out
   */
  zoom(direction) {
    if (!canvas?.stage) return;

    const currentScale = canvas.stage.scale.x;
    const zoomFactor = ZOOM_FACTOR;

    let newScale;
    if (direction > 0) {
      newScale = currentScale * zoomFactor;
    } else {
      newScale = currentScale / zoomFactor;
    }

    // Clamp to Foundry's zoom limits
    const minScale = CONFIG.Canvas.minZoom ?? 0.1;
    const maxScale = CONFIG.Canvas.maxZoom ?? 3;
    newScale = Math.max(minScale, Math.min(maxScale, newScale));

    const panData = {
      x: canvas.stage.pivot.x,
      y: canvas.stage.pivot.y,
      scale: newScale,
      duration: 100
    };

    canvas.animatePan(panData);

    // Broadcast to players if enabled
    if (this.isBroadcasting && game.user.isGM) {
      game.sharedControl.broadcastPan(panData);
    }

    debugLog('Zoom', direction > 0 ? 'in' : 'out', 'to scale:', newScale);
  }

  /**
   * Handle pan action (start/stop continuous panning)
   * @param {String} direction - Direction to pan
   * @param {Boolean} isStart - True to start panning, false to stop
   */
  handlePan(direction, isStart) {
    if (isStart) {
      // Start continuous panning
      this.startPanning(direction);
    } else {
      // Stop panning
      this.stopPanning();
    }
  }

  /**
   * Start continuous panning in a direction
   * @param {String} direction - Direction to pan
   */
  startPanning(direction) {
    this.stopPanning(); // Clear any existing interval

    const panAmount = PAN_AMOUNT;
    const panInterval = PAN_INTERVAL;

    // Perform initial pan immediately
    this.performPan(direction, panAmount);

    // Set up interval for continuous panning
    this.panInterval = setInterval(() => {
      this.performPan(direction, panAmount);
    }, panInterval);
  }

  /**
   * Perform a single pan operation
   * @param {String} direction - Direction to pan
   * @param {Number} amount - Pixels to pan
   */
  performPan(direction, amount) {
    if (!canvas?.stage) return;

    const current = {
      x: canvas.stage.pivot.x,
      y: canvas.stage.pivot.y
    };

    // Calculate pan offset based on current zoom level
    const scale = canvas.stage.scale.x;
    const adjustedAmount = amount / scale;

    let newX = current.x;
    let newY = current.y;

    switch (direction) {
      case 'up':
        newY -= adjustedAmount;
        break;
      case 'down':
        newY += adjustedAmount;
        break;
      case 'left':
        newX -= adjustedAmount;
        break;
      case 'right':
        newX += adjustedAmount;
        break;
    }

    const panData = {
      x: newX,
      y: newY,
      scale: scale,
      duration: 50
    };

    canvas.animatePan(panData);

    // Broadcast to players if enabled
    if (this.isBroadcasting && game.user.isGM) {
      game.sharedControl.broadcastPan(panData);
    }
  }

  /**
   * Stop continuous panning
   */
  stopPanning() {
    if (this.panInterval) {
      clearInterval(this.panInterval);
      this.panInterval = null;
    }
  }

  /**
   * Center view on the currently controlled token
   */
  centerOnToken() {
    if (!canvas?.stage) return;

    // Get the first controlled token, or the user's character token
    let token = canvas.tokens?.controlled?.[0];

    if (!token && game.user.character) {
      // Try to find the user's character token on the scene
      token = canvas.tokens?.placeables?.find(t =>
        t.actor?.id === game.user.character.id
      );
    }

    let panData;

    if (token) {
      panData = {
        x: token.center.x,
        y: token.center.y,
        scale: canvas.stage.scale.x,
        duration: 250
      };
      debugLog('Centered on token:', token.name);
    } else {
      // No token found, center on scene
      const scene = canvas.scene;
      if (scene) {
        panData = {
          x: scene.width / 2,
          y: scene.height / 2,
          scale: canvas.stage.scale.x,
          duration: 250
        };
        debugLog('Centered on scene');
      }
    }

    if (panData) {
      canvas.animatePan(panData);

      // Broadcast to players if enabled
      if (this.isBroadcasting && game.user.isGM) {
        game.sharedControl.broadcastPan(panData);
      }
    }
  }

  /**
   * Update button size
   * @param {Number} size - Button size in pixels
   */
  updateButtonSize(size) {
    if (!this.container) return;

    this.container.style.setProperty('--button-size', `${size}px`);
    debugLog('Button size updated to:', size);
  }

  /**
   * Update panel position
   * @param {String} position - Position key (e.g., 'left-center', 'right-top')
   */
  updatePosition(position) {
    if (!this.controlPanel) return;

    // Remove all position classes
    this.controlPanel.classList.remove(
      'position-left-top', 'position-left-center', 'position-left-bottom',
      'position-right-top', 'position-right-center', 'position-right-bottom'
    );

    // Add the new position class
    this.controlPanel.classList.add(`position-${position}`);
    debugLog('Panel position updated to:', position);
  }

  /**
   * Reset the fade timer
   */
  resetFadeTimer() {
    // Clear existing timeout
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
    }

    // Set new timeout to fade the panel
    this.fadeTimeout = setTimeout(() => {
      this.fadePanel();
    }, this.fadeDelay);
  }

  /**
   * Show the panel (remove faded state)
   */
  showPanel() {
    if (this.controlPanel) {
      this.controlPanel.classList.remove('faded');
    }
  }

  /**
   * Fade the panel (reduce opacity when idle)
   */
  fadePanel() {
    if (this.controlPanel) {
      this.controlPanel.classList.add('faded');
    }
  }

  /**
   * Show the overlay
   */
  show() {
    if (this.container) {
      this.container.classList.add('visible');
      this.isVisible = true;
      debugLog('Overlay controls shown');
    }
  }

  /**
   * Hide the overlay
   */
  hide() {
    if (this.container) {
      this.container.classList.remove('visible');
      this.isVisible = false;
      debugLog('Overlay controls hidden');
    }
  }

  /**
   * Toggle overlay visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Clean up and destroy the overlay
   */
  destroy() {
    this.stopPanning();

    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    if (this.interactionBlocker) {
      this.interactionBlocker.remove();
      this.interactionBlocker = null;
    }

    if (this.blackoutOverlay) {
      this.blackoutOverlay.remove();
      this.blackoutOverlay = null;
    }

    this.controlPanel = null;
    this.isVisible = false;

    debugLog('Overlay controls destroyed');
  }
}
