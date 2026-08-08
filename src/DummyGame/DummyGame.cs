using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

static class DummyGame
{
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    const int DWMWA_USE_IMMERSIVE_DARK_MODE_20 = 20;
    const int DWMWA_USE_IMMERSIVE_DARK_MODE_19 = 19;
    const int DWMWA_CAPTION_COLOR = 35;
    const int DWMWA_TEXT_COLOR = 36;

    static void ApplyTitleBar(IntPtr hwnd, string theme)
    {
        if (hwnd == IntPtr.Zero) return;
        bool dark = theme != "light";

        int value = dark ? 1 : 0;
        int hr = DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_20, ref value, sizeof(int));
        if (hr != 0)
        {
            DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_19, ref value, sizeof(int));
        }

        if (dark)
        {
            int caption = ToColorRef(Color.FromArgb(14, 14, 17));
            int text = ToColorRef(Color.FromArgb(209, 213, 219));
            if (theme == "blue")
            {
                caption = ToColorRef(Color.FromArgb(13, 20, 32));
            }
            DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, ref caption, sizeof(int));
            DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, ref text, sizeof(int));
        }
        else
        {
            int caption = ToColorRef(Color.FromArgb(238, 241, 244));
            int text = ToColorRef(Color.FromArgb(44, 52, 64));
            DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, ref caption, sizeof(int));
            DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, ref text, sizeof(int));
        }
    }

    static int ToColorRef(Color c)
    {
        return c.B << 16 | c.G << 8 | c.R;
    }

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string name = args.Length > 0 ? args[0] : "Game";
        string theme = args.Length > 1 ? args[1] : "black";

        Color bg = Color.FromArgb(14, 14, 17);
        Color panel = Color.FromArgb(29, 32, 37);
        Color fg = Color.FromArgb(209, 213, 219);
        Color bright = Color.FromArgb(255, 255, 255);
        Color muted = Color.FromArgb(143, 151, 163);
        if (theme == "light")
        {
            bg = Color.FromArgb(238, 241, 244);
            panel = Color.FromArgb(255, 255, 255);
            fg = Color.FromArgb(44, 52, 64);
            bright = Color.FromArgb(18, 22, 28);
            muted = Color.FromArgb(107, 118, 134);
        }
        else if (theme == "blue")
        {
            bg = Color.FromArgb(13, 20, 32);
            panel = Color.FromArgb(22, 36, 47);
            fg = Color.FromArgb(209, 213, 219);
            bright = Color.FromArgb(255, 255, 255);
            muted = Color.FromArgb(143, 163, 181);
        }

        string exeDir = Path.GetDirectoryName(Application.ExecutablePath) ?? ".";
        string dataFile = Path.Combine(exeDir, "total_played.json");

        long totalSeconds = LoadTotal(dataFile);
        long sessionSeconds = 0;

        Form form = new Form();
        form.Text = name;
        form.BackColor = bg;
        form.ClientSize = new Size(540, 300);
        form.StartPosition = FormStartPosition.CenterScreen;
        form.MinimumSize = new Size(500, 260);

        Panel accent = new Panel();
        accent.BackColor = Color.FromArgb(26, 159, 255);
        accent.Size = new Size(form.ClientSize.Width, 4);
        accent.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        accent.Location = new Point(0, 0);
        form.Controls.Add(accent);

        Panel content = new Panel();
        content.BackColor = panel;
        content.Bounds = new Rectangle(16, 20, form.ClientSize.Width - 32, form.ClientSize.Height - 36);
        content.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        form.Controls.Add(content);

        Label playing = new Label();
        playing.Text = "PLAYING";
        playing.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        playing.ForeColor = muted;
        playing.AutoSize = true;
        playing.Location = new Point(20, 22);
        content.Controls.Add(playing);

        Label title = new Label();
        title.Text = name;
        title.Font = new Font("Segoe UI", 24, FontStyle.Bold);
        title.ForeColor = bright;
        title.AutoSize = true;
        title.Location = new Point(20, 48);
        content.Controls.Add(title);

        Label timerLabel = new Label();
        timerLabel.Font = new Font("Segoe UI", 12);
        timerLabel.ForeColor = fg;
        timerLabel.AutoSize = true;
        timerLabel.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        timerLabel.Location = new Point(20, content.ClientSize.Height - 42);
        content.Controls.Add(timerLabel);

        Label totalLabel = new Label();
        totalLabel.Font = new Font("Segoe UI", 12);
        totalLabel.ForeColor = fg;
        totalLabel.AutoSize = true;
        totalLabel.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        content.Controls.Add(totalLabel);

        Action update = () =>
        {
            timerLabel.Text = "Timer: " + FormatTime(sessionSeconds);
            totalLabel.Text = "Total Played: " + FormatTime(totalSeconds + sessionSeconds);
            totalLabel.Location = new Point(content.ClientSize.Width - totalLabel.PreferredWidth - 20, content.ClientSize.Height - 42);
        };
        update();

        System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        timer.Interval = 1000;
        timer.Tick += (s, e) =>
        {
            sessionSeconds++;
            update();
        };
        timer.Start();

        form.FormClosing += (s, e) =>
        {
            timer.Stop();
            SaveTotal(dataFile, totalSeconds + sessionSeconds);
        };

        form.ShowInTaskbar = true;

        form.Load += (s, e) =>
        {
            ApplyTitleBar(form.Handle, theme);
        };

        Application.Run(form);
    }

    static string FormatTime(long totalSeconds)
    {
        TimeSpan ts = TimeSpan.FromSeconds(totalSeconds);
        return string.Format("{0:00}:{1:00}:{2:00}", (long)ts.TotalHours, ts.Minutes, ts.Seconds);
    }

    static long LoadTotal(string dataFile)
    {
        try
        {
            if (File.Exists(dataFile))
            {
                string raw = File.ReadAllText(dataFile).Trim();
                int i = raw.IndexOf("totalSeconds");
                if (i > 0)
                {
                    int c = raw.IndexOf(":", i);
                    string rest = raw.Substring(c + 1);
                    int start = 0;
                    while (start < rest.Length && !char.IsDigit(rest[start])) start++;
                    int end = start;
                    while (end < rest.Length && char.IsDigit(rest[end])) end++;
                    if (end > start) return long.Parse(rest.Substring(start, end - start));
                }
            }
        }
        catch { }
        return 0;
    }

    static void SaveTotal(string dataFile, long totalSeconds)
    {
        try
        {
            File.WriteAllText(dataFile, "{ \"totalSeconds\": " + totalSeconds + " }");
        }
        catch { }
    }
}
