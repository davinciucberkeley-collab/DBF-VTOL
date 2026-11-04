// Step-by-step renders of the assembly for the build manual (docs/build/BUILD-MANUAL.md).
// Usage: BuildFigs.exe <cad/model dir> <figs.txt> <out dir> [list]
//   list: print every component (Name2, bounding-box centre in mm) and exit, to write figs.txt against; "list all" adds the hardware.
// figs.txt, one figure per line (blank lines and # comments ignored):
//   id | asm | view | rotX | rotY | zoom | focus | context | ghost
//   asm   C = VTOL_Concept.SLDASM, X = VTOL_Exploded.SLDASM
//   view  a SOLIDWORKS named view (*Isometric, *Top, *Front, *Right, *Back, *Left, *Bottom, *Trimetric, *Dimetric)
//   rotX, rotY  extra rotation about the screen axes after the named view, degrees
//   zoom  focus[:n] = fit the focus parts, then step out n times (default 2); all = fit everything shown
//   focus, context, ghost  comma lists of component-name patterns: "Lift_Motor" matches every instance, "Lift_Motor-1"
//         one instance, "*" everything; focus may be empty (a plain view of the context). Focus parts (the ones this step adds) are shown orange; context parts (built in
//         earlier steps) keep their own appearance; ghost parts are context drawn 75 % transparent so the focus inside
//         them shows. Everything else is hidden. Fasteners, nuts, washers and inserts whose box centre lies inside a
//         focus part's box (+3 mm) are shown with the focus in steel blue.
// Output: <out dir>/<id>.jpg, white margin trimmed. The background is plain white for the run and restored after.
// The assembly is closed without saving; the appearance overrides never reach the model files.
using System;
using System.IO;
using System.Collections.Generic;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

class BuildFigs
{
    static readonly double[] Focus = { 0.96, 0.52, 0.12, 0.6, 0.85, 0.5, 0.35, 0, 0 };
    static readonly double[] Hardware = { 0.25, 0.47, 0.80, 0.6, 0.85, 0.6, 0.5, 0, 0 };

    static bool IsHardware(string n) { return n.Length > 3 && (n[0] == 'F' || n[0] == 'N' || n[0] == 'W' || n[0] == 'I') && char.IsDigit(n[1]) && char.IsDigit(n[2]) && n[3] == '_'; }
    static string Base(string n) { int s = n.LastIndexOf('/'); return s >= 0 ? n.Substring(s + 1) : n; }
    static bool Match(string name, string[] pats)
    {
        string n = Base(name), part = n.Contains("-") ? n.Substring(0, n.LastIndexOf('-')) : n;
        foreach (string p0 in pats) { string p = p0.Trim(); if (p == "") continue; if (p == "*" || p == n || p == part) return true; }
        return false;
    }
    static string[] List(string s) { return s.Trim() == "" ? new string[0] : s.Split(','); }

    static int Main(string[] a)
    {
        SldWorks sw = (SldWorks)Activator.CreateInstance(Type.GetTypeFromProgID("SldWorks.Application"));
        sw.Visible = true; sw.UserControl = true;
        int bgApp = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swColorsBackgroundAppearance);
        int bgCol = sw.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsViewportBackground);
        try { return Run(sw, a); }
        finally   // the user's background settings come back however the run ends
        {
            sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swColorsBackgroundAppearance, bgApp);
            sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsViewportBackground, bgCol);
        }
    }

    // trims the white margin (24 px kept), caps the width at 1400 px and writes a JPEG
    static void Crop(string png, string jpg)
    {
        using (var src = new System.Drawing.Bitmap(png))
        {
            int x0 = src.Width, y0 = src.Height, x1 = -1, y1 = -1;
            for (int y = 0; y < src.Height; y += 2) for (int x = 0; x < src.Width; x += 2)
                { var p = src.GetPixel(x, y); if (p.R < 245 || p.G < 245 || p.B < 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
            if (x1 < 0) { x0 = 0; y0 = 0; x1 = src.Width - 1; y1 = src.Height - 1; }
            x0 = Math.Max(0, x0 - 24); y0 = Math.Max(0, y0 - 24); x1 = Math.Min(src.Width - 1, x1 + 24); y1 = Math.Min(src.Height - 1, y1 + 24);
            int cw = x1 - x0 + 1, ch = y1 - y0 + 1; double k = Math.Min(1.0, 1400.0 / cw);
            int ow = (int)Math.Round(cw * k), oh = (int)Math.Round(ch * k);
            using (var dst = new System.Drawing.Bitmap(ow, oh))
            using (var g = System.Drawing.Graphics.FromImage(dst))
            {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.Clear(System.Drawing.Color.White);
                g.DrawImage(src, new System.Drawing.Rectangle(0, 0, ow, oh), new System.Drawing.Rectangle(x0, y0, cw, ch), System.Drawing.GraphicsUnit.Pixel);
                var enc = Array.Find(System.Drawing.Imaging.ImageCodecInfo.GetImageEncoders(), c => c.MimeType == "image/jpeg");
                var ep = new System.Drawing.Imaging.EncoderParameters(1); ep.Param[0] = new System.Drawing.Imaging.EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 85L);
                dst.Save(jpg, enc, ep);
            }
        }
    }

    static int Run(SldWorks sw, string[] a)
    {
        sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swColorsBackgroundAppearance, (int)swColorsBackgroundAppearance_e.swColorsBackgroundAppearance_Plain);
        sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSystemColorsViewportBackground, 0xFFFFFF);
        bool list = a.Length > 3 && a[3] == "list";
        var figs = new List<string[]>();
        if (!list) foreach (string raw in File.ReadAllLines(a[1])) { string l = raw.Trim(); if (l == "" || l.StartsWith("#")) continue; string[] f = l.Split('|'); if (f.Length != 9) { Console.WriteLine("bad line: " + l); return 1; } for (int i = 0; i < 9; i++) f[i] = f[i].Trim(); figs.Add(f); }
        Directory.CreateDirectory(a[2]);
        foreach (string which in new[] { "C", "X" })
        {
            if (!list && !figs.Exists(f => f[1] == which)) continue;
            if (list && which == "X") break;
            string path = Path.Combine(a[0], which == "C" ? "VTOL_Concept.SLDASM" : "VTOL_Exploded.SLDASM");
            int e = 0, w = 0;
            ModelDoc2 d = sw.OpenDoc6(path, (int)swDocumentTypes_e.swDocASSEMBLY, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref e, ref w);
            if (d == null) { Console.WriteLine("open failed " + path + " " + e); return 1; }
            sw.ActivateDoc3(d.GetTitle(), false, 0, ref e);
            AssemblyDoc asm = (AssemblyDoc)d;
            object[] comps = (object[])asm.GetComponents(true);
            if (list)
            {
                foreach (object o in comps) { Component2 c = (Component2)o; if (IsHardware(Base(c.Name2)) && a.Length < 5) continue; double[] b = (double[])c.GetBox(false, false); Console.WriteLine(string.Format("{0} | {1:F0} {2:F0} {3:F0}", c.Name2, (b[0] + b[3]) * 500, (b[1] + b[4]) * 500, (b[2] + b[5]) * 500)); }
                sw.CloseDoc(d.GetTitle()); return 0;
            }
            // names and boxes read once; visibility and overrides only touched where they change (the API is slow per call)
            int nc = comps.Length; var C = new Component2[nc]; var N = new string[nc]; var B = new double[nc][]; var vis = new bool[nc]; var over = new bool[nc];
            for (int k = 0; k < nc; k++) { C[k] = (Component2)comps[k]; N[k] = C[k].Name2; B[k] = (double[])C[k].GetBox(false, false); vis[k] = true; }
            // each fastener, nut, washer and insert belongs to the smallest part whose box (+6 mm) holds its centre; it is
            // drawn only with that part, so a prop screw does not float over a bare motor
            var owner = new Component2[nc];
            for (int k = 0; k < nc; k++)
            {
                if (!IsHardware(Base(N[k]))) continue;
                double[] h = B[k]; double cx = (h[0] + h[3]) / 2, cy = (h[1] + h[4]) / 2, cz = (h[2] + h[5]) / 2, best = double.MaxValue; const double m = 0.006;
                for (int q = 0; q < nc; q++)
                {
                    if (IsHardware(Base(N[q]))) continue; double[] o = B[q];
                    if (cx > o[0] - m && cx < o[3] + m && cy > o[1] - m && cy < o[4] + m && cz > o[2] - m && cz < o[5] + m)
                    { double v = (o[3] - o[0]) * (o[4] - o[1]) * (o[5] - o[2]); if (v < best) { best = v; owner[k] = C[q]; } }
                }
            }
            ModelView mv = (ModelView)d.ActiveView;
            foreach (string[] f in figs)
            {
                if (f[1] != which) continue;
                string[] focus = List(f[6]), ctx = List(f[7]), ghost = List(f[8]);
                var boxes = new List<double[]>(); var focusComps = new List<Component2>();
                for (int k = 0; k < nc; k++) if (!IsHardware(Base(N[k])) && Match(N[k], focus)) { focusComps.Add(C[k]); boxes.Add(B[k]); }
                if (focusComps.Count == 0 && focus.Length > 0) { Console.WriteLine(f[0] + ": no focus component matched"); continue; }
                var want = new bool[nc]; var mats = new double[nc][];
                for (int k = 0; k < nc; k++)
                {
                    Component2 c = C[k]; string n = Base(N[k]);
                    if (IsHardware(n))
                    {
                        want[k] = owner[k] != null && focusComps.Contains(owner[k]);
                        if (want[k]) mats[k] = Hardware;
                    }
                    else if (focusComps.Contains(c)) { want[k] = true; mats[k] = Focus; }
                    else if (Match(N[k], ghost))
                    {
                        if (over[k]) { c.RemoveMaterialProperty2((int)swInConfigurationOpts_e.swThisConfiguration, null); over[k] = false; }
                        double[] mt = (double[])c.GetMaterialPropertyValues2((int)swInConfigurationOpts_e.swThisConfiguration, null);
                        if (mt == null || mt[0] < 0) mt = new double[] { 0.7, 0.7, 0.72, 0.5, 0.8, 0.3, 0.3, 0, 0 };
                        mt = (double[])mt.Clone(); mt[7] = 0.75; want[k] = true; mats[k] = mt;
                    }
                    else want[k] = Match(N[k], ctx);
                }
                // zoom "focus" or "focus:n": first only the focus parts and their hardware are shown and fitted, then the view
                // steps out n times (default 2) and the surroundings appear (zoom-to-selection renders blank through the API)
                string[] z = f[5].Split(':'); bool zf = z[0] == "focus" && focusComps.Count > 0;
                for (int k = 0; k < nc; k++)
                {
                    bool show = zf ? (want[k] && mats[k] != null && mats[k][7] == 0) : want[k];
                    if (show != vis[k]) { C[k].Visible = show ? (int)swComponentVisibilityState_e.swComponentVisible : (int)swComponentVisibilityState_e.swComponentHidden; vis[k] = show; }
                }
                d.ShowNamedView2(f[2], -1);
                double rx = double.Parse(f[3]) * Math.PI / 180, ry = double.Parse(f[4]) * Math.PI / 180;
                if (rx != 0 || ry != 0) mv.RotateAboutCenter(rx, ry);
                d.ViewZoomtofit2();
                if (zf)
                {
                    int steps = z.Length > 1 ? int.Parse(z[1]) : 2;
                    for (int t = 0; t < steps; t++) d.ViewZoomout();
                    for (int k = 0; k < nc; k++) if (want[k] != vis[k]) { C[k].Visible = want[k] ? (int)swComponentVisibilityState_e.swComponentVisible : (int)swComponentVisibilityState_e.swComponentHidden; vis[k] = want[k]; }
                }
                for (int k = 0; k < nc; k++)
                {
                    if (mats[k] != null) { C[k].SetMaterialPropertyValues2(mats[k], (int)swInConfigurationOpts_e.swThisConfiguration, null); over[k] = true; }
                    else if (over[k]) { C[k].RemoveMaterialProperty2((int)swInConfigurationOpts_e.swThisConfiguration, null); over[k] = false; }
                }
                d.GraphicsRedraw2();
                string png = Path.Combine(a[2], f[0] + ".png");
                bool ok = d.Extension.SaveAs(png, 0, 1, null, ref e, ref w);
                if (ok) { Crop(png, Path.Combine(a[2], f[0] + ".jpg")); File.Delete(png); }
                Console.WriteLine((ok ? "saved " : "FAILED ") + f[0]);
            }
            sw.CloseDoc(d.GetTitle());   // closed without saving
        }
        return 0;
    }
}
