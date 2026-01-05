/**
 * SharedControl Overlay Controls
 * On-screen buttons for zoom and pan functionality
 */

import { debugLog } from './utils.js';

export class OverlayControls {
  constructor() {
    this.container = null;
    this.controlPanel = null;
    this.lockButton = null;
    this.panInterval = null;
    this.isVisible = false;
    this.isLocked = false;
    this.fadeTimeout = null;
    this.fadeDelay = 5000; // 5 seconds
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

    // Create lock button (only for users with permission)
    if (this.canSeeLockButton()) {
      this.lockButton = document.createElement('button');
      this.lockButton.className = 'shared-control-btn shared-control-lock-btn';
      this.lockButton.dataset.action = 'toggle-lock';
      this.lockButton.title = 'Lock/Unlock Controls';
      this.lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
      this.controlPanel.appendChild(this.lockButton);
    }

    // Add to DOM
    document.body.appendChild(this.container);

    // Apply button size
    this.updateButtonSize(buttonSize);

    // Apply position
    const position = game.settings.get('shared-control', 'overlayPosition');
    this.updatePosition(position);

    // Apply current lock state
    const isLocked = game.settings.get('shared-control', 'controlsLocked');
    this.updateLockState(isLocked);

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
        btn.classList.remove('active');
        this.handleAction(action, false);
      });

      // Handle pointer leave (finger/mouse moves off button)
      btn.addEventListener('pointerleave', (e) => {
        btn.classList.remove('active');
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
    // Lock toggle always works
    if (action === 'toggle-lock') {
      if (isStart) this.toggleLock();
      return;
    }

    // All other actions are blocked when locked
    if (this.isLocked) {
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
   * Toggle the lock state
   */
  toggleLock() {
    if (!this.canSeeLockButton()) return;

    const newState = !this.isLocked;
    game.settings.set('shared-control', 'controlsLocked', newState);
    debugLog('Controls lock toggled:', newState);
  }

  /**
   * Update the lock state
   * @param {Boolean} isLocked - Whether controls are locked
   */
  updateLockState(isLocked) {
    this.isLocked = isLocked;

    if (this.controlPanel) {
      if (isLocked) {
        this.controlPanel.classList.add('locked');
      } else {
        this.controlPanel.classList.remove('locked');
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

    debugLog('Lock state updated:', isLocked);
  }

  /**
   * Zoom the canvas
   * @param {Number} direction - 1 for zoom in, -1 for zoom out
   */
  zoom(direction) {
    if (!canvas?.stage) return;

    const currentScale = canvas.stage.scale.x;
    const zoomFactor = 1.25;

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

    // Get the center of the viewport for zoom focus
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    canvas.animatePan({
      x: canvas.stage.pivot.x,
      y: canvas.stage.pivot.y,
      scale: newScale,
      duration: 100
    });

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

    const panAmount = 100; // Pixels to pan per tick
    const panInterval = 50; // Milliseconds between pans

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

    canvas.animatePan({
      x: newX,
      y: newY,
      duration: 50
    });
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
    // Get the first controlled token, or the user's character token
    let token = canvas.tokens?.controlled?.[0];

    if (!token && game.user.character) {
      // Try to find the user's character token on the scene
      token = canvas.tokens?.placeables?.find(t =>
        t.actor?.id === game.user.character.id
      );
    }

    if (token) {
      canvas.animatePan({
        x: token.center.x,
        y: token.center.y,
        duration: 250
      });
      debugLog('Centered on token:', token.name);
    } else {
      // No token found, center on scene
      const scene = canvas.scene;
      if (scene) {
        canvas.animatePan({
          x: scene.width / 2,
          y: scene.height / 2,
          duration: 250
        });
        debugLog('Centered on scene');
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

    this.controlPanel = null;
    this.isVisible = false;

    debugLog('Overlay controls destroyed');
  }
}
