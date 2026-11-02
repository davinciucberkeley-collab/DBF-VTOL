# Fusion animations (task 32)

Rendered from Fusion ("VTOL C0 full", version "Joints and motion") by `fusion/render_animations_fusion.py`.
1280x720, 24 fps, H.264 CRF 26, loop-friendly (neutral, +max, -max, neutral; smooth sine). Transparent-background PNG frames composited on a flat grey-blue by ffmpeg (Fusion's grid cannot be turned off through the API).
Servo angle sweeps +-44.9 deg (joint limit is 45 and exact-limit values are rejected). Exact kinematics from `inventory/fusion/kinematics/kinematics.json` (servo -45..45 step 5 deg tables, linearly interpolated); the 5 motion links were suppressed while rendering.
Per frame: arm joint = servo angle; surface joint = table `servo_to_surface_deg`; pushrod joint = `pose_table.rod_angle_deg` - servo angle (the pushrod revolute is about the arm hole and is carried by the arm).

| File | Shows | Duration | Source joints / table |
|---|---|---|---|
| aileron_right.mp4 / .gif | close-up of right aileron servo, arm, pushrod, horn, aileron (wing skin hidden to show the linkage); +-26.1 deg | 5 s | ail_R, arm_ail_R, rod_ail_R |
| ailerons_roll.mp4 | wide view, both ailerons in opposite directions (roll, equal and opposite, no differential ratio) | 5 s | ail_R, ail_L (+arms, rods); L servo = -R servo |
| elevator.mp4 | tail close-up, elevator servo, arm, rod; +-24.2 deg (H_Tail skin hidden) | 4 s | elev, arm_elev, rod_elev |
| rudders.mp4 | right rudder close-up, both rudders move together; +-22.9 deg (fins hidden) | 4 s | rud_R, rud_L (+arms, rods) |
| all_controls.mp4 / .gif | iso view: roll, then pitch, then yaw (64 frames each) | 8 s | all five surface groups |
| props_spin.mp4 | 4 lift props + pusher, 30 deg/frame (1 rev per 12 frames) | 3 s | prop_L1..L4, prop_P |
| wheels_roll.mp4 | close-up of front-right wheel, 15 deg/frame (all 4 wheels turn) | 3 s | wheel_FR/FL/RR/RL |
| transport_breakdown.mp4 | canopy up 100 mm, battery +30 mm, H-tail up 150 mm, wing panels out 300 mm each, then reverse | 8 s | slide_canopy, slide_battery, slide_htail, slide_panel_R/L |

Notes: the battery joint only travels +-30 mm (tray trim travel), so it does not leave the pod. H_Tail is a child of the R panel joint chain, so the tail is lifted off before the panels slide out. Re-rendered after the first pass: construction points (the white dots) are hidden, all skins shown in the wide clips (the H-tail is the long bar between the fins). Skins hidden only in aileron_right (wing panels), elevator (H_Tail) and rudders (fins). The document was restored (all shown, construction points hidden, joints at 0, links on) and saved as "Animations: visibility restored".
