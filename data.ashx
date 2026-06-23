<%@ WebHandler Language="C#" Class="NoizzDataHandler" %>

// =====================================================================
//  NOIZZ shared-data handler  (ASP.NET generic handler, .NET Framework)
//  --------------------------------------------------------------------
//  Stores the whole NOIZZ document as a single JSON file on the server
//  so that every user of the page shares one dataset.
//
//    GET  data.ashx   -> returns the JSON document, with an ETag version
//    PUT  data.ashx   -> overwrites the document
//                        * send  If-Match: "<etag>"  for safe (optimistic)
//                          saves; the write is rejected with 409 if another
//                          user saved in the meantime.
//                        * omit  If-Match  to force an unconditional write
//                          (used by import / reset).
//
//  No build step is required: IIS compiles this file at runtime. The data
//  lives in  App_Data/noizz-data.json  (the App_Data folder must be
//  writable by the IIS application-pool identity).
// =====================================================================

using System;
using System.IO;
using System.Text;
using System.Web;

public class NoizzDataHandler : IHttpHandler
{
    // Serialises read-modify-write so two simultaneous saves can't interleave.
    private static readonly object _gate = new object();

    private static string DataPath(HttpContext ctx) { return ctx.Server.MapPath("~/App_Data/noizz-data.json"); }
    private static string VerPath(HttpContext ctx)  { return ctx.Server.MapPath("~/App_Data/noizz-data.ver"); }

    public bool IsReusable { get { return false; } }

    public void ProcessRequest(HttpContext ctx)
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        ctx.Response.AppendHeader("Cache-Control", "no-store, no-cache, must-revalidate");

        try
        {
            switch (ctx.Request.HttpMethod.ToUpperInvariant())
            {
                case "GET":     HandleGet(ctx); break;
                case "PUT":
                case "POST":    HandlePut(ctx); break;
                case "OPTIONS": ctx.Response.StatusCode = 204; break;
                default:
                    ctx.Response.StatusCode = 405;
                    ctx.Response.AppendHeader("Allow", "GET, PUT, OPTIONS");
                    break;
            }
        }
        catch (Exception ex)
        {
            ctx.Response.StatusCode = 500;
            ctx.Response.Write("{\"error\":" + JsonStr(ex.Message) + "}");
        }
    }

    private void HandleGet(HttpContext ctx)
    {
        lock (_gate)
        {
            string path = DataPath(ctx);
            long ver = ReadVersion(ctx);
            ctx.Response.AppendHeader("ETag", "\"" + ver + "\"");
            if (File.Exists(path))
                ctx.Response.Write(File.ReadAllText(path, Encoding.UTF8));
            else
                ctx.Response.Write("null");   // server is empty -> client seeds defaults
        }
    }

    private void HandlePut(HttpContext ctx)
    {
        string body;
        ctx.Request.InputStream.Position = 0;
        using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            body = reader.ReadToEnd();

        if (string.IsNullOrWhiteSpace(body))
        {
            ctx.Response.StatusCode = 400;
            ctx.Response.Write("{\"error\":\"empty body\"}");
            return;
        }

        lock (_gate)
        {
            string path = DataPath(ctx);
            string dir  = Path.GetDirectoryName(path);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            long current = ReadVersion(ctx);

            // Optimistic concurrency: honour If-Match when present.
            string ifMatch = ctx.Request.Headers["If-Match"];
            if (!string.IsNullOrEmpty(ifMatch) && ifMatch.Trim() != "*")
            {
                long want;
                long.TryParse(ifMatch.Replace("\"", "").Trim(), out want);
                if (want != current)
                {
                    ctx.Response.StatusCode = 409;   // Conflict
                    ctx.Response.AppendHeader("ETag", "\"" + current + "\"");
                    ctx.Response.Write("{\"error\":\"conflict\",\"currentVersion\":" + current + "}");
                    return;
                }
            }

            // Atomic write: temp file, then replace.
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, body, new UTF8Encoding(false));
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);

            long next = current + 1;
            WriteVersion(ctx, next);
            ctx.Response.AppendHeader("ETag", "\"" + next + "\"");
            ctx.Response.Write("{\"ok\":true,\"version\":" + next + "}");
        }
    }

    private long ReadVersion(HttpContext ctx)
    {
        try
        {
            string vp = VerPath(ctx);
            if (File.Exists(vp))
            {
                long v;
                if (long.TryParse(File.ReadAllText(vp, Encoding.UTF8).Trim(), out v)) return v;
            }
        }
        catch { /* fall through */ }
        return File.Exists(DataPath(ctx)) ? 1 : 0;
    }

    private void WriteVersion(HttpContext ctx, long v)
    {
        File.WriteAllText(VerPath(ctx), v.ToString(), new UTF8Encoding(false));
    }

    private static string JsonStr(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            switch (c)
            {
                case '"':  sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n");  break;
                case '\r': sb.Append("\\r");  break;
                case '\t': sb.Append("\\t");  break;
                default:
                    if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.Append("\"").ToString();
    }
}
