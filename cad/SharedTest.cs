// Parity test for cad/Shared.cs (no SOLIDWORKS needed): the shared ParamsFile reader and Geom formulas must reproduce, bit for
// bit, the inline code they replaced in BuildVtol.cs, Drawings.cs and Sim.cs/Thermal.cs (code review 2026-10-25, "one geometry
// described in several places"). The legacy code is copied below verbatim from those files as they were before the change.
// Build and run (from the project folder; csc = .NET Framework 4 C# 5 compiler, see build.ps1):
//   csc /nologo /out:%TEMP%\SharedTest.exe cad\Shared.cs cad\SharedTest.cs  &&  %TEMP%\SharedTest.exe cad\params.txt
using System;
using System.IO;
using System.Collections.Generic;
using System.Globalization;

static class SharedTest
{
    static CultureInfo IC = CultureInfo.InvariantCulture;
    static int fails = 0, checks = 0;
    static void Check(bool ok, string what) { checks++; if (!ok) { fails++; Console.WriteLine("FAIL " + what); } }
    static bool Same(double a, double b) { return BitConverter.DoubleToInt64Bits(a) == BitConverter.DoubleToInt64Bits(b); }
    static bool Same(List<double[]> a, List<double[]> b)
    {
        if (a.Count != b.Count) return false;
        for (int i = 0; i < a.Count; i++) if (!Same(a[i][0], b[i][0]) || !Same(a[i][1], b[i][1])) return false;
        return true;
    }
    static bool Same(List<string[]> a, List<string[]> b)
    {
        if (a.Count != b.Count) return false;
        for (int i = 0; i < a.Count; i++) if (string.Join("|", a[i]) != string.Join("|", b[i])) return false;
        return true;
    }

    // ---------------- legacy code, verbatim ----------------
    // BuildVtol.cs Main() parser
    static void LegacyBuildParse(string path, Dictionary<string, string> P, List<string[]> Comps, List<string[]> XComps, List<string[]> Fast)
    {
        foreach (string raw in File.ReadAllLines(path))
        {
            string line = raw.Trim(); if (line.Length == 0) continue;
            int eq = line.IndexOf('='); string k = line.Substring(0, eq), v = line.Substring(eq + 1);
            if (k == "comp") Comps.Add(v.Split('|')); else if (k == "xcomp") XComps.Add(v.Split('|'));
            else if (k.StartsWith("fast_")) Fast.Add(v.Split('|')); else P[k] = v;
        }
    }
    // Drawings.cs Main() parser
    static void LegacyDrawParse(string path, Dictionary<string, string> P, Dictionary<string, List<double[]>> XPos)
    {
        foreach (string raw in File.ReadAllLines(path))
        {
            int eq = raw.IndexOf('='); if (eq <= 0) continue;
            if (raw.StartsWith("xcomp=")) { string[] f = raw.Substring(6).Split('|'); if (!XPos.ContainsKey(f[0])) XPos[f[0]] = new List<double[]>(); XPos[f[0]].Add(new[] { double.Parse(f[1], IC), double.Parse(f[2], IC), double.Parse(f[3], IC) }); }
            else if (!raw.StartsWith("comp=")) P[raw.Substring(0, eq)] = raw.Substring(eq + 1).Trim();
        }
    }
    // Sim.cs / Thermal.cs Main() parser
    static void LegacySimParse(string path, Dictionary<string, string> P)
    {
        foreach (string raw in File.ReadAllLines(path))
        {
            string l = raw.Trim(); if (l.Length == 0 || l.StartsWith("comp=")) continue;
            int i = l.IndexOf('='); P[l.Substring(0, i)] = l.Substring(i + 1);
        }
    }
    // BuildVtol.cs Naca()
    static List<double[]> LegacyNaca(double m, double p, double t, int N)
    {
        var up = new List<double[]>(); var lo = new List<double[]>();
        for (int i = 0; i <= N; i++)
        {
            double x = (1 - Math.Cos(Math.PI * i / N)) / 2;
            double yt = 5 * t * (0.2969 * Math.Sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
            double yc = 0, dy = 0;
            if (m > 0) { if (x < p) { yc = m / (p * p) * (2 * p * x - x * x); dy = 2 * m / (p * p) * (p - x); } else { yc = m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x); dy = 2 * m / ((1 - p) * (1 - p)) * (p - x); } }
            double th = Math.Atan(dy);
            up.Add(new[] { x - yt * Math.Sin(th), yc + yt * Math.Cos(th) }); lo.Add(new[] { x + yt * Math.Sin(th), yc - yt * Math.Cos(th) });
        }
        up.Reverse(); var all = new List<double[]>(up); for (int i = 1; i < lo.Count; i++) all.Add(lo[i]);
        return all;
    }
    // BuildVtol.cs NacaYt()
    static double LegacyNacaYt(double x, double t) { return 5 * t * (0.2969 * Math.Sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x); }
    // Drawings.cs NacaY()
    static double LegacyNacaY(double x, bool upper, double tc, double chord)
    {
        double m = 0.02, p = 0.4, t = tc;
        double yt = 5 * t * (0.2969 * Math.Sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
        double yc = x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x);
        return (upper ? yc + yt : yc - yt) * chord;
    }
    // BuildVtol.cs Fuselage() radius at station s
    static double LegacyPodRadius(double s, double L, double R, double rt)
    {
        double a = 0.22, r;
        if (s < a) r = R * Math.Sqrt(Math.Max(0, 1 - Math.Pow((s - a) / a, 2)));
        else if (s < 0.50) r = R;
        else { double u = (s - 0.50) / (L - 0.50); r = rt + (R - rt) * (1 - u * u * (3 - 2 * u)); }   // smooth-step boat-tail
        return r;
    }

    static int Main(string[] args)
    {
        string path = args.Length > 0 ? args[0] : Path.Combine(Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location), "params.txt");
        var pd = ParamsFile.Load(path);

        // ---- parsers ----
        var bP = new Dictionary<string, string>(); var bC = new List<string[]>(); var bX = new List<string[]>(); var bF = new List<string[]>();
        LegacyBuildParse(path, bP, bC, bX, bF);
        foreach (var kv in bP) Check(pd.P.ContainsKey(kv.Key) && pd.P[kv.Key] == kv.Value, "BuildVtol P[" + kv.Key + "]");
        foreach (var k in pd.P.Keys) Check(bP.ContainsKey(k) || k.StartsWith("fast_"), "BuildVtol: unexpected extra key " + k);
        Check(Same(bC, pd.Comps), "BuildVtol Comps"); Check(Same(bX, pd.XComps), "BuildVtol XComps"); Check(Same(bF, pd.Fast), "BuildVtol Fast");
        var dP = new Dictionary<string, string>(); var dX = new Dictionary<string, List<double[]>>();
        LegacyDrawParse(path, dP, dX);
        Check(dP.Count == pd.P.Count, "Drawings P count " + dP.Count + " vs " + pd.P.Count);
        foreach (var kv in dP) Check(pd.P.ContainsKey(kv.Key) && pd.P[kv.Key] == kv.Value, "Drawings P[" + kv.Key + "]");
        var nX = new Dictionary<string, List<double[]>>();
        foreach (string[] f in pd.XComps) { if (!nX.ContainsKey(f[0])) nX[f[0]] = new List<double[]>(); nX[f[0]].Add(new[] { double.Parse(f[1], IC), double.Parse(f[2], IC), double.Parse(f[3], IC) }); }
        Check(dX.Count == nX.Count, "Drawings XPos parts");
        foreach (var kv in dX) { Check(nX.ContainsKey(kv.Key) && nX[kv.Key].Count == kv.Value.Count, "Drawings XPos[" + kv.Key + "] count"); for (int i = 0; i < kv.Value.Count; i++) for (int j = 0; j < 3; j++) Check(Same(kv.Value[i][j], nX[kv.Key][i][j]), "Drawings XPos[" + kv.Key + "][" + i + "]"); }
        var sP = new Dictionary<string, string>(); LegacySimParse(path, sP);
        foreach (var kv in sP) if (kv.Key != "xcomp") Check(pd.P.ContainsKey(kv.Key) && pd.P[kv.Key] == kv.Value, "Sim P[" + kv.Key + "]");
        Check(sP.Count - (sP.ContainsKey("xcomp") ? 1 : 0) == pd.P.Count, "Sim P count");

        // ---- constants read back from params.txt ----
        Check(Same(Geom.TeCad, -0.1015) && Same(Geom.TeAero, -0.1036), "foilTE cad/aero");
        Check(Same(Geom.WingM, 0.02) && Same(Geom.WingP, 0.4), "foilWing m/p");
        Check(Same(Geom.TailM, 0) && Same(Geom.TailT, 0.09), "foilTail m/t");
        Check(Same(Geom.PodNoseX, 0.45) && Same(Geom.PodNoseA, 0.22) && Same(Geom.PodParallelTo, 0.50), "podProfile noseX/noseA/parallelTo");
        Check(Geom.WingName == "NACA " + Math.Round(100 * Geom.WingM) + Math.Round(10 * Geom.WingP) + Math.Round(100 * pd.D("tc")).ToString("00"), "foilWing name " + Geom.WingName);

        // ---- sections ----
        double tc = pd.D("tc"), chord = pd.D("chord");
        Check(Same(LegacyNaca(0.02, 0.4, tc, 40), Geom.WingSection(tc, 40)), "wing section N=40");
        Check(Same(LegacyNaca(0, 0.4, 0.09, 30), Geom.TailSection(30)), "tail section N=30");
        double c = pd.D("vC"), c2 = c + 0.0032, kOld = (0.09 * c + 0.0032) / (0.09 * c2), kNew = (Geom.TailT * c + 0.0032) / (Geom.TailT * c2);
        Check(Same(kOld, kNew), "fin shoe k");
        Check(Same(LegacyNaca(0, 0.4, 0.09 * kOld, 30), Geom.Naca(Geom.TailM, Geom.TailP, Geom.TailT * kNew, 30)), "fin shoe section");
        double fc = pd.D("fairChord"), wt = pd.D("fairWall");
        Check(Same(LegacyNaca(0, 0.4, (pd.D("fairBore") + 2 * wt) / fc, 30), Geom.Naca(0, 0, (pd.D("fairBore") + 2 * wt) / fc, 30)), "fairing outer section");
        Check(Same(LegacyNaca(0, 0.4, pd.D("fairBore") / (fc - 2 * wt), 30), Geom.Naca(0, 0, pd.D("fairBore") / (fc - 2 * wt), 30)), "fairing inner section");
        for (int i = 0; i <= 1000; i++)
        {
            double x = i / 1000.0;
            Check(Same(LegacyNacaYt(x, tc), Geom.NacaYt(x, tc)), "NacaYt wing x=" + x);
            Check(Same(LegacyNacaYt(x, 0.09), Geom.NacaYt(x, Geom.TailT)), "NacaYt tail x=" + x);
            double ytN = Geom.NacaYt(x, tc), ycN = Geom.NacaYc(x, Geom.WingM, Geom.WingP);
            Check(Same(LegacyNacaY(x, true, tc, chord), (ycN + ytN) * chord) && Same(LegacyNacaY(x, false, tc, chord), (ycN - ytN) * chord), "Drawings NacaY x=" + x);
        }

        // ---- pod profile ----
        double L = pd.D("fusL"), R = pd.D("fusR"), rt = pd.D("tailR");
        for (int i = 0; i <= 30; i++) { double s = L * i / 30; Check(Same(LegacyPodRadius(s, L, R, rt), Geom.PodRadius(s, L, R, rt)), "pod radius station " + i); }
        for (int i = 0; i <= 2000; i++) { double s = L * i / 2000; Check(Same(LegacyPodRadius(s, L, R, rt), Geom.PodRadius(s, L, R, rt)), "pod radius fine s=" + s); }

        Console.WriteLine((fails == 0 ? "PASS" : "FAIL") + ": " + checks + " checks, " + fails + " failures (" + path + ")");
        return fails == 0 ? 0 : 1;
    }
}
