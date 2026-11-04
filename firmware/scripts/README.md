# Lua scripts — not used on this board

No Lua scripts ship with this package, on purpose.

- The ArduPlane 4.7.2 stable build for `CoreWingF405WingV2` excludes scripting: its `features.txt` lists
  `!AP_SCRIPTING_ENABLED`, `!AP_SCRIPTING_BINDING_MOTORS_ENABLED` and `!AP_SCRIPTING_BINDING_VEHICLE_ENABLED`
  (https://firmware.ardupilot.org/Plane/stable/CoreWingF405WingV2/features.txt, checked 2026-10-21).
- The reason is flash size. The board is an STM32F405 with 1 MB (hwdef `FLASH_SIZE_KB 1024`). The hwdef includes
  `minimize_fpv_osd.inc` to fit. ArduPilot: "The ArduPilot firmware in some configurations exceeds 1 MB in size …
  a reduced firmware is generated" (https://ardupilot.org/plane/docs/common-limited-firmware.html).
- What would otherwise have been scripts is covered by built-in features: QuickTune (`AP_QUICKTUNE_ENABLED`, RC
  option 181) and QAUTOTUNE for VTOL tuning, the throttle-based harmonic notch, and two-stage battery failsafes.
- A custom build from https://custom.ardupilot.org could add scripting only by removing other features. It
  would be an unofficial build. Not recommended for this project.
