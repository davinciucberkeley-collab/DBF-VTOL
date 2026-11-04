"""Thermal-camera style renders, mission time-history plot and the compact results JSON for the heat-dissipation analysis.

Inputs:  analysis/thermal/thermal_inputs.json (loads, h, limits), cad/sim/thermal/results.txt and cad/sim/thermal/fields/*.json
         (SOLIDWORKS Simulation nodal temperature fields and body-max histories written by cad/Thermal.cs)
Outputs: analysis/thermal/img/*.png, analysis/thermal/thermal_results.json (< 1 MB, with decimated surface fields per part)

Run:  py analysis/thermal/thermal_report.py
"""
import json, os, math, datetime
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from matplotlib import cm, colors

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIM = os.path.join(ROOT, 'cad', 'sim', 'thermal')
IMG = os.path.join(ROOT, 'analysis', 'thermal', 'img'); os.makedirs(IMG, exist_ok=True)
INP = json.load(open(os.path.join(ROOT, 'analysis', 'thermal', 'thermal_inputs.json')))
LIM = INP['limits']; T_HOT = INP['ambient']['hot_C']; T_STD = INP['ambient']['std_C']

RES = {}
for line in open(os.path.join(SIM, 'results.txt')):
    if line.startswith('#') or '=' not in line: continue
    k, rest = line.strip().split('=', 1); v, unit, note = rest.split('|', 2)
    RES[k] = dict(v=float(v), unit=unit, note=note)

def field(name):
    p = os.path.join(SIM, 'fields', name + '.json')
    if not os.path.exists(p): return None
    f = json.load(open(p))
    f['nodes'] = np.array(f['nodes'], float).reshape(-1, 3); f['tris'] = np.array(f['tris'], int).reshape(-1, 3)
    f['body'] = np.array(f.get('body') or [''] * len(f['nodes']))
    for k in f['fields']: f['fields'][k] = np.array([np.nan if x is None else x for x in f['fields'][k]], float)
    return f

# ---------------- thermal-camera renderer ----------------
PAL = matplotlib.colormaps['inferno']
def render(ax, f, T, view=(28, -50), keep=None, label='', vmin=None, vmax=None, hot=True, scale=1.0, focus=None):
    nodes, tris = f['nodes'], f['tris']
    if keep is not None: tris = tris[keep(tris)]
    if focus is not None: tris = tris[(np.abs(nodes[tris, 0] - focus[0]) <= focus[1]).all(axis=1)]   # crop long bodies (boom) to +-focus[1] m around x = focus[0]
    Tt = np.nanmean(T[tris], axis=1)
    ok = ~np.isnan(Tt); tris, Tt = tris[ok], Tt[ok]
    vmin = T_HOT if vmin is None else vmin; vmax = float(np.nanmax(T)) if vmax is None else vmax
    norm = colors.Normalize(vmin=vmin, vmax=max(vmax, vmin + 1))
    # painter's order: sort by depth along the view direction
    el, az = np.radians(view[0]), np.radians(view[1])
    vdir = np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)])
    P = nodes[:, [0, 2, 1]] * scale   # SOLIDWORKS Y up -> plot Z up
    cent = P[tris].mean(axis=1); order = np.argsort(cent @ vdir)
    polys = P[tris[order]]
    pc = Poly3DCollection(polys, facecolors=PAL(norm(Tt[order])), edgecolors='none', linewidths=0)
    ax.add_collection3d(pc)
    used = np.unique(tris); mn, mx = P[used].min(axis=0), P[used].max(axis=0); c = (mn + mx) / 2; r = (mx - mn).max() / 2 * 0.80   # ortho view: the box diagonal is never fully needed
    ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
    ax.view_init(elev=view[0], azim=view[1]); ax.set_axis_off(); ax.set_box_aspect((1, 1, 1))
    try: ax.set_proj_type('ortho')
    except Exception: pass
    if hot:
        i = int(np.nanargmax(T)); p = P[i]
        ax.plot([p[0]], [p[1]], [p[2]], marker='+', ms=18, mew=1.6, color='white', zorder=10)
        ax.text(p[0], p[1], p[2], '   max %.0f °C' % T[i], color='white', fontsize=11, fontweight='bold', zorder=11)
    if label: ax.text2D(0.02, 0.95, label, transform=ax.transAxes, color='white', fontsize=10, family='monospace')
    return norm

def camera_figure(panels, title, out, width=5.0, vmax=None, note='', focus=None):
    """panels: list of (field, T, view, keep, label). Shared inferno scale from the hot-day ambient to the common max."""
    n = len(panels)
    fig = plt.figure(figsize=(max(width * n + 1.0, 9.0), width + 0.9), facecolor='#101010')
    allmax = max(float(np.nanmax(T)) for _, T, _, _, _ in panels) if vmax is None else vmax
    norm = None
    for k, (f, T, view, keep, label) in enumerate(panels):
        ax = fig.add_axes([k / (n + 0.18), 0.02, 1 / (n + 0.18), 0.86], projection='3d', facecolor='#101010')
        norm = render(ax, f, T, view=view, keep=keep, label=label, vmax=allmax, focus=focus)
    cax = fig.add_axes([n / (n + 0.18) + 0.02, 0.12, 0.018, 0.70])
    cb = plt.colorbar(cm.ScalarMappable(norm=norm, cmap=PAL), cax=cax)
    cb.set_label('°C', color='white', fontsize=11); cb.ax.yaxis.set_tick_params(color='white', labelcolor='white', labelsize=10)
    cb.outline.set_edgecolor('#777')
    fig.text(0.015, 0.915, title, color='white', fontsize=12, fontweight='bold', family='monospace')
    fig.text(0.015, 0.025, note, color='#bbbbbb', fontsize=8, family='monospace')
    fig.text(0.985, 0.965, 'SOLIDWORKS Simulation thermal | ambient %.0f °C' % T_HOT, color='#bbbbbb', fontsize=8, family='monospace', ha='right')
    fig.savefig(out, dpi=130, facecolor=fig.get_facecolor()); plt.close(fig)
    print('wrote', out)

produced = []
def P(name): p = os.path.join(IMG, name); produced.append(os.path.relpath(p, ROOT).replace('\\', '/')); return p

# ---------------- (a) lift unit ----------------
lu = field('lift_unit')
if lu:
    F = lu['fields']
    if 'steady_hover' in F:
        camera_figure([(lu, F['steady_hover'], (28, -50), None, 'steady hover (upper bound, never reached in flight)')],
                      'Lift unit: motor + PA6-CF mount + boom + ESC, steady hover, hot day', P('lift_unit_steady.png'), focus=(0.02, 0.13),
                      note='Q motor %.1f W, ESC %.1f W; h motor %.0f, mount %.0f, boom %.0f, ESC %.0f W/m2K (prop wash v_i %.1f m/s)' % (INP['loads']['lift_motor_W'], INP['loads']['lift_esc_W'], INP['h']['motor_hover'], INP['h']['mount_hover'], INP['h']['boom_hover'], INP['h']['esc_hover'], INP['flow']['v_i_mps']))
    pans = [(lu, F[k], (28, -50), None, k.replace('hover_', 'hover ').replace('s', ' s')) for k in ('hover_30s', 'hover_60s', 'hover_90s') if k in F]
    if pans: camera_figure(pans, 'Lift unit: continuous hover from %.0f °C, transient' % T_HOT, P('lift_unit_hover_30_60_90.png'), width=4.2, focus=(0.02, 0.13), note='same colour scale on all three panels; bench C08 holds hover thrust 90 s, hover-only flights are limited to 60 s per hover')
    pans = [(lu, F[k], (28, -50), None, lab) for k, lab in (('end_hover1', 'end of take-off hover (60 s)'), ('end_transition2', 'end of transition 1 (80 s)'), ('end_hover5', 'end of mission (landing hover)')) if k in F]
    if pans: camera_figure(pans, 'Lift unit through the mission (hover 60 - transition 20 - cruise 600 - transition 20 - hover 60 s)', P('lift_unit_mission.png'), width=4.2, focus=(0.02, 0.13), note='lift motors stopped in cruise and cooled by the 20 m/s freestream')

# ---------------- (b) pod interior ----------------
pod = field('pod')
if pod:
    F = pod['fields']; nodes = pod['nodes']
    keep_section = lambda tris: nodes[tris, 2].mean(axis=1) <= 0.0   # cutaway: remove the +Z half (section through the centreline); camera on the +Z side looks into the cut
    for k, lab, fn in (('end_hover5', 'end of mission, hot day', 'pod_mission_end.png'), ('end_cruise3', 'end of cruise (680 s)', 'pod_end_cruise.png')):
        if k in F:
            camera_figure([(pod, F[k], (30, 62), keep_section, lab + ' (section at the centreline, bays only)')],
                          'Pod interior: battery and flight controller in the foam bays, ' + lab, P(fn), width=7.0, focus=(-0.26, 0.16),
                          note='battery I2R %.0f / %.0f / %.0f W in hover / transition / cruise (R_pack %.0f mOhm = 6 x 7.5 mOhm C11 limit); FC %.1f W; XPS k %.3f W/mK' % (INP['loads']['batt_hover_W'], INP['loads']['batt_trans_W'], INP['loads']['batt_cruise_W'], INP['loads']['R_pack_ohm'] * 1000, INP['loads']['fc_W'], INP['materials']['xps']['k']))

# ---------------- pusher ----------------
pu = field('pusher')
if pu:
    F = pu['fields']
    pans = [(pu, F[k], (25, 40), None, lab) for k, lab in (('steady_cruise', 'steady cruise (upper bound)'), ('end_cruise', 'after 600 s cruise from %.0f °C' % T_HOT)) if k in F]
    if pans: camera_figure(pans, 'Pusher motor in the PA6-CF cup and foam tail ring, cruise 20 m/s, hot day', P('pusher_cruise.png'), width=4.6,
                           note='X4110S pusher: Q motor %.1f W (P_cruise x (1 - 0.85) x 0.75 EST); h motor %.0f W/m2K (flat plate at 20 m/s), cup inner %.0f, pod skin %.0f' % (INP['loads']['pusher_motor_W'], INP['h']['pusher_motor_cruise'], INP['h']['cup_inner_cruise'], INP['h']['pod_cruise']))

# ---------------- (c) mission time history ----------------
def hist(name):
    p = os.path.join(SIM, 'fields', name)
    return json.load(open(p)) if os.path.exists(p) else None
Hl, Hp, Hk, Hh = hist('lift_unit_mission_history.json'), hist('pod_mission_history.json'), hist('pusher_cruise_history.json'), hist('lift_unit_hover_history.json')
series = []   # (label, t, T, limit, limit label)
if Hl:
    series.append(('Lift motor (can, max)', Hl['Motor']['t'], Hl['Motor']['T'], LIM['motor_can_C'], 'motor can 80 °C est'))
    series.append(('Lift ESC', Hl['ESC']['t'], Hl['ESC']['T'], LIM['esc_C'], 'ESC 70 °C est'))
    series.append(('PA6-CF motor mount (max)', Hl['Mount']['t'], Hl['Mount']['T'], LIM['pa6cf_HDT_C'], 'PA6-CF HDT 173 °C'))
if Hp:
    series.append(('Battery pack (max)', Hp['Battery']['t'], Hp['Battery']['T'], LIM['lipo_C'], 'LiPo 60 °C'))
    series.append(('Flight controller', Hp['FC']['t'], Hp['FC']['T'], None, ''))
if Hk:
    # pusher runs only in cruise: shift its history to start at the end of transition 1
    t0 = INP['mission']['t_end_trans1_s']
    series.append(('Pusher motor (can, max)', [t0 + t for t in Hk['Motor']['t']], Hk['Motor']['T'], LIM['motor_can_C'], ''))
series = [x for x in series if len(x[1]) > 1]
cat = ['#4C78A8', '#F58518', '#54A24B', '#E45756', '#B279A2', '#72B7B2']   # fixed categorical order (dataviz palette)
if series:
    fig, ax = plt.subplots(figsize=(10, 5.2), facecolor='white')
    tot = INP['mission']['total_s']
    # phase bands
    x = 0
    for ph in INP['mission']['phases']:
        ax.axvspan(x, x + ph['dt_s'], color='#f2f2f2' if ph['name'] != 'cruise' else '#fafafa', lw=0)
        ax.text(x + ph['dt_s'] / 2, 0.985, ph['name'] if ph['name'] != 'transition' else 'trans.', transform=ax.get_xaxis_transform(), ha='center', va='top', fontsize=8, color='#777')
        x += ph['dt_s']
    for k, (lab, t, T, lim, ll) in enumerate(series):
        ax.plot(t, T, lw=2, color=cat[k % len(cat)], label=lab)
        ax.text(t[-1], T[-1], ' %.0f' % T[-1], color='#333', fontsize=8, va='center')
    drawn = set()
    for lab, t, T, lim, ll in series:
        if lim and ll and lim not in drawn and lim < 120:
            ax.axhline(lim, ls='--', lw=1, color='#999'); ax.text(tot * 0.42, lim, ll, ha='left', va='bottom', fontsize=8, color='#666'); drawn.add(lim)
    ax.text(tot * 0.42, LIM['petg_HDT_C'], 'PETG HDT 68 °C (not a heat path; for reference)', ha='left', va='top', fontsize=8, color='#666'); ax.axhline(LIM['petg_HDT_C'], ls=':', lw=1, color='#bbb')
    ax.set_xlim(0, tot); ax.set_ylim(T_HOT - 2, max(110, max(max(T) for _, _, T, _, _ in series) + 8))
    ax.set_xlabel('mission time (s)'); ax.set_ylabel('temperature (°C), hot day %.0f °C ambient' % T_HOT)
    ax.set_title('Component temperatures through the mission vs limits (max in body, SOLIDWORKS transient)', fontsize=11, loc='left')
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    ax.grid(axis='y', color='#e6e6e6'); ax.legend(frameon=False, fontsize=9, loc='upper left', bbox_to_anchor=(0.0, 0.93))
    fig.tight_layout(); out = P('thermal_mission_history.png'); fig.savefig(out, dpi=140); plt.close(fig); print('wrote', out)
if Hh:
    fig, ax = plt.subplots(figsize=(7, 4.2), facecolor='white')
    for k, (b, lab, lim) in enumerate((('Motor', 'motor can (max)', LIM['motor_can_C']), ('ESC', 'ESC', LIM['esc_C']), ('Mount', 'PA6-CF mount (max)', None))):
        ax.plot(Hh[b]['t'], Hh[b]['T'], lw=2, color=cat[k], label=lab)
        if lim: ax.axhline(lim, ls='--', lw=1, color='#999'); ax.text(Hh[b]['t'][-1], lim, '%s limit %.0f °C est ' % (lab.split(' (')[0], lim), ha='right', va='bottom', fontsize=8, color='#666')
    for tmark in (60, 90): ax.axvline(tmark, color='#ddd', lw=1); ax.text(tmark, ax.get_ylim()[0] + 1, ' %d s' % tmark, fontsize=8, color='#777')
    ax.set_xlabel('continuous hover time (s)'); ax.set_ylabel('°C'); ax.set_title('Lift unit in a continuous hover from %.0f °C' % T_HOT, fontsize=11, loc='left')
    for s in ('top', 'right'): ax.spines[s].set_visible(False)
    ax.grid(axis='y', color='#e6e6e6'); ax.legend(frameon=False, fontsize=9)
    fig.tight_layout(); out = P('lift_unit_hover_history.png'); fig.savefig(out, dpi=140); plt.close(fig); print('wrote', out)

# ---------------- findings table + compact JSON ----------------
def g(k): return RES[k]['v'] if k in RES else None
def status(T, lim):
    if T is None or lim is None: return '—'
    m = lim - T
    return 'pass' if m >= 10 else ('at risk' if m >= 0 else 'fail')
rows = []
def row(component, case, T, lim, lim_src, note=''):
    rows.append(dict(component=component, case=case, peak_C=None if T is None else round(T, 1), peak_std_C=None if T is None else round(T - (T_HOT - T_STD), 1),
                     limit_C=lim, limit_src=lim_src, margin_K=None if T is None or lim is None else round(lim - T, 1), status=status(T, lim), note=note))
row('Lift motor can', 'hover 60 s (flight limit)', g('lift_hover60_Motor'), LIM['motor_can_C'], 'test plan abort table (EST)')
row('Lift motor can', 'hover 90 s (bench C08)', g('lift_hover90_Motor'), LIM['motor_can_C'], 'test plan C08 (EST)')
row('Lift motor can', 'mission peak', g('lift_mission_max_Motor'), LIM['motor_can_C'], 'test plan (EST)')
row('Lift motor can', 'steady hover (bound)', g('lift_steady_Motor'), LIM['motor_can_C'], 'test plan (EST)', 'never reached: tau >> hover time')
row('Lift ESC (boom, prop wash)', 'hover 60 s', g('lift_hover60_ESC'), LIM['esc_C'], 'test plan abort table (EST)')
row('Lift ESC (boom, prop wash)', 'hover 90 s (bench C08)', g('lift_hover90_ESC'), LIM['esc_C'], 'test plan C08 (EST)')
row('Lift ESC (boom, prop wash)', 'mission peak', g('lift_mission_max_ESC'), LIM['esc_C'], 'test plan (EST)')
row('Lift ESC (boom, prop wash)', 'steady hover (bound)', g('lift_steady_ESC'), LIM['esc_C'], 'test plan (EST)')
row('PA6-CF motor mount', 'hover 90 s', g('lift_hover90_Mount'), LIM['pa6cf_HDT_C'], 'Polymaker TDS HDT 1.8 MPa')
row('PA6-CF motor mount', 'mission peak', g('lift_mission_max_Mount'), LIM['pa6cf_HDT_C'], 'Polymaker TDS HDT 1.8 MPa')
row('PA6-CF motor mount', 'steady hover (bound)', g('lift_steady_Mount'), LIM['pa6cf_HDT_C'], 'Polymaker TDS HDT 1.8 MPa', 'a PETG mount (HDT 68 C) would fail here')
row('Battery pack (Ovonic 6S 6500)', 'mission end (hot day)', g('pod_mission_end_Battery'), LIM['lipo_C'], 'test plan C11 / rule 8 (EST)', 'R_pack at 7.5 mOhm/cell (C11 limit at run time; now 7.3 mOhm: 28.3 K rise, 63 C)')
row('Battery pack (Ovonic 6S 6500)', 'mission peak', g('pod_mission_max_Battery'), LIM['lipo_C'], 'test plan C11 / rule 8 (EST)')
row('Flight controller (pod bay)', 'mission peak', g('pod_mission_max_FC'), None, '— (CoreWing publishes no limit)')
row('XPS pod foam', 'mission peak', g('pod_mission_max_Foam'), LIM['xps_C'], 'FOAMULAR data sheet max use 165 F')
row('Pusher motor can', 'after 600 s cruise', g('pusher_endcruise_Motor'), LIM['motor_can_C'], 'test plan (EST)', 'X4110S in the closed PA6-CF cup; loss 38 W EST (15 % x 75 %), no bell self-pumping')
row('Pusher motor can', 'steady cruise (bound)', g('pusher_steady_Motor'), LIM['motor_can_C'], 'test plan (EST)')
row('PA6-CF pusher cup', 'steady cruise (bound)', max([x for x in (g('pusher_steady_CupFloor'), g('pusher_steady_CupWall')) if x is not None] or [None]), LIM['pa6cf_HDT_C'], 'Polymaker TDS')

# decimated surface fields for a three.js view: vertex clustering on a grid, mean T per cluster
def decimate(f, key, cell):
    nodes, tris, T = f['nodes'], f['tris'], f['fields'][key]
    used = np.unique(tris); q = np.floor(nodes[used] / cell).astype(np.int64)
    keys = q[:, 0] * 73856093 ^ q[:, 1] * 19349663 ^ q[:, 2] * 83492791
    uniq, inv = np.unique(keys, return_inverse=True)
    remap = np.full(len(nodes), -1, int); remap[used] = inv
    nv = len(uniq); V = np.zeros((nv, 3)); Tv = np.zeros(nv); cnt = np.zeros(nv)
    np.add.at(V, inv, nodes[used]); np.add.at(Tv, inv, np.nan_to_num(T[used], nan=T_HOT)); np.add.at(cnt, inv, 1)
    V /= cnt[:, None]; Tv /= cnt
    tr = remap[tris]; tr = tr[(tr[:, 0] != tr[:, 1]) & (tr[:, 1] != tr[:, 2]) & (tr[:, 0] != tr[:, 2])]
    tr = np.unique(np.sort(tr, axis=1), axis=0)
    return dict(vertices=[round(float(x), 4) for x in V.ravel()], temps_C=[round(float(x), 1) for x in Tv], tris=[int(x) for x in tr.ravel()], cell_m=cell)

fields_out = {}
if lu: fields_out['lift_unit'] = {k: decimate(lu, k, 0.006) for k in ('steady_hover', 'hover_90s', 'end_hover5') if k in lu['fields']}
if pod: fields_out['pod'] = {k: decimate(pod, k, 0.012) for k in ('end_hover5',) if k in pod['fields']}
if pu: fields_out['pusher'] = {k: decimate(pu, k, 0.004) for k in ('end_cruise',) if k in pu['fields']}
fields_out['_note'] = 'surface mesh per part: vertices [x,y,z,...] m in the study frame (lift unit: boom axis X, up Y; pod: axis X, up Y, section cut not applied), temps_C per vertex, tris 0-based; vertex-clustered from the SOLIDWORKS tet mesh (cell_m)'

out = {
  'generated': datetime.datetime.now().isoformat(timespec='minutes'),
  'tool': 'SOLIDWORKS Simulation 2025 thermal (steady + transient, chained per mission phase) via cad/Thermal.cs; loads and film coefficients from analysis/thermal/thermal_inputs.py',
  'ambient_C': {'hot': T_HOT, 'standard': T_STD, 'note': 'linear problem (constant properties, convection only): standard-day temperatures = hot-day values - %.0f K' % (T_HOT - T_STD)},
  'inputs_summary': {
    'results_json': INP['sources']['results'], 'loads_W': {k: round(v, 2) for k, v in INP['loads'].items() if isinstance(v, (int, float))},
    'h_W_m2K': {k: round(v, 1) for k, v in INP['h'].items() if isinstance(v, (int, float))}, 'v_i_mps': round(INP['flow']['v_i_mps'], 2),
    'mission': INP['mission']['phases'], 'limits_C': {k: v for k, v in LIM.items() if k != 'src'},
  },
  'validation': {k: RES[k]['v'] for k in RES if k.startswith('val_')},
  'results': {k: RES[k]['v'] for k in RES if not k.startswith('val_')},
  'findings': rows,
  'histories': {'lift_unit_mission': Hl, 'pod_mission': Hp, 'pusher_cruise': Hk, 'lift_unit_hover': Hh},
  'images': produced,
  'fields': fields_out,
}
path = os.path.join(ROOT, 'analysis', 'thermal', 'thermal_results.json')
json.dump(out, open(path, 'w'), separators=(',', ':'))
print('wrote', path, '%.0f kB' % (os.path.getsize(path) / 1024))
print('\n| Component | Case | Peak (hot day) | Limit | Margin | Status |\n|---|---|---|---|---|---|')
for r in rows:
    print('| %s | %s | %s | %s | %s | %s |' % (r['component'], r['case'], '—' if r['peak_C'] is None else '%.0f °C' % r['peak_C'], '—' if r['limit_C'] is None else '%.0f °C' % r['limit_C'], '—' if r['margin_K'] is None else '%+.0f K' % r['margin_K'], r['status']))
