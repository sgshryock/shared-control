# SharedControl - Touch Screen Token Movement

A Foundry VTT v13 module that enables intuitive touch screen interaction for token movement with physical miniatures. Perfect for tabletop gaming setups with touch screens where players can interact with both physical minis and their digital tokens.

## Features

- **Tap-Based Workflow**: Simple tap interaction for token selection, movement preview, and confirmation
- **A* Pathfinding**: Intelligent pathfinding that automatically routes around walls and obstacles
- **Movement Preview**: Visual path overlay showing the route with distance measurement
- **Movement Color Coding**: Path colors indicate movement cost relative to character speed:
  - Green: Within normal movement range
  - Yellow: Within double movement (dash)
  - Red: Exceeds double movement
  - Cyan: No movement tracking enabled
- **Touch-Only Mode**: Per-user setting to hide cursor for dedicated touch screen setups
- **Multi-System Support**: Works with D&D 5e, Pathfinder 2e, SWADE, Cosmere RPG, and others
- **Wall Detection**: Respects walls and movement-blocking terrain
- **Debug Visualization**: Built-in debug view to troubleshoot pathfinding issues
- **Permission Aware**: Only allows movement of tokens the user owns or controls

## How It Works

### Interaction Flow

1. **Select Token**: Pick up physical mini and tap the token underneath
2. **Preview Movement**: Tap a destination on the canvas to see the movement path
3. **Confirm Movement**: Tap the same location again to execute the movement
4. **Update Path**: Tap a different location to preview a new path
5. **Cancel**: Tap the selected token again to cancel the movement

### Visual Feedback

- Selected tokens are highlighted with a cyan glow
- Movement path is displayed with Foundry's native ruler
- Confirmation UI shows distance and movement cost
- Clear instructions for tap-to-confirm or tap-to-cancel

## Installation

### Via Foundry VTT

1. Open Foundry VTT and navigate to the **Add-on Modules** tab
2. Click **Install Module**
3. Search for "SharedControl" or paste the manifest URL
4. Click **Install**

### Manual Installation

1. Download the latest release from the [GitHub repository](https://github.com/sgshryock/shared-control)
2. Extract the zip file to your Foundry VTT `Data/modules` directory
3. Restart Foundry VTT
4. Enable the module in your world's **Module Management** settings

### Manifest URL

```
https://github.com/sgshryock/shared-control/releases/latest/download/module.json
```

## Configuration

### Module Settings

Access settings via **Configure Settings** → **Module Settings** → **SharedControl**

#### World Settings (GM Only)

- **Enable SharedControl**: Master toggle to enable/disable the module
- **Tap Timeout**: Time window for detecting confirmation taps (default: 500ms)
- **Tap Tolerance**: Distance in pixels for "same location" detection (default: 25px)

#### User Settings

- **Touch-Only Mode**: Disables traditional mouse controls for token movement
  - Recommended for dedicated touch screen setups
  - Each player can configure independently
  - GM can enable for specific users

## Recommended Modules

### libWrapper

While not required, **libWrapper** is highly recommended for best compatibility with other modules.

- **Purpose**: Safe method interception without conflicts
- **Install**: Search for "libWrapper" in the Add-on Modules tab
- **Link**: [libWrapper on Foundry](https://foundryvtt.com/packages/lib-wrapper)

### Compatible Modules

- **Drag Ruler**: Enhanced ruler functionality (compatible)
- **TouchVTT**: Basic touch support (may have overlapping features)

## System Support

SharedControl is designed to work with all game systems:

- ✅ **D&D 5e**: Full support with movement validation
- ✅ **Pathfinder 2e**: Full support with action economy
- ✅ **SWADE**: Full support with running rules
- ✅ **Generic Systems**: Basic movement without system-specific rules

## Requirements

- **Foundry VTT**: Version 13 or higher
- **Browser**: Modern browser with touch event support
- **Hardware**: Touch screen display (for touch-only mode)

## Usage Guide

### For Game Masters

1. **Enable the Module**: Check "Enable SharedControl" in module settings
2. **Configure Settings**: Adjust tap timeout and tolerance to your preference
3. **Set User Modes**: Help players enable Touch-Only Mode if using dedicated touch screen
4. **Test the Workflow**: Try the tap sequence with a test token

### For Players

1. **Enable Touch-Only Mode** (if using touch screen):
   - Go to **Configure Settings** → **Module Settings**
   - Find "SharedControl - Touch-Only Mode"
   - Check the box to enable

2. **Using the Module**:
   - Tap a token to select it (highlighted with cyan glow)
   - Tap where you want to move (path preview appears)
   - Tap the same spot again to confirm movement
   - Or tap the token to cancel

### Tips for Best Experience

- Use a stylus for more precise tapping
- Adjust tap tolerance if you have difficulty with confirmation taps
- Practice the tap-tap-confirm pattern
- Remember to tap the token itself to cancel, not the original position

## Troubleshooting

### Module Not Working

- ✅ Check that "Enable SharedControl" is turned on in settings
- ✅ Ensure you're using Foundry VTT v13 or higher
- ✅ Reload Foundry after enabling the module
- ✅ Check browser console (F12) for error messages

### Touch Events Not Detected

- ✅ Verify your browser supports touch events
- ✅ Check that Touch-Only Mode is enabled (if desired)
- ✅ Try disabling conflicting modules (TouchVTT)
- ✅ Clear browser cache and reload

### Movement Not Confirming

- ✅ Increase tap tolerance in settings (try 35-50px)
- ✅ Tap more precisely in the same location
- ✅ Check that the path is not blocked by walls
- ✅ Verify you have sufficient movement (in combat)

### Conflicts with Other Modules

- ✅ Install libWrapper for better compatibility
- ✅ Disable TouchVTT if features conflict
- ✅ Check module load order in Module Management
- ✅ Report issues on GitHub

## Development

### File Structure

```
SharedControl/
├── module.json              # Module manifest
├── scripts/
│   ├── shared-control.js   # Main entry point
│   ├── touch-workflow.js   # Touch event handling
│   ├── state-machine.js    # Movement state management
│   ├── ruler-preview.js    # Ruler integration
│   ├── settings.js         # Settings registration
│   ├── compat.js           # Module compatibility
│   └── utils.js            # Utility functions
├── styles/
│   └── shared-control.css  # Visual feedback styles
├── templates/
│   └── touch-controls.hbs  # UI templates
├── lang/
│   └── en.json            # Localization
└── README.md              # Documentation
```

### Building from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/sgshryock/shared-control.git
   ```

2. Copy to Foundry modules directory:
   ```bash
   cp -r shared-control /path/to/foundry/Data/modules/
   ```

3. Enable in Foundry VTT

### Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Foundry VTT v13
5. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/sgshryock/shared-control/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sgshryock/shared-control/discussions)
- **Discord**: Join the Foundry VTT Discord and tag @gordonshryock

## License

This module is licensed under the MIT License. See LICENSE file for details.

## Credits

- **Author**: Gordon Shryock
- **Inspired By**: Drag Ruler module by Stäbchenfisch
- **Built For**: Foundry VTT v13
- **Special Thanks**: The Foundry VTT community for testing and feedback

## Changelog

### Version 1.0.0 (2025-01-04)

- Initial release
- Tap-based token movement workflow
- A* pathfinding that routes around walls and obstacles
- Movement preview with distance display
- Movement color coding (green/yellow/red based on character speed)
- Touch-only mode support
- Multi-system support (D&D 5e, Pathfinder 2e, SWADE, Cosmere RPG)
- Debug visualization for troubleshooting pathfinding
- Grid type compatibility (square, hex)

---

**Enjoy your touch screen tabletop gaming experience with SharedControl!**
