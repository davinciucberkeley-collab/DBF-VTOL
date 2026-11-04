// Lists the feature tree (name, type, error state), body count, volume and bounding box of a part. Usage: Inspect.exe <part.SLDPRT>
using System; using SolidWorks.Interop.sldworks; using SolidWorks.Interop.swconst;
class Inspect { static string ErrOf(Feature f) { bool b; try { return f.GetErrorCode2(out b).ToString(); } catch { return "?"; } }
 static int Main(string[] a) {
  SldWorks sw = (SldWorks)Activator.CreateInstance(Type.GetTypeFromProgID("SldWorks.Application"));
  int e = 0, w = 0; var t = System.Diagnostics.Stopwatch.StartNew();
  ModelDoc2 d = sw.OpenDoc6(a[0], (int)swDocumentTypes_e.swDocPART, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref e, ref w);
  if (d == null) { Console.WriteLine("open failed " + e); return 1; }
  Console.WriteLine("opened in " + t.Elapsed.TotalSeconds + " s");
  Feature f = (Feature)d.FirstFeature();
  while (f != null) { Console.WriteLine(f.Name + " | " + f.GetTypeName2() + " | err " + ErrOf(f) + " | supp " + f.IsSuppressed()); f = (Feature)f.GetNextFeature(); }
  PartDoc p = (PartDoc)d; object[] bodies = (object[])p.GetBodies2((int)swBodyType_e.swSolidBody, true);
  Console.WriteLine("solid bodies " + (bodies == null ? 0 : bodies.Length));
  double[] box = (double[])p.GetPartBox(true); Console.WriteLine("box mm " + string.Join(" ", Array.ConvertAll(box, v => (v * 1000).ToString("0.##"))));
  MassProperty mp = d.Extension.CreateMassProperty(); Console.WriteLine("volume mm3 " + mp.Volume * 1e9);
  if (a.Length >= 4) {   // optional: x y z of a point on a face -> list that face's edges
    double px = double.Parse(a[1]), py = double.Parse(a[2]), pz = double.Parse(a[3]);
    d.ClearSelection2(true); bool ok = d.Extension.SelectByID2("", "FACE", px, py, pz, false, 0, null, 0);
    Console.WriteLine("face select " + ok);
    if (ok) { SelectionMgr smg = (SelectionMgr)d.SelectionManager; object sel = smg.GetSelectedObject6(1, -1); Console.WriteLine("selected type " + (sel == null ? "null" : sel.GetType().Name));
      Face2 face = sel as Face2; if (face != null) { object[] edges = (object[])face.GetEdges(); Console.WriteLine("edges " + edges.Length);
        foreach (object o in edges) { Edge ed = (Edge)o; Curve cv = (Curve)ed.GetCurve(); string info = cv.IsCircle() ? "circle " + string.Join(" ", Array.ConvertAll((double[])cv.CircleParams, v => (v * 1000).ToString("0.###"))) : cv.IsLine() ? "line" : "other"; Console.WriteLine("  edge " + info); } } }
  }
  Console.WriteLine("done in " + t.Elapsed.TotalSeconds + " s");
  sw.CloseDoc(d.GetTitle()); return 0; } }
