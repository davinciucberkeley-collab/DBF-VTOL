"""Render animation frames of the VTOL joints (task 32).  Runs INSIDE Fusion (MCP script), a few frames per call:

    def run(context):
        exec(open(r'C:\\Users\\trist\\Documents\\DBF-Fusion-Export\\render_animations_fusion.py').read(), globals())
        render('aileron_right', 0, 12)          # frames [0,12) -> DBF-Fusion-Export\\frames\\aileron_right\\f0000.png ...
        # setup() once before a session (suppresses motion links, hides what it can); reset() at the end (all joints 0, links on)

Data: anim_kin.json = compact extract of inventory/fusion/kinematics/kinematics.json (servo -45..45 step 5 table for surface
angle and pushrod pose, per group).  Exact kinematics, NOT the motion links (they are suppressed while rendering).
Per frame, for a surface group g with servo angle phi (deg):
    arm joint      = phi
    surface joint  = interp(servo_to_surface_deg[g], phi)
    pushrod joint  = interp(rod pose_table rod_angle_deg, phi) - phi     (pushrod revolute is about the arm hole and is carried by the arm)
Joint values: rotationValue in rad, slideValue in cm (values exactly at a limit are rejected, so the servo sweep is 44.9 deg).
Model (x,y,z) m -> Fusion (z,x,y)*100 cm.
"""
import adsk.core, adsk.fusion, traceback, math, json, os

app = adsk.core.Application.get()
des = adsk.fusion.Design.cast(app.activeProduct)
root = des.rootComponent
EXPORT = os.path.expanduser('~') + '\\Documents\\DBF-Fusion-Export'
K = json.load(open(EXPORT + '\\anim_kin.json'))
for _g in K.values():
    if 'tab' in _g:
        _g['tab'] = sorted((int(a), b) for a, b in _g['tab'].items())
SPEC = json.load(open(EXPORT + '\\joints_spec.json'))
JN = {j['kin']: j['name'] for j in SPEC['joints']}
AMP = 44.9
SURF = ['ail_R', 'ail_L', 'elev', 'rud_R', 'rud_L']
FPS = 24
_J = {}


def joint(kin):
    if kin not in _J:
        for j in root.joints:
            if j.name == JN[kin]:
                _J[kin] = j
    return _J[kin]


def interp(tab, x):
    if x <= tab[0][0]:
        return tab[0][1]
    for (a, va), (b, vb) in zip(tab, tab[1:]):
        if x <= b:
            return va + (vb - va) * (x - a) / (b - a)
    return tab[-1][1]


def rot(kin, deg):
    deg = (deg + 180.0) % 360.0 - 180.0
    joint(kin).jointMotion.rotationValue = math.radians(deg)


def slide(kin, cm):
    joint(kin).jointMotion.slideValue = cm


def servo(g, phi):
    phi = max(-AMP, min(AMP, phi))
    rot('arm_' + g, phi)
    rot(g, interp(K[g]['tab'], phi))
    rot('rod_' + g, interp(K['rod_' + g]['tab'], phi) - phi)


def reset():
    set_hidden(None)
    for g in SURF:
        for k in (g, 'arm_' + g, 'rod_' + g):
            joint(k).jointMotion.rotationValue = 0.0
    for k in ('prop_L1', 'prop_L2', 'prop_L3', 'prop_L4', 'prop_P', 'wheel_FR', 'wheel_FL', 'wheel_RR', 'wheel_RL'):
        joint(k).jointMotion.rotationValue = 0.0
    for k in ('slide_panel_R', 'slide_panel_L', 'slide_htail', 'slide_canopy', 'slide_battery'):
        joint(k).jointMotion.slideValue = 0.0
    for ml in root.motionLinks:
        ml.isSuppressed = False


def neutral():                   # all joints to 0 (motion links stay suppressed)
    for g in SURF:
        for k in (g, 'arm_' + g, 'rod_' + g):
            joint(k).jointMotion.rotationValue = 0.0
    for k in ('prop_L1', 'prop_L2', 'prop_L3', 'prop_L4', 'prop_P', 'wheel_FR', 'wheel_FL', 'wheel_RR', 'wheel_RL'):
        joint(k).jointMotion.rotationValue = 0.0
    for k in ('slide_panel_R', 'slide_panel_L', 'slide_htail', 'slide_canopy', 'slide_battery'):
        joint(k).jointMotion.slideValue = 0.0


def setup():
    for ml in root.motionLinks:
        ml.isSuppressed = True
    for a in ('isJointOriginsFolderLightBulbOn', 'isJointsFolderLightBulbOn', 'isOriginFolderLightBulbOn', 'isConstructionFolderLightBulbOn', 'isSketchFolderLightBulbOn'):
        setattr(root, a, False)
    vp = app.activeViewport
    try:
        vp.visualStyle = adsk.core.VisualStyles.ShadedWithVisibleEdgesOnlyVisualStyle
    except Exception:
        pass


def sw(u):                       # neutral -> +max -> -max -> neutral, u in [0,1)
    return AMP * math.sin(2 * math.pi * u)


def ss(x):                       # smoothstep on [0,1]
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def seg(f, a, b):
    return ss((f - a) / float(b - a))


# ---- clip poses: (n_frames, fn(i, n))
def p_aileron_right(i, n):
    servo('ail_R', sw(i / float(n)))


def p_ailerons_roll(i, n):
    s = sw(i / float(n))
    servo('ail_R', s)
    servo('ail_L', -s)


def p_elevator(i, n):
    servo('elev', sw(i / float(n)))


def p_rudders(i, n):
    s = sw(i / float(n))
    servo('rud_R', s)
    servo('rud_L', s)


def p_all(i, n):                 # roll, pitch, yaw, one third each
    t = i / float(n) * 3.0
    k = int(t)
    s = sw(t - k)
    if k == 0:
        servo('ail_R', s)
        servo('ail_L', -s)
    elif k == 1:
        servo('elev', s)
    else:
        servo('rud_R', s)
        servo('rud_L', s)


def p_props(i, n):               # 30 deg/frame = 1 rev per 12 frames (pusher and lift props opposite hand not modelled)
    for k in ('prop_L1', 'prop_L2', 'prop_L3', 'prop_L4', 'prop_P'):
        rot(k, 30.0 * i)


def p_wheels(i, n):              # 15 deg/frame
    for k in ('wheel_FR', 'wheel_FL', 'wheel_RR', 'wheel_RL'):
        rot(k, -15.0 * i)


def p_breakdown(i, n):          # tail lifts off first (it rides on the R panel joint chain), then the panels slide off
    f = i
    can = seg(f, 0, 20) - seg(f, 164, 184)
    bat = seg(f, 20, 36) - seg(f, 148, 164)
    tail = seg(f, 36, 56) - seg(f, 130, 148)
    pan = seg(f, 56, 92) - seg(f, 100, 130)
    slide('slide_canopy', 9.99 * can)
    slide('slide_battery', 0.69 * bat)
    slide('slide_htail', 14.99 * tail)
    slide('slide_panel_R', 29.99 * pan)
    slide('slide_panel_L', -29.99 * pan)


# skins hidden in the close-ups so the servo / arm / pushrod / horn linkage is visible
HIDE_ALL = ['Wing_Panel_R:1', 'Wing_Panel_L:1', 'H_Tail:1', 'Fin:1', 'Fin:2']
HIDE = {'aileron_right': ['Wing_Panel_R:1', 'Wing_Panel_L:1'], 'elevator': ['H_Tail:1'], 'rudders': ['Fin:1', 'Fin:2']}


def set_hidden(name):
    for o in root.occurrences:
        if o.name in HIDE_ALL:
            o.isLightBulbOn = o.name not in HIDE.get(name, [])


# name: (frames, pose fn, eye, target)  Fusion cm, Z up.  Cameras tuned from test frames.
CLIPS = {
    'aileron_right': (120, p_aileron_right, (108, -32, 22), (82, -15, -1)),
    'ailerons_roll': (120, p_ailerons_roll, (0, -300, 230), (0, -25, 0)),
    'elevator': (96, p_elevator, (65, -108, -32), (37, -81, -3)),
    'rudders': (96, p_rudders, (64, -106, 16), (40, -86, -1)),
    'all_controls': (192, p_all, (270, -270, 120), (35, -35, 0)),
    'props_spin': (72, p_props, (190, 210, 170), (0, -5, 0)),
    'wheels_roll': (72, p_wheels, (85, 5, -20), (46, 28, -22)),
    'transport_breakdown': (192, p_breakdown, (270, -270, 190), (0, -30, 0)),
}


def set_cam(eye, target):
    vp = app.activeViewport
    c = vp.camera
    c.cameraType = adsk.core.CameraTypes.PerspectiveCameraType
    c.eye = adsk.core.Point3D.create(*eye)
    c.target = adsk.core.Point3D.create(*target)
    c.upVector = adsk.core.Vector3D.create(0, 0, 1)
    c.isSmoothTransition = False
    vp.camera = c
    for _ in range(3):
        adsk.doEvents()
        vp.refresh()
    return vp


def render(name, i0, i1, eye=None, target=None):
    try:
        n, fn, e, t = CLIPS[name]
        if i0 == 0:
            neutral()                  # clips start from the neutral pose (poses persist between calls)
        set_hidden(name)
        vp = set_cam(eye or e, target or t)
        d = EXPORT + '\\frames\\' + name
        os.makedirs(d, exist_ok=True)
        for i in range(i0, min(i1, n)):
            fn(i, n)
            adsk.doEvents()
            vp.refresh()
            o = adsk.core.SaveImageFileOptions.create('%s\\f%04d.png' % (d, i))
            o.width = 1280
            o.height = 720
            o.isBackgroundTransparent = True        # grid/ground are not drawn; composited on a flat background by ffmpeg
            o.isAntiAliased = True
            vp.saveAsImageFileWithOptions(o)
        print(name, i0, i1, 'ok')
    except Exception:
        print(traceback.format_exc())


# ---- visibility helpers (override setup): construction points / joint origins are the white dots in the renders
def hide_points(on=False):
    for c in des.allComponents:
        for p in c.constructionPoints:
            p.isLightBulbOn = on


def setup():
    for ml in root.motionLinks:
        ml.isSuppressed = True
    hide_points(False)
    for a in ('isJointOriginsFolderLightBulbOn', 'isJointsFolderLightBulbOn', 'isOriginFolderLightBulbOn', 'isConstructionFolderLightBulbOn', 'isSketchFolderLightBulbOn'):
        setattr(root, a, False)
    try:
        app.activeViewport.visualStyle = adsk.core.VisualStyles.ShadedWithVisibleEdgesOnlyVisualStyle
    except Exception:
        pass


def restore_visibility():          # everything shown, construction points hidden, joints shown, links on
    reset()
    for o in root.occurrences:
        o.isLightBulbOn = True
    hide_points(False)
    root.isJointsFolderLightBulbOn = True
    root.isJointOriginsFolderLightBulbOn = True
    root.isOriginFolderLightBulbOn = False
    root.isConstructionFolderLightBulbOn = False


# ---- encoding (run in a shell where the frames folder is reachable), per clip <name>:
#   ffmpeg -f lavfi -i color=c=0xaebbc9:s=1280x720:r=24 -framerate 24 -i frames/<name>/f%04d.png \
#     -filter_complex "[0][1]overlay=shortest=1,format=yuv420p" -c:v libx264 -crf 26 -movflags +faststart -r 24 <name>.mp4
#   GIF: ffmpeg -i <name>.mp4 -vf "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" <name>.gif
