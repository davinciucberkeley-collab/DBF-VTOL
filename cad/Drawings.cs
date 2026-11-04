// Builds the SOLIDWORKS drawing set DBF-DRW-001 rev E for the model (one .SLDDRW, nine ANSI B sheets):
//   1 General arrangement (GA): front elevation, plan, side elevation, isometric; overall dimensions; revision table
//   2 Exploded assembly with one balloon per major part (VTOL_Exploded.SLDASM, offsets from cad/params.mjs)
//   3 Parts list (parts-only bill of materials of the assembly: fasteners grouped by type with quantities)
//   4 Wing panel, wing saddle and the M5 wing-bolt pillar (fits FT01/FT05/FT06)
//   5 Motor mount (upper half + cap) and splice plug: hole callouts, counterbores, insert holes, floor thickness, fits
//   6 Boom clamps, gear clamp and tail clamp (split halves) with hole callouts
//   7 Tube cut list with ISO 2768-m tolerances, cross-hole positions, the landing leg and the leg fairing
//   8 Fastener schedule (every fastener: ID, standard, size, qty, joints, torque, threadlocker) and assembly notes
//   9 Small printed parts: fin shoe, spar collar, rear hardpoint, pusher cup, servo tray, root tongue
// The parts are built by API without sketch dimensions, so every dimension is a driven dimension between sketch points
// placed at known model coordinates (cad/params.txt): the values are the model geometry. Tolerances are set on the
// dimensions from docs/research/hardware-spec.md (cad/hardware.json fits and general_tolerances).
// Layout (since rev C): every sheet is laid out in fixed zones (sheet metres, origin bottom-left). Views are placed by their
// GetOutline box; dimensions stack outward from the geometry on each side (>= 8 mm between rows, text clear of the
// part); view labels sit below the last dimension row; notes and the general-tolerance table sit bottom-left, clear of
// the title block. Every annotation is registered in a layout check that reports overlaps, out-of-border items and
// title-block collisions (console and cad/drawings/layout-check.txt).
// Rev D: every size that follows the sizing (chord, stations, section heights, tube lengths, fairing, gear socket) is read
// from cad/params.txt, in the dimensions and in the note text; only purchased-hardware sizes stay as literals.
// Rev E: wing re-sized to the 11.75 m/s design stall (docs/research/stall-margin.md); sizes follow params.txt as in rev D.
// Exports DBF-DRW-001.SLDDRW, DBF-DRW-001.PDF (all sheets) and a PNG per sheet.
// Usage: Drawings.exe <cad/model dir> <cad/drawings dir> <cad/params.txt> [sheets]
//   [sheets] = comma list such as 2,3 builds only those sheets as probe_sheetN.png / probe.SLDDRW (layout iteration).
using System;
using System.IO;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

class Drawings
{
    static SldWorks sw; static MathUtility mu;
    static ModelDoc2 Doc; static DrawingDoc Dwg;
    static string ModelDir, OutDir, Fmt, Tpl;
    static Dictionary<string, string> P = new Dictionary<string, string>();
    static Dictionary<string, List<double[]>> XPos = new Dictionary<string, List<double[]>>();   // exploded positions per part (cad/params.txt xcomp lines, instance order)
    static CultureInfo IC = CultureInfo.InvariantCulture;
    static double D(string k) { return double.Parse(P[k], IC); }
    static string Mm(string k, string fmt) { return (D(k) * 1000).ToString(fmt, IC); }   // params value in mm as note text
    static string Mm(double v, string fmt) { return (v * 1000).ToString(fmt, IC); }
    static StringBuilder LogText = new StringBuilder();
    static void Log(string s) { Console.WriteLine(s); LogText.AppendLine(s); }
    const string REV = "E", DATE = "2026-10-25";
    static bool Probe = false; static HashSet<int> Only = new HashSet<int>();
    static List<string[]> Titles = new List<string[]>(); static List<double> SheetScales = new List<double>();
    static int SheetCount = 0;

    // ---------- sheet geometry (ANSI B landscape 431.8 x 279.4 mm; title block of the SOLIDWORKS "b - landscape" format) ----------
    const double XMIN = 0.018, XMAX = 0.414, YMIN = 0.016, YMAX = 0.263;   // usable area inside the border
    // no-go zones: application block (x >= 0.178, y <= 0.037) and title block (x >= 0.220, y <= 0.064)
    const double TB_X1 = 0.178, TB_Y1 = 0.037, TB_X2 = 0.220, TB_Y2 = 0.064;
    const double NOTE_H = 0.0025, LABEL_H = 0.003, NOTES_W = 0.195;   // notes block: x 0.018–0.214 (left of the application block)

    static int Main(string[] a)
    {
        ModelDir = Path.GetFullPath(a[0]); OutDir = Path.GetFullPath(a[1]); Directory.CreateDirectory(OutDir);
        if (a.Length > 3) { Probe = true; foreach (string s in a[3].Split(',')) Only.Add(int.Parse(s)); if (Only.Contains(2)) Only.Add(3); }
        var pd = ParamsFile.Load(a[2]); P = pd.P;   // cad/Shared.cs: the one params.txt reader
        foreach (string[] f in pd.XComps) { if (!XPos.ContainsKey(f[0])) XPos[f[0]] = new List<double[]>(); XPos[f[0]].Add(new[] { double.Parse(f[1], IC), double.Parse(f[2], IC), double.Parse(f[3], IC) }); }
        sw = (SldWorks)Activator.CreateInstance(Type.GetTypeFromProgID("SldWorks.Application"));
        sw.Visible = true; sw.UserControl = true; mu = (MathUtility)sw.GetMathUtility();
        sw.SetUserPreferenceToggle((int)swUserPreferenceToggle_e.swInputDimValOnCreate, false);   // no Modify dialog when adding dimensions
        CloseUnsavedDrawings();
        sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swTiffScreenOrPrintCapture, 0);   // screen capture (print capture via the API returns 11x8 px images)
        Tpl = sw.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateDrawing);
        Fmt = @"C:\ProgramData\SOLIDWORKS\SOLIDWORKS 2025\lang\english\sheetformat\b - landscape.slddrt";
        foreach (string f in Directory.GetFiles(OutDir)) if (Path.GetFileName(f).StartsWith("probe")) File.Delete(f);

        Doc = (ModelDoc2)sw.NewDocument(Tpl, (int)swDwgPaperSizes_e.swDwgPaperBsize, 0, 0);
        Dwg = (DrawingDoc)Doc;
        Doc.Extension.SetUserPreferenceInteger((int)swUserPreferenceIntegerValue_e.swUnitSystem, 0, (int)swUnitSystem_e.swUnitSystem_MMGS);
        Doc.Extension.SetUserPreferenceInteger((int)swUserPreferenceIntegerValue_e.swUnitsLinearDecimalPlaces, 0, 1);
        SetProps();
        if (Want(1)) Sheet1_GA();
        if (Want(2)) Sheet2_Exploded();
        if (Want(3)) Sheet3_PartsList();
        if (Want(2)) Balloons();   // after the parts list exists, so the balloons carry its item numbers
        if (Want(4)) Sheet4_Wing();
        if (Want(5)) Sheet5_MotorMount();
        if (Want(6)) Sheet6_Clamps();
        if (Want(7)) Sheet7_Tubes();
        if (Want(8)) Sheet8_Fasteners();
        if (Want(9)) Sheet9_Printed();

        string[] names = (string[])Dwg.GetSheetNames();
        int e = 0, w = 0;
        for (int i = 0; i < names.Length; i++)
        {
            Dwg.ActivateSheet(names[i]);
            Sheet sh = (Sheet)Dwg.GetCurrentSheet();
            sh.SetProperties2((int)swDwgPaperSizes_e.swDwgPaperBsize, (int)swDwgTemplates_e.swDwgTemplateCustom, 1, SheetScales[i], false, 0, 0, true);
            FillFormat(Titles[i][0], Titles[i][1]);
        }
        string path = Path.Combine(OutDir, Probe ? "probe.SLDDRW" : "DBF-DRW-001.SLDDRW");
        Doc.ForceRebuild3(false);
        if (!Doc.Extension.SaveAs(path, 0, 1, null, ref e, ref w)) Log("SAVE FAILED " + e);
        for (int i = 0; i < names.Length; i++)
        {
            Dwg.ActivateSheet(names[i]); Doc.ViewZoomtofit2();
            string png = Path.Combine(OutDir, string.Format(Probe ? "probe_sheet{0}.png" : "DBF-DRW-001_sheet{0}.png", SheetNumber(names[i])));
            try { if (File.Exists(png)) File.Delete(png); } catch (Exception ex) { Log("  cannot replace " + png + ": " + ex.Message); }
            Doc.Extension.SaveAs(png, 0, 1, null, ref e, ref w);
            if (!File.Exists(png)) { System.Threading.Thread.Sleep(2000); Doc.Extension.SaveAs(png, 0, 1, null, ref e, ref w); }
            Log("png " + Path.GetFileName(png) + " " + (File.Exists(png) ? new FileInfo(png).Length.ToString() : "MISSING"));
        }
        if (!Probe)
        {
            ExportPdfData pdf = (ExportPdfData)sw.GetExportFileData((int)swExportDataFileType_e.swExportPdfData);
            pdf.SetSheets((int)swExportDataSheetsToExport_e.swExportData_ExportAllSheets, null);
            Doc.Extension.SaveAs(Path.Combine(OutDir, "DBF-DRW-001.PDF"), 0, 1, pdf, ref e, ref w);
        }
        Dwg.ActivateSheet(names[0]);
        Doc.Extension.SaveAs(path, 0, 1, null, ref e, ref w);
        Log("saved " + path);
        File.WriteAllText(Path.Combine(OutDir, Probe ? "probe-layout-check.txt" : "layout-check.txt"), LogText.ToString());
        sw.CloseDoc(Doc.GetTitle());
        return 0;
    }
    static bool Want(int n) { return !Probe || Only.Contains(n); }
    static readonly string[] SheetNames = { "GA", "EXPLODED", "PARTS", "WING", "MOUNT", "CLAMPS", "TUBES", "FASTENERS", "HARDPOINTS" };
    static int SheetNumber(string name) { return Array.IndexOf(SheetNames, name) + 1; }

    static void CloseUnsavedDrawings()
    {
        object[] docs = (object[])sw.GetDocuments();
        if (docs != null) foreach (object o in docs) { ModelDoc2 m = (ModelDoc2)o; if (m.GetType() == (int)swDocumentTypes_e.swDocDRAWING && (m.GetPathName() == "" || m.GetPathName().StartsWith(OutDir, StringComparison.OrdinalIgnoreCase))) sw.CloseDoc(m.GetTitle()); }
    }
    static void SetProps()
    {
        CustomPropertyManager c = Doc.Extension.get_CustomPropertyManager("");
        Action<string, string> put = (k, v) => c.Add3(k, (int)swCustomInfoType_e.swCustomInfoText, v, (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
        put("DrawnBy", "DBF"); put("DrawnDate", DATE); put("Revision", REV); put("COMPANYNAME", "DESIGN-BUILD-FLY"); put("CheckedBy", "—"); put("EngAppBy", "—");
    }
    // title block text, units and tolerance block, release note: edited in each sheet's format. Line lengths fit the format's boxes
    // (tolerance box 33 mm wide at 2.0 mm text = 25 chars x 4 lines; release-note box: 3 lines of at most 25 chars at 2.0 mm).
    static void FillFormat(string t1, string t2)
    {
        Dwg.EditTemplate();
        View sh = (View)Dwg.GetFirstView();
        object[] notes = (object[])sh.GetNotes();
        if (notes != null) foreach (object o in notes)
        {
            Note n = (Note)o; string lt = n.PropertyLinkedText ?? "";
            if (lt.Contains("$PRPSHEET:\"Description\"")) { n.SetText(t1 + "\n" + t2); Size(n, 0.0036); }
            else if (lt.Contains("SW-File Name")) Size(n, 0.0042);
            else if (lt.Contains("$PRP:\"Revision\"")) Size(n, 0.0030);
            else if (lt.Contains("$PRP:\"DrawnDate\"")) Size(n, 0.0016);   // the ISO date fills the 11 mm DATE box at the default height
            else if (lt.Contains("COMPANYNAME")) { Size(n, 0.0040); Annotation an = (Annotation)n.GetAnnotation(); TextFormat tf = (TextFormat)an.GetTextFormat(0); tf.TypeFaceName = "Century Gothic"; an.SetTextFormat(0, false, tf); }
            else if (lt.StartsWith("DIMENSIONS ARE IN INCHES")) { Size(n, 0.0020); n.SetText("DIMENSIONS IN MM\nTHIRD-ANGLE PROJECTION\nTOLERANCES: SEE TABLE\nFITS: hardware.json"); }
            else if (lt.StartsWith("THE INFORMATION CONTAINED")) { Size(n, 0.0020); n.SetText("UC BERKELEY CAPSTONE\nREV " + REV + " " + DATE + "\nFIRST-ARTICLE M1–M7 APPLY"); }
            else if (lt == "PROPRIETARY AND CONFIDENTIAL") { Size(n, 0.0020); n.SetText("DESIGN-BUILD-FLY"); }
            else if (lt.Contains("$PRPSHEET:\"Material\"") || lt.Contains("$PRPSHEET:\"Finish\"")) n.SetText("SEE PARTS LIST");
        }
        Dwg.EditSheet();
    }
    static void Size(Note n, double h) { Annotation an = (Annotation)n.GetAnnotation(); TextFormat tf = (TextFormat)an.GetTextFormat(0); tf.CharHeight = h; an.SetTextFormat(0, false, tf); }

    // ---------- layout registry: every item on a sheet is a box; Check() reports overlaps and title-block collisions ----------
    class Box { public string Name, Kind, Owner; public double X0, Y0, X1, Y1; }
    static Dictionary<string, List<Box>> BoxMap = new Dictionary<string, List<Box>>();
    static Dictionary<string, List<VI>> ViewMap = new Dictionary<string, List<VI>>();
    static string CurSheet = "";
    static List<Box> Boxes { get { if (!BoxMap.ContainsKey(CurSheet)) BoxMap[CurSheet] = new List<Box>(); return BoxMap[CurSheet]; } }
    static List<VI> Views { get { if (!ViewMap.ContainsKey(CurSheet)) ViewMap[CurSheet] = new List<VI>(); return ViewMap[CurSheet]; } }
    static void Reg(string name, string kind, string owner, double x0, double y0, double x1, double y1)
    {
        Boxes.Add(new Box { Name = name, Kind = kind, Owner = owner, X0 = Math.Min(x0, x1), Y0 = Math.Min(y0, y1), X1 = Math.Max(x0, x1), Y1 = Math.Max(y0, y1) });
    }
    static bool Hits(Box a, Box b, double tol) { return a.X0 < b.X1 - tol && b.X0 < a.X1 - tol && a.Y0 < b.Y1 - tol && b.Y0 < a.Y1 - tol; }
    static void Check()
    {
        foreach (VI vi in Views) vi.Register();
        List<Box> bx = Boxes; int bad = 0;
        Box border = new Box { X0 = XMIN - 0.002, Y0 = YMIN - 0.002, X1 = XMAX + 0.002, Y1 = YMAX + 0.002 };
        Box app = new Box { Name = "application block", X0 = TB_X1, Y0 = 0, X1 = 1, Y1 = TB_Y1 }, tb = new Box { Name = "title block", X0 = TB_X2, Y0 = 0, X1 = 1, Y1 = TB_Y2 };
        foreach (Box b in bx)
        {
            if (b.X0 < border.X0 || b.Y0 < border.Y0 || b.X1 > border.X1 || b.Y1 > border.Y1) { Log(string.Format(IC, "  OUT OF BOUNDS {0} [{1:0.000},{2:0.000}]-[{3:0.000},{4:0.000}]", b.Name, b.X0, b.Y0, b.X1, b.Y1)); bad++; }
            foreach (Box z in new[] { app, tb }) if (Hits(b, z, 0.0005)) { Log(string.Format(IC, "  COLLISION {0} with {1} [{2:0.000},{3:0.000}]-[{4:0.000},{5:0.000}]", b.Name, z.Name, b.X0, b.Y0, b.X1, b.Y1)); bad++; }
        }
        for (int i = 0; i < bx.Count; i++) for (int j = i + 1; j < bx.Count; j++)
        {
            Box a = bx[i], b = bx[j];
            bool aDim = a.Kind == "dimtext" || a.Kind == "dimline", bDim = b.Kind == "dimtext" || b.Kind == "dimline";
            if (aDim && b.Kind == "view" && a.Owner == b.Name) continue;
            if (bDim && a.Kind == "view" && b.Owner == a.Name) continue;
            if (a.Kind == "dimline" && b.Kind == "dimline" && a.Owner == b.Owner) continue;   // stacked rows of one view
            if (aDim && bDim && a.Owner == b.Owner && a.Name.Replace("dimline", "dim") == b.Name.Replace("dimline", "dim")) continue;   // a dimension's own text and line
            if ((a.Kind == "balloon" && b.Kind == "view") || (b.Kind == "balloon" && a.Kind == "view")) continue;   // leaders cross the view by design
            if (Hits(a, b, 0.0005)) { Log(string.Format(IC, "  OVERLAP {0} x {1} [{2:0.000},{3:0.000}]-[{4:0.000},{5:0.000}] vs [{6:0.000},{7:0.000}]-[{8:0.000},{9:0.000}]", a.Name, b.Name, a.X0, a.Y0, a.X1, a.Y1, b.X0, b.Y0, b.X1, b.Y1)); bad++; }
        }
        Log(string.Format("sheet {0}: {1} items registered, {2} layout problems", CurSheet, bx.Count, bad));
    }

    // ---------- views ----------
    class VI
    {
        public View V; public double[] G; public double[] Used = new double[4]; public string Name;   // Used: depth of the dimension stack on each side (T, B, L, R)
        public double Ext(int side) { return Used[side] > 0 ? Used[side] + 0.002 : 0; }
        public void Register() { Reg(Name, "view", Name, G[0] - Ext(2), G[1] - Ext(1), G[2] + Ext(3), G[3] + Ext(0)); }
    }
    static double[] Outline(View v) { double[] o = (double[])v.GetOutline(); return o; }
    // model view placed so that its outline is centred on (cx, cy); scaleDen = 10 means 1:10
    static VI Place(string name, string path, string orient, double cx, double cy, double scaleDen, bool hidden)
    {
        View v = Dwg.CreateDrawViewFromModelView3(path, orient, cx, cy, 0);
        if (v == null) { Log("VIEW FAILED " + orient + " " + path); return null; }
        v.ScaleDecimal = 1.0 / scaleDen;
        if (hidden) v.SetDisplayMode3(false, (int)swDisplayMode_e.swHIDDEN_GREYED, false, true);
        return Centre(name, v, cx, cy);
    }
    static VI Centre(string name, View v, double cx, double cy)
    {
        Doc.EditRebuild3();
        double[] o = Outline(v);
        double[] pos = (double[])v.Position;
        v.Position = new double[] { pos[0] + cx - (o[0] + o[2]) / 2, pos[1] + cy - (o[1] + o[3]) / 2 };
        Doc.EditRebuild3();
        VI vi = new VI { V = v, Name = name, G = Outline(v) };
        Views.Add(vi);
        Log(string.Format(IC, "  view {0} scale 1:{1:0.#} outline [{2:0.000},{3:0.000}]-[{4:0.000},{5:0.000}]", name, 1 / v.ScaleDecimal, vi.G[0], vi.G[1], vi.G[2], vi.G[3]));
        return vi;
    }
    // choose the largest standard scale whose outline fits the zone, then centre the view in the zone
    static void Fit(VI vi, double x0, double y0, double x1, double y1, double[] scaleDens)
    {
        foreach (double s in scaleDens)
        {
            vi.V.ScaleDecimal = 1.0 / s; Doc.EditRebuild3();
            double[] o = Outline(vi.V);
            if (o[2] - o[0] <= x1 - x0 && o[3] - o[1] <= y1 - y0) break;
        }
        double[] oo = Outline(vi.V); double[] pos = (double[])vi.V.Position;
        vi.V.Position = new double[] { pos[0] + (x0 + x1) / 2 - (oo[0] + oo[2]) / 2, pos[1] + (y0 + y1) / 2 - (oo[1] + oo[3]) / 2 };
        Doc.EditRebuild3(); vi.G = Outline(vi.V);
        Log(string.Format(IC, "  fit {0} scale 1:{1:0.#} outline [{2:0.000},{3:0.000}]-[{4:0.000},{5:0.000}]", vi.Name, 1 / vi.V.ScaleDecimal, vi.G[0], vi.G[1], vi.G[2], vi.G[3]));
    }
    static string Scale(VI vi) { double s = 1 / vi.V.ScaleDecimal; return s >= 1 ? "1:" + s.ToString("0.#", IC) : (1 / s).ToString("0.#", IC) + ":1"; }

    // ---------- geometry helpers ----------
    static double[] ToSheet(View v, double x, double y, double z)
    {
        MathPoint p = (MathPoint)mu.CreatePoint(new double[] { x, y, z });
        MathPoint q = (MathPoint)p.MultiplyTransform((MathTransform)v.ModelToViewTransform);
        double[] r = (double[])q.ArrayData; return new[] { r[0], r[1] };
    }
    static double[] SheetToViewSketch(View v, double sx, double sy)
    {
        MathPoint p = (MathPoint)mu.CreatePoint(new double[] { sx, sy, 0 });
        MathPoint q = (MathPoint)p.MultiplyTransform((MathTransform)((Sketch)v.GetSketch()).ModelToSketchTransform);
        double[] r = (double[])q.ArrayData; return new[] { r[0], r[1] };
    }
    static int SideIndex(char side) { return side == 'T' ? 0 : side == 'B' ? 1 : side == 'L' ? 2 : 3; }
    const double DIM_CHAR = 0.0023, DIM_H = 0.0036, DIM_GAP = 0.008;   // estimated dimension text size (template font ~3.2 mm) and row spacing
    // Driven dimension between two model points. side = 'T','B','L','R' stacks the dimension outward on that side of the
    // view's geometry outline (call order = inner to outer: shortest span first). tolMin/tolMax (m) add a bilateral
    // tolerance (symmetric when tolMin = -tolMax); prefix/suffix add text on the value line; callout adds a line below it.
    static DisplayDimension Dim(VI vi, double[] m1, double[] m2, char side, string prefix = null, int decimals = 0, double tolMin = 0, double tolMax = 0, string suffix = null, string callout = null, double along = 0)
    {
        View v = vi.V;
        double[] s1 = ToSheet(v, m1[0], m1[1], m1[2]), s2 = ToSheet(v, m2[0], m2[1], m2[2]);
        double[] o = vi.G; int si = SideIndex(side); bool horiz = side == 'T' || side == 'B';
        if (horiz && Math.Abs(s1[0] - s2[0]) < 1e-6) { Log("  DIM SKIPPED (zero horizontal extent) " + vi.Name + " " + prefix + callout); return null; }
        if (!horiz && Math.Abs(s1[1] - s2[1]) < 1e-6) { Log("  DIM SKIPPED (zero vertical extent) " + vi.Name + " " + prefix + callout); return null; }
        double span = horiz ? Math.Abs(s1[0] - s2[0]) : Math.Abs(s1[1] - s2[1]);
        // estimated text block
        string pre = (prefix ?? "").Replace("<MOD-DIAM>", "Ø"), suf = suffix ?? "", cal = (callout ?? "").Replace("<MOD-DIAM>", "Ø");
        int chars = pre.Length + 6 + suf.Length + (tolMax > 0 || tolMin < 0 ? 5 : 0);
        double tw = chars * DIM_CHAR, th = DIM_H;
        // the callout is a separate note placed beyond the value text (away from the part), so no extension line crosses it:
        // below a 'B' dimension line (5 mm past it, the overshoot is 2 mm), above a 'T' value, beside an 'L'/'R' value
        double cw = cal.Length * NOTE_H * 0.72, chh = 0.0036, cx0 = 0, cy0 = 0;
        double tx, ty; bool narrow;
        // narrow feature (text wider than the span, allowing for the arrowheads): the text goes outside the extension lines,
        // right of a horizontal span / above a vertical span, and the arrows are set outside, so no line crosses a character
        if (horiz)
        {
            double off = vi.Used[si] + DIM_GAP + th / 2;
            double mid = (s1[0] + s2[0]) / 2; ty = side == 'T' ? o[3] + off : o[1] - off;
            narrow = tw > span - 0.004;
            tx = narrow ? Math.Max(s1[0], s2[0]) + 0.005 + tw / 2 : mid + along;
            double extra = cal.Length > 0 ? (side == 'B' ? 0.005 + chh : 0.002 + chh) : 0;
            vi.Used[si] += DIM_GAP + th + extra;
            if (cal.Length > 0) { cx0 = mid - cw / 2; cy0 = side == 'B' ? ty - th / 2 - 0.005 : ty + th / 2 + 0.002 + chh; }
        }
        else
        {
            double off = vi.Used[si] + DIM_GAP + tw / 2;
            double mid = (s1[1] + s2[1]) / 2; tx = side == 'R' ? o[2] + off : o[0] - off;
            narrow = th + 0.006 > span;
            ty = narrow ? Math.Max(s1[1], s2[1]) + 0.004 + th / 2 : mid + along;
            double extra = cal.Length > 0 ? 0.003 + cw : 0;
            vi.Used[si] += DIM_GAP + tw + extra;
            if (cal.Length > 0) { cx0 = side == 'R' ? tx + tw / 2 + 0.003 : tx - tw / 2 - 0.003 - cw; cy0 = ty + chh / 2; }
        }
        Doc.ClearSelection2(true); Doc.Extension.SelectByID2(v.Name, "DRAWINGVIEW", 0, 0, 0, false, 0, null, 0);
        Dwg.ActivateView(v.Name);
        double[] b1 = SheetToViewSketch(v, s1[0], s1[1]), b2 = SheetToViewSketch(v, s2[0], s2[1]);
        Doc.SketchManager.AddToDB = true;
        SketchPoint p1 = Doc.SketchManager.CreatePoint(b1[0], b1[1], 0), p2 = Doc.SketchManager.CreatePoint(b2[0], b2[1], 0);
        Doc.SketchManager.AddToDB = false;
        if (p1 == null || p2 == null) { Log("  DIM POINTS FAILED " + vi.Name); return null; }
        Doc.ClearSelection2(true); p1.Select4(false, null); p2.Select4(true, null);
        DisplayDimension dd = horiz ? (DisplayDimension)Doc.AddHorizontalDimension2(tx, ty, 0) : (DisplayDimension)Doc.AddVerticalDimension2(tx, ty, 0);   // text position is in sheet coordinates
        if (dd == null) { Log("  DIMENSION FAILED " + vi.Name + " " + prefix); return null; }
        if (decimals > 0) dd.SetPrecision3(decimals, decimals, decimals, decimals);
        if (narrow) { try { dd.ArrowSide = (int)swDimensionArrowsSide_e.swDimArrowsOutside; } catch (Exception ex) { Log("  arrow side not set: " + ex.Message); } }
        if (prefix != null) dd.SetText((int)swDimensionTextParts_e.swDimensionTextPrefix, prefix);
        if (suffix != null) dd.SetText((int)swDimensionTextParts_e.swDimensionTextSuffix, suffix);
        if (tolMax > 0 || tolMin < 0)
        {
            Dimension dim = (Dimension)dd.GetDimension2(0);
            dim.SetToleranceType(Math.Abs(tolMin + tolMax) < 1e-9 ? (int)swTolType_e.swTolSYMMETRIC : (int)swTolType_e.swTolBILAT);
            dim.SetToleranceValues(tolMin, tolMax);
            dim.SetToleranceFontInfo(1, 0.8, 0);
        }
        Doc.ClearSelection2(true);
        double val = ((Dimension)dd.GetDimension2(0)).SystemValue * 1000;
        if (val < 1e-6) Log("  DIM ZERO " + vi.Name + " " + prefix);
        string label = pre + val.ToString("0.0", IC) + (cal.Length > 0 ? " (" + cal + ")" : "");
        // where SOLIDWORKS actually put the text (a narrow dimension's text is jogged sideways); the callout is placed from that
        try
        {
            double[] ap = (double[])((Annotation)dd.GetAnnotation()).GetPosition();
            if (ap != null && ap.Length >= 2 && Math.Abs(ap[0] - tx) < 0.05 && Math.Abs(ap[1] - ty) < 0.05) { tx = ap[0]; ty = ap[1]; }
        }
        catch (Exception) { }
        if (cal.Length > 0)
        {
            if (horiz) cy0 = side == 'B' ? ty - th / 2 - 0.005 : ty + th / 2 + 0.002 + chh;
            else if (narrow)
            {
                // the jogged text starts 6 mm beyond the dimension line (right of it for 'R', left for 'L'); the callout goes
                // directly under that text, aligned to its outer edge, clear of the vertical dimension line and the jog
                cx0 = side == 'R' ? tx + 0.006 : tx - 0.006 - cw; cy0 = ty - th / 2 - 0.001;
            }
            else { cx0 = side == 'R' ? tx + tw / 2 + 0.004 : tx - tw / 2 - 0.004 - cw; cy0 = ty + chh / 2; }
        }
        Reg(vi.Name + " dim " + label, "dimtext", vi.Name, tx - tw / 2, ty - th / 2, tx + tw / 2, ty + th / 2);
        if (cal.Length > 0)
        {
            Doc.ClearSelection2(true);
            Note cn = (Note)Doc.InsertNote(callout.Replace("<MOD-DIAM>", "Ø"));
            if (cn != null)
            {
                Annotation ca = (Annotation)cn.GetAnnotation(); ca.SetPosition2(cx0, cy0, 0);
                TextFormat ctf = (TextFormat)ca.GetTextFormat(0); ctf.CharHeight = NOTE_H; ca.SetTextFormat(0, false, ctf);
                double[] ce = (double[])cn.GetExtent();
                Reg(vi.Name + " callout " + cal, "dimtext", vi.Name, ce[0], ce[1], ce[3], ce[4]);
            }
            else Log("  CALLOUT NOTE FAILED " + cal);
        }
        if (horiz) Reg(vi.Name + " dimline " + label, "dimline", vi.Name, Math.Min(s1[0], s2[0]), ty - 0.001, Math.Max(s1[0], s2[0]), ty + 0.001);
        else Reg(vi.Name + " dimline " + label, "dimline", vi.Name, tx - 0.001, Math.Min(s1[1], s2[1]), tx + 0.001, Math.Max(s1[1], s2[1]));
        Log(string.Format(IC, "  dim {0} {1} = {2:0.###} mm at ({3:0.000},{4:0.000}) span {5:0.000}{6}", vi.Name, label, val, tx, ty, span, narrow ? " (narrow: text outside, arrows outside)" : ""));
        return dd;
    }
    static string Wrap(string text, int width)
    {
        var outp = new List<string>();
        foreach (string line in text.Split('\n'))
        {
            string l = line; string indent = "    ";
            while (l.Length > width)
            {
                int cut = l.LastIndexOf(' ', width); if (cut < width / 2) cut = width;
                outp.Add(l.Substring(0, cut)); l = indent + l.Substring(cut).TrimStart();
            }
            outp.Add(l);
        }
        return string.Join("\n", outp.ToArray());
    }
    // free note with its top-left corner at (x, y); registered with its real extent
    static Note Label(string name, double x, double y, string text, double h)
    {
        Doc.ClearSelection2(true);
        Note n = (Note)Doc.InsertNote(text);
        if (n == null) { Log("  NOTE FAILED " + name); return null; }
        Annotation an = (Annotation)n.GetAnnotation(); an.SetPosition2(x, y, 0);
        TextFormat tf = (TextFormat)an.GetTextFormat(0); tf.CharHeight = h; an.SetTextFormat(0, false, tf);
        double[] e = (double[])n.GetExtent();
        Reg(name, "note", "", e[0], e[1], e[3], e[4]);
        Log(string.Format(IC, "  note {0} [{1:0.000},{2:0.000}]-[{3:0.000},{4:0.000}] {5} lines", name, e[0], e[1], e[3], e[4], text.Split('\n').Length));
        return n;
    }
    // view title below the view, under its last bottom dimension row
    static void LabelBelow(VI vi, string text)
    {
        double y = vi.G[1] - vi.Ext(1) - 0.003;
        Label(vi.Name + " label", Math.Max(XMIN, vi.G[0]), y, text + "  " + Scale(vi), LABEL_H);
    }
    // numbered notes block, top-left at (x, y), wrapped to width metres
    static void Notes(double x, double y, string text, double width)
    {
        Label("notes", x, y, Wrap("NOTES\n" + text, (int)(width / (NOTE_H * 0.72))), NOTE_H);
    }
    static void BeginSheet(string name, double scaleDen, string t1, string t2)
    {
        if (SheetCount == 0)
        {
            Sheet s = (Sheet)Dwg.GetCurrentSheet(); s.SetName(name);
            Dwg.SetupSheet5(name, (int)swDwgPaperSizes_e.swDwgPaperBsize, (int)swDwgTemplates_e.swDwgTemplateCustom, 1, scaleDen, false, Fmt, 0, 0, "Default", true);
        }
        else
        {
            Dwg.NewSheet4(name, (int)swDwgPaperSizes_e.swDwgPaperBsize, (int)swDwgTemplates_e.swDwgTemplateCustom, 1, scaleDen, false, Fmt, 0, 0, "Default", 0, 0, 0, 0, 0, 0);
            Dwg.ActivateSheet(name);
        }
        SheetCount++; CurSheet = name; Titles.Add(new[] { t1, t2 }); SheetScales.Add(scaleDen);
        Log("=== sheet " + SheetNumber(name) + " " + name);
    }
    // general-tolerance table (bottom-left of every sheet) then the layout check
    static void EndSheet()
    {
        var rows = new List<string[]> { new[] { "GENERAL TOLERANCES", "UNLESS NOTED" },
            new[] { "PRINTED PARTS (DESKTOP FDM)", "±0.5 % OF SIZE, MIN ±0.5" },
            new[] { "CONTROLLED BORES, INSERT HOLES", "FIT TABLE FT02 / FT03 / FT08 (hardware.json)" },
            new[] { "HOLE POSITION", "Ø0.4; MOTOR PATTERN Ø0.2" },
            new[] { "CUT TUBES (ISO 2768-m), ANGLES", "±0.5 (120–400), ±0.8 (400–1000); ±1°" } };
        Table("tolerance table", 0.018, 0.039, rows, new[] { 0.062, 0.092 }, NOTE_H, 0.0045);
        Check();
    }
    static string Part(string n) { return Path.Combine(ModelDir, n + ".SLDPRT"); }
    static void Open(string path, int type) { int e = 0, w = 0; sw.OpenDoc6(path, type, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref e, ref w); sw.ActivateDoc3(Doc.GetTitle(), false, 0, ref e); }
    // general table from rows, top-left at (x, y); column widths in m; rows whose text exceeds the column get a taller row
    static TableAnnotation Table(string name, double x, double y, List<string[]> rows, double[] widths, double charH, double rowH)
    {
        int cols = widths.Length;
        TableAnnotation t = (TableAnnotation)Dwg.InsertTableAnnotation2(false, x, y, (int)swBOMConfigurationAnchorType_e.swBOMConfigurationAnchor_TopLeft, "", rows.Count, cols);
        if (t == null) { Log("  TABLE FAILED " + name); return null; }
        for (int i = 0; i < rows.Count; i++) for (int j = 0; j < cols; j++) t.set_Text(i, j, j < rows[i].Length ? rows[i][j] : "");
        TextFormat tf = (TextFormat)t.GetTextFormat(); tf.CharHeight = charH; t.SetTextFormat(false, tf);
        for (int j = 0; j < cols; j++) t.SetColumnWidth(j, widths[j], 0);
        double total = 0, wsum = 0; foreach (double wd in widths) wsum += wd;
        for (int i = 0; i < rows.Count; i++)
        {
            int lines = 1;
            for (int j = 0; j < cols && j < rows[i].Length; j++)
            {
                int cap = Math.Max(1, (int)((widths[j] - 0.002) / (charH * 0.72))); int n = 0;
                foreach (string ln in rows[i][j].Split('\n')) n += 1 + Math.Max(0, ln.Length - 1) / cap;
                lines = Math.Max(lines, n);
            }
            double h = Math.Max(rowH, charH * 1.9) + (lines - 1) * charH * 1.6; t.SetRowHeight(i, h, 0); total += h;   // SOLIDWORKS will not go below ~1.9 x the text height
        }
        Reg(name, "table", "", x, y - total, x + wsum, y);
        Log(string.Format(IC, "  table {0} {1} rows [{2:0.000},{3:0.000}]-[{4:0.000},{5:0.000}]", name, rows.Count, x, y - total, x + wsum, y));
        return t;
    }

    // ---------- sheet 1: general arrangement ----------
    static void Sheet1_GA()
    {
        BeginSheet("GA", 20, "LIFT + CRUISE VTOL", "GENERAL ARRANGEMENT");
        string asm = Path.Combine(ModelDir, "VTOL_Concept.SLDASM");
        Open(asm, (int)swDocumentTypes_e.swDocASSEMBLY);
        // third-angle: plan above the front elevation, side elevation to its right, isometric top right under the revision table
        VI front = Place("front elevation", asm, "*Right", 0.128, 0.100, 20, false);
        Doc.ClearSelection2(true); Doc.Extension.SelectByID2(front.V.Name, "DRAWINGVIEW", 0, 0, 0, false, 0, null, 0);
        View planV = Dwg.CreateUnfoldedViewAt3(0.128, 0.196, 0, false);
        Doc.ClearSelection2(true); Doc.Extension.SelectByID2(front.V.Name, "DRAWINGVIEW", 0, 0, 0, false, 0, null, 0);
        View sideV = Dwg.CreateUnfoldedViewAt3(0.290, 0.100, 0, false);
        Doc.EditRebuild3();
        VI plan = new VI { V = planV, Name = "plan", G = Outline(planV) }; Views.Add(plan);
        VI side = new VI { V = sideV, Name = "side elevation", G = Outline(sideV) }; Views.Add(side);
        Log(string.Format(IC, "  view plan outline [{0:0.000},{1:0.000}]-[{2:0.000},{3:0.000}]", plan.G[0], plan.G[1], plan.G[2], plan.G[3]));
        Log(string.Format(IC, "  view side outline [{0:0.000},{1:0.000}]-[{2:0.000},{3:0.000}]", side.G[0], side.G[1], side.G[2], side.G[3]));
        double span = 2 * (D("panelLen") + D("fusR"));
        var rev = new List<string[]> { new[] { "REV", "DATE", "DESCRIPTION", "BY" },
            new[] { "A", "2026-10-18", "CONCEPT GEOMETRY FOR DESIGN REVIEW (v0.3.1), 5 SHEETS", "DBF" },
            new[] { "B", "2026-10-21", "HARDWARE SPEC APPLIED: SPLIT MOUNTS AND CLAMPS, BOOM\nSPLICE, M5 WING BOLTS, RUDDERS, ALL FASTENERS,\nTOLERANCES, FASTENER SCHEDULE; 9 SHEETS", "DBF" },
            new[] { "C", "2026-10-23", "DRAWING LAYOUT AND BALLOONING CORRECTED", "DBF" },
            new[] { "D", "2026-10-25", "WING RESIZED FOR R11 STALL (CHORD 266.6, S 0.640 M2);\nSIZES FROM PARAMS", "DBF" },
            new[] { "E", DATE, "WING RESIZED TO 11.75 M/S DESIGN STALL (CHORD " + Mm("chord", "0.0") + ", S " + (D("chord") * span).ToString("0.000", IC) + " M2)", "DBF" } };
        Table("revision table", 0.245, 0.262, rev, new[] { 0.012, 0.024, 0.118, 0.012 }, NOTE_H, 0.0045);
        double revBottom = Boxes[Boxes.Count - 1].Y0;
        VI iso = Place("isometric", asm, "*Isometric", 0.322, 0.185, 20, false);
        Fit(iso, 0.240, 0.142, 0.412, revBottom - 0.004, new[] { 20.0, 25, 30, 40 });
        double half = D("panelLen") + D("fusR"), yB = D("yB"), yIn = D("yIn"), xF = D("xFront"), xR = D("xRear"), x0 = D("xStub0");
        double yG = D("yGround"), finTop = D("yFin") + D("vH"), finX = D("xFinLE"), pushX = D("pushX"), yProp = D("yProp"), yPod = D("yPod");
        Dim(plan, new[] { xF, yB, yIn }, new[] { xF, yB, -yIn }, 'T', null, 0, 0, 0, null, "LIFT MOTOR SPACING");
        Dim(front, new[] { 0.0, 0, half }, new[] { 0.0, 0, -half }, 'T', null, 0, 0, 0, null, "SPAN");
        Dim(plan, new[] { D("tailX") + D("fusL"), yPod, 0.0 }, new[] { x0, yB, yIn }, 'R', null, 0, 0, 0, null, "OVERALL LENGTH");
        Dim(plan, new[] { xF, yB, -yIn }, new[] { xR, yB, -yIn }, 'L', null, 0, 0, 0, null, "BOOM PITCH");
        Dim(front, new[] { finX, yG, -yIn }, new[] { finX, finTop, -yIn }, 'L', null, 0, 0, 0, null, "HEIGHT");
        Dim(front, new[] { pushX, yPod - D("pushProp") / 2, 0.0 }, new[] { pushX, yPod + D("pushProp") / 2, 0.0 }, 'R', "<MOD-DIAM>", 0, 0, 0, null, "PUSHER PROP");
        Dim(side, new[] { xF - D("liftProp") / 2, yProp, yIn }, new[] { xF + D("liftProp") / 2, yProp, yIn }, 'T', "<MOD-DIAM>", 0, 0, 0, null, "LIFT PROP");
        LabelBelow(front, "FRONT ELEVATION"); LabelBelow(plan, "PLAN"); LabelBelow(side, "SIDE ELEVATION"); LabelBelow(iso, "ISOMETRIC");
        Notes(0.018, 0.072, "1. DIMENSIONS IN MM, THIRD-ANGLE PROJECTION. PROPS SHOWN PARKED FORE-AFT (NOTIONAL: THE ESCs CANNOT PARK THEM).\n2. SIZED CONCEPT, MTOW " + D("mtow").ToString("0.00", IC) + " kg, SPAN " + Mm(span, "0") + " (analysis/results.json). EVERY FASTENER IS MODELLED: SHEETS 2, 3 AND 8.\n3. TRANSPORT BREAKDOWN: 2 x M5 WING BOLTS, 8 x M3 BOOM-CLAMP SCREWS, 4 x M3 TAIL-SHOE SCREWS; THE JOINER SLIDES OUT OF THE SADDLE (SHEET 4).\n4. NO-PAYLOAD FLIGHT: 0.5 kg BALLAST IN THE PAYLOAD BAY KEEPS THE CG AT 28 % MAC. PUSHER PROP GROUND CLEARANCE " + ((yPod - D("pushProp") / 2 - yG) * 1000).ToString("0", IC) + " mm.", NOTES_W);
        EndSheet();
    }

    // ---------- sheet 2: exploded assembly ----------
    static VI exploded;
    static void Sheet2_Exploded()
    {
        BeginSheet("EXPLODED", 10, "EXPLODED ASSEMBLY", "WITH BALLOONS");
        string asm = Path.Combine(ModelDir, "VTOL_Exploded.SLDASM");
        Open(asm, (int)swDocumentTypes_e.swDocASSEMBLY);
        exploded = Place("exploded isometric", asm, "*Isometric", 0.217, 0.168, 10, false);
        Fit(exploded, 0.090, 0.088, 0.345, 0.250, new[] { 10.0, 15, 20 });
        LabelBelow(exploded, "EXPLODED ISOMETRIC");
        Notes(0.018, 0.072, "1. EXPLODED LAYOUT (VTOL_Exploded.SLDASM): PARTS MOVED BY THE OFFSETS IN cad/params.mjs; FASTENERS PULLED 50 mm ALONG THEIR AXES.\n2. ONE BALLOON PER MAJOR PART TYPE; ITEM NUMBERS ARE THOSE OF THE PARTS LIST (SHEET 3). FASTENERS, INSERTS AND SMALL PRINTED HARDPOINTS ARE NOT BALLOONED: SEE SHEETS 3, 8 AND 9.\n3. JOINT IDs (J01–J20) AND FITS (FT01–FT11): docs/research/hardware-spec.md.", NOTES_W);
    }
    // major parts that get a balloon (one per type); fasteners and small hardpoints are covered by sheets 3, 8 and 9
    static readonly string[] BalloonParts = { "Fuselage_Pod", "Canopy", "Battery_6S_LiPo", "Wing_Panel_R", "Wing_Panel_L", "Aileron_R", "Spar_Tube", "Wing_Joiner", "Wing_Saddle",
        "Boom_Front", "Boom_Rear_Stub", "Motor_Mount_Upper", "Lift_Motor", "Lift_Prop", "Boom_Clamp_F_Upper", "Gear_Clamp_Upper", "Landing_Leg", "Gear_Fairing",
        "Tail_Clamp_Upper", "H_Tail", "Elevator", "Fin", "Servo", "Pusher_Motor", "Pusher_Prop_14in" };
    static Dictionary<string, string> BomItem = new Dictionary<string, string>();
    class Cand { public Component2 C; public string Part; public double X, Y; public Entity E; public double[] Mid; public double AX, AY; }
    static void Balloons()
    {
        Dwg.ActivateSheet("EXPLODED"); CurSheet = "EXPLODED";
        View v = exploded.V; double cx = (exploded.G[0] + exploded.G[2]) / 2;
        var best = new Dictionary<string, Cand>();
        object[] comps = (object[])v.GetVisibleComponents();
        Log("  visible components " + (comps == null ? 0 : comps.Length));
        if (comps != null) foreach (object o in comps)
        {
            Component2 c = (Component2)o; string n = c.Name2; int slash = n.LastIndexOf('/'); if (slash >= 0) n = n.Substring(slash + 1);
            int dash = n.LastIndexOf('-'); string part = dash > 0 ? n.Substring(0, dash) : n;
            if (Array.IndexOf(BalloonParts, part) < 0) continue;
            double[] pos = null;
            try { MathTransform t = (MathTransform)c.Transform2; if (t != null) { double[] d = (double[])t.ArrayData; pos = new[] { d[9], d[10], d[11] }; } } catch (Exception) { }
            if (pos == null && XPos.ContainsKey(part)) { int inst = 1; int.TryParse(n.Substring(dash + 1), out inst); List<double[]> lst = XPos[part]; pos = lst[Math.Min(Math.Max(inst, 1), lst.Count) - 1]; }
            if (pos == null) { Log("  no position for " + n); continue; }
            double[] s = ToSheet(v, pos[0], pos[1], pos[2]);
            Cand cand = new Cand { C = c, Part = part, X = s[0], Y = s[1] };
            if (!best.ContainsKey(part) || Math.Abs(cand.X - cx) > Math.Abs(best[part].X - cx)) best[part] = cand;   // outermost instance: shortest leader
        }
        // attachment: the longest straight-ish edge of the instance (silhouette of the part), at its midpoint
        var left = new List<Cand>(); var right = new List<Cand>();
        foreach (Cand c in best.Values)
        {
            object[] ents = null;
            try { ents = (object[])v.GetVisibleEntities2(c.C, (int)swViewEntityType_e.swViewEntityType_Edge); } catch (Exception ex) { Log("  edges error " + c.Part + " " + ex.Message); }
            if (ents == null || ents.Length == 0) { Log("  NO EDGES " + c.Part); continue; }
            double bestL = -1;
            foreach (object eo in ents)
            {
                try
                {
                    Edge ed = (Edge)eo; double[] cp = (double[])ed.GetCurveParams2();
                    double L = Math.Sqrt(Math.Pow(cp[3] - cp[0], 2) + Math.Pow(cp[4] - cp[1], 2) + Math.Pow(cp[5] - cp[2], 2));
                    if (L > bestL) { bestL = L; c.E = (Entity)eo; c.Mid = new[] { (cp[0] + cp[3]) / 2, (cp[1] + cp[4]) / 2, (cp[2] + cp[5]) / 2 }; }
                }
                catch (Exception) { }
            }
            if (c.E == null) c.E = (Entity)ents[0];
            c.AX = c.X; c.AY = c.Y;
            if (c.Mid != null) { double[] ms = ToSheet(v, c.Mid[0], c.Mid[1], c.Mid[2]); c.AX = ms[0]; c.AY = ms[1]; }
            (c.AX < cx ? left : right).Add(c);
        }
        // balance the columns (max 14 per side between y 0.090 and 0.246)
        Comparison<Cand> byDist = (p, q) => Math.Abs(p.AX - cx).CompareTo(Math.Abs(q.AX - cx));
        while (left.Count > 14) { left.Sort(byDist); right.Add(left[0]); left.RemoveAt(0); }
        while (right.Count > 14) { right.Sort(byDist); left.Add(right[0]); right.RemoveAt(0); }
        int made = 0;
        for (int sideI = 0; sideI < 2; sideI++)
        {
            List<Cand> col = sideI == 0 ? left : right; double bx = sideI == 0 ? Math.Max(0.030, exploded.G[0] - 0.032) : Math.Min(0.400, exploded.G[2] + 0.032);
            col.Sort((p, q) => q.AY.CompareTo(p.AY));   // top to bottom in the order of the attachment points, so the leaders do not cross
            double y0 = Math.Max(0.090, exploded.G[1]), y1 = Math.Min(0.255, exploded.G[3] + 0.012);
            double pitch = col.Count > 1 ? Math.Min(0.012, (y1 - y0) / (col.Count - 1)) : 0;
            double top = (y0 + y1) / 2 + pitch * (col.Count - 1) / 2;
            for (int i = 0; i < col.Count; i++)
            {
                Cand c = col[i]; string item; if (!BomItem.TryGetValue(c.Part, out item)) { item = "?"; Log("  no BOM item for " + c.Part); }
                Doc.ClearSelection2(true); c.E.Select4(false, null);
                Note bn = (Note)Doc.InsertNote(item);   // a note inserted with an edge selected gets a leader to that edge
                if (bn == null) { Log("  BALLOON FAILED " + c.Part); continue; }
                if (!bn.SetBalloon((int)swBalloonStyle_e.swBS_Circular, (int)swBalloonFit_e.swBF_2Chars)) Log("  balloon style not set " + c.Part);
                Annotation an = (Annotation)bn.GetAnnotation();
                if (an.GetLeaderCount() == 0) { an.SetLeader3((int)swLeaderStyle_e.swSTRAIGHT, 0, true, false, false, false); an.SetAttachedEntities(new object[] { c.E }); }
                double by = top - pitch * i;
                an.SetPosition2(bx, by, 0);
                if (c.Mid != null) { bool okp = an.SetLeaderAttachmentPointAtIndex(0, c.AX, c.AY, 0); if (!okp) Log("  attach point not moved " + c.Part); }
                Reg("balloon " + item + " " + c.Part, "balloon", exploded.Name, bx - 0.005, by - 0.005, bx + 0.005, by + 0.005);
                Log(string.Format(IC, "  balloon {0} {1} at ({2:0.000},{3:0.000}) attached at ({4:0.000},{5:0.000})", item, c.Part, bx, by, c.AX, c.AY));
                made++;
            }
        }
        Log("balloons " + made + " (left " + left.Count + ", right " + right.Count + ")");
        Doc.ClearSelection2(true);
        EndSheet();
    }

    // ---------- sheet 3: parts list ----------
    static string Short(string s, int max)
    {
        if (s.Length <= max) return s;
        int c = s.IndexOf(':'); if (c > 20 && c <= max) return s.Substring(0, c);
        int c2 = s.IndexOf(';'); if (c2 > 20 && c2 <= max) return s.Substring(0, c2);
        int cut = s.LastIndexOf(' ', max - 1); if (cut < max / 2) cut = max - 1;
        return s.Substring(0, cut).TrimEnd(',', ';', ':', ' ') + "…";
    }
    static void Sheet3_PartsList()
    {
        BeginSheet("PARTS", 50, "LIFT + CRUISE VTOL", "PARTS LIST");
        string asm = Path.Combine(ModelDir, "VTOL_Concept.SLDASM");
        Open(asm, (int)swDocumentTypes_e.swDocASSEMBLY);
        VI fe = Place("reference elevation", asm, "*Right", 0.317, 0.098, 50, false);
        Doc.ClearSelection2(true); Doc.Extension.SelectByID2(fe.V.Name, "DRAWINGVIEW", 0, 0, 0, false, 0, null, 0);
        double rowH = 0.0052, topY = 0.262; int split = 26;   // SOLIDWORKS BOM rows are ~5.2 mm at 2.5 mm text
        try
        {
            BomTableAnnotation bom = fe.V.InsertBomTable4(false, 0.018, topY, (int)swBOMConfigurationAnchorType_e.swBOMConfigurationAnchor_TopLeft,
                (int)swBomType_e.swBomType_PartsOnly, "Default", @"C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\lang\english\bom-standard.sldbomtbt", false, 0, false);
            Log("  bom " + (bom != null));
            if (bom != null)
            {
                TableAnnotation ta = (TableAnnotation)bom;
                TextFormat tf = (TextFormat)ta.GetTextFormat(); tf.CharHeight = NOTE_H; ta.SetTextFormat(false, tf);
                double[] widths = { 0.010, 0.036, 0.073, 0.009 };
                for (int j = 0; j < 4; j++) ta.SetColumnWidth(j, widths[j], 0);
                int rows = ta.RowCount; Log("  bom rows " + rows);
                int cap = (int)((widths[2] - 0.002) / (NOTE_H * 0.72));
                for (int i = 1; i < rows; i++)
                {
                    string item = (ta.get_DisplayedText(i, 0) ?? "").Trim(), part = (ta.get_DisplayedText(i, 1) ?? "").Trim(), desc = ta.get_Text(i, 2);
                    if (i == 1) Log("  bom first row: '" + item + "' '" + part + "'");
                    if (!BomItem.ContainsKey(part)) BomItem[part] = item;
                    string sd = Short(desc ?? "", cap);
                    if (sd != desc) { try { ta.set_Text(i, 2, sd); } catch (Exception ex) { Log("  bom cell text error " + ex.Message); } }
                }
                for (int i = 0; i < rows; i++) ta.SetRowHeight(i, rowH, 0);
                double tw = 0; foreach (double wd in widths) tw += wd;
                Reg("parts list 1", "table", "", 0.018, topY - Math.Min(split, rows) * rowH, 0.018 + tw, topY);
                // three columns of tables: rows 1-25, 26-50, 51-75 (each split carries the header row); split from the end
                // first so the row indices of the original table stay valid
                int n2 = Math.Min(split - 1, rows - 1 - 2 * (split - 1)), n3 = Math.Max(0, rows - 1 - 2 * (split - 1));
                for (int k = 3; k >= 2 && rows > split; k--)
                {
                    int at = (k - 1) * (split - 1); if (rows - 1 <= (k - 1) * (split - 1)) continue;
                    try
                    {
                        TableAnnotation tk = ta.Split((int)swTableSplitLocations_e.swTableSplit_AfterRow, at);
                        if (tk == null) { Log("  bom split " + k + " failed"); continue; }
                        double xk = 0.018 + (k - 1) * (tw + 0.003);
                        Annotation an = (Annotation)tk.GetAnnotation(); an.SetPosition2(xk, topY, 0);
                        int rk = (k == 3 ? n3 : split - 1) + 1;
                        Reg("parts list " + k, "table", "", xk, topY - rk * rowH, xk + tw, topY);
                        Log("  bom split " + k + " ok, " + rk + " rows at x " + xk.ToString("0.000", IC));
                    }
                    catch (Exception ex) { Log("  bom split " + k + " error " + ex.Message); }
                }
            }
        }
        catch (Exception ex) { Log("  bom error " + ex.Message); }
        LabelBelow(fe, "REFERENCE: FRONT ELEVATION");
        Notes(0.018, 0.112, "1. ITEM NUMBERS ARE THE BALLOONS OF SHEET 2; QTY IS PER AIRCRAFT. FASTENERS, NUTS, WASHERS AND INSERTS ARE ONE LINE PER TYPE.\n2. PART NUMBER = SOLIDWORKS FILE (cad/model). FASTENER IDs F01–F13, N01–N04, W01, I01 ARE THOSE OF cad/hardware.json AND SHEET 8. FULL DESCRIPTIONS: PART FILE PROPERTIES.\n3. PURCHASED ITEMS, PRICES AND VENDORS: docs/purchasing/C0_BOM.csv.\n4. MATERIALS: 6061-T6 TUBES; A2 STAINLESS FASTENERS; BRASS INSERTS; PETG PRINTS EXCEPT MOTOR MOUNTS AND PUSHER CUP IN PA6-CF; XPS FOAM.", NOTES_W);
        EndSheet();
    }

    // ---------- sheet 4: wing panel, saddle, wing bolt ----------
    // wing surface height at chord fraction x (model Y, m): the CAD section of cad/Shared.cs Geom (params foilWing, tc, foilTE cad)
    static double NacaY(double x, bool upper)
    {
        double yt = Geom.NacaYt(x, D("tc")), yc = Geom.NacaYc(x, Geom.WingM, Geom.WingP);
        return (upper ? yc + yt : yc - yt) * D("chord");
    }
    static void Sheet4_Wing()
    {
        BeginSheet("WING", 10, "WING PANEL, SADDLE", "AND WING BOLT");
        double c = D("chord"), L = D("panelLen"), Lin = L - D("ailSpan"), sx = D("sparX"), sy = D("sparY"), r = D("sparOD") / 2, w = 2 * D("fusR");
        string wp = Part("Wing_Panel_R"); Open(wp, (int)swDocumentTypes_e.swDocPART);
        VI plan = Place("wing panel plan", wp, "*Top", 0.094, 0.170, 10, true);
        VI sec = Place("root section", wp, "*Front", 0.262, 0.228, 2, true);
        Dim(plan, new[] { 0.0, 0, 0 }, new[] { 0.0, 0, L }, 'L', null, 0, 0, 0, null, "PANEL");
        Dim(plan, new[] { 0.0, 0, 0 }, new[] { 0.0, 0, D("zBoomPanel") }, 'L');   // boom station from the root (note 1)
        Dim(plan, new[] { -c, 0, Lin }, new[] { -c, 0, L }, 'R', null, 0, 0, 0, null, null, -0.006);   // aileron span (note 1); text 6 mm toward the tip, clear of the spar-socket extension line (rev E)
        Dim(plan, new[] { sx, sy, 0 }, new[] { sx, sy, D("sparLen") }, 'R');   // spar socket (note 2)
        Dim(plan, new[] { 0.0, 0, 0 }, new[] { sx, sy, 0 }, 'T', null, 0, 0, 0, " SPAR AT 30 % CHORD");   // on the value line: a callout above it sat in the chord dimension's extension lines (rev E)
        Dim(plan, new[] { 0.0, 0, 0 }, new[] { -c, 0, 0 }, 'T', null, 0, 0, 0, " CHORD");
        Dim(sec, new[] { sx - r, sy, 0 }, new[] { sx + r, sy, 0 }, 'T', "<MOD-DIAM>", 1, -0.0001, 0.0001, null, "SPAR SOCKET = TUBE OD, BONDED FT05");
        Dim(sec, new[] { 0.0, NacaY(0, false), 0 }, new[] { -c, 0, 0 }, 'B', null, 0, 0, 0, null, "CHORD");
        Dim(sec, new[] { -0.30 * c, NacaY(0.30, false), 0 }, new[] { -0.30 * c, NacaY(0.30, true), 0 }, 'R');   // thickness at 30 % chord (note 1)
        string sd = Part("Wing_Saddle"); Open(sd, (int)swDocumentTypes_e.swDocPART);
        VI sp = Place("saddle plan", sd, "*Top", 0.215, 0.150, 5, true);   // between the panel plan dims and the saddle section (checked visually at chord 266.6)
        VI ss = Place("saddle section", sd, "*Front", 0.337, 0.121, 2, true);   // rev E: 5 mm left, 7 mm down for chord 284.2 (border, bolt-pillar label)
        Dim(sp, new[] { 0.0, 0, -w / 2 }, new[] { 0.0, 0, w / 2 }, 'L');
        Dim(sp, new[] { 0.0, 0, -w / 2 }, new[] { -c, 0, -w / 2 }, 'B', null, 0, 0, 0, null, "CHORD");
        Dim(sp, new[] { D("boltX"), 0, -D("boltZ") }, new[] { D("boltX"), 0, D("boltZ") }, 'R');
        double rj = D("joinBoreD") / 2;
        Dim(ss, new[] { sx - rj, sy, 0 }, new[] { sx + rj, sy, 0 }, 'T', "<MOD-DIAM>", 2, -0.0002, 0.0002, null, "JOINER BORE, SLIP FIT FT06");
        Dim(ss, new[] { 0.0, sy, 0 }, new[] { sx, sy, 0 }, 'B', null, 0, 0, 0, null, "JOINER AT 30 % CHORD");
        string bp = Part("Bolt_Pillar"); Open(bp, (int)swDocumentTypes_e.swDocPART);
        VI pv = Place("bolt pillar", bp, "*Front", 0.375, 0.223, 1, true);   // rev E: 5 mm down (26.0 pillar), top callout inside the border
        double h = D("pillarH"), pr = D("pillarD") / 2;
        Dim(pv, new[] { -pr, 0, 0 }, new[] { pr, 0, 0 }, 'B', "<MOD-DIAM>");
        Dim(pv, new[] { -0.0041, 0, 0 }, new[] { 0.0041, 0, 0 }, 'B', null, 1, 0, 0, " AF", "M5 NUT POCKET, " + Mm("pillarNutDepth", "0.0") + " DEEP");
        Dim(pv, new[] { pr, 0, 0 }, new[] { pr, h, 0 }, 'R', null, 1);
        Dim(pv, new[] { -0.00285, h, 0 }, new[] { 0.00285, h, 0 }, 'T', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "THRU, M5 CLEARANCE (PRINT 5.7)");
        LabelBelow(plan, "WING PANEL, RIGHT (LEFT IS MIRROR)"); LabelBelow(sec, "ROOT SECTION");
        LabelBelow(sp, "WING SADDLE"); LabelBelow(ss, "SADDLE SECTION"); LabelBelow(pv, "BOLT PILLAR");
        Notes(0.018, 0.092, "1. NACA 2415, XPS CORE, PACKING-TAPE SKIN. AILERON 26 % CHORD, 2 % HINGE GAP, OUTER " + (D("ailFrac") * 100).ToString("0", IC) + " % OF SPAN (" + Mm("ailSpan", "0") + " DIM). SPAR SOCKET " + Mm("sparLen", "0") + " DIM, BOOM STATION " + Mm("zBoomPanel", "0.0") + " FROM THE ROOT, ROOT THICKNESS " + Mm("thick30", "0.0") + " AT 30 % CHORD. SADDLE: 2X BOLT PILLARS <MOD-DIAM>" + Mm("pillarD", "0.#") + " IN <MOD-DIAM>" + Mm("pillarBoreD", "0.0") + " BORES AT " + Mm(2 * D("boltZ"), "0") + " (DIM), 70 % CHORD.\n2. SPAR SOCKET 1.000 x 0.058 in 6061-T6 BONDED " + Mm("sparLen", "0") + " mm INTO THE ROOT AT 30 % CHORD (FT05, FOAM-SAFE GLUE).\n3. JOINER 0.875 x 0.058 in, " + Mm("joinLen", "0") + " mm: SLIP FIT IN THE SOCKETS (FT01, -0.08/+0.53 DIAMETRAL, MEASURE M1) AND THE SADDLE (FT06); NOT BONDED, CAPTURED BY TWO PRINTED STOPS " + Mm(D("joinLen") / 2 - D("fusR"), "0") + " mm INSIDE THE SOCKETS.\n4. WING BOLT J10: F09 ISO 7380 M5 x 20 THROUGH THE PILLAR AND THE ROOT TONGUE (SHEET 9) INTO N02 M5 NYLOCK, 1.0 N·m EST; HEAD IN A <MOD-DIAM>10.3 x " + Mm("pillarSpot", "0.0") + " SPOT-FACE; NUT POCKET 8.2 AF x " + Mm("pillarNutDepth", "0.0") + " FROM THE LOWER SURFACE (SCREW END 0.5 PAST THE NUT, POCKET NOT ABOVE THE TONGUE-SLOT FLOOR).\n5. PANEL POCKETS (SPAR COLLAR, REAR HARDPOINT, SERVO TRAY, TONGUE, PITOT CLAMP) CUT TO THE PART OUTLINES OF SHEET 9, BONDED WITH FOAM-SAFE GLUE.\n6. SADDLE TABS: 2 x F08 M3 x 12 PER SIDE INTO RX-M3x5.7 INSERTS IN THE POD FRAME RAILS (J11).", NOTES_W);
        EndSheet();
    }

    // ---------- sheet 5: motor mount and splice ----------
    static void Sheet5_MotorMount()
    {
        BeginSheet("MOUNT", 1, "MOTOR MOUNT", "AND BOOM SPLICE");
        string up = Part("Motor_Mount_Upper"); Open(up, (int)swDocumentTypes_e.swDocPART);
        VI sec = Place("upper half section", up, "*Right", 0.078, 0.212, 1, true);
        VI top = Place("upper half top", up, "*Top", 0.216, 0.216, 1, true);
        VI sid = Place("upper half side", up, "*Front", 0.340, 0.212, 1, true);
        Dim(sec, new[] { 0.0, 0.0006, -0.0175 }, new[] { 0.0, 0.0006, 0.0175 }, 'B', null, 0, 0, 0, null, "CLAMP INSERTS");
        Dim(sec, new[] { 0.0, 0.0006, -0.023 }, new[] { 0.0, 0.0006, 0.023 }, 'B', null, 0, -0.0005, 0.0005);
        Dim(sec, new[] { 0.0, 0.0006, 0.023 }, new[] { 0.0, 0.021, 0.023 }, 'R', null, 1);
        Dim(sec, new[] { 0.0, 0, -0.0128 }, new[] { 0.0, 0, 0.0128 }, 'T', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "BORE FT02");
        Dim(sec, new[] { 0.0, 0.0165, 0.0 }, new[] { 0.0, 0.021, 0.0 }, 'R', null, 2, -0.00015, 0.00015, null, "FLOOR");
        Dim(top, new[] { -0.028, 0.021, 0 }, new[] { 0.028, 0.021, 0 }, 'T', null, 0, 0, 0, null, "4X <MOD-DIAM>4.0 ±0.1 x 7.5 DEEP, I01");
        Dim(top, new[] { -0.00884, 0.021, -0.00884 }, new[] { 0.00884, 0.021, -0.00884 }, 'B', null, 2, 0, 0, null, "4X <MOD-DIAM>3.4 THRU ON <MOD-DIAM>25 B.C., POS <MOD-DIAM>0.2");
        Dim(sid, new[] { -0.035, 0.021, 0 }, new[] { 0.035, 0.021, 0 }, 'T');
        Dim(sid, new[] { 0.035, 0.0006, 0 }, new[] { 0.035, 0.021, 0 }, 'R', null, 1);
        Dim(sid, new[] { -0.018, 0.0006, 0 }, new[] { 0.018, 0.0006, 0 }, 'B', null, 0, 0, 0, null, "2X <MOD-DIAM>3.4 THRU Z, SPLICE J04");
        string cap = Part("Motor_Mount_Cap"); Open(cap, (int)swDocumentTypes_e.swDocPART);
        VI cs = Place("cap section", cap, "*Right", 0.078, 0.125, 1, true);
        VI cb = Place("cap bottom", cap, "*Bottom", 0.340, 0.122, 1, true);
        Dim(cs, new[] { 0.0, -0.015, 0.023 }, new[] { 0.0, -0.0006, 0.023 }, 'R', null, 1);
        Dim(cs, new[] { 0.0, -0.015, -0.0175 }, new[] { 0.0, -0.015, 0.0175 }, 'B', null, 0, 0, 0, null, "CLAMP SCREWS");
        Dim(cb, new[] { -0.028, -0.015, 0 }, new[] { 0.028, -0.015, 0 }, 'B', null, 0, 0, 0, null, "4X <MOD-DIAM>3.4 THRU, CBORE <MOD-DIAM>6.5 x 5.6");
        string plug = Part("Splice_Plug"); Open(plug, (int)swDocumentTypes_e.swDocPART);
        VI pv = Place("splice plug", plug, "*Front", 0.205, 0.1245, 1, true);
        Dim(pv, new[] { -0.040, 0.0116, 0 }, new[] { 0.040, 0.0116, 0 }, 'T', null, 0, -0.0005, 0.0005);
        Dim(pv, new[] { 0.040, -0.0116, 0 }, new[] { 0.040, 0.0116, 0 }, 'R', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "FT04");
        Dim(pv, new[] { -0.018, -0.0116, 0 }, new[] { 0.018, -0.0116, 0 }, 'B', null, 0, -0.0003, 0.0003, null, "2X <MOD-DIAM>3.4 THRU");
        LabelBelow(sec, "UPPER HALF, SECTION"); LabelBelow(top, "UPPER HALF, TOP"); LabelBelow(sid, "UPPER HALF, SIDE");
        LabelBelow(cs, "CAP, SECTION"); LabelBelow(cb, "CAP, BOTTOM"); LabelBelow(pv, "SPLICE PLUG");
        Notes(0.018, 0.076, "1. PA6-CF (HDT 173 °C), 4 UPPER HALVES + 4 CAPS. BORES PRINTED 0.2 UNDER (COUPON M2), REAMED TO 25.6 ±0.2 (FT02). SPLIT GAP 1.2 (0.6 EACH HALF).\n2. J01 MOTOR: 4X F01 M3 x 8 + W01 FROM INSIDE THE BORE BEFORE THE HALVES CLOSE (CBORE <MOD-DIAM>7.5 FROM THE BORE SIDE, HOLES DRILLED 3.4 AFTER PRINTING); ENGAGEMENT 3.0, LIMIT 3.3 (M4); 0.6 N·m EST, LOCTITE 242.\n3. J02 CLAMP: 4X F02 M3 x 16 FROM BELOW INTO THE INSERTS, 0.5 N·m EST, NO THREADLOCKER, WITNESS MARK.\n4. J04 SPLICE (REAR STATION): BOOMS BUTT AT THE MOUNT CENTRE OVER THE PLUG; 2X F04 M3 x 40 + W01 + N01 ALONG Z AT x ±18, HEAD CBORE <MOD-DIAM>7.5 x 5.0 (+Z), NUT POCKET 5.7 AF x 8.0 (-Z); DRILL BOTH TUBE WALLS <MOD-DIAM>3.4 THROUGH THE MOUNT, ±0.3.\n5. WIRE GROOVE 6 x 2 ON THE TOP FACE TOWARDS +X; CENTRE RELIEF <MOD-DIAM>8 x 2 FOR THE MOTOR BOSS.", NOTES_W);
        EndSheet();
    }

    // ---------- sheet 6: clamps ----------
    // One pair per clamp half: section through the bore (left) and side along the boom (right). The common width (46),
    // bore (25.6 FT02) and length (34) are dimensioned once on the first pair and stated in note 1 for the others.
    static VI[] Half(string name, string label, double cx, double cy, double y0, double y1, double lx, double holeX, string callout, bool common)
    {
        string p = Part(name); Open(p, (int)swDocumentTypes_e.swDocPART);
        VI sec = Place(label + " section", p, "*Right", cx, cy, 1, true);
        VI sid = Place(label + " side", p, "*Front", cx + 0.086, cy, 1, true);
        if (common)
        {
            Dim(sec, new[] { 0.0, y0, -0.023 }, new[] { 0.0, y0, 0.023 }, 'B', null, 0, -0.0005, 0.0005);
            Dim(sec, new[] { 0.0, 0, -0.0128 }, new[] { 0.0, 0, 0.0128 }, 'T', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "BORE FT02");
            Dim(sid, new[] { -lx / 2, y1, 0 }, new[] { lx / 2, y1, 0 }, 'T');
        }
        Dim(sec, new[] { 0.0, y0, 0.023 }, new[] { 0.0, y1, 0.023 }, 'R', null, 1);
        if (callout != null) Dim(sid, new[] { -holeX, y0, 0 }, new[] { holeX, y0, 0 }, 'B', null, 0, 0, 0, null, callout);
        return new[] { sec, sid };
    }
    static void PairLabel(VI[] pair, string text)
    {
        double y = Math.Min(pair[0].G[1] - pair[0].Ext(1), pair[1].G[1] - pair[1].Ext(1)) - 0.003;
        Label(pair[0].Name + " label", Math.Max(XMIN, pair[0].G[0]), y, text + "  " + Scale(pair[0]), LABEL_H);
    }
    static void Sheet6_Clamps()
    {
        BeginSheet("CLAMPS", 1, "BOOM, GEAR AND", "TAIL CLAMPS");
        double cA = 0.052, cB = 0.250, r1 = 0.232, r2 = 0.1695, r3 = 0.1065;
        VI[] b = Half("Boom_Clamp_F_Lower", "boom clamp lower", cA, r1, -0.0167, -0.0006, 0.034, 0.012, "2X <MOD-DIAM>3.4 THRU, CBORE <MOD-DIAM>6.5 x 4.3 (FRONT) / x 7.5 (REAR)", true);
        VI[] a = Half("Boom_Clamp_F_Upper", "boom clamp upper", cB, r1, 0.0006, D("clampTopF"), 0.034, 0.012, "2X <MOD-DIAM>3.4 THRU, DIAGONAL", false);
        VI[] e = Half("Gear_Clamp_Lower", "gear clamp lower", cA, r2, D("gearClampBot"), -0.0006, 0.034, 0.012, "4X <MOD-DIAM>3.4, CBORE <MOD-DIAM>6.5 x 15.3", false);
        VI[] d = Half("Gear_Clamp_Upper", "gear clamp upper", cB, r2, 0.0006, 0.0167, 0.034, 0.012, "4X <MOD-DIAM>4.0 ±0.1 x 7.5 DEEP, I01", false);
        VI[] g = Half("Tail_Clamp_Cap", "tail clamp cap", cA, r3, -0.015, -0.0006, 0.050, 0.018, "4X <MOD-DIAM>3.4, CBORE <MOD-DIAM>6.5 x 5.6", false);
        VI[] f = Half("Tail_Clamp_Upper", "tail clamp upper", cB, r3, 0.0006, 0.0157, 0.050, 0.018, "4X <MOD-DIAM>4.0 x 7.5 DEEP (I01), 2 FROM TOP", false);
        PairLabel(b, "FRONT / REAR BOOM CLAMP, LOWER (PETG) QTY 2 + 2"); PairLabel(a, "FRONT BOOM CLAMP, UPPER (PETG) QTY 2");
        PairLabel(e, "GEAR CLAMP, LOWER (PETG) QTY 4"); PairLabel(d, "GEAR CLAMP, UPPER (PETG) QTY 4");
        PairLabel(g, "TAIL CLAMP, CAP (PETG) QTY 2"); PairLabel(f, "TAIL CLAMP, UPPER (PETG) QTY 2");
        Notes(0.018, 0.063, "1. EACH PAIR: SECTION THROUGH THE BORE (LEFT), SIDE ALONG THE BOOM (RIGHT). ALL CLAMPS 46 WIDE, BORE <MOD-DIAM>25.6 ±0.2 (FT02) PRINTED 0.2 UNDER AND REAMED, SPLIT GAP 1.2; BOOM AND GEAR CLAMPS 34 LONG, TAIL CLAMPS 50.\n2. REAR BOOM CLAMP UPPER = FRONT UPPER, TOP AT " + (D("clampTopR") * 1000).ToString("0.0", IC) + "; REAR LOWER = FRONT LOWER WITH THE DEEPER COUNTERBORE.\n3. SCREWS, TORQUES, THREADLOCKER: SHEET 8 (J05 F06 / F04 ON A DIAGONAL INTO THE WING INSERTS, FIELD BREAKDOWN; J06 F03; J08 F02). LEG SOCKET AND J07 CROSS-BOLT: SHEET 7.", NOTES_W);
        EndSheet();
    }

    // ---------- sheet 7: tube cut list, landing leg and leg fairing ----------
    static void Sheet7_Tubes()
    {
        BeginSheet("TUBES", 2, "TUBE CUT LIST", "AND LANDING LEG");
        string mm = "{0:0.0}";
        double gcb = D("gearClampBot"), sock = gcb + D("legSocketDepth"), yBolt = D("legBoltY"), legHole = sock - yBolt;   // gear-clamp bottom, socket floor, F05 bolt (clamp frame); leg hole below the leg top
        double fc = D("fairChord"), fo = D("fairBore") / 2 + D("fairWall");
        var rows = new List<string[]> {
            new[] { "ITEM", "PART", "STOCK (6061-T6)", "CUT LENGTH mm", "TOL mm (ISO 2768-m)", "QTY", "HOLES" },
            new[] { "T01", "Wing spar socket", "1.000 x 0.058 in", string.Format(IC, mm, D("sparLen") * 1000), "±0.8", "2", "none; bonded in the panel (FT05)" },
            new[] { "T02", "Wing joiner", "0.875 x 0.058 in", string.Format(IC, mm, D("joinLen") * 1000), "±0.8", "1", "none; slip fit FT01/FT06, lap if tight" },
            new[] { "T03", "Front boom", "1.000 x 0.035 in", string.Format(IC, mm, D("segF") * 1000), "±0.8", "2", "1 x Ø3.4 cross hole (Z) 18 ±0.3 from the splice end, drilled through the mount" },
            new[] { "T04", "Rear boom stub", "1.000 x 0.035 in", string.Format(IC, mm, D("segR") * 1000), "±0.8", "2", "1 x Ø3.4 cross hole (Z) 18 ±0.3 from the splice end" },
            new[] { "T05", "Landing leg", "1.000 x 0.058 in", string.Format(IC, mm, D("legLen") * 1000), "±0.5", "4", "1 x Ø3.4 cross hole (X) " + Mm(legHole, "0.#") + " ±0.3 from the top end, drilled through the gear clamp" } };
        Table("tube cut list", 0.018, 0.262, rows, new[] { 0.012, 0.034, 0.034, 0.030, 0.040, 0.012, 0.170 }, NOTE_H, 0.0045);
        string leg = Part("Landing_Leg"); Open(leg, (int)swDocumentTypes_e.swDocPART);
        VI lv = Place("landing leg", leg, "*Front", 0.360, 0.150, 2, true);
        double R = D("legOD") / 2, Ll = D("legLen");
        Dim(lv, new[] { R, 0.0, 0 }, new[] { R, Ll, 0 }, 'R', null, 0, -0.0005, 0.0005);
        Dim(lv, new[] { -R, Ll, 0 }, new[] { R, Ll, 0 }, 'T', "<MOD-DIAM>", 1, -0.0001, 0.0001);
        Dim(lv, new[] { -R, Ll - legHole, 0 }, new[] { -R, Ll, 0 }, 'L', null, 1, -0.0003, 0.0003, null, "<MOD-DIAM>3.4 THRU (X)");
        string bf = Part("Boom_Front"); Open(bf, (int)swDocumentTypes_e.swDocPART);
        VI bv = Place("front boom", bf, "*Top", 0.150, 0.182, 5, true);
        Dim(bv, new[] { 0.0, 0, 0.0127 }, new[] { D("segF"), 0, 0.0127 }, 'T', null, 1, -0.0008, 0.0008);
        Dim(bv, new[] { 0.0, 0, -0.0127 }, new[] { 0.018, 0, -0.0127 }, 'B', null, 0, -0.0003, 0.0003, null, "<MOD-DIAM>3.4 THRU (Z), SPLICE BOLT");
        string gf = Part("Gear_Fairing"); Open(gf, (int)swDocumentTypes_e.swDocPART);
        VI fv = Place("leg fairing", gf, "*Top", 0.085, 0.124, 1, true);
        Dim(fv, new[] { 0.3 * fc, 0, 0 }, new[] { -0.7 * fc, 0, 0 }, 'B', null, 1, 0, 0, null, "CHORD");
        Dim(fv, new[] { 0.0, 0, -fo }, new[] { 0.0, 0, fo }, 'R', null, 1, 0, 0, null, "LEG BORE " + Mm("fairBore", "0.0"));
        string gl = Part("Gear_Clamp_Lower"); Open(gl, (int)swDocumentTypes_e.swDocPART);
        VI gs = Place("gear clamp lower socket", gl, "*Front", 0.262, 0.124, 1, true);
        Dim(gs, new[] { 0.0, gcb, 0 }, new[] { 0.0, sock, 0 }, 'R', null, 1, 0, 0, null, "SOCKET DEPTH");
        Dim(gs, new[] { -0.01285, gcb, 0 }, new[] { 0.01285, gcb, 0 }, 'B', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "BLIND SOCKET FT03");
        Dim(gs, new[] { 0.017, gcb, 0 }, new[] { 0.017, yBolt, 0 }, 'L', null, 1, 0, 0, null, "F05 CROSS-BOLT");
        LabelBelow(lv, "LANDING LEG"); LabelBelow(bv, "FRONT BOOM, SPLICE END AT LEFT"); LabelBelow(fv, "LEG FAIRING SECTION (PETG, " + Mm("fairLen", "0") + " LONG) QTY 4"); LabelBelow(gs, "LEG SOCKET IN THE GEAR CLAMP LOWER (SHEET 6)");
        Notes(0.018, 0.075, "1. LEGS ARE CUT FROM THE SPAR-SOCKET TUBE OFFCUT: 2 x " + Mm("sparLen", "0") + " + 4 x " + Mm("legLen", "0") + " = " + Mm(2 * D("sparLen") + 4 * D("legLen"), "0") + " mm OF A 96 in (" + Mm("legStock", "0") + " mm) LENGTH. BOOMS: 2 x (" + (D("segF") * 1000).ToString("0.0", IC) + " + " + (D("segR") * 1000).ToString("0.0", IC) + ") = " + (2 * (D("segF") + D("segR")) * 1000).ToString("0", IC) + " mm FROM TWO 72 in LENGTHS.\n2. END SQUARENESS 0.5 (EST). DEBURR ALL CUT ENDS AND HOLES. TUBE OD ±0.10, WALL ±0.05 (VENDOR, HS §5a): MEASURE ON RECEIPT (M1).\n3. BOOMS BUTT AT THE REAR MOTOR MOUNT CENTRE OVER THE PRINTED SPLICE PLUG (SHEET 5). LEG: J07 F05 M3 x 30 + W01 + N01 CROSS-BOLT, HEAD CBORE <MOD-DIAM>7.5 x 4.0, NUT POCKET 5.7 AF x 4.3; LEG DRILLED <MOD-DIAM>3.4 THROUGH THE CLAMP.\n4. LEG FAIRINGS: 3:1 TEARDROP (NACA 0033) SLIPPED OVER EACH LEG, TRAILING EDGE AFT, VASE-MODE " + Mm("fairWall", "0.0") + " mm WALL (EST), CLOCKED AGAINST THE GEAR CLAMP AND TAPED; NO FASTENERS (DRAG: analysis/aero/aero_results.json).", NOTES_W);
        EndSheet();
    }

    // ---------- sheet 8: fastener schedule ----------
    static void Sheet8_Fasteners()
    {
        BeginSheet("FASTENERS", 1, "FASTENER SCHEDULE", "AND TORQUES");
        var rows = new List<string[]> { new[] { "ID", "STANDARD", "SIZE", "QTY", "ORDER", "JOINTS", "TORQUE N·m", "THREADLOCKER", "VENDOR / PART NO." } };
        var keys = new List<string>(); foreach (string k in P.Keys) if (k.StartsWith("sched_")) keys.Add(k); keys.Sort();
        foreach (string k in keys)
        {
            string[] f = P[k].Split('|');
            var js = new List<string>(); foreach (Match m in Regex.Matches(f[5], @"J\d\d[ab]?")) if (!js.Contains(m.Value)) js.Add(m.Value);
            string joints = js.Count > 0 ? string.Join(", ", js.ToArray()) : (f[0] == "I01" ? "J02 J03b J05 J06 J08 J09 J11 J12 J13 J15 J16" : "—");
            rows.Add(new[] { f[0], Short(f[1], 56), f[2], f[3], f[4], joints, f[6], Short(f[7], 92), Short(f[8] + " " + f[9], 90) });
        }
        Table("fastener schedule", 0.018, 0.262, rows, new[] { 0.012, 0.054, 0.028, 0.012, 0.016, 0.082, 0.022, 0.086, 0.084 }, NOTE_H, 0.0050);
        Notes(0.018, 0.116, "(docs/research/hardware-spec.md §2d, §4)\n1. QTY PER AIRCRAFT; ORDER INCLUDES SPARES. F12 PROP SCREWS AND F13 ADAPTER SCREWS: LENGTH PROVISIONAL, CHECK M5 (HUB THICKNESS NOT PUBLISHED).\n2. TORQUES MARKED EST IN THE SPEC: CONFIRM INSERT TORQUE-OUT >= 2x ON A COUPON (M3). NO TORQUE DRIVER ON HAND: HANG A KNOWN MASS FROM THE HEX KEY, T = m g L (0.6 N·m = 1.02 kg AT L 60 mm; 0.5 N·m = 0.85 kg; 1.0 N·m = 1.70 kg).\n3. LOCTITE 242 ONLY ON METAL-TO-METAL THREADS (F01 MOTOR BASE, F12/F13 HUB SCREWS), ONE DROP ON THE LAST 2–3 THREADS, KEPT OFF THE PA6-CF. NEVER ON NYLOCKS.\n4. SCREWS IN BRASS INSERTS GET NO THREADLOCKER: TORQUE, THEN A PAINT WITNESS MARK CHECKED PRE-FLIGHT. REPLACE A NYLOCK THAT TURNS BY HAND.\n5. INSERTS RX-M3x5.7 IN Ø4.0 ±0.1 HOLES >= 7.0 DEEP (FT08, INTERFERENCE INTENDED); SOLDERING IRON ~20 °C ABOVE THE PRINT TEMPERATURE, SET PER MATERIAL.\n6. CLEARANCE HOLES: ISO 273 NORMAL (M2 2.4, M3 3.4, M5 5.5) PRINTED AT +0.2 AND CHECKED ON THE HOLE COUPON (M2); MOTOR-PATTERN HOLES DRILLED TO 3.4 AFTER PRINTING.\n7. MOTOR SCREWS: TIP <= 3.2 mm PROUD OF THE FLOOR BEFORE EVERY MOTOR INSTALL (M4); 3.3 mm REACHES THE WINDINGS.\n8. FIELD BREAKDOWN (R4): 2 x F09, 8 x BOOM-CLAMP SCREWS (F06/F04), 4 x F02 SHOE SCREWS; 14 SCREWS IN A LABELLED BAG.", 0.390);
        EndSheet();
    }

    // ---------- sheet 9: small printed parts ----------
    static void Sheet9_Printed()
    {
        BeginSheet("HARDPOINTS", 1, "PRINTED PARTS", "HARDPOINTS AND TRAYS");
        string fs = Part("Fin_Shoe"); Open(fs, (int)swDocumentTypes_e.swDocPART);
        VI fv = Place("fin shoe", fs, "*Top", 0.105, 0.222, 1, true);
        double xc = D("xTC") - D("xFinLE");
        Dim(fv, new[] { xc - D("shoeFlangeX") / 2, 0.0, 0.023 }, new[] { xc + D("shoeFlangeX") / 2, 0.0, 0.023 }, 'T', null, 0, 0, 0, " FLANGE");
        Dim(fv, new[] { xc, 0, -0.0175 }, new[] { xc, 0, 0.0175 }, 'R', null, 0, 0, 0, null, "2X <MOD-DIAM>3.4 THRU");
        string sc = Part("Spar_Collar"); Open(sc, (int)swDocumentTypes_e.swDocPART);
        VI cv = Place("spar collar", sc, "*Front", 0.262, 0.215, 1, true);
        double yb = D("yL30") - D("sparY");
        Dim(cv, new[] { -0.016, yb, 0 }, new[] { 0.016, yb, 0 }, 'B');
        Dim(cv, new[] { 0.016, yb, 0 }, new[] { 0.016, 0.0157, 0 }, 'R', null, 1);
        Dim(cv, new[] { -0.0128, 0, 0 }, new[] { 0.0128, 0, 0 }, 'T', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "ON THE SPAR SOCKET, BONDED");
        string rh = Part("Rear_Hardpoint"); Open(rh, (int)swDocumentTypes_e.swDocPART);
        VI rv = Place("rear hardpoint", rh, "*Front", 0.350, 0.215, 1, true);
        Dim(rv, new[] { -0.030, 0, 0 }, new[] { 0.030, 0, 0 }, 'B');
        Dim(rv, new[] { 0.030, 0, 0 }, new[] { 0.030, 0.010, 0 }, 'R');
        string pc = Part("Pusher_Cup"); Open(pc, (int)swDocumentTypes_e.swDocPART);
        VI pv = Place("pusher cup", pc, "*Top", 0.090, 0.138, 1, true);
        Dim(pv, new[] { 0.0, 0, -0.0278 }, new[] { 0.0, 0, 0.0278 }, 'L', "<MOD-DIAM>", 1, -0.0002, 0.0002, null, "FT11");
        Dim(pv, new[] { 0.0, 0, 0.0278 }, new[] { 0.030, 0, 0.0278 }, 'T');
        Dim(pv, new[] { 0.0, 0, -0.0278 }, new[] { 0.0045, 0, -0.0278 }, 'B', null, 1, -0.00015, 0.00015, null, "FLOOR");
        string st = Part("Servo_Tray"); Open(st, (int)swDocumentTypes_e.swDocPART);
        VI sv = Place("servo tray", st, "*Front", 0.205, 0.130, 1, true);
        Dim(sv, new[] { -0.025, 0, 0 }, new[] { 0.025, 0, 0 }, 'T');
        Dim(sv, new[] { -0.023, D("trayBodyY"), 0 }, new[] { 0.023, D("trayBodyY"), 0 }, 'B', null, 0, 0, 0, null, "4X <MOD-DIAM>2.6 + M2 NUT POCKET 4.2 AF x 2");
        string rt = Part("Root_Tongue"); Open(rt, (int)swDocumentTypes_e.swDocPART);
        VI tv = Place("root tongue", rt, "*Top", 0.330, 0.130, 1, true);
        Dim(tv, new[] { -0.010, 0, 0 }, new[] { -0.010, 0, 0.050 }, 'L');
        Dim(tv, new[] { -0.010, 0, 0.050 }, new[] { 0.010, 0, 0.050 }, 'T');
        Dim(tv, new[] { 0.010, 0, 0 }, new[] { 0.010, 0, 0.010 }, 'R', null, 0, -0.0002, 0.0002, null, "WING BOLT <MOD-DIAM>5.7");
        LabelBelow(fv, "FIN SHOE (PETG) QTY 2"); LabelBelow(cv, "SPAR COLLAR (PETG) QTY 2"); LabelBelow(rv, "REAR HARDPOINT (PETG) QTY 2");
        LabelBelow(pv, "PUSHER CUP (PA6-CF) QTY 1"); LabelBelow(sv, "SERVO TRAY (PETG) QTY 5"); LabelBelow(tv, "ROOT TONGUE (PETG) QTY 2");
        Notes(0.018, 0.075, "1. FIN SHOE J09: FLOOR " + Mm("shoeFloor", "0.0") + ", WALLS " + Mm("shoeWall", "0") + " x 1.6 AROUND THE FIN ROOT (FIN BONDED IN); 2X F02 M3 x 16 THROUGH THE FLANGE AND A CRUSH SLEEVE 7 x 3.4 x 6.8 INTO THE TAIL-CLAMP INSERTS.\n2. SPAR COLLAR J05a, REAR HARDPOINT J05b: BONDED FLUSH INTO THE WING LOWER SURFACE AT THE BOOM STATION, INSERTS <MOD-DIAM>4.0 x 7.5 FACE DOWN.\n3. PUSHER CUP J12: 4X F01 + W01 FROM INSIDE INTO THE MOTOR BASE, 4X F07 RADIAL THROUGH THE POD RING. SERVO TRAY J14: 4X F10 + N03, TAB HOLES PROVISIONAL (M6).\n4. ROOT TONGUE J10: 25 mm BONDED IN THE PANEL ROOT, 25 mm IN THE SADDLE PILLAR. OTHER PRINTED PARTS: DIMENSIONS IN THE PART FILES (PARTS LIST). TORQUES: SHEET 8.", NOTES_W);
        EndSheet();
    }
}
