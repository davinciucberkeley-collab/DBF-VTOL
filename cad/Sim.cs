// SOLIDWORKS Simulation runs for the VTOL concept: structural FEA (boom arm static + frequency,
// wing spar/joiner static) and heat transfer (lift motor transient thermal). Inputs: cad/params.txt.
// Outputs: cad/sim/*.SLDPRT (studies saved inside), cad/sim/results.txt, PNG plots.
// Simplified load-path models: geometry and loads are documented in cad/README.md.
using System;
using System.IO;
using System.Collections.Generic;
using System.Globalization;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;
using SolidWorks.Interop.cosworks;

class Sim
{
    static SldWorks sw; static CosmosWorks cw;
    static Dictionary<string, string> P = new Dictionary<string, string>();
    static string Out, PartTpl; static StreamWriter R;
    static CultureInfo IC = CultureInfo.InvariantCulture;
    const string Lib = @"C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\lang\english\sldmaterials\solidworks materials.sldmat";
    static double D(string k) { return double.Parse(P[k], IC); }
    static void Res(string k, double v, string unit, string note)
    {
        string s = string.Format(IC, "{0}={1:G6}|{2}|{3}", k, v, unit, note);
        Console.WriteLine(s); R.WriteLine(s); R.Flush();
    }

    static int Main(string[] a)
    {
        P = ParamsFile.Load(a[0]).P;   // cad/Shared.cs: the one params.txt reader (compile with Shared.cs, see cad/README.md)
        Out = Path.GetFullPath(a[1]); Directory.CreateDirectory(Out);
        if (a.Length <= 2) foreach (string f in Directory.GetFiles(Out)) { string n = Path.GetFileName(f); if (n.EndsWith(".png") || n.EndsWith(".txt")) File.Delete(f); }
        R = new StreamWriter(Path.Combine(Out, "results.txt"), a.Length > 2);
        R.WriteLine("# SOLIDWORKS Simulation results, key=value|unit|note  (generated " + DateTime.Now.ToString("yyyy-MM-dd HH:mm", IC) + ")");
        sw = (SldWorks)Activator.CreateInstance(Type.GetTypeFromProgID("SldWorks.Application"));
        sw.Visible = true;
        sw.LoadAddIn(@"C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\Simulation\cosworks.dll");
        object cb = sw.GetAddInObject("SldWorks.Simulation");
        for (int i = 0; i < 30 && cb == null; i++)
        {
            System.Threading.Thread.Sleep(3000);
            int st = sw.LoadAddIn(@"C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\Simulation\cosworks.dll");
            cb = sw.GetAddInObject("SldWorks.Simulation");
            Console.WriteLine("waiting for Simulation add-in (LoadAddIn=" + st + ")");
        }
        if (cb == null) throw new Exception("Simulation add-in unavailable");
        cw = ((CwAddincallback)cb).CosmosWorks;
        PartTpl = sw.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplatePart);
        string which = a.Length > 2 ? a[2] : "BST";
        if (which.Contains("B")) Boom(); if (which.Contains("S")) Spar(); if (which.Contains("T")) Thermal();
        R.Close();
        return 0;
    }

    // ---------------- geometry helpers ----------------
    static ModelDoc2 NewPart() { return (ModelDoc2)sw.NewDocument(PartTpl, 0, 0, 0); }
    static void Sk(ModelDoc2 d, string plane)
    {
        d.ClearSelection2(true);
        d.Extension.SelectByID2(plane, "PLANE", 0, 0, 0, false, 0, null, 0);
        d.SketchManager.InsertSketch(true); d.SketchManager.AddToDB = true;
    }
    static void EndSk(ModelDoc2 d)
    {
        d.SketchManager.AddToDB = false; d.SketchManager.InsertSketch(true);
        d.ClearSelection2(true); ((Feature)d.FeatureByPositionReverse(0)).Select2(false, 0);
    }
    static void Ext(ModelDoc2 d, double depth, bool merge, int t0, double off)
    {
        Feature f = d.FeatureManager.FeatureExtrusion3(true, false, false, 0, 0, depth, 0, false, false, false, false,
            0, 0, false, false, false, false, merge, true, true, t0, off, false);
        if (f == null) throw new Exception("extrude failed");
    }
    static List<Face2> Faces(ModelDoc2 d)
    {
        var list = new List<Face2>();
        object[] bodies = (object[])((PartDoc)d).GetBodies2((int)swBodyType_e.swSolidBody, true);
        foreach (object b in bodies) foreach (object f in (object[])((Body2)b).GetFaces()) list.Add((Face2)f);
        return list;
    }
    static Face2 Planar(ModelDoc2 d, int axis, double sign, double coord)
    {   // planar face whose normal is +-axis and whose box sits at coord along that axis
        foreach (Face2 f in Faces(d))
        {
            Surface s = (Surface)f.GetSurface(); if (!s.IsPlane()) continue;
            double[] n = (double[])f.Normal; double[] bx = (double[])f.GetBox();
            if (Math.Abs(n[axis] - sign) < 1e-6 && Math.Abs(bx[axis] - coord) < 1e-4 && Math.Abs(bx[axis + 3] - coord) < 1e-4) return f;
        }
        throw new Exception("planar face not found axis " + axis + " at " + coord);
    }
    static List<Face2> Cylinders(ModelDoc2 d, double radius)
    {
        var list = new List<Face2>();
        foreach (Face2 f in Faces(d))
        {
            Surface s = (Surface)f.GetSurface(); if (!s.IsCylinder()) continue;
            double[] cp = (double[])s.CylinderParams; if (Math.Abs(cp[6] - radius) < 1e-5) list.Add(f);
        }
        return list;
    }
    static double Vol(ModelDoc2 d) { d.EditRebuild3(); MassProperty mp = d.Extension.CreateMassProperty(); return mp == null ? 0 : mp.Volume; }
    static void Save(ModelDoc2 d, string name)
    {
        int e = 0, w = 0; d.Extension.SaveAs(Path.Combine(Out, name + ".SLDPRT"), 0, 1, null, ref e, ref w);
    }
    static void Png(ModelDoc2 d, string file)
    {
        d.ShowNamedView2("*Isometric", -1); d.ViewZoomtofit2();
        int e = 0, w = 0; d.Extension.SaveAs(Path.Combine(Out, file), 0, 1, null, ref e, ref w);
    }

    // ---------------- simulation helpers ----------------
    static CWStudy NewStudy(string name, int type)
    {
        int err; CWStudy st = cw.ActiveDoc.StudyManager.CreateNewStudy3(name, type, 0, out err);
        if (st == null) throw new Exception("study create failed " + err);
        return st;
    }
    static void Carbon(CWStudy st)   // structural material: library material if matLib is set (v0.3: 6061-T6), else custom
    {
        int err; CWSolidBody b = st.SolidManager.GetComponentAt(0, out err).GetSolidBodyAt(0, out err);
        if (P.ContainsKey("matLib")) { if (b.SetLibraryMaterial(Lib, P["matLib"]) != 1) Console.WriteLine("warning: library material not applied"); return; }
        CWMaterial m = b.GetDefaultMaterial(); m.MaterialUnits = 0; m.MaterialName = "Tube (design allowables)";
        m.SetPropertyByName("EX", D("matE"), 0); m.SetPropertyByName("NUXY", D("matNu"), 0);
        m.SetPropertyByName("GXY", D("matE") / (2 * (1 + D("matNu"))), 0);
        m.SetPropertyByName("DENS", D("matRho"), 0); m.SetPropertyByName("SIGXT", D("matSig"), 0); m.SetPropertyByName("SIGYLD", D("matSig"), 0);
        b.SetSolidBodyMaterial(m);
    }
    static void Mesh(CWStudy st, double size)
    {
        CWMesh m = st.Mesh; m.Quality = 1;
        int r = st.CreateMesh(2, size, size * 0.05);   // units 2 = metres
        if (r != 0) throw new Exception("mesh failed " + r);
    }
    static void Run(CWStudy st) { int r = st.RunAnalysis(); if (r != 0) throw new Exception("analysis failed " + r); }
    static double MaxStress(CWStudy st) { int e; object[] v = (object[])st.Results.GetMinMaxStress(9, 0, 1, null, 0, out e); return Convert.ToDouble(v[3]); }
    static double MaxDisp(CWStudy st, int comp)
    {
        int e; object[] v = (object[])st.Results.GetMinMaxDisplacement(comp, 1, null, 2, out e);
        return Math.Max(Math.Abs(Convert.ToDouble(v[1])), Math.Abs(Convert.ToDouble(v[3])));
    }
    static void PlotPng(ModelDoc2 d, CWStudy st, string plot, string file)
    {
        int e; CWPlot p = st.Results.GetPlot(plot, out e);
        if (p != null) { p.ActivatePlot(); Png(d, file); }
    }
    // directional force on faces with a reference plane; detects which component maps to global Y
    static double ApplyYForce(ModelDoc2 d, CWStudy st, object[] faces, double F, double meshSize)
    {
        object refPlane = ((PartDoc)d).FeatureByName("Top Plane");
        double best = 0;
        for (int comp = 2; comp >= 0; comp--)
        {
            int err; CWForce f = st.LoadsAndRestraintsManager.AddForce2(0, 0, faces, refPlane, out err);
            if (f == null) throw new Exception("force failed " + err);
            f.ForceBeginEdit(); f.Unit = 0;
            f.SetForceComponentValues(comp == 0 ? 1 : 0, comp == 1 ? 1 : 0, comp == 2 ? 1 : 0, comp == 0 ? F : 0, comp == 1 ? F : 0, comp == 2 ? F : 0);
            f.ForceEndEdit();
            if (st.Mesh.MeshState == 0 || comp == 2) Mesh(st, meshSize);
            Run(st);
            double uy = MaxDisp(st, 1), ures = MaxDisp(st, 3);
            if (uy > 0.95 * ures) return comp;
            throw new Exception("force did not map to global Y with component " + comp + " (UY " + uy + " vs URES " + ures + "); fix the component index");
        }
        throw new Exception("could not orient Y force");
    }

    // ---------------- study 1: boom arm ----------------
    static void Boom()
    {
        double L = D("feaBoomL"), od = D("boomOD"), id = D("boomID");
        double tipM = D("feaTipMass"), rho = D("matRho");
        // feaBoomL/feaTipMass/feaTipForce: cad/params.txt <- analysis/results.json C0 struct.Lb/mTip/Tmax (params.mjs). hBlk is a modelling
        // choice (tip-block height, not a design dimension); the block radius follows from it so block volume x rho = lift-unit mass.
        double hBlk = 0.05, rBlk = Math.Sqrt(tipM / (rho * Math.PI * (od / 2 + hBlk)));   // block runs from the tube axis to od/2 + hBlk; its volume x rho = lift-unit mass
        ModelDoc2 d = NewPart();
        Sk(d, "Right Plane"); d.SketchManager.CreateCircleByRadius(0, 0, 0, od / 2); d.SketchManager.CreateCircleByRadius(0, 0, 0, id / 2); EndSk(d);
        Ext(d, L, true, 0, 0);
        Sk(d, "Top Plane"); d.SketchManager.CreateCircleByRadius(L - rBlk, 0, 0, rBlk); EndSk(d);
        Ext(d, od / 2 + hBlk, true, 0, 0);                                       // block from the tube axis up, merged
        Save(d, "FEA_Boom_Arm");
        double vol = Vol(d);
        // static
        CWStudy st = NewStudy("Boom full thrust", 0); Carbon(st);
        int err;
        st.LoadsAndRestraintsManager.AddRestraint(0, new object[] { Planar(d, 0, -1, 0) }, null, out err);
        double topY = od / 2 + hBlk;
        CWForce f = st.LoadsAndRestraintsManager.AddForce2(1, 0, new object[] { Planar(d, 1, 1, topY) }, null, out err);
        f.ForceBeginEdit(); f.Unit = 0; f.NormalForceOrTorqueValue = D("feaTipForce"); f.ForceEndEdit();
        Mesh(st, 0.003); Run(st);
        Res("boom_vm_max", MaxStress(st) / 1e6, "MPa", "von Mises max, FEA");
        Res("boom_RF_yield", D("matSig") / MaxStress(st), "-", "yield / FEA von Mises at full thrust");
        Res("boom_disp_max", MaxDisp(st, 3) * 1000, "mm", "resultant displacement max, FEA");
        Res("boom_hand_sigma", D("feaHandSigB") / 1e6, "MPa", "hand calc M c / I");
        Res("boom_hand_defl", D("feaHandDefl") * 1000, "mm", "hand calc P L^3 / 3EI");
        Res("boom_model_mass", vol * rho, "kg", "FEA model (tube + tip block) = volume x density");
        Res("boom_tip_mass_target", tipM, "kg", "lift unit: motor + ESC + prop + mount");
        // mesh refinement check at half the element size
        CWStudy st2 = NewStudy("Boom full thrust fine mesh", 0); Carbon(st2);
        st2.LoadsAndRestraintsManager.AddRestraint(0, new object[] { Planar(d, 0, -1, 0) }, null, out err);
        CWForce f2 = st2.LoadsAndRestraintsManager.AddForce2(1, 0, new object[] { Planar(d, 1, 1, topY) }, null, out err);
        f2.ForceBeginEdit(); f2.Unit = 0; f2.NormalForceOrTorqueValue = D("feaTipForce"); f2.ForceEndEdit();
        Mesh(st2, 0.0015); Run(st2);
        Res("boom_vm_max_fine", MaxStress(st2) / 1e6, "MPa", "von Mises max, 1.5 mm mesh (convergence check)");
        PlotPng(d, st, "Stress1", "FEA_Boom_vonMises.png");
        // frequency
        CWStudy fq = NewStudy("Boom modes", 1); Carbon(fq);
        fq.LoadsAndRestraintsManager.AddRestraint(0, new object[] { Planar(d, 0, -1, 0) }, null, out err);
        fq.FrequencyStudyOptions.NoOfFrequencies = 3;
        Mesh(fq, 0.003); Run(fq);
        object fr = fq.Results.GetResonantFrequencies(out err);
        object[] arr = fr as object[]; double[] darr = fr as double[];
        var list = new List<double>();
        if (arr != null) foreach (object o in arr) list.Add(Convert.ToDouble(o));
        if (darr != null) list.AddRange(darr);
        R.WriteLine("# raw GetResonantFrequencies: " + string.Join(",", list.ConvertAll(x => x.ToString("G6", IC)).ToArray()));
        // array layout: [mode, rad/s, Hz, period] per mode (checked against first entry below)
        if (list.Count >= 4) Res("boom_f1", list[2], "Hz", "first mode, FEA (tip mass = lift unit)");
        Res("boom_hand_fn", D("feaHandFn"), "Hz", "hand calc, massless beam + tip mass");
        PlotPng(d, fq, "Displacement1", "FEA_Boom_Mode1.png");
        Save(d, "FEA_Boom_Arm");
        sw.CloseDoc(d.GetTitle());
    }

    // ---------------- study 2: wing spar + joiner ----------------
    static void Spar()
    {
        double sOD = D("sparOD"), sID = D("sparID"), jID = D("joinID"), fusR = D("fusR"), sL = D("sparLen");
        double jL = D("joinLen") / 2;                                                 // centreline to joiner tip: half the joiner (0.38 m) = pod half-width + 0.30 m engagement
        ModelDoc2 d = NewPart();
        Sk(d, "Front Plane"); d.SketchManager.CreateCircleByRadius(0, 0, 0, sID / 2); d.SketchManager.CreateCircleByRadius(0, 0, 0, jID / 2); EndSk(d);
        Ext(d, jL, true, 0, 0);                                                       // joiner (OD = spar ID: bonded/shimmed fit)
        Sk(d, "Front Plane"); d.SketchManager.CreateCircleByRadius(0, 0, 0, sOD / 2); d.SketchManager.CreateCircleByRadius(0, 0, 0, sID / 2); EndSk(d);
        Ext(d, sL, true, (int)swStartConditions_e.swStartOffset, fusR);              // spar from the pod side outwards
        Save(d, "FEA_Spar_Joiner");
        CWStudy st = NewStudy("Spar ultimate load", 0); Carbon(st);
        int err;
        st.LoadsAndRestraintsManager.AddRestraint(0, new object[] { Planar(d, 2, -1, 0) }, null, out err);  // centreline (symmetry-clamped)
        List<Face2> outer = Cylinders(d, sOD / 2);
        object[] faces = outer.ConvertAll(x => (object)x).ToArray();
        ApplyYForce(d, st, faces, D("feaWingForce"), 0.003);
        Res("spar_vm_max", MaxStress(st) / 1e6, "MPa", "von Mises max (joiner/spar), FEA");
        Res("spar_RF_yield", D("matSig") / MaxStress(st), "-", "yield / FEA von Mises at ultimate load");
        Res("spar_tip_disp", MaxDisp(st, 3) * 1000, "mm", "max displacement at spar tip, FEA");
        Res("spar_hand_sigJ", D("feaHandSigJ") / 1e6, "MPa", "hand calc joiner stress at centreline");
        Res("spar_load_N", D("feaWingForce"), "N", "uniform on spar, scaled to root moment " + P["feaRootMomentTarget"] + " N m");
        Res("spar_note", 0, "-", "joiner modelled with OD = socket ID (bonded); hand calc on the true 0.875 in joiner governs");
        PlotPng(d, st, "Stress1", "FEA_Spar_vonMises.png");
        CWStudy sf = NewStudy("Spar ultimate load fine mesh", 0); Carbon(sf);
        sf.LoadsAndRestraintsManager.AddRestraint(0, new object[] { Planar(d, 2, -1, 0) }, null, out err);
        ApplyYForce(d, sf, faces, D("feaWingForce"), 0.002);
        Res("spar_vm_max_fine", MaxStress(sf) / 1e6, "MPa", "von Mises max, 2 mm mesh (convergence check)");
        Save(d, "FEA_Spar_Joiner");
        sw.CloseDoc(d.GetTitle());
    }

    // ---------------- study 3: lift motor thermal ----------------
    static void Thermal()
    {
        double dia = D("motorD"), h = D("motorH");
        ModelDoc2 d = NewPart();
        Sk(d, "Top Plane"); d.SketchManager.CreateCircleByRadius(0, 0, 0, dia / 2); EndSk(d);
        Ext(d, h, true, 0, 0);
        Save(d, "THERM_Lift_Motor");
        int err; CWSolidBody b;
        var all = Faces(d).ConvertAll(x => (object)x).ToArray();
        object[] v;
        // Transient thermal via this API returned no saved time steps (tested 2026-10-13), so the 90 s
        // hover rise is computed by lumped capacitance in analysis/sizing.mjs from this steady result.
        CWHeatPower hp; CWConvection cv;
        // steady-state bound
        CWStudy ss = NewStudy("Motor steady state", 3);
        b = ss.SolidManager.GetComponentAt(0, out err).GetSolidBodyAt(0, out err); b.SetLibraryMaterial(Lib, P["matLib"]);   // library material from cad/params.txt matLib (params.mjs), not a literal
        ss.ThermalStudyOptions.SolutionType = 1;
        hp = ss.LoadsAndRestraintsManager.AddHeatPower(new object[] { ((object[])((PartDoc)d).GetBodies2(0, true))[0] }, out err);
        hp.HeatPowerBeginEdit(); hp.Unit = 0; hp.HPValue = D("thermQ"); hp.HeatPowerEndEdit();
        cv = ss.LoadsAndRestraintsManager.AddConvection(all, out err);
        cv.ConvectionBeginEdit(); cv.Unit = 0; cv.ConvectionCoefficient = D("thermH"); cv.BulkAmbientTemperature = D("thermAmbK"); cv.ConvectionEndEdit();
        Mesh(ss, 0.004); Run(ss);
        v = (object[])ss.Results.GetMinMaxThermal(0, 1, null, 2, out err);
        PlotPng(d, ss, "Thermal1", "THERM_Motor_steady.png");
        Res("motor_T_steady", Convert.ToDouble(v[3]), "degC", "steady-state upper bound, FEA");
        Res("motor_Q", D("thermQ"), "W", "heat into lift unit (EST)");
        Res("motor_h", D("thermH"), "W/m2K", "convection in prop wash (EST)");
        Res("motor_T_steady_hand", D("thermAmbK") - 273.15 + D("thermQ") / (D("thermH") * (Math.PI * dia * h + 2 * Math.PI * dia * dia / 4)), "degC", "hand: T_amb + Q/(h A)");
        Save(d, "THERM_Lift_Motor");
        sw.CloseDoc(d.GetTitle());
    }
}
