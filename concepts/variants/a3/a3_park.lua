-- a3_park.lua  (ArduPilot Plane/QuadPlane Lua script) -- DRAFT, NOT BENCH-TESTED
-- Purpose: in fixed-wing cruise, check that each lift rotor sits in its magnet detent (reed ladder on one ADC pin)
-- and, if not, give that rotor a short low-throttle "nudge" and let the ESC brake it again (max N tries).
-- Assumes: lift motors on SERVO outputs with SERVOn_FUNCTION 33..36 (Motor1..4), DShot, BLHeli_S "Brake on stop" ON.
-- UNVERIFIED (must be checked on the bench, props off): (1) the firmware for CoreWingF405WingV2 includes scripting;
-- (2) set_output_pwm_chan_timeout reaches a DShot output in flight; (3) ADC pin number of a spare pad; (4) 3.3 V pad.
local PKEY, PPFX = 73, "A3P_"
assert(param:add_table(PKEY, PPFX, 6), "a3_park: param table")
param:add_param(PKEY, 1, "ENABLE", 0)        -- 0 = off (default), 1 = on
param:add_param(PKEY, 2, "ADC_PIN", -1)      -- analog pin of the reed ladder (-1 = unset)
param:add_param(PKEY, 3, "NUDGE_PWM", 1100)  -- PWM-equivalent of the nudge throttle (tune on stand: ~6-10 %)
param:add_param(PKEY, 4, "NUDGE_MS", 150)    -- nudge duration
param:add_param(PKEY, 5, "MAX_TRY", 3)       -- tries per rotor per cruise segment
param:add_param(PKEY, 6, "MIN_AS", 14)       -- airspeed gate, m/s (> Q_ASSIST_SPEED)

local RTOP = 10000.0
local RK   = {2200.0, 4700.0, 10000.0, 22000.0}   -- one per rotor 1..4, in parallel with that rotor's reed
local VREF = 3.3
local MOTOR_FN = {33, 34, 35, 36}
local PLANE_Q_MODES = {[17]=true,[18]=true,[19]=true,[20]=true,[21]=true,[22]=true,[23]=true}  -- QSTAB..QACRO
local adc = analog:channel()
local tries = {0, 0, 0, 0}
local state, t_next = "WAIT", 0

local function volts_for(unparked)           -- list of unparked rotor indices -> expected node voltage
  local r = 0.0
  for _, k in ipairs(unparked) do r = r + RK[k] end
  return VREF * r / (RTOP + r)
end

local function decode(v)                     -- returns index of single unparked rotor, 0 = all parked, nil = unknown
  if v < 0.15 then return 0 end
  local best, bestd = nil, 0.18              -- accept within 0.18 V of a single-rotor level
  for k = 1, 4 do
    local d = math.abs(v - volts_for({k}))
    if d < bestd then best, bestd = k, d end
  end
  return best
end

local function in_cruise()
  if vehicle:get_mode() == nil or PLANE_Q_MODES[vehicle:get_mode()] then return false end
  if motors:get_interlock() then return false end             -- VTOL motors active (Q-assist or hover)
  local as = ahrs:airspeed_estimate()
  return as ~= nil and as > param:get(PPFX .. "MIN_AS")
end

local function nudge(k)
  local ch = SRV_Channels:find_channel(MOTOR_FN[k])
  if ch == nil then return end
  SRV_Channels:set_output_pwm_chan_timeout(ch, param:get(PPFX .. "NUDGE_PWM"), param:get(PPFX .. "NUDGE_MS"))
  tries[k] = tries[k] + 1
  gcs:send_text(6, string.format("a3_park: nudge rotor %d (try %d)", k, tries[k]))
end

function update()
  if param:get(PPFX .. "ENABLE") ~= 1 or param:get(PPFX .. "ADC_PIN") < 0 then return update, 1000 end
  adc:set_pin(param:get(PPFX .. "ADC_PIN"))
  local now = millis():tofloat()
  if not in_cruise() then
    state, tries = "WAIT", {0, 0, 0, 0}
    return update, 500
  end
  if state == "WAIT" then t_next, state = now + 3000, "CHECK" end   -- let the ESC brake finish after spool-down
  if now < t_next then return update, 100 end
  local k = decode(adc:voltage_average())
  if k == 0 then state = "PARKED"; return update, 1000 end
  if k ~= nil and tries[k] < param:get(PPFX .. "MAX_TRY") then
    nudge(k); t_next = now + 1200; state = "CHECK"
  elseif state ~= "GAVEUP" then
    gcs:send_text(4, "a3_park: rotor not parked / unknown ladder state"); state = "GAVEUP"
  end
  return update, 200
end
return update, 1000
