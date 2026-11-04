// Builds the CAD model of the lift + cruise VTOL in SOLIDWORKS through its API (v0.4 design, CAD model rev D 2026-10-25;
// hardware spec docs/research/hardware-spec.md of 2026-10-21).
// Inputs: cad/params.txt (from cad/params.mjs <- analysis/results.json + cad/hardware.json), read through cad/Shared.cs
// (ParamsFile: the one params.txt reader; Geom: the NACA section and pod profile, constants from params.txt). Outputs: cad/model/*.SLDPRT,
// VTOL_Concept.SLDASM/.STEP/.EASM, VTOL_Exploded.SLDASM, cad/verification.txt. Frame: X forward (wing LE at X=0), Y up, Z right; metres.
// Detail level: real aerofoil sections (NACA 24xx wing, NACA 0009 tail) with pockets for every bonded hardpoint, split control surfaces
// (ailerons, elevator, rudders), split printed clamps with insert holes, counterbores and nut pockets at the spec's sizes
// (docs/research/hardware-spec.md), motors with their bolt patterns, and every screw, nut, washer and heat-set insert as its own part
// placed at its joint by a rigid transform. Dimensions marked EST are estimates (maker drawings not available).
// Sketch conventions (probed 2026-10-21): Front sketch (x,y) = model (X,Y), extrude +Z; Top sketch (x,y) = model (X,-Z), extrude +Y;
// Right sketch (x,y) = model (-Z,Y), extrude +X; CreatePlaneAtOffset3 goes along +normal; MathTransform rows = images of the part axes.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Globalization;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

class BuildVtol
{
    static SldWorks sw;
    static Dictionary<string, string> P = new Dictionary<string, string>();
    static List<string[]> Comps = new List<string[]>(), XComps = new List<string[]>();
    static List<string[]> Fast = new List<string[]>();
    static string OutDir, PartTpl, AsmTpl;
    static CultureInfo IC = CultureInfo.InvariantCulture;
    static double D(string k) { return double.Parse(P[k], IC); }
    static StringBuilder VLog = new StringBuilder();
    static System.Diagnostics.Stopwatch SW = System.Diagnostics.Stopwatch.StartNew();
    static void Log(string s) { Console.WriteLine("[" + SW.Elapsed.TotalSeconds.ToString("0.0", IC) + "s] " + s); }
    static HashSet<string> Only = null; static string Mode = "all";
    static bool Want(string name) { return Mode == "all" || (Mode == "parts" && Only.Contains(name)); }
    static void V(string s) { VLog.AppendLine(s); Console.WriteLine(s); }
    static bool cutFlipPos = false;          // FeatureCut4 Flip value that cuts along +normal (probed at start-up)
    static int threadsOk = 0, threadsFail = 0, cutWarnings = 0;

    // appearance palette (r, g, b)
    static readonly double[] FOAM = { 0.93, 0.94, 0.96 }, SURF = { 0.80, 0.82, 0.86 }, ALU = { 0.72, 0.74, 0.78 },
        PRINT = { 0.12, 0.13, 0.16 }, PRINT2 = { 0.20, 0.22, 0.26 }, MOTOR = { 0.18, 0.19, 0.22 }, PROP = { 0.06, 0.06, 0.07 },
        POD = { 0.95, 0.96, 0.97 }, CANOPY = { 0.10, 0.16, 0.26 }, BATT = { 0.20, 0.45, 0.85 }, RUBBER = { 0.08, 0.08, 0.08 },
        STEEL = { 0.78, 0.78, 0.80 }, BRASS = { 0.80, 0.65, 0.30 }, NYLON = { 0.85, 0.85, 0.80 }, SERVO = { 0.15, 0.15, 0.17 }, PCB = { 0.10, 0.35, 0.25 };
    // material classes -> density kg/m3 and source (for the mass roll-up in verification.txt)
    class Mat { public double Rho; public string Src; public double Fixed; public Mat(double r, string s, double f) { Rho = r; Src = s; Fixed = f; } }
    static Dictionary<string, Mat> MATS = new Dictionary<string, Mat> {
        { "6061", new Mat(2700, "SOLIDWORKS library 6061-T6 (SS)", 0) },
        { "A2", new Mat(7900, "EST: 18-8 stainless, typical 7.9 g/cm3 (vendor gives none)", 0) },
        { "steel", new Mat(7850, "EST: carbon steel", 0) },
        { "brass", new Mat(8500, "EST: brass, typical 8.5 g/cm3", 0) },
        { "PETG", new Mat(1270, "EST: PETG typical datasheet density 1.27 g/cm3", 0) },
        { "PA6CF", new Mat(1230, "EST: Polymaker PA6-CF20 about 1.23 g/cm3", 0) },
        { "XPS", new Mat(32, "analysis/sizing.mjs rhoFoam 32 kg/m3 (AM 2a)", 0) },
        { "nylon", new Mat(1140, "EST: nylon 6", 0) },
        { "motor", new Mat(0, "fixed 165 g: SunnySky X4110S (budget-lift.md A3)", 0.165) },
        { "battery", new Mat(0, "fixed 820 g: Ovonic 6S 6500 (budget-energy-test.md 1)", 0.820) },
        { "servo", new Mat(0, "fixed 43.2 g: EMAX ES3005HV (budget-avionics.md 6)", 0.0432) },
        { "liftprop", new Mat(0, "fixed 32 g EST (analysis/sizing.mjs mProp)", 0.032) },
        { "pushprop", new Mat(0, "fixed 37 g: APC 14x8.5EP (pusher-battery-servo.md)", 0.037) },
        { "fc", new Mat(0, "fixed 40 g: CoreWing F405 Wing V2 (ArduPilot wiki)", 0.040) },
    };
    class PartRec { public string Path, Mat, Desc; public double Vol; public int Qty; }
    static Dictionary<string, PartRec> Parts = new Dictionary<string, PartRec>();
    static double mm(double v) { return v * 0.001; }

    static int Main(string[] args)
    {
        var pd = ParamsFile.Load(args[0]); P = pd.P; Comps = pd.Comps; XComps = pd.XComps; Fast = pd.Fast;   // cad/Shared.cs
        OutDir = Path.GetFullPath(args[1]); Directory.CreateDirectory(OutDir);
        if (args.Length > 2) { Only = new HashSet<string>(args[2].Split(',')); Mode = Only.Contains("assemble") ? "assemble" : Only.Contains("parts") ? "parts" : "fast"; }
        foreach (string f in Directory.GetFiles(OutDir)) if (Path.GetFileName(f).StartsWith("~$")) try { File.Delete(f); } catch { }
        sw = (SldWorks)Activator.CreateInstance(Type.GetTypeFromProgID("SldWorks.Application"));
        sw.Visible = false;   // invisible while building (much faster); Drawings.exe / Snap.exe make it visible again
        sw.UserControl = false;
        PartTpl = sw.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplatePart);
        AsmTpl = sw.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateAssembly);
        Log("SOLIDWORKS " + sw.RevisionNumber());
        V("# CAD verification log, generated by cad/BuildVtol.cs on " + DateTime.Now.ToString("yyyy-MM-dd HH:mm") + " (SOLIDWORKS " + sw.RevisionNumber() + ")");
        ProbeCutDirection();

        double bOD = D("boomOD"), bID = D("boomID");
        // ---------- fastener parts (from cad/hardware.json via params.mjs) ----------
        foreach (string[] f in Fast) if (Mode == "all" || (Mode == "fast" && Only.Contains(f[0].Split('_')[0])) || (Mode == "parts" && Only.Contains(f[0]))) FastenerPart(f);
        if (Mode == "fast") { Log("only-mode done; threads " + threadsOk + "/" + threadsFail); sw.Visible = true; sw.UserControl = true; return 0; }
        // ---------- airframe parts ----------
        var builders = new List<KeyValuePair<string, Action>>();
        Action<string, Action> B = (n, a) => builders.Add(new KeyValuePair<string, Action>(n, a));
        B("Wing_Panel_R", () => WingPanel("Wing_Panel_R", false)); B("Wing_Panel_L", () => WingPanel("Wing_Panel_L", true));
        B("Aileron_R", () => Aileron("Aileron_R", false)); B("Aileron_L", () => Aileron("Aileron_L", true));
        B("Spar_Tube", () => Tube("Spar_Tube", 'Z', D("sparOD"), D("sparID"), D("sparLen"), ALU, "6061-T6 1.000 x 0.058 in spar socket, 800 mm, bonded in the panel (FT05)", "6061"));
        B("Wing_Joiner", () => Tube("Wing_Joiner", 'Z', D("joinOD"), D("joinID"), D("joinLen"), ALU, "6061-T6 0.875 x 0.058 in joiner, 760 mm: slip fit in the saddle and sockets (FT01/FT06), captured by the Joiner_Stop discs", "6061"));
        B("Boom_Front", () => Boom("Boom_Front", D("segF"), 0.018, "Front boom, 6061-T6 1.000 x 0.035 in, " + (D("segF") * 1000).ToString("0.0", IC) + " mm, cross-drilled 3.4 at 18 mm from the splice end (J04)"));
        B("Boom_Rear_Stub", () => Boom("Boom_Rear_Stub", D("segR"), D("segR") - 0.018, "Rear boom stub carrying the tail, 6061-T6, " + (D("segR") * 1000).ToString("0.0", IC) + " mm, cross-drilled 3.4 at 18 mm from the splice end (J04)"));
        B("Splice_Plug", SplicePlug); B("Joiner_Stop", JoinerStop);
        B("Lift_Motor", () => Motor("Lift_Motor", 'Y')); B("Pusher_Motor", () => Motor("Pusher_Motor", 'X'));
        B("Lift_Prop", LiftProp); B("Prop_Plate", PropPlate); B("Pusher_Prop_14in", PusherProp); B("Pusher_Adapter", PusherAdapter); B("Prop_Washer", PropWasher);
        B("Motor_Mount_Upper", MotorMountUpper); B("Motor_Mount_Cap", MotorMountCap);
        B("Tail_Clamp_Upper", TailClampUpper); B("Tail_Clamp_Cap", TailClampCap);
        B("Boom_Clamp_F_Upper", () => BoomClampUpper("Boom_Clamp_F_Upper", D("clampTopF"), "Printed PETG front boom clamp, upper half: bonded to the spar collar; 2 x F06 pass through to the collar inserts (J05a)"));
        B("Boom_Clamp_F_Lower", () => BoomClampLower("Boom_Clamp_F_Lower", 0.0043, "Printed PETG front boom clamp, lower half: counterbores 6.5 x 4.3 for F06 (J05a)"));
        B("Boom_Clamp_R_Upper", () => BoomClampUpper("Boom_Clamp_R_Upper", D("clampTopR"), "Printed PETG rear boom clamp, upper half: bonded to the rear hardpoint; 2 x F04 pass through (J05b)"));
        B("Boom_Clamp_R_Lower", () => BoomClampLower("Boom_Clamp_R_Lower", 0.0075, "Printed PETG rear boom clamp, lower half: counterbores 6.5 x 7.5 for F04 (J05b)"));
        B("Gear_Clamp_Upper", GearClampUpper); B("Gear_Clamp_Lower", GearClampLower);
        B("Landing_Leg", Leg); B("Gear_Fairing", GearFairing);
        B("Spar_Collar", SparCollar); B("Rear_Hardpoint", RearHardpoint); B("Bolt_Pillar", BoltPillar); B("Root_Tongue", RootTongue);
        B("Pitot_Tube", () => Revolve("Pitot_Tube", 'X', new double[,] { { 0, 0 }, { 0, 0.003 }, { 0.22, 0.003 }, { 0.245, 0.0012 }, { 0.25, 0 } }, true, ALU, "Pitot probe under the left wing (Holybro PT40 + MS5525; OD 6 mm EST, length 250 EST)", "6061"));
        B("Pitot_Clamp", PitotClamp);
        B("Fuselage_Pod", Fuselage); B("Canopy", Canopy); B("Battery_Tray", BatteryTray); B("FC_Tray", FcTray); B("Flight_Controller", FlightController);
        B("Battery_6S_LiPo", () => RoundBox("Battery_6S_LiPo", D("battL"), D("battH"), D("battW"), 0.006, BATT, "6S 6500 mAh LiPo envelope (dims EST), on the battery tray (J18)", "battery"));
        B("H_Tail", () => Tailplane("H_Tail", false)); B("Elevator", () => Tailplane("Elevator", true));
        B("Fin", Fin); B("Rudder", Rudder); B("Fin_Shoe", FinShoe); B("Crush_Sleeve", CrushSleeve);
        B("Wing_Saddle", WingSaddle);
        B("Pusher_Cup", PusherCup);
        B("Servo", Servo); B("Servo_Tray", ServoTray); B("Control_Horn", ControlHorn); B("Horn_Backplate", HornBackplate); B("Horn_Hardpoint", HornHardpoint);
        B("Pushrod_Aileron", () => Pushrod("Pushrod_Aileron", D("rodAileron"))); B("Pushrod_Elevator", () => Pushrod("Pushrod_Elevator", D("rodElevator"))); B("Pushrod_Rudder", () => Pushrod("Pushrod_Rudder", D("rodRudder")));
        foreach (var kv in builders) if (Want(kv.Key)) kv.Value();
        if (Mode != "all") LoadExistingParts();

        // ---------- assemblies ----------
        ModelDoc2 asmDoc = Assemble(Comps, "VTOL_Concept", "Lift + cruise VTOL v0.4, CAD rev D (every fastener modelled)");
        string asmPath = Path.Combine(OutDir, "VTOL_Concept.SLDASM");
        Save(asmDoc, asmPath);
        Save(asmDoc, Path.Combine(OutDir, "VTOL_Concept.STEP"));
        try { Save(asmDoc, Path.Combine(OutDir, "VTOL_Concept.EASM")); } catch (Exception e) { Log("eDrawings export skipped: " + e.Message); }
        Verify(asmDoc);
        sw.CloseDoc(asmDoc.GetTitle());
        ModelDoc2 xDoc = Assemble(XComps, "VTOL_Exploded", "Exploded layout of VTOL_Concept for drawing sheet 2 (same parts, offsets from cad/params.mjs)");
        Save(xDoc, Path.Combine(OutDir, "VTOL_Exploded.SLDASM"));
        sw.CloseDoc(xDoc.GetTitle());
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(OutDir), "verification.txt"), VLog.ToString());
        sw.Visible = true; sw.UserControl = true;
        Log("verification log written; parts " + Parts.Count + ", components " + Comps.Count);
        return 0;
    }

    // register the part files already in cad/model that this run did not rebuild (volume and material from the saved file)
    static void LoadExistingParts()
    {
        foreach (string f in Directory.GetFiles(OutDir, "*.SLDPRT"))
        {
            string name = Path.GetFileNameWithoutExtension(f); if (name.StartsWith("~$") || Parts.ContainsKey(name)) continue;
            int e = 0, w = 0; ModelDoc2 d = sw.OpenDoc6(f, (int)swDocumentTypes_e.swDocPART, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref e, ref w);
            if (d == null) continue;
            string mat, desc, r; bool wr; CustomPropertyManager cpm = d.Extension.get_CustomPropertyManager("");
            cpm.Get5("Material", false, out mat, out r, out wr); mat = r ?? mat; cpm.Get5("Description", false, out desc, out r, out wr); desc = r ?? desc;
            MassProperty mp = d.Extension.CreateMassProperty();
            Parts[name] = new PartRec { Path = f, Mat = MATS.ContainsKey(mat ?? "") ? mat : "PETG", Desc = desc, Vol = mp == null ? 0 : mp.Volume };
            sw.CloseDoc(d.GetTitle());
        }
        Log("loaded " + Parts.Count + " part files");
    }

    // ---------- start-up probe: which FeatureCut4 flip value cuts along the sketch normal ----------
    static void ProbeCutDirection()
    {
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); sm.CreateCircleByRadius(0, 0, 0, 0.01); EndSk(d);
        d.FeatureManager.FeatureExtrusion3(true, false, false, 6, 0, 0.02, 0, false, false, false, false, 0, 0, false, false, false, false, true, true, true, 0, 0, false);
        sm = Sk(d, 1, 0); sm.CreateCircleByRadius(0, 0, 0, 0.002); EndSk(d);
        Feature f = d.FeatureManager.FeatureCut4(true, false, false, 0, 0, 0.005, 0, false, false, false, false, 0, 0, false, false, false, false, false, true, true, true, true, false, 0, 0, false, false);
        if (f == null) V("# cut-direction probe: cut FAILED");
        d.EditRebuild3(); double[] com = (double[])((MassProperty)d.Extension.CreateMassProperty()).CenterOfMass;
        cutFlipPos = !(f != null && com[1] < -1e-6);      // cut went +Y with Dir=false  ->  Dir=false is positive
        V("# cut-direction probe: Dir=false cuts " + (com[1] < -1e-6 ? "along +normal" : "along -normal") + " (COM y " + (com[1] * 1000).ToString("0.###", IC) + " mm)");
        sw.CloseDoc(d.GetTitle());
    }

    // ---------- generic helpers ----------
    static ModelDoc2 NewPart() { return (ModelDoc2)sw.NewDocument(PartTpl, 0, 0, 0); }
    static string[] PLANES = { "Front Plane", "Top Plane", "Right Plane" };
    // sketch on a base plane (fr: 0 Front, 1 Top, 2 Right) or on a plane offset along its normal
    static double lastVol = 0;   // volume before the current sketch was opened (a rebuild after EndSk would clear the sketch selection)
    static SketchManager Sk(ModelDoc2 d, int fr, double off)
    {
        lastVol = Volume(d);
        d.ClearSelection2(true);
        string plane = PLANES[fr];
        if (Math.Abs(off) > 1e-9)
        {
            if (!d.Extension.SelectByID2(plane, "PLANE", 0, 0, 0, false, 0, null, 0)) throw new Exception("Cannot select " + plane);
            RefPlane rp = (RefPlane)d.CreatePlaneAtOffset3(Math.Abs(off), off < 0, true);
            if (rp == null) throw new Exception("offset plane failed");
            plane = ((Feature)rp).Name; d.ClearSelection2(true);
        }
        if (!d.Extension.SelectByID2(plane, "PLANE", 0, 0, 0, false, 0, null, 0)) throw new Exception("Cannot select " + plane);
        d.SketchManager.InsertSketch(true); d.SketchManager.AddToDB = true;
        return d.SketchManager;
    }
    static void EndSk(ModelDoc2 d)
    {
        d.SketchManager.AddToDB = false; d.SketchManager.InsertSketch(true);
        d.ClearSelection2(true); ((Feature)d.FeatureByPositionReverse(0)).Select2(false, 0);
    }
    // model (a,b) -> sketch (x,y) for a sketch on plane fr: Front (x,y); Top (x,z); Right (z,y)
    static double[] Map(int fr, double a, double b) { return fr == 0 ? new[] { a, b } : fr == 1 ? new[] { a, -b } : new[] { -a, b }; }
    static void Circle(SketchManager sm, int fr, double a, double b, double dia) { double[] q = Map(fr, a, b); sm.CreateCircleByRadius(q[0], q[1], 0, dia / 2); }
    static void Rect(SketchManager sm, int fr, double a0, double b0, double a1, double b1)
    {
        double[] p = Map(fr, a0, b0), q = Map(fr, a1, b1);
        sm.CreateLine(p[0], p[1], 0, q[0], p[1], 0); sm.CreateLine(q[0], p[1], 0, q[0], q[1], 0); sm.CreateLine(q[0], q[1], 0, p[0], q[1], 0); sm.CreateLine(p[0], q[1], 0, p[0], p[1], 0);
    }
    static void Hex(SketchManager sm, int fr, double a, double b, double af)
    {
        double R = af / Math.Sqrt(3); var pts = new double[6, 2];
        for (int i = 0; i < 6; i++) { double th = Math.PI / 6 + i * Math.PI / 3; double[] q = Map(fr, a + R * Math.Cos(th), b + R * Math.Sin(th)); pts[i, 0] = q[0]; pts[i, 1] = q[1]; }
        Poly(sm, pts, true);
    }
    static Feature Ext(ModelDoc2 d, double depth, bool flip, bool mid, bool merge = true)
    {
        int end = mid ? (int)swEndConditions_e.swEndCondMidPlane : (int)swEndConditions_e.swEndCondBlind;
        Feature f = d.FeatureManager.FeatureExtrusion3(true, false, flip, end, 0, depth, 0, false, false, false, false, 0, 0, false, false, false, false, merge, true, true, 0, 0, false);
        if (f == null) throw new Exception("Extrude failed in " + d.GetTitle());
        return f;
    }
    // blind cut of `depth` from the sketch plane along +normal (pos) or -normal; warns when nothing was removed
    static Feature CutD(ModelDoc2 d, double depth, bool pos, string what)
    {
        double v0 = lastVol;
        bool flip = pos ? cutFlipPos : !cutFlipPos;
        Feature f = d.FeatureManager.FeatureCut4(true, false, flip, 0, 0, depth, 0, false, false, false, false, 0, 0,
            false, false, false, false, false, true, true, true, true, false, 0, 0, false, false);
        if (f == null || Volume(d) > v0 - 1e-14) { cutWarnings++; V("  WARNING cut '" + what + "' in " + d.GetTitle() + " removed nothing"); }
        return f;
    }
    static Feature CutBoth(ModelDoc2 d, string what)
    {
        double v0 = lastVol;
        Feature f = d.FeatureManager.FeatureCut4(false, false, false, 1, 1, 0.01, 0.01, false, false, false, false, 0, 0,
            false, false, false, false, false, true, true, true, true, false, 0, 0, false, false);
        if (f == null || Volume(d) > v0 - 1e-14) { cutWarnings++; V("  WARNING through-cut '" + what + "' in " + d.GetTitle() + " removed nothing"); }
        return f;
    }
    static Feature Rev(ModelDoc2 d)
    {
        Feature f = d.FeatureManager.FeatureRevolve2(true, true, false, false, false, false, 0, 0, 2 * Math.PI, 0,
            false, false, 0, 0, 0, 0, 0, true, true, true);
        if (f == null) throw new Exception("Revolve failed in " + d.GetTitle());
        return f;
    }
    static double Volume(ModelDoc2 d) { d.EditRebuild3(); MassProperty mp = d.Extension.CreateMassProperty(); return mp == null ? 0 : mp.Volume; }
    static string Finish(ModelDoc2 d, string name, double[] rgb, string desc, string mat)
    {
        d.MaterialPropertyValues = new double[] { rgb[0], rgb[1], rgb[2], 0.5, 0.85, 0.45, 0.35, 0, 0 };
        CustomPropertyManager cpm = d.Extension.get_CustomPropertyManager("");
        cpm.Add3("Description", (int)swCustomInfoType_e.swCustomInfoText, desc, (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
        cpm.Add3("Material", (int)swCustomInfoType_e.swCustomInfoText, mat, (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
        cpm.Add3("Source", (int)swCustomInfoType_e.swCustomInfoText, "Generated by cad/BuildVtol.cs from analysis/results.json and cad/hardware.json via cad/params.mjs (v0.4, CAD rev D, 2026-10-25)", (int)swCustomPropertyAddOption_e.swCustomPropertyReplaceValue);
        d.EditRebuild3();
        string path = Path.Combine(OutDir, name + ".SLDPRT");
        Log("  saving " + name); Save(d, path);
        double vol = Volume(d);
        Parts[name] = new PartRec { Path = path, Mat = mat, Desc = desc, Vol = vol };
        Log(string.Format(IC, "  part {0,-22} volume {1,10:0.0} mm3", name, vol * 1e9));
        sw.CloseDoc(d.GetTitle());   // keep the session small (open documents slow every later operation)
        return path;
    }
    static void Save(ModelDoc2 d, string path)
    {
        int err = 0, warn = 0;
        if (!d.Extension.SaveAs(path, (int)swSaveAsVersion_e.swSaveAsCurrentVersion, (int)swSaveAsOptions_e.swSaveAsOptions_Silent, null, ref err, ref warn))
            throw new Exception("Save failed " + path + " err " + err);
    }
    static void Poly(SketchManager sm, double[,] p, bool close)
    {
        int n = p.GetLength(0);
        for (int i = 0; i < n - 1; i++) sm.CreateLine(p[i, 0], p[i, 1], 0, p[i + 1, 0], p[i + 1, 1], 0);
        if (close) sm.CreateLine(p[n - 1, 0], p[n - 1, 1], 0, p[0, 0], p[0, 1], 0);
    }
    static void RoundRect(SketchManager sm, double cx, double cy, double w, double h, double r)
    {
        double x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
        sm.CreateLine(x0 + r, y0, 0, x1 - r, y0, 0); sm.CreateLine(x1, y0 + r, 0, x1, y1 - r, 0);
        sm.CreateLine(x1 - r, y1, 0, x0 + r, y1, 0); sm.CreateLine(x0, y1 - r, 0, x0, y0 + r, 0);
        sm.CreateArc(x1 - r, y0 + r, 0, x1 - r, y0, 0, x1, y0 + r, 0, 1);
        sm.CreateArc(x1 - r, y1 - r, 0, x1, y1 - r, 0, x1 - r, y1, 0, 1);
        sm.CreateArc(x0 + r, y1 - r, 0, x0 + r, y1, 0, x0, y1 - r, 0, 1);
        sm.CreateArc(x0 + r, y0 + r, 0, x0, y0 + r, 0, x0 + r, y0, 0, 1);
    }
    // NACA 4-digit sections: Geom.WingSection / Geom.TailSection / Geom.Naca in cad/Shared.cs (TE(upper) -> LE -> TE(lower), x in [0,1])
    // portion of a section between chord fractions [x0, x1] as a closed outline (sketch X = -x c - xoff, Y = y c), split with straight cuts
    static void SectionPart(SketchManager sm, List<double[]> foil, double c, double x0, double x1, double xoff = 0)
    {
        var top = new List<double[]>(); var bot = new List<double[]>();
        int le = 0; double minx = 9; for (int i = 0; i < foil.Count; i++) if (foil[i][0] < minx) { minx = foil[i][0]; le = i; }
        for (int i = le; i >= 0; i--) top.Add(foil[i]);            // LE -> TE upper
        for (int i = le; i < foil.Count; i++) bot.Add(foil[i]);    // LE -> TE lower
        Func<List<double[]>, double, double> yAt = (s, x) => { for (int i = 1; i < s.Count; i++) if (s[i][0] >= x) { double f = (x - s[i - 1][0]) / (s[i][0] - s[i - 1][0]); return s[i - 1][1] + f * (s[i][1] - s[i - 1][1]); } return s[s.Count - 1][1]; };
        var pts = new List<double>();
        Action<double, double> add = (x, y) => { pts.Add(-x * c - xoff); pts.Add(y * c); pts.Add(0); };
        if (x0 > 0) add(x0, yAt(top, x0)); foreach (var q in top) if (q[0] > x0 + 1e-6 && q[0] < x1 - 1e-6) add(q[0], q[1]); add(x1, yAt(top, x1));
        var upper = pts.ToArray(); pts.Clear();
        if (x0 > 0) add(x0, yAt(bot, x0)); foreach (var q in bot) if (q[0] > x0 + 1e-6 && q[0] < x1 - 1e-6) add(q[0], q[1]); add(x1, yAt(bot, x1));
        var lower = pts.ToArray();
        if (x0 <= 0)
        {   // includes the leading edge: one spline around the nose from upper x1 to lower x1
            var nose = new List<double>();
            for (int i = upper.Length / 3 - 1; i >= 0; i--) { nose.Add(upper[3 * i]); nose.Add(upper[3 * i + 1]); nose.Add(0); }
            nose.Add(-0 * c - xoff); nose.Add(foil[le][1] * c); nose.Add(0);
            for (int i = 0; i < lower.Length / 3; i++) { nose.Add(lower[3 * i]); nose.Add(lower[3 * i + 1]); nose.Add(0); }
            sm.CreateSpline2(nose.ToArray(), true);
        }
        else
        {
            sm.CreateSpline2(upper, true); sm.CreateSpline2(lower, true);
            sm.CreateLine(upper[0], upper[1], 0, lower[0], lower[1], 0);
        }
        int nu = upper.Length / 3, nl = lower.Length / 3;
        sm.CreateLine(upper[3 * (nu - 1)], upper[3 * (nu - 1) + 1], 0, lower[3 * (nl - 1)], lower[3 * (nl - 1) + 1], 0);
    }
    // cosmetic thread on the circular edge of radius r at coordinate `coord` along axis `ax` (0 X, 1 Y): the edge is found by
    // scanning the body's edges (SelectByID2 by point picks neighbouring faces on small revolved parts)
    static void CosmeticThread(ModelDoc2 d, double r, int ax, double coord, double minorDia, double depth, string callout)
    {
        try
        {
            d.ClearSelection2(true);
            object[] bodies = (object[])((PartDoc)d).GetBodies2((int)swBodyType_e.swSolidBody, true); bool sel = false;
            if (bodies != null) foreach (object bo in bodies)
            {
                object[] edges = (object[])((Body2)bo).GetEdges();
                foreach (object o in edges)
                {
                    Edge ed = (Edge)o; Curve cv = (Curve)ed.GetCurve(); if (!cv.IsCircle()) continue;
                    double[] cp = (double[])cv.CircleParams;
                    if (Math.Abs(cp[ax] - coord) < 2e-5 && Math.Abs(cp[6] - r) < 5e-5) { Entity en = (Entity)ed; sel = en.Select4(false, null); break; }
                }
                if (sel) break;
            }
            if (!sel) { threadsFail++; Log("  thread edge not found"); return; }
            Feature f = d.FeatureManager.InsertCosmeticThread3(0, "", callout, minorDia, 0, depth, callout);
            if (f != null) threadsOk++; else { threadsFail++; Log("  thread feature failed"); }
        }
        catch (Exception ex) { threadsFail++; Log("  thread error " + ex.Message); }
    }

    // ---------- fasteners ----------
    // f = Name|Type|d|L|dk|k|af|material|description  (mm): origin at the head underside / bearing face, axis Y, shank towards -Y
    static void FastenerPart(string[] f)
    {
        string name = f[0], type = f[1]; double dia = mm(double.Parse(f[2], IC)), L = mm(double.Parse(f[3], IC)), dk = mm(double.Parse(f[4], IC)), k = mm(double.Parse(f[5], IC)), af = mm(double.Parse(f[6], IC));
        string matName = f[7], desc = f[8];
        string mat = matName.StartsWith("brass") ? "brass" : matName.StartsWith("steel") ? "steel" : "A2";
        double[] rgb = mat == "brass" ? BRASS : STEEL;
        ModelDoc2 d = NewPart();
        double pitch = dia < 0.0025 ? 0.0004 : dia < 0.004 ? 0.0005 : dia < 0.0055 ? 0.0008 : 0.001;
        double minor = dia - 1.0825 * pitch;
        string callout = "M" + (dia * 1000).ToString("0", IC) + "x" + (pitch * 1000).ToString("0.0", IC);
        if (type == "SHCS" || type == "BHCS" || type == "PAN")
        {
            double ch = Math.Min(0.0004, dia * 0.15), r = dia / 2;
            double[,] prof;
            if (type == "SHCS") prof = new double[,] { { -L, 0 }, { -L, r - ch }, { -L + ch, r }, { 0, r }, { 0, dk / 2 }, { k - 0.0003, dk / 2 }, { k, dk / 2 - 0.0003 }, { k, 0 } };
            else if (type == "BHCS") prof = new double[,] { { -L, 0 }, { -L, r - ch }, { -L + ch, r }, { 0, r }, { 0, dk / 2 }, { 0.25 * k, dk / 2 }, { 0.72 * k, 0.86 * dk / 2 }, { 0.94 * k, 0.55 * dk / 2 }, { k, 0 } };
            else prof = new double[,] { { -L, 0 }, { -L, r }, { 0, r }, { 0, dk / 2 }, { 0.7 * k, dk / 2 }, { k, 0.6 * dk / 2 }, { k, 0 } };
            RevBody(d, 'Y', prof);
            if (af > 0) { var sm = Sk(d, 1, k); Hex(sm, 1, 0, 0, af); EndSk(d); CutD(d, 0.45 * dia, false, "hex socket"); }
            else { var sm = Sk(d, 1, k); Circle(sm, 1, 0, 0, 0.5 * dk); EndSk(d); CutD(d, 0.4 * k, false, "drive recess"); }   // kit screw drive not published: shallow recess EST
            CosmeticThread(d, r, 1, 0, minor, L - ch, callout);   // from the head underside over the shank
        }
        else if (type == "NYLOCK" || type == "HEXNUT")
        {
            double s = dk, h = L;   // across flats, height
            var sm = Sk(d, 1, 0); Hex(sm, 1, 0, 0, s); EndSk(d); Ext(d, type == "NYLOCK" ? 0.65 * h : h, true, false);
            if (type == "NYLOCK") { sm = Sk(d, 1, -0.65 * h); Circle(sm, 1, 0, 0, 0.94 * s); EndSk(d); Ext(d, 0.35 * h, true, false); }
            sm = Sk(d, 1, 0); Circle(sm, 1, 0, 0, dia); EndSk(d); CutBoth(d, "nut bore");
            CosmeticThread(d, dia / 2, 1, 0, dia + 0.0005, h, callout);
        }
        else if (type == "WASHER") RevBody(d, 'Y', new double[,] { { 0, dia / 2 }, { 0, dk / 2 }, { -L, dk / 2 }, { -L, dia / 2 } });
        else if (type == "INSERT")
        {
            double ro = dk / 2, ri = dia / 2, g = 0.0003;
            RevBody(d, 'Y', new double[,] { { 0, ri }, { 0, ro }, { -0.0012, ro }, { -0.0015, ro - g }, { -0.0018, ro }, { -0.0039, ro }, { -0.0042, ro - g }, { -0.0045, ro }, { -L, ro }, { -L, ri } });
            CosmeticThread(d, ri, 1, 0, dia + 0.0005, L, callout);
        }
        else if (type == "BULLET")
        {   // dk = across flats (EST), k = bore depth
            double s = dk;
            var sm = Sk(d, 1, 0); Hex(sm, 1, 0, 0, s); EndSk(d); Ext(d, 0.6 * L, true, false);
            RevBody(d, 'Y', new double[,] { { -0.6 * L, 0 }, { -0.6 * L, 0.5 * s }, { -0.8 * L, 0.42 * s }, { -0.95 * L, 0.22 * s }, { -L, 0 } });
            sm = Sk(d, 1, 0); Circle(sm, 1, 0, 0, dia); EndSk(d); CutD(d, k, false, "bullet nut bore");
        }
        Finish(d, name, rgb, desc, mat);
    }
    // revolve a closed (axial, radial) profile about the part Y (axis 'Y') or X axis; profile closes back to its first point
    static void RevBody(ModelDoc2 d, char axis, double[,] ar)
    {
        var sm = Sk(d, 0, 0);
        int n = ar.GetLength(0); var p = new double[n, 2];
        for (int i = 0; i < n; i++) { if (axis == 'X') { p[i, 0] = ar[i, 0]; p[i, 1] = ar[i, 1]; } else { p[i, 0] = ar[i, 1]; p[i, 1] = ar[i, 0]; } }
        Poly(sm, p, true);
        if (axis == 'X') sm.CreateCenterLine(-0.01, 0, 0, 1, 0, 0); else sm.CreateCenterLine(0, -0.01, 0, 0, 1, 0);
        EndSk(d); Rev(d);
    }

    // ---------- tubes and turned parts ----------
    static string Tube(string name, char axis, double od, double id, double len, double[] rgb, string desc, string mat)
    {
        ModelDoc2 d = NewPart(); int fr = axis == 'X' ? 2 : axis == 'Y' ? 1 : 0;
        var sm = Sk(d, fr, 0); sm.CreateCircleByRadius(0, 0, 0, od / 2); if (id > 0) sm.CreateCircleByRadius(0, 0, 0, id / 2);
        EndSk(d); Ext(d, len, false, false);
        return Finish(d, name, rgb, desc, mat);
    }
    static void Boom(string name, double len, double holeX, string desc)
    {   // 1.000 x 0.035 in tube along +X from the origin with one 3.4 mm cross hole along Z at holeX (both walls)
        ModelDoc2 d = NewPart(); var sm = Sk(d, 2, 0); sm.CreateCircleByRadius(0, 0, 0, D("boomOD") / 2); sm.CreateCircleByRadius(0, 0, 0, D("boomID") / 2); EndSk(d); Ext(d, len, false, false);
        sm = Sk(d, 0, 0); Circle(sm, 0, holeX, 0, 0.0034); EndSk(d); CutBoth(d, "splice cross hole");
        Finish(d, name, ALU, desc, "6061");
    }
    static void SplicePlug()
    {   // printed plug 23.2 x 80 inside both boom ends at the butt joint (FT04), cross-drilled 3.4 at x +-18 for the F04 bolts
        ModelDoc2 d = NewPart(); var sm = Sk(d, 2, 0); sm.CreateCircleByRadius(0, 0, 0, 0.0116); EndSk(d); Ext(d, 0.080, false, true);
        sm = Sk(d, 0, 0); Circle(sm, 0, 0.018, 0, 0.0034); Circle(sm, 0, -0.018, 0, 0.0034); EndSk(d); CutBoth(d, "plug cross holes");
        Finish(d, "Splice_Plug", PRINT2, "Printed PETG splice plug 23.2 x 80 inside the boom butt joint (FT04, 0.02-0.83 mm clearance in the 23.62 bore), cross-drilled 3.4 for 2 x F04", "PETG");
    }
    static void JoinerStop()
    {   // printed disc bonded in each spar socket 300 mm from the root face: end stop for the slip-fit joiner (transport envelope R4)
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); sm.CreateCircleByRadius(0, 0, 0, 0.0112); EndSk(d); Ext(d, 0.010, false, false);
        Finish(d, "Joiner_Stop", PRINT2, "Printed PETG joiner stop 22.4 x 10, bonded in the spar socket 300 mm from the root face: the slip-fit joiner is captured between the two stops once both panels are bolted on", "PETG");
    }
    static string Revolve(string name, char axis, double[,] ar, bool closeToAxis, double[] rgb, string desc, string mat)
    {
        ModelDoc2 d = NewPart(); RevBody(d, axis, ar); return Finish(d, name, rgb, desc, mat);
    }
    static void Motor(string name, char axis)
    {   // outrunner: base flange, stator neck, bell; 4 mm shaft 12 mm proud (EST); 4 x M3 x 3.3 deep base holes on dia 25 at 45 deg, 4 x M3 x 8 deep hub holes on dia 12 (maker drawing)
        double R = D("motorD") / 2, H = D("motorH");
        var prof = new double[,] { { 0, 0 }, { 0, R * 0.92 }, { 0.004, R * 0.92 }, { 0.004, R * 0.70 }, { 0.007, R * 0.70 }, { 0.007, R }, { H - 0.004, R },
            { H, R - 0.004 }, { H, 0.002 }, { H + 0.012, 0.002 }, { H + 0.012, 0 } };
        ModelDoc2 d = NewPart();
        if (axis == 'X') for (int i = 0; i < prof.GetLength(0); i++) prof[i, 0] = -prof[i, 0];   // pusher faces aft (-X)
        RevBody(d, axis, prof);
        int fr = axis == 'Y' ? 1 : 2; double sgn = axis == 'Y' ? 1 : -1;
        var sm = Sk(d, fr, 0); foreach (double a in new[] { 1.0, -1.0 }) foreach (double b in new[] { 1.0, -1.0 }) Circle(sm, fr, a * 0.00884, b * 0.00884, 0.003); EndSk(d);
        CutD(d, 0.0033, axis == 'Y', "motor base holes");
        sm = Sk(d, fr, sgn * H); Circle(sm, fr, 0.006, 0, 0.003); Circle(sm, fr, -0.006, 0, 0.003); Circle(sm, fr, 0, 0.006, 0.003); Circle(sm, fr, 0, -0.006, 0.003); EndSk(d);
        CutD(d, 0.008, axis != 'Y', "motor hub holes");
        Finish(d, name, MOTOR, axis == 'Y' ? "SunnySky X4110S lift motor (envelope EST; bolt patterns from the maker drawing: base 4 x M3 on dia 25, max depth 3.3; hub 4 x M3 on dia 12, depth 8)" : "SunnySky X4110S pusher motor, same part facing aft, carries the M6 bolt-on adapter", "motor");
    }
    static void LiftProp()
    {   // two tapered blades + hub 28 x 8 (EST) on the bell top: 4.1 bore (FT09), 2 x 3.2 on 12 mm (JeeFly 1755 listing); blades parked along X
        ModelDoc2 d = NewPart(); double dia = D("liftProp"), Rt = dia / 2, t = D("propT");
        var sm = Sk(d, 1, 0);
        foreach (double s in new[] { 1.0, -1.0 })
        {
            double r0 = 0.012, cr = dia * 0.045, cm = dia * 0.075, ct = dia * 0.035;   // chord: root, max (30 % R), tip: EST planform
            var pts = new double[,] { { s * r0, -cr / 2 }, { s * Rt * 0.30, -cm * 0.55 }, { s * Rt * 0.85, -ct * 0.55 }, { s * Rt * 0.98, -ct * 0.20 },
                { s * Rt, 0 }, { s * Rt * 0.98, ct * 0.30 }, { s * Rt * 0.85, ct * 0.45 }, { s * Rt * 0.30, cm * 0.45 }, { s * r0, cr / 2 } };
            Poly(sm, pts, true);
        }
        EndSk(d); Ext(d, t, false, false);
        sm = Sk(d, 1, 0); sm.CreateCircleByRadius(0, 0, 0, 0.014); EndSk(d); Ext(d, 0.008, false, false);
        sm = Sk(d, 1, 0); Circle(sm, 1, 0, 0, 0.0041); Circle(sm, 1, 0.006, 0, 0.0032); Circle(sm, 1, -0.006, 0, 0.0032); EndSk(d); CutBoth(d, "prop hub holes");
        Finish(d, "Lift_Prop", PROP, "JeeFly 1755 carbon lift prop (planform EST, hub 28 x 8 EST): 4 mm bore + 2 x 3.2 on 12 mm; shown parked fore-aft (notional: BLHeli_S ESCs cannot park props)", "liftprop");
    }
    static void PropPlate()
    {   // X4110S prop holding plate dia 20 x 2.5 with 2 x 3.2 on 12 mm (maker drawing View B-B); supplied with the motor
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); sm.CreateCircleByRadius(0, 0, 0, 0.010); EndSk(d); Ext(d, 0.0025, false, false);
        sm = Sk(d, 1, 0); Circle(sm, 1, 0, 0, 0.0042); Circle(sm, 1, 0.006, 0, 0.0032); Circle(sm, 1, -0.006, 0, 0.0032); EndSk(d); CutBoth(d, "plate holes");
        Finish(d, "Prop_Plate", STEEL, "X4110S prop holding plate dia 20 x 2.5, 2 x 3.2 on 12 mm (maker drawing View B-B), supplied with the motor", "steel");
    }
    static void PusherProp()
    {   // APC 14 x 8.5EP: blades vertical, hub dia 24 x 8 (EST), 6.35 bore; extends -X from its forward face
        ModelDoc2 d = NewPart(); double dia = D("pushProp"), Rt = dia / 2, t = D("propT");
        var sm = Sk(d, 2, 0);
        foreach (double s in new[] { 1.0, -1.0 })
        {
            double r0 = 0.010, cr = dia * 0.045, cm = dia * 0.075, ct = dia * 0.035;
            var pts = new double[,] { { -cr / 2, s * r0 }, { -cm * 0.55, s * Rt * 0.30 }, { -ct * 0.55, s * Rt * 0.85 }, { -ct * 0.20, s * Rt * 0.98 },
                { 0, s * Rt }, { ct * 0.30, s * Rt * 0.98 }, { ct * 0.45, s * Rt * 0.85 }, { cm * 0.45, s * Rt * 0.30 }, { cr / 2, s * r0 } };
            Poly(sm, pts, true);
        }
        EndSk(d); Ext(d, t, true, false);
        sm = Sk(d, 2, 0); sm.CreateCircleByRadius(0, 0, 0, 0.012); EndSk(d); Ext(d, 0.008, true, false);
        sm = Sk(d, 2, 0); Circle(sm, 2, 0, 0, 0.00635); EndSk(d); CutBoth(d, "pusher prop bore");
        Finish(d, "Pusher_Prop_14in", PROP, "APC 14 x 8.5EP pusher prop (planform EST; hub thickness 8 EST, not published), 6.35 bore on the M6 adapter with its ring (FT10)", "pushprop");
    }
    static void PusherAdapter()
    {   // M6 x 1.0 bolt-on adapter (maker drawing View A-A): flange dia 20 x 5 EST with 4 x 3.2 / 5.7 counterbores on dia 12, dia 6 pilot + 14 mm thread, extends -X
        ModelDoc2 d = NewPart();
        RevBody(d, 'X', new double[,] { { 0, 0.0021 }, { 0, 0.010 }, { -0.005, 0.010 }, { -0.005, 0.003 }, { -0.019, 0.003 }, { -0.019, 0 }, { -0.013, 0 }, { -0.013, 0.0021 } });
        var sm = Sk(d, 2, 0); foreach (double[] q in new[] { new[] { 0.006, 0.0 }, new[] { -0.006, 0.0 }, new[] { 0.0, 0.006 }, new[] { 0.0, -0.006 } }) Circle(sm, 2, q[0], q[1], 0.0032); EndSk(d); CutBoth(d, "adapter holes");
        sm = Sk(d, 2, -0.005); foreach (double[] q in new[] { new[] { 0.006, 0.0 }, new[] { -0.006, 0.0 }, new[] { 0.0, 0.006 }, new[] { 0.0, -0.006 } }) Circle(sm, 2, q[0], q[1], 0.0057); EndSk(d); CutD(d, 0.003, true, "adapter counterbores");
        CosmeticThread(d, 0.003, 0, -0.019, 0.00492, 0.014, "M6x1.0");
        Finish(d, "Pusher_Adapter", STEEL, "X4110S bolt-on prop adapter, supplied: M6 x 1.0 thread 14 mm, dia 6 pilot (0/-0.03), flange dia 20 x 5 EST with 4 x 3.2 / 5.7 counterbores on dia 12 (maker drawing View A-A)", "steel");
    }
    static void PropWasher()
    {
        ModelDoc2 d = NewPart(); RevBody(d, 'X', new double[,] { { 0, 0.00305 }, { 0, 0.0089 }, { -0.0025, 0.0089 }, { -0.0025, 0.00305 } });
        Finish(d, "Prop_Washer", STEEL, "Pusher prop washer dia 17.8 x 2.5, dia 6.1 bore, supplied with the motor (maker drawing)", "steel");
    }

    // ---------- printed boom blocks (local frame: boom axis = X through the origin, Y up, Z across; width w along Z) ----------
    static ModelDoc2 BlockBody(double lx, double y0, double y1, double w, double r, bool bore)
    {
        ModelDoc2 d = NewPart(); var sm = Sk(d, 2, 0);
        RoundRect(sm, 0, (y0 + y1) / 2, w, y1 - y0, r);
        EndSk(d); Ext(d, lx, false, true);
        if (bore) { sm = Sk(d, 2, 0); sm.CreateCircleByRadius(0, 0, 0, 0.0128); EndSk(d); CutBoth(d, "boom bore"); }   // the bore crosses the split face, so it is a cut, not a sketch contour
        return d;
    }
    // vertical holes: circles of `dia` at (x,z) pairs, cut from plane y=yFrom by `depth` upward (up) or downward
    static void HolesY(ModelDoc2 d, double[,] xz, double dia, double yFrom, double depth, bool up, string what)
    {
        var sm = Sk(d, 1, yFrom); for (int i = 0; i < xz.GetLength(0); i++) Circle(sm, 1, xz[i, 0], xz[i, 1], dia); EndSk(d); CutD(d, depth, up, what);
    }
    static void HexesY(ModelDoc2 d, double[,] xz, double af, double yFrom, double depth, bool up, string what)
    {
        var sm = Sk(d, 1, yFrom); for (int i = 0; i < xz.GetLength(0); i++) Hex(sm, 1, xz[i, 0], xz[i, 1], af); EndSk(d); CutD(d, depth, up, what);
    }
    static double[,] Grid(double x, double z) { return new double[,] { { x, z }, { x, -z }, { -x, z }, { -x, -z } }; }
    // splice cross-bolt features shared by the motor-mount halves: 3.4 grooves along Z at x +-18, y 0; counterbore 7.5 x 5 from +Z; nut pocket 5.7 AF x 8 from -Z
    static void SpliceFeatures(ModelDoc2 d)
    {
        var sm = Sk(d, 0, 0); Circle(sm, 0, 0.018, 0, 0.0036); Circle(sm, 0, -0.018, 0, 0.0036); EndSk(d); CutBoth(d, "splice bolt grooves");
        sm = Sk(d, 0, 0.023); Circle(sm, 0, 0.018, 0, 0.0075); Circle(sm, 0, -0.018, 0, 0.0075); EndSk(d); CutD(d, 0.005, false, "splice counterbores");
        sm = Sk(d, 0, -0.023); Hex(sm, 0, 0.018, 0, 0.0057); Hex(sm, 0, -0.018, 0, 0.0057); EndSk(d); CutD(d, 0.008, true, "splice nut pockets");
    }
    static void MotorMountUpper()
    {   // HS C1/J01/J02: upper half +0.6..+21.0, 70 x 46, bore 25.6; 4 inserts from the split face; motor counterbores from the bore to the 4.5 floor; relief + wire groove
        ModelDoc2 d = BlockBody(0.070, 0.0006, 0.021, 0.046, 0.004, true);
        HolesY(d, Grid(0.028, 0.0175), 0.004, 0.0006, 0.0075, true, "clamp insert holes");
        HolesY(d, Grid(0.00884, 0.00884), 0.0075, 0.0, 0.0165, true, "motor counterbores");   // 7.5: the spec's 6.5 cannot take the 7.0 OD washer (spec rule cap + washer = 7.5)
        HolesY(d, Grid(0.00884, 0.00884), 0.0036, 0.0, 0.022, true, "motor screw holes");
        var sm = Sk(d, 1, 0.021); Circle(sm, 1, 0, 0, 0.008); EndSk(d); CutD(d, 0.002, false, "centre relief");
        sm = Sk(d, 1, 0.021); Rect(sm, 1, 0.003, -0.003, 0.035, 0.003); EndSk(d); CutD(d, 0.002, false, "wire groove");
        SpliceFeatures(d);
        Finish(d, "Motor_Mount_Upper", PRINT, "Printed PA6-CF motor mount, upper half (motor plate + saddle): bore 25.6 (FT02), floor 4.5 under the 4 x M3 on dia 25, counterbores 7.5 (head + washer) from the bore, 4 x RX-M3x5.7 inserts; splice cross-bolt half-grooves (used at the rear station)", "PA6CF");
    }
    static void MotorMountCap()
    {
        ModelDoc2 d = BlockBody(0.070, -0.015, -0.0006, 0.046, 0.004, true);
        HolesY(d, Grid(0.028, 0.0175), 0.0036, -0.015, 0.016, true, "cap screw holes");
        HolesY(d, Grid(0.028, 0.0175), 0.0065, -0.015, 0.0056, true, "cap counterbores");
        SpliceFeatures(d);
        Finish(d, "Motor_Mount_Cap", PRINT, "Printed PA6-CF motor mount, lower cap -15.0..-0.6 (1.2 split gap): 4 x 3.4 with 6.5 x 5.6 counterbores for F02; splice cross-bolt half-grooves, counterbore and nut pocket", "PA6CF");
    }
    static void TailClampUpper()
    {   // HS J08/J09: 50 long, +0.6..+15.7 flat top for the stabiliser; clamp inserts from below at x +-18; fin-shoe inserts from the top at x 0
        ModelDoc2 d = BlockBody(0.050, 0.0006, 0.0157, 0.046, 0.004, true);
        HolesY(d, Grid(0.018, 0.0175), 0.004, 0.0006, 0.0075, true, "clamp insert holes");
        HolesY(d, new double[,] { { 0, 0.0175 }, { 0, -0.0175 } }, 0.004, 0.0157, 0.0075, false, "shoe insert holes");
        Finish(d, "Tail_Clamp_Upper", PRINT, "Printed PETG tail clamp, upper half +0.6..+15.7, 50 x 46, bore 25.6: flat top carries the stabiliser; 4 x RX-M3x5.7 inserts from the split face, 2 from the top for the fin-shoe screws", "PETG");
    }
    static void TailClampCap()
    {
        ModelDoc2 d = BlockBody(0.050, -0.015, -0.0006, 0.046, 0.004, true);
        HolesY(d, Grid(0.018, 0.0175), 0.0036, -0.015, 0.016, true, "cap screw holes");
        HolesY(d, Grid(0.018, 0.0175), 0.0065, -0.015, 0.0056, true, "cap counterbores");
        Finish(d, "Tail_Clamp_Cap", PRINT, "Printed PETG tail clamp, lower cap -15.0..-0.6: 4 x 3.4 with 6.5 x 5.6 counterbores for F02", "PETG");
    }
    static void BoomClampUpper(string name, double top, string desc)
    {
        ModelDoc2 d = BlockBody(0.034, 0.0006, top, 0.046, 0.004, true);
        HolesY(d, new double[,] { { 0.012, 0.0175 }, { -0.012, -0.0175 } }, 0.0036, 0.0006, top, true, "through holes");
        Finish(d, name, PRINT, desc, "PETG");
    }
    static void BoomClampLower(string name, double cbDepth, string desc)
    {
        ModelDoc2 d = BlockBody(0.034, -0.0167, -0.0006, 0.046, 0.004, true);
        HolesY(d, new double[,] { { 0.012, 0.0175 }, { -0.012, -0.0175 } }, 0.0036, -0.0167, 0.017, true, "screw holes");
        HolesY(d, new double[,] { { 0.012, 0.0175 }, { -0.012, -0.0175 } }, 0.0065, -0.0167, cbDepth, true, "counterbores");
        Finish(d, name, PRINT, desc, "PETG");
    }
    static void GearClampUpper()
    {
        ModelDoc2 d = BlockBody(0.034, 0.0006, 0.0167, 0.046, 0.004, true);
        HolesY(d, Grid(0.012, 0.0175), 0.004, 0.0006, 0.0075, true, "insert holes");
        Finish(d, "Gear_Clamp_Upper", PRINT, "Printed PETG gear clamp, upper half +0.6..+16.7, 34 x 46, bore 25.6: 4 x RX-M3x5.7 inserts", "PETG");
    }
    static void GearClampLower()
    {   // HS J06/J07: gearClampBot (-28.7)..-0.6; blind leg socket 25.7 x legSocketDepth (14.0) from the bottom; F03 counterbores 6.5 x 15.3; F05 cross-bolt along X at legBoltY (-21.7)
        double yb = D("gearClampBot"), yBolt = D("legBoltY");
        ModelDoc2 d = BlockBody(0.034, yb, -0.0006, 0.046, 0.004, true);
        HolesY(d, Grid(0.012, 0.0175), 0.0036, yb, -yb - 0.0002, true, "screw holes");
        HolesY(d, Grid(0.012, 0.0175), 0.0065, yb, 0.0153, true, "counterbores");
        HolesY(d, new double[,] { { 0, 0 } }, 0.0257, yb, D("legSocketDepth"), true, "leg socket");
        var sm = Sk(d, 2, 0); Circle(sm, 2, 0, yBolt, 0.0036); EndSk(d); CutBoth(d, "leg bolt hole");
        sm = Sk(d, 2, 0.017); Circle(sm, 2, 0, yBolt, 0.0075); EndSk(d); CutD(d, 0.004, false, "leg bolt counterbore");   // 4.0 deep: the head and washer stay outside the leg tube (|x| > 12.7)
        sm = Sk(d, 2, -0.017); Hex(sm, 2, 0, yBolt, 0.0057); EndSk(d); CutD(d, 0.0043, true, "leg nut pocket");          // 4.3 deep: the nut bears just outside the tube
        Finish(d, "Gear_Clamp_Lower", PRINT, "Printed PETG gear clamp, lower half " + (yb * 1000).ToString("0.0", IC) + "..-0.6: blind leg socket 25.7 x " + (D("legSocketDepth") * 1000).ToString("0.0", IC) + " (FT03), 4 x 3.4 with 6.5 x 15.3 counterbores for F03, F05 M3 x 30 cross-bolt 3.4 with 7.5 x 4.0 counterbore and 5.7 AF x 4.3 nut pocket (both clear of the leg tube)", "PETG");
    }
    static void GearFairing()
    {   // AERO: printed PETG 3:1 teardrop sleeve over each leg (NACA 0033 section), vase-mode wall EST; leg bore at 30 % chord. Chord, length, bore and wall from params (fairChord, fairLen, fairBore, fairWall)
        double c = D("fairChord"), L = D("fairLen"), wt = D("fairWall");
        List<double[]> fo = Geom.Naca(0, 0, (D("fairBore") + 2 * wt) / c, 30), fi = Geom.Naca(0, 0, D("fairBore") / (c - 2 * wt), 30);
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); SectionPart(sm, fo, c, 0, 1.0, -0.30 * c); EndSk(d); Ext(d, L, false, false);
        sm = Sk(d, 1, 0); SectionPart(sm, fi, c - 2 * wt, 0, 1.0, -0.30 * c + wt); EndSk(d); CutBoth(d, "fairing cavity");
        Finish(d, "Gear_Fairing", PRINT2, "Printed PETG landing-leg fairing: 3:1 teardrop (NACA 0033 section, chord " + (c * 1000).ToString("0.0", IC) + ") x " + (L * 1000).ToString("0", IC) + ", " + (wt * 1000).ToString("0.0", IC) + " mm vase-mode wall EST, slipped over the leg, TE aft, clocked and taped at the gear clamp (aero drag build-up: faired legs)", "PETG");
    }
    static void Leg()
    {   // gear leg (spar-tube offcut) with a printed dome foot; cross-drilled 3.4 along X at the F05 station (7 mm below its top)
        ModelDoc2 d = NewPart(); double R = D("legOD") / 2, L = D("legLen");
        var sm = Sk(d, 1, 0); sm.CreateCircleByRadius(0, 0, 0, R); sm.CreateCircleByRadius(0, 0, 0, D("legID") / 2); EndSk(d);
        Ext(d, L, false, false);
        sm = Sk(d, 0, 0);
        double fr = 0.020, fh = 0.018;
        Poly(sm, new double[,] { { 0, 0 }, { fr * 0.85, 0 }, { fr, 0.004 }, { fr, fh * 0.55 }, { R * 1.15, fh }, { 0, fh } }, true);
        sm.CreateCenterLine(0, -0.01, 0, 0, 0.05, 0);
        EndSk(d); Rev(d);
        double hole = D("gearClampBot") + D("legSocketDepth") - D("legBoltY");   // F05 axis below the leg top (7.0)
        sm = Sk(d, 2, 0); Circle(sm, 2, 0, L - hole, 0.0034); EndSk(d); CutBoth(d, "leg cross hole");
        Finish(d, "Landing_Leg", RUBBER, "Gear leg: 6061 1.000 x 0.058 in offcut 205 mm + printed dome foot (EST), cross-drilled 3.4 for the F05 retaining bolt", "6061");
    }
    // ---------- wing hardpoints ----------
    static void SparCollar()
    {   // HS J05a (C5): PETG block 32 x 46 around the spar socket, bottom flush with the wing lower surface at 30 % c; 2 inserts from below at (x +-12, z +-17.5) beside the tube
        double yBot = D("yL30") - D("sparY"), yTop = 0.0157;
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, (yBot + yTop) / 2, 0.032, yTop - yBot, 0.003); sm.CreateCircleByRadius(0, 0, 0, 0.0128); EndSk(d); Ext(d, 0.046, false, true);
        HolesY(d, new double[,] { { 0.012, 0.0175 }, { -0.012, -0.0175 } }, 0.004, yBot, 0.0075, true, "collar insert holes");
        Finish(d, "Spar_Collar", PRINT2, "Printed PETG spar collar 32 x 46 bonded around the spar socket at the boom station (front wing hardpoint): 2 x RX-M3x5.7 inserts facing down for the F06 clamp screws", "PETG");
    }
    static void RearHardpoint()
    {   // HS J05b: PETG plate 60 x 46 x 10 bonded flush into the lower surface at 80 % c; 2 inserts from below
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, 0.005, 0.060, 0.010, 0.003); EndSk(d); Ext(d, 0.046, false, true);
        HolesY(d, new double[,] { { 0.012, 0.0175 }, { -0.012, -0.0175 } }, 0.004, 0, 0.0075, true, "hardpoint insert holes");
        Finish(d, "Rear_Hardpoint", PRINT2, "Printed PETG rear wing hardpoint 60 x 46 x 10 bonded flush into the lower surface at 80 % c: 2 x RX-M3x5.7 inserts for the F04 clamp screws", "PETG");
    }
    static void BoltPillar()
    {   // HS J10 (C4/C5): PETG pillar dia pillarD (16) over the full section height at 70 % c; 20.4 x 6.8 slot for the tongue along Z; 5.7 hole; 10.3 x pillarSpot spot-face; M5 nylock pocket 8.2 AF x pillarNutDepth from the bottom
        double h = D("yU70") - D("yL70"), ym = D("yMid70") - D("yL70"), nd = D("pillarNutDepth");
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); sm.CreateCircleByRadius(0, 0, 0, D("pillarD") / 2); EndSk(d); Ext(d, h, false, false);
        sm = Sk(d, 0, 0); Rect(sm, 0, -0.0102, ym - 0.0034, 0.0102, ym + 0.0034); EndSk(d); CutBoth(d, "tongue slot");
        HolesY(d, new double[,] { { 0, 0 } }, 0.0057, 0, h, true, "bolt hole");
        HolesY(d, new double[,] { { 0, 0 } }, 0.0103, h, D("pillarSpot"), false, "spot face");   // params.mjs: deepened from 1.0 in 0.5 steps so the nut pocket stays under the tongue-slot floor
        HexesY(d, new double[,] { { 0, 0 } }, 0.0082, 0, nd, true, "nut pocket");   // params.mjs: the M5 x 20 (head on the spot-face) ends 0.5 past the nylock for this section height
        Finish(d, "Bolt_Pillar", PRINT2, "Printed PETG wing-bolt pillar dia " + (D("pillarD") * 1000).ToString("0.#", IC) + " x " + (h * 1000).ToString("0.0", IC) + " in the saddle at 70 % c: tongue slot 20.4 x 6.8, 5.7 hole, 10.3 x " + (D("pillarSpot") * 1000).ToString("0.0", IC) + " spot-face, M5 nylock pocket 8.2 AF x " + (nd * 1000).ToString("0.0", IC) + " from the lower surface", "PETG");
    }
    static void RootTongue()
    {   // HS J10: PETG tongue 20 (X) x 6.4 (Y) x 50 (Z): 25 bonded in the panel root, 25 in the pillar slot; 5.7 hole 10 from the inboard end
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, 0, 0.020, 0.0064, 0.001); EndSk(d); Ext(d, 0.050, false, false);
        HolesY(d, new double[,] { { 0, 0.010 } }, 0.0057, -0.004, 0.008, true, "tongue hole");
        Finish(d, "Root_Tongue", PRINT2, "Printed PETG panel root tongue 20 x 6.4 x 50: 25 mm bonded into the panel root, 25 mm into the saddle pillar slot; 5.7 hole for the M5 x 20 wing bolt", "PETG");
    }
    static void PitotClamp()
    {   // HS J16: block 20 x 20 from the wing lower surface down 21.5; 6.2 bore along X at -9.5; insert from below + F07 pinch screw (0.9 mm short of the tube in the model)
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, -0.01075, 0.020, 0.0215, 0.002); EndSk(d); Ext(d, 0.020, false, true);
        sm = Sk(d, 2, 0); Circle(sm, 2, 0, -0.0095, 0.0062); EndSk(d); CutBoth(d, "pitot bore");
        HolesY(d, new double[,] { { 0, 0 } }, 0.004, -0.0215, 0.0085, true, "pinch insert hole");   // 8.5 deep: screw tip clearance
        Finish(d, "Pitot_Clamp", PRINT2, "Printed PETG pitot clamp 20 x 20 x 21.5 bonded into the left wing lower surface: 6.2 bore (measured tube OD + 0.2), RX-M3x5.7 insert and F07 pinch screw from below", "PETG");
    }
    static void HornHardpoint()
    {   // HS J17: PETG 20 x 12 x 10 bonded flush into the aileron lower surface; 2 x 2.6 holes at x +-4 with 4.2 AF x 2.0 nut pockets from the top (nut captive in the foam side)
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, 0.005, 0.020, 0.010, 0.001); EndSk(d); Ext(d, 0.012, false, true);
        HolesY(d, new double[,] { { 0.004, 0 }, { -0.004, 0 } }, 0.0026, 0, 0.010, true, "horn screw holes");
        HexesY(d, new double[,] { { 0.004, 0 }, { -0.004, 0 } }, 0.0042, 0.010, 0.002, false, "nut pockets");
        Finish(d, "Horn_Hardpoint", PRINT2, "Printed PETG aileron horn hardpoint 20 x 12 x 10 bonded flush into the lower surface at 75-83 % c: 2 x 2.6 holes, M2 nut pockets 4.2 AF x 2.0 (nuts captive against the foam)", "PETG");
    }

    // ---------- pod, canopy, trays ----------
    static void Fuselage()
    {   // streamlined pod: elliptic nose, parallel mid-body, boat-tail; pockets: wing-root slot, battery bay, avionics bay + canopy pocket, hatch flange/tongue slots, pusher cup bore + radial holes, saddle-tab insert holes
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0);
        double L = D("fusL"), R = D("fusR"), rt = D("tailR");
        var pts = new List<double>(); int N = 30;
        for (int i = 0; i <= N; i++)
        {   // profile Geom.PodRadius (elliptic nose, parallel mid-body, smooth-step boat-tail; constants from params podProfile)
            double s = L * i / N, r = Geom.PodRadius(s, L, R, rt);
            pts.Add(-s); pts.Add(i == 0 ? 0 : r); pts.Add(0);
        }
        sm.CreateSpline2(pts.ToArray(), true);
        sm.CreateLine(-L, rt, 0, -L, 0, 0); sm.CreateLine(-L, 0, 0, 0, 0, 0);
        sm.CreateCenterLine(0.05, 0, 0, -L - 0.05, 0, 0);
        EndSk(d); Rev(d);
        double ox = -Geom.PodNoseX, oy = -D("yPod");   // pod local = global - (podProfile noseX, yPod, 0)
        // wing-root slot: the saddle section through the pod (the pod is a solid foam body; the saddle fills the slot)
        var foil = Geom.WingSection(D("tc"), 40);
        sm = Sk(d, 0, 0); SectionPartAt(sm, foil, D("chord"), ox, oy); EndSk(d); CutBoth(d, "wing root slot");
        // battery bay (J18) and avionics bay under the canopy (J15)
        double bx = D("battX") + ox, bl = D("battL") / 2 + 0.005;
        sm = Sk(d, 1, -0.080 + oy); Rect(sm, 1, bx - bl, -0.030, bx + bl, 0.030); EndSk(d); CutD(d, 0.060, true, "battery bay");
        sm = Sk(d, 1, D("bayY0") + oy); Rect(sm, 1, D("bayX0") + ox, -D("bayZ"), D("bayX1") + ox, D("bayZ")); EndSk(d); CutD(d, D("bayY1") - D("bayY0"), true, "avionics bay");
        // canopy pocket: the blister's base ellipse from y = canopyY up through the top skin; hatch flange and front tongue slots
        double cx = (D("canopyX0") + D("canopyX1")) / 2 + ox, ca = (D("canopyX1") - D("canopyX0")) / 2, cr = D("canopyR"), cy = D("canopyY") + oy;
        sm = Sk(d, 1, cy); sm.CreateEllipse(cx, 0, 0, cx + ca, 0, 0, cx, cr, 0); EndSk(d); CutD(d, 0.10, true, "canopy pocket");
        sm = Sk(d, 1, cy); Rect(sm, 1, D("canopyX0") + ox - 0.020, -0.020, D("canopyX0") + ox + 0.005, 0.020); EndSk(d); CutD(d, 0.10, true, "hatch flange slot");
        sm = Sk(d, 1, cy); Rect(sm, 1, D("canopyX1") + ox - 0.005, -0.020, D("canopyX1") + ox + 0.020, 0.020); EndSk(d); CutD(d, 0.0022, true, "hatch tongue slot");
        HolesY(d, new double[,] { { 0.06 + ox, 0.015 }, { 0.06 + ox, -0.015 } }, 0.004, cy, 0.007, false, "hatch insert holes");
        // pusher cup bore (FT11) and 4 radial 3.6 holes at 15 mm from the tail face (J12)
        sm = Sk(d, 2, -L); Circle(sm, 2, 0, 0, 0.056); EndSk(d); CutD(d, 0.030, true, "tail ring bore");
        sm = Sk(d, 1, 0.035); Circle(sm, 1, -L + 0.015, 0, 0.0036); EndSk(d); CutD(d, 0.010, false, "tail ring radial hole top");
        sm = Sk(d, 1, -0.045); Circle(sm, 1, -L + 0.015, 0, 0.0036); EndSk(d); CutD(d, 0.020, true, "tail ring radial hole bottom");
        sm = Sk(d, 0, 0); Circle(sm, 0, -L + 0.015, 0, 0.0036); EndSk(d); CutBoth(d, "tail ring radial holes Z");
        // saddle-tab insert holes (J11): radial along Z at y = -0.030 (pod centre height), x = -0.10 c and -0.30 c, 7 deep from each side
        foreach (double sgn in new[] { 1.0, -1.0 })
        { sm = Sk(d, 0, sgn * 0.080); Circle(sm, 0, -0.10 * D("chord") + ox, 0, 0.004); Circle(sm, 0, -0.30 * D("chord") + ox, 0, 0.004); EndSk(d); CutD(d, 0.007, sgn < 0, "saddle insert holes"); }
        Finish(d, "Fuselage_Pod", POD, "Fuselage pod 0.85 x 0.16 m, foam + PETG frames + tape (EST): wing-root slot, battery and avionics bays, canopy pocket, tail ring bore 56 x 30 with 4 radial holes, insert holes for the saddle tabs (frame rails in reality)", "XPS");
    }
    // full section outline translated by (ox, oy) in the sketch (model X = -x c + ox, Y = y c + oy)
    static void SectionPartAt(SketchManager sm, List<double[]> foil, double c, double ox, double oy)
    {
        var pts = new List<double>();
        for (int i = 0; i < foil.Count; i++) { pts.Add(-foil[i][0] * c + ox); pts.Add(foil[i][1] * c + oy); pts.Add(0); }
        sm.CreateSpline2(pts.ToArray(), true);
        sm.CreateLine(pts[0], pts[1], 0, pts[pts.Count - 3], pts[pts.Count - 2], 0);
    }
    static void Canopy()
    {   // avionics hatch blister (half-ellipsoid about X) with a 2 mm rear flange (2 x 3.6 holes for F07, J13) and a 2 mm front tongue under the pod skin
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0);
        int N = 20; double L = 0.26, r = 0.055; var pts = new List<double>();
        for (int i = 0; i <= N; i++) { double s = L * i / N; pts.Add(-s); pts.Add(r * Math.Sqrt(Math.Max(0, 1 - Math.Pow((2 * s - L) / L, 2)))); pts.Add(0); }
        sm.CreateSpline2(pts.ToArray(), true);
        sm.CreateLine(-L, 0, 0, 0, 0, 0);
        sm.CreateCenterLine(0.01, 0, 0, -L - 0.01, 0, 0);
        EndSk(d); Rev(d);
        sm = Sk(d, 1, 0); Rect(sm, 1, -L - 0.05, -0.08, 0.05, 0.08); EndSk(d); CutD(d, 0.08, false, "below base plane");   // revolve gives a spindle: keep the half above the base
        sm = Sk(d, 1, 0); Rect(sm, 1, -L - 0.020, -0.020, -L + 0.010, 0.020); Rect(sm, 1, -0.010, -0.020, 0.020, 0.020); EndSk(d); Ext(d, 0.002, false, false);
        HolesY(d, new double[,] { { -L - 0.010, 0.015 }, { -L - 0.010, -0.015 } }, 0.0036, 0, 0.003, true, "hatch holes");
        Finish(d, "Canopy", CANOPY, "Avionics hatch blister (EST): foam shell with a 2 mm PETG rear flange (2 x F07 into inserts) and a front tongue under the pod skin (J13)", "XPS");
    }
    static void BatteryTray()
    {   // J18: printed tray 165 x 3 x 56 with two 22 x 3 strap slots
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); RoundRect(sm, 0, 0, 0.165, 0.056, 0.004); EndSk(d); Ext(d, 0.003, false, false);
        sm = Sk(d, 1, 0); Rect(sm, 1, -0.045, -0.011, -0.042, 0.011); Rect(sm, 1, 0.042, -0.011, 0.045, 0.011); EndSk(d); CutBoth(d, "strap slots");
        Finish(d, "Battery_Tray", PRINT2, "Printed PETG battery tray 165 x 56 x 3 bonded in the battery bay, two 22 x 3 slots for the ShareGoo straps (J18, no fasteners)", "PETG");
    }
    static void FcTray()
    {   // J15 provisional: 60 x 44 x 3 plate with 4 bosses dia 8 x 8 at 45 x 25 (EST pattern) and RX-M3x5.7 insert holes
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); RoundRect(sm, 0, 0, 0.060, 0.044, 0.004); EndSk(d); Ext(d, 0.003, false, false);
        sm = Sk(d, 1, 0.003); foreach (double a in new[] { 1.0, -1.0 }) foreach (double b in new[] { 1.0, -1.0 }) Circle(sm, 1, a * 0.0225, b * 0.0125, 0.008); EndSk(d); Ext(d, 0.008, false, false);
        HolesY(d, Grid(0.0225, 0.0125), 0.004, 0.011, 0.007, false, "fc insert holes");
        Finish(d, "FC_Tray", PRINT2, "Printed PETG flight-controller tray 60 x 44 x 3 with 4 insert bosses on a 45 x 25 pattern (EST: CoreWing F405 Wing V2 hole pattern not confirmed, J15); bonded to the avionics bay floor", "PETG");
    }
    static void FlightController()
    {   // CoreWing F405 Wing V2 envelope 52 x 32 x 17 (ArduPilot wiki): 1.6 board + component box; 4 x 3.4 holes on 45 x 25 (EST)
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); RoundRect(sm, 0, 0, 0.052, 0.032, 0.002); EndSk(d); Ext(d, 0.0016, false, false);
        sm = Sk(d, 1, 0.0016); RoundRect(sm, 0, 0, 0.040, 0.025, 0.002); EndSk(d); Ext(d, 0.0154, false, false);
        HolesY(d, Grid(0.0225, 0.0125), 0.0034, 0, 0.0016, true, "fc holes");
        Finish(d, "Flight_Controller", PCB, "CoreWing F405 Wing V2 envelope 52 x 32 x 17 (ArduPilot wiki); hole pattern provisional 45 x 25 (EST)", "fc");
    }
    static void PusherCup()
    {   // HS J12: PA6-CF cup OD 55.6 (FT11), wall 2.0, open forward (+X) 30 mm into the pod ring; floor 4.5 at x 0..4.5 with 4 x 3.6 on dia 25, relief + wire groove on the aft face; 4 bosses with radial insert holes
        ModelDoc2 d = NewPart();
        RevBody(d, 'X', new double[,] { { 0, 0 }, { 0, 0.0278 }, { 0.030, 0.0278 }, { 0.030, 0.0258 }, { 0.0045, 0.0258 }, { 0.0045, 0 } });
        var sm = Sk(d, 2, 0.0045);
        foreach (double[] q in new[] { new[] { 0.0, 0.0225 }, new[] { 0.0, -0.0225 }, new[] { 0.0225, 0.0 }, new[] { -0.0225, 0.0 } }) { double[] cc = Map(2, q[0], q[1]); RoundRect(sm, cc[0], cc[1], 0.010, 0.010, 0.001); }
        EndSk(d); Ext(d, 0.0255, false, false);
        sm = Sk(d, 2, 0); foreach (double a in new[] { 1.0, -1.0 }) foreach (double b in new[] { 1.0, -1.0 }) Circle(sm, 2, a * 0.00884, b * 0.00884, 0.0036); EndSk(d); CutD(d, 0.0045, true, "cup motor holes");
        sm = Sk(d, 2, 0); Circle(sm, 2, 0, 0, 0.008); EndSk(d); CutD(d, 0.002, true, "cup relief");
        sm = Sk(d, 2, 0); Rect(sm, 2, -0.003, -0.028, 0.003, -0.003); EndSk(d); CutD(d, 0.002, true, "cup wire groove");
        sm = Sk(d, 1, 0.0278); Circle(sm, 1, 0.015, 0, 0.004); EndSk(d); CutD(d, 0.007, false, "radial insert hole top");
        sm = Sk(d, 1, -0.0278); Circle(sm, 1, 0.015, 0, 0.004); EndSk(d); CutD(d, 0.007, true, "radial insert hole bottom");
        sm = Sk(d, 0, 0.0278); Circle(sm, 0, 0.015, 0, 0.004); EndSk(d); CutD(d, 0.007, false, "radial insert hole right");
        sm = Sk(d, 0, -0.0278); Circle(sm, 0, 0.015, 0, 0.004); EndSk(d); CutD(d, 0.007, true, "radial insert hole left");
        Finish(d, "Pusher_Cup", PRINT, "Printed PA6-CF pusher motor cup dia 55.6 x 30 (FT11 in the 56 pod ring): 4.5 floor with 4 x 3.4 on dia 25 and relief/wire groove, 4 bosses with radial RX-M3x5.7 inserts for the F07 ring screws", "PA6CF");
    }
    // ---------- servos, horns, pushrods ----------
    static void Servo()
    {   // EMAX ES3005HV envelope (HS J14); tabs, holes, shaft and arm EST. Body x +-L/2, y +-W/2, z 0..H; shaft +Z
        double L = D("servoL"), W = D("servoW"), H = D("servoH"), tz = D("servoTabZ"), tt = D("servoTabT"), tx = D("servoTabX"), ty = D("servoTabY"), sx = D("servoShaftX"), arm = D("servoArmLen");
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, 0, L, W, 0.001); EndSk(d); Ext(d, H, false, false);
        sm = Sk(d, 0, tz); RoundRect(sm, 0, 0, L + 0.015, W - 0.002, 0.001); EndSk(d); Ext(d, tt, false, false);
        sm = Sk(d, 0, tz); foreach (double a in new[] { 1.0, -1.0 }) foreach (double b in new[] { 1.0, -1.0 }) Circle(sm, 0, a * tx, b * ty, 0.0024); EndSk(d); CutD(d, tt, true, "servo tab holes");
        sm = Sk(d, 0, H); Circle(sm, 0, sx, 0, 0.006); EndSk(d); Ext(d, 0.004, false, false);
        sm = Sk(d, 0, H + 0.004); RoundRect(sm, sx, -arm / 2 + 0.003, 0.006, arm + 0.006, 0.002); EndSk(d); Ext(d, 0.002, false, false);
        Finish(d, "Servo", SERVO, "EMAX ES3005HV servo 38.6 x 18.8 x 34.9 (J14); mounting tabs, 4 x 2.4 holes at 46 x 10, shaft and 20 mm arm EST (not published, measure on arrival M6)", "servo");
    }
    static void ServoTray()
    {   // printed L-bracket: plate 50 x 28 x 3 (XY, z 0..3) with a body cutout, 4 x 2.6 holes and M2 nut pockets on the z=0 face; foot 50 x 15 x 3 at the top (y 0..3)
        double by = D("trayBodyY"), tx = D("servoTabX"), ty = D("servoTabY"), L = D("servoL"), W = D("servoW");
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, -0.014, 0.050, 0.028, 0.002); EndSk(d); Ext(d, 0.003, false, false);
        sm = Sk(d, 0, 0); Rect(sm, 0, -(L + 0.0006) / 2, by - (W + 0.0006) / 2, (L + 0.0006) / 2, by + (W + 0.0006) / 2); EndSk(d); CutBoth(d, "tray cutout");
        sm = Sk(d, 0, 0); foreach (double a in new[] { 1.0, -1.0 }) foreach (double b in new[] { 1.0, -1.0 }) Circle(sm, 0, a * tx, by + b * ty, 0.0026); EndSk(d); CutBoth(d, "tray holes");
        sm = Sk(d, 0, 0); foreach (double a in new[] { 1.0, -1.0 }) foreach (double b in new[] { 1.0, -1.0 }) Hex(sm, 0, a * tx, by + b * ty, 0.0042); EndSk(d); CutD(d, 0.002, true, "tray nut pockets");
        sm = Sk(d, 1, 0); Rect(sm, 1, -0.025, -0.012, 0.025, 0.003); EndSk(d); Ext(d, 0.003, false, false);
        Finish(d, "Servo_Tray", PRINT2, "Printed PETG servo tray (L-bracket): plate 50 x 28 x 3 with the body cutout, 4 x 2.6 holes and M2 nut pockets 4.2 AF x 2.0; 15 mm foot bonded to foam (J14, one part for all 5 servos)", "PETG");
    }
    static void ControlHorn()
    {   // kit nylon horn 11 x 11 x 20 (HS J17): base 20 x 11 x 2 (y 0..-2) extending -X from the upright at x 0..-2 (down to y -13), 3 pin holes
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); Rect(sm, 1, -0.020, -0.0055, 0, 0.0055); EndSk(d); Ext(d, 0.002, true, false);
        sm = Sk(d, 0, -0.001); Poly(sm, new double[,] { { 0, 0 }, { 0, -0.013 }, { -0.004, -0.013 }, { -0.020, -0.002 }, { -0.020, 0 } }, true); EndSk(d); Ext(d, 0.002, false, false);
        sm = Sk(d, 0, -0.001); Circle(sm, 0, -0.001, -0.0055, 0.0018); Circle(sm, 0, -0.001, -0.0085, 0.0018); Circle(sm, 0, -0.001, -0.0115, 0.0018); EndSk(d); CutD(d, 0.002, true, "pin holes");
        HolesY(d, new double[,] { { -0.006, 0 }, { -0.014, 0 } }, 0.0024, 0, 0.002, false, "horn screw holes");
        Finish(d, "Control_Horn", NYLON, "Nylon control horn 11 x 11 x 20 from the 12-set kit (B0B58ZSC8J): 2 x M2 base holes 8 mm apart (EST), 3 pin holes; one per surface (J17)", "nylon");
    }
    static void HornBackplate()
    {
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); Rect(sm, 1, -0.020, -0.0055, 0, 0.0055); EndSk(d); Ext(d, 0.0015, true, false);
        HolesY(d, new double[,] { { -0.006, 0 }, { -0.014, 0 } }, 0.0024, 0, 0.0015, false, "backplate holes");
        Finish(d, "Horn_Backplate", NYLON, "Kit horn backplate 20 x 11 x 1.5 (EST) on the far side of the elevator and rudders (J17)", "nylon");
    }
    static void Pushrod(string name, double len)
    {   // Du-Bro 2-56 rod (dia 2.18) cut to length from the servo arm (x 0) to the horn pin (x len), nylon Kwik-Link clevis 14 x 4 x 5 EST at the horn end
        ModelDoc2 d = NewPart(); var sm = Sk(d, 2, 0); sm.CreateCircleByRadius(0, 0, 0, 0.00109); EndSk(d); Ext(d, len - 0.012, false, false);
        sm = Sk(d, 2, len - 0.014); RoundRect(sm, 0, 0, 0.005, 0.005, 0.001); EndSk(d); Ext(d, 0.014, false, false);
        sm = Sk(d, 1, 0); Rect(sm, 1, len - 0.006, -0.0013, len + 0.001, 0.0013); EndSk(d); CutBoth(d, "clevis fork");   // straddles the 2 mm horn upright
        Finish(d, name, STEEL, "Du-Bro 230 2-56 pushrod cut to " + (len * 1000).ToString("0", IC) + " mm (calc from the CAD stations) with nylon Kwik-Link; Z-bend at the servo arm (J17)", "steel");
    }

    // ---------- aerodynamic surfaces ----------
    static void WingPanel(string name, bool left)
    {   // NACA 24xx panel (t/c from params): full chord inboard of the aileron, 0-72 % chord along the aileron span; spar socket bored 0.8 m;
        // pockets: spar collar, rear hardpoint, servo + tray, root tongue slot, (left) pitot clamp
        ModelDoc2 d = NewPart(); double c = D("chord"), L = D("panelLen"), Lail = L * 0.55, Lin = L - Lail, s = left ? -1 : 1;
        var foil = Geom.WingSection(D("tc"), 40);
        var sm = Sk(d, 0, 0); SectionPart(sm, foil, c, 0, 0.72); EndSk(d);
        Ext(d, L, left, false);
        sm = Sk(d, 0, 0); SectionPart(sm, foil, c, 0.72, 1.0); EndSk(d);
        Ext(d, Lin, left, false);
        sm = Sk(d, 0, 0); sm.CreateCircleByRadius(D("sparX"), D("sparY"), 0, D("sparOD") / 2); EndSk(d); CutD(d, D("sparLen") + 0.001, !left, "spar socket");
        double zb = D("zBoomPanel"), sx = D("sparX"), sy = D("sparY");
        PocketZ(d, sx - 0.016, D("yL30") - 0.001, sx + 0.016, sy + 0.0157, s * zb - 0.023, s * zb + 0.023, "collar pocket");
        PocketZ(d, -0.8 * c - 0.030, D("yL80") - 0.002, -0.8 * c + 0.030, D("yL80") + 0.010, s * zb - 0.023, s * zb + 0.023, "rear hardpoint pocket");
        double zs = s * D("zServoPanel"), xs = D("xServo"), ys = D("yServo");
        double z0 = left ? zs - 0.042 : zs - 0.022, z1 = left ? zs + 0.022 : zs + 0.042;
        PocketZ(d, xs - 0.027, D("yL55") - 0.003, xs + 0.027, ys - D("trayBodyY") + 0.0032, z0, z1, "servo pocket");
        double bx = D("boltX"), ym = D("yMid70");
        PocketZ(d, bx - 0.0102, ym - 0.0034, bx + 0.0102, ym + 0.0034, left ? -0.0255 : -0.0005, left ? 0.0005 : 0.0255, "tongue slot");
        if (left) PocketZ(d, D("pitotX") - 0.010, D("yL21") - 0.001, D("pitotX") + 0.010, D("yL21") + 0.003, D("pitotZ") + D("fusR") - 0.010, D("pitotZ") + D("fusR") + 0.010, "pitot clamp pocket");
        Finish(d, name, FOAM, (left ? "Left" : "Right") + " wing panel, NACA 24" + Math.Round(100 * D("tc")).ToString("00") + " (EST), XPS core + tape skin, chord " + (1000 * c).ToString("0", IC) + " mm; pockets for the spar collar, rear hardpoint, aileron servo tray, root tongue" + (left ? " and pitot clamp" : ""), "XPS");
    }
    // rectangular pocket x0..x1, y0..y1 (Front sketch) spanning z0..z1 (z1 > z0)
    static void PocketZ(ModelDoc2 d, double x0, double y0, double x1, double y1, double z0, double z1, string what)
    {
        var sm = Sk(d, 0, z0); Rect(sm, 0, x0, y0, x1, y1); EndSk(d); CutD(d, z1 - z0, true, what);
    }
    static void Aileron(string name, bool left)
    {   // 74-100 % chord (2 % hinge gap), outer 55 % of the panel, 4 mm tip clearance; pocket for the horn hardpoint
        ModelDoc2 d = NewPart(); double c = D("chord"), L = D("panelLen"), Lail = L * 0.55 - 0.004, Lin = L * 0.45;
        var foil = Geom.WingSection(D("tc"), 40);
        var sm = Sk(d, 0, 0); SectionPart(sm, foil, c, 0.74, 1.0); EndSk(d);
        Ext(d, Lail, left, false);
        double zh = (left ? -1 : 1) * (D("zHornPanel") - (Lin + 0.002)), hx = D("hornHpX");
        PocketZ(d, hx - 0.0205, D("yL78") - 0.0015, hx + 0.0005, D("yL78") + 0.010, zh - 0.0065, zh + 0.0065, "horn hardpoint pocket");
        Finish(d, name, SURF, (left ? "Left" : "Right") + " aileron, 26 % chord, 55 % of panel span, tape hinge; pocket for the horn hardpoint", "XPS");
    }
    static void WingSaddle()
    {   // root section across the pod (2 x fusR wide) bored for the joiner (slip fit), with two 6 mm PETG side tabs (J11), bolt-pillar bores and tongue slots
        ModelDoc2 d = NewPart(); double c = D("chord"), w = D("fusR");
        var foil = Geom.WingSection(D("tc"), 40);
        var sm = Sk(d, 0, 0); SectionPart(sm, foil, c, 0, 1.0); EndSk(d);
        Ext(d, 2 * w, false, true);
        foreach (double sgn in new[] { 1.0, -1.0 })
        { sm = Sk(d, 0, sgn * w); Rect(sm, 0, -0.35 * c, -0.040, -0.05 * c, D("yL30") - 0.001); EndSk(d); Ext(d, 0.006, sgn < 0, false); }
        sm = Sk(d, 0, 0); sm.CreateCircleByRadius(D("sparX"), D("sparY"), 0, D("joinBoreD") / 2); EndSk(d); CutBoth(d, "joiner bore");
        sm = Sk(d, 0, 0); Circle(sm, 0, -0.10 * c, -0.030, 0.0036); Circle(sm, 0, -0.30 * c, -0.030, 0.0036); EndSk(d); CutBoth(d, "tab holes");
        sm = Sk(d, 1, 0); Circle(sm, 1, D("boltX"), D("boltZ"), D("pillarBoreD")); Circle(sm, 1, D("boltX"), -D("boltZ"), D("pillarBoreD")); EndSk(d); CutBoth(d, "pillar bores");
        double bx = D("boltX"), ym = D("yMid70");
        PocketZ(d, bx - 0.0102, ym - 0.0034, bx + 0.0102, ym + 0.0034, 0.0545, w + 0.001, "tongue slot R");
        PocketZ(d, bx - 0.0102, ym - 0.0034, bx + 0.0102, ym + 0.0034, -w - 0.001, -0.0545, "tongue slot L");
        Finish(d, "Wing_Saddle", PRINT, "Wing centre-section saddle: XPS block + printed PETG root plates (EST) carrying the root aerofoil across the pod; joiner bore slip fit (FT06), pillar bores, tongue slots, 6 mm side tabs with 2 x F08 each into pod inserts (J11)", "XPS");
    }
    static void Tailplane(string name, bool elevator)
    {   // NACA 0009, fixed part 0-68 % chord (with 4 x 7.2 holes for the crush sleeves), elevator 70-100 %
        ModelDoc2 d = NewPart(); double c = D("hC"), span = D("hSpan");
        var foil = Geom.TailSection(30);
        var sm = Sk(d, 0, 0);
        if (elevator) SectionPart(sm, foil, c, 0.70, 1.0); else SectionPart(sm, foil, c, 0, 0.68);
        EndSk(d); Ext(d, elevator ? D("elevSpan") : span, false, true);
        if (!elevator)
        {
            double xh = D("xTC") - D("xFinLE"), yIn = D("yIn");
            HolesY(d, new double[,] { { xh, yIn + 0.0175 }, { xh, yIn - 0.0175 }, { xh, -yIn + 0.0175 }, { xh, -yIn - 0.0175 } }, 0.0072, -0.01, 0.02, true, "sleeve holes");
        }
        Finish(d, name, elevator ? SURF : FOAM, elevator ? "Elevator, 30 % chord, NACA 0009, tape hinge; horn on the top surface at z +40 (J17)" : "Horizontal stabiliser, NACA 0009 (EST), area from V_h = 0.35; 4 x 7.2 holes for the fin-shoe crush sleeves (J09)", "XPS");
    }
    static void CrushSleeve()
    {
        ModelDoc2 d = NewPart(); var sm = Sk(d, 1, 0); sm.CreateCircleByRadius(0, 0, 0, 0.0035); sm.CreateCircleByRadius(0, 0, 0, 0.0017); EndSk(d); Ext(d, D("tailT"), false, false);
        Finish(d, "Crush_Sleeve", PRINT2, "Printed PETG crush sleeve 7 x 3.4 x " + (D("tailT") * 1000).ToString("0.0", IC) + " through the stabiliser under the fin-shoe screws (J09)", "PETG");
    }
    static string Loft(ModelDoc2 d, string skA, string skB)
    {
        d.ClearSelection2(true);
        d.Extension.SelectByID2(skA, "SKETCH", 0, 0, 0, true, 1, null, 0);
        d.Extension.SelectByID2(skB, "SKETCH", 0, 0, 0, true, 1, null, 0);
        Feature loft = d.FeatureManager.InsertProtrusionBlend2(false, true, false, 1, 0, 0, 1, 1, true, true, false, 0, 0, 0, true, true, true, 0);
        return loft == null ? null : loft.Name;
    }
    // fin section sketch at height y (Top-plane sketch on an offset plane): chord and LE offset follow the 65 % taper / 35 % c sweep (EST planform)
    static string FinSketch(ModelDoc2 d, List<double[]> foil, double y, double x0, double x1)
    {
        double c = D("vC"), h = D("vH"), f = y / h, cl = c * (1 - 0.35 * f), xoff = 0.35 * c * f;
        var sm = Sk(d, 1, y); SectionPart(sm, foil, cl, x0, x1, xoff); d.SketchManager.AddToDB = false; d.SketchManager.InsertSketch(true);
        return ((Feature)d.FeatureByPositionReverse(0)).Name;
    }
    static void Fin()
    {   // fixed fin 0-68 % chord lofted root to tip; full-section root block 0..21 mm inside the shoe (C6 rudder split)
        ModelDoc2 d = NewPart(); double h = D("vH"), blk = D("finRootBlock");
        var foil = Geom.TailSection(30);
        string a = FinSketch(d, foil, 0, 0, 0.68), b = FinSketch(d, foil, h, 0, 0.68);
        string loft = Loft(d, a, b);
        if (loft == null) { Log("  fin loft failed: plain extrude"); d.ClearSelection2(true); d.Extension.SelectByID2(a, "SKETCH", 0, 0, 0, false, 0, null, 0); Ext(d, h, false, false); }
        var sm = Sk(d, 1, 0); SectionPart(sm, foil, D("vC"), 0.66, 1.0); EndSk(d); Ext(d, blk, false, false);
        Finish(d, "Fin", FOAM, "Vertical fin, NACA 0009, lofted taper 65 % tip chord, fixed part 0-68 % chord; full-section root 21 mm sits in the printed shoe; bonded (J09)", "XPS");
    }
    static void Rudder()
    {   // 70-100 % chord from 22 mm above the root (clear of the shoe wall) to the tip, 2 % hinge gap; horn on the inboard face
        ModelDoc2 d = NewPart(); double h = D("vH"), y0 = D("rudderY0");
        var foil = Geom.TailSection(30);
        string a = FinSketch(d, foil, y0, 0.70, 1.0), b = FinSketch(d, foil, h, 0.70, 1.0);
        string loft = Loft(d, a, b);
        if (loft == null) { Log("  rudder loft failed: plain extrude"); d.ClearSelection2(true); d.Extension.SelectByID2(a, "SKETCH", 0, 0, 0, false, 0, null, 0); Ext(d, h - y0, false, false); }
        Finish(d, "Rudder", SURF, "Rudder, 30 % of the local fin chord (2 % tape-hinge gap, as the ailerons/elevator), from 22 mm above the fin root to the tip; EMAX ES3005HV via the kit horn (J17)", "XPS");
    }
    static void FinShoe()
    {   // HS J09: 3 mm floor + 20 mm walls 1.6 thick around the fin root section; flange 32 x 46 at the clamp station with 2 x 3.6 holes
        ModelDoc2 d = NewPart(); double c = D("vC"), c2 = c + 0.0032, k = (Geom.TailT * c + 0.0032) / (Geom.TailT * c2), xc = D("xTC") - D("xFinLE");
        List<double[]> foil = Geom.TailSection(30), foil2 = Geom.Naca(Geom.TailM, Geom.TailP, Geom.TailT * k, 30);
        var sm = Sk(d, 1, 0); SectionPart(sm, foil2, c2, 0, 1.0, -0.0016); EndSk(d); Ext(d, D("shoeFloor") + D("shoeWall"), false, false);
        sm = Sk(d, 1, 0); RoundRect(sm, xc, 0, D("shoeFlangeX"), 0.046, 0.003); EndSk(d); Ext(d, D("shoeFloor"), false, false);
        sm = Sk(d, 1, D("shoeFloor") + D("shoeWall")); SectionPart(sm, foil, c, 0, 1.0); EndSk(d); CutD(d, D("shoeWall"), false, "fin pocket");
        HolesY(d, new double[,] { { xc, 0.0175 }, { xc, -0.0175 } }, 0.0036, 0, D("shoeFloor"), true, "shoe holes");
        Finish(d, "Fin_Shoe", PRINT2, "Printed PETG fin root shoe: 3 mm floor, 20 mm walls 1.6 thick around the root section (fin bonded in), 32 x 46 flange with 2 x 3.6 for the F02 screws through the stabiliser into the tail clamp (J09)", "PETG");
    }
    static string RoundBox(string name, double lx, double ly, double lz, double r, double[] rgb, string desc, string mat)
    {
        ModelDoc2 d = NewPart(); var sm = Sk(d, 0, 0); RoundRect(sm, 0, 0, lx, ly, r); EndSk(d); Ext(d, lz, false, true);
        return Finish(d, name, rgb, desc, mat);
    }

    // ---------- assembly ----------
    static ModelDoc2 Assemble(List<string[]> comps, string title, string desc)
    {
        sw.Visible = true;
        ModelDoc2 asmDoc = (ModelDoc2)sw.NewDocument(AsmTpl, 0, 0, 0);
        AssemblyDoc asm = (AssemblyDoc)asmDoc;
        // AddComponents3 loads the part files itself (opening 75 part documents one by one crashed SOLIDWORKS); batches of 60
        int n = 0;
        for (int b0 = 0; b0 < comps.Count; b0 += 60)
        {
            int nb = Math.Min(60, comps.Count - b0);
            var names = new string[nb]; var tf = new double[16 * nb]; var cs = new string[nb];
            for (int i = 0; i < nb; i++)
            {
                string[] c = comps[b0 + i];
                if (!Parts.ContainsKey(c[0])) throw new Exception("no part " + c[0]);
                double x = double.Parse(c[1], IC), y = double.Parse(c[2], IC), z = double.Parse(c[3], IC);
                double[] t = { 1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z, 1, 0, 0, 0 };
                if (c.Length > 4 && c[4].Length > 0) { string[] r = c[4].Split(','); for (int k = 0; k < 9; k++) t[k] = double.Parse(r[k], IC); }
                names[i] = Parts[c[0]].Path; cs[i] = ""; Array.Copy(t, 0, tf, 16 * i, 16);
                if (title == "VTOL_Concept") Parts[c[0]].Qty++;
            }
            object res = asm.AddComponents3(names, tf, cs);
            object[] added = res as object[];
            int got = added == null ? 0 : added.Length;
            if (got != nb) Log("  WARNING batch " + b0 + ": " + got + " of " + nb + " components added");
            n += got; Log("  components " + n + " / " + comps.Count);
        }
        asmDoc.ClearSelection2(true); asmDoc.Extension.SelectAll(); asm.FixComponent(); asmDoc.ClearSelection2(true);
        asmDoc.ShowNamedView2("*Isometric", 7); asmDoc.ViewZoomtofit2(); asmDoc.EditRebuild3();
        CustomPropertyManager cpm = asmDoc.Extension.get_CustomPropertyManager("");
        cpm.Add3("Description", 30, desc, 2);
        cpm.Add3("Source", 30, "analysis/results.json + cad/hardware.json via cad/params.mjs; build cad/build.ps1", 2);
        Log(string.Format(IC, "{0}: {1} components", title, n));
        return asmDoc;
    }

    // ---------- verification: interference detection, mass roll-up, counts ----------
    static void Verify(ModelDoc2 asmDoc)
    {
        AssemblyDoc asm = (AssemblyDoc)asmDoc;
        V(""); V("## Model content");
        int nFast = 0, nParts = 0; foreach (string[] c in Comps) { if (IsFastener(c[0])) nFast++; else nParts++; }
        V("components " + Comps.Count + " (" + nParts + " structural/purchased + " + nFast + " fasteners); unique part files " + Parts.Count);
        V("cosmetic threads: " + threadsOk + " created, " + threadsFail + " failed; cut warnings " + cutWarnings);
        double[] box = (double[])asm.GetBox(0);
        if (box != null) V(string.Format(IC, "assembly bounding box x {0:0.000}..{1:0.000}  y {2:0.000}..{3:0.000}  z {4:0.000}..{5:0.000} m", box[0], box[3], box[1], box[4], box[2], box[5]));
        V(string.Format(IC, "pusher/lift disc clearance (params.mjs) {0:0.0} mm; pusher prop ground clearance {1:0.0} mm; boom cut lengths {2:0.0} / {3:0.0} mm",
            D("discClear") * 1000, (D("yPod") - D("pushProp") / 2 - D("yGround")) * 1000, D("segF") * 1000, D("segR") * 1000));
        // rotation convention check on a rotated fastener (F05 along -X)
        object[] all = (object[])asm.GetComponents(true);
        foreach (object o in all)
        {
            Component2 cc = (Component2)o; if (!cc.Name2.StartsWith("F05_")) continue;
            double[] b = (double[])cc.GetBox(false, false);
            V(string.Format(IC, "rotation check F05 (expected along X): box extents x {0:0.0} y {1:0.0} z {2:0.0} mm", (b[3] - b[0]) * 1000, (b[4] - b[1]) * 1000, (b[5] - b[2]) * 1000)); break;
        }
        // mass roll-up
        V(""); V("## Mass roll-up (volume x density, or fixed vendor mass)  [part | qty | each g | total g | basis]");
        double mTot = 0, mFast = 0, mPrint = 0, mTube = 0, mFoam = 0, mFixed = 0;
        var names = new List<string>(Parts.Keys); names.Sort();
        foreach (string k in names)
        {
            PartRec p = Parts[k]; Mat mt = MATS[p.Mat]; double each = mt.Fixed > 0 ? mt.Fixed : p.Vol * mt.Rho; double tot = each * p.Qty;
            mTot += tot;
            if (IsFastener(k)) mFast += tot; else if (p.Mat == "PETG" || p.Mat == "PA6CF" || p.Mat == "nylon") mPrint += tot; else if (p.Mat == "6061") mTube += tot; else if (p.Mat == "XPS") mFoam += tot; else mFixed += tot;
            V(string.Format(IC, "{0,-22} | {1,3} | {2,8:0.00} | {3,8:0.0} | {4}", k, p.Qty, each * 1000, tot * 1000, mt.Fixed > 0 ? mt.Src : (p.Vol * 1e6).ToString("0.00", IC) + " cm3 x " + mt.Rho + " kg/m3 (" + mt.Src + ")"));
        }
        V(string.Format(IC, "TOTAL modelled mass {0:0.000} kg: fasteners {1:0.0} g, printed parts {2:0.0} g, 6061 tubes {3:0.0} g, foam (XPS at 32 kg/m3, skins not modelled) {4:0.0} g, fixed vendor masses {5:0.0} g",
            mTot, mFast * 1000, mPrint * 1000, mTube * 1000, mFoam * 1000, mFixed * 1000));
        V("sizing MTOW (analysis/results.json C0 sized.m) " + D("mtow").ToString("0.000", IC) + " kg includes wiring, ESCs, payload allowance, skins and avionics that are not solid-modelled; fastener mass is not tracked by sizing.mjs (see cad/README.md)");
        // interference detection
        V(""); V("## Interference detection (InterferenceDetectionMgr, coincidence not counted)");
        try
        {
            InterferenceDetectionMgr mgr = asm.InterferenceDetectionManager;
            mgr.TreatCoincidenceAsInterference = false; mgr.IncludeMultibodyPartInterferences = false; mgr.TreatSubAssembliesAsComponents = true;
            object[] ints = (object[])mgr.GetInterferences();
            int n = ints == null ? 0 : ints.Length, nIns = 0, nReal = 0; double vIns = 0, vReal = 0;
            var lines = new List<string>();
            if (ints != null) foreach (object o in ints)
            {
                Interference it = (Interference)o; object[] cs = (object[])it.Components;
                string a = ((Component2)cs[0]).Name2, b = cs.Length > 1 ? ((Component2)cs[1]).Name2 : "?";
                double vol = it.Volume * 1e9;
                bool insert = a.StartsWith("I01_") || b.StartsWith("I01_");
                if (insert) { nIns++; vIns += vol; } else { nReal++; vReal += vol; lines.Add(string.Format(IC, "  {0,8:0.00} mm3  {1}  x  {2}", vol, a, b)); }
            }
            mgr.Done();
            V(string.Format(IC, "{0} interferences: {1} are heat-set inserts in their 4.0 holes (intended press fit FT08, total {2:0.0} mm3), {3} other (total {4:0.0} mm3)", n, nIns, vIns, nReal, vReal));
            lines.Sort(); lines.Reverse(); foreach (string l in lines) V(l);
            if (nReal == 0) V("  no unintended interference");
        }
        catch (Exception e) { V("interference detection failed: " + e.Message); }
    }
    static bool IsFastener(string name) { return name.Length > 4 && (name[0] == 'F' || name[0] == 'N' || name[0] == 'W' || name[0] == 'I') && char.IsDigit(name[1]) && char.IsDigit(name[2]) && name[3] == '_'; }
}
