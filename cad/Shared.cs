// Shared by BuildVtol.cs, Drawings.cs, Sim.cs, Thermal.cs (compiled into each executable, see build.ps1) and the parity test
// SharedTest.cs: the ONE reader of cad/params.txt on the C# side and the ONE implementation of the NACA 4-digit section and
// the fuselage-pod profile.  The definitions live in analysis/geometry.mjs; cad/params.mjs writes them into params.txt
// (keys foilWing, foilTail, foilTE, podProfile) and Geom reads them back, so no geometric constant is typed here.
// Python twin: analysis/geom.py.
//
// params.txt format (written by cad/params.mjs):
//   key=value          scalar: a number (6 decimals) or a text record "label|name=value|name=value..."
//   comp=...|...       assembly placement record (one per component); xcomp=... the same in the exploded assembly
// Parsing rules (identical in analysis/geom.py read_params):
//   - lines are trimmed; blank lines are ignored; a line without '=' is an error (the file is generated);
//   - key = text before the first '=', value = text after it (trimmed);
//   - comp= and xcomp= lines are records (lists of '|' fields) and never scalars; every other key is a scalar kept as its
//     value text (fast_* keys are also split into the Fast list); a repeated scalar key is an error.
using System;
using System.IO;
using System.Collections.Generic;
using System.Globalization;

class ParamsData
{
    public Dictionary<string, string> P = new Dictionary<string, string>();          // every scalar key, value text
    public List<string[]> Comps = new List<string[]>(), XComps = new List<string[]>(); // comp= / xcomp= records, file order
    public List<string[]> Fast = new List<string[]>();                                // fast_* records (fastener part definitions)
    public double D(string k) { return double.Parse(P[k], ParamsFile.IC); }
    // "label|a=1|b=2" -> {"": "label", "a": "1", "b": "2"} (fields without '=' go under "")
    public Dictionary<string, string> Record(string key)
    {
        var d = new Dictionary<string, string>();
        foreach (string f in P[key].Split('|')) { int i = f.IndexOf('='); if (i < 0) d[""] = f; else d[f.Substring(0, i)] = f.Substring(i + 1); }
        return d;
    }
    public double RecordD(string key, string field) { return double.Parse(Record(key)[field], ParamsFile.IC); }
}

static class ParamsFile
{
    public static readonly CultureInfo IC = CultureInfo.InvariantCulture;
    public static ParamsData Load(string path)
    {
        var d = new ParamsData(); int n = 0;
        foreach (string raw in File.ReadAllLines(path))
        {
            n++; string line = raw.Trim(); if (line.Length == 0) continue;
            int eq = line.IndexOf('='); if (eq < 0) throw new FormatException(path + ":" + n + ": no '=' in line \"" + line + "\"");
            string k = line.Substring(0, eq), v = line.Substring(eq + 1).Trim();
            if (k == "comp") d.Comps.Add(v.Split('|'));
            else if (k == "xcomp") d.XComps.Add(v.Split('|'));
            else
            {
                if (d.P.ContainsKey(k)) throw new FormatException(path + ":" + n + ": repeated key " + k);
                d.P[k] = v;
                if (k.StartsWith("fast_")) d.Fast.Add(v.Split('|'));
            }
        }
        Geom.Init(d);
        return d;
    }
}

// NACA 4-digit section (Abbott & von Doenhoff, Theory of Wing Sections, §6.4) and pod profile; constants from params.txt.
static class Geom
{
    public static string WingName, TailName, PodProfile;
    public static double WingM, WingP, TailM, TailP, TailT;   // wing camber (t = params tc); tail m, p, t
    public static double TeCad, TeAero;                       // TE coefficient a4: CAD open -0.1015 / aero+templates closed -0.1036 (analysis/geometry.mjs)
    public static double PodNoseX, PodNoseA, PodParallelTo;   // nose station fwd of the wing LE; nose ellipse semi-axis; end of the parallel mid-body (m from the nose)
    public static void Init(ParamsData d)
    {
        var w = d.Record("foilWing"); var t = d.Record("foilTail"); var te = d.Record("foilTE"); var pod = d.Record("podProfile");
        WingName = w[""]; WingM = double.Parse(w["m"], ParamsFile.IC); WingP = double.Parse(w["p"], ParamsFile.IC);
        TailName = t[""]; TailM = double.Parse(t["m"], ParamsFile.IC); TailP = double.Parse(t["p"], ParamsFile.IC); TailT = double.Parse(t["t"], ParamsFile.IC);
        TeCad = double.Parse(te["cad"], ParamsFile.IC); TeAero = double.Parse(te["aero"], ParamsFile.IC);
        PodProfile = pod[""]; PodNoseX = double.Parse(pod["noseX"], ParamsFile.IC); PodNoseA = double.Parse(pod["noseA"], ParamsFile.IC); PodParallelTo = double.Parse(pod["parallelTo"], ParamsFile.IC);
    }
    // half-thickness at chord fraction x for thickness ratio t and TE coefficient a4
    public static double NacaYt(double x, double t, double a4) { return 5 * t * (0.2969 * Math.Sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x + a4 * x * x * x * x); }
    // CAD section: TE coefficient TeCad
    public static double NacaYt(double x, double t) { return NacaYt(x, t, TeCad); }
    // camber line and its slope (m = 0: straight)
    public static double NacaYc(double x, double m, double p) { if (m <= 0) return 0; return x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x); }
    public static double NacaDyc(double x, double m, double p) { if (m <= 0) return 0; return x < p ? 2 * m / (p * p) * (p - x) : 2 * m / ((1 - p) * (1 - p)) * (p - x); }
    // section outline, cosine spaced with N+1 points per surface, TE(upper) -> LE -> TE(lower), chord 1, TE coefficient TeCad: (x, y) list
    public static List<double[]> Naca(double m, double p, double t, int N)
    {
        var up = new List<double[]>(); var lo = new List<double[]>();
        for (int i = 0; i <= N; i++)
        {
            double x = (1 - Math.Cos(Math.PI * i / N)) / 2;
            double yt = NacaYt(x, t), yc = NacaYc(x, m, p), th = Math.Atan(NacaDyc(x, m, p));
            up.Add(new[] { x - yt * Math.Sin(th), yc + yt * Math.Cos(th) }); lo.Add(new[] { x + yt * Math.Sin(th), yc - yt * Math.Cos(th) });
        }
        up.Reverse(); var all = new List<double[]>(up); for (int i = 1; i < lo.Count; i++) all.Add(lo[i]);
        return all;
    }
    public static List<double[]> WingSection(double t, int N) { return Naca(WingM, WingP, t, N); }   // NACA 24xx at the sizing's t/c (params tc)
    public static List<double[]> TailSection(int N) { return Naca(TailM, TailP, TailT, N); }          // NACA 0009
    // pod radius at distance s (m) from the nose: elliptic nose, parallel mid-body, smooth-step boat-tail from R to rt at L
    public static double PodRadius(double s, double L, double R, double rt)
    {
        double a = PodNoseA, x1 = PodParallelTo;
        if (s < a) return R * Math.Sqrt(Math.Max(0, 1 - Math.Pow((s - a) / a, 2)));
        if (s < x1) return R;
        double u = (s - x1) / (L - x1); return rt + (R - rt) * (1 - u * u * (3 - 2 * u));
    }
}
