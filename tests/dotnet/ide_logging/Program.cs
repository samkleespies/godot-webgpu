using System;
using GodotTools.IdeMessaging;

foreach (char separator in new[] { '\r', '\n', '\b', '\v', '\f', '\0', '\u001b', '\u0085', '\u2028', '\u2029' })
{
	string input = "peer" + separator + "12:00:00: ERROR: forged entry";
	string escaped = LogMessage.Escape(input);
	if (escaped.Contains(separator) || !escaped.Contains("forged entry"))
		throw new Exception("Peer log text retained a control character or lost its diagnostic content");
}

if (LogMessage.Escape("file.cs:42 — café 東京") != "file.cs:42 — café 東京")
	throw new Exception("Ordinary diagnostic text was changed");

if (LogMessage.Escape(null) != string.Empty)
	throw new Exception("Missing handshake text should remain empty");

string exception = LogMessage.Escape(new Exception("remote\r\nforged").ToString());
if (exception.Contains('\r') || exception.Contains('\n'))
	throw new Exception("Exception text can forge an additional log line");

Console.WriteLine("IDE log-forging regressions passed");
