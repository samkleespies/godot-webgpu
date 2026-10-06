namespace GodotTools.IdeMessaging
{
    public static class LogMessage
    {
        public static string Escape(string? message)
        {
            return (message ?? string.Empty)
                .Replace("\r", "\\r")
                .Replace("\n", "\\n")
                .Replace("\b", "\\b")
                .Replace("\v", "\\v")
                .Replace("\f", "\\f")
                .Replace("\0", "\\0")
                .Replace("\u001b", "\\u001b")
                .Replace("\u0085", "\\u0085")
                .Replace("\u2028", "\\u2028")
                .Replace("\u2029", "\\u2029");
        }
    }
}
